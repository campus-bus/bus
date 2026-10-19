<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import { onShow, onHide } from '@dcloudio/uni-app'
import { useScheduleStore } from '@/stores/schedule'
import { useLocationStore } from '@/stores/location'
import { useGeolocation } from '@/composables/useGeolocation'
import { getDateType, getSecondsSinceMidnight } from '@/utils/datetime'
import { getNow } from '@/utils/time'
import { computeActiveBusPositions } from '@/utils/bus_position'
import { wgs84ToGcj02 } from '@/utils/geo'
import { arrivalCountdown } from '@/utils/countdown'
import type { BusPosition, ArrivalPrediction } from '@/types'

const scheduleStore = useScheduleStore()
const locationStore = useLocationStore()
// 地图页本身就是位置功能页：进入时请求定位（内部会先过隐私协议授权）
useGeolocation({ autoStart: true })

// ─── 地图中心（研究生宿舍楼，GCJ-02） ───
const [centerLng, centerLat] = wgs84ToGcj02(113.045661, 28.257994)
const latitude = ref(centerLat)
const longitude = ref(centerLng)
const scale = ref(15)

// ─── 路线显隐 ───
const visibleRoutes = ref<Set<string>>(new Set(['HX1_NORMAL', 'HX1_DINING', 'JB1_NORMAL', 'JB2_NORMAL']))
const showLabels = ref(true)
const legendItems = [
  { key: 'HX1_NORMAL', label: '环线1路', color: '#2563EB' },
  { key: 'HX1_DINING', label: '就餐专线', color: '#F59E0B' },
  { key: 'JB1_NORMAL', label: '接驳1路', color: '#10B981' },
  { key: 'JB2_NORMAL', label: '接驳2路', color: '#8B5CF6' },
]
function toggleRoute(key: string) {
  const next = new Set(visibleRoutes.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  visibleRoutes.value = next
}
function toggleLabels() { showLabels.value = !showLabels.value }

// ─── 路线折线（polyline，WGS-84→GCJ-02） ───
const ROUTE_COLORS: Record<string, string> = {
  HX1_NORMAL: '#2563EB', HX1_DINING: '#F59E0B',
  JB1_NORMAL: '#10B981', JB2_NORMAL: '#8B5CF6',
}
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
      points: path.map(([lng, lat]) => {
        const [glng, glat] = wgs84ToGcj02(lng, lat)
        return { latitude: glat, longitude: glng }
      }),
      color: ROUTE_COLORS[rp.routeKey] || '#6B7280',
      width: 4,
      dottedLine: rp.routeKey === 'HX1_DINING',
    })
  }
  return lines
})

// ─── 站点 markers ───
const stationMarkers = computed(() => {
  const markers: Array<{
    id: number; latitude: number; longitude: number
    width: number; height: number; title: string
    callout?: object; label?: object
  }> = []
  const shown = new Map<string, { lat: number; lng: number; routes: string[] }>()
  // 汇总可见路线上的站点（按路线专属坐标）
  for (const rp of scheduleStore.routePatterns) {
    if (!visibleRoutes.value.has(rp.routeKey)) continue
    const stops = scheduleStore.routeStops[rp.routeKey]
    if (!stops) continue
    for (const s of stops) {
      if (!shown.has(s.name)) shown.set(s.name, { lat: s.lat, lng: s.lng, routes: [] })
      shown.get(s.name)!.routes.push(rp.routeKey)
    }
  }
  let id = 1000
  for (const [name, info] of shown) {
    const [glng, glat] = wgs84ToGcj02(info.lng, info.lat)
    markers.push({
      id: id++,
      latitude: glat,
      longitude: glng,
      width: 1, height: 1, // 用 callout 画点，图标透明
      title: name,
      callout: {
        content: showLabels.value ? name : ' ',
        color: '#FFFFFF',
        fontSize: 10,
        borderRadius: 4,
        bgColor: ROUTE_COLORS[info.routes[0]] || '#6B7280',
        padding: 3,
        display: 'ALWAYS',
        anchorY: -6,
      },
      label: {
        content: '●',
        color: '#FFFFFF',
        fontSize: 8,
        anchorX: -4,
        anchorY: -4,
      },
    })
  }
  return markers
})

// ─── 公交位置（1 秒 tick + rAF 替代） ───
const busPositions = ref<BusPosition[]>([])
const BUS_ICON: Record<string, string> = {
  HX1_NORMAL: '/static/icons/环线1路.png',
  HX1_DINING: '/static/icons/就餐专线.png',
  JB1_NORMAL: '/static/icons/接驳1路.png',
  JB2_NORMAL: '/static/icons/接驳2路.png',
}
// departureId → marker id 固定映射：车辆增减时 id 不漂移，避免地图图标跳位
const busMarkerIdMap = new Map<string, number>()
let nextBusMarkerId = 2001
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
    const [glng, glat] = wgs84ToGcj02(b.lng, b.lat)
    return {
      id: busMarkerId(b.departureId),
      latitude: glat,
      longitude: glng,
      iconPath: BUS_ICON[b.routeKey] || BUS_ICON.HX1_NORMAL,
      width: b.routeKey.includes('HX1') ? 30 : 26,
      height: b.routeKey.includes('HX1') ? 30 : 26,
      rotate: Math.round(b.heading - 90),
      title: `${b.route} ${b.shiftName}`.trim(),
    }
  })
)

// 用户位置使用 map 组件原生 show-location（蓝点，无需 marker）

function updateBusPositions() {
  const now = getNow()
  const dt = getDateType(now)
  const deps = scheduleStore.getDepartures(dt)
  const patternMap = new Map(scheduleStore.routePatterns.map(rp => [rp.routeKey, rp]))
  const positions = computeActiveBusPositions(
    deps, patternMap, scheduleStore.stations, scheduleStore.routePaths, scheduleStore.routeStops, now
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
onShow(startTimer)
onHide(stopTimer)
onUnmounted(stopTimer)

// ─── 点站面板 ───
const selectedStop = ref<string | null>(null)
const nowTick = ref(0)
const secondsNow = computed(() => { void nowTick.value; return getSecondsSinceMidnight(getNow()) })

function onMarkerTap(e: { detail: { markerId: number } }) {
  const id = e.detail.markerId
  if (id >= 1000 && id < 2000) {
    const m = stationMarkers.value.find(x => x.id === id)
    if (m) selectedStop.value = m.title
  }
}
function closePanel() { selectedStop.value = null }

const dateType = computed(() => getDateType(getNow()))
const stopArrivals = computed(() => {
  if (!selectedStop.value) return []
  const preds = scheduleStore.getPredictionsForStop(selectedStop.value, dateType.value)
  return preds
    .filter(p => !p.isDepartureStop)
    .map(p => {
      const delta = Math.round(p.arrivalMinutes * 60 - secondsNow.value)
      if (delta < -300 || delta > 3600) return null
      const departure = scheduleStore.departures.find(d => d.recordId === p.departureId)
      if (!departure) return null
      const { label, status } = arrivalCountdown(delta)
      return { pred: p, departure, secondsUntil: delta, label, status }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => a.secondsUntil - b.secondsUntil)
    .slice(0, 6)
})

function routeColor(routeKey?: string) { return ROUTE_COLORS[routeKey || ''] || '#6B7280' }
function routeNameOf(routeKey: string, route: string) {
  return routeKey === 'HX1_DINING' ? '环1·就餐' : route
}
function etaClass(status?: string) {
  return status === 'urgent' ? 'eta urgent' : status === 'warning' ? 'eta warning'
    : status === 'arrived' ? 'eta arrived' : status === 'passed' ? 'eta passed' : 'eta'
}

// 定位按钮
function recenterOnUser() {
  if (locationStore.userLat === null || locationStore.userLng === null) return
  const [glng, glat] = wgs84ToGcj02(locationStore.userLng, locationStore.userLat)
  latitude.value = glat
  longitude.value = glng
  scale.value = 16
}
function recenterAll() {
  latitude.value = centerLat
  longitude.value = centerLng
  scale.value = 15
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
      :markers="[...stationMarkers, ...busMarkers]"
      :polyline="polyline"
      :show-location="true"
      :enable-rotate="false"
      :enable-overlooking="false"
      @markertap="onMarkerTap"
    />

    <!-- 图例 -->
    <view class="legend">
      <view
        v-for="item in legendItems" :key="item.key"
        class="legend-item" :class="{ off: !visibleRoutes.has(item.key) }"
        @tap="toggleRoute(item.key)"
      >
        <view class="legend-dot" :style="{ background: item.color }"></view>
        <text class="legend-label">{{ item.label }}</text>
        <text v-if="visibleRoutes.has(item.key)" class="legend-check">✓</text>
      </view>
      <view class="legend-divider"></view>
      <view class="legend-item" @tap="toggleLabels">
        <text class="legend-label">{{ showLabels ? '隐藏站名' : '显示站名' }}</text>
      </view>
    </view>

    <!-- 定位/回中按钮 -->
    <view class="map-controls">
      <view class="ctrl-btn" @tap="recenterOnUser">◎</view>
      <view class="ctrl-btn" @tap="recenterAll">⌂</view>
    </view>

    <!-- 站点面板 -->
    <view v-if="selectedStop" class="stop-panel">
      <view class="panel-header">
        <text class="panel-title">{{ selectedStop }}</text>
        <text class="panel-close" @tap="closePanel">✕</text>
      </view>
      <scroll-view scroll-y class="panel-body">
        <view v-if="stopArrivals.length === 0" class="empty">当前时段无经过此站的班车</view>
        <view v-for="item in stopArrivals" :key="item.departure.recordId + '_' + item.pred.stopSeq" class="panel-row">
          <view class="route-badge" :style="{ background: routeColor(item.departure.routeKey) }">
            {{ routeNameOf(item.departure.routeKey, item.departure.route) }}
          </view>
          <view class="panel-info">
            <text class="panel-time">{{ item.pred.arrivalTime }}</text>
            <text :class="etaClass(item.status)">{{ item.label }}</text>
            <text class="panel-note">
              {{ item.departure.departureTime }} 发车 ·
              <text :class="item.departure.departureMinutes * 60 <= secondsNow ? 'departed' : 'not-departed'">
                {{ item.departure.departureMinutes * 60 <= secondsNow ? '已发车' : '未发车' }}
              </text>
            </text>
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
.legend-label { flex: 1; font-size: 24rpx; color: #1F2937; }
.legend-check { color: #10B981; font-size: 24rpx; font-weight: 700; }
.legend-divider { height: 1rpx; background: #E5E7EB; margin: 6rpx 12rpx; }

.map-controls { position: absolute; bottom: 200rpx; right: 20rpx; z-index: 10; display: flex; flex-direction: column; gap: 16rpx; }
.ctrl-btn {
  width: 76rpx; height: 76rpx; background: #fff; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 36rpx; color: #1A56DB; box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.15);
}

.stop-panel {
  position: absolute; left: 0; right: 0; bottom: 0; z-index: 20;
  background: #fff; border-radius: 24rpx 24rpx 0 0;
  box-shadow: 0 -8rpx 32rpx rgba(0, 0, 0, 0.1); max-height: 50vh;
  display: flex; flex-direction: column;
}
.panel-header { display: flex; justify-content: space-between; align-items: center; padding: 24rpx 28rpx; border-bottom: 1rpx solid #E5E7EB; }
.panel-title { font-size: 32rpx; font-weight: 600; }
.panel-close { font-size: 32rpx; color: #9CA3AF; padding: 0 8rpx; }
.panel-body { padding: 0 28rpx 28rpx; max-height: 40vh; }
.panel-row { display: flex; align-items: center; gap: 16rpx; padding: 18rpx 0; border-bottom: 1rpx solid #F3F4F6; }
.route-badge { color: #fff; font-size: 20rpx; font-weight: 600; padding: 4rpx 12rpx; border-radius: 8rpx; flex-shrink: 0; }
.panel-info { flex: 1; display: flex; flex-direction: column; align-items: flex-end; gap: 2rpx; }
.panel-time { font-size: 30rpx; font-weight: 700; font-variant-numeric: tabular-nums; }
.panel-note { font-size: 20rpx; color: #6B7280; }
.departed { color: #059669; }
.not-departed { color: #DC2626; }
.eta { font-size: 24rpx; color: #2563EB; }
.eta.warning { color: #F59E0B; }
.eta.urgent { color: #DC2626; font-weight: 600; }
.eta.arrived { color: #10B981; font-weight: 600; }
.eta.passed { color: #9CA3AF; }
.empty { text-align: center; padding: 40rpx; font-size: 26rpx; color: #6B7280; }
</style>
