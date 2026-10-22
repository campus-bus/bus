/**
 * 距离与方位计算（小程序端）
 *
 * 坐标系约定（改代码前务必读完）
 * - 小程序侧全程 **GCJ-02**：微信定位、腾讯 `<map>`、腾讯 LBS 同源；
 *   `src/data/*.json` 在 `scripts/sync_miniprogram_data.js` 同步时已从 WGS-84 转成 GCJ-02。
 * - 因此运行期**不做任何坐标转换**。转换只发生在构建期的同步脚本里
 *   （实现见 `scripts/lib/coord.js`，启动时会自检偏移量）。
 * - H5 版是另一套代码，全程 WGS-84，与本文件无关。
 *
 * 历史说明：本文件曾随 H5 版带进来 `wgs84ToGcj02` / `gcj02ToWgs84` /
 * `computeMinDistanceToPath`（H5 自动记录下车检测用），小程序端从未调用，
 * 且注释里「本项目全部使用 WGS-84」与现状相反，容易误导后来者，已于 2026-10-22 删除。
 */
import type { Station } from '@/types'

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
 * 格式化步行时间
 *
 * 只给到分钟级：步行速度本身是估算值（1.3m/s），报「1分23秒」是假精确，
 * GPS 抖一下数字就变，反而不像人话。不足 1 分钟按「1分钟内」处理。
 */
export function formatWalkTime(seconds: number): string {
  const min = Math.round(seconds / 60)
  if (min <= 1) return '步行约1分钟'
  return `步行约${min}分钟`
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
