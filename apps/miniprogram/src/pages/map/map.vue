<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import { onShow, onHide, onReady } from '@dcloudio/uni-app'
import { useScheduleStore } from '@/stores/schedule'
import { useLocationStore } from '@/stores/location'
import { useMapFocusStore } from '@/stores/map_focus'
import { useGeolocation } from '@/composables/useGeolocation'
import { getDateType, getSecondsSinceMidnight } from '@/utils/datetime'
import { getNow } from '@/utils/time'
import { computeActiveBusPositions } from '@/utils/bus_position'
import { STATION_MARKER_META } from '@/utils/station_marker_meta'
import { arrivalCountdown, etaClassOf } from '@/utils/countdown'
import { routeColorOf, routeLabelOf, busIconOf } from '@/constants/routes'
import { useShare } from '@/utils/share'
import type { BusPosition } from '@/types'

const scheduleStore = useScheduleStore()
const locationStore = useLocationStore()

useShare()
// 地图页不自动申请授权：进入时只检查授权状态（已授权则静默定位），
// 未授权时由用户点右下角定位按钮主动触发（与首页门禁保持一致，符合平台规范）
const { init: initLocation, requestLocation, openSetting } = useGeolocation()

// ─── 默认视野：把整张校园路线图完整框进屏幕并居中 ───
// 之前固定在研究生宿舍楼（校园东南角），进页面只能看到局部；
// 现在按全部路线折线的包围盒算中心与缩放级别，进页面即是「全图概览」。
type Path = Array<[number, number]>
/** 按若干条折线的包围盒算出「刚好框满屏幕」的中心与缩放级别 */
function computeView(paths: Path[]) {
  let minLat = 90
  let maxLat = -90
  let minLng = 180
  let maxLng = -180
  const add = (lat: number, lng: number) => {
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
    if (lng < minLng) minLng = lng
    if (lng > maxLng) maxLng = lng
  }
  for (const path of paths) for (const [lng, lat] of path) add(lat, lng)
  // 兜底：没有路径数据时退回研究生宿舍楼
  if (!isFinite(minLat) || minLat > maxLat || minLng > maxLng) {
    return { lat: 28.254769, lng: 113.051463, scale: 15 }
  }
  const lat = (minLat + maxLat) / 2
  const lng = (minLng + maxLng) / 2
  const sys = uni.getSystemInfoSync()
  const w = sys.windowWidth || 375
  const h = sys.windowHeight || 667
  // 纬度 1 度约 111320m；经度随纬度收缩
  const mPerDegLat = 111320
  const mPerDegLng = 111320 * Math.cos((lat * Math.PI) / 180)
  const spanW = Math.max(1, (maxLng - minLng) * mPerDegLng)
  const spanH = Math.max(1, (maxLat - minLat) * mPerDegLat)
  // 左右/上下留白：给图例、定位按钮和底部面板让位
  const needMpp = Math.max(spanW / (w * 0.8), spanH / (h * 0.74))
  // 该纬度下 scale 级对应的地面分辨率（米/像素）
  const mppAtZoom0 = 156543.03392 * Math.cos((lat * Math.PI) / 180)
  const z = Math.log2(mppAtZoom0 / needMpp)
  const safeScale = Math.max(12, Math.min(18, Math.floor(z)))
  return { lat, lng, scale: safeScale }
}

function computeHomeView() {
  const paths: Path[] = []
  for (const rp of scheduleStore.routePatterns) {
    const path = scheduleStore.routePaths[rp.routeKey]
    if (path) paths.push(path)
  }
  return computeView(paths)
}
const HOME_VIEW = computeHomeView()
const centerLat = HOME_VIEW.lat
const centerLng = HOME_VIEW.lng
const latitude = ref(centerLat)
const longitude = ref(centerLng)
const scale = ref(HOME_VIEW.scale)

// ─── 路线显隐 ───
const visibleRoutes = ref<Set<string>>(new Set(['HX1_NORMAL', 'HX1_DINING', 'JB1_NORMAL', 'JB2_NORMAL']))
const showLabels = ref(true)
const legendItems = [
  { key: 'HX1_NORMAL', label: '环线1路' },
  { key: 'HX1_DINING', label: '就餐专线' },
  { key: 'JB1_NORMAL', label: '接驳1路' },
  { key: 'JB2_NORMAL', label: '接驳2路' },
]
function toggleRoute(key: string) {
  const next = new Set(visibleRoutes.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  visibleRoutes.value = next
}
function toggleLabels() { showLabels.value = !showLabels.value }

// ─── 路线折线（polyline，数据已是 GCJ-02，直接渲染） ───
const polyline = computed(() => {
  const lines: Array<{
    points: Array<{ latitude: number; longitude: number }>
    color: string; width: number; dottedLine: boolean
  }> = []
  for (const rp of scheduleStore.routePatterns) {
    if (!visibleRoutes.value.has(rp.routeKey)) continue
    const path = scheduleStore.routePaths[rp.routeKey]
    if (!path || path.length < 2) continue
    lines.push({
      points: path.map(([lng, lat]) => ({ latitude: lat, longitude: lng })),
      color: routeColorOf(rp.routeKey),
      width: 4,
      dottedLine: rp.routeKey === 'HX1_DINING',
    })
  }
  return lines
})

// ─── 站点 markers ───
// 站点名 + 圆点预先合成一张 PNG（scripts/gen_station_markers.py 生成），
// 运行期只给 marker 一个 iconPath。
//
// 【为什么不再用 callout / label，改动前务必看】
// 1. callout：微信 map 独立原生气泡，markers 增删、切换线路后会「圆点还在、名字不画」，
//    只在接驳线出现的站尤其容易丢。
// 2. label：anchorX/anchorY 的原点是「marker 对应的经纬度」，值是「把气泡放到哪个偏移处」，
//    不是微调量，极易摆错位置（曾把站名整体推到圆点左侧、或压在圆点上）。
// 3. 一个站只能用「一个 marker」：曾让圆点、站名各占一个 marker 且经纬度完全相同，
//    原生层把同坐标的 marker 合并，站名全部消失。
// 4. iconPath 是实测最稳的一层——公交车辆图标切换线路从未丢过。
// 因此改为「一张图搞定」：位置由图片内部布局决定，绝对可控，也不依赖原生文字层。
const STATION_DOT_ONLY = '/static/icons/stations/_dot-only.png'

// 站名 → marker id（稳定分配，只增不改）
const stationMarkerIdMap = new Map<string, number>()
let nextStationMarkerId = 1000
function stationMarkerId(name: string): number {
  let id = stationMarkerIdMap.get(name)
  if (id === undefined) {
    id = nextStationMarkerId++
    stationMarkerIdMap.set(name, id)
  }
  return id
}

const stationMarkers = computed(() => {
  const markers: Array<{
    id: number; latitude: number; longitude: number
    width: number; height: number; title: string
    iconPath: string; anchor: { x: number; y: number }
  }> = []
  const shown = new Map<string, { lat: number; lng: number }>()
  // 汇总可见路线上的站点（按路线专属坐标）
  for (const rp of scheduleStore.routePatterns) {
    if (!visibleRoutes.value.has(rp.routeKey)) continue
    const stops = scheduleStore.routeStops[rp.routeKey]
    if (!stops) continue
    for (const s of stops) {
      if (!shown.has(s.name)) shown.set(s.name, { lat: s.lat, lng: s.lng })
    }
  }
  const show = showLabels.value
  for (const [name, info] of shown) {
    const meta = STATION_MARKER_META[name]
    // 数据里新增了站但没重新跑生成脚本时，退化为只显示圆点，避免整块 marker 消失
    const iconPath = show && meta
      ? `/static/icons/stations/${name}.png`
      : STATION_DOT_ONLY
    markers.push({
      id: stationMarkerId(name),
      latitude: info.lat,
      longitude: info.lng,
      iconPath,
      width: show && meta ? meta.width : 7,
      height: show && meta ? meta.height : 7,
      // anchorY 由生成脚本给出：让圆点圆心正好落在站点经纬度上
      anchor: { x: 0.5, y: show && meta ? meta.anchorY : 0.5 },
      title: name,
    })
  }
  // 按 id 排序：保证数组顺序稳定，原生层对比新旧 markers 时不至于错乱
  markers.sort((a, b) => a.id - b.id)
  return markers
})

// ─── 公交位置（1 秒 tick + rAF 替代） ───
const busPositions = ref<BusPosition[]>([])
// 车辆图标按路线区分，与首页时间线共用 constants/routes.ts 的映射
// 图标画布是正方形，但车体只画在中间，下面还有两条轮胎。
// 微信 marker 的默认 anchor 是画布底边中点 {x:0.5, y:1}，那个点落在轮胎下方的透明留白里，
// 于是车被整体抬离线路上，旋转时也绕着车外的点公转。
// 这里把锚点放到「两个轮胎的接地点」——轮子压在线上，并且绕接地点旋转，
// 视觉上就是车在路上跑。数值来自对 PNG 逐像素扫描：
//   轮胎最底端 y / 画布高、两轮接地面中心 x / 画布宽
// 注意 anchor.y 越小 → 图片越往下：要让车更贴线就减小该值。
const BUS_ANCHOR: Record<string, { x: number; y: number }> = {
  // 环线1路/就餐专线：833×833，轮胎底 y=697，两轮中心 x=421
  HX1_NORMAL: { x: 0.506, y: 0.837 },
  HX1_DINING: { x: 0.506, y: 0.837 },
  // 接驳1/2路：861×833，轮胎底 y=610，两轮中心 x=438
  // 补偿史：0.732（轮胎底精确压线）→ 0.679（下移半个轮子 44px）
  //        → 0.890（在 0.679 基础上向上再抬 2 个轮子 176px，用户要求的「与线路多留一段距离」）。
  // 接驳车图标车身矮，贴线时视觉上仍像压住了线路，所以整体上抬留出间隙。
  // anchor 越大 → 图片越往上。
  JB1_NORMAL: { x: 0.509, y: 0.890 },
  JB2_NORMAL: { x: 0.509, y: 0.890 },
}

// departureId → marker id 固定映射：车辆增减时 id 不漂移，避免地图图标跳位
// 车辆 id 从 50000 起，与站点 id（1000 起、会随线路开关持续分配新号）彻底隔开，
// 避免长时间反复切换线路后两个号段撞车。
const busMarkerIdMap = new Map<string, number>()
let nextBusMarkerId = 50000
function busMarkerId(departureId: string): number {
  let id = busMarkerIdMap.get(departureId)
  if (id === undefined) {
    id = nextBusMarkerId++
    busMarkerIdMap.set(departureId, id)
  }
  return id
}
const busMarkers = computed(() =>
  busPositions.value.map((b) => {
    return {
      id: busMarkerId(b.departureId),
      latitude: b.lat,
      longitude: b.lng,
      iconPath: busIconOf(b.routeKey),
      width: b.routeKey.includes('HX1') ? 30 : 26,
      height: b.routeKey.includes('HX1') ? 30 : 26,
      // 锚点=轮胎接地点：轮子压在路线上，且绕接地点旋转
      anchor: BUS_ANCHOR[b.routeKey] || { x: 0.5, y: 1 },
      rotate: Math.round(b.heading - 90),
      title: `${b.route} ${b.shiftName}`.trim(),
    }
  })
)

// 合并后的 markers：必须用 computed，不能在模板里写 `[...a, ...b]`。
// 写在模板里的话，面板每秒走秒（nowTick）都会重建一次数组引用，
// 导致整套 markers（含所有站点图标）每秒被重新 setData 一次，
// 原生层频繁全量对比时更容易漏渲染站名。
const allMarkers = computed(() => [...stationMarkers.value, ...busMarkers.value])

// 用户位置使用 map 组件原生 show-location（蓝点，无需 marker）

function updateBusPositions() {
  const now = getNow()
  const dt = getDateType(now)
  const deps = scheduleStore.getDepartures(dt)
  const positions = computeActiveBusPositions(
    deps, scheduleStore.patternByKey, scheduleStore.stations, scheduleStore.routePaths, scheduleStore.routeStops, now
  )
  busPositions.value = positions.filter(p => visibleRoutes.value.has(p.routeKey))
}

let timer: ReturnType<typeof setInterval> | null = null
function startTimer() {
  updateBusPositions()
  if (!timer) {
    timer = setInterval(() => {
      // 驱动站点面板倒计时刷新（secondsNow 依赖 nowTick）
      nowTick.value++
      updateBusPositions()
    }, 1000)
  }
}
function stopTimer() { if (timer) { clearInterval(timer); timer = null } }

// ─── 从首页「在地图上查看」跳过来：只看该线路，并把视角落到车辆当前位置 ───
const mapFocus = useMapFocusStore()

function applyPendingFocus() {
  const target = mapFocus.takeFocus()
  if (!target) return
  // 与 H5 的 toggleRouteOnly 一致：只保留这条线路，避免别的线路和车抢视线
  visibleRoutes.value = new Set([target.routeKey])
  // 线路显隐决定车辆过滤，必须按新可见集合重算一次才能取到目标车
  updateBusPositions()

  const bus = busPositions.value.find(b => b.departureId === target.departureId)
  if (bus) {
    latitude.value = bus.lat
    longitude.value = bus.lng
    scale.value = 16
    return
  }

  // 不在路上（还没发车 / 已到终点）：computeActiveBusPositions 只返回运行中的车，
  // 此时定位到该班次的起点站或终点站——也就是车此刻实际停放的位置
  const fallback = resolveEndPoint(target)
  if (fallback) {
    latitude.value = fallback.lat
    longitude.value = fallback.lng
    scale.value = 16
    uni.showToast({
      title: fallback.before ? '该车次尚未发车，已定位到起点站' : '该车次已到终点，已定位到终点站',
      icon: 'none',
    })
    return
  }

  // 连预测数据都没有：至少把这条线路整条框进屏幕
  const path = scheduleStore.routePaths[target.routeKey]
  const view = path && path.length > 1 ? computeView([path]) : HOME_VIEW
  latitude.value = view.lat
  longitude.value = view.lng
  scale.value = view.scale
}

/**
 * 取该班次的起点站 / 终点站坐标。
 * routeStops 与 predictions 同序（stopSeq 从 1 起），直接按下标取，
 * 不能用站名查表——接驳环线里「激光所」等站在一圈中出现两次，坐标并不相同。
 */
function resolveEndPoint(target: { departureId: string; routeKey: string }) {
  const preds = scheduleStore.getPredictions(target.departureId)
  if (preds.length === 0) return null
  const rs = scheduleStore.routeStops[target.routeKey]
  if (!rs || rs.length === 0) return null
  const nowSec = getSecondsSinceMidnight(getNow())
  const depSec = (preds[0].departureMinutes ?? 0) * 60
  const before = nowSec < depSec
  const stop = rs[(before ? 0 : preds.length - 1)]
  if (!stop) return null
  return { lat: stop.lat, lng: stop.lng, before }
}

onShow(() => {
  startTimer()
  initLocation()
  applyPendingFocus()
})
onHide(stopTimer)
onUnmounted(stopTimer)

// ─── 点站面板 ───
const selectedStop = ref<string | null>(null)
const nowTick = ref(0)
const secondsNow = computed(() => { void nowTick.value; return getSecondsSinceMidnight(getNow()) })
/** 列表结构按分钟重建，倒计时文案仍逐秒派生（与首页同一策略） */
const minuteBaseSec = computed(() => Math.floor(secondsNow.value / 60) * 60)

function onMarkerTap(e: { detail: { markerId: number } }) {
  const id = e.detail.markerId
  // 站点 marker 从 stationMarkers 反查；公交 marker 不在此列，find 返回 undefined 自然忽略
  const m = stationMarkers.value.find(x => x.id === id)
  if (m) selectedStop.value = m.title
}
function closePanel() { selectedStop.value = null }

/**
 * 当前日期类型。
 *
 * 必须显式依赖 nowTick：地图是 tabBar 页，实例常驻不销毁，
 * 若 computed 里无响应式依赖，跨过午夜后会一直沿用昨天的日期类型，
 * 与每秒重算的车辆位置（computeActiveBusPositions 里每次现算）互相矛盾。
 */
const dateType = computed(() => { void nowTick.value; return getDateType(getNow()) })
const stopArrivals = computed(() => {
  if (!selectedStop.value) return []
  const base = minuteBaseSec.value
  const preds = scheduleStore.getPredictionsForStop(selectedStop.value, dateType.value)
  return preds
    .filter(p => !p.isDepartureStop)
    .map(p => {
      const delta = Math.round(p.arrivalMinutes * 60 - base)
      if (delta < -300 || delta > 3600) return null
      const departure = scheduleStore.departureById.get(p.departureId)
      if (!departure) return null
      return { pred: p, departure, arrivalMinutes: p.arrivalMinutes }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => a.arrivalMinutes - b.arrivalMinutes)
    .slice(0, 6)
})

/** 面板内逐秒倒计时（只重算文案，不重建列表） */
function stopEta(item: { arrivalMinutes: number }) {
  return arrivalCountdown(Math.round(item.arrivalMinutes * 60 - secondsNow.value))
}

// 图层：卫星影像 / 标准街道图（微信 map 原生支持），默认卫星
// 注意不能直接把 ref 初始化为 true：map 首帧创建时 enable-satellite 会被忽略
// （开发者工具实测如此，真机同样存在时序问题），必须等 map 实例就绪后再切换一次，
// 卫星瓦片才会真正加载。所以这里先用 false 初始化，onReady 后立刻打开。
const satellite = ref(false)
function toggleLayer() { satellite.value = !satellite.value }
onReady(() => {
  // 等 map 原生组件挂载完成再切，等价于用户手动点一次「卫星」
  setTimeout(() => { satellite.value = true }, 60)
})

// 定位按钮：没有坐标时先补一次定位（用户点了这个按钮 = 主动触发授权，符合平台规范）
async function recenterOnUser() {
  if (locationStore.userLat === null || locationStore.userLng === null) {
    if (locationStore.permissionDenied) {
      openSetting()
      return
    }
    const ok = await requestLocation()
    if (!ok) {
      uni.showToast({ title: '定位失败，请稍后重试', icon: 'none' })
      return
    }
  }
  const lat = locationStore.userLat
  const lng = locationStore.userLng
  if (lat === null || lng === null) return
  latitude.value = lat
  longitude.value = lng
  scale.value = 16
}
// 回中按钮：回到「进页面时的全图概览」，而不是某个站点
function recenterAll() {
  latitude.value = centerLat
  longitude.value = centerLng
  scale.value = HOME_VIEW.scale
}

// ─── 视野回写：用户手势拖动/缩放后同步 refs ───
// map 的 latitude/longitude/scale 是单向绑定：不把实际视野写回来，
// 就会出现「拖走以后点回中没反应」——因为 refs 还是旧值，赋值等于没变。
// 只跟随 causedBy === 'gesture' 的事件：程序化设置（定位/回中）与初始渲染
// 也会触发 regionchange，若一起回写会把尚未生效的中间状态存进 refs。
function onRegionChange(e: {
  type?: string
  detail?: {
    type?: string
    causedBy?: string
    scale?: number
    centerLocation?: { latitude: number; longitude: number }
  }
}) {
  const d = e?.detail
  if (!d) return
  if ((d.type || e.type) !== 'end') return
  if (d.causedBy !== 'gesture') return
  if (typeof d.scale === 'number') scale.value = d.scale
  if (d.centerLocation) {
    latitude.value = d.centerLocation.latitude
    longitude.value = d.centerLocation.longitude
  }
}
</script>

<template>
  <view class="map-page">
    <map
      id="campusMap"
      class="campus-map"
      :latitude="latitude"
      :longitude="longitude"
      :scale="scale"
      :markers="allMarkers"
      :polyline="polyline"
      :show-location="true"
      :enable-satellite="satellite"
      :enable-rotate="false"
      :enable-overlooking="false"
      @markertap="onMarkerTap"
      @regionchange="onRegionChange"
    />

    <!-- 图例 -->
    <view class="legend">
      <view
        v-for="item in legendItems" :key="item.key"
        class="legend-item" :class="{ off: !visibleRoutes.has(item.key) }"
        @tap="toggleRoute(item.key)"
      >
        <view class="legend-dot" :style="{ background: routeColorOf(item.key) }"></view>
        <text class="legend-label">{{ item.label }}</text>
        <image v-if="visibleRoutes.has(item.key)" class="legend-check" src="/static/icons/ui/check.png" mode="aspectFit" />
      </view>
      <view class="legend-divider"></view>
      <view class="legend-item" @tap="toggleLabels">
        <text class="legend-label">{{ showLabels ? '隐藏站名' : '显示站名' }}</text>
      </view>
      <!-- 车辆位置由发车时刻 + 站间秒数插值推算，不是车载 GPS 实时上报，
           必须讲清楚，否则用户会以为车真的在那个位置等它 -->
      <view class="legend-divider"></view>
      <view class="legend-note">车辆位置为时刻表推算</view>
    </view>

    <!-- 定位/回中/图层按钮 -->
    <view class="map-controls">
      <view class="ctrl-btn" @tap="recenterOnUser">
        <image class="ctrl-icon" src="/static/icons/ui/locate.png" mode="aspectFit" />
      </view>
      <view class="ctrl-btn" @tap="recenterAll">
        <image class="ctrl-icon" src="/static/icons/ui/reset.png" mode="aspectFit" />
      </view>
      <view class="ctrl-btn ctrl-btn-text" @tap="toggleLayer">{{ satellite ? '标准' : '卫星' }}</view>
    </view>

    <!-- 站点面板 -->
    <view v-if="selectedStop" class="stop-panel">
      <view class="panel-header">
        <text class="panel-title">{{ selectedStop }}</text>
        <image class="panel-close" src="/static/icons/ui/close.png" mode="aspectFit" @tap="closePanel" />
      </view>
      <scroll-view scroll-y class="panel-body">
        <view class="panel-inner">
          <view v-if="stopArrivals.length === 0" class="empty">当前时段无经过此站的班车</view>
          <view v-for="item in stopArrivals" :key="item.departure.recordId + '_' + item.pred.stopSeq" class="panel-row">
            <view class="route-badge" :style="{ background: routeColorOf(item.departure.routeKey) }">{{ routeLabelOf(item.departure) }}</view>
            <view class="panel-info">
              <text class="panel-time">{{ item.pred.arrivalTime }}</text>
              <text :class="etaClassOf(stopEta(item).status)">{{ stopEta(item).label }}</text>
              <view class="panel-note">
                <text class="panel-note-text">{{ item.departure.departureTime }} 发车 ·</text>
                <text :class="item.departure.departureMinutes * 60 <= secondsNow ? 'departed' : 'not-departed'">
                  {{ item.departure.departureMinutes * 60 <= secondsNow ? '已发车' : '未发车' }}
                </text>
              </view>
            </view>
          </view>
        </view>
      </scroll-view>
    </view>
  </view>
</template>

<style scoped>
.map-page { position: relative; width: 100%; height: 100vh; overflow: hidden; }
.campus-map { width: 100%; height: 100%; }

.legend {
  position: absolute; top: 20rpx; right: 20rpx; z-index: 10;
  background: rgba(255, 255, 255, 0.96); border-radius: 16rpx; padding: 10rpx 6rpx;
  box-shadow: 0 4rpx 20rpx rgba(0, 0, 0, 0.12); min-width: 220rpx;
}
.legend-item { display: flex; align-items: center; gap: 12rpx; padding: 10rpx 16rpx; }
.legend-item.off { opacity: 0.35; }
.legend-dot { width: 20rpx; height: 20rpx; border-radius: 50%; flex-shrink: 0; }
.legend-label { flex: 1; font-size: 24rpx; color: var(--color-text); }
.legend-check { width: 26rpx; height: 26rpx; flex-shrink: 0; }
.legend-divider { height: 1rpx; background: var(--color-border); margin: 6rpx 12rpx; }
.legend-note { font-size: 19rpx; color: var(--color-text-tertiary); padding: 0 16rpx 10rpx; line-height: 1.4; }

/* 右侧按钮贴右下角：底部留 32rpx，避开 tabBar（tabBar 由原生渲染，不占页面高度） */
.map-controls { position: absolute; bottom: 32rpx; right: 20rpx; z-index: 10; display: flex; flex-direction: column; gap: 16rpx; }
.ctrl-btn {
  width: 76rpx; height: 76rpx; background: var(--color-card); border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 36rpx; color: var(--color-primary);
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.15);
}
.ctrl-icon { width: 36rpx; height: 36rpx; }
.ctrl-btn-text { font-size: 22rpx; font-weight: 600; }

.stop-panel {
  position: absolute; left: 0; right: 0; bottom: 0; z-index: 20;
  background: var(--color-card); border-radius: 24rpx 24rpx 0 0;
  box-shadow: 0 -8rpx 32rpx rgba(0, 0, 0, 0.1); max-height: 50vh;
  display: flex; flex-direction: column;
}
.panel-header { display: flex; justify-content: space-between; align-items: center; padding: 24rpx 28rpx; border-bottom: 1rpx solid var(--color-border); }
.panel-title { font-size: 32rpx; font-weight: 600; }
.panel-close { width: 34rpx; height: 34rpx; padding: 0 8rpx; }
.panel-body { max-height: 40vh; }
/* scroll-view 的横向内边距在部分基础库会被内容宽度吃掉，改用内层容器加 padding */
.panel-inner { padding: 0 28rpx 28rpx; box-sizing: border-box; }
.panel-row { display: flex; align-items: flex-start; gap: 16rpx; padding: 18rpx 0; border-bottom: 1rpx solid var(--color-divider); }
/* 徽标在窄面板里要更收紧一些，其余尺寸由全局 .route-badge 决定 */
.panel-row .route-badge { font-size: 20rpx; padding: 4rpx 12rpx; max-width: 176rpx; }
.panel-info { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; align-items: flex-end; gap: 2rpx; }
.panel-time { font-size: 30rpx; font-weight: 700; font-variant-numeric: tabular-nums; max-width: 100%; white-space: nowrap; }
.panel-note { display: flex; align-items: center; gap: 6rpx; max-width: 100%; white-space: nowrap; overflow: hidden; }
.panel-note-text { font-size: 20rpx; color: var(--color-text-secondary); }
.panel-note .departed { font-size: 20rpx; color: var(--color-success); }
.panel-note .not-departed { font-size: 20rpx; color: var(--color-danger); }
/* 面板宽度有限，倒计时字号收到 24rpx 并允许省略 */
.panel-info .eta { font-size: 24rpx; max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
</style>
