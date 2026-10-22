import { onMounted, ref } from 'vue'
import { useLocationStore } from '@/stores/location'

/**
 * 小程序定位（GCJ-02）
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
 * 小程序侧全部是 **GCJ-02**——微信定位、腾讯 `<map>`、腾讯 LBS 同源；
 * 站点/路线数据在 `scripts/sync_miniprogram_data.js` 同步时已从 WGS-84 转成 GCJ-02。
 * 因此这里不做任何坐标转换，运行期零转换。
 * H5 侧（另一套代码，共用同一份 public/data）仍全程 WGS-84，两边互不影响。
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
/**
 * 授权状态是否已检查完毕。
 *
 * 首页据此决定「显示定位门禁页」还是「显示功能页」：
 * 未检查完时两者都不渲染（白底占位），避免先闪一帧功能页。
 */
const ready = ref(false)
/** 用户是否已经授权过位置（scope.userLocation === true），用于按钮文案 */
const authorized = ref(false)
/** 是否已成功开启持续监听 */
let watching = false
/** 是否正在启动（防止并发重复调用 getLocation） */
let starting = false
/** 是否正在启动持续监听（与 starting 区分：后者指单次 getLocation） */
let startingWatch = false
/**
 * 小程序当前是否在前台
 *
 * 位置接口只在用户盯着页面时才该跑。切后台时 onAppHide 会停监听，
 * 但「停」这件事必须和 shouldWatch() 一起判断，否则回前台时
 * 若页面已经离开，onAppShow 的恢复逻辑会把它错误地重新打开。
 */
let foreground = true
/**
 * 监听状态版本号
 *
 * `wx.startLocationUpdate` 是异步的，它的 success 可能在**页面已经离开**
 * 或**已经切到后台**之后才回来。每次状态变化都自增版本号，回调里比对：
 * 过期就说明这次启动已经没人要了，不能再挂 onLocationChange。
 * 没有这个序号时，离开页面后监听会在稍后悄悄开始，与
 * 「离开位置页立即停止」的说明不符。
 */
let watchEpoch = 0
/** 用户已明确拒绝授权：不再自动重试，避免回前台就反复失败 */
let denied = false
/**
 * 用户是否「希望」持续定位
 *
 * 与 watching 的区别：切到后台时我们主动停止监听（watching=false），
 * 但用户意愿仍在（wantWatch=true），回前台时据此自动恢复。
 */
let wantWatch = false
/** 前后台钩子只装一次（模块级单例） */
let appHooksInstalled = false

/**
 * 处理「微信交给我们的位置」→ 直接入库
 *
 * 小程序侧坐标系统一为 GCJ-02：
 * 1. `wx.onLocationChange` 回调固定是 GCJ-02（官方文档写死，无 WGS-84 可选）；
 * 2. 站点/路线数据在 `scripts/sync_miniprogram_data.js` 里已从 WGS-84 转成 GCJ-02；
 * 3. 腾讯 `<map>` 与腾讯 LBS 也只认 GCJ-02。
 * 三者同源，所以这里不做任何转换，运行期零坐标转换。
 */
function handleWechatLocation(res: LocationResult) {
  // 过滤极低精度定位（Wi-Fi 定位精度通常 20-200m）
  if (res.accuracy && res.accuracy > 500) return
  useLocationStore().setUserLocation(res.latitude, res.longitude)
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

function startWatch(): Promise<void> {
  // 已经开了持续监听时也允许再取一次单点（例如用户点「回到我的位置」补一次坐标），
  // 下面的 success 分支里有 watching 判断，不会重复注册 onLocationChange。
  if (starting) return Promise.resolve()
  // 已明确拒绝的不再重试（否则每次回前台都调用一次失败接口）
  if (denied) return Promise.resolve()
  wantWatch = true
  starting = true
  loading.value = true
  return new Promise<void>((resolve) => {
    // 单次获取：显式要 gcj02，与 onLocationChange 保持同一条规则（见 handleWechatLocation）
    uni.getLocation({
      type: 'gcj02',
      success: (res) => {
        loading.value = false
        starting = false
        authorized.value = true
        handleWechatLocation(res)
        resolve()
        // 不直接开监听：交给 syncWatch 统一判断（期间可能已离开页面 / 切后台）
        syncWatch()
      },
      fail: (err) => {
        loading.value = false
        starting = false
        const msg = err.errMsg || ''
        // 保留原始错误，便于定位"首次点击就失败"这类配置问题
        console.warn('[location] getLocation 失败:', msg)

        if (msg.includes('auth') || msg.includes('deny')) {
          denied = true
          wantWatch = false
          authorized.value = false
          useLocationStore().setPermissionDenied(true)
          error.value = '定位权限被拒绝'
        } else if (msg.includes('requiredPrivateInfos')) {
          // app.json 未声明定位接口（通常是构建产物缺字段或小程序未发布对应配置）
          error.value = '当前版本未获得定位接口权限，请稍后再试'
        } else if (msg.includes('system permission') || msg.includes('systemPermission')) {
          error.value = '请在手机系统设置中允许微信使用定位'
        } else {
          // 非权限类失败（如长时间拿不到卫星信号）：用户其实已经同意过授权，
          // 这里放行页面，避免门禁页把用户卡死；首页会显示"重新定位"入口
          authorized.value = true
          error.value = '定位不可用，请稍后重试'
        }
        resolve()
      },
    })
  })
}

/** 已授权时确保监听已启动：已在监听就跳过，避免每次 onShow 都调一次 getLocation */
function ensureStarted(): Promise<void> {
  if (watching || starting) return Promise.resolve()
  return startWatch()
}

/**
 * 此刻是否「应该」在持续监听
 *
 * 四个条件缺一不可：在前台、有页面正在用、用户愿意、没被明确拒绝。
 * 所有开关决策都收敛到这一个判断，避免某条路径漏掉某个条件。
 */
function shouldWatch(): boolean {
  return foreground && watchOwner !== null && wantWatch && !denied
}

/**
 * 真正关掉监听
 *
 * 只做「关」这一件事；要不要关由调用方通过 syncWatch 决定。
 * startingWatch 一并清掉：在途的启动回调靠 watchEpoch 识别并自我作废。
 */
function teardownWatch() {
  startingWatch = false
  if (!watching) return
  wx.offLocationChange(handleWechatLocation)
  wx.stopLocationUpdate({})
  watching = false
}

/**
 * 让实际监听状态向 shouldWatch() 收敛
 *
 * 页面进出、前后台切换、授权结果返回，全部只调这一个函数，
 * 不在各处零散地写 startLocationUpdate / stopLocationUpdate ——
 * 否则「A 路径开了、B 路径忘了关」这类竞态迟早出现。
 */
function syncWatch() {
  const epoch = ++watchEpoch
  if (!shouldWatch()) {
    teardownWatch()
    return
  }
  if (watching || startingWatch) return
  startingWatch = true
  // 注意：onLocationChange 回调固定是 gcj02，type 只写在这里表明预期，不要改成 wgs84
  wx.startLocationUpdate({
    type: 'gcj02',
    success: () => {
      // 等回调期间状态可能已经变了（页面切走 / 切后台），见 watchEpoch 注释
      if (epoch !== watchEpoch) {
        // 过期回调不动全局状态（可能已有更新的一次启动在途），
        // 但如果此刻明确「不该监听」，就把这次多开的监听收掉
        if (!shouldWatch()) {
          startingWatch = false
          watching = false
          wx.stopLocationUpdate({})
        }
        return
      }
      startingWatch = false
      if (watching) return
      watching = true
      wx.onLocationChange(handleWechatLocation)
    },
    fail: (err) => {
      if (epoch === watchEpoch) startingWatch = false
      // 常见原因：后台未开通「位置信息（持续监听）」接口权限（需类目审核）
      // 此时不影响单次定位，只是走动时位置不刷新
      console.warn('[location] startLocationUpdate 失败:', err?.errMsg || err)
    },
  })
}

/**
 * 持续定位「所有权」：谁在用，就由谁负责开关
 *
 * 目的：离开用到位置的页面就停止监听（申请材料与合规声明都这么写）。
 * 直接用各页面自己的 onHide 去 stop 不可行——tabBar 切换时新页 onShow 与旧页 onHide
 * 的先后顺序并不保证，旧页后到就会把新页刚开的监听关掉。
 * 所以记一个当前持有者：新页 onShow 抢走所有权，旧页 onHide 发现所有权已不是自己
 * 就什么都不做。这样两种顺序都正确。
 */
let watchOwner: string | null = null

/** 页面开始使用位置（onShow）。owner 用页面名，便于排查 */
function acquireWatch(owner: string) {
  watchOwner = owner
  syncWatch()
}

/** 页面离开（onHide）：只有所有权还在自己手上时才停 */
function releaseWatch(owner: string) {
  if (watchOwner !== owner) return
  watchOwner = null
  syncWatch()
}

/** 用户主动点击定位入口时调用：先过隐私协议，再取位置。返回是否成功拿到坐标 */
async function requestLocation(): Promise<boolean> {
  if (loading.value || starting) return false
  error.value = null
  const agreed = await ensurePrivacy()
  if (!agreed) {
    error.value = '未同意《用户隐私保护指引》，无法获取位置'
    return false
  }
  denied = false
  await startWatch()
  const store = useLocationStore()
  return store.userLat !== null && store.userLng !== null
}

/**
 * 页面进入时调用。
 * @param autoRequest 仅在「用户刚点了明确的位置功能入口」时才传 true；
 *   页面加载（onShow/onMounted）一律传 false —— 平台规范禁止进入页面就申请授权。
 */
function init(autoRequest = false) {
  wx.getSetting({
    success: (res) => {
      const auth = res.authSetting['scope.userLocation']
      ready.value = true
      if (auth === true) {
        authorized.value = true
        denied = false
        wantWatch = true
        // getSetting 是异步的：这个回调可能在页面已经切走之后才回来。
        // 没有页面持有（watchOwner 为空）时就不要再启动任何定位，
        // 否则会出现「人已离开、定位才刚开始」。
        if (watchOwner === null) return
        // 已有坐标时只恢复监听，不再重复取单点：切 tab 回来每次都 getLocation
        // 既没必要，也容易撞上调用频率限制
        const store = useLocationStore()
        if (store.userLat !== null && store.userLng !== null) syncWatch()
        else ensureStarted()
        return
      }
      authorized.value = false
      if (auth === false) {
        denied = true
        useLocationStore().setPermissionDenied(true)
        return
      }
      // undefined：从未询问过，首页显示定位门禁页；地图页可直接请求
      if (autoRequest) requestLocation()
    },
    fail: () => {
      // 读取授权状态失败时按"未授权"处理，用户仍可手动点击
      ready.value = true
    },
  })
}

function stopWatch() {
  wantWatch = false
  watchOwner = null
  syncWatch()
}

/**
 * 注册前后台钩子：切后台立即停止持续定位，回前台自动恢复
 *
 * 合规要点：位置接口仅在前台使用（未申请后台定位能力），
 * 配合 acquireWatch/releaseWatch（离开页面即停），
 * 代码层面真正做到了「只在停留于用到位置的页面、且小程序在前台时定位」。
 */
function installAppHooks() {
  if (appHooksInstalled) return
  appHooksInstalled = true
  wx.onAppHide?.(() => {
    foreground = false
    syncWatch()
  })
  wx.onAppShow?.(() => {
    foreground = true
    // 只恢复监听，不重新取单点（避免频繁 getLocation）；
    // 若期间页面已经离开，shouldWatch() 为 false，这里不会开
    syncWatch()
  })
}

/** 引导用户去设置页开启定位 */
function openSetting() {
  uni.openSetting({
    success: (res) => {
      if (res.authSetting['scope.userLocation']) {
        denied = false
        authorized.value = true
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
  installAppHooks()
  if (options.autoStart) {
    // 地图页本身就是位置功能页，进入时直接请求（含隐私授权前置）
    onMounted(() => init(true))
  }

  return {
    ready, error, loading, authorized,
    init, requestLocation, startWatch, stopWatch, openSetting, openPrivacyContract,
    acquireWatch, releaseWatch,
  }
}
