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
const { findStopIndexes, stopStateOf, nextArrivalsBySeq, recommendedPass, collectStopArrivals } = await importSrc('stop_seq.ts')
const { isCatchable } = await importSrc('plan_window.ts')
const { boardingClock, calibrationRows } = await importSrc('measurement.ts')

const readData = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8'))
const departures = readData('departures.json')
const predictions = readData('arrival_predictions.json')
const stations = readData('stations.json')
const routeStops = readData('route_stops.json')

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

console.log('\n【R. 记录页站序（真实 findStopIndexes / stopStateOf）】')
// 记录页是维护者如实测站间秒数用的工具：站序一旦错位，采到的段耗时全部作废，
// 而且错的值还会被当成实测样本参与校准。这里锁死同名站的全部站序。
const routeParams = readData('route_params.json')
const stopsOf = (key) => {
  const p = routeParams.find((x) => x.routeKey === key)
  return p ? p.stops.map((s) => s.currentStop) : []
}
const jb1Stops = stopsOf('JB1_NORMAL')
const jb2Stops = stopsOf('JB2_NORMAL')

assert('R1 JB1 军体活动中心东 出现在第 7、15 站',
  JSON.stringify(findStopIndexes(jb1Stops, '军体活动中心东')) === JSON.stringify([6, 14]),
  `(${findStopIndexes(jb1Stops, '军体活动中心东').map((i) => i + 1).join(', ')})`)
assert('R2 JB2 军体活动中心东 出现在第 4、12 站',
  JSON.stringify(findStopIndexes(jb2Stops, '军体活动中心东')) === JSON.stringify([3, 11]),
  `(${findStopIndexes(jb2Stops, '军体活动中心东').map((i) => i + 1).join(', ')})`)
assert('R3 JB1 激光所 出现在第 9、13 站（一圈两次）',
  JSON.stringify(findStopIndexes(jb1Stops, '激光所')) === JSON.stringify([8, 12]))
assert('R4 JB2 网球场 出现在第 5、11 站（一圈两次）',
  JSON.stringify(findStopIndexes(jb2Stops, '网球场')) === JSON.stringify([4, 10]))
assert('R5 起终点同名站只保留起点，终点不作上车站',
  JSON.stringify(findStopIndexes(jb1Stops, '研究生宿舍楼')) === JSON.stringify([0]),
  `(${findStopIndexes(jb1Stops, '研究生宿舍楼').map((i) => i + 1).join(', ')})`)
assert('R6 不在该路线上的站返回空数组',
  findStopIndexes(jb1Stops, '二食堂北').length === 0)

// 这条就是用户报的 bug：在回程那趟车前点「一键上车」，不能把上车站落成去程站序
assert('R7 选回程军体东(第15站)后，去程第7站不会被点亮',
  stopStateOf(14, 14, 0) === 0 && stopStateOf(6, 14, 0) === -1,
  `(第15站=${stopStateOf(14, 14, 0)}, 第7站=${stopStateOf(6, 14, 0)})`)
assert('R8 上车后只有下一站可计时，再往后都不亮',
  stopStateOf(15, 14, 0) === 1 && stopStateOf(16, 14, 0) === -1 && stopStateOf(17, 14, 0) === -1)
assert('R9 记录一段后该站转为已记录，下一站接过计时位',
  stopStateOf(15, 14, 1) === 2 && stopStateOf(16, 14, 1) === 1)
assert('R10 未上车时所有行都不亮',
  [0, 6, 14, 17].every((i) => stopStateOf(i, -1, 0) === -1))

// 端到端：从回程军体东上车，沿第 15→16→17 站记两段，段序号必须是 15/16/17 而不是 7/8/9
const boardIdxR = 14
const segs = [15, 16].map((toIdx) => ({
  from: jb1Stops[toIdx - 1],
  to: jb1Stops[toIdx],
  fromSeq: toIdx,
  toSeq: toIdx + 1,
}))
assert('R11 回程上车的段序号为 15→16→17',
  segs[0].fromSeq === 15 && segs[0].toSeq === 16 && segs[1].fromSeq === 16 && segs[1].toSeq === 17,
  `(${segs.map((s) => `${s.fromSeq}→${s.toSeq}`).join(' ')}，上车站索引 ${boardIdxR})`)

console.log('\n【T. 一键上车「下一班是哪一趟」（真实 nextArrivalsBySeq / recommendedPass）】')
// 需求（用户提出）：同一站名一圈过两次时物理位置相同，靠定位分不出面前这趟是去程还是回程；
// 但发车时刻表确定，比较「现在」与各站序的预计到站时间即可判断。
const arrivalsOf = (routeKey, name) => {
  const out = []
  for (const d of departures) {
    if (d.dateType !== 'weekday' || d.routeKey !== routeKey) continue
    for (const p of predsOf(d.recordId)) if (p.stopName === name) out.push(p)
  }
  return out
}
const passesAt = (routeKey, name, hh, mm) => {
  const idxs = findStopIndexes(stopsOf(routeKey), name)
  const ps = nextArrivalsBySeq(idxs, arrivalsOf(routeKey, name), hh * 3600 + mm * 60)
  return { ps, rec: recommendedPass(ps) }
}

// JB2 军体活动中心东：seq4（去程）、seq12（回程）
let t = passesAt('JB2_NORMAL', '军体活动中心东', 16, 30)
assert('T1 16:30 时下一班走回程 seq12（16:35），而不是去程 seq4（16:48）',
  t.rec === 11 && t.ps.find((p) => p.seq === 12).etaSeconds < t.ps.find((p) => p.seq === 4).etaSeconds,
  `(回程 ${t.ps.find((p) => p.seq === 12).etaTime} / 去程 ${t.ps.find((p) => p.seq === 4).etaTime} → 推荐 seq${t.rec + 1})`)

t = passesAt('JB2_NORMAL', '军体活动中心东', 16, 0)
assert('T2 16:00 时下一班走去程 seq4（16:08），而不是回程 seq12（16:15）',
  t.rec === 3, `(推荐 seq${t.rec + 1}，去程 ${t.ps.find((p) => p.seq === 4).etaTime})`)

t = passesAt('JB2_NORMAL', '军体活动中心东', 17, 0)
assert('T3 17:00 时又轮到去程 seq4（17:08）',
  t.rec === 3, `(推荐 seq${t.rec + 1})`)

assert('T4 推荐结果始终是「预计到站最近且未过站」的那一次',
  [0, 15, 30, 45].every((mm) => {
    const r = passesAt('JB2_NORMAL', '军体活动中心东', 16, mm)
    if (r.rec === null) return true
    const rec = r.ps.find((p) => p.idx === r.rec)
    return r.ps.every((p) => p.etaSeconds === null || p.etaSeconds < 0 || p.etaSeconds >= rec.etaSeconds)
  }))

// JB1 军体东：seq7（去程）、seq15（回程）
t = passesAt('JB1_NORMAL', '军体活动中心东', 16, 30)
assert('T5 JB1 16:30 下一班走去程 seq7', t.rec === 6, `(推荐 seq${t.rec + 1}，${t.ps.find((p) => p.seq === 7).etaTime})`)

const both = passesAt('JB2_NORMAL', '军体活动中心东', 16, 30).ps
assert('T6 两个候选都给出了到站时刻（界面可显示「第4站 16:48」这种）',
  both.length === 2 && both.every((p) => typeof p.etaTime === 'string' && p.etaSeconds !== null))
assert('T7 深夜无车时返回 null（不替用户猜，界面并列展示）',
  recommendedPass(nextArrivalsBySeq([3, 11], arrivalsOf('JB2_NORMAL', '军体活动中心东'), 23 * 3600 + 50 * 60)) === null)
assert('T8 刚过站的班次标为 passed（用于「刚过站」提示）',
  nextArrivalsBySeq([3], arrivalsOf('JB2_NORMAL', '军体活动中心东'), 16 * 3600 + 30 * 60 + 0)
    .every((p) => typeof p.passed === 'boolean'))

// ── W. 行程规划：今天已错过的班次不得推荐（真实 isCatchable） ──
// 场景来源：第四轮之后的复核发现「20:01 查 20:00 前到达」返回 108 趟全是已发出的车
console.log('\n【W. 行程规划可乘窗口（真实 isCatchable）】')
assert('W1 今天 20:01、班次 07:30 上车 → 不再推荐',
  !isCatchable(7 * 60 + 30, 20 * 3600 + 60, true))
assert('W2 今天 20:01、班次 20:30 上车 → 仍推荐',
  isCatchable(20 * 60 + 30, 20 * 3600 + 60, true))
assert('W3 今天 20:01、班次正好 20:01 上车 → 视为已过（不推荐，避免让用户追开走的车）',
  !isCatchable(20 * 60 + 1, 20 * 3600 + 60, true))
assert('W4 今天 20:01、班次 20:02 上车 → 仍推荐（还有 1 分钟）',
  isCatchable(20 * 60 + 2, 20 * 3600 + 60, true))
assert('W5 查未来日期时不受当前时间影响：早上 07:30 的班次照样推荐',
  isCatchable(7 * 60 + 30, 20 * 3600, false))
assert('W6 凌晨 00:00 查今天：当天所有班次都还没开',
  isCatchable(7 * 60 + 30, 0, true) && isCatchable(22 * 60 + 30, 0, true))

// ── X. 记录页「下一班」必须按线路过滤（真实 collectStopArrivals） ──
// 场景来源：上线前验收发现「军体活动中心东」在环线1路与接驳2路都是第 4 站，
// 不按 routeKey 过滤会拿环线1路 07:30 那班（07:33:27）判断接驳2路的方向，
// 而接驳2路真正下一班是 07:48 —— 差 15 分钟，用户会按错方向上车。
console.log('\n【X. 记录页下一班按线路过滤（真实 collectStopArrivals）】')
const jbdIdx = findStopIndexes(jb2Stops, '军体活动中心东')
const at0700 = 7 * 3600
const jb2Passes = nextArrivalsBySeq(
  jbdIdx,
  collectStopArrivals(departures, predsOf, 'JB2_NORMAL', 'weekday', '军体活动中心东'),
  at0700,
)
const hx1Passes = nextArrivalsBySeq(
  jbdIdx,
  collectStopArrivals(departures, predsOf, 'HX1_NORMAL', 'weekday', '军体活动中心东'),
  at0700,
)
const seq4 = (arr) => (arr.find((p) => p.seq === 4) || {}).etaTime
assert('X1 接驳2路 07:00 时第 4 站下一班是 07:48:00（本线路）',
  seq4(jb2Passes) === '07:48:00', `(实际 ${seq4(jb2Passes)})`)
assert('X2 环线1路 07:00 时第 4 站下一班是 07:33:27（相邻线路的另一趟，证明站序会撞车）',
  seq4(hx1Passes) === '07:33:27', `(实际 ${seq4(hx1Passes)})`)
assert('X3 两条线路的结果必须不同（若相同说明过滤失效）',
  seq4(jb2Passes) !== seq4(hx1Passes))
assert('X4 站点序列只含本线路的班次（不混入环线1路/就餐专线）',
  collectStopArrivals(departures, predsOf, 'JB2_NORMAL', 'weekday', '军体活动中心东')
    .every((p) => {
      const dep = departures.find((d) => d.recordId === p.departureId)
      return dep && dep.routeKey === 'JB2_NORMAL'
    }))

// ── Y. 复制校准文本必须用上车时刻，而不是提交时刻（真实 calibrationRows） ──
// 场景来源：10:00 上车、10:15 提交，旧实现输出 10:15，回溯班次会对应到错误的那一趟。
console.log('\n【Y. 校准文本时刻（真实 boardingClock / calibrationRows）】')
const at10 = new Date(2026, 9, 22, 10, 0, 0).getTime()
const at1015 = new Date(2026, 9, 22, 10, 15, 0).getTime()
const recFresh = {
  date: '2026-10-22', route: '接驳2路', routeKey: 'JB2_NORMAL',
  depart_time: '10:00', created_at: at1015,
  segments: [{ from: '研究生宿舍楼', to: '一食堂', seconds: 95, fromSeq: 1, toSeq: 2 }],
}
const lineFresh = calibrationRows([recFresh])[0]
assert('Y1 10:00 上车 / 10:15 提交 → 文本写 10:00',
  lineFresh.includes(' 10:00 ') && !lineFresh.includes('10:15'), `(${lineFresh})`)
assert('Y2 保留站序，便于判断同名站是哪一段',
  lineFresh.includes('研究生宿舍楼#1→一食堂#2'))
assert('Y3 历史记录没有 depart_time 时回退到提交时刻（不编造时间）',
  boardingClock({ date: '2026-10-22', route: '环线1路', created_at: at1015, segments: [] }) === '10:15')
assert('Y4 兼容 "7:30" 这类未补零的历史写法',
  boardingClock({ date: '2026-10-22', route: '环线1路', depart_time: '7:30', created_at: at1015, segments: [] }) === '07:30')
assert('Y5 历史卡片与复制文本用同一个上车时刻（不会一处一个时间）',
  boardingClock(recFresh) === '10:00' && lineFresh.includes(boardingClock(recFresh)))

console.log('\n══════════════════════════════')
console.log(`断言结果: 通过 ${pass} / 失败 ${fail} ${fail === 0 ? '✅ 全部通过（测试的就是线上实现）' : '❌ 存在失败项'}`)
process.exit(fail === 0 ? 0 : 1)
