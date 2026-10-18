import type { Station } from '@/types'

/**
 * WGS-84 → GCJ-02（火星坐标系）转换
 * 浏览器 GPS 返回 WGS-84，高德地图使用 GCJ-02，直接使用会有偏移
 */
export function wgs84ToGcj02(lng: number, lat: number): [number, number] {
  const a = 6378245.0
  const ee = 0.006693421622965943

  function transformLat(x: number, y: number): number {
    let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x))
    ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0
    ret += (20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin(y / 3.0 * Math.PI)) * 2.0 / 3.0
    ret += (160.0 * Math.sin(y / 12.0 * Math.PI) + 320.0 * Math.sin(y * Math.PI / 30.0)) * 2.0 / 3.0
    return ret
  }

  function transformLng(x: number, y: number): number {
    let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x))
    ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0
    ret += (20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin(x / 3.0 * Math.PI)) * 2.0 / 3.0
    ret += (150.0 * Math.sin(x / 12.0 * Math.PI) + 300.0 * Math.sin(x / 30.0 * Math.PI)) * 2.0 / 3.0
    return ret
  }

  const dlat = transformLat(lng - 105.0, lat - 35.0)
  const dlng = transformLng(lng - 105.0, lat - 35.0)
  const radlat = lat / 180.0 * Math.PI
  const magic = Math.sin(radlat)
  const magic2 = 1 - ee * magic * magic
  const sqrtmagic = Math.sqrt(magic2)
  const dlat2 = (dlat * 180.0) / ((a * (1 - ee)) / (magic2 * sqrtmagic) * Math.PI)
  const dlng2 = (dlng * 180.0) / (a / sqrtmagic * Math.cos(radlat) * Math.PI)
  return [lng + dlng2, lat + dlat2]
}

/**
 * Haversine 公式计算两点间的距离（米）
 */
export function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/**
 * 从站点列表中找出距离用户最近的站点
 */
export function findNearestStop(
  userLat: number,
  userLng: number,
  stations: Station[]
): { station: Station; distance: number } | null {
  if (stations.length === 0) return null

  let nearest = stations[0]
  let minDist = haversineDistance(userLat, userLng, nearest.lat, nearest.lng)

  for (let i = 1; i < stations.length; i++) {
    const dist = haversineDistance(userLat, userLng, stations[i].lat, stations[i].lng)
    if (dist < minDist) {
      minDist = dist
      nearest = stations[i]
    }
  }

  return { station: nearest, distance: minDist }
}

/**
 * 找到距离用户最近的 N 个站点（仅在 maxDistanceM 范围内）
 */
export function findNearestStops(
  userLat: number,
  userLng: number,
  stations: Station[],
  maxCount = 3,
  maxDistanceM = 500
): { station: Station; distance: number }[] {
  const results: { station: Station; distance: number }[] = []
  for (const s of stations) {
    const d = haversineDistance(userLat, userLng, s.lat, s.lng)
    if (d <= maxDistanceM) results.push({ station: s, distance: d })
  }
  results.sort((a, b) => a.distance - b.distance)
  return results.slice(0, maxCount)
}

/**
 * 格式化步行时间（精确到秒）
 */
export function formatWalkTime(seconds: number): string {
  const s = Math.round(seconds)
  if (s < 60) return `步行约${s}秒`
  const min = Math.floor(s / 60)
  const sec = s % 60
  return `步行约${min}分${sec}秒`
}

/**
 * 计算两点之间的方位角（度）
 */
export function computeBearing(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const y = Math.sin(dLng) * Math.cos((lat2 * Math.PI) / 180)
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.cos(dLng)
  const bearing = (Math.atan2(y, x) * 180) / Math.PI
  return (bearing + 360) % 360
}

/**
 * 点到线段的最短距离（米）
 */
function pointToSegmentDistance(
  lat: number, lng: number,
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  // 使用平面近似（校园尺度误差可忽略）
  const dx = lng2 - lng1
  const dy = lat2 - lat1
  if (dx === 0 && dy === 0) return haversineDistance(lat, lng, lat1, lng1)

  const t = Math.max(0, Math.min(1,
    ((lng - lng1) * dx + (lat - lat1) * dy) / (dx * dx + dy * dy)
  ))
  const projLng = lng1 + t * dx
  const projLat = lat1 + t * dy
  return haversineDistance(lat, lng, projLat, projLng)
}

/**
 * 计算点到折线路径的最短距离（米）
 * 用于判断用户是否已远离公交车路线（下车检测）
 */
export function computeMinDistanceToPath(
  lat: number,
  lng: number,
  path: [number, number][]  // [[lng, lat], ...]
): number {
  if (path.length === 0) return Infinity
  if (path.length === 1) return haversineDistance(lat, lng, path[0][1], path[0][0])

  let minDist = Infinity
  // 窗口搜索：从上次最近段索引附近开始
  for (let i = 0; i < path.length - 1; i++) {
    const d = pointToSegmentDistance(
      lat, lng,
      path[i][1], path[i][0],
      path[i + 1][1], path[i + 1][0]
    )
    if (d < minDist) minDist = d
  }
  return minDist
}
