<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, onActivated, onDeactivated, watch, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import { useScheduleStore } from '@/stores/schedule'
import { useMapStore } from '@/stores/map'
import { useGeolocation } from '@/composables/useGeolocation'
import { getDateType } from '@/utils/datetime'
import { computeActiveBusPositions } from '@/utils/bus_position'
import { wgs84ToPixel } from '@/utils/map_project'
import { getNow } from '@/utils/time'
import MapLegend from '@/components/map/MapLegend.vue'
import StopInfoPanel from '@/components/map/StopInfoPanel.vue'
import type { BusPosition } from '@/types'

const scheduleStore = useScheduleStore()
const mapStore = useMapStore()
const route = useRoute()
useGeolocation()

const mapContainer = ref<HTMLDivElement>()
const overlayLayer = ref<HTMLDivElement>()
const mapLoading = ref(true)

// ---- 底图参数 ----
const IMG_W = 2816
const IMG_H = 2816

// ---- 路线颜色 ----
const ROUTE_COLORS: Record<string, string> = {
  HX1_NORMAL: '#2563EB', HX1_DINING: '#F59E0B',
  JB1_NORMAL: '#10B981', JB2_NORMAL: '#8B5CF6',
}
function getRouteColor(key: string) { return ROUTE_COLORS[key] || '#6B7280' }

// ---- 班次数字提取 ----
const CN: Record<string, number> = { 一:1,二:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10 }
function extractShiftNum(name: string): number | null {
  for (const [cn, n] of Object.entries(CN)) { if (name.includes(cn)) return n }
  return null
}

// ---- 公交车图标 ----
const BASE_URL = import.meta.env.BASE_URL
// TODO: 接驳1/2路暂沿用原环线2/3路图标，待新图标素材后替换
const BUS_ICON: Record<string, string> = {
  HX1_NORMAL: 'icons/环线1路.png', HX1_DINING: 'icons/就餐专线.png',
  JB1_NORMAL: 'icons/环线2路.png', JB2_NORMAL: 'icons/环线3路.png',
}
function busIconHtml(rk: string, shift: string, heading: number): string {
  const file = BUS_ICON[rk] || BUS_ICON['HX1_NORMAL']
  const sz = rk.includes('HX1') ? 42 : 36
  const badge = extractShiftNum(shift)
  const badgeHtml = badge !== null
    ? `<div style="position:absolute;top:-8px;right:-8px;width:18px;height:18px;background:#DC2626;border-radius:50%;color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;line-height:1;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.3);z-index:2">${badge}</div>`
    : ''
  return `<div style="position:relative;width:${sz}px;height:${sz}px"><img src="${BASE_URL}${file}" width="${sz}" height="${sz}" style="display:block;filter:drop-shadow(0 2px 3px rgba(0,0,0,0.3));transform:rotate(${heading - 90}deg)">${badgeHtml}</div>`
}

// ---- 平移缩放 ----
const panX = ref(0)
const panY = ref(0)
const scale = ref(1)
const MAX_SCALE = 4

const layerStyle = computed(() => ({
  width: IMG_W + 'px', height: IMG_H + 'px',
  transform: `translate(${panX.value}px,${panY.value}px) scale(${scale.value})`,
  transformOrigin: '0 0',
}))

// ---- 边界限制（防止显示黑色区域）----
function clampPan() {
  const vw = mapContainer.value?.clientWidth ?? window.innerWidth
  const vh = mapContainer.value?.clientHeight ?? window.innerHeight
  const scaledW = IMG_W * scale.value
  const scaledH = IMG_H * scale.value
  panX.value = Math.min(0, Math.max(vw - scaledW, panX.value))
  panY.value = Math.min(0, Math.max(vh - scaledH, panY.value))
}

// 最小缩放：图片至少能占满屏幕
const MIN_SCALE = computed(() => {
  const vw = mapContainer.value?.clientWidth ?? window.innerWidth
  const vh = mapContainer.value?.clientHeight ?? window.innerHeight
  return Math.max(vw / IMG_W, vh / IMG_H)
})

// 判断地图是否偏离太远
const isMapLost = computed(() => {
  const vw = mapContainer.value?.clientWidth ?? window.innerWidth
  const vh = mapContainer.value?.clientHeight ?? window.innerHeight
  const imgRight = panX.value + IMG_W * scale.value
  const imgBottom = panY.value + IMG_H * scale.value
  return imgRight < 0 || panX.value > vw || imgBottom < 0 || panY.value > vh
})

// ---- 单指拖拽 ----
let isDragging = false
let lastX = 0, lastY = 0

function onPointerDown(e: PointerEvent) {
  if (e.pointerType === 'touch' && (e as any).isPrimary === false) return
  isDragging = true; lastX = e.clientX; lastY = e.clientY
  ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
}
function onPointerMove(e: PointerEvent) {
  if (!isDragging) return
  panX.value += e.clientX - lastX
  panY.value += e.clientY - lastY
  lastX = e.clientX; lastY = e.clientY
  clampPan()
}
function onPointerUp() { isDragging = false }

// ---- 滚轮缩放（以光标为中心） ----
function onWheel(e: WheelEvent) {
  e.preventDefault()
  const factor = e.deltaY > 0 ? 0.9 : 1.1
  const newScale = Math.max(MIN_SCALE.value, Math.min(MAX_SCALE, scale.value * factor))
  const ratio = newScale / scale.value
  panX.value = e.clientX - (e.clientX - panX.value) * ratio
  panY.value = e.clientY - (e.clientY - panY.value) * ratio
  scale.value = newScale
  clampPan()
}

// ---- 双击缩放（以点击位置为中心） ----
function onDblClick(e: MouseEvent) {
  e.preventDefault()
  const newScale = Math.min(MAX_SCALE, scale.value * 1.5)
  const ratio = newScale / scale.value
  panX.value = e.clientX - (e.clientX - panX.value) * ratio
  panY.value = e.clientY - (e.clientY - panY.value) * ratio
  scale.value = newScale
  clampPan()
}

// ---- 双指缩放（以双指中心为基准） ----
let pinchDist = 0, pinchScale = 1
let pinchCenterX = 0, pinchCenterY = 0, pinchPanX = 0, pinchPanY = 0

function onTouchStart(e: TouchEvent) {
  if (e.touches.length === 2) {
    e.preventDefault()
    const dx = e.touches[0].clientX - e.touches[1].clientX
    const dy = e.touches[0].clientY - e.touches[1].clientY
    pinchDist = Math.hypot(dx, dy)
    pinchScale = scale.value
    pinchCenterX = (e.touches[0].clientX + e.touches[1].clientX) / 2
    pinchCenterY = (e.touches[0].clientY + e.touches[1].clientY) / 2
    pinchPanX = panX.value
    pinchPanY = panY.value
    isDragging = false
  }
}
function onTouchMove(e: TouchEvent) {
  if (e.touches.length === 2) {
    e.preventDefault()
    const dx = e.touches[0].clientX - e.touches[1].clientX
    const dy = e.touches[0].clientY - e.touches[1].clientY
    const dist = Math.hypot(dx, dy)
    const newScale = Math.max(MIN_SCALE.value, Math.min(MAX_SCALE, pinchScale * (dist / pinchDist)))
    const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2
    const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2
    const ratio = newScale / pinchScale
    panX.value = cx - (pinchCenterX - pinchPanX) * ratio
    panY.value = cy - (pinchCenterY - pinchPanY) * ratio
    scale.value = newScale
    clampPan()
  }
}

// ---- 定位按钮 ----
function recenterOnUser() {
  if (mapStore.userLat === null || mapStore.userLng === null) return
  const p = wgs84ToPixel(mapStore.userLng, mapStore.userLat)
  const vw = mapContainer.value?.clientWidth ?? window.innerWidth
  const vh = mapContainer.value?.clientHeight ?? window.innerHeight
  scale.value = 1.6
  panX.value = vw / 2 - p.x * scale.value
  panY.value = vh / 2 - p.y * scale.value
  clampPan()
  mapStore.recenterOnUser()
}

// 一键回中（显示整个校园线路）
function recenterMap() {
  const vw = mapContainer.value?.clientWidth ?? window.innerWidth
  const vh = mapContainer.value?.clientHeight ?? window.innerHeight

  let minLng = Infinity, maxLng = -Infinity
  let minLat = Infinity, maxLat = -Infinity

  for (const station of scheduleStore.stations) {
    minLng = Math.min(minLng, station.lng)
    maxLng = Math.max(maxLng, station.lng)
    minLat = Math.min(minLat, station.lat)
    maxLat = Math.max(maxLat, station.lat)
  }

  const centerLng = (minLng + maxLng) / 2
  const centerLat = (minLat + maxLat) / 2
  const centerPx = wgs84ToPixel(centerLng, centerLat)

  const topLeft = wgs84ToPixel(minLng, maxLat)
  const bottomRight = wgs84ToPixel(maxLng, minLat)
  const boundsW = bottomRight.x - topLeft.x
  const boundsH = bottomRight.y - topLeft.y

  const paddingTop = 60
  const paddingBottom = 30
  const paddingLeft = 50
  const paddingRight = 50
  const scaleX = (vw - paddingLeft - paddingRight) / boundsW
  const scaleY = (vh - paddingTop - paddingBottom) / boundsH
  const initialScale = Math.min(scaleX, scaleY, 0.6)

  scale.value = initialScale
  panX.value = vw / 2 - centerPx.x * scale.value
  panY.value = (vh - paddingBottom + paddingTop) / 2 - centerPx.y * scale.value
  clampPan()
}

// ---- 路线折线像素坐标 ----
const routeLines = computed(() => {
  const lines: Array<{ points: string; color: string; dashed: boolean }> = []
  for (const p of scheduleStore.routePatterns) {
    if (!mapStore.visibleRoutes.has(p.routeKey)) continue
    const path = scheduleStore.routePaths[p.routeKey]
    if (!path || path.length < 2) continue
    const pts = path.map(([lng, lat]) => { const px = wgs84ToPixel(lng, lat); return `${px.x},${px.y}` }).join(' ')
    lines.push({ points: pts, color: getRouteColor(p.routeKey), dashed: p.routeKey === 'HX1_DINING' })
  }
  return lines
})

// ---- 站点标记 ----
interface StationMarker { x: number; y: number; name: string; color: string; rk: string }

const stationMarkers = computed<StationMarker[]>(() => {
  const markers: StationMarker[] = []
  const shown = new Set<string>()
  for (const p of scheduleStore.routePatterns) {
    if (!mapStore.visibleRoutes.has(p.routeKey)) continue
    const stops = scheduleStore.routeStops[p.routeKey]
    if (!stops) continue
    const color = getRouteColor(p.routeKey)
    for (const s of stops) {
      const key = `${p.routeKey}|${s.name}|${s.lat.toFixed(6)}|${s.lng.toFixed(6)}`
      if (shown.has(key)) continue
      shown.add(key)
      const px = wgs84ToPixel(s.lng, s.lat)
      markers.push({ x: px.x, y: px.y, name: s.name, color, rk: p.routeKey })
    }
  }
  return markers
})

// ---- 公交车位置 ----
const busPositions = ref<BusPosition[]>([])
const busMarkers = computed(() => busPositions.value.map(b => {
  const px = wgs84ToPixel(b.lng, b.lat)
  return { ...b, px: px.x, py: px.y }
}))

// ---- 用户位置 ----
const userPixel = computed(() => {
  if (mapStore.userLat === null || mapStore.userLng === null) return null
  return wgs84ToPixel(mapStore.userLng, mapStore.userLat)
})

// ---- 动画循环 ----
let animFrameId: number | null = null
const trackedBusId = ref<string | null>(null)

function animate() {
  const now = getNow()
  const dt = getDateType(now)
  const deps = scheduleStore.getDepartures(dt)
  const patternMap = new Map(scheduleStore.routePatterns.map(rp => [rp.routeKey, rp]))
  const positions = computeActiveBusPositions(deps, patternMap, scheduleStore.stations, scheduleStore.routePaths, scheduleStore.routeStops, now)
  const visible = positions.filter(p => mapStore.visibleRoutes.has(p.routeKey))
  busPositions.value = visible
  mapStore.setBusPositions(visible)

  if (trackedBusId.value) {
    const t = visible.find(p => p.departureId === trackedBusId.value)
    if (t) {
      const px = wgs84ToPixel(t.lng, t.lat)
      const vw = mapContainer.value?.clientWidth ?? window.innerWidth
      const vh = mapContainer.value?.clientHeight ?? window.innerHeight
      scale.value = 1.6
      panX.value = vw / 2 - px.x * scale.value
      panY.value = vh / 2 - px.y * scale.value
      clampPan()
      trackedBusId.value = null
    }
  }
  animFrameId = requestAnimationFrame(animate)
}

function selectStop(name: string) { mapStore.selectStop(name) }

// ---- 初始化 ----
let initializing = false

function initMapView() {
  if (scheduleStore.stations.length === 0) return

  const vw = mapContainer.value?.clientWidth ?? window.innerWidth
  const vh = mapContainer.value?.clientHeight ?? window.innerHeight

  let minLng = Infinity, maxLng = -Infinity
  let minLat = Infinity, maxLat = -Infinity

  for (const station of scheduleStore.stations) {
    minLng = Math.min(minLng, station.lng)
    maxLng = Math.max(maxLng, station.lng)
    minLat = Math.min(minLat, station.lat)
    maxLat = Math.max(maxLat, station.lat)
  }

  const centerLng = (minLng + maxLng) / 2
  const centerLat = (minLat + maxLat) / 2
  const centerPx = wgs84ToPixel(centerLng, centerLat)

  const topLeft = wgs84ToPixel(minLng, maxLat)
  const bottomRight = wgs84ToPixel(maxLng, minLat)
  const boundsW = bottomRight.x - topLeft.x
  const boundsH = bottomRight.y - topLeft.y

  const paddingTop = 50
  const paddingBottom = 20
  const paddingLeft = 40
  const paddingRight = 40
  const scaleX = (vw - paddingLeft - paddingRight) / boundsW
  const scaleY = (vh - paddingTop - paddingBottom) / boundsH
  const initialScale = Math.min(scaleX, scaleY, 0.7)

  scale.value = initialScale
  panX.value = vw / 2 - centerPx.x * scale.value
  panY.value = (vh - paddingBottom + paddingTop) / 2 - centerPx.y * scale.value
  clampPan()

  initializing = true
  const q = route.query
  if (q.route) { mapStore.toggleRouteOnly(q.route as string) }
  else { mapStore.setAllRoutesVisible() }
  initializing = false

  animFrameId = requestAnimationFrame(animate)
  if (q.bus) trackedBusId.value = q.bus as string

  mapLoading.value = false
}

onMounted(() => {
  initMapView()
})

onActivated(() => {
  // 从其他 tab 切回来时恢复动画
  if (animFrameId === null && scheduleStore.isDataLoaded) {
    animFrameId = requestAnimationFrame(animate)
  }
})

onDeactivated(() => {
  // 切到其他 tab 时暂停动画，省电
  if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null }
})

// 核心性能优化：
// 所有 overlay 元素（路线、站点、公交、标签）不通过 Vue 响应式更新样式，
// 而是通过 CSS 自定义属性 + calc() 让浏览器 CSS 引擎一次性计算所有元素位置。
// 每次拖拽/缩放只需 3 次 setProperty 调用，与元素数量无关。
watchEffect(() => {
  if (!overlayLayer.value) return
  overlayLayer.value.style.setProperty('--scale', String(scale.value))
  overlayLayer.value.style.setProperty('--panX', String(panX.value))
  overlayLayer.value.style.setProperty('--panY', String(panY.value))
})

watch(() => scheduleStore.isDataLoaded, (loaded) => {
  if (loaded) initMapView()
})

onUnmounted(() => {
  if (animFrameId) cancelAnimationFrame(animFrameId)
})

</script>

<template>
  <div class="map-page">
    <div v-if="mapLoading" class="map-loading">
      <van-loading size="32" />
      <span>加载地图...</span>
    </div>

    <div ref="mapContainer" class="map-viewport"
      @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="onPointerUp"
      @wheel.prevent="onWheel" @dblclick.prevent="onDblClick"
      @touchstart.passive="onTouchStart" @touchmove="onTouchMove"
      style="touch-action:none">

      <!-- 图层 0：卫星底图（独立图层，CSS transform 驱动） -->
      <div class="map-layer" :style="layerStyle">
        <img :src="`${BASE_URL}data/campus-satellite.jpg`" :width="IMG_W" :height="IMG_H"
          style="display:block;user-select:none;pointer-events:none;will-change:transform;transform:translateZ(0);backface-visibility:hidden"
          decoding="async" loading="lazy" draggable="false">
      </div>

      <!-- 图层 1：所有 overlay（SVG 路线 + 站点圆点 + 公交 + 用户 + 标签）
           CSS 自定义属性 --scale/--panX/--panY 由 watchEffect 直接写入 DOM，
           完全不经过 Vue 响应式系统。浏览器 CSS 引擎用 calc() 统一计算所有位置。 -->
      <div ref="overlayLayer" class="overlay-layer">

        <!-- SVG 路线：vector-effect 让线宽永远清晰不模糊 -->
        <svg class="route-svg">
          <g class="route-group">
            <polyline v-for="(line, i) in routeLines" :key="'l'+i"
              :points="line.points" fill="none" :stroke="line.color"
              stroke-width="3.5" stroke-opacity="0.7"
              :stroke-dasharray="line.dashed ? '10 6' : undefined"
              stroke-linecap="round" stroke-linejoin="round"
              vector-effect="non-scaling-stroke" />
          </g>
        </svg>

        <!-- 站点圆点 -->
        <div v-for="(m, i) in stationMarkers" :key="'sd'+i"
          :style="{ '--x': m.x, '--y': m.y }"
          class="station-dot"
          @click.stop="selectStop(m.name)">
          <div class="station-dot-inner" :style="{ background: m.color }"></div>
        </div>

        <!-- 用户蓝点 -->
        <div v-if="userPixel"
          :style="{ '--x': userPixel.x, '--y': userPixel.y }"
          class="user-dot">
          <div class="user-dot-outer"></div>
          <div class="user-dot-inner"></div>
        </div>

        <!-- 公交车图标 -->
        <div v-for="b in busMarkers" :key="b.departureId"
          :style="{ '--x': b.px, '--y': b.py }"
          class="bus-marker"
          v-html="busIconHtml(b.routeKey, b.shiftName, b.heading)" />

        <!-- 站点标签 -->
        <template v-if="mapStore.showLabels">
          <div v-for="(m, i) in stationMarkers" :key="'sl'+i"
            :style="{ '--x': m.x, '--y': m.y }"
            class="station-label"
            @click.stop="selectStop(m.name)">
            <div :style="{
              background: m.color, borderRadius: '4px',
              padding: '2px 6px', whiteSpace: 'nowrap',
              display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: '1'
            }">
              <span class="station-label-text">{{ m.name }}</span>
            </div>
          </div>
        </template>

      </div>

      <MapLegend />
      <!-- 阻止冒泡：快速点击定位/回中按钮时避免触发双击缩放与拖拽 -->
      <div class="map-controls" @dblclick.stop @pointerdown.stop @touchstart.stop>
        <div v-if="isMapLost" class="locate-btn recenter-btn" @click="recenterMap">
          <van-icon name="replay" size="20" />
        </div>
        <div class="locate-btn" @click="recenterOnUser">
          <van-icon name="aim" size="20" />
        </div>
      </div>
      <StopInfoPanel />
    </div>
  </div>
</template>

<style scoped>
/* ===== CSS @property 注册：让自定义属性在 calc() 中作为数值参与运算 ===== */
@property --scale {
  syntax: '<number>';
  initial-value: 1;
  inherits: true;
}
@property --panX {
  syntax: '<number>';
  initial-value: 0;
  inherits: true;
}
@property --panY {
  syntax: '<number>';
  initial-value: 0;
  inherits: true;
}

.map-page {
  position: relative; width: 100%; height: calc(100vh - 60px);
  overflow: hidden; background: #1a1a1a;
}
.map-viewport {
  width: 100%; height: 100%; overflow: hidden; cursor: grab;
  position: relative;
}
.map-viewport:active { cursor: grabbing; }

/* ---- 卫星底图层 ---- */
.map-layer {
  position: absolute; top: 0; left: 0;
  will-change: transform;
}

/* ---- Overlay 层：所有非底图元素，CSS 自定义属性驱动定位 ---- */
.overlay-layer {
  position: absolute; top: 0; left: 0;
  width: 100%; height: 100%;
  pointer-events: none;
}

/* ---- SVG 路线 ---- */
.route-svg {
  position: absolute; top: 0; left: 0;
  width: 100%; height: 100%;
  overflow: visible;
  pointer-events: none;
}
.route-group {
  transform: translate(calc(var(--panX) * 1px), calc(var(--panY) * 1px)) scale(var(--scale));
  transform-origin: 0 0;
}

/* ---- 站点圆点（固定 8px，永远清晰） ---- */
.station-dot {
  position: absolute;
  transform: translate(
    calc(var(--x) * var(--scale) * 1px + var(--panX) * 1px),
    calc(var(--y) * var(--scale) * 1px + var(--panY) * 1px)
  ) translate(-50%, -50%);
  pointer-events: auto; cursor: pointer;
  z-index: 10;
}
.station-dot-inner {
  width: 8px; height: 8px; border-radius: 50%;
  border: 2px solid white;
  box-shadow: 0 1px 2px rgba(0,0,0,0.3);
}

/* ---- 用户蓝点（固定大小，永远清晰） ---- */
.user-dot {
  position: absolute;
  transform: translate(
    calc(var(--x) * var(--scale) * 1px + var(--panX) * 1px),
    calc(var(--y) * var(--scale) * 1px + var(--panY) * 1px)
  ) translate(-50%, -50%);
  pointer-events: none;
  z-index: 20;
}
.user-dot-outer {
  width: 16px; height: 16px; border-radius: 50%;
  background: rgba(59,130,246,0.2);
}
.user-dot-inner {
  width: 10px; height: 10px; border-radius: 50%;
  background: #3B82F6;
  border: 3px solid white;
  position: absolute; top: 3px; left: 3px;
}

/* ---- 公交图标（固定大小，heading 由内联 HTML 处理） ---- */
.bus-marker {
  position: absolute;
  transform: translate(
    calc(var(--x) * var(--scale) * 1px + var(--panX) * 1px),
    calc(var(--y) * var(--scale) * 1px + var(--panY) * 1px)
  ) translate(-50%, -50%);
  pointer-events: none;
  z-index: 15;
}

/* ---- 站点标签（固定 10px 字体，永远清晰） ---- */
.station-label {
  position: absolute;
  transform: translate(
    calc(var(--x) * var(--scale) * 1px + var(--panX) * 1px),
    calc(var(--y) * var(--scale) * 1px + var(--panY) * 1px)
  ) translate(-50%, calc(-100% - 5px));
  pointer-events: auto; cursor: pointer;
  z-index: 10;
}
.station-label-text {
  color: white; font-size: 10px; font-weight: 600;
  font-family: PingFang SC, Microsoft YaHei, sans-serif;
}

/* ---- 控件 ---- */
.map-loading {
  position: absolute; top: 0; left: 0; right: 0; bottom: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  background: var(--color-bg); z-index: 100; gap: 12px;
}
.map-controls {
  position: absolute; bottom: 60px; right: 16px; z-index: 60;
}
.locate-btn {
  width: 44px; height: 44px; background: var(--color-card); border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 2px 10px rgba(0,0,0,0.15); cursor: pointer; color: var(--color-primary);
  margin-bottom: 10px;
}
.locate-btn:active { background: #F3F4F6; }
.recenter-btn { color: #F59E0B; }
</style>
