// 核心逻辑回归：直接 import 小程序源码里的真实模块，不再复刻一份
// 用法：node scripts/test_core_logic.mjs
//
// 为什么单独一个文件（2026-10-22 第三轮外部审查风险 C）：
// `test_scenarios.cjs` 为了能在 Node 里跑，把 `findBestRide`、上车档位这些判断
// **在测试文件里抄了一遍**。一旦线上实现改了而抄件没改，就会出现「测试全绿、
// 页面照错」——这种假绿比没有测试更危险。
// Node 24 支持直接 import .ts（类型擦除），所以这里 import 真身：
//   apps/miniprogram/src/utils/{station_group,ride_rank,geo,countdown}.ts
// 被 import 的模块必须保持零运行时依赖（不能 import vue / uni / store），
// 否则 Node 侧会失败——这也是一条有用的约束，迫使核心判定保持纯函数。

// 被 import 的 .ts 所在目录没有 "type": "module"，Node 会打一条无害的
// MODULE_TYPELESS_PACKAGE_JSON 警告。这里只过滤这一条，其他警告照常输出。
const emitWarning = process.emitWarning
process.emitWarning = function (warning, ...rest) {
  const msg = typeof warning === 'string' ? warning : (warning && warning.message) || ''
  if (msg.includes('MODULE_TYPELESS_PACKAGE_JSON') || msg.includes('Reparsing as ES module')) return
  return emitWarning.call(process, warning, ...rest)
}

import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const SRC_UTILS = path.join(ROOT, 'apps/miniprogram/src/utils')

/** 导入源码里的真实模块（Node ≥22.6 的类型擦除；用 pathToFileURL 避免 Windows 盘符被当成 host） */
const importSrc = (file) => import(pathToFileURL(path.join(SRC_UTILS, file)).href)

const { toGroup, groupMembers, findBestRide } = await importSrc('station_group.ts')
const { boardTierOf, isBetterBoard, compareArrivalResults, BOARD_TIER } = await importSrc('ride_rank.ts')
const { formatWalkTimePrecise, WALK_SPEED_MPS, findNearestStops, haversineDistance } = await importSrc('geo.ts')
const { arrivalCountdown, departureCountdown } = await importSrc('countdown.ts')

const readData = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8'))
const departures = readData('departures.json')
const predictions = readData('arrival_predictions.json')
const stations = readData('stations.json')

const predsByDep = new Map()
for (const p of predictions) {
  const list = predsByDep.get(p.departureId)
  if (list) list.push(p)
  else predsByDep.set(p.departureId, [p])
}
const predsOf = (id) => (predsByDep.get(id) || []).slice().sort((a, b) => a.stopSeq - b.stopSeq)
const depOf = (routeKey, time) => departures.find((d) => d.routeKey === routeKey && d.departureTime === time)

let pass = 0
let fail = 0
function assert(name, cond, detail = '') {
  if (cond) { pass++; console.log('  ✅', name, detail) }
  else { fail++; console.log('  ❌', name, detail) }
}

console.log('\n【引入的是真实实现】')
assert('station_group.ts 导出 findBestRide', typeof findBestRide === 'function')
assert('ride_rank.ts 导出 boardTierOf', typeof boardTierOf === 'function')
assert('geo.ts 导出 formatWalkTimePrecise', typeof formatWalkTimePrecise === 'function')
assert('countdown.ts 导出 arrivalCountdown', typeof arrivalCountdown === 'function')

console.log('\n【A. 同名站多次经过（真实 findBestRide）】')
const jb2_1645 = depOf('JB2_NORMAL', '16:45')
const p1645 = predsOf(jb2_1645.recordId)

let r = findBestRide(p1645, ['军体活动中心东'], ['二食堂'])
assert('A1 军体东→二食堂 选返程 seq12→15', r && r.origin.stopSeq === 12 && r.dest.stopSeq === 15,
  `(seq${r?.origin.stopSeq} ${r?.origin.arrivalTime} → ${r?.dest.arrivalTime})`)

r = findBestRide(p1645, ['军体活动中心东', '军体活动中心南'], ['二食堂'])
assert('A3 军体(组)→二食堂 选军体南 seq13', r && r.origin.stopName === '军体活动中心南' && r.origin.stopSeq === 13,
  `(seq${r?.origin.stopSeq} 乘坐${Math.round((r?.rideMinutes ?? 0) * 60)}s)`)

r = findBestRide(p1645, ['军体活动中心东', '军体活动中心南'], ['激光所'])
assert('A4 军体(组)→激光所 选军体东 seq4', r && r.origin.stopName === '军体活动中心东' && r.origin.stopSeq === 4)

r = findBestRide(p1645, ['理学院'], ['网球场'])
assert('A5 理学院→网球场 seq9→11', r && r.origin.stopSeq === 9 && r.dest.stopSeq === 11)

const jb1First = departures.find((d) => d.routeKey === 'JB1_NORMAL')
r = findBestRide(predsOf(jb1First.recordId), ['激光所'], ['军体活动中心东'])
assert('A6 JB1 激光所→军体东 只坐 2 站', r && r.dest.stopSeq - r.origin.stopSeq === 2,
  `(seq${r?.origin.stopSeq}→seq${r?.dest.stopSeq})`)

console.log('\n【B. 站点分组（真实 toGroup / groupMembers）】')
assert('B1 军体东归入「军体活动中心」', toGroup('军体活动中心东') === '军体活动中心')
assert('B1 二食堂北归入「二食堂」', toGroup('二食堂北') === '二食堂')
assert('B1 无分组的站返回自身', toGroup('激光所') === '激光所')
assert('B2 组员展开', groupMembers('军体活动中心').length === 2 && groupMembers('激光所')[0] === '激光所')

console.log('\n【P. 上车站可行性（真实 boardTierOf / isBetterBoard）】')
// 复现 2026-10-22 修复的真实缺陷：11:25 在二食堂附近去高超楼
const now1125 = 11 * 3600 + 25 * 60
const nearStops = [{ name: '二食堂', distance: 20 }, { name: '二食堂北', distance: 45 }]
const destMembers = ['高超楼']

const picked = new Map()
const rawCands = []
for (const c of nearStops) {
  const walkSeconds = c.distance / WALK_SPEED_MPS
  for (const d of departures) {
    if (d.dateType !== 'weekday') continue
    const best = findBestRide(predsOf(d.recordId), [c.name], destMembers)
    if (!best) continue
    const secBoard = Math.round(best.origin.arrivalMinutes * 60 - now1125)
    const secDest = Math.round(best.dest.arrivalMinutes * 60 - now1125)
    if (secDest > 3600 || secBoard < -300) continue
    const tier = boardTierOf(secBoard, walkSeconds)
    rawCands.push({ dep: d.recordId, stop: c.name, secBoard, tier })
    const prev = picked.get(d.recordId)
    if (prev && !isBetterBoard({ tier, walkSeconds }, prev)) continue
    picked.set(d.recordId, { tier, walkSeconds, stop: c.name, board: best.origin.arrivalTime, dest: best.dest.arrivalTime })
  }
}

const s8 = picked.get('S0008')
assert('P1 S0008 到二食堂 11:24:37 已过站（-23s）',
  rawCands.some((x) => x.dep === 'S0008' && x.stop === '二食堂' && x.secBoard === -23))
assert('P1 选「二食堂北 11:32:12」而不是已过站的二食堂',
  s8 && s8.stop === '二食堂北' && s8.tier === BOARD_TIER.REACHABLE && s8.board === '11:32:12',
  `(${s8?.stop} ${s8?.board})`)
assert('P2 没有任何班次在「有可上车方案」时却选了已过站方案',
  [...picked.entries()].every(([id, v]) => {
    if (v.tier !== BOARD_TIER.PASSED) return true
    return !rawCands.some((x) => x.dep === id && x.tier < BOARD_TIER.PASSED)
  }))
assert('P3 档位定义：已过站 > 走不到 > 走得到',
  BOARD_TIER.PASSED > BOARD_TIER.TOO_LATE && BOARD_TIER.TOO_LATE > BOARD_TIER.REACHABLE)
assert('P4 同档优先近站（走 10s 优于走 60s）',
  isBetterBoard({ tier: 0, walkSeconds: 10 }, { tier: 0, walkSeconds: 60 }))
assert('P5 档位优先于距离（远一点但能上车 优于 近但已过站）',
  isBetterBoard({ tier: 0, walkSeconds: 200 }, { tier: 2, walkSeconds: 5 }))

console.log('\n【S. 结果排序（真实 compareArrivalResults）】')
const sorted = [
  { boardTier: 2, destMinutes: 700 },
  { boardTier: 0, destMinutes: 800 },
  { boardTier: 1, destMinutes: 750 },
  { boardTier: 0, destMinutes: 720 },
].sort(compareArrivalResults)
assert('S1 可上车的排最前，且同档按到达时间升序',
  sorted[0].destMinutes === 720 && sorted[1].destMinutes === 800 &&
  sorted[2].boardTier === 1 && sorted[3].boardTier === 2,
  `(${sorted.map((x) => `${x.boardTier}:${x.destMinutes}`).join(' → ')})`)

console.log('\n【U. 步行时间（真实 formatWalkTimePrecise）】')
assert('U1 135m → 「步行约1分44秒」（申请材料截图里的数值）',
  formatWalkTimePrecise(135 / WALK_SPEED_MPS) === '步行约1分44秒',
  `(${formatWalkTimePrecise(135 / WALK_SPEED_MPS)})`)
assert('U2 14m → 秒级', /^步行约\d+秒$/.test(formatWalkTimePrecise(14 / WALK_SPEED_MPS)),
  `(${formatWalkTimePrecise(14 / WALK_SPEED_MPS)})`)

console.log('\n【C. 倒计时边界（真实 arrivalCountdown / departureCountdown）】')
assert('C1 已过站 -301s → 状态 passed 且文案为空（列表移除）',
  arrivalCountdown(-301).status === 'passed' && arrivalCountdown(-301).label === '')
assert('C2 已过站 -100s → 仍显示「已过站」（保留 5 分钟窗）',
  arrivalCountdown(-100).status === 'passed' && arrivalCountdown(-100).label === '已过站')
assert('C3 0~15s → 「已到站」', arrivalCountdown(10).label === '已到站' && arrivalCountdown(10).status === 'arrived')
assert('C4 16s → 显示剩余秒数', arrivalCountdown(16).label === '16秒后到站')
assert('C5 <2 分钟为 urgent，2-5 分钟为 warning',
  arrivalCountdown(119).status === 'urgent' && arrivalCountdown(200).status === 'warning')
assert('C6 发车 -301s 移除、-100s 显示「已发车」、0~15s 「发车中」',
  departureCountdown(-301).label === '' && departureCountdown(-100).label === '已发车' &&
  departureCountdown(10).label === '发车中')

console.log('\n【N. 就近站点（真实 findNearestStops）】')
const guan = stations.find((s) => s.name === '研究生宿舍楼')
const near = findNearestStops(guan.lat, guan.lng, stations, 3, 200)
assert('N1 以研究生宿舍楼坐标查 200m 内站点，最近的必然是自己',
  near.length > 0 && near[0].station.name === '研究生宿舍楼' && near[0].distance < 1,
  `(${near[0]?.station.name} ${near[0]?.distance.toFixed(2)}m)`)
const far = findNearestStops(guan.lat + 0.1, guan.lng + 0.1, stations, 3, 200)
assert('N2 距校园约 14km 时 200m 内无站（校园服务半径逻辑的前提）',
  far.length === 0 && haversineDistance(guan.lat, guan.lng, guan.lat + 0.1, guan.lng + 0.1) > 10000)

console.log('\n══════════════════════════════')
console.log(`断言结果: 通过 ${pass} / 失败 ${fail} ${fail === 0 ? '✅ 全部通过（测试的就是线上实现）' : '❌ 存在失败项'}`)
process.exit(fail === 0 ? 0 : 1)
