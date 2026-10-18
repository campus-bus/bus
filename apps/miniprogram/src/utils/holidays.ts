/**
 * 中国法定节假日数据（小程序版）
 *
 * 策略：
 * 1. 通过云函数 holidays 拉取（云函数端从 holiday-cn 拉取并按年缓存，含兜底）
 * 2. 结果缓存到小程序 storage，下次启动直接读取
 * 3. 全部失败时使用内置 2026 兜底数据
 */

import { getNow } from './time'

// ─── 内置兜底（2026 年） ───
const FALLBACK_HOLIDAYS: Record<string, string> = {
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
const FALLBACK_WORKDAYS: Set<string> = new Set([
  '2026-02-14', '2026-02-15', '2026-02-28', '2026-04-04', '2026-04-26', '2026-09-20', '2026-10-10',
])

let holidays: Record<string, string> = { ...FALLBACK_HOLIDAYS }
let workdaysOnWeekend: Set<string> = new Set(FALLBACK_WORKDAYS)

const CACHE_KEY = 'holiday_data_v1'

function dateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function loadCache(): boolean {
  try {
    const raw = uni.getStorageSync(CACHE_KEY)
    if (!raw) return false
    const cache = JSON.parse(raw as string)
    if (cache.year !== getNow().getFullYear()) return false // 跨年强制刷新
    if (cache.holidays) holidays = { ...FALLBACK_HOLIDAYS, ...cache.holidays }
    if (cache.workdays) workdaysOnWeekend = new Set(cache.workdays)
    return true
  } catch {
    return false
  }
}

// ─── 初始化：先读缓存，再异步调云函数刷新 ───
let initPromise: Promise<void> | null = null

export function initHolidays(): Promise<void> {
  if (initPromise) return initPromise

  initPromise = (async () => {
    const hasCache = loadCache()
    if (hasCache) return // 有当年缓存直接用，后台不刷新（节假日数据极少变动）

    try {
      const res = await wx.cloud.callFunction({ name: 'holidays' })
      const result = (res.result as { holidays: Record<string, string>; workdays: string[] }) || null
      if (result && result.holidays) {
        holidays = { ...FALLBACK_HOLIDAYS, ...result.holidays }
        workdaysOnWeekend = new Set(result.workdays || [])
        uni.setStorageSync(CACHE_KEY, JSON.stringify({
          year: getNow().getFullYear(),
          holidays: result.holidays,
          workdays: result.workdays,
        }))
      }
    } catch (e) {
      // 云函数未部署/网络失败：使用内置兜底，不阻塞
      console.warn('holidays 云函数调用失败，使用内置兜底数据', e)
    }
  })()

  return initPromise
}

/** 获取日期标签（节日名 > 调休工作日 > 周末/工作日） */
export function getDateLabel(date?: Date): string {
  const d = date ?? getNow()
  const key = dateKey(d)
  if (holidays[key]) return holidays[key]
  if (workdaysOnWeekend.has(key)) return '工作日'
  const day = d.getDay()
  if (day === 0 || day === 6) return '周末'
  return '工作日'
}

/** 判断是否为工作日（非节假日非周末的真实工作日） */
export function isWorkday(date?: Date): boolean {
  return getDateLabel(date) === '工作日'
}
