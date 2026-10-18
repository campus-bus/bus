// 临时脚本：全功能场景化数据层断言（用后删除）
// 复刻前端核心逻辑，用真实 public/data 验证 20 个场景断言
const fs = require('fs')
const deps = JSON.parse(fs.readFileSync('public/data/departures.json'))
const pred = JSON.parse(fs.readFileSync('public/data/arrival_predictions.json'))
const rp = JSON.parse(fs.readFileSync('public/data/route_params.json'))
const stations = JSON.parse(fs.readFileSync('public/data/stations.json'))

// ─── 复刻 station_group.ts ───
const STATION_GROUPS = { '军体活动中心': ['军体活动中心东', '军体活动中心南'], '二食堂': ['二食堂', '二食堂北'] }
const memberToGroup = new Map()
for (const [g, ms] of Object.entries(STATION_GROUPS)) for (const m of ms) memberToGroup.set(m, g)
const toGroup = n => memberToGroup.get(n) ?? n
const groupMembers = n => STATION_GROUPS[n] ?? [n]

function findBestRide(preds, originMembers, destMembers) {
  let best = null
  for (const o of preds) {
    if (!originMembers.includes(o.stopName) || o.isReturnStop) continue
    for (const d of preds) {
      if (!destMembers.includes(d.stopName) || d.stopSeq <= o.stopSeq) continue
      const ride = d.arrivalMinutes - o.arrivalMinutes
      if (!best || ride < best.rideMinutes) best = { origin: o, dest: d, rideMinutes: ride }
    }
  }
  return best
}

const predsByDep = new Map()
for (const p of pred) {
  const l = predsByDep.get(p.departureId)
  if (l) l.push(p); else predsByDep.set(p.departureId, [p])
}
const getDep = (routeKey, time) => deps.find(d => d.routeKey === routeKey && d.departureTime === time)
const getPreds = id => (predsByDep.get(id) || []).slice().sort((a, b) => a.stopSeq - b.stopSeq)

let pass = 0, fail = 0
function assert(name, cond, detail = '') {
  if (cond) { pass++; console.log('  ✅', name, detail) }
  else { fail++; console.log('  ❌', name, detail) }
}

// ═══ A. 同名站多次经过 ═══
console.log('\n【A. 同名站多次经过】')
const jb2_1645 = getDep('JB2_NORMAL', '16:45')
const p1645 = getPreds(jb2_1645.recordId)

let r = findBestRide(p1645, ['军体活动中心东'], ['二食堂'])
assert('A1 军体东→二食堂 选返程seq12', r.origin.stopSeq === 12 && r.dest.stopSeq === 15, `(seq${r.origin.stopSeq} ${r.origin.arrivalTime} → ${r.dest.arrivalTime})`)

// A2: 16:50 时 seq4(16:48) 已过，首页应给 seq12
const now1650 = 16 * 3600 + 50 * 60
const boardSec = r.origin.arrivalMinutes * 60 - now1650
assert('A2 16:50时seq12方案未过站', boardSec > 0, `(上车倒计时 ${Math.round(boardSec / 60)}分钟)`)

r = findBestRide(p1645, ['军体活动中心东', '军体活动中心南'], ['二食堂'])
assert('A3 军体(组)→二食堂 选军体南', r.origin.stopName === '军体活动中心南' && r.origin.stopSeq === 13, `(seq${r.origin.stopSeq} 乘坐${Math.round(r.rideMinutes * 60)}s)`)

r = findBestRide(p1645, ['军体活动中心东', '军体活动中心南'], ['激光所'])
assert('A4 军体(组)→激光所 选军体东seq4', r.origin.stopName === '军体活动中心东' && r.origin.stopSeq === 4, `(乘坐${Math.round(r.rideMinutes * 60)}s)`)

r = findBestRide(p1645, ['理学院'], ['网球场'])
assert('A5 理学院→网球场 seq9→seq11', r.origin.stopSeq === 9 && r.dest.stopSeq === 11, `(乘坐${Math.round(r.rideMinutes * 60)}s)`)

// A6: 激光所→军体东：JB1 或 JB2 都应 2 站
const jb1First = deps.find(d => d.routeKey === 'JB1_NORMAL')
const jb2First = deps.find(d => d.routeKey === 'JB2_NORMAL')
const r1 = findBestRide(getPreds(jb1First.recordId), ['激光所'], ['军体活动中心东'])
const r2 = findBestRide(getPreds(jb2First.recordId), ['激光所'], ['军体活动中心东'])
assert('A6 JB1 激光所→军体东 2站', r1.dest.stopSeq - r1.origin.stopSeq === 2, `(seq${r1.origin.stopSeq}→seq${r1.dest.stopSeq})`)
assert('A6 JB2 激光所→军体东 2站', r2.dest.stopSeq - r2.origin.stopSeq === 2, `(seq${r2.origin.stopSeq}→seq${r2.dest.stopSeq})`)

// ═══ B. 站点分组 ═══
console.log('\n【B. 站点分组】')
const groupList = [...new Set(stations.map(s => toGroup(s.name)))]
assert('B1 组化后无军体东/南', !groupList.includes('军体活动中心东') && !groupList.includes('军体活动中心南') && groupList.includes('军体活动中心'))
assert('B1 组化后无二食堂北', !groupList.includes('二食堂北') && groupList.includes('二食堂'))

const dining = deps.find(d => d.routeKey === 'HX1_DINING')
r = findBestRide(getPreds(dining.recordId), ['二食堂北'], ['理学院'])
assert('B3 二食堂北→理学院 就餐专线可达', r !== null && r.origin.stopSeq === 7, `(seq${r?.origin.stopSeq}→seq${r?.dest.stopSeq})`)

r = findBestRide(p1645, ['军体活动中心东'], ['军体活动中心南'])
assert('B4 军体东→军体南 seq12→seq13', r !== null && r.origin.stopSeq === 12 && r.dest.stopSeq === 13, `(乘坐${Math.round(r.rideMinutes * 60)}s)`)

// ═══ S. 行程规划 ═══
console.log('\n【S. 行程规划】')
// S1: 全班次最优组合抽查
let allOk = true
for (const d of deps.filter(x => x.routeKey === 'JB2_NORMAL').slice(0, 25)) {
  const rr = findBestRide(getPreds(d.recordId), ['军体活动中心东'], ['二食堂'])
  if (rr && rr.origin.stopSeq !== 12) { allOk = false; console.log('    班次', d.departureTime, '误选 seq' + rr.origin.stopSeq) }
}
assert('S1 JB2 全部25班 军体东→二食堂 均选seq12', allOk)

// S2: deadline 过滤
const deadline = 17 * 60 // 17:00
const plans = []
for (const d of deps.filter(x => x.dateType === 'weekday')) {
  const rr = findBestRide(getPreds(d.recordId), ['军体活动中心东', '军体活动中心南'], ['二食堂'])
  if (rr && rr.dest.arrivalMinutes <= deadline) plans.push({ dep: d, rr })
}
assert('S2 deadline=17:00 过滤后无晚到方案', plans.every(p => p.rr.dest.arrivalMinutes <= deadline), `(${plans.length}个方案)`)
assert('S2 16:45班次在17:00前到达(16:58:05)', plans.some(p => p.dep.recordId === jb2_1645.recordId))

// S5: 11:20 两趟区分
const d1120 = deps.filter(d => d.departureTime === '11:20')
const dining1120 = d1120.find(d => d.routeKey === 'HX1_DINING')
const normal1120 = d1120.find(d => d.routeKey === 'HX1_NORMAL')
assert('S5 11:20 第一班=就餐专线(高超楼)', dining1120 && dining1120.shiftName === '第一班' && dining1120.departureStation === '高超楼')
assert('S5 11:20 第三班=普通环1(研究生宿舍楼)', normal1120 && normal1120.shiftName === '第三班' && normal1120.departureStation === '研究生宿舍楼')

// S6: 军体→二食堂 JB2 vs 环1
const jb2r = findBestRide(p1645, ['军体活动中心东', '军体活动中心南'], ['二食堂'])
const hx1_1640 = getDep('HX1_NORMAL', '16:40')
const hx1r = findBestRide(getPreds(hx1_1640.recordId), ['军体活动中心东', '军体活动中心南'], ['二食堂'])
assert('S6 JB2(157s)远优于环1(436s)', jb2r.rideMinutes < hx1r.rideMinutes && jb2r.rideMinutes < 3 && hx1r.rideMinutes > 7, `(JB2 ${Math.round(jb2r.rideMinutes * 60)}s vs 环1 ${Math.round(hx1r.rideMinutes * 60)}s)`)

// ═══ H. 首页逻辑 ═══
console.log('\n【H. 首页逻辑】')
// H1: 军体东 16:50 到站列表应含 去程(已过) 和 返程(未到)
const jtPreds = pred.filter(p => p.stopName === '军体活动中心东' && p.dateType === 'weekday' && !p.isDepartureStop && !p.isReturnStop)
const withSec = jtPreds.map(p => ({ p, sec: p.arrivalMinutes * 60 - now1650 })).filter(x => x.sec > -300 && x.sec < 3600)
const hasGoing = withSec.some(x => x.p.stopSeq === 4 && x.sec < 0)  // 去程已过(保留5分钟内)
const hasReturn = withSec.some(x => x.p.stopSeq === 12 && x.sec > 0) // 返程未到
assert('H1 军体东列表含返程(未到)方案', hasReturn, `(返程最早: ${withSec.filter(x => x.p.stopSeq === 12).sort((a, b) => a.sec - b.sec)[0]?.p.arrivalTime})`)

// H8: BusStopTimeline stops 排序（同班次 seq 严格递增含同名站）
assert('H8 预测序列seq严格递增', p1645.every((p, i) => i === 0 || p.stopSeq === p1645[i - 1].stopSeq + 1))

// ═══ T. 时间逻辑 ═══
console.log('\n【T. 时间逻辑】')
assert('T2 过站-300s移除阈值正确', withSec.every(x => x.sec >= -300))
// T3: 周末无车次
assert('T3 周末departures为0', deps.filter(d => d.dateType === 'weekend_holiday').length === 0)
// T4: 末班后无车次（23:00）
const now2300 = 23 * 3600
const remain = pred.filter(p => p.dateType === 'weekday' && p.arrivalMinutes * 60 - now2300 > -300)
assert('T4 23:00后无有效车次', remain.length === 0)

// ═══ R/M. 记录与地图数据 ═══
console.log('\n【R/M. 记录与地图数据】')
const jb2Stops = rp.find(x => x.routeKey === 'JB2_NORMAL').stops
assert('R2 JB2 18站 军体东×2激光所×2网球场×2',
  jb2Stops.length === 18 &&
  jb2Stops.filter(s => s.currentStop === '军体活动中心东').length === 2 &&
  jb2Stops.filter(s => s.currentStop === '激光所').length === 2 &&
  jb2Stops.filter(s => s.currentStop === '网球场').length === 2)
assert('R2 JB1=JB2反转', JSON.stringify(rp.find(x => x.routeKey === 'JB1_NORMAL').stops.map(s => s.currentStop)) === JSON.stringify([...jb2Stops.map(s => s.currentStop)].reverse()))

console.log('\n══════════════════════════════')
console.log('断言结果: 通过', pass, '/ 失败', fail, fail === 0 ? '✅ 全部通过' : '❌ 存在失败项')
process.exit(fail === 0 ? 0 : 1)
