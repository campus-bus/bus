/**
 * 天气信息（小程序版）
 *
 * 与 H5 版的区别：小程序不能直接 fetch 第三方域名（需配置 request 合法域名），
 * 因此改由云函数 weather 代理 Open-Meteo（云函数出网无白名单限制），
 * 云函数内部还有 30 分钟云数据库缓存。
 *
 * 降级策略：
 * 1. 优先读本地 storage 缓存（10 分钟内直接用，避免每次进首页都调云函数）
 * 2. 缓存过期则调云函数刷新
 * 3. 云函数未部署/网络失败时保留旧数据，无数据则不展示天气（不打扰用户）
 */
import { ref } from 'vue'

export interface WeatherInfo {
  icon: string
  desc: string
  tempNow: number
  tempMax: number
  tempMin: number
}

const CACHE_KEY = 'weather_cache_v1'
const CACHE_MS = 10 * 60 * 1000 // 本地缓存 10 分钟

/** WMO 天气代码 → emoji + 中文描述（与 H5 版保持一致） */
function weatherCodeToInfo(code: number): { icon: string; desc: string } {
  const map: Record<number, [string, string]> = {
    0: ['☀️', '晴'],
    1: ['🌤️', '大部晴'],
    2: ['⛅', '多云'],
    3: ['☁️', '阴'],
    45: ['🌫️', '雾'],
    48: ['🌫️', '雾凇'],
    51: ['🌦️', '小毛毛雨'],
    53: ['🌦️', '毛毛雨'],
    55: ['🌦️', '大毛毛雨'],
    56: ['🌧️', '冻毛毛雨'],
    57: ['🌧️', '大冻毛毛雨'],
    61: ['🌧️', '小雨'],
    63: ['🌧️', '中雨'],
    65: ['🌧️', '大雨'],
    66: ['🌨️', '冻雨'],
    67: ['🌨️', '大冻雨'],
    71: ['🌨️', '小雪'],
    73: ['🌨️', '中雪'],
    75: ['❄️', '大雪'],
    77: ['🌨️', '雪粒'],
    80: ['🌧️', '阵雨'],
    81: ['🌧️', '中阵雨'],
    82: ['⛈️', '大阵雨'],
    85: ['🌨️', '小阵雪'],
    86: ['🌨️', '大阵雪'],
    95: ['⛈️', '雷暴'],
    96: ['⛈️', '雷暴+小冰雹'],
    99: ['⛈️', '雷暴+大冰雹'],
  }
  const [icon, desc] = map[code] || ['🌤️', '未知']
  return { icon, desc }
}

const weather = ref<WeatherInfo | null>(null)
const loading = ref(false)
/** 上次尝试加载的时间戳（用于避免每次切 tab 都请求） */
let lastAttemptAt = 0
/** 同一进程内切 tab 的最小请求间隔 */
const RETRY_MS = 5 * 60 * 1000

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

/** 调云函数拉取天气 */
async function fetchFromCloud(): Promise<WeatherInfo | null> {
  try {
    const res = await wx.cloud.callFunction({ name: 'weather' })
    const r = res.result as { code: number; tempNow: number; tempMax: number; tempMin: number } | null
    if (!r || typeof r.code !== 'number') return null
    return {
      ...weatherCodeToInfo(r.code),
      tempNow: Math.round(r.tempNow),
      tempMax: Math.round(r.tempMax),
      tempMin: Math.round(r.tempMin),
    }
  } catch (e) {
    // 云函数未部署（右键上传并部署）或网络异常：静默降级
    console.warn('weather 云函数调用失败', e)
    return null
  }
}

export function useWeather() {
  async function refresh(force = false) {
    if (loading.value) return

    const cached = readCache()
    if (cached) {
      weather.value = cached.info
      // 缓存仍新鲜且非强制刷新，直接返回
      if (cached.fresh && !force) return
    }

    loading.value = true
    try {
      const info = await fetchFromCloud()
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
   * 用时间窗口而非布尔锁：切 tab 回来不重复请求，但超过 5 分钟后
   * （或页面被 reLaunch 重建时）会重新尝试，避免一次失败后永久不再加载。
   */
  function initWeather() {
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
