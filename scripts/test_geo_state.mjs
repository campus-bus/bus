// 持续定位状态机回归：直接 import 小程序源码里的真实模块，用假端口重放异步交错顺序
// 用法：node scripts/test_geo_state.mjs
//
// 为什么需要它（第四轮外部复核 P1）：
// `wx.startLocationUpdate` 是异步的，它的回调可能在页面切走、切后台、甚至另一次
// 启动已经在途之后才回来。这类顺序靠人工推理极易漏，而 `test_core_logic.mjs`
// 刻意只导入零依赖纯函数，覆盖不到。这里导入的 watch_machine.ts 不碰 vue/uni/wx，
// 所以能在 Node 里直接验证「谁也别把监听状态搞丢」。
//
// 每个用例都对应一条真实的事件顺序，不是构造出来的抽象状态。

const emitWarning = process.emitWarning
process.emitWarning = function (warning, ...rest) {
  const msg = typeof warning === 'string' ? warning : (warning && warning.message) || ''
  if (msg.includes('MODULE_TYPELESS_PACKAGE_JSON') || msg.includes('Reparsing as ES module')) return
  return emitWarning.call(process, warning, ...rest)
}

import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const SRC = path.join(ROOT, 'apps/miniprogram/src/composables')
const { createWatchMachine } = await import(pathToFileURL(path.join(SRC, 'watch_machine.ts')).href)

let passed = 0
const failures = []

function check(name, actual, expected) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) {
    passed++
    return
  }
  failures.push(`${name}\n    期望 ${e}\n    实际 ${a}`)
}

/**
 * 假端口：记录每个副作用被调了几次，并允许手动控制 startLocationUpdate 何时回调。
 * 真实 wx 接口是异步的，这里用 pending 数组模拟「回调还没回来」的窗口。
 */
function makePort({ autoSucceed = false } = {}) {
  const calls = { start: 0, stop: 0, attach: 0, detach: 0 }
  const pending = []
  const port = {
    start(done) {
      calls.start++
      if (autoSucceed) done(true)
      else pending.push(done)
    },
    stop() { calls.stop++ },
    attach() { calls.attach++ },
    detach() { calls.detach++ },
  }
  return {
    port,
    calls,
    pending,
    /** 让最早那次在途启动成功返回 */
    resolveNext(ok = true, errMsg = '') {
      const fn = pending.shift()
      if (!fn) throw new Error('没有在途的启动可以回调')
      fn(ok, errMsg)
    },
  }
}

/** 汇总成便于断言的一行 */
const state = (m, extra = {}) => {
  const s = m.snapshot()
  return {
    shouldWatch: s.shouldWatch,
    watching: s.watching,
    starting: s.startingWatch,
    ...extra,
  }
}

// ── 用例 1：第四轮复核 P1 原始序列（地图启动在途 → 首页抢所有权） ──
{
  const h = makePort()
  const m = createWatchMachine(h.port)
  m.setWant(true)
  m.acquire('map')
  check('P1 场景：地图发起启动', state(m), { shouldWatch: true, watching: false, starting: true })

  // 用户切到首页（首页也用定位）：新页抢所有权，旧页 onHide 被忽略
  m.acquire('index')
  m.release('map')

  // 地图那次启动的回调此刻才回来
  h.resolveNext(true)
  check('P1 场景：旧回调晚到后监听仍建立', state(m, { attach: h.calls.attach }), {
    shouldWatch: true, watching: true, starting: false, attach: 1,
  })

  // 之后照常同步不应再重复注册
  m.sync()
  m.sync()
  check('P1 场景：重复同步不重复挂监听', state(m, { attach: h.calls.attach }), {
    shouldWatch: true, watching: true, starting: false, attach: 1,
  })
}

// ── 用例 2：同页内两次同步（onShow 的 initLocation 回调 + acquireWatch） ──
// 这是最容易复现的版本：只要本地已有坐标，进地图页就会走这条路径
{
  const h = makePort()
  const m = createWatchMachine(h.port)
  m.setWant(true)
  m.acquire('map')   // 第一次 sync：发起启动
  m.sync()           // 第二次 sync：getSetting 回调里恢复监听
  h.resolveNext(true)
  check('同页两次同步：不会卡在启动中', state(m, { attach: h.calls.attach }), {
    shouldWatch: true, watching: true, starting: false, attach: 1,
  })
}

// ── 用例 3：离开页面后旧回调晚到 → 不能挂监听，并把多开的收掉 ──
{
  const h = makePort()
  const m = createWatchMachine(h.port)
  m.setWant(true)
  m.acquire('map')
  m.release('map')   // 人走了，shouldWatch=false
  check('离页：立刻停止', state(m, { stop: h.calls.stop, detach: h.calls.detach }), {
    shouldWatch: false, watching: false, starting: false, stop: 0, detach: 0,
  })
  h.resolveNext(true) // 启动回调晚到
  check('离页：旧回调不挂监听且收掉多开的', state(m, { attach: h.calls.attach, stop: h.calls.stop }), {
    shouldWatch: false, watching: false, starting: false, attach: 0, stop: 1,
  })
}

// ── 用例 4：离页后立刻回来，旧回调晚到不能清掉新启动的标记 ──
{
  const h = makePort()
  const m = createWatchMachine(h.port)
  m.setWant(true)
  m.acquire('map')
  m.release('map')   // 第一次启动在途
  m.acquire('map')   // 立刻回来，发起第二次启动
  check('快速往返：两次启动在途', state(m, { start: h.calls.start }), {
    shouldWatch: true, watching: false, starting: true, start: 2,
  })
  h.resolveNext(true) // 旧的那次回来（token 已过期）
  check('快速往返：旧回调不动新启动的标记', state(m, { attach: h.calls.attach }), {
    shouldWatch: true, watching: false, starting: true, attach: 0,
  })
  h.resolveNext(true) // 新的那次回来
  check('快速往返：新回调正常挂监听', state(m, { attach: h.calls.attach }), {
    shouldWatch: true, watching: true, starting: false, attach: 1,
  })
}

// ── 用例 5：前后台反复切换，挂/停必须成对 ──
{
  const h = makePort({ autoSucceed: true })
  const m = createWatchMachine(h.port)
  m.setWant(true)
  m.acquire('index')
  m.setForeground(false)
  m.setForeground(true)
  m.setForeground(false)
  m.setForeground(true)
  check('前后台切换：挂/停成对且无重复', state(m, { attach: h.calls.attach, detach: h.calls.detach, stop: h.calls.stop }), {
    shouldWatch: true, watching: true, starting: false, attach: 3, detach: 2, stop: 2,
  })
}

// ── 用例 6：后台期间离开页面，回前台不能自己恢复 ──
{
  const h = makePort({ autoSucceed: true })
  const m = createWatchMachine(h.port)
  m.setWant(true)
  m.acquire('map')
  m.setForeground(false)
  m.release('map')
  m.setForeground(true)
  check('后台离页：回前台不恢复', state(m, { attach: h.calls.attach }), {
    shouldWatch: false, watching: false, starting: false, attach: 1,
  })
}

// ── 用例 7：startLocationUpdate 失败 → 不能卡死，重试能成功 ──
{
  const h = makePort()
  let failMsg = ''
  const m = createWatchMachine(h.port, (msg) => { failMsg = msg })
  m.setWant(true)
  m.acquire('map')
  h.resolveNext(false, 'startLocationUpdate:fail 接口权限未开通')
  check('启动失败：标记清掉并上报原因', state(m, { failMsg }), {
    shouldWatch: true, watching: false, starting: false,
    failMsg: 'startLocationUpdate:fail 接口权限未开通',
  })
  m.sync() // 例如用户点了一次定位按钮
  h.resolveNext(true)
  check('启动失败后重试能成功', state(m, { attach: h.calls.attach }), {
    shouldWatch: true, watching: true, starting: false, attach: 1,
  })
}

// ── 用例 8：用户拒绝授权后不得再启动 ──
{
  const h = makePort({ autoSucceed: true })
  const m = createWatchMachine(h.port)
  m.setWant(true)
  m.setDenied(true)
  m.acquire('index')
  check('拒绝授权：一次启动都不发', state(m, { start: h.calls.start }), {
    shouldWatch: false, watching: false, starting: false, start: 0,
  })
  m.setDenied(false)
  m.sync()
  check('解除拒绝后可正常启动', state(m, { start: h.calls.start, attach: h.calls.attach }), {
    shouldWatch: true, watching: true, starting: false, start: 1, attach: 1,
  })
}

// ── 用例 9：stopAll 之后任何回调都不能把监听带回来 ──
{
  const h = makePort({ autoSucceed: true })
  const m = createWatchMachine(h.port)
  m.setWant(true)
  m.acquire('map')
  m.stopAll()
  check('stopAll：彻底关闭', state(m, { stop: h.calls.stop, detach: h.calls.detach }), {
    shouldWatch: false, watching: false, starting: false, stop: 1, detach: 1,
  })
}

// ── 用例 10：所有权转移给非定位页（行程页）后必须停 ──
{
  const h = makePort({ autoSucceed: true })
  const m = createWatchMachine(h.port)
  m.setWant(true)
  m.acquire('map')
  // 行程页不申请定位，只会有地图的 onHide
  m.release('map')
  check('切到非定位页：停止监听', state(m, { attach: h.calls.attach, detach: h.calls.detach, stop: h.calls.stop }), {
    shouldWatch: false, watching: false, starting: false, attach: 1, detach: 1, stop: 1,
  })
}

console.log(`\n持续定位状态机回归：${passed} 通过，${failures.length} 失败`)
if (failures.length) {
  console.log('\n失败用例：')
  for (const f of failures) console.log('  ✗ ' + f)
  process.exit(1)
}
console.log('全部通过 ✅')
