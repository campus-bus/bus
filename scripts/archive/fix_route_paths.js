// ⚠️ 已归档：一次性历史修复脚本，对应问题已修复完毕，仅供历史参考，请勿直接运行。
// 修复 route_paths.json 中的折线坐标
// 确保折线的起点/终点与 stations.json 中的站点坐标一致

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '..', 'public', 'data');

// 读取数据
const stations = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'stations.json'), 'utf-8'));
const routeStops = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'route_stops.json'), 'utf-8'));
const routePaths = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'route_paths.json'), 'utf-8'));

// 建立站点坐标字典
const stationDict = {};
stations.forEach(s => {
  stationDict[s.name] = { lat: s.lat, lng: s.lng };
});

// 修复每个路线的折线坐标
for (const [routeKey, path] of Object.entries(routePaths)) {
  console.log(`\n🔧 修复 ${routeKey} 折线坐标：`);

  const stops = routeStops[routeKey];
  if (!stops || stops.length === 0) {
    console.log('  ⚠️  无站点数据，跳过');
    continue;
  }

  // 修复起点
  const firstStop = stops[0];
  const firstCoord = stationDict[firstStop.name];
  if (firstCoord) {
    const startDiff = Math.sqrt(
      Math.pow(firstCoord.lat - path[0][1], 2) +
      Math.pow(firstCoord.lng - path[0][0], 2)
    );

    if (startDiff > 0.0001) {
      console.log(`  ❌ 起点 ${firstStop.name}:`);
      console.log(`     旧坐标: [${path[0][0]}, ${path[0][1]}]`);
      console.log(`     新坐标: [${firstCoord.lng}, ${firstCoord.lat}]`);
      console.log(`     差异: ${(startDiff * 111000).toFixed(0)} 米`);
      path[0] = [firstCoord.lng, firstCoord.lat];
    }
  }

  // 修复终点
  const lastStop = stops[stops.length - 1];
  const lastCoord = stationDict[lastStop.name];
  if (lastCoord) {
    const lastIdx = path.length - 1;
    const endDiff = Math.sqrt(
      Math.pow(lastCoord.lat - path[lastIdx][1], 2) +
      Math.pow(lastCoord.lng - path[lastIdx][0], 2)
    );

    if (endDiff > 0.0001) {
      console.log(`  ❌ 终点 ${lastStop.name}:`);
      console.log(`     旧坐标: [${path[lastIdx][0]}, ${path[lastIdx][1]}]`);
      console.log(`     新坐标: [${lastCoord.lng}, ${lastCoord.lat}]`);
      console.log(`     差异: ${(endDiff * 111000).toFixed(0)} 米`);
      path[lastIdx] = [lastCoord.lng, lastCoord.lat];
    }
  }

  console.log('  ✅ 折线起终点已修复');
}

// 保存修复后的 route_paths.json
fs.writeFileSync(
  path.join(DATA_DIR, 'route_paths.json'),
  JSON.stringify(routePaths, null, 2),
  'utf-8'
);

console.log(`\n✅ 已保存修复后的 route_paths.json`);
