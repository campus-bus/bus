/**
 * 自动截取「地理位置接口权限申请」使用场景截图
 *
 * 前置条件：微信开发者工具已打开 apps/miniprogram 项目，且服务端口开启；
 *          另开终端执行 cli auto --project <apps/miniprogram> --auto-port 9420
 *
 * 用法：node scripts/capture_interface_screenshots.cjs
 *
 * 说明：截图前会把定位模拟到校园内（研究生宿舍楼）、把时间模拟到周一 08:00，
 *      仅作用于运行中的模拟器，不会修改源码或数据文件。
 */
const path = require('path')
const fs = require('fs')

const AUTOMATOR_CANDIDATES = [
  'miniprogram-automator',
  path.join(process.env.TEMP || '', 'wxauto', 'node_modules', 'miniprogram-automator'),
]

function loadAutomator() {
  for (const p of AUTOMATOR_CANDIDATES) {
    try {
      return require(p)
    } catch (e) {
      /* 继续尝试下一个路径 */
    }
  }
  throw new Error('未找到 miniprogram-automator，请先 npm i miniprogram-automator')
}

const automator = loadAutomator()

// 校园内定位：理学院与高超楼之间（WGS-84，与项目站点数据同坐标系）
// 选点原则：避开终点站（起终点同站会过滤掉全部到站记录），且 200m 内有多个站点
const CAMPUS = { latitude: 28.269813, longitude: 113.036712, accuracy: 18, speed: 0 }

// 模拟时间：2026-10-19（周一）08:00 —— 工作日有车次，页面内容完整
const SIM_DATE = { year: 2026, month: 10, day: 19, hour: 8, minute: 0 }

const OUT_DIR = path.resolve(__dirname, '..', 'docs', '接口申请截图')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function shoot(mp, fileName) {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })
  const file = path.join(OUT_DIR, fileName)
  await mp.screenshot({ path: file })
  const size = fs.existsSync(file) ? fs.statSync(file).size : 0
  console.log(`  ✓ ${fileName}  (${(size / 1024).toFixed(0)} KB)`)
}

async function main() {
  const mp = await automator.connect({ wsEndpoint: process.env.AUTO_WS || 'ws://127.0.0.1:9420' })

  // 1. 用校园坐标替换真实定位，保证画面里出现"附近站点"
  await mp.mockWxMethod('getLocation', CAMPUS)
  await mp.mockWxMethod('startLocationUpdate', {})
  // 首页改为"用户主动点击才定位"，截图时模拟此前已授权定位，
  // 这样 init() 会静默启动定位（等价于真实老用户），无需脚本点击按钮
  await mp.mockWxMethod('getSetting', { authSetting: { 'scope.userLocation': true } })
  // 注：onLocationChange 是监听类接口，不支持 mock，也不影响初始定位

  // 2. 模拟工作日早高峰时间
  await mp.evaluate((d) => {
    const app = getApp()
    const pinia = app.$vm.$pinia
    const store = pinia._s.get('global-time')
    store.setDateTime(d.year, d.month, d.day, d.hour, d.minute)
  }, SIM_DATE)

  console.log('正在截图，输出目录：', OUT_DIR)

  // 3. 首页：附近站点 + 步行距离 + 到站倒计时（getLocation 的核心场景）
  await mp.reLaunch('/pages/index/index')
  await sleep(3500)
  await shoot(mp, '01-首页-附近站点推荐.png')

  // 4. 首页：向下滚动，展示附近站点的完整到站车次
  await mp.callWxMethod('pageScrollTo', { scrollTop: 360, duration: 300 })
  await sleep(1500)
  await shoot(mp, '02-首页-附近站点完整车次.png')

  // 5. 地图：自身定位蓝点 + 班车实时位置（startLocationUpdate / onLocationChange 的核心场景）
  //    注意：地图、记录页都是 tabBar 页，只能用 switchTab 跳转
  await mp.switchTab('/pages/map/map')
  await sleep(4000)
  // 点「◎」把地图居中到用户位置，让蓝点处于画面中心
  const mapPage = await mp.currentPage()
  try {
    const btns = await mapPage.$$('.ctrl-btn')
    if (btns.length) {
      await btns[0].tap()
      await sleep(2500)
    }
  } catch (e) {
    /* 定位按钮不可用时保持默认视角 */
  }
  await shoot(mp, '03-地图-自身位置与班车位置.png')

  // 6. 记录页：最近站点一键上车（位置数据复用场景）
  await mp.switchTab('/pages/record/record')
  await sleep(2500)
  await shoot(mp, '04-记录-最近站点一键上车.png')

  // 收尾：还原 mock 与模拟时间，避免影响后续手动调试
  await mp.evaluate(() => {
    const pinia = getApp().$vm.$pinia
    pinia._s.get('global-time').reset()
  })
  await mp.restoreWxMethod('getLocation')
  await mp.restoreWxMethod('startLocationUpdate')
  await mp.restoreWxMethod('getSetting')

  console.log('\n全部截图已保存到：', OUT_DIR)
  await mp.disconnect()
}

main().catch((e) => {
  console.error('截图失败:', e && e.message ? e.message : e)
  process.exit(1)
})
