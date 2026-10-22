// 坐标系一致性回归
// 用法：node scripts/check_coord.js
//
// 为什么需要这个脚本（2026-10-22 第三轮外部审查提出）：
// `selfCheck()` 只验证「转换后偏移落在 550-800m」，这**无法区分一次转换和两次转换**——
// 把 GCJ-02 数据当 WGS-84 再转一次，偏移同样是约 672m，正好落在合理区间内，
// 于是双重转换可以一路静默通过。要抓住它，必须比对**绝对坐标快照**，
// 而不是比对偏移量。
//
// 本脚本做四件事：
//   1. 算法自检（偏移区间）
//   2. 冻结锚点快照：几个校园点的转换结果必须逐位一致（纯函数校验，不依赖数据文件）
//   3. 全量一致性：public/data 每一对坐标转换后必须与 apps/miniprogram/src/data 完全相等
//      （这同时能抓住「有人把 WGS 坐标直接粘进小程序目录」和「双重转换」）
//   4. 双重转换反例：确认它能被本脚本识别，避免日后有人放宽判断

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { wgs84ToGcj02, haversineDistance, selfCheck } from './lib/coord.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const SRC = path.join(ROOT, 'public', 'data')
const DEST = path.join(ROOT, 'apps', 'miniprogram', 'src', 'data')

/** 与 sync_miniprogram_data.js 的 round6 保持一致：同步写文件时保留 6 位小数 */
const round6 = (v) => Math.round(v * 1e6) / 1e6

/**
 * 冻结锚点：输入 WGS-84 → 期望的 GCJ-02 输出（6 位小数）
 *
 * 这些值经第三方用独立实现的 WGS-84→GCJ-02 公式复核过（370 个坐标点全部一致），
 * 所以可以作为「不依赖本仓库数据文件」的绝对基准。
 * 若算法被改动、或有人误把 GCJ 当 WGS 输入，快照会立刻失配。
 */
const ANCHORS = [
  { name: '研究生宿舍楼', wgs: [113.045661, 28.257994], gcj: [113.051463, 28.254769] },
  { name: '校园东门附近', wgs: [113.054, 28.249], gcj: [113.059823, 28.245792] },
  { name: '校园西北角', wgs: [113.04, 28.265], gcj: [113.045787, 28.261762] },
  { name: '校园东北角', wgs: [113.0605, 28.2605], gcj: [113.066339, 28.257304] },
]

/** 含坐标的数据文件（必须与 sync_miniprogram_data.js 的 COORD_FILES 一致） */
const COORD_FILES = ['stations.json', 'route_stops.json', 'route_paths.json']

let pass = 0
let fail = 0
function assert(name, cond, detail = '') {
  if (cond) { pass++; console.log('  ✅', name, detail) }
  else { fail++; console.log('  ❌', name, detail) }
}

console.log('\n【1. 算法自检】')
const offset = selfCheck()
assert('偏移量落在长沙地区区间（550-800m）', offset > 550 && offset < 800, `(${offset.toFixed(1)}m)`)

console.log('\n【2. 冻结锚点快照（绝对坐标，能区分一次/二次转换）】')
for (const a of ANCHORS) {
  const [gLng, gLat] = wgs84ToGcj02(a.wgs[0], a.wgs[1])
  const okLng = round6(gLng) === a.gcj[0]
  const okLat = round6(gLat) === a.gcj[1]
  assert(`${a.name} 转换结果与冻结快照一致`, okLng && okLat,
    okLng && okLat ? `([${round6(gLng)}, ${round6(gLat)}])`
      : `(实际 [${round6(gLng)}, ${round6(gLat)}] ≠ 期望 [${a.gcj[0]}, ${a.gcj[1]}])`)
}

console.log('\n【3. 全量坐标一致性（源 → 小程序运行时数据）】')
let checked = 0
let mismatch = 0
const samples = []

/** 递归比对：数组 [lng,lat] 与 {lat,lng} 两种形态都要覆盖 */
function compareNode(node, srcNode, trail, file) {
  if (Array.isArray(srcNode)) {
    if (srcNode.length === 2 && srcNode.every((v) => typeof v === 'number')) {
      const [gLng, gLat] = wgs84ToGcj02(srcNode[0], srcNode[1])
      checked++
      const ok = node?.[0] === round6(gLng) && node?.[1] === round6(gLat)
      if (!ok) {
        mismatch++
        if (samples.length < 5) samples.push(`${file}${trail}: 实际 [${node?.[0]}, ${node?.[1]}]，应为 [${round6(gLng)}, ${round6(gLat)}]`)
      }
      return
    }
    srcNode.forEach((child, i) => compareNode(node?.[i], child, `${trail}[${i}]`, file))
    return
  }
  if (srcNode && typeof srcNode === 'object') {
    for (const key of Object.keys(srcNode)) {
      if (key === 'lat' || key === 'lng') continue
      compareNode(node?.[key], srcNode[key], `${trail}.${key}`, file)
    }
    // 对象形态的坐标：按 lat/lng 字段比对
    if (typeof srcNode.lat === 'number' && typeof srcNode.lng === 'number') {
      const [gLng, gLat] = wgs84ToGcj02(srcNode.lng, srcNode.lat)
      checked++
      const ok = node?.lng === round6(gLng) && node?.lat === round6(gLat)
      if (!ok) {
        mismatch++
        if (samples.length < 5) samples.push(`${file}${trail}: 实际 (${node?.lng}, ${node?.lat})，应为 (${round6(gLng)}, ${round6(gLat)})`)
      }
    }
  }
}

for (const f of COORD_FILES) {
  const srcPath = path.join(SRC, f)
  const dstPath = path.join(DEST, f)
  if (!fs.existsSync(srcPath) || !fs.existsSync(dstPath)) {
    assert(`${f} 两端都存在`, false, `(缺 ${!fs.existsSync(srcPath) ? srcPath : dstPath})`)
    continue
  }
  compareNode(JSON.parse(fs.readFileSync(dstPath, 'utf8')), JSON.parse(fs.readFileSync(srcPath, 'utf8')), '', f)
}

assert(`全部 ${checked} 个坐标与转换结果一致`, mismatch === 0,
  mismatch === 0 ? '' : `(不符 ${mismatch} 个)\n     ${samples.join('\n     ')}`)
assert('比对点数不为 0（防止比对逻辑本身失效）', checked > 300, `(${checked} 个)`)

console.log('\n【4. 双重转换必须可被识别】')
// 把 GCJ 结果当 WGS 再转一次：偏移同为约 672m，正是「单看偏移量抓不住」的原因
const a0 = ANCHORS[0]
const [once1, once2] = wgs84ToGcj02(a0.wgs[0], a0.wgs[1])
const [twice1, twice2] = wgs84ToGcj02(once1, once2)
const doubleOffset = haversineDistance(once2, once1, twice2, twice1)
assert('二次转换的偏移同样在 550-800m（说明只看偏移量无法区分）',
  doubleOffset > 550 && doubleOffset < 800, `(${doubleOffset.toFixed(1)}m)`)
assert('二次转换结果 ≠ 正确结果（快照能区分）',
  round6(twice1) !== a0.gcj[0] || round6(twice2) !== a0.gcj[1],
  `(二次 [${round6(twice1)}, ${round6(twice2)}])`)

// 运行时数据不能等于二次转换的结果
const miniStations = JSON.parse(fs.readFileSync(path.join(DEST, 'stations.json'), 'utf8'))
const hit = miniStations.find(
  (s) => typeof s.lat === 'number' && round6(twice1) === s.lng && round6(twice2) === s.lat,
)
assert('运行时数据不是二次转换的产物', !hit, hit ? `(${hit.name} 命中二次转换值)` : '')

console.log('\n══════════════════════════════')
console.log(`断言结果: 通过 ${pass} / 失败 ${fail} ${fail === 0 ? '✅ 全部通过' : '❌ 存在失败项'}`)
process.exit(fail === 0 ? 0 : 1)
