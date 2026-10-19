/**
 * 天气信息（小程序版）
 *
 * 数据源：腾讯位置服务 WebService API
 *   个人开发者免费额度 1 万次/天，超出后直接拒绝（不会自动扣费），
 *   域名 apis.map.qq.com 已在腾讯云备案，可加入小程序 request 合法域名。
 *
 * 与 H5 版的区别：H5 直接请求 Open-Meteo，但该域名无 ICP 备案，
 * 小程序正式版无法访问，因此换成国内已备案接口，不再依赖云开发。
 *
 * 降级策略：
 * 1. 未配置 Key → 不发任何请求，首页不显示天气
 * 2. 本地缓存 60 分钟，避免每次进首页都调接口
 * 3. 请求失败时保留旧数据；完全无数据则不展示（不打扰用户）
 */
import { ref } from 'vue'
import { TENCENT_LBS_KEY } from '@/config'
import { useLocationStore } from '@/stores/location'

export interface WeatherInfo {
  icon: string
  desc: string
  tempNow: number
}

const CACHE_KEY = 'weather_cache_v2'
const CACHE_MS = 60 * 60 * 1000 // 本地缓存 60 分钟
/** 未定位时按研究生宿舍楼取天气（GCJ-02，与腾讯接口一致） */
const DEFAULT_LNG = 113.051463
const DEFAULT_LAT = 28.254769

/** 腾讯天气返回中文描述，映射成 emoji 图标 */
function descToIcon(desc: string): string {
  if (desc.includes('雷')) return '⛈️'
  if (desc.includes('雪')) return '🌨️'
  if (desc.includes('雨')) return desc.includes('小') ? '🌦️' : '🌧️'
  if (desc.includes('雾') || desc.includes('霾')) return '🌫️'
  if (desc.includes('阴')) return '☁️'
  if (desc.includes('多云')) return '⛅'
  if (desc.includes('晴')) return '☀️'
  return '🌤️'
}

const weather = ref<WeatherInfo | null>(null)
const loading = ref(false)
/** 上次尝试加载的时间戳（用于避免每次切 tab 都请求） */
let lastAttemptAt = 0
/** 同一进程内切 tab 的最小请求间隔 */
const RETRY_MS = 10 * 60 * 1000

/** 读本地缓存（过期数据也先拿来垫上，避免首屏空着） */
function readCache(): { info: WeatherInfo; fresh: boolean } | null {
  try {
    const raw = uni.getStorageSync(CACHE_KEY)
    if (!raw) return null
    const cache = JSON.parse(raw as string)
    if (!cache || !cache.info) return null
    return { info: cache.info as WeatherInfo, fresh: Date.now() - cache.updatedAt < CACHE_MS }
  } catch {
    return null
  }
}

/** 调腾讯位置服务拉取实时天气 */
function fetchWeather(): Promise<WeatherInfo | null> {
  return new Promise((resolve) => {
    if (!TENCENT_LBS_KEY) {
      resolve(null)
      return
    }
    const store = useLocationStore()
    const lng = store.userLng ?? DEFAULT_LNG
    const lat = store.userLat ?? DEFAULT_LAT
    // 小程序侧坐标统一为 GCJ-02（微信定位、腾讯地图同源），无需转换
    uni.request({
      url: 'https://apis.map.qq.com/ws/weather/v1/',
      data: {
        key: TENCENT_LBS_KEY,
        location: `${lat},${lng}`,
        type: 'now',
      },
      timeout: 8000,
      success: (res) => {
        const body = res.data as {
          status?: number
          result?: { realtime?: Array<{ infos?: { weather?: string; temperature?: number } }> }
        }
        const info = body?.result?.realtime?.[0]?.infos
        if (body?.status !== 0 || !info || typeof info.temperature !== 'number') {
          resolve(null)
          return
        }
        const desc = info.weather || '未知'
        resolve({ icon: descToIcon(desc), desc, tempNow: Math.round(info.temperature) })
      },
      fail: (err) => {
        console.warn('[weather] 请求失败', err)
        resolve(null)
      },
    })
  })
}

export function useWeather() {
  async function refresh(force = false) {
    if (loading.value) return
    if (!TENCENT_LBS_KEY) return

    const cached = readCache()
    if (cached) {
      weather.value = cached.info
      // 缓存仍新鲜且非强制刷新，直接返回
      if (cached.fresh && !force) return
    }

    loading.value = true
    try {
      const info = await fetchWeather()
      if (info) {
        weather.value = info
        uni.setStorageSync(CACHE_KEY, JSON.stringify({ info, updatedAt: Date.now() }))
      }
    } finally {
      loading.value = false
    }
  }

  /**
   * 页面 onShow 时调用。
   * 用时间窗口而非布尔锁：切 tab 回来不重复请求，但超过 10 分钟后
   * （或页面被重建时）会重新尝试，避免一次失败后永久不再加载。
   */
  function initWeather() {
    if (!TENCENT_LBS_KEY) return
    // 先用本地缓存垫上（同步、零成本），保证首屏或二次进入能立刻显示
    const cached = readCache()
    if (cached) weather.value = cached.info

    // 网络部分按时间窗口节流，避免切 tab 反复请求
    if (Date.now() - lastAttemptAt < RETRY_MS) return
    lastAttemptAt = Date.now()
    refresh()
  }

  return { weather, loading, refresh, initWeather }
}
