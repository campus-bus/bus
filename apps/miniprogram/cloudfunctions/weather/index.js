// 天气云函数：拉取 Open-Meteo 天气（云函数出网无白名单限制），云数据库缓存 30 分钟
// 前端调用：wx.cloud.callFunction({ name: 'weather' })
//
// 注意：微信云函数默认运行时是 Node 16，没有全局 fetch，
// 因此这里用 https 模块自行请求，避免依赖 node-fetch 或更高版本运行时。
const cloud = require('wx-server-sdk')
const https = require('https')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const CACHE_MS = 30 * 60 * 1000 // 30 分钟

// 研究生宿舍楼坐标
const URL =
  'https://api.open-meteo.com/v1/forecast' +
  '?latitude=28.258&longitude=113.046' +
  '&current_weather=true' +
  '&daily=temperature_2m_max,temperature_2m_min' +
  '&timezone=Asia%2FShanghai&forecast_days=1'

/** 请求 JSON（带 8 秒超时，避免云函数被拖到超时） */
function getJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 8000 }, (res) => {
      if (res.statusCode !== 200) {
        res.resume()
        reject(new Error(`HTTP ${res.statusCode}`))
        return
      }
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => { body += chunk })
      res.on('end', () => {
        try {
          resolve(JSON.parse(body))
        } catch (e) {
          reject(e)
        }
      })
    })
    req.on('timeout', () => { req.destroy(new Error('timeout')) })
    req.on('error', reject)
  })
}

exports.main = async () => {
  const cacheCol = db.collection('weather_cache')

  // 1. 读缓存
  try {
    const cached = await cacheCol.doc('current').get()
    if (cached.data && Date.now() - cached.data.updatedAt < CACHE_MS) {
      return { ...cached.data.payload, cached: true }
    }
  } catch (e) {
    // 缓存不存在或集合未创建，继续拉取
  }

  // 2. 拉取 Open-Meteo
  let data
  try {
    data = await getJson(URL)
  } catch (e) {
    // 拉取失败时把过期缓存兜底返回，避免前端完全无数据
    try {
      const cached = await cacheCol.doc('current').get()
      if (cached.data && cached.data.payload) {
        return { ...cached.data.payload, cached: true, stale: true }
      }
    } catch (_) { /* 无缓存 */ }
    throw e
  }

  const cur = data.current_weather
  const daily = data.daily || {}
  if (!cur || typeof cur.temperature !== 'number') {
    throw new Error('天气数据格式异常')
  }

  const payload = {
    code: cur.weathercode,
    tempNow: Math.round(cur.temperature),
    tempMax: Math.round((daily.temperature_2m_max || [cur.temperature])[0]),
    tempMin: Math.round((daily.temperature_2m_min || [cur.temperature])[0]),
  }

  // 3. 写缓存（存在则更新，不存在则插入）
  try {
    await cacheCol.doc('current').update({ data: { payload, updatedAt: Date.now() } })
  } catch (e) {
    try {
      await cacheCol.add({ data: { _id: 'current', payload, updatedAt: Date.now() } })
    } catch (_) {
      // 写缓存失败不影响本次返回
    }
  }

  return { ...payload, cached: false }
}
