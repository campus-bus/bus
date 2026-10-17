// ⚠️ 已归档：一次性历史修复脚本，对应问题已修复完毕，仅供历史参考，请勿直接运行。
// 向 stations.json 添加缺失的站点（系统楼和网球场）

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '..', 'public', 'data');

// 读取 stations.json
const stations = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'stations.json'), 'utf-8'));

// 检查是否已有这两个站点
const existingNames = stations.map(s => s.name);
const toAdd = [];

if (!existingNames.includes('系统楼')) {
  toAdd.push({
    name: '系统楼',
    serviceRoutes: '环线1路、就餐专线、环线3路',
    locationNote: '系统工程学院所在地',
    remark: '高超楼发车的起点站',
    lat: 28.267581,
    lng: 113.042358
  });
}

if (!existingNames.includes('网球场')) {
  toAdd.push({
    name: '网球场',
    serviceRoutes: '环线3路',
    locationNote: '',
    remark: '',
    lat: 28.26236,
    lng: 113.048475
  });
}

if (toAdd.length > 0) {
  console.log('📍 添加缺失的站点：');
  toAdd.forEach(s => {
    console.log('  - ' + s.name + ': lat=' + s.lat + ', lng=' + s.lng);
    stations.push(s);
  });

  // 保存更新后的 stations.json
  fs.writeFileSync(
    path.join(DATA_DIR, 'stations.json'),
    JSON.stringify(stations, null, 2),
    'utf-8'
  );

  console.log('\n✅ 已保存更新后的 stations.json（共 ' + stations.length + ' 个站点）');
} else {
  console.log('✅ 系统楼和网球场已存在，无需添加');
}
