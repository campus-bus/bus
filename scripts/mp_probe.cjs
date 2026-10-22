#!/usr/bin/env node
/**
 * 微信小程序调试探针（防挂起版）
 *
 * 为什么需要它：
 *   miniprogram-automator 的 `mp.evaluate` **不会 await Promise**。
 *   一旦在 evaluate 里 `return new Promise(...)`，或返回 pinia 的响应式对象（proxy 无法序列化），
 *   调用会永久挂起，只能杀进程。本项目已经因此浪费过两次 120 秒。
 *
 * 本脚本的做法（唯一正确姿势）：
 *   1. evaluate 里只做"同步启动"，立刻 return 'started'；
 *   2. 异步回调把结果 JSON 写进 storage（wx.setStorageSync）；
 *   3. Node 侧循环 callWxMethod('getStorageSync') 轮询读回；
 *   4. 全程硬超时，finally 一定 disconnect。
 *
 * 用法：
 *   node scripts/mp_probe.cjs location           # 定位（含真实 errMsg）
 *   node scripts/mp_probe.cjs geo                # 对比 wgs84 / gcj02 两种取值的差异
 *   node scripts/mp_probe.cjs setting            # 授权状态 + 隐私协议状态
 *   node scripts/mp_probe.cjs weather            # 天气云函数
 *   node scripts/mp_probe.cjs holidays           # 节假日云函数
 *   node scripts/mp_probe.cjs storage            # 列出全部 storage 键
 *   node scripts/mp_probe.cjs page               # 当前页面路径与标题
 *   node scripts/mp_probe.cjs --expr "wx.getSystemInfoSync().SDKVersion"   # 自定义表达式
 *
 * 可选参数：
 *   --timeout <ms>   单次探针硬超时，默认 15000
 *   --ws <url>       automator 端口，默认 ws://127.0.0.1:9420
 *
 * 退出码：0 成功 / 1 探针返回失败 / 2 超时 / 3 连接或环境错误
 */
const fs = require('fs')
const os = require('os')
const path = require('path')

const STORAGE_KEY = '__mp_probe_result'
const PENDING = '{"status":"pending"}'

/** 解析 automator 依赖：优先本地，其次临时目录（本机历史安装位置） */
function resolveAutomator() {
  const candidates = [
    'miniprogram-automator',
    path.join(os.tmpdir(), 'wxauto', 'node_modules', 'miniprogram-automator'),
  ]
  for (const c of candidates) {
    try {
      return require(c)
    } catch (e) {
      /* 继续尝试下一个 */
    }
  }
  console.error(
    '[错误] 找不到 miniprogram-automator。请在项目根目录执行：\n' +
      '  npm i -D miniprogram-automator --registry=https://registry.npmmirror.com'
  )
  process.exit(3)
}

/** 解析命令行参数 */
function parseArgs(argv) {
  const opts = {
    probe: null,
    expr: null,
    timeout: 15000,
    ws: 'ws://127.0.0.1:9420',
    /** 先 reLaunch 到该页面再探针，例如 /pages/record/record */
    url: null,
    /** data 探针要取的字段（逗号分隔）；不传则只列字段名 */
    keys: null,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--expr') opts.expr = argv[++i]
    else if (a === '--timeout') opts.timeout = Number(argv[++i])
    else if (a === '--ws') opts.ws = argv[++i]
    else if (a === '--url') opts.url = argv[++i]
    else if (a === '--keys') opts.keys = argv[++i]
    else if (!opts.probe) opts.probe = a
  }
  return opts
}

// ───────────────────────── 页面侧探针（在 app service 中执行） ─────────────────────────
// 硬约束（踩过两次坑）：
//   1. automator 的 evaluate **不会传入额外参数**，所以 storage key 必须写成字面量常量；
//   2. 注入环境里**没有 `uni` 全局**，只能用 `wx.*` 原生接口（uni 内部也是转发给 wx，errMsg 一致）；
//   3. 只能是自包含函数，不能引用 Node 侧任何变量或本项目其他函数。

/** 定位：拿 getLocation 的真实 errMsg */
function probeLocation() {
  const KEY = '__mp_probe_result'
  wx.setStorageSync(KEY, '{"status":"pending"}')
  wx.getLocation({
    type: 'wgs84',
    success: (res) => {
      wx.setStorageSync(
        KEY,
        JSON.stringify({
          status: 'ok',
          latitude: res.latitude,
          longitude: res.longitude,
          accuracy: res.accuracy,
        })
      )
    },
    fail: (err) => {
      // 完整导出失败对象，避免只看到"定位不可用"这种无信息量的封装文案
      const dump = {}
      try {
        Object.getOwnPropertyNames(err).forEach((k) => {
          dump[k] = err[k]
        })
      } catch (e) {
        /* 忽略 */
      }
      dump.errMsg = err && err.errMsg
      wx.setStorageSync(KEY, JSON.stringify({ status: 'fail', detail: dump }))
    },
  })
  return 'started'
}

/**
 * 坐标系对比：分别用 wgs84 / gcj02 各取一次定位
 *
 * 用途：判断当前环境（开发者工具模拟定位 / 真机）是否真的尊重 type 参数。
 * 若两次结果相同 → 环境不区分坐标系（例如模拟器直接把 GCJ-02 当结果返回），
 * 此时页面侧必须自己决定要不要转换；若相差 300-800m → 两次都可信。
 */
function probeGeo() {
  const KEY = '__mp_probe_result'
  wx.setStorageSync(KEY, '{"status":"pending"}')
  wx.getLocation({
    type: 'wgs84',
    success: (a) => {
      wx.getLocation({
        type: 'gcj02',
        success: (b) => {
          wx.setStorageSync(
            KEY,
            JSON.stringify({
              status: 'ok',
              wgs84: { latitude: a.latitude, longitude: a.longitude, accuracy: a.accuracy },
              gcj02: { latitude: b.latitude, longitude: b.longitude, accuracy: b.accuracy },
            })
          )
        },
        fail: (e) => {
          wx.setStorageSync(
            KEY,
            JSON.stringify({
              status: 'ok',
              wgs84: { latitude: a.latitude, longitude: a.longitude, accuracy: a.accuracy },
              gcj02Error: e && e.errMsg,
            })
          )
        },
      })
    },
    fail: (e) => {
      wx.setStorageSync(KEY, JSON.stringify({ status: 'fail', errMsg: e && e.errMsg }))
    },
  })
  return 'started'
}

/** 授权状态 + 隐私协议状态 */function probeSetting() {
  const KEY = '__mp_probe_result'
  wx.setStorageSync(KEY, '{"status":"pending"}')
  wx.getSetting({
    success: (res) => {
      const out = { authSetting: res.authSetting }
      if (typeof wx.getPrivacySetting !== 'function') {
        out.privacyUnsupported = true
        wx.setStorageSync(KEY, JSON.stringify({ status: 'ok', data: out }))
        return
      }
      wx.getPrivacySetting({
        success: (p) => {
          out.privacy = p
          wx.setStorageSync(KEY, JSON.stringify({ status: 'ok', data: out }))
        },
        fail: (e) => {
          out.privacyError = e && e.errMsg
          wx.setStorageSync(KEY, JSON.stringify({ status: 'ok', data: out }))
        },
      })
    },
    fail: (e) => {
      wx.setStorageSync(KEY, JSON.stringify({ status: 'fail', errMsg: e && e.errMsg }))
    },
  })
  return 'started'
}

/**
 * 探针腾讯位置服务天气（2026-10-19 起不再走云函数）
 *
 * 注意：`wx.cloud` 已被弃用；直接调 LBS WebService，key 与
 * `apps/miniprogram/src/config.ts` 保持一致（改 key 时两处都要改）。
 */
function probeWeather() {
  const KEY = '__mp_probe_result'
  const LBS_KEY = 'QNABZ-3MULC-S6X2Q-A2W65-2KFGO-67BWY'
  // 研究生宿舍楼（GCJ-02，小程序数据口径）
  const LOCATION = '28.254769,113.051463'
  wx.setStorageSync(KEY, '{"status":"pending"}')
  wx.request({
    url: 'https://apis.map.qq.com/ws/weather/v1/',
    data: { key: LBS_KEY, location: LOCATION },
    timeout: 5000,
    success: (res) => {
      wx.setStorageSync(
        KEY,
        JSON.stringify({
          status: res.statusCode === 200 ? 'ok' : 'http_error',
          statusCode: res.statusCode,
          result: res.data,
        })
      )
    },
    fail: (err) => {
      wx.setStorageSync(KEY, JSON.stringify({ status: 'fail', errMsg: err && err.errMsg }))
    },
  })
  return 'started'
}

/** 探针节假日：已改为内置数据，不再有云函数/网络调用 */
function probeHolidays() {
  const KEY = '__mp_probe_result'
  wx.setStorageSync(
    KEY,
    JSON.stringify({
      status: 'ok',
      deprecated: true,
      note: '节假日已内置在 apps/miniprogram/src/utils/holidays.ts，无网络请求；如需核对请直接看该文件或首页“工作日/周末”文案',
      today: new Date().toISOString().slice(0, 10),
    })
  )
  return 'started'
}

/** 列出 storage 全部键 */
function probeStorage() {
  const KEY = '__mp_probe_result'
  const info = wx.getStorageInfoSync()
  wx.setStorageSync(KEY, JSON.stringify({ status: 'ok', keys: info.keys, size: info.currentSize }))
  return 'started'
}

/** 当前页面 */
function probePage() {
  const KEY = '__mp_probe_result'
  const pages = getCurrentPages()
  const cur = pages[pages.length - 1]
  wx.setStorageSync(
    KEY,
    JSON.stringify({
      status: 'ok',
      path: cur ? cur.route : null,
      options: cur ? cur.options : null,
    })
  )
  return 'started'
}

/** 当前页面的 data 快照（要取的字段由 Node 侧写进 storage 传入，因为 evaluate 不能带参） */
function probePageData() {
  const KEY = '__mp_probe_result'
  const KEYS_KEY = '__mp_probe_keys'
  const pages = getCurrentPages()
  const cur = pages[pages.length - 1]
  const out = { status: 'ok', route: cur ? cur.route : null }
  if (cur && cur.data) {
    const want = String((wx.getStorageSync(KEYS_KEY) || '')).trim()
    const keys = want
      ? want.split(',').map(function (s) { return s.trim() }).filter(Boolean)
      : Object.keys(cur.data)
    const data = {}
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i]
      const v = cur.data[k]
      if (typeof v === 'function') { data[k] = '[function]'; continue }
      try {
        data[k] = v === undefined ? '[undefined]' : JSON.parse(JSON.stringify(v))
      } catch (e) {
        data[k] = '[unserializable]'
      }
    }
    out.data = data
  }
  wx.setStorageSync(KEY, JSON.stringify(out))
  return 'started'
}

const PROBES = {
  location: probeLocation,
  geo: probeGeo,
  setting: probeSetting,
  weather: probeWeather,
  holidays: probeHolidays,
  storage: probeStorage,
  page: probePage,
  data: probePageData,
  /** text 在 Node 侧用 automator 页面 API 实现（见 main），这里只占位通过校验 */
  text: probePage,
}

/** 把自定义表达式包成探针：自动写入返回值（key 必须内联为字面量，不能用参数） */
function makeExprProbe(expr) {
  // 用 new Function 生成可被 automator 序列化的函数源码
  return new Function(
    `const KEY = '__mp_probe_result';
     wx.setStorageSync(KEY, '{"status":"pending"}');
     try {
       Promise.resolve(${expr}).then(function (v) {
         wx.setStorageSync(KEY, JSON.stringify({ status: 'ok', result: v === undefined ? null : v }));
       }).catch(function (e) {
         wx.setStorageSync(KEY, JSON.stringify({ status: 'fail', message: String(e && e.message || e) }));
       });
     } catch (e) {
       wx.setStorageSync(KEY, JSON.stringify({ status: 'fail', message: String(e && e.message || e) }));
     }
     return 'started';`
  )
}

/** 轮询读回结果，带硬超时 */
async function pollResult(mp, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await sleep(250)
    let raw
    try {
      raw = await mp.callWxMethod('getStorageSync', STORAGE_KEY)
    } catch (e) {
      continue // 刚重载时可能暂时读不到，继续等
    }
    if (!raw || raw === PENDING) continue
    try {
      return JSON.parse(raw)
    } catch (e) {
      return { status: 'fail', message: '探针写入的不是合法 JSON: ' + String(raw).slice(0, 200) }
    }
  }
  return null // 超时
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (!opts.probe && !opts.expr) {
    console.error('用法: node scripts/mp_probe.cjs <location|setting|weather|holidays|storage|page|data|--expr "js">')
    console.error('  可选: --url /pages/xxx/xxx（先跳页）  --keys a,b,c（data 探针取哪些字段）')
    process.exit(3)
  }

  const automator = resolveAutomator()
  const probeFn = opts.expr ? makeExprProbe(opts.expr) : PROBES[opts.probe]
  if (!probeFn) {
    console.error(`[错误] 未知探针: ${opts.probe}`)
    console.error('可用: ' + Object.keys(PROBES).join(' / '))
    process.exit(3)
  }

  let mp
  try {
    mp = await automator.connect({ wsEndpoint: opts.ws })
  } catch (e) {
    console.error(
      '[错误] 连接 automator 失败。请确认开发者工具已开启自动化端口：\n' +
        '  cli.bat auto --project <项目根> --auto-port 9420\n' +
        '原始错误: ' + e.message
    )
    process.exit(3)
  }

  try {
    // 清掉上一轮残留，避免读到旧结果
    try {
      await mp.callWxMethod('removeStorageSync', STORAGE_KEY)
    } catch (e) {
      /* 忽略 */
    }
    // data 探针要取的字段名（evaluate 不能带参，只能先写进 storage）
    if (opts.keys) {
      try {
        await mp.callWxMethod('setStorageSync', '__mp_probe_keys', opts.keys)
      } catch (e) {
        console.error('[警告] 写入字段清单失败: ' + e.message)
      }
    }
    // 可选：先跳到目标页再探针
    if (opts.url) {
      await mp.reLaunch(opts.url)
      await new Promise((r) => setTimeout(r, 1500))
    }

    // text 探针走 automator 的页面 API（script setup 的 ref 不在 page.data 上，只能读渲染结果）
    if (opts.probe === 'text') {
      const page = await mp.currentPage()
      const nodes = await page.$$('view,text,button')
      const lines = []
      for (const n of nodes) {
        try {
          const t = String(await n.text()).trim()
          if (t) lines.push(t)
        } catch (e) {
          /* 节点可能已失效 */
        }
      }
      console.log(JSON.stringify({ status: 'ok', route: page.path, lines }, null, 2))
      return
    }

    const started = await mp.evaluate(probeFn)
    if (started !== 'started') {
      console.error('[警告] 探针未按预期启动，返回: ' + JSON.stringify(started))
    }

    const result = await pollResult(mp, opts.timeout)
    if (result === null) {
      console.error(`[超时] ${opts.timeout}ms 内未拿到结果（探针本身可能就是挂着的原因）`)
      process.exit(2)
    }

    console.log(JSON.stringify(result, null, 2))
    process.exit(result.status === 'ok' ? 0 : 1)
  } finally {
    // 无论成功失败都必须断开，否则残留连接会拖住后续脚本
    try {
      await mp.callWxMethod('removeStorageSync', STORAGE_KEY)
      await mp.callWxMethod('removeStorageSync', '__mp_probe_keys')
    } catch (e) {
      /* 忽略 */
    }
    try {
      await mp.disconnect()
    } catch (e) {
      /* 忽略 */
    }
  }
}

main().catch((e) => {
  console.error('[错误] ' + (e && e.stack ? e.stack : e))
  process.exit(3)
})
