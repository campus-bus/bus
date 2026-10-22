/**
 * 乘车记录的时间与文本格式（纯函数，零平台依赖）
 *
 * 为什么单独抽出来：复制给管理员做校准的文本必须写**真实上车时刻**，
 * 而不是提交时刻。维护者 10:00 上车、10:15 提交，若输出 10:15，
 * 后续按这份文本回溯班次就会对应到错误的那一趟，站间秒数也跟着失真。
 *
 * 放在 .vue / store 里无法被 Node 直接 import 测试（store 依赖 uni），
 * 所以把「取哪个时间」「拼成什么行」全部固化成纯函数，
 * 由 `scripts/test_core_logic.mjs` 直接测真实实现。
 */

export interface SegmentSlice {
  from: string
  to: string
  seconds: number
  /** 起止站站序（从 1 起）。接驳环线同名站一圈过两次，没有站序无法判断是哪一段 */
  fromSeq?: number
  toSeq?: number
}

/** 记录的最小切片：只保留格式化用得到的字段，便于测试构造 */
export interface MeasurementSlice {
  date: string
  route: string
  routeKey?: string
  /** 实际上车时刻 HH:MM（提交时由 boardingTime 写入）。旧记录可能为空 */
  depart_time?: string
  /** 提交时刻（毫秒时间戳） */
  created_at: number
  segments: SegmentSlice[]
}

/** 时间戳 → 本地 HH:MM */
export function clockOf(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * 记录的上车时刻
 *
 * 优先用保存的上车时间 `depart_time`；旧记录没有该字段时回退到提交时刻，
 * 并在文本里保持可读（不做假数据补齐）。
 */
export function boardingClock(rec: MeasurementSlice): string {
  const t = (rec.depart_time || '').trim()
  // 兼容 "7:30" / "07:30" / "07:30:00" 三种历史写法，统一成 HH:MM
  const m = /^(\d{1,2}):(\d{2})/.exec(t)
  if (m) return `${m[1].padStart(2, '0')}:${m[2]}`
  return clockOf(rec.created_at)
}

/**
 * 生成校准文本的每一行：「日期 上车时刻 线路 起点#序→终点#序 秒数」
 *
 * 站序只在有值时拼上：接驳环线同名站一圈过两次，没有站序无法判断是哪一段。
 */
export function calibrationRows(records: MeasurementSlice[]): string[] {
  const rows: string[] = []
  for (const rec of records) {
    const hhmm = boardingClock(rec)
    const routeLabel = rec.routeKey ? `${rec.route}(${rec.routeKey})` : rec.route
    for (const seg of rec.segments) {
      const from = seg.fromSeq ? `${seg.from}#${seg.fromSeq}` : seg.from
      const to = seg.toSeq ? `${seg.to}#${seg.toSeq}` : seg.to
      rows.push(`${rec.date} ${hhmm} ${routeLabel} ${from}→${to} ${seg.seconds}s`)
    }
  }
  return rows
}
