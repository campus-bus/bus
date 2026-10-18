// 天气云函数：拉取 Open-Meteo 天气（云函数出网无白名单限制），云数据库缓存 30 分钟
// 前端调用：wx.cloud.callFunction({ name: 'weather' })
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const CACHE_MS = 30 * 60 * 1000 // 30 分钟

exports.main = async () => {
  const cacheCol = db.collection('weather_cache')

  // 读缓存
  try {
    const cached = await cacheCol.doc('current').get()
    if (cached.data && Date.now() - cached.data.updatedAt < CACHE_MS) {
      return { ...cached.data.payload, cached: true }
    }
  } catch (e) { /* 缓存不存在，继续拉取 */ }

  // 拉取 Open-Meteo（研究生宿舍楼坐标）
  const url = 'https://api.open-meteo.com/v1/forecast?latitude=28.258&longitude=113.046&current_weather=true&daily=temperature_2m_max,temperature_2m_min&timezone=Asia%2FShanghai&forecast_days=1'
  const res = await fetch(url)
  const data = await res.json()
  const cur = data.current_weather
  const payload = {
    code: cur.weathercode,
    tempNow: Math.round(cur.temperature),
    tempMax: Math.round(data.daily.temperature_2m_max[0]),
    tempMin: Math.round(data.daily.temperature_2m_min[0]),
  }

  // 写缓存（存在则更新，不存在则插入）
  try {
    await cacheCol.doc('current').update({ data: { payload, updatedAt: Date.now() } })
  } catch (e) {
    await cacheCol.add({ data: { _id: 'current', payload, updatedAt: Date.now() } })
  }

  return { ...payload, cached: false }
}
