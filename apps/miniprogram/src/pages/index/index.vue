<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import { onShow, onHide } from '@dcloudio/uni-app'
import { useScheduleStore } from '@/stores/schedule'
import { useLocationStore } from '@/stores/location'
import { useGeolocation } from '@/composables/useGeolocation'
import { getDateType, getSecondsSinceMidnight, formatDate, getDateLabel } from '@/utils/datetime'
import { getNow } from '@/utils/time'
import { findNearestStop, findNearestStops, formatWalkTime } from '@/utils/geo'
import { arrivalCountdown, departureCountdown } from '@/utils/countdown'
import { toGroup, groupMembers, findBestRide } from '@/utils/station_group'
import type { Departure, ArrivalPrediction, DateType } from '@/types'

interface ArrivalItem {
  departure: Departure
  stopName?: string
  candidateStop?: string
  destStop?: string
  arrivalTime?: string
  secondsUntil?: number
  label?: string
  status?: string
  walkSeconds?: number
  walkLabel?: string
  walkWarning?: boolean
  departed?: boolean
  isOriginDeparture?: boolean
  boardSec?: number
  boardLabel?: string
  boardStatus?: string
  boardTime?: string
  boardSeq?: number
  destArrivalTime?: string
  destSeq?: number
}

const scheduleStore = useScheduleStore()
const locationStore = useLocationStore()

// ─── 定位（用户主动点击后才获取，不在加载时自动调用） ───
const {
  loading: locLoading, error: locError,
  init: initLocation, requestLocation, openSetting, openPrivacyContract,
} = useGeolocation()

/** 是否已经拿到有效位置 */
const hasLocation = computed(() => locationStore.userLat !== null && locationStore.userLng !== null)
/** 定位卡片说明文案 */
const locateDesc = computed(() => {
  if (locationStore.permissionDenied) return '点此前往设置页，把「位置信息」改为允许'
  if (locError.value) return locError.value
  return '仅在本机计算你与站点的距离，位置不会上传服务器'
})
function onLocateTap() {
  if (locationStore.permissionDenied) openSetting()
  else requestLocation()
}

const dateType = computed<DateType>(() => getDateType(getNow()))
const dateTypeLabel = computed(() => getDateLabel(getNow()))
const todayDate = computed(() => formatDate(getNow()))

// ─── 秒级刷新 ───
const nowTick = ref(0)
const secondsNow = computed(() => { void nowTick.value; return getSecondsSinceMidnight(getNow()) })
let timer: ReturnType<typeof setInterval> | null = null
function startTimer() { if (!timer) timer = setInterval(() => { nowTick.value++ }, 1000) }
function stopTimer() { if (timer) { clearInterval(timer); timer = null } }
onShow(() => { startTimer(); initLocation() })
onHide(stopTimer)
onUnmounted(stopTimer)

// ─── 站点选择（组化 + 频次排序） ───
const selectedStop = ref<string | null>(null)
const stopSearch = ref('')
const stopExpanded = ref(false)
const clickFreq = ref<Record<string, number>>(
  JSON.parse(uni.getStorageSync('stop_click_freq') || '{}')
)
const groupFreq = computed(() => {
  const agg: Record<string, number> = {}
  for (const [stop, f] of Object.entries(clickFreq.value)) {
    const g = toGroup(stop)
    agg[g] = (agg[g] || 0) + f
  }
  return agg
})
const sortedStops = computed(() => {
  const groups = new Set(scheduleStore.stations.map(s => toGroup(s.name)))
  return [...groups].sort((a, b) => (groupFreq.value[b] || 0) - (groupFreq.value[a] || 0))
})
const displayStops = computed(() => {
  if (stopSearch.value) return sortedStops.value.filter(s => s.includes(stopSearch.value))
  return stopExpanded.value ? sortedStops.value : sortedStops.value.slice(0, 5)
})

function selectStop(name: string) {
  if (selectedStop.value === name) {
    selectedStop.value = null
    return
  }
  clickFreq.value[name] = (clickFreq.value[name] || 0) + 1
  uni.setStorageSync('stop_click_freq', JSON.stringify(clickFreq.value))
  selectedStop.value = name
  stopSearch.value = ''
}

// ─── 班次预测索引 ───
const predsByDeparture = computed(() => {
  const m = new Map<string, ArrivalPrediction[]>()
  for (const p of scheduleStore.predictions) {
    const l = m.get(p.departureId)
    if (l) l.push(p)
    else m.set(p.departureId, [p])
  }
  return m
})

// ─── 附近站到站（默认视图） ───
const WALK_SPEED = 1.3
const nearbySections = computed(() => {
  if (selectedStop.value) return []
  if (locationStore.userLat === null || locationStore.userLng === null) return []
  const candidates = findNearestStops(locationStore.userLat, locationStore.userLng, scheduleStore.stations, 3, 200)
  const sections: Array<{ stopName: string; walkLabel: string; arrivals: ArrivalItem[] }> = []
  for (const c of candidates) {
    const walkSeconds = c.distance / WALK_SPEED
    const preds = scheduleStore.getPredictionsForStop(c.station.name, dateType.value)
    const arrivals: ArrivalItem[] = []
    for (const p of preds) {
      if (p.isDepartureStop || p.isReturnStop) continue
      const dep = scheduleStore.departures.find(d => d.recordId === p.departureId)
      if (!dep) continue
      const secondsUntil = Math.round(p.arrivalMinutes * 60 - secondsNow.value)
      if (secondsUntil < -300 || secondsUntil > 3600) continue
      const { label, status } = arrivalCountdown(secondsUntil)
      arrivals.push({
        departure: dep, stopName: c.station.name,
        walkSeconds, walkLabel: formatWalkTime(walkSeconds),
        walkWarning: secondsUntil > 0 && walkSeconds > secondsUntil,
        secondsUntil, label, status, arrivalTime: p.arrivalTime, destSeq: p.stopSeq,
        departed: (dep.departureMinutes * 60) <= secondsNow.value,
      })
    }
    if (arrivals.length > 0) {
      arrivals.sort((a, b) => (a.secondsUntil ?? 0) - (b.secondsUntil ?? 0))
      sections.push({ stopName: c.station.name, walkLabel: formatWalkTime(walkSeconds), arrivals })
    }
  }
  return sections
})

// ─── 目的地推荐（组 + 最优组合） ───
const destArrivals = computed(() => {
  if (!selectedStop.value) return []
  const destMembers = groupMembers(selectedStop.value)
  const results: ArrivalItem[] = []
  const hasGps = locationStore.userLat !== null && locationStore.userLng !== null

  if (hasGps) {
    const nearStops = findNearestStops(locationStore.userLat!, locationStore.userLng!, scheduleStore.stations, 3, 200)
    // 目的地就在附近
    if (nearStops.some(c => destMembers.includes(c.station.name))) {
      for (const dep of scheduleStore.departures) {
        if (dep.dateType !== dateType.value) continue
        for (const p of (predsByDeparture.value.get(dep.recordId) || [])) {
          if (!destMembers.includes(p.stopName)) continue
          if (p.isDepartureStop || p.isReturnStop) continue
          const secondsUntil = Math.round(p.arrivalMinutes * 60 - secondsNow.value)
          if (secondsUntil < -300 || secondsUntil > 3600) continue
          const { label, status } = arrivalCountdown(secondsUntil)
          results.push({
            departure: dep, destStop: p.stopName, secondsUntil, label, status,
            arrivalTime: p.arrivalTime, destSeq: p.stopSeq,
            departed: (dep.departureMinutes * 60) <= secondsNow.value,
          })
        }
      }
      results.sort((a, b) => (a.secondsUntil ?? 0) - (b.secondsUntil ?? 0))
      return results
    }

    // 多起点搜索
    let candidates = nearStops
    if (candidates.length === 0) {
      const fb = findNearestStop(locationStore.userLat!, locationStore.userLng!, scheduleStore.stations)
      if (fb) candidates = [fb]
    }
    const seen = new Set<string>()
    for (const c of candidates) {
      const candidateStop = c.station.name
      if (destMembers.includes(candidateStop)) continue
      const walkSeconds = c.distance / WALK_SPEED
      for (const dep of scheduleStore.departures) {
        if (dep.dateType !== dateType.value) continue
        if (seen.has(dep.recordId)) continue
        const best = findBestRide(predsByDeparture.value.get(dep.recordId) || [], [candidateStop], destMembers)
        if (!best) continue
        const secBoard = Math.round(best.origin.arrivalMinutes * 60 - secondsNow.value)
        const secDest = Math.round(best.dest.arrivalMinutes * 60 - secondsNow.value)
        if (secDest > 3600 || secBoard < -300) continue
        const isOriginDeparture = best.origin.isDepartureStop ?? false
        const { label, status } = isOriginDeparture ? departureCountdown(secBoard) : arrivalCountdown(secBoard)
        results.push({
          departure: dep, candidateStop, destStop: best.dest.stopName,
          walkSeconds, walkLabel: formatWalkTime(walkSeconds),
          walkWarning: secBoard > 0 && walkSeconds > secBoard,
          isOriginDeparture, boardSec: secBoard, boardLabel: label, boardStatus: status,
          boardTime: best.origin.arrivalTime, boardSeq: best.origin.stopSeq,
          destArrivalTime: best.dest.arrivalTime, destSeq: best.dest.stopSeq,
          departed: (dep.departureMinutes * 60) <= secondsNow.value,
        })
        seen.add(dep.recordId)
      }
    }
  } else {
    // 无 GPS
    for (const dep of scheduleStore.departures) {
      if (dep.dateType !== dateType.value) continue
      for (const p of (predsByDeparture.value.get(dep.recordId) || [])) {
        if (!destMembers.includes(p.stopName)) continue
        if (p.isDepartureStop || p.isReturnStop) continue
        const secondsUntil = Math.round(p.arrivalMinutes * 60 - secondsNow.value)
        if (secondsUntil < -300 || secondsUntil > 3600) continue
        const { label, status } = arrivalCountdown(secondsUntil)
        results.push({
          departure: dep, destStop: p.stopName, secondsUntil, label, status,
          arrivalTime: p.arrivalTime, destSeq: p.stopSeq,
          departed: (dep.departureMinutes * 60) <= secondsNow.value,
        })
      }
    }
  }
  results.sort((a, b) => (a.destArrivalTime || a.arrivalTime || '').localeCompare(b.destArrivalTime || b.arrivalTime || ''))
  return results
})

// ─── 即将发车 ───
const departingSoon = computed(() => {
  const deps = scheduleStore.getDepartures(dateType.value)
  const list: Array<{ departure: Departure; secondsUntil: number; label: string; isUrgent: boolean }> = []
  for (const dep of deps) {
    const secondsUntil = Math.round(dep.departureMinutes * 60 - secondsNow.value)
    if (secondsUntil < -300 || secondsUntil > 3600) continue
    const { label, status } = departureCountdown(secondsUntil)
    list.push({ departure: dep, secondsUntil, label, isUrgent: status === 'urgent' || status === 'arrived' })
  }
  list.sort((a, b) => a.secondsUntil - b.secondsUntil)
  return list
})

// ─── 折叠控制 ───
const showAllArrivals = ref(false)
const showAllDeparting = ref(false)
const expandedSections = ref<Set<string>>(new Set())
function toggleSection(stopName: string) {
  const next = new Set(expandedSections.value)
  if (next.has(stopName)) next.delete(stopName)
  else next.add(stopName)
  expandedSections.value = next
}

// ─── 展示辅助 ───
const ROUTE_COLORS: Record<string, string> = {
  HX1_NORMAL: '#2563EB', HX1_DINING: '#F59E0B',
  JB1_NORMAL: '#10B981', JB2_NORMAL: '#8B5CF6',
}
function routeColor(routeKey?: string) { return ROUTE_COLORS[routeKey || ''] || '#6B7280' }
function routeName(dep: Departure) {
  return dep.routeKey === 'HX1_DINING' ? '环1·就餐' : dep.route
}
function etaClass(status?: string) {
  return status === 'urgent' ? 'eta urgent' : status === 'warning' ? 'eta warning'
    : status === 'arrived' ? 'eta arrived' : status === 'passed' ? 'eta passed' : 'eta'
}

// 公告
const showNotice = ref(false)
</script>

<template>
  <view class="home-page">
    <!-- 头部：日期 + 日期类型 -->
    <view class="today-header">
      <view class="date-text">{{ todayDate }}</view>
      <view class="date-tag" :class="dateType === 'weekday' ? 'wd' : 'we'">{{ dateTypeLabel }}</view>
    </view>

    <!-- 公告栏 -->
    <view class="notice-bar" @tap="showNotice = true">
      <text class="notice-text">线路试运行，时刻与预测仅供参考。点我查看详情 ›</text>
    </view>

    <!-- 定位引导：用户点击「允许定位」后才获取位置，隐私协议由微信官方弹窗兜底 -->
    <view v-if="!hasLocation" class="locate-card">
      <view class="locate-head">
        <text class="locate-icon">📍</text>
        <view class="locate-texts">
          <text class="locate-title">{{ locationStore.permissionDenied ? '定位权限已关闭' : '开启定位，查看附近站点' }}</text>
          <text class="locate-desc">{{ locateDesc }}</text>
        </view>
      </view>
      <view class="locate-actions">
        <view class="locate-btn" :class="{ busy: locLoading }" @tap="onLocateTap">
          {{ locLoading ? '定位中…' : (locationStore.permissionDenied ? '去设置开启' : '允许定位') }}
        </view>
        <text class="locate-privacy" @tap="openPrivacyContract">隐私协议</text>
      </view>
    </view>

    <!-- 站点搜索与选择 -->
    <view class="search-box">
      <input v-model="stopSearch" class="search-input" placeholder="搜索站点名称" placeholder-class="ph" />
    </view>
    <view class="stop-grid">
      <view
        v-for="stop in displayStops" :key="stop"
        class="stop-chip" :class="{ active: selectedStop === stop }"
        @tap="selectStop(stop)"
      >{{ stop }}</view>
      <view v-if="!stopSearch" class="stop-chip more" @tap="stopExpanded = !stopExpanded">
        {{ stopExpanded ? '收起 ▲' : '更多 ▼' }}
      </view>
    </view>

    <!-- 附近站（默认视图） -->
    <template v-if="!selectedStop">
      <view v-for="section in nearbySections" :key="section.stopName" class="section">
        <view class="section-title">「{{ section.stopName }}」 {{ section.walkLabel }}</view>
        <view
          v-for="(item, idx) in section.arrivals" :key="item.departure.recordId + '-' + item.destSeq"
          v-show="idx < 5 || expandedSections.has(section.stopName)"
          class="bus-card" :style="{ borderLeftColor: routeColor(item.departure.routeKey) }"
        >
          <view class="card-left">
            <view class="route-badge" :style="{ background: routeColor(item.departure.routeKey) }">{{ routeName(item.departure) }}</view>
            <text v-if="item.departure.isGaochaoDeparture" class="tag-dining">高超楼发车</text>
          </view>
          <view class="card-right">
            <text class="arrival-time">{{ item.arrivalTime?.slice(0, 5) }}</text>
            <text :class="etaClass(item.status)">{{ item.label }}</text>
          </view>
        </view>
        <view v-if="section.arrivals.length > 5" class="show-more" @tap="toggleSection(section.stopName)">
          {{ expandedSections.has(section.stopName) ? '收起 ▲' : `展开更多 ${section.arrivals.length - 5} 趟车次 ▼` }}
        </view>
      </view>

      <view v-if="hasLocation && nearbySections.length === 0" class="hint-card">
        <text>附近 200 米内暂无站点，可从上方列表手动选择</text>
      </view>
    </template>

    <!-- 目的地推荐 -->
    <view v-if="selectedStop" class="section">
      <view class="section-title">「{{ selectedStop }}」</view>
      <view v-if="destArrivals.length === 0" class="empty">当前时段暂无经过此站的车次</view>
      <view
        v-for="(item, idx) in (showAllArrivals ? destArrivals : destArrivals.slice(0, 5))"
        :key="item.departure.recordId"
        class="bus-card" :style="{ borderLeftColor: routeColor(item.departure.routeKey) }"
      >
        <view class="card-left">
          <view class="route-badge" :style="{ background: routeColor(item.departure.routeKey) }">{{ routeName(item.departure) }}</view>
          <text v-if="item.departure.isGaochaoDeparture" class="tag-dining">高超楼发车</text>
        </view>
        <view class="card-right">
          <template v-if="item.candidateStop">
            <view class="boarding">
              <text class="boarding-text">{{ item.walkLabel }}到「{{ item.candidateStop }}」</text>
              <text v-if="item.walkWarning" class="walk-warn">⚠</text>
            </view>
            <text class="board-time">于{{ item.boardTime?.slice(0, 5) }}{{ item.isOriginDeparture ? '发车' : '到站' }}</text>
            <text :class="etaClass(item.boardStatus)">{{ item.boardLabel }}</text>
            <text class="dest-info">预计 {{ item.destArrivalTime?.slice(0, 5) }} 到「{{ item.destStop }}」</text>
          </template>
          <template v-else>
            <text class="arrival-time">{{ item.arrivalTime?.slice(0, 5) }}</text>
            <text :class="etaClass(item.status)">{{ item.label }}</text>
          </template>
        </view>
      </view>
      <view v-if="destArrivals.length > 5" class="show-more" @tap="showAllArrivals = !showAllArrivals">
        {{ showAllArrivals ? '收起 ▲' : `展开更多 ${destArrivals.length - 5} 趟车次 ▼` }}
      </view>
    </view>

    <!-- 即将发车 -->
    <view v-if="departingSoon.length > 0" class="section">
      <view class="section-title">即将发车</view>
      <view
        v-for="(item, idx) in (showAllDeparting ? departingSoon : departingSoon.slice(0, 5))"
        :key="item.departure.recordId"
        class="bus-card" :style="{ borderLeftColor: routeColor(item.departure.routeKey) }"
      >
        <view class="card-left">
          <view class="route-badge" :style="{ background: routeColor(item.departure.routeKey) }">{{ routeName(item.departure) }}</view>
          <text v-if="item.departure.isGaochaoDeparture" class="tag-dining">高超楼发车</text>
        </view>
        <view class="card-right">
          <text class="arrival-time">{{ item.departure.departureTime }}</text>
          <text :class="etaClass(item.isUrgent ? 'urgent' : undefined)">{{ item.label }}</text>
        </view>
      </view>
      <view v-if="departingSoon.length > 5" class="show-more" @tap="showAllDeparting = !showAllDeparting">
        {{ showAllDeparting ? '收起 ▲' : `展开更多 ${departingSoon.length - 5} 趟车次 ▼` }}
      </view>
    </view>

    <!-- 公告弹窗 -->
    <view v-if="showNotice" class="dialog-mask" @tap="showNotice = false">
      <view class="dialog" @tap.stop>
        <view class="dialog-title">公告</view>
        <view class="dialog-body">
          <view>线路试运行，随时会调整，时间表和预测时间仅供参考。</view>
          <view class="dialog-body-para">如何帮忙校准：点击底部「记录」→ 输入昵称 → 选择线路 → 点击「上车」，到站停车即点击「计时」，下车提交。</view>
        </view>
        <view class="dialog-btn" @tap="showNotice = false">我知道了</view>
      </view>
    </view>
  </view>
</template>

<style scoped>
.home-page { padding: 24rpx; }
.today-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20rpx; }
.date-text { font-size: 32rpx; font-weight: 600; }
.date-tag { font-size: 24rpx; padding: 6rpx 18rpx; border-radius: 999rpx; }
.date-tag.wd { background: #EFF6FF; color: #1A56DB; }
.date-tag.we { background: #FEF3C7; color: #92400E; }

.notice-bar { background: #FFF7ED; border-radius: 12rpx; padding: 16rpx 20rpx; margin-bottom: 16rpx; }
.notice-text { font-size: 24rpx; color: #9A3412; }

/* 定位引导卡片 */
.locate-card {
  background: #fff; border-radius: 14rpx; padding: 22rpx 24rpx; margin-bottom: 16rpx;
  border: 1rpx solid #DBEAFE;
}
.locate-head { display: flex; align-items: flex-start; gap: 12rpx; }
.locate-icon { font-size: 32rpx; line-height: 1.2; }
.locate-texts { flex: 1; display: flex; flex-direction: column; gap: 6rpx; }
.locate-title { font-size: 28rpx; font-weight: 600; color: #1F2937; }
.locate-desc { font-size: 22rpx; color: #6B7280; line-height: 1.5; }
.locate-actions { display: flex; align-items: center; justify-content: space-between; margin-top: 18rpx; }
.locate-btn {
  background: #1A56DB; color: #fff; font-size: 26rpx; font-weight: 600;
  padding: 14rpx 40rpx; border-radius: 999rpx;
}
.locate-btn.busy { background: #93B4F5; }
.locate-privacy { font-size: 22rpx; color: #1A56DB; }

.hint-card { background: #F3F4F6; border-radius: 12rpx; padding: 24rpx; margin: 16rpx 0; font-size: 24rpx; color: #6B7280; text-align: center; }

.search-box { margin-bottom: 16rpx; }
.search-input { background: #fff; border-radius: 999rpx; padding: 14rpx 24rpx; font-size: 26rpx; }
.ph { color: #9CA3AF; }

.stop-grid { display: flex; flex-wrap: wrap; gap: 14rpx; margin-bottom: 8rpx; }
.stop-chip { padding: 8rpx 20rpx; background: #fff; border-radius: 999rpx; font-size: 24rpx; border: 1rpx solid #E5E7EB; color: #1F2937; }
.stop-chip.active { background: #EFF6FF; border-color: #1A56DB; color: #1A56DB; font-weight: 600; }
.stop-chip.more { background: #F3F4F6; color: #6B7280; }

.section { margin-top: 24rpx; }
.section-title { font-size: 30rpx; font-weight: 600; margin-bottom: 14rpx; }

.bus-card {
  background: #fff; border-radius: 14rpx; padding: 20rpx 24rpx; margin-bottom: 12rpx;
  display: flex; justify-content: space-between; align-items: center;
  border-left: 6rpx solid transparent;
}
.card-left { display: flex; align-items: center; gap: 12rpx; }
.route-badge { color: #fff; font-size: 22rpx; font-weight: 600; padding: 4rpx 14rpx; border-radius: 8rpx; }
.tag-dining { font-size: 20rpx; color: #F59E0B; }
.card-right { display: flex; flex-direction: column; align-items: flex-end; gap: 2rpx; }
.arrival-time { font-size: 36rpx; font-weight: 700; color: #1A56DB; font-variant-numeric: tabular-nums; }
.boarding { display: flex; align-items: center; gap: 6rpx; }
.boarding-text { font-size: 22rpx; color: #10B981; }
.walk-warn { font-size: 20rpx; color: #F59E0B; }
.board-time { font-size: 22rpx; color: #6B7280; }
.dest-info { font-size: 22rpx; color: #6B7280; }

.eta { font-size: 26rpx; color: #2563EB; }
.eta.warning { color: #F59E0B; }
.eta.urgent { color: #DC2626; font-weight: 600; }
.eta.arrived { color: #10B981; font-weight: 600; }
.eta.passed { color: #9CA3AF; }

.show-more { text-align: center; padding: 16rpx; font-size: 24rpx; color: #1A56DB; }
.empty { text-align: center; padding: 48rpx; font-size: 26rpx; color: #6B7280; }

.dialog-mask { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 100; }
.dialog { background: #fff; border-radius: 20rpx; width: 560rpx; padding: 32rpx; }
.dialog-title { font-size: 32rpx; font-weight: 600; margin-bottom: 16rpx; }
.dialog-body { font-size: 26rpx; color: #374151; line-height: 1.8; margin-bottom: 24rpx; }
.dialog-body-para { margin-top: 16rpx; }
.dialog-btn { background: #1A56DB; color: #fff; text-align: center; padding: 16rpx; border-radius: 12rpx; font-size: 28rpx; }
</style>
