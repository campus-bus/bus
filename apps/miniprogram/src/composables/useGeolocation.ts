import { onMounted, onUnmounted, ref } from 'vue'
import { useLocationStore } from '@/stores/location'

/**
 * 小程序定位（WGS-84）
 * - 启动时单次获取 + 前台持续监听
 * - 用户拒绝授权后引导打开设置页
 * - 精度 >500m 的定位丢弃（与 H5 策略一致）
 */
export function useGeolocation() {
  const store = useLocationStore()
  const error = ref<string | null>(null)
  let watching = false

  function handleLocation(res: { latitude: number; longitude: number; accuracy?: number }) {
    if (res.accuracy && res.accuracy > 500) return
    store.setUserLocation(res.latitude, res.longitude)
    error.value = null
  }

  function startWatch() {
    if (watching) return
    // 先单次获取（type: wgs84 与我们数据同坐标系）
    uni.getLocation({
      type: 'wgs84',
      success: (res) => {
        handleLocation(res)
        // 开启持续监听（前台）
        wx.startLocationUpdate({
          success: () => {
            watching = true
            wx.onLocationChange(handleLocation)
          },
        })
      },
      fail: (err) => {
        if (err.errMsg?.includes('auth') || err.errMsg?.includes('deny')) {
          store.setPermissionDenied(true)
          error.value = '定位权限被拒绝'
        } else {
          error.value = '定位不可用'
        }
      },
    })
  }

  function stopWatch() {
    if (watching) {
      wx.offLocationChange(handleLocation)
      wx.stopLocationUpdate({})
      watching = false
    }
  }

  /** 引导用户去设置页开启定位 */
  function openSetting() {
    uni.openSetting({
      success: (res) => {
        if (res.authSetting['scope.userLocation']) {
          store.setPermissionDenied(false)
          startWatch()
        }
      },
    })
  }

  onMounted(startWatch)
  onUnmounted(stopWatch)

  return { error, startWatch, stopWatch, openSetting }
}
