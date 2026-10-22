/**
 * 站序（stopSeq）相关的纯函数
 *
 * 为什么单独抽出来：
 * 接驳1路/2路是环线，军体活动中心东、网球场、激光所在同一圈里经过两次
 * （去程一次，绕回来再停一次），站名完全相同。只要有一处用 `indexOf(站名)`
 * 定位站点，就会静默选中**去程**那一次。
 * 本项目已经因为这件事出过两次问题：
 *   1. 首页目的地推荐（会把用户带去绕大圈的车）→ 现在用 findBestRide 枚举组合；
 *   2. 记录页「一键上车」（在回程车前点，上车站被设成去程站序，整条计时链错位）。
 * 所以这里把「站名 → 全部站序」「站序 → 行状态」固化成纯函数，
 * 既保证各处口径一致，也能被 `scripts/test_core_logic.mjs` 直接 import 测试。
 *
 * 本文件必须保持零依赖（不 import vue / uni / store），否则 Node 侧无法导入。
 */

/**
 * 站名在这条路线一圈内出现的全部站序索引（0 起，与 stopSeq-1 一致）
 *
 * 终点站与起点同名（所有线路都是环线），不作为上车站，因此排除最后一项。
 * 返回值可能为空（站名不在路线上），长度可能 >1（同名站一圈经过多次）。
 */
export function findStopIndexes(stops: string[], name: string): number[] {
  const last = stops.length - 1
  const out: number[] = []
  stops.forEach((s, i) => {
    if (s === name && i < last) out.push(i)
  })
  return out
}

/**
 * 某一行的计时状态
 *
 * @param idx 行索引（0 起）
 * @param boardIdx 上车站索引，-1 表示尚未上车
 * @param recordedCount 已记录的段数
 * @returns 0 上车站 / 1 下一站待计时 / 2 已记录 / -1 与本趟无关
 */
export function stopStateOf(idx: number, boardIdx: number, recordedCount: number): number {
  if (boardIdx < 0) return -1
  if (idx === boardIdx) return 0
  if (idx < boardIdx) return -1
  const segIdx = idx - boardIdx - 1
  if (segIdx < recordedCount) return 2
  if (segIdx === recordedCount) return 1
  return -1
}

/** 到站预测的最小切片（只要这几个字段，便于 Node 侧构造测试数据） */
export interface ArrivalSlice {
  stopSeq: number
  arrivalMinutes: number
  arrivalTime: string
}

/**
 * 同一站名某一次经过的候选上车位置 */
export interface PassCandidate {
  /** 行索引（0 起） */
  idx: number
  /** 站序（1 起） */
  seq: number
  /** 距下一次到站还有多少秒；null = 预测窗口内没有车 */
  etaSeconds: number | null
  /** 下一次到站时刻 hh:mm:ss */
  etaTime: string | null
  /** 车刚过站（仍在保留窗内，负值） */
  passed: boolean
}

/**
 * 每个候选站序「下一次到站」还有多久
 *
 * 用途：同一站名一圈过两次时，靠定位无法区分用户面前这趟车是去程还是回程
 * （物理位置完全相同）。但发车时刻表是确定的——比较「现在」与各站序的预计到站时间，
 * 就能知道下一辆到站的车走的是哪一趟，从而替用户选对站序。
 *
 * @param idxs 该站名全部候选站序索引（来自 findStopIndexes）
 * @param arrivals 该站名的全部到站预测（可含多班次，同名不同 seq 已在其中）
 * @param nowSeconds 当天 0 点起的秒数
 * @param keepPassedSec 已过站但仍保留的窗口（负值，与首页口径一致：-300）
 * @param lookaheadSec 向前看多久（3600 = 1 小时）
 */
export function nextArrivalsBySeq(
  idxs: number[],
  arrivals: ArrivalSlice[],
  nowSeconds: number,
  keepPassedSec = -300,
  lookaheadSec = 3600,
): PassCandidate[] {
  return idxs.map((idx) => {
    const seq = idx + 1
    let bestFuture: ArrivalSlice | null = null
    let bestFutureDelta = Infinity
    let bestPassed: ArrivalSlice | null = null
    let bestPassedDelta = -Infinity
    for (const a of arrivals) {
      if (a.stopSeq !== seq) continue
      const delta = Math.round(a.arrivalMinutes * 60 - nowSeconds)
      if (delta > lookaheadSec || delta < keepPassedSec) continue
      if (delta >= 0) {
        if (delta < bestFutureDelta) { bestFutureDelta = delta; bestFuture = a }
      } else if (delta > bestPassedDelta) {
        // 都已过站时保留「刚过去的那一趟」，用于给出「已过站」提示
        bestPassedDelta = delta; bestPassed = a
      }
    }
    const hit = bestFuture || bestPassed
    if (!hit) return { idx, seq, etaSeconds: null, etaTime: null, passed: false }
    return {
      idx,
      seq,
      etaSeconds: bestFuture ? bestFutureDelta : bestPassedDelta,
      etaTime: hit.arrivalTime,
      passed: !bestFuture,
    }
  })
}

/**
 * 收集某条线路某站名的全部到站预测
 *
 * **必须按 routeKey 过滤**：同一站名在不同线路的站序可能恰好相同，
 * 例如「军体活动中心东」在环线1路与接驳2路都是第 4 站。若只按日期类型遍历全部班次，
 * 选中接驳2路时会拿环线1路 07:30 那班的到站时间（07:33:27）去判断本站方向，
 * 而接驳2路真正下一班是 07:48 —— 两者差 15 分钟，「下一班」标记会指错方向，
 * 用户按它上车整条计时链都会记到错误路段。
 *
 * @param departures 全部班次（只用到 recordId / routeKey / dateType）
 * @param predictionsOf 取某班次预测记录（stopName 已在内部过滤）
 */
export function collectStopArrivals<T extends { stopName: string }>(
  departures: Array<{ recordId: string; routeKey?: string; dateType: string }>,
  predictionsOf: (recordId: string) => T[],
  routeKey: string,
  dateType: string,
  stopName: string,
): T[] {
  const out: T[] = []
  for (const dep of departures) {
    if (dep.dateType !== dateType) continue
    // 少了这一行，同名站会串到别的线路的时刻上
    if (dep.routeKey !== routeKey) continue
    for (const p of predictionsOf(dep.recordId)) {
      if (p.stopName === stopName) out.push(p)
    }
  }
  return out
}

/**
 * 该建议用户去哪个站序上车
 *
 * 规则：取「最近一班还没到站」的那次经过。都过站或都没有预测时不猜（返回 null），
 * 由界面并列展示让用户自己点——猜错会让整条计时链记到错误路段上。
 */
export function recommendedPass(passes: PassCandidate[]): number | null {
  let bestIdx: number | null = null
  let bestEta = Infinity
  for (const p of passes) {
    if (p.etaSeconds === null || p.etaSeconds < 0) continue
    if (p.etaSeconds < bestEta) { bestEta = p.etaSeconds; bestIdx = p.idx }
  }
  return bestIdx
}
