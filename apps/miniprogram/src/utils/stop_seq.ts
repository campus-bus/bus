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
