// ⚠️ 已归档：一次性历史修复脚本，对应问题已修复完毕，仅供历史参考，请勿直接运行。
// 修正 route_params.json 中的站点名称和序列
// 根据 txt 源文件的权威数据

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'public', 'data');

const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'route_params.json'), 'utf-8'));

// === HX1_NORMAL: 第8站 高超楼 → 系统楼 ===
const hx1n = data.find(d => d.routeKey === 'HX1_NORMAL');
if (hx1n) {
  // 第8站 (stopSeq=8)
  const stop8 = hx1n.stops.find(s => s.stopSeq === 8);
  if (stop8 && stop8.currentStop === '高超楼') {
    stop8.currentStop = '系统楼';
    console.log('✅ HX1_NORMAL: 第8站 高超楼 → 系统楼');
  }
  // 第9站 prevStop
  const stop9 = hx1n.stops.find(s => s.stopSeq === 9);
  if (stop9 && stop9.prevStop === '高超楼') {
    stop9.prevStop = '系统楼';
    console.log('✅ HX1_NORMAL: 第9站 prevStop 高超楼 → 系统楼');
  }
}

// === HX1_DINING: 高超楼 → 系统楼（全部替换）===
const hx1d = data.find(d => d.routeKey === 'HX1_DINING');
if (hx1d) {
  hx1d.patternName = '环线1路就餐专线（系统楼发车）';
  hx1d.departureStation = '系统楼';
  for (const stop of hx1d.stops) {
    if (stop.prevStop === '高超楼') stop.prevStop = '系统楼';
    if (stop.currentStop === '高超楼') stop.currentStop = '系统楼';
  }
  console.log('✅ HX1_DINING: 所有 高超楼 → 系统楼');
}

// === HX3_NORMAL: 教勤连 → 网球场，插入系统楼 ===
const hx3n = data.find(d => d.routeKey === 'HX3_NORMAL');
if (hx3n) {
  // 第5站 教勤连 → 网球场
  const stop5 = hx3n.stops.find(s => s.stopSeq === 5);
  if (stop5 && stop5.currentStop === '教勤连') {
    stop5.prevStop = '军体活动中心';
    stop5.currentStop = '网球场';
    stop5.routeStopKey = 'HX3_NORMAL|5';
    console.log('✅ HX3_NORMAL: 第5站 教勤连 → 网球场');
  }

  // 第6站 prevStop 教勤连 → 网球场
  const stop6 = hx3n.stops.find(s => s.stopSeq === 6);
  if (stop6 && stop6.prevStop === '教勤连') {
    stop6.prevStop = '网球场';
    console.log('✅ HX3_NORMAL: 第6站 prevStop 教勤连 → 网球场');
  }

  // 插入系统楼站点在高超楼和理学院之间（当前第7站高超楼后插入新第8站系统楼）
  const stop7 = hx3n.stops.find(s => s.stopSeq === 7);
  const stop8_old = hx3n.stops.find(s => s.stopSeq === 8);

  if (stop7 && stop7.currentStop === '高超楼' && stop8_old && stop8_old.currentStop === '理学院') {
    // 插入系统楼
    const systemStop = {
      routeStopKey: 'HX3_NORMAL|8',
      routeKey: 'HX3_NORMAL',
      stopSeq: 8,
      prevStop: '高超楼',
      currentStop: '系统楼',
      distanceKm: 0.2,
      baseSegmentSeconds: 35,
      manualSegmentSeconds: null,
      finalSegmentSeconds: 35,
      cumulativeSeconds: stop7.cumulativeSeconds + 35,
      isDepartureStop: false,
      isReturnStop: false,
    };

    // 重新编号后续站点（从stopSeq 8开始）
    const newStops = [];
    for (const s of hx3n.stops) {
      if (s.stopSeq === 8) {
        // 在理学院之前插入系统楼
        newStops.push(systemStop);
        console.log('✅ HX3_NORMAL: 在高超楼和理学院之间插入系统楼');
      }
      if (s.stopSeq >= 8) {
        s.stopSeq += 1;
        s.routeStopKey = `HX3_NORMAL|${s.stopSeq}`;
      }
      newStops.push(s);
    }

    // 检查是否需要在末尾插入（如果理学院是最后一个）
    if (!newStops.find(s => s.currentStop === '系统楼')) {
      newStops.push(systemStop);
    }

    hx3n.stops = newStops;
    hx3n.stopCount = newStops.length;
    console.log('✅ HX3_NORMAL: 站点总数更新为 ' + newStops.length);
  }

  // 验证最终序列
  const seq = hx3n.stops.map(s => s.currentStop).join(' → ');
  console.log('   HX3_NORMAL 最终序列: ' + seq);
}

// === HX3_GAOCHAO: 修正 departureStation 和站点序列 ===
const hx3g = data.find(d => d.routeKey === 'HX3_GAOCHAO');
if (hx3g) {
  // 修正 departureStation
  hx3g.departureStation = '系统楼';
  hx3g.patternName = '环线3路系统楼发车路线';

  // 按照 CLAUDE.md 定义的 HX3_GAOCHAO 站点序列重建
  // 系统楼→理学院→二食堂→图书馆→305教学楼→研究生宿舍楼→一食堂→2号宿舍楼→军体活动中心→网球场→激光所→系统楼
  const gaochaoStops = [
    { name: '系统楼', isDeparture: true, isReturn: false },
    { name: '理学院', isDeparture: false, isReturn: false },
    { name: '二食堂', isDeparture: false, isReturn: false },
    { name: '图书馆', isDeparture: false, isReturn: false },
    { name: '305教学楼', isDeparture: false, isReturn: false },
    { name: '研究生宿舍楼', isDeparture: false, isReturn: false },
    { name: '一食堂', isDeparture: false, isReturn: false },
    { name: '2号宿舍楼', isDeparture: false, isReturn: false },
    { name: '军体活动中心', isDeparture: false, isReturn: false },
    { name: '网球场', isDeparture: false, isReturn: false },
    { name: '激光所', isDeparture: false, isReturn: false },
    { name: '系统楼', isDeparture: false, isReturn: true },
  ];

  // 从 HX3_NORMAL 中获取站间时间参考
  const hx3nStops = hx3n ? hx3n.stops : [];

  hx3g.stops = gaochaoStops.map((s, i) => {
    const segSec = i === 0 ? 0 : 80; // 默认站间80秒，后续可根据实测校准
    const cumSec = i === 0 ? 0 : (hx3g.stops[i - 1]?.cumulativeSeconds || 0) + segSec;

    return {
      routeStopKey: `HX3_GAOCHAO|${i + 1}`,
      routeKey: 'HX3_GAOCHAO',
      stopSeq: i + 1,
      prevStop: i === 0 ? '系统楼' : gaochaoStops[i - 1].name,
      currentStop: s.name,
      distanceKm: i === 0 ? 0 : 0.3,
      baseSegmentSeconds: segSec,
      manualSegmentSeconds: null,
      finalSegmentSeconds: segSec,
      cumulativeSeconds: 0,
      isDepartureStop: s.isDeparture,
      isReturnStop: s.isReturn,
    };
  });

  // 计算累积秒数
  let cum = 0;
  for (const s of hx3g.stops) {
    s.cumulativeSeconds = cum;
    cum += s.baseSegmentSeconds;
  }
  hx3g.totalSeconds = cum;
  hx3g.stopCount = hx3g.stops.length;

  console.log('✅ HX3_GAOCHAO: 站点序列完全重建');
  console.log('   ' + hx3g.stops.map(s => s.currentStop).join(' → '));
}

// 保存修正后的文件
fs.writeFileSync(
  path.join(DATA_DIR, 'route_params.json'),
  JSON.stringify(data, null, 2),
  'utf-8'
);

console.log('\n✅ 已保存修正后的 route_params.json');

// 验证所有路线
console.log('\n📊 验证所有路线站点序列：\n');
for (const route of data) {
  const seq = route.stops.map(s => s.currentStop).join(' → ');
  console.log(route.routeKey + ':');
  console.log('  ' + seq);
  console.log('');
}
