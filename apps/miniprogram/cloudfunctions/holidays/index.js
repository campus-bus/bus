// 节假日云函数：拉取 holiday-cn 当年+明年数据，云数据库按年缓存
// 前端调用：wx.cloud.callFunction({ name: 'holidays' })
// 返回：{ holidays: { '2026-01-01': '元旦', ... }, workdays: ['2026-02-14', ...] }
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 兜底数据（拉取失败时使用，与 H5 端一致）
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

async function fetchYear(year) {
  const holidays = {}
  const workdays = []
  try {
    const res = await fetch(`https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/${year}.json`)
    const data = await res.json()
    if (!data.days) return null
    for (const day of data.days) {
      if (day.isOffDay && day.name) holidays[day.date] = day.name
      else if (!day.isOffDay) {
        const d = new Date(day.date + 'T00:00:00+08:00')
        if (d.getDay() === 0 || d.getDay() === 6) workdays.push(day.date)
      }
    }
    return { holidays, workdays }
  } catch (e) {
    return null
  }
}

exports.main = async () => {
  const col = db.collection('holiday_cache')
  const year = new Date().getFullYear()
  const years = [year, year + 1]

  let holidays = {}
  let workdays = []
  const missingYears = []

  // 读缓存
  for (const y of years) {
    try {
      const doc = await col.doc(String(y)).get()
      Object.assign(holidays, doc.data.holidays)
      workdays.push(...doc.data.workdays)
    } catch (e) {
      missingYears.push(y)
    }
  }

  // 缺的年份重新拉取并缓存
  for (const y of missingYears) {
    const result = await fetchYear(y)
    const h = result ? result.holidays : (y === 2026 ? FALLBACK_HOLIDAYS : {})
    const w = result ? result.workdays : (y === 2026 ? FALLBACK_WORKDAYS : [])
    Object.assign(holidays, h)
    workdays.push(...w)
    try {
      await col.doc(String(y)).update({ data: { holidays: h, workdays: w, updatedAt: Date.now() } })
    } catch (e) {
      await col.add({ data: { _id: String(y), holidays: h, workdays: w, updatedAt: Date.now() } })
    }
  }

  return { holidays, workdays }
}
