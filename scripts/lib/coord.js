/**
 * WGS-84 → GCJ-02 转换（构建期专用）
 *
 * 为什么脚本里要单独实现一份：
 * `src/utils/geo.ts` 是 TypeScript，Node 脚本无法直接 import；
 * 而小程序运行期已经不需要转换（数据在同步阶段就转好了），
 * 所以这里作为「构建期唯一实现」，算法与 `src/utils/geo.ts` 的
 * `wgs84ToGcj02` 逐行一致。
 *
 * ⚠️ 改动本文件的算法后，必须同步 `src/utils/geo.ts`，
 * 并跑一次 `node scripts/test_scenarios.cjs` 与 `node scripts/mp_probe.cjs geo`。
 * `selfCheck()` 会在偏差明显偏离长沙地区预期值时直接抛错，防止算法漂移后静默产出错数据。
 */

const A = 6378245.0
const EE = 0.006693421622965943

function transformLat(x, y) {
  let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x))
  ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0
  ret += (20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin(y / 3.0 * Math.PI)) * 2.0 / 3.0
  ret += (160.0 * Math.sin(y / 12.0 * Math.PI) + 320.0 * Math.sin(y * Math.PI / 30.0)) * 2.0 / 3.0
  return ret
}

function transformLng(x, y) {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x))
  ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0
  ret += (20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin(x / 3.0 * Math.PI)) * 2.0 / 3.0
  ret += (150.0 * Math.sin(x / 12.0 * Math.PI) + 300.0 * Math.sin(x / 30.0 * Math.PI)) * 2.0 / 3.0
  return ret
}

/** WGS-84 → GCJ-02，返回 [lng, lat] */
export function wgs84ToGcj02(lng, lat) {
  const dlat = transformLat(lng - 105.0, lat - 35.0)
  const dlng = transformLng(lng - 105.0, lat - 35.0)
  const radlat = lat / 180.0 * Math.PI
  const magic = Math.sin(radlat)
  const magic2 = 1 - EE * magic * magic
  const sqrtmagic = Math.sqrt(magic2)
  const dlat2 = (dlat * 180.0) / ((A * (1 - EE)) / (magic2 * sqrtmagic) * Math.PI)
  const dlng2 = (dlng * 180.0) / (A / sqrtmagic * Math.cos(radlat) * Math.PI)
  return [lng + dlng2, lat + dlat2]
}

/** 两点距离（米），仅用于自检 */
export function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * 自检：用校园内已知点校验偏移量落在合理区间
 *
 * 长沙地区 WGS-84 → GCJ-02 的偏移约 600-700m。
 * 若算法被改错（例如少乘 cos、用错椭球参数），偏移会明显跳出该区间。
 */
export function selfCheck() {
  // 研究生宿舍楼（WGS-84）：WGS 与 GCJ 的直线距离应为约 672m
  const wgs = [113.045661, 28.257994]
  const [gLng, gLat] = wgs84ToGcj02(wgs[0], wgs[1])
  const offset = haversineDistance(wgs[1], wgs[0], gLat, gLng)
  if (offset < 550 || offset > 800) {
    throw new Error(`[coord] 自检失败：偏移量 ${offset.toFixed(1)}m 不在长沙地区预期区间 550-800m，算法可能已改错`)
  }
  return offset
}
