/**
 * WGS-84 坐标 → 卫星底图像素坐标
 * 用于静态地图的 SVG 叠加层定位
 *
 * 坐标口径：站点、路线、GPS（浏览器原生返回）均为 WGS-84，
 * 卫星底图（ESRI World Imagery）同样为 WGS-84，全程无需 GCJ-02 转换。
 */

// 卫星底图参数（与 public/data/satellite-bounds.json 一致，由 download_satellite.mjs 生成）
const TOP_LEFT_TILE_X = 106688
const TOP_LEFT_TILE_Y = 54795
const ZOOM = 17
const TILE_SIZE = 256
const N = 2 ** ZOOM

/** WGS-84 经纬度 → 底图像素坐标 */
export function wgs84ToPixel(lng: number, lat: number): { x: number; y: number } {
  // WGS-84 → Web Mercator 瓦片坐标（zoom 17）→ 减去左上角瓦片偏移
  const tileX = ((lng + 180) / 360) * N
  const tileY = ((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2) * N
  return {
    x: (tileX - TOP_LEFT_TILE_X) * TILE_SIZE,
    y: (tileY - TOP_LEFT_TILE_Y) * TILE_SIZE,
  }
}
