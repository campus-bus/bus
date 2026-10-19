// 同步 H5 运行时数据到小程序工程
// 用法：node scripts/sync_miniprogram_data.js
// 每次 public/data 变更（时刻表/路线/预测重新生成）后运行，保持两端数据同源
//
// 坐标系（重要）：
//   public/data/            → WGS-84（H5 卫星底图、浏览器 GPS 均为 WGS-84）
//   apps/miniprogram/src/data → GCJ-02（腾讯 <map>、微信定位、腾讯 LBS 均为 GCJ-02）
// 两者在这里做一次性转换，小程序运行期因此完全不需要再转换坐标。
// 若新增含坐标的数据文件，必须加进 COORD_FILES，否则会漏转（表现为整体偏移约 670m）。

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { wgs84ToGcj02, selfCheck } from './lib/coord.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const SRC = path.join(__dirname, '..', 'public', 'data')
// 输出到 src/data/（import 同步加载，无需网络请求，启动即读）
const DEST = path.join(__dirname, '..', 'apps', 'miniprogram', 'src', 'data')

// 需要同步的数据文件（satellite 底图不需要——小程序用腾讯 map 组件）
const FILES = [
  'departures.json',
  'route_params.json',
  'route_stops.json',
  'route_paths.json',
  'stations.json',
  'arrival_predictions.json',
]

// 含经纬度的文件：同步时 WGS-84 → GCJ-02
const COORD_FILES = new Set(['stations.json', 'route_stops.json', 'route_paths.json'])

/** 保留 6 位小数（约 0.1m），与原数据精度一致，避免体积膨胀 */
const round6 = (v) => Math.round(v * 1e6) / 1e6

/**
 * 递归转换坐标
 * - `[lng, lat]` 数字对（route_paths 的折线点）→ 转成 [lng, lat]
 * - 含 `lat`/`lng` 字段的对象（stations / route_stops）→ 转换这两个字段
 */
function convertCoords(node) {
  if (Array.isArray(node)) {
    if (node.length === 2 && node.every((v) => typeof v === 'number')) {
      const [lng, lat] = wgs84ToGcj02(node[0], node[1])
      return [round6(lng), round6(lat)]
    }
    return node.map(convertCoords)
  }
  if (node && typeof node === 'object') {
    const out = {}
    for (const key of Object.keys(node)) out[key] = convertCoords(node[key])
    if (typeof node.lat === 'number' && typeof node.lng === 'number') {
      const [lng, lat] = wgs84ToGcj02(node.lng, node.lat)
      out.lng = round6(lng)
      out.lat = round6(lat)
    }
    return out
  }
  return node
}

// 转换算法自检：偏移量偏离长沙地区预期值时直接中止，避免批量产出错数据
const offsetM = selfCheck()

fs.mkdirSync(DEST, { recursive: true })

let totalKB = 0
for (const f of FILES) {
  const src = path.join(SRC, f)
  const dst = path.join(DEST, f)
  // 压缩写入（去空白），控制小程序主包体积；源文件保持 pretty-print 便于 git diff
  let data = JSON.parse(fs.readFileSync(src, 'utf-8'))
  if (COORD_FILES.has(f)) data = convertCoords(data)
  fs.writeFileSync(dst, JSON.stringify(data))
  const kb = Math.round(fs.statSync(dst).size / 1024)
  totalKB += kb
  const tag = COORD_FILES.has(f) ? '（WGS-84→GCJ-02）' : ''
  console.log(`✅ ${f} → apps/miniprogram/src/data/（${kb}KB，已压缩${tag}）`)
}

console.log(`\n共同步 ${FILES.length} 个文件，${totalKB}KB（小程序包内数据）`)
console.log(`📐 坐标系：public/data 为 WGS-84；小程序 src/data 已转为 GCJ-02（自检偏移 ${offsetM.toFixed(1)}m）`)
