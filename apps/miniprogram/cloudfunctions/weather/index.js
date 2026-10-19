// 天气云函数：拉取 Open-Meteo 天气（云函数出网无白名单限制），云数据库缓存 30 分钟
// 前端调用：wx.cloud.callFunction({ name: 'weather' })
//
// 注意 1：微信云函数默认运行时是 Node 16，没有全局 fetch，
//         因此这里用 https 模块自行请求，避免依赖 node-fetch 或更高版本运行时。
// 注意 2：云数据库集合不会随写入自动创建，weather_cache 不存在时读写都会抛错。
//         本函数把缓存视为"可选加速"，任何缓存异常都不影响正常返回天气。
// 注意 3：云函数默认超时 3 秒，冷启动 + 外部请求容易超时；
//         建议在云开发控制台把本函数超时时间调到 20 秒。
const cloud = require('wx-server-sdk')
const https = require('https')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 缓存有效期：30 分钟
const CACHE_MS = 30 * 60 * 1000

// 容器内存缓存：同一容器内热调用直接返回，避免重复出网
let memoryCache = null // { payload, updatedAt }

// 研究生宿舍楼坐标
const URL =
  'https://api.open-meteo.com/v1/forecast' +
  '?latitude=28.258&longitude=113.046' +
  '&current_weather=true' +
  '&daily=temperature_2m_max,temperature_2m_min' +
  '&timezone=Asia%2FShanghai&forecast_days=1'

/** 请求 JSON（带 8 秒超时，避免云函数被拖死） */
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

/** 读缓存；集合不存在或无文档时返回 null（不抛错） */
async function readCache() {
  try {
    const res = await db.collection('weather_cache').doc('current').get()
    return res.data || null
  } catch (e) {
    return null
  }
}

/** 写缓存；集合不存在时静默忽略（用户需在控制台创建 weather_cache 才有缓存效果） */
async function writeCache(payload) {
  const data = { payload, updatedAt: Date.now() }
  try {
    // doc().set() 是 upsert：文档不存在时直接创建，无需先 update 再兜底 add
    await db.collection('weather_cache').doc('current').set({ data })
  } catch (e) {
    // 集合不存在等异常：忽略，缓存不是必需项
  }
}

/** 命中缓存则直接返回 */
function hitCache() {
  if (memoryCache && Date.now() - memoryCache.updatedAt < CACHE_MS) return { ...memoryCache.payload, cached: true }
  return null
}

exports.main = async () => {
  // 0. 容器内存缓存（热调用，最快）
  const mem = hitCache()
  if (mem) return mem

  // 1. 命中数据库缓存直接返回
  const cached = await readCache()
  if (cached && cached.payload && Date.now() - cached.updatedAt < CACHE_MS) {
    memoryCache = { payload: cached.payload, updatedAt: cached.updatedAt }
    return { ...cached.payload, cached: true }
  }

  // 2. 拉取 Open-Meteo
  let data
  try {
    data = await getJson(URL)
  } catch (e) {
    // 拉取失败：有过期缓存也比没有强
    if (cached && cached.payload) return { ...cached.payload, cached: true, stale: true }
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

  // 3. 写缓存（失败不影响返回）
  await writeCache(payload)
  memoryCache = { payload, updatedAt: Date.now() }

  return { ...payload, cached: false }
}
