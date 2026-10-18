// 临时脚本：验证 findBestRide 最优乘车组合逻辑（用后删除）
const fs = require('fs')
const pred = JSON.parse(fs.readFileSync('public/data/arrival_predictions.json'))
const deps = JSON.parse(fs.readFileSync('public/data/departures.json'))

function findBestRide(preds, originMembers, destMembers) {
  let best = null
  for (const o of preds) {
    if (!originMembers.includes(o.stopName)) continue
    if (o.isReturnStop) continue
    for (const d of preds) {
      if (!destMembers.includes(d.stopName)) continue
      if (d.stopSeq <= o.stopSeq) continue
      const ride = d.arrivalMinutes - o.arrivalMinutes
      if (!best || ride < best.rideMinutes) best = { origin: o, dest: d, rideMinutes: ride }
    }
  }
  return best
}

// 用户场景：16:45 接驳2路，军体活动中心东 → 二食堂
const jb2_1645 = deps.find(d => d.routeKey === 'JB2_NORMAL' && d.departureTime === '16:45')
console.log('测试班次:', jb2_1645.recordId, jb2_1645.route, jb2_1645.departureTime)
const preds = pred.filter(p => p.departureId === jb2_1645.recordId).sort((a, b) => a.stopSeq - b.stopSeq)

console.log('\n场景1：军体活动中心东 → 二食堂（用户报告的错误场景）')
let r = findBestRide(preds, ['军体活动中心东'], ['二食堂'])
console.log('  最优: seq' + r.origin.stopSeq, r.origin.stopName, r.origin.arrivalTime, '上车 →',
  'seq' + r.dest.stopSeq, r.dest.stopName, r.dest.arrivalTime, '下车, 乘坐', Math.round(r.rideMinutes * 60) + 's')
const wrong = { seq: preds[3].stopSeq, time: preds[3].arrivalTime }
console.log('  （修复前错误方案: seq' + wrong.seq, wrong.time, '上车绕大圈）')
console.log('  ✅ 正确' , r.origin.stopSeq === 12 ? '—— 选择返程第二次经过(seq12)' : '❌')

console.log('\n场景2：军体活动中心（组=东+南） → 二食堂')
r = findBestRide(preds, ['军体活动中心东', '军体活动中心南'], ['二食堂'])
console.log('  最优: seq' + r.origin.stopSeq, r.origin.stopName, r.origin.arrivalTime, '→', r.dest.stopName, r.dest.arrivalTime, ', 乘坐', Math.round(r.rideMinutes * 60) + 's')
console.log('  ', r.origin.stopName === '军体活动中心南' ? '✅ 自动选择军体南（不需用户区分东/南）' : '（选择了' + r.origin.stopName + '）')

console.log('\n场景3：军体活动中心（组） → 激光所（应选军体东去程）')
r = findBestRide(preds, ['军体活动中心东', '军体活动中心南'], ['激光所'])
console.log('  最优: seq' + r.origin.stopSeq, r.origin.stopName, r.origin.arrivalTime, '→', r.dest.stopName, r.dest.arrivalTime, ', 乘坐', Math.round(r.rideMinutes * 60) + 's')
console.log('  ', r.origin.stopName === '军体活动中心东' && r.origin.stopSeq === 4 ? '✅ 自动选择军体东去程(seq4)' : '❌')

console.log('\n场景4：二食堂（组=二食堂+二食堂北） ← 军体活动中心（组），JB2 班次')
r = findBestRide(preds, ['军体活动中心东', '军体活动中心南'], ['二食堂', '二食堂北'])
console.log('  最优: seq' + r.origin.stopSeq, r.origin.stopName, '→', r.dest.stopName, ', 乘坐', Math.round(r.rideMinutes * 60) + 's')

console.log('\n场景5：环线1路 军体活动中心东 → 二食堂（应绕大圈——环1只有这一条路径）')
const hx1 = deps.find(d => d.routeKey === 'HX1_NORMAL' && d.departureTime === '16:40')
const hx1Preds = pred.filter(p => p.departureId === hx1.recordId).sort((a, b) => a.stopSeq - b.stopSeq)
r = findBestRide(hx1Preds, ['军体活动中心东'], ['二食堂'])
console.log('  结果: seq' + r.origin.stopSeq, r.origin.stopName, r.origin.arrivalTime, '→', r.dest.stopName, r.dest.arrivalTime, ', 乘坐', Math.round(r.rideMinutes * 60) + 's（环1确实需要绕，提示用户接驳2路更优）')
