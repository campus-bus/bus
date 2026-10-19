import { onMounted, ref } from 'vue'
import { useLocationStore } from '@/stores/location'
import { gcj02ToWgs84 } from '@/utils/geo'

/**
 * 小程序定位（WGS-84）
 *
 * 隐私合规要点：
 * 1. 不在页面加载时自动调用 getLocation，必须由用户主动点击触发，
 *    便于在审核时说明"定位由用户主动发起"；
 * 2. 调用前先用 requirePrivacyAuthorize 同步《用户隐私保护指引》同意状态，
 *    未同意时由微信弹出官方隐私弹窗（未注册 onNeedPrivacyAuthorization 时官方自动兜底）；
 * 3. 此前已授权过的用户静默定位，不重复打扰；
 * 4. 精度 > 500m 的定位丢弃（与 H5 策略一致）。
 *
 * 坐标系约定（重要）：
 * 项目内部（站点数据、距离计算、store）**只存 WGS-84**；
 * 微信侧交出的一切位置都按 **GCJ-02** 解读，在 handleWechatLocation 里
 * 统一转成 WGS-84 后才入库；反过来给地图渲染时再用 wgs84ToGcj02。
 * 只在这两个边界转换，业务代码永远不需要关心坐标系。
 *
 * 单例说明：
 * 定位监听是全局资源（首页、地图页都要用），状态和监听器都放在模块级，
 * 避免每个页面各注册一份 onLocationChange 造成重复回调；
 * 因此这里刻意不在页面卸载时自动 stopWatch，防止一个页面把共享监听关掉。
 */

interface LocationResult {
  latitude: number
  longitude: number
  accuracy?: number
}

// ─── 模块级单例状态（跨页面共享） ───
const error = ref<string | null>(null)
const loading = ref(false)
/** 授权状态是否已检查完毕（避免已授权用户看到引导卡片闪现） */
const ready = ref(false)
/** 是否已成功开启持续监听 */
let watching = false
/** 是否正在启动（防止并发重复调用 getLocation） */
let starting = false

/**
 * 统一处理「微信交给我们的位置」→ 一律按 GCJ-02 解读，转成 WGS-84 后入库
 *
 * 为什么全部走 GCJ-02 入口：
 * 1. `wx.onLocationChange` 官方文档明确回调「使用 gcj02 国测局坐标系」，
 *    且不受 `startLocationUpdate` 的 type 参数影响，没有 WGS-84 可选；
 * 2. `wx.getLocation` 虽然支持 `type: 'wgs84'`，但实测开发者工具会忽略 type，
 *    把模拟定位点（GCJ-02）原样返回两种类型，开发者工具里就会偏 670m；
 * 3. 因此取「微信边界上一切位置都是 GCJ-02」这一条规则，只在这里转换一次，
 *    不再依赖某个 API 是否真的兑现 type 参数。
 *
 * 真机不会因此产生误差：请求 gcj02 时微信自己做了 WGS→GCJ，
 * 我们再逆解回 WGS，往返误差 < 1m，远小于 GPS 自身 20-50m 的精度。
 */
function handleWechatLocation(res: LocationResult) {
  // 过滤极低精度定位（Wi-Fi 定位精度通常 20-200m）
  if (res.accuracy && res.accuracy > 500) return
  const [lng, lat] = gcj02ToWgs84(res.longitude, res.latitude)
  useLocationStore().setUserLocation(lat, lng)
  error.value = null
}

/** 同步隐私协议同意状态；用户未同意时微信会弹出官方隐私弹窗 */
function ensurePrivacy(): Promise<boolean> {
  return new Promise((resolve) => {
    const api = wx.requirePrivacyAuthorize
    // 基础库低于 2.32.3 时没有隐私接口，直接放行
    if (typeof api !== 'function') {
      resolve(true)
      return
    }
    api({
      success: () => resolve(true),
      fail: () => resolve(false),
    })
  })
}

function startWatch() {
  if (watching || starting) return
  starting = true
  loading.value = true
  // 单次获取：显式要 gcj02，与 onLocationChange 保持同一条规则（见 handleWechatLocation）
  uni.getLocation({
    type: 'gcj02',
    success: (res) => {
      loading.value = false
      starting = false
      handleWechatLocation(res)
      if (watching) return
      // 开启前台持续监听
      // 注意：onLocationChange 回调固定是 gcj02，type 只写在这里表明预期，不要改成 wgs84
      wx.startLocationUpdate({
        type: 'gcj02',
        success: () => {
          if (watching) return
          watching = true
          wx.onLocationChange(handleWechatLocation)
        },
        fail: (err) => {
          // 常见原因：后台未开通「位置信息（持续监听）」接口权限（需类目审核）
          // 此时不影响单次定位，只是走动时位置不刷新
          console.warn('[location] startLocationUpdate 失败:', err?.errMsg || err)
        },
      })
    },
    fail: (err) => {
      loading.value = false
      starting = false
      const msg = err.errMsg || ''
      // 保留原始错误，便于定位"首次点击就失败"这类配置问题
      console.warn('[location] getLocation 失败:', msg)

      if (msg.includes('auth') || msg.includes('deny')) {
        useLocationStore().setPermissionDenied(true)
        error.value = '定位权限被拒绝'
      } else if (msg.includes('requiredPrivateInfos')) {
        // app.json 未声明定位接口（通常是构建产物缺字段或小程序未发布对应配置）
        error.value = '当前版本未获得定位接口权限，请稍后再试'
      } else if (msg.includes('system permission') || msg.includes('systemPermission')) {
        error.value = '请在手机系统设置中允许微信使用定位'
      } else {
        error.value = '定位不可用，请稍后重试'
      }
    },
  })
}

/** 用户主动点击「允许定位」时调用：先过隐私协议，再取位置 */
async function requestLocation() {
  if (loading.value || watching || starting) return
  error.value = null
  const agreed = await ensurePrivacy()
  if (!agreed) {
    error.value = '未同意《用户隐私保护指引》，无法获取位置'
    return
  }
  startWatch()
}

/** 页面进入时调用：已授权则静默定位，未授权时按 autoRequest 决定是否直接请求 */
function init(autoRequest = false) {
  wx.getSetting({
    success: (res) => {
      ready.value = true
      const auth = res.authSetting['scope.userLocation']
      if (auth === true) {
        startWatch()
        return
      }
      if (auth === false) {
        useLocationStore().setPermissionDenied(true)
        return
      }
      // undefined：从未询问过，首页等待用户点击引导卡片；地图页可直接请求
      if (autoRequest) requestLocation()
    },
    fail: () => {
      // 读取授权状态失败时按"未授权"处理，用户仍可手动点击
      ready.value = true
    },
  })
}

function stopWatch() {
  if (watching) {
    wx.offLocationChange(handleWechatLocation)
    wx.stopLocationUpdate({})
    watching = false
  }
}

/** 引导用户去设置页开启定位 */
function openSetting() {
  uni.openSetting({
    success: (res) => {
      if (res.authSetting['scope.userLocation']) {
        useLocationStore().setPermissionDenied(false)
        startWatch()
      }
    },
  })
}

/** 打开微信官方的《用户隐私保护指引》页面 */
function openPrivacyContract() {
  const api = wx.openPrivacyContract
  if (typeof api !== 'function') {
    uni.showToast({ title: '请升级微信后查看隐私指引', icon: 'none' })
    return
  }
  api({
    fail: () => uni.showToast({ title: '隐私指引暂时无法打开', icon: 'none' }),
  })
}

export function useGeolocation(options: { autoStart?: boolean } = {}) {
  if (options.autoStart) {
    // 地图页本身就是位置功能页，进入时直接请求（含隐私授权前置）
    onMounted(() => init(true))
  }

  return { ready, error, loading, init, requestLocation, startWatch, stopWatch, openSetting, openPrivacyContract }
}
