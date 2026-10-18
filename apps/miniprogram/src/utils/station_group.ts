/**
 * 站点分组（泛站点）
 *
 * 背景：军体活动中心拆分为东/南两站、二食堂与二食堂北为相邻两站。
 * 用户在行程规划/首页选目的地时不应被迫区分具体站——只需选「军体活动中心」，
 * 系统按目的地自动匹配最优的具体上下车站（东或南），并在结果中告知具体站名。
 *
 * 注意：手动记录（UploadView）与地图点站（StopInfoPanel）仍按具体物理站处理。
 */

/** 泛站点 → 成员站（组名即用户可见名） */
export const STATION_GROUPS: Record<string, string[]> = {
  '军体活动中心': ['军体活动中心东', '军体活动中心南'],
  '二食堂': ['二食堂', '二食堂北'],
}

/** 成员站 → 组名 反向索引 */
const memberToGroup = new Map<string, string>()
for (const [group, members] of Object.entries(STATION_GROUPS)) {
  for (const m of members) memberToGroup.set(m, group)
}

/** 任意站名 → 所属组名（无分组返回自身） */
export function toGroup(stopName: string): string {
  return memberToGroup.get(stopName) ?? stopName
}

/** 组名 → 成员站列表（无分组返回自身单元素数组） */
export function groupMembers(name: string): string[] {
  return STATION_GROUPS[name] ?? [name]
}

/**
 * 在一班车的预测序列中，为 (上车站组, 下车站组) 找乘坐时间最短的组合。
 *
 * 解决同名站一圈多次经过（接驳环线 激光所/网球场/军体东 去程+返程）时
 * 误选远端上车点的问题：枚举所有 origin×dest 位置组合，取 dest 在 origin 之后
 * 且乘坐时间最短的方案。
 *
 * @param preds 同一班次按 stopSeq 升序的预测记录
 * @param originMembers 上车站组成员
 * @param destMembers 下车站组成员
 * @returns 最优组合 { origin, dest }，无可行方案返回 null
 */
export function findBestRide<T extends { stopName: string; stopSeq: number; arrivalMinutes: number; isReturnStop: boolean }>(
  preds: T[],
  originMembers: string[],
  destMembers: string[],
): { origin: T; dest: T; rideMinutes: number } | null {
  let best: { origin: T; dest: T; rideMinutes: number } | null = null
  for (const o of preds) {
    if (!originMembers.includes(o.stopName)) continue
    if (o.isReturnStop) continue // 环线终点站（回到发车点）不能上车
    for (const d of preds) {
      if (!destMembers.includes(d.stopName)) continue
      if (d.stopSeq <= o.stopSeq) continue // 下车站必须在上车站之后
      const ride = d.arrivalMinutes - o.arrivalMinutes
      if (!best || ride < best.rideMinutes) {
        best = { origin: o, dest: d, rideMinutes: ride }
      }
    }
  }
  return best
}
