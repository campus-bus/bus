/**
 * 上车站候选的取舍规则
 *
 * 为什么单独抽一个文件：
 * 「附近有好几个站，这班车该建议用户去哪个站上」是首页目的地推荐里最容易错的
 * 一步，而且错过一次（2026-10-22：最近站的车刚过站，把唯一能赶上的上车站挤掉）。
 * 这段判断以前内联在 index.vue 里，数据回归脚本只能在测试文件里**再抄一份**，
 * 一旦线上改了而测试没改，就会出现「测试全绿、页面照错」。
 * 抽成纯函数后，`scripts/test_core_logic.mjs` 直接 import 这一份真实实现。
 *
 * 本文件必须保持零依赖（不 import store / vue / uni），否则 Node 侧无法导入。
 */

/** 上车可行性档位，数字越小越优先 */
export const BOARD_TIER = {
  /** 走得到，且车还没来 */
  REACHABLE: 0,
  /** 车还没来，但按步行速度算走过去已经来不及 */
  TOO_LATE: 1,
  /** 车已经过站（仍在 5 分钟保留窗内，列表里还能看到） */
  PASSED: 2,
} as const

/**
 * 按「还有几秒到站」与「走过去要几秒」定档
 *
 * @param secBoard 距离该车到上车站还有多少秒（负数=已过站）
 * @param walkSeconds 从当前位置走到该站需要多少秒
 */
export function boardTierOf(secBoard: number, walkSeconds: number): number {
  if (secBoard <= 0) return BOARD_TIER.PASSED
  return walkSeconds > secBoard ? BOARD_TIER.TOO_LATE : BOARD_TIER.REACHABLE
}

export interface BoardCandidate {
  tier: number
  walkSeconds: number
}

/**
 * a 是否比 b 更该被推荐
 *
 * 先比能不能上车（档位），同一档再比走多远。
 * 这条规则决定了「同一班车在多个附近站有到站记录时保留哪一个」。
 */
export function isBetterBoard(a: BoardCandidate, b: BoardCandidate): boolean {
  if (a.tier !== b.tier) return a.tier < b.tier
  return a.walkSeconds < b.walkSeconds
}

/**
 * 结果列表的最终排序
 *
 * 先按能否上车分档（可上车的排前面），同档内按到达目的地的时间从早到晚。
 * 直接把「已过站」也按时间排会把它们混进推荐里，用户看到的第一条就是赶不上的车。
 */
export function compareArrivalResults(
  a: { boardTier?: number; destMinutes?: number; arrivalMinutes?: number },
  b: { boardTier?: number; destMinutes?: number; arrivalMinutes?: number },
): number {
  const ta = a.boardTier ?? 0
  const tb = b.boardTier ?? 0
  if (ta !== tb) return ta - tb
  return (a.destMinutes ?? a.arrivalMinutes ?? 0) - (b.destMinutes ?? b.arrivalMinutes ?? 0)
}
