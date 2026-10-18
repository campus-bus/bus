import type { Departure, RoutePattern, BusPosition, Station } from '@/types'
import { getSecondsSinceMidnight } from './datetime'
import { computeBearing } from './geo'
import { getNow } from './time'

type RoutePath = [number, number][]  // [[lng, lat], ...]

/**
 * 找到路径中距离给定坐标最近的点索引（从 startFrom 之后开始搜索）
 * maxSearch 限制搜索范围，避免环线上同一站点出现在路径两端时误匹配到远端
 */
function findClosestPathIndex(path: RoutePath, lng: number, lat: number, startFrom: number = 0, maxSearch?: number): number {
  let best = startFrom
  let bestDist = Infinity
  const end = maxSearch !== undefined ? Math.min(maxSearch, path.length) : path.length
  for (let i = startFrom; i < end; i++) {
    const dlng = path[i][0] - lng
    const dlat = path[i][1] - lat
    const dist = dlng * dlng + dlat * dlat
    if (dist < bestDist) {
      bestDist = dist
      best = i
    }
  }
  return best
}

/**
 * 计算路径上两点之间的累计距离（度）
 * 支持环线回绕：fromIdx >= toIdx 时从 fromIdx 走到路径末尾再绕回 toIdx
 */
function computePathDistances(path: RoutePath, fromIdx: number, toIdx: number): number[] {
  const dists: number[] = [0]
  if (fromIdx < toIdx) {
    // 正常顺序
    for (let i = fromIdx + 1; i <= toIdx; i++) {
      const dlng = path[i][0] - path[i - 1][0]
      const dlat = path[i][1] - path[i - 1][1]
      dists.push(dists[dists.length - 1] + Math.sqrt(dlng * dlng + dlat * dlat))
    }
  } else if (fromIdx > toIdx) {
    // 环线回绕：先走到路径末尾，再从开头走到 toIdx
    for (let i = fromIdx + 1; i < path.length; i++) {
      const dlng = path[i][0] - path[i - 1][0]
      const dlat = path[i][1] - path[i - 1][1]
      dists.push(dists[dists.length - 1] + Math.sqrt(dlng * dlng + dlat * dlat))
    }
    // 路径末尾绕回起点，再走到 toIdx
    {
      const dlng = path[0][0] - path[path.length - 1][0]
      const dlat = path[0][1] - path[path.length - 1][1]
      dists.push(dists[dists.length - 1] + Math.sqrt(dlng * dlng + dlat * dlat))
    }
    for (let i = 1; i <= toIdx; i++) {
      const dlng = path[i][0] - path[i - 1][0]
      const dlat = path[i][1] - path[i - 1][1]
      dists.push(dists[dists.length - 1] + Math.sqrt(dlng * dlng + dlat * dlat))
    }
  }
  // fromIdx === toIdx: 返回 [0]，起点即终点
  return dists
}

/**
 * 将 distances 数组索引映射回实际路径索引（处理环线回绕）
 */
function mapDistIdxToPathIdx(distIdx: number, fromIdx: number, pathLen: number): number {
  const raw = fromIdx + distIdx
  return raw < pathLen ? raw : raw - pathLen
}

/**
 * 在路径段上按距离比例插值位置
 */
function interpolateOnPath(
  path: RoutePath,
  fromIdx: number,
  toIdx: number,
  distances: number[],
  fraction: number
): { lng: number; lat: number } {
  const totalDist = distances[distances.length - 1]
  if (totalDist === 0 || fraction <= 0) {
    return { lng: path[fromIdx][0], lat: path[fromIdx][1] }
  }
  if (fraction >= 1) {
    return { lng: path[toIdx][0], lat: path[toIdx][1] }
  }

  const targetDist = totalDist * fraction

  // 二分查找目标距离所在的线段
  let lo = 0, hi = distances.length - 1
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1
    if (distances[mid] <= targetDist) lo = mid
    else hi = mid
  }

  const segStart = distances[lo]
  const segEnd = distances[hi]
  const segFrac = segEnd > segStart ? (targetDist - segStart) / (segEnd - segStart) : 0

  const idx = mapDistIdxToPathIdx(lo, fromIdx, path.length)
  const nextIdx = mapDistIdxToPathIdx(hi, fromIdx, path.length)
  return {
    lng: path[idx][0] + (path[nextIdx][0] - path[idx][0]) * segFrac,
    lat: path[idx][1] + (path[nextIdx][1] - path[idx][1]) * segFrac,
  }
}

/**
 * 根据当前时间插值计算公交车在路线上的位置
 * 使用 routePaths 中的详细路径坐标，而非站点间直线插值
 */
export function computeActiveBusPositions(
  departures: Departure[],
  patterns: Map<string, RoutePattern>,
  stations: Station[],
  routePaths: Record<string, RoutePath>,
  routeStops?: Record<string, Array<{ name: string; lng: number; lat: number }>>,
  currentDate?: Date
): BusPosition[] {
  const date = currentDate ?? getNow()
  const secondsSinceMidnight = getSecondsSinceMidnight(date)
  const results: BusPosition[] = []

  // 站点名 → 坐标（fallback：统一 stations.json）
  const stationMap = new Map(stations.map((s) => [s.name, s]))

  // 考虑前 2 小时内发车的班次（可能还在路上）
  const lookbackSeconds = 7200

  for (const dep of departures) {
    const pattern = patterns.get(dep.routeKey)
    if (!pattern || pattern.stops.length < 2) continue

    const path = routePaths[dep.routeKey]
    if (!path || path.length < 2) continue

    let elapsedSeconds = secondsSinceMidnight - dep.departureMinutes * 60
    // 处理跨日
    if (elapsedSeconds < -lookbackSeconds) elapsedSeconds += 86400

    if (elapsedSeconds < 0) continue // 尚未发车
    if (elapsedSeconds > pattern.totalSeconds + 300) continue // 已到终点

    // 该路线的站点坐标序列（routeStops 与 pattern.stops 同序同构）
    // 注意：同名站在去/回程可能有不同坐标（如接驳环线 激光所/网球场/军体活动中心东），
    // 必须按序列索引取坐标——若按站名建 Map，后出现的坐标会覆盖先出现的，
    // 导致去程站点误匹配到路径远端的回程位置（车辆瞬移/缓慢/消失）
    const rs = routeStops?.[dep.routeKey]

    // 为每个站点找到路径中的对应索引（从上一个站点的索引之后搜索，保证单调）
    const stopPathIndices: number[] = []
    let searchFrom = 0
    for (let i = 0; i < pattern.stops.length; i++) {
      const s = pattern.stops[i]
      // 优先按序列索引取路线专属坐标，fallback 到 stations.json 统一坐标
      let coord: { lng: number; lat: number } | undefined
      if (rs && rs[i] && rs[i].name === s.currentStop) {
        coord = rs[i]
      }
      if (!coord) coord = stationMap.get(s.currentStop)
      if (coord) {
        const start = searchFrom < path.length ? searchFrom : 0
        // 限制搜索范围到 path 前半段，防止环线首尾同站误匹配到远端副本
        const maxSearch = start + Math.ceil(path.length / 2)
        const idx = findClosestPathIndex(path, coord.lng, coord.lat, start, maxSearch)
        stopPathIndices.push(idx)
        searchFrom = idx + 1 // 下一个站点从当前之后开始搜
      } else {
        stopPathIndices.push(-1)
      }
    }

    // 找到当前在哪两个站点之间
    for (let i = 1; i < pattern.stops.length; i++) {
      const prev = pattern.stops[i - 1]
      const curr = pattern.stops[i]
      if (elapsedSeconds < curr.cumulativeSeconds) {
        const segmentStart = prev.cumulativeSeconds
        const segmentDuration = curr.cumulativeSeconds - prev.cumulativeSeconds
        const timeFraction = segmentDuration > 0
          ? (elapsedSeconds - segmentStart) / segmentDuration
          : 0

        const fromIdx = stopPathIndices[i - 1]
        const toIdx = stopPathIndices[i]

        if (fromIdx < 0 || toIdx < 0) break

        // 沿路径插值
        const distances = computePathDistances(path, fromIdx, toIdx)
        const pos = interpolateOnPath(path, fromIdx, toIdx, distances, timeFraction)

        // 计算朝向：使用路径上当前位置附近的两点
        let heading: number
        const totalDist = distances[distances.length - 1]
        if (totalDist > 0) {
          const aheadFrac = Math.min(1, timeFraction + 0.02)
          const behindFrac = Math.max(0, timeFraction - 0.02)
          const ahead = interpolateOnPath(path, fromIdx, toIdx, distances, aheadFrac)
          const behind = interpolateOnPath(path, fromIdx, toIdx, distances, behindFrac)
          heading = computeBearing(behind.lat, behind.lng, ahead.lat, ahead.lng)
        } else {
          const fromStation = stationMap.get(prev.currentStop)
          const toStation = stationMap.get(curr.currentStop)
          heading = fromStation && toStation
            ? computeBearing(fromStation.lat, fromStation.lng, toStation.lat, toStation.lng)
            : 0
        }

        results.push({
          departureId: dep.recordId,
          route: dep.route,
          routeKey: dep.routeKey,
          shiftName: dep.shiftName,
          vehicleNo: dep.vehicleNo,
          lat: pos.lat,
          lng: pos.lng,
          fromStop: prev.currentStop,
          toStop: curr.currentStop,
          progress: timeFraction,
          heading,
        })
        break
      }
    }
  }

  return results
}
