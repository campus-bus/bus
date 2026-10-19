// 节假日云函数：拉取 holiday-cn 数据（GitHub raw）
//
// 前端调用：wx.cloud.callFunction({ name: 'holidays' })
// 返回：{ holidays: { '2026-01-01': '元旦', ... }, workdays: ['2026-02-14', ...] }
//
// 设计约束（很关键）：
// 1. 微信云函数默认运行时 Nodejs16.13，**没有全局 fetch**，必须用 https 模块。
// 2. 云函数默认超时时间只有 **3 秒**，且无法用 config.json 修改（只能去控制台改）。
//    因此这里给远程请求设总预算 2 秒，超时就退回内置兜底数据，保证函数必定及时返回。
// 3. 云数据库集合不会自动创建，holiday_cache 不存在时读写会抛错，
//    缓存只当可选加速，任何异常都静默忽略。
// 4. 容器内存缓存：同一容器内热调用直接命中，避免重复出网。
const cloud = require('wx-server-sdk')
const https = require('https')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 远程请求总预算（毫秒）：给冷启动和数据库操作留出余量，确保 < 3 秒
const NETWORK_BUDGET_MS = 2000

// 兜底数据（与 H5 端一致）
const FALLBACK_HOLIDAYS = {
  '2026-01-01': '元旦', '2026-01-02': '元旦', '2026-01-03': '元旦',
  '2026-02-17': '春节', '2026-02-18': '春节', '2026-02-19': '春节',
  '2026-02-20': '春节', '2026-02-21': '春节', '2026-02-22': '春节', '2026-02-23': '春节',
  '2026-04-05': '清明', '2026-04-06': '清明', '2026-04-07': '清明',
  '2026-05-01': '劳动节', '2026-05-02': '劳动节', '2026-05-03': '劳动节',
  '2026-05-04': '劳动节', '2026-05-05': '劳动节',
  '2026-06-19': '端午', '2026-06-20': '端午', '2026-06-21': '端午',
  '2026-09-25': '中秋', '2026-09-26': '中秋', '2026-09-27': '中秋',
  '2026-10-01': '国庆', '2026-10-02': '国庆', '2026-10-03': '国庆',
  '2026-10-04': '国庆', '2026-10-05': '国庆', '2026-10-06': '国庆', '2026-10-07': '国庆',
}
const FALLBACK_WORKDAYS = ['2026-02-14', '2026-02-15', '2026-02-28', '2026-04-04', '2026-04-26', '2026-09-20', '2026-10-10']

// 容器内存缓存：{ [year]: { holidays, workdays } }
const memoryCache = {}

/** 请求 JSON（带超时，自动跟随一次重定向） */
function getJson(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: timeoutMs, headers: { 'User-Agent': 'campus-bus-mini' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        getJson(res.headers.location, timeoutMs).then(resolve, reject)
        return
      }
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

/** 给 Promise 加时间预算，超时返回 null */
function withBudget(promise, ms) {
  return Promise.race([
    promise.catch(() => null),
    new Promise((resolve) => setTimeout(() => resolve(null), ms)),
  ])
}

function parseYear(data) {
  if (!data || !data.days) return null
  const holidays = {}
  const workdays = []
  for (const day of data.days) {
    if (day.isOffDay && day.name) {
      holidays[day.date] = day.name
    } else if (!day.isOffDay) {
      const d = new Date(day.date + 'T00:00:00+08:00')
      if (d.getDay() === 0 || d.getDay() === 6) workdays.push(day.date)
    }
  }
  return { holidays, workdays }
}

/** 读某年数据库缓存；集合/文档不存在时返回 null */
async function readDbCache(year) {
  try {
    const doc = await db.collection('holiday_cache').doc(String(year)).get()
    return doc.data || null
  } catch (e) {
    return null
  }
}

/** 写某年数据库缓存；集合不存在等异常静默忽略 */
async function writeDbCache(year, holidays, workdays) {
  const data = { holidays, workdays, updatedAt: Date.now() }
  try {
    // doc().set() 是 upsert：文档不存在时直接创建，无需先 update 再兜底 add
    await db.collection('holiday_cache').doc(String(year)).set({ data })
  } catch (e) {
    // 集合不存在：忽略，缓存不是必需项
  }
}

exports.main = async () => {
  const startAt = Date.now()
  const year = new Date().getFullYear()
  const years = [year, year + 1]

  const holidays = {}
  const workdays = []

  await Promise.all(years.map(async (y) => {
    // 1. 容器内存缓存（最快）
    if (memoryCache[y]) {
      Object.assign(holidays, memoryCache[y].holidays)
      workdays.push(...memoryCache[y].workdays)
      return
    }

    // 2. 数据库缓存
    const dbCached = await readDbCache(y)
    if (dbCached && dbCached.holidays) {
      const entry = { holidays: dbCached.holidays, workdays: dbCached.workdays || [] }
      memoryCache[y] = entry
      Object.assign(holidays, entry.holidays)
      workdays.push(...entry.workdays)
      return
    }

    // 3. 远程拉取（受总预算约束）
    const remain = Math.max(600, NETWORK_BUDGET_MS - (Date.now() - startAt))
    const raw = await withBudget(
      getJson(`https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/${y}.json`, remain),
      remain
    )
    const parsed = parseYear(raw)

    if (parsed) {
      memoryCache[y] = parsed
      Object.assign(holidays, parsed.holidays)
      workdays.push(...parsed.workdays)
      await writeDbCache(y, parsed.holidays, parsed.workdays)
    } else if (y === 2026) {
      // 4. 兜底
      Object.assign(holidays, FALLBACK_HOLIDAYS)
      workdays.push(...FALLBACK_WORKDAYS)
    }
  }))

  return { holidays, workdays }
}
