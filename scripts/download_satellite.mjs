/**
 * 从 ESRI 下载卫星瓦片并拼接成校园底图
 *
 * 锚点：北门（北）+ 理学院（西）+ 东门（东）+ 305教学楼（南）
 * 各方向扩展：北3000m / 南3000m / 西2000m / 东2000m
 * GCJ-02 → WGS-84 转换后下载，确保和高德坐标对齐
 *
 * 运行：node scripts/download_satellite.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT = path.join(__dirname, '..', 'public', 'data', 'campus-satellite.png');

// ─── GCJ-02 → WGS-84 反转转换 ───
function gcj02ToWgs84(lng, lat) {
  const a = 6378245.0, ee = 0.006693421622965943;
  function transformLat(x, y) {
    let r = -100 + 2*x + 3*y + 0.2*y*y + 0.1*x*y + 0.2*Math.sqrt(Math.abs(x));
    r += (20*Math.sin(6*x*Math.PI) + 20*Math.sin(2*x*Math.PI)) * 2/3;
    r += (20*Math.sin(y*Math.PI) + 40*Math.sin(y/3*Math.PI)) * 2/3;
    r += (160*Math.sin(y/12*Math.PI) + 320*Math.sin(y*Math.PI/30)) * 2/3;
    return r;
  }
  function transformLng(x, y) {
    let r = 300 + x + 2*y + 0.1*x*x + 0.1*x*y + 0.1*Math.sqrt(Math.abs(x));
    r += (20*Math.sin(6*x*Math.PI) + 20*Math.sin(2*x*Math.PI)) * 2/3;
    r += (20*Math.sin(x*Math.PI) + 40*Math.sin(x/3*Math.PI)) * 2/3;
    r += (150*Math.sin(x/12*Math.PI) + 300*Math.sin(x/30*Math.PI)) * 2/3;
    return r;
  }
  const dlat = transformLat(lng - 105, lat - 35);
  const dlng = transformLng(lng - 105, lat - 35);
  const radlat = lat / 180 * Math.PI;
  const magic = Math.sin(radlat);
  const m2 = 1 - ee * magic * magic;
  const sq = Math.sqrt(m2);
  const dlat2 = (dlat * 180) / ((a * (1 - ee)) / (m2 * sq) * Math.PI);
  const dlng2 = (dlng * 180) / (a / sq * Math.cos(radlat) * Math.PI);
  return { lat: lat - dlat2, lng: lng - dlng2 };
}

// ─── 锚点坐标 (GCJ-02) + 扩展距离 ───
// 只保留校园区域，减少到 500m 边距
const ANCHORS = [
  { name: '北门（北）',   lat: 28.26880260977444, lng: 113.04471599806402, extendNorth: 600, extendSouth: 0, extendWest: 0, extendEast: 0 },
  { name: '理学院（西）', lat: 28.265605736223364, lng: 113.04238761527515, extendNorth: 0, extendSouth: 0, extendWest: 800, extendEast: 0 },
  { name: '东门（东）',   lat: 28.257171296407726, lng: 113.053557330271,   extendNorth: 0, extendSouth: 0, extendWest: 0, extendEast: 800 },
  { name: '305教学楼（南）', lat: 28.254029243737428, lng: 113.04819808336002, extendNorth: 0, extendSouth: 600, extendWest: 0, extendEast: 0 },
];

// 转为 WGS-84 并计算边界
const PAD_M = { north: 0, south: 0, west: 0, east: 0 };
for (const a of ANCHORS) {
  const wgs = gcj02ToWgs84(a.lng, a.lat);
  const padLat = a.extendNorth / 111000;
  const padLng = a.extendWest / (111000 * Math.cos(wgs.lat * Math.PI / 180));
  PAD_M.north = Math.max(PAD_M.north, a.extendNorth);
  PAD_M.south = Math.max(PAD_M.south, a.extendSouth);
  PAD_M.west  = Math.max(PAD_M.west,  a.extendWest);
  PAD_M.east  = Math.max(PAD_M.east,  a.extendEast);
  console.log(`  ${a.name}: ${wgs.lat.toFixed(6)}N, ${wgs.lng.toFixed(6)}E`);
}

// 计算总体边界：取所有锚点 + 各方向最大扩展
const allWgs = ANCHORS.map(a => gcj02ToWgs84(a.lng, a.lat));
const avgLat = allWgs.reduce((s, w) => s + w.lat, 0) / allWgs.length;
const maxNorth = Math.max(...allWgs.map(w => w.lat));
const maxSouth = Math.min(...allWgs.map(w => w.lat));
const maxEast  = Math.max(...allWgs.map(w => w.lng));
const maxWest  = Math.min(...allWgs.map(w => w.lng));

const BOUNDS = {
  north: maxNorth + PAD_M.north / 111000,
  south: maxSouth - PAD_M.south / 111000,
  east:  maxEast  + PAD_M.east  / (111000 * Math.cos(avgLat * Math.PI / 180)),
  west:  maxWest  - PAD_M.west  / (111000 * Math.cos(avgLat * Math.PI / 180)),
};
console.log('边界 WGS-84:', BOUNDS);

// ─── 瓦片计算 ───
const TILE_SIZE = 256;
const ZOOM = 17;

function lngLatToTile(lng, lat, z) {
  const n = 2 ** z;
  return {
    x: Math.floor(((lng + 180) / 360) * n),
    y: Math.floor(((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2) * n),
  };
}

const topLeft = lngLatToTile(BOUNDS.west, BOUNDS.north, ZOOM);
const bottomRight = lngLatToTile(BOUNDS.east, BOUNDS.south, ZOOM);
const cols = bottomRight.x - topLeft.x + 1;
const rows = bottomRight.y - topLeft.y + 1;

console.log(`缩放: ${ZOOM}, 瓦片: ${cols}×${rows} = ${cols * rows} 张`);
console.log(`输出: ${cols * TILE_SIZE} × ${rows * TILE_SIZE} px`);

// ─── 下载瓦片 ───
async function downloadTile(z, x, y) {
  const url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
  const resp = await fetch(url, { headers: { 'User-Agent': 'CampusBusApp/1.0' } });
  if (!resp.ok) throw new Error(`${resp.status}`);
  return Buffer.from(await resp.arrayBuffer());
}

async function main() {
  console.log('开始下载卫星瓦片...');
  const totalWidth = cols * TILE_SIZE;
  const totalHeight = rows * TILE_SIZE;
  const rowBuffers = [];

  for (let row = 0; row < rows; row++) {
    const tileBuffers = [];
    for (let col = 0; col < cols; col++) {
      try {
        tileBuffers.push(await downloadTile(ZOOM, topLeft.x + col, topLeft.y + row));
        process.stdout.write(`  行${row+1}/${rows} 列${col+1}/${cols} ✓\r`);
      } catch (e) {
        console.error(`\n  ❌ 行${row+1}列${col+1}: ${e.message}`);
        tileBuffers.push(await sharp({ create: { width: TILE_SIZE, height: TILE_SIZE, channels: 3, background: { r: 200, g: 200, b: 200 } } }).png().toBuffer());
      }
      await new Promise(r => setTimeout(r, 50));
    }
    const rowImg = await sharp({
      create: { width: totalWidth, height: TILE_SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    }).composite(tileBuffers.map((buf, i) => ({ input: buf, left: i * TILE_SIZE, top: 0 }))).png().toBuffer();
    rowBuffers.push(rowImg);
    console.log(`  行 ${row + 1}/${rows} 完成`);
  }

  console.log('合并...');
  await sharp({
    create: { width: totalWidth, height: totalHeight, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite(rowBuffers.map((buf, i) => ({ input: buf, left: 0, top: i * TILE_SIZE }))).png().toFile(OUTPUT);

  // 更新 bounds 元数据
  const boundsFile = path.join(__dirname, '..', 'public', 'data', 'satellite-bounds.json');
  const wgs84Bounds = {
    north: BOUNDS.north, south: BOUNDS.south, west: BOUNDS.west, east: BOUNDS.east,
  };
  fs.writeFileSync(boundsFile, JSON.stringify({
    topLeftTile: { x: topLeft.x, y: topLeft.y },
    zoom: ZOOM, tileSize: TILE_SIZE,
    imageWidth: totalWidth, imageHeight: totalHeight,
    wgs84Bounds,
  }, null, 2) + '\n');

  const sizeMB = (fs.statSync(OUTPUT).size / 1024 / 1024).toFixed(1);
  console.log(`\n✅ 卫星底图: ${OUTPUT} (${sizeMB}MB)`);
  console.log(`   尺寸: ${totalWidth} × ${totalHeight} px`);
  console.log(`   元数据: ${boundsFile}`);
}

main().catch(console.error);
