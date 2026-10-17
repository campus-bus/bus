// ⚠️ 已归档：一次性历史修复脚本，对应问题已修复完毕，仅供历史参考，请勿直接运行。
#!/usr/bin/env node
// 修复 route_stops.json 中的站点坐标
// 以 stations.json 的 GCJ-02 坐标为准，统一所有路线中的站点坐标

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '..', 'public', 'data');

// 读取数据
const stations = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'stations.json'), 'utf-8'));
const routeStops = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'route_stops.json'), 'utf-8'));

// 建立站点坐标字典（以 stations.json 为准）
const stationDict = {};
stations.forEach(s => {
  stationDict[s.name] = { lat: s.lat, lng: s.lng };
});

console.log('📍 站点坐标基准（stations.json）：');
Object.entries(stationDict).forEach(([name, coord]) => {
  console.log(`  ${name}: lat=${coord.lat}, lng=${coord.lng}`);
});

// 修复每个路线的站点坐标
let totalFixed = 0;
for (const [routeKey, stops] of Object.entries(routeStops)) {
  console.log(`\n🔧 修复 ${routeKey}：`);
  let routeFixed = 0;

  for (const stop of stops) {
    const baseCoord = stationDict[stop.name];
    if (baseCoord) {
      const latDiff = Math.abs(stop.lat - baseCoord.lat);
      const lngDiff = Math.abs(stop.lng - baseCoord.lng);

      if (latDiff > 0.0001 || lngDiff > 0.0001) {
        console.log(`  ❌ ${stop.name}:`);
        console.log(`     旧坐标: lat=${stop.lat}, lng=${stop.lng}`);
        console.log(`     新坐标: lat=${baseCoord.lat}, lng=${baseCoord.lng}`);
        console.log(`     差异: lat=${latDiff.toFixed(6)}, lng=${lngDiff.toFixed(6)}`);

        // 更新坐标
        stop.lat = baseCoord.lat;
        stop.lng = baseCoord.lng;
        routeFixed++;
        totalFixed++;
      }
    } else {
      console.log(`  ⚠️  ${stop.name} 在 stations.json 中不存在，跳过`);
    }
  }

  if (routeFixed > 0) {
    console.log(`  ✅ 修复了 ${routeFixed} 个站点`);
  } else {
    console.log(`  ✅ 所有站点坐标正确`);
  }
}

console.log(`\n📊 总计修复: ${totalFixed} 个站点坐标`);

// 保存修复后的 route_stops.json
fs.writeFileSync(
  path.join(DATA_DIR, 'route_stops.json'),
  JSON.stringify(routeStops, null, 2),
  'utf-8'
);

console.log(`\n✅ 已保存修复后的 route_stops.json`);
