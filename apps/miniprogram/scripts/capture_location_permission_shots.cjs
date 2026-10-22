/**
 * 抓取「位置信息」接口申请材料截图（`wx.startLocationUpdate` + `wx.onLocationChange`）
 *
 * 为什么需要一串截图：静态图无法「录屏」，而审核真正要判断的是
 * 「这个场景是否必须持续定位」。所以这里做成连续画面：
 * 同一个地图页里，用户沿路走向「激光所」，定位点逐帧前移，
 * 覆盖层「距「激光所」xx 米」随之递减——这个数字只有持续收到位置回调才会变化。
 *
 * 前置条件：
 *   1. 微信开发者工具已打开 apps/miniprogram，且「设置 → 安全设置」开启服务端口
 *   2. 已执行：
 *        "<开发者工具目录>\cli.bat" auto --project "<apps/miniprogram 绝对路径>" --auto-port 9420
 *   3. 另开终端保持 npm run dev:mp-weixin 运行（产物 dist/dev/mp-weixin）
 *
 * 用法：node scripts/capture_location_permission_shots.cjs
 *
 * 说明：脚本只操作运行中的模拟器（模拟定位 / 模拟时间 / 注入位置），
 *      不修改源码与数据文件，结束时自动还原。
 */
const path = require('path')
const fs = require('fs')

const OUT_DIR = path.resolve(__dirname, '..', 'docs', '接口申请截图-持续定位', '原图')
const DATA_DIR = path.resolve(__dirname, '..', 'src', 'data')

// ─── 场景：从「网球场」沿路走向「激光所」 ───
// 选这一段的原因：整段最近站点始终是「激光所」，距离单调递减，画面最直观
const WALK = { from: '网球场', to: '激光所' }
const FRACTIONS = [0.55, 0.66, 0.76, 0.87, 0.97]
const FRAME_TIMES = ['07:52:10', '07:53:05', '07:53:58', '07:54:52', '07:55:40']
const SIM_DATE = { year: 2026, month: 10, day: 19, hour: 7, minute: 52 }
const MAP_SCALE = 17

const AUTOMATOR_PATHS = [
  'miniprogram-automator',
  path.join(process.env.TEMP || '', 'wxauto', 'node_modules', 'miniprogram-automator'),
]
function loadAutomator() {
  for (const p of AUTOMATOR_PATHS) {
    try { return require(p) } catch (e) { /* 试下一个 */ }
  }
  throw new Error('未找到 miniprogram-automator，请先 npm i -D miniprogram-automator')
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ─── 几何工具（与运行时同一公式，仅用于生成图注里的真实距离） ───
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** 沿折线按弧长比例取点 */
function sampleAlong(points, fractions) {
  const segLen = []
  let total = 0
  for (let i = 0; i < points.length - 1; i++) {
    const d = haversine(points[i][1], points[i][0], points[i + 1][1], points[i + 1][0])
    segLen.push(d)
    total += d
  }
  return fractions.map((f) => {
    let target = total * f
    for (let i = 0; i < segLen.length; i++) {
      const isLast = i === segLen.length - 1
      if (target <= segLen[i] || isLast) {
        const r = segLen[i] === 0 ? 0 : Math.min(target / segLen[i], 1)
        return [
          points[i][1] + (points[i + 1][1] - points[i][1]) * r,
          points[i][0] + (points[i + 1][0] - points[i][0]) * r,
        ]
      }
      target -= segLen[i]
    }
    return [points[points.length - 1][1], points[points.length - 1][0]]
  })
}

/** 生成行走采样点，并校验每一帧的最近站点都是目标站 */
function buildWalk() {
  const paths = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'route_paths.json'), 'utf8'))
  const stops = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'route_stops.json'), 'utf8'))
  const stations = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'stations.json'), 'utf8'))

  const pathPoints = paths.JB1_NORMAL
  const stopList = stops.JB1_NORMAL
  const stopFrom = stopList.find((s) => s.name === WALK.from)
  const stopTo = stopList.find((s) => s.name === WALK.to)
  if (!stopFrom || !stopTo) throw new Error(`route_stops 中找不到 ${WALK.from} / ${WALK.to}`)

  const idxOf = (s) => {
    let bi = 0
    let bd = Infinity
    pathPoints.forEach((p, i) => {
      const d = haversine(s.lat, s.lng, p[1], p[0])
      if (d < bd) { bd = d; bi = i }
    })
    return bi
  }
  const i0 = idxOf(stopFrom)
  const i1 = idxOf(stopTo)
  if (i1 <= i0) throw new Error('路径索引异常，请检查 route_paths 顺序')

  const segment = pathPoints.slice(i0, i1 + 1)
  const target = stations.find((s) => s.name === WALK.to)
  if (!target) throw new Error(`stations 中找不到 ${WALK.to}`)

  const points = sampleAlong(segment, FRACTIONS).map(([lat, lng]) => {
    const distance = Math.round(haversine(lat, lng, target.lat, target.lng))
    let best = null
    let bd = Infinity
    for (const s of stations) {
      const d = haversine(lat, lng, s.lat, s.lng)
      if (d < bd) { bd = d; best = s.name }
    }
    if (best !== WALK.to) throw new Error(`采样点最近站为「${best}」而非「${WALK.to}」，请调整 FRACTIONS`)
    return { lat, lng, distance }
  })

  const center = {
    lat: (points[0].lat + points[points.length - 1].lat) / 2,
    lng: (points[0].lng + points[points.length - 1].lng) / 2,
  }
  return { points, center, target }
}

async function main() {
  const automator = loadAutomator()
  const walk = buildWalk()
  fs.mkdirSync(OUT_DIR, { recursive: true })

  console.log('行走采样点（距目标站）：')
  walk.points.forEach((p, i) => console.log(`  ${i + 1}. ${FRAME_TIMES[i]}  ${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}  ${p.distance} 米`))

  const mp = await automator.connect({ wsEndpoint: process.env.AUTO_WS || 'ws://127.0.0.1:9420' })
  const shots = []

  async function shoot(file, caption) {
    const full = path.join(OUT_DIR, file)
    await mp.screenshot({ path: full })
    shots.push({ file, caption })
    console.log(`  ✓ ${file}  ${caption}`)
  }

  /** 把「当前位置」注入 store，等价于一次 onLocationChange 回调 */
  async function setLocation(lat, lng) {
    await mp.mockWxMethod('getLocation', { latitude: lat, longitude: lng, accuracy: 12, speed: 0 })
    await mp.evaluate(([la, ln]) => {
      getApp().$vm.$pinia._s.get('location').setUserLocation(la, ln)
    }, [lat, lng])
  }

  try {
    // 固定到工作日早高峰，保证页面里有车次
    await mp.mockWxMethod('startLocationUpdate', {})
    await mp.mockWxMethod('getSetting', { authSetting: { 'scope.userLocation': true } })
    await mp.evaluate((d) => {
      getApp().$vm.$pinia._s.get('global-time').setDateTime(d.year, d.month, d.day, d.hour, d.minute)
    }, SIM_DATE)

    // ① 首页未定位：展示「允许定位」入口，说明定位由用户主动发起
    await mp.mockWxMethod('getSetting', { authSetting: {} })
    await mp.evaluate(() => {
      const store = getApp().$vm.$pinia._s.get('location')
      store.userLat = null
      store.userLng = null
    })
    await mp.reLaunch('/pages/index/index')
    await sleep(3000)
    await shoot('01-首页-未定位时的引导入口.png', '进入首页不自动定位，由用户点击「允许定位」发起')

    // ② 首页已定位：附近站点 + 步行时间（位置用来做什么）
    // 说明：reLaunch 后直接注入位置，模拟器偶尔不触发页面重渲染，
    //      这里切页再回来自动画一次，等价于用户从地图页返回首页
    await mp.mockWxMethod('getSetting', { authSetting: { 'scope.userLocation': true } })
    await setLocation(walk.points[0].lat, walk.points[0].lng)
    await sleep(1200)
    await mp.switchTab('/pages/map/map')
    await sleep(1200)
    await mp.switchTab('/pages/index/index')
    await sleep(2200)
    await shoot('02-首页-定位后显示附近站点与步行时间.png', '授权后推荐附近站点，并给出步行耗时')

    // ③~⑦ 地图页：同一视角，位置逐帧前移
    await mp.switchTab('/pages/map/map')
    await sleep(3500)
    const mapPage = await mp.currentPage()
    // 固定视角（不跟随用户），这样前后帧的差别只剩「我的位置」与距离
    await mapPage.setData({ a: walk.center.lat, b: walk.center.lng, c: MAP_SCALE })
    await sleep(2500)

    for (let i = 0; i < walk.points.length; i++) {
      const p = walk.points[i]
      await setLocation(p.lat, p.lng)
      await sleep(1800)
      const no = String(i + 3).padStart(2, '0')
      const caption =
        i === 0
          ? `${FRAME_TIMES[i]} 打开地图页，我的位置距「${WALK.to}」${p.distance} 米`
          : `${FRAME_TIMES[i]} 步行途中，距离更新为 ${p.distance} 米`
      await shoot(`${no}-地图-${i === 0 ? '显示我的位置' : `距离更新为${p.distance}米`}.png`, caption)
    }

    // ⑧ 关于页：位置信息用途与不上传的说明
    await mp.navigateTo('/pages/about/about')
    await sleep(2500)
    await shoot('08-关于-位置信息使用说明.png', '小程序内明示位置用途：仅本机计算，不上传不保存')
  } finally {
    // 还原：模拟时间、mock 方法
    try {
      await mp.evaluate(() => { getApp().$vm.$pinia._s.get('global-time').reset() })
    } catch (e) { /* 忽略 */ }
    for (const m of ['getLocation', 'startLocationUpdate', 'getSetting']) {
      try { await mp.restoreWxMethod(m) } catch (e) { /* 忽略 */ }
    }
    await mp.disconnect()
  }

  fs.writeFileSync(path.join(OUT_DIR, '_captions.json'), JSON.stringify(shots, null, 2), 'utf8')
  console.log(`\n共 ${shots.length} 张，输出目录：${OUT_DIR}`)
}

main().catch((e) => {
  console.error('抓图失败:', e && e.message ? e.message : e)
  process.exit(1)
})
