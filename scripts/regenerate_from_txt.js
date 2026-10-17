// 按照 txt 文件重新生成 route_stops.json、route_paths.json 和 stations.json
// 每条路线独立处理，不混用同名站点坐标
//
// 坐标口径：txt 源文件与 public/data/*.json 全部为 WGS-84（与卫星底图同口径），
// 直接存储，不做任何坐标转换。GCJ-02 转换已于静态卫星地图改造后废弃。

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '..', 'public', 'data');
const TXT_FILE = path.join(__dirname, '..', 'data', 'geo', '站点经纬度信息路径细化.txt');

// 路线键映射
const ROUTE_KEY_MAP = {
  '环线1路途径站点': 'HX1_NORMAL',
  '环线2路途径站点': 'HX2_NORMAL',
  '环线3路途径站点': 'HX3_NORMAL',
  '就餐专线途径站点': 'HX1_DINING',
};

// 路线站点序列（从 txt 文件中的站名顺序）
const ROUTE_STOP_SEQUENCES = {
  'HX1_NORMAL': ['研究生宿舍楼', '东门', '2号宿舍楼', '军体活动中心', '激光所', '超算中心', '北门', '高超楼', '理学院', '二食堂', '5号宿舍楼', '305教学楼', '研究生宿舍楼'],
  'HX2_NORMAL': ['研究生宿舍楼', '一食堂', '门诊部', '1号宿舍楼', '军体活动中心', '水上训练中心', '二食堂', '5号宿舍楼', '305教学楼', '研究生宿舍楼'],
  'HX3_NORMAL': ['研究生宿舍楼', '一食堂', '2号宿舍楼', '军体活动中心', '网球场', '激光所', '空天楼', '高超楼', '理学院', '二食堂', '图书馆', '305教学楼', '研究生宿舍楼'],
  'HX1_DINING': ['高超楼', '理学院', '二食堂', '一食堂', '305教学楼', '5号宿舍楼', '二食堂北', '理学院', '高超楼'],
};

console.log('📖 读取 txt 文件...\n');
const txtContent = fs.readFileSync(TXT_FILE, 'utf-8');
const lines = txtContent.split('\n');

const routeStops = {};
const routePaths = {};
let currentRouteKey = null;
let currentPath = [];
let currentStopIndex = 0;
let currentStopSeq = 1;

for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed) continue;

  // 检测路线标题
  if (ROUTE_KEY_MAP[trimmed]) {
    currentRouteKey = ROUTE_KEY_MAP[trimmed];
    currentPath = [];
    currentStopIndex = 0;
    currentStopSeq = 1;
    routeStops[currentRouteKey] = [];
    routePaths[currentRouteKey] = [];
    console.log('🚌 处理 ' + currentRouteKey + '...');
    continue;
  }

  if (!currentRouteKey) continue;

  // 解析坐标行
  const coordMatch = trimmed.match(/(\d+\.\d+),\s*(\d+\.\d+)/);
  if (coordMatch) {
    const lat = parseFloat(coordMatch[1]);
    const lng = parseFloat(coordMatch[2]);

    // WGS-84 坐标直接存储（path 元素为 [lng, lat]）
    routePaths[currentRouteKey].push([lng, lat]);

    // 检查是否是站点行（不以 > 开头）
    if (!trimmed.startsWith('>')) {
      // 所有可能的站名列表（按长度排序，优先匹配长名称）
      const allStationNames = [
        '研究生宿舍楼', '水上训练中心', '军体活动中心', '305教学楼', '5号宿舍楼',
        '2号宿舍楼', '1号宿舍楼', '二食堂北', '二食堂', '一食堂', '空天楼',
        '高超楼', '理学院', '激光所', '超算中心', '门诊部', '网球场', '图书馆',
        '东门', '北门', '教勤连'
      ];

      for (const stationName of allStationNames) {
        if (trimmed.startsWith(stationName)) {
          const expectedStops = ROUTE_STOP_SEQUENCES[currentRouteKey];

          if (expectedStops && currentStopIndex < expectedStops.length) {
            if (stationName === expectedStops[currentStopIndex]) {
              // 输出格式与线上数据一致：{ name, lat, lng }（顺序即站序，无冗余字段）
              routeStops[currentRouteKey].push({
                name: stationName,
                lat: lat,
                lng: lng,
              });
              console.log('  ✅ 找到站点: ' + stationName + ' (seq=' + currentStopSeq + ')');
              currentStopSeq++;
              currentStopIndex++;
            } else {
              console.log('  ⚠️  站点 ' + stationName + ' 期望 ' + expectedStops[currentStopIndex]);
            }
          }
          break;
        }
      }
    }
  }
}

// ─── 派生 HX3_GAOCHAO 的 route_stops ───
// GAOCHAO 与 HX3_NORMAL 走同一物理环（坐标复用），仅起点为高超楼。
// txt 中无其独立坐标，按 GAOCHAO 站序从 NORMAL 同名站取坐标派生。
// 已验证：线上 GAOCHAO 全部坐标与 NORMAL 同名站一致（2026-10-17 对比）。
const HX3_GAOCHAO_SEQ = ['高超楼', '理学院', '二食堂', '图书馆', '305教学楼', '研究生宿舍楼', '一食堂', '2号宿舍楼', '军体活动中心', '网球场', '激光所', '空天楼', '高超楼'];

if (routeStops['HX3_NORMAL'] && routeStops['HX3_NORMAL'].length > 0) {
  const normalByName = new Map(routeStops['HX3_NORMAL'].map(s => [s.name, s]));
  const gaochaoStops = [];
  let allFound = true;
  for (const name of HX3_GAOCHAO_SEQ) {
    const src = normalByName.get(name);
    if (!src) {
      console.log('  ⚠️  派生 HX3_GAOCHAO 失败：HX3_NORMAL 中不存在站点 ' + name);
      allFound = false;
      break;
    }
    gaochaoStops.push({ name: src.name, lat: src.lat, lng: src.lng });
  }
  if (allFound) {
    routeStops['HX3_GAOCHAO'] = gaochaoStops;
    console.log('✅ 已派生 HX3_GAOCHAO 站点（' + gaochaoStops.length + ' 站，坐标复用 HX3_NORMAL）');
  }
}

// 验证结果（含派生的 HX3_GAOCHAO）
const ALL_EXPECTED = { ...ROUTE_STOP_SEQUENCES, 'HX3_GAOCHAO': HX3_GAOCHAO_SEQ };
console.log('\n📊 验证结果：\n');
for (const [routeKey, stops] of Object.entries(routeStops)) {
  const expected = ALL_EXPECTED[routeKey];
  const actual = stops.map(s => s.name);

  console.log(routeKey + ':');
  console.log('  预期站点数: ' + expected.length + ', 实际: ' + actual.length);

  if (JSON.stringify(expected) === JSON.stringify(actual)) {
    console.log('  ✅ 站点序列正确');
  } else {
    console.log('  ❌ 站点序列不匹配');
    console.log('     预期: ' + expected.join(' → '));
    console.log('     实际: ' + actual.join(' → '));
  }
  console.log('');
}

// 保存 route_stops.json
fs.writeFileSync(
  path.join(DATA_DIR, 'route_stops.json'),
  JSON.stringify(routeStops, null, 2),
  'utf-8'
);
console.log('✅ 已保存 route_stops.json');

// 保存 route_paths.json
fs.writeFileSync(
  path.join(DATA_DIR, 'route_paths.json'),
  JSON.stringify(routePaths, null, 2),
  'utf-8'
);
console.log('✅ 已保存 route_paths.json');

// 更新 stations.json（汇总所有站点，取第一个出现的坐标）
// serviceRoutes：按 routeStops 键顺序（HX1,HX2,HX3,DINING,GAOCHAO）去重拼接，逗号无空格（与线上格式一致）
const stationsDict = {};
for (const [routeKey, stops] of Object.entries(routeStops)) {
  for (const stop of stops) {
    if (!stationsDict[stop.name]) {
      stationsDict[stop.name] = {
        name: stop.name,
        lat: stop.lat,
        lng: stop.lng,
        serviceRoutes: routeKey,
      };
    } else {
      const existing = stationsDict[stop.name].serviceRoutes.split(',');
      if (!existing.includes(routeKey)) {
        stationsDict[stop.name].serviceRoutes += ',' + routeKey;
      }
    }
  }
}

// 若 stations.json 已存在，保留线上人工校准的坐标（同名站在不同路线坐标略有差异，
// 线上值为历史人工选定），仅更新 serviceRoutes 并补充新增站点
let existingStations = [];
try {
  existingStations = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'stations.json'), 'utf-8'));
} catch { /* 首次生成，无既有文件 */ }
const existingMap = new Map(existingStations.map(s => [s.name, s]));

const stations = Object.values(stationsDict).map(s => {
  const exist = existingMap.get(s.name);
  if (exist && (exist.lat !== s.lat || exist.lng !== s.lng)) {
    console.log('  📌 ' + s.name + ' 保留线上坐标 ' + exist.lat + ',' + exist.lng + '（txt 首现为 ' + s.lat + ',' + s.lng + '）');
    return { ...s, lat: exist.lat, lng: exist.lng };
  }
  return s;
});
fs.writeFileSync(
  path.join(DATA_DIR, 'stations.json'),
  JSON.stringify(stations, null, 2),
  'utf-8'
);
console.log('✅ 已更新 stations.json（共 ' + stations.length + ' 个站点）');
