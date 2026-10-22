import { getDateLabel, isWorkday } from './holidays'
import { getNow } from './time'
import type { DateType } from '@/types'

/** 判断日期类型：工作日 / 周末节假日 */
export function getDateType(date?: Date): DateType {
  return isWorkday(date ?? getNow()) ? 'weekday' : 'weekend_holiday'
}

/** 获取当前时间距离 00:00 的秒数 */
export function getSecondsSinceMidnight(date?: Date): number {
  const d = date ?? getNow()
  return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()
}

/** 格式化当前日期显示 */
export function formatDate(date?: Date): string {
  const d = date ?? getNow()
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  const d_ = d.getDate()
  const weekDays = ['日', '一', '二', '三', '四', '五', '六']
  const w = weekDays[d.getDay()]
  return `${y}年${m}月${d_}日 星期${w}`
}

/**
 * 本地时区的 YYYY-MM-DD
 *
 * 不能用 toISOString：那是 UTC，00:00–08:00 之间会把日期算成前一天。
 */
export function localDateStr(date?: Date): string {
  const d = date ?? getNow()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/**
 * YYYY-MM-DD → 日历日期（取星期、判断日期类型用）
 *
 * 不能写成 `new Date(s + 'T00:00:00+08:00')`：那是一个绝对时刻，
 * 在 UTC-7 等时区会落到前一天的本地日期，getDay() 取到错误的星期，
 * 于是把工作日查成周末（或反之）。直接拆数字构造本地日历日，
 * 任何时区下 getDay() 都是这一天的真实星期。
 */
export function parseDateStr(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export { getDateLabel }
