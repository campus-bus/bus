<script setup lang="ts">
import { onMounted, onUnmounted, onActivated, onDeactivated, computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useNextBus } from '@/composables/useNextBus'
import { useGeolocation } from '@/composables/useGeolocation'
import { useWeather } from '@/composables/useWeather'
import { useScheduleStore } from '@/stores/schedule'
import { useMapStore } from '@/stores/map'
import { formatDate, getDateType } from '@/utils/datetime'
import { getDateLabel } from '@/utils/holidays'
import { findNearestStop, findNearestStops, formatWalkTime } from '@/utils/geo'
import { getSecondsSinceMidnight } from '@/utils/datetime'
import { arrivalCountdown, departureCountdown } from '@/utils/countdown'
import RouteBadge from '@/components/common/RouteBadge.vue'
import ETAIndicator from '@/components/common/ETAIndicator.vue'
import BusStopTimeline from '@/components/common/BusStopTimeline.vue'
import type { Departure, ArrivalPrediction } from '@/types'

interface StopArrivalItem {
  departure: Departure
  stopName?: string
  arrivalTime?: string
  arrivalMinutes?: number
  secondsUntil?: number
  etaDisplay?: string
  status?: string
  label?: string
  candidateStop?: string
  walkTime?: number
  destStop?: string
  departed?: boolean
  walkSeconds?: number
  walkLabel?: string
  walkWarning?: boolean
  isOriginDeparture?: boolean
  boardSec?: number
  boardLabel?: string
  boardStatus?: string
  boardTime?: string
  destArrivalTime?: string
}

interface DepartingSoonItem {
  departure: Departure
  secondsUntil: number
  label: string
  isUrgent: boolean
}

const router = useRouter()

const scheduleStore = useScheduleStore()
const mapStore = useMapStore()
const { dateType, departingSoon, refresh } = useNextBus()
useGeolocation()
const { weather } = useWeather()

const todayDate = computed(() => formatDate())
const dateTypeLabel = computed(() => getDateLabel())
const isWeekday = computed(() => dateType.value === 'weekday')
const stopSearch = ref('')
const showNotice = ref(false)
const selectedStop = ref<string | null>(null)
const stopExpanded = ref(false)
const showAllArrivals = ref(false)
const showAllDeparting = ref(false)
const expandedCards = ref<Set<string>>(new Set())
const expandedSections = ref<Set<string>>(new Set())
const nowTick = ref(0)  // 用于强制刷新
const secondsNow = computed(() => { void nowTick.value; return getSecondsSinceMidnight() })

// 站点点击频次（仅用于持久化，实时更新但不影响排序）
const clickFreq = ref<Record<string, number>>({})
// 排序用的冻结频次（仅在 onMounted / 数据加载时从 localStorage 读取，避免点击后立即跳位）
const sortOrder = ref<Record<string, number>>({})
// 站点按冻结频次排序
const sortedStops = computed(() => {
  const stops = [...scheduleStore.stations.map(s => s.name)]
  stops.sort((a, b) => (sortOrder.value[b] || 0) - (sortOrder.value[a] || 0))
  return stops
})
// 是否由用户手动点选过站点（手动点选后不自动覆盖）
const userManuallySelected = ref(false)

let refreshTimer: ReturnType<typeof setInterval> | null = null

function startTimer() {
  if (refreshTimer) return
  refreshTimer = setInterval(() => { refresh(); nowTick.value++ }, 1000)
}

function stopTimer() {
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null }
}

function initSortOrder() {
  try {
    const saved = JSON.parse(localStorage.getItem('stop_click_freq') || '{}')
    clickFreq.value = saved
    sortOrder.value = { ...saved }
  } catch {
    clickFreq.value = {}
    sortOrder.value = {}
  }
}

onMounted(() => {
  initSortOrder()
  startTimer()
})

onActivated(() => {
  refresh()
  nowTick.value++
  startTimer()
})

onDeactivated(() => {
  stopTimer()
})

onUnmounted(() => {
  stopTimer()
})

function recordClick(stopName: string) {
  clickFreq.value[stopName] = (clickFreq.value[stopName] || 0) + 1
  try { localStorage.setItem('stop_click_freq', JSON.stringify(clickFreq.value)) } catch {}
}

const collapsedStops = computed(() => sortedStops.value.slice(0, 5))
const filteredStops = computed(() => {
  if (!stopSearch.value) return []
  return sortedStops.value.filter(s => s.includes(stopSearch.value))
})
const freqTop3 = computed(() => sortedStops.value.slice(0, 3))

// 最近站点（仅用于 GPS 定位提示，不自动选中）
const nearestStop = computed(() => {
  if (mapStore.userLat === null || mapStore.userLng === null) return null
  const result = findNearestStop(mapStore.userLat, mapStore.userLng, scheduleStore.stations)
  return result?.station ?? null
})

function selectStop(name: string) {
  if (selectedStop.value === name) {
    selectedStop.value = null // 取消选择，回到默认视图
    userManuallySelected.value = false
    return
  }
  recordClick(name)
  selectedStop.value = name
  userManuallySelected.value = true
  stopSearch.value = ''
  showAllArrivals.value = false
}

// 展开/收起车次卡片（Set 防冲突）
function toggleBusCard(key: string) {
  const next = new Set(expandedCards.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  expandedCards.value = next
}
function busCardKey(item: StopArrivalItem): string {
  return 'arrival-' + item.departure?.recordId + '-' + (item.candidateStop || '')
}
function nearbyCardKey(item: StopArrivalItem): string {
  return 'nearby-' + item.stopName + '-' + item.departure.recordId
}

function toggleNearbySection(stopName: string) {
  const next = new Set(expandedSections.value)
  if (next.has(stopName)) next.delete(stopName)
  else next.add(stopName)
  expandedSections.value = next
}

// 跳转地图聚焦
function handleViewOnMap(departureId: string, routeKey: string) {
  router.push({ path: '/map', query: { route: routeKey, bus: departureId } })
}

// 路线颜色
const ROUTE_COLORS: Record<string, string> = {
  HX1_NORMAL: '#2563EB', HX1_DINING: '#F59E0B',
  JB1_NORMAL: '#10B981', JB2_NORMAL: '#8B5CF6',
}
function routeBorderColor(routeKey?: string): string {
  return ROUTE_COLORS[routeKey || ''] || '#6B7280'
}

// 当前选中站点作为目的地的车次推荐
const stopArrivals = computed(() => {
  if (!selectedStop.value) return []
  const destStop = selectedStop.value
  const preds = scheduleStore.getPredictionsForStop(destStop, dateType.value)
  const results: StopArrivalItem[] = []

  const hasGps = mapStore.userLat !== null
  const WALK_SPEED = 1.3 // m/s

  if (hasGps) {
    // 检查选中的站点是否在 200m 范围内 → 展示该站过站车次（非多起点）
    const isNearby = findNearestStops(mapStore.userLat!, mapStore.userLng!, scheduleStore.stations, 3, 200)
      .some(c => c.station.name === destStop)

    if (isNearby) {
      // 和默认视图一样：只展示这个站的到站车次
      for (const p of preds) {
        // 环线起终点同站：isDepartureStop 是发车不是到站，isReturnStop 是绕一圈回来
        // 两者都不适合作为"到达此站"展示，保留中途经过的到站记录即可
        if (p.isReturnStop || p.isDepartureStop) continue
        const dep = scheduleStore.departures.find(d => d.recordId === p.departureId)
        if (!dep) continue
        const secondsUntil = Math.round(p.arrivalMinutes * 60 - secondsNow.value)
        if (secondsUntil < -300 || secondsUntil > 3600) continue
        const { label, status } = arrivalCountdown(secondsUntil)
        results.push({
          departure: dep,
          destStop,
          secondsUntil,
          label,
          status,
          arrivalTime: p.arrivalTime,
          departed: (dep.departureMinutes * 60) <= secondsNow.value,
        })
      }
      results.sort((a: any, b: any) => a.secondsUntil - b.secondsUntil)
      return results
    }

    // 远距离目的地：多起点搜索
    const candidates = findNearestStops(mapStore.userLat!, mapStore.userLng!, scheduleStore.stations, 3, 200)
    if (candidates.length === 0) {
      // 500m 内没有站点，退回到单一最近站点
      const fallback = findNearestStop(mapStore.userLat!, mapStore.userLng!, scheduleStore.stations)
      if (fallback) candidates.push(fallback)
    }

    // 去重：preds 中同一 departure 可能有 isDepartureStop + isReturnStop 两条
    // （如 JB1/JB2 起终点同站 研究生宿舍楼），只需保留一条
    const seenDepartureIds = new Set<string>()

    for (const c of candidates) {
      const candidateStop = c.station.name
      if (candidateStop === destStop) continue // 已经在目的地，跳过

      const walkSeconds = c.distance / WALK_SPEED

      for (const p of preds) {
        // 同一车次只展示一次（首选最近的上车站点）
        if (seenDepartureIds.has(p.departureId)) continue
        const dep = scheduleStore.departures.find(d => d.recordId === p.departureId)
        if (!dep) continue

        // 该车次是否经过这个候选上车点（且在上车点之后才到目的地）
        const candidatePred = scheduleStore.predictions.find(
          pp => pp.departureId === p.departureId && pp.stopName === candidateStop
        )
        if (!candidatePred) continue

        const destPred = scheduleStore.predictions.find(
          pp => pp.departureId === p.departureId
            && pp.stopName === destStop
            && pp.stopSeq > candidatePred.stopSeq
        )
        if (!destPred) continue

        const secondsUntilCandidate = Math.round(candidatePred.arrivalMinutes * 60 - secondsNow.value)
        const secondsUntilDest = Math.round(destPred.arrivalMinutes * 60 - secondsNow.value)

        // 步行可能赶不上 → 标记警告但不隐藏（车次信息对用户仍有参考价值）
        const walkWarning = secondsUntilCandidate > 0 && walkSeconds > secondsUntilCandidate
        // 目的地到站超过 1 小时 → 跳过
        if (secondsUntilDest > 3600) continue
        // 已过站超过 1 分钟 → 跳过
        if (secondsUntilCandidate < -300) continue

        const isOriginDeparture = candidatePred.isDepartureStop ?? false
        const { label, status } = isOriginDeparture
          ? departureCountdown(secondsUntilCandidate)
          : arrivalCountdown(secondsUntilCandidate)
        const departed = (dep.departureMinutes * 60) <= secondsNow.value

        results.push({
          departure: dep,
          candidateStop,
          destStop,
          walkSeconds,
          walkLabel: formatWalkTime(walkSeconds),
          walkWarning,
          isOriginDeparture,
          boardSec: secondsUntilCandidate,
          boardLabel: label,
          boardStatus: status,
          boardTime: candidatePred.arrivalTime,
          destArrivalTime: destPred.arrivalTime,
          departed,
        })
        seenDepartureIds.add(p.departureId)
      }
    }
  } else {
    // 无 GPS：回退到现有逻辑，只显示经过目的地的车次（不含出发站信息）
    for (const p of preds) {
      const dep = scheduleStore.departures.find(d => d.recordId === p.departureId)
      if (!dep) continue
      if (p.isDepartureStop || p.isReturnStop) continue

      const secondsUntil = Math.round(p.arrivalMinutes * 60 - secondsNow.value)
      if (secondsUntil < -300 || secondsUntil > 3600) continue

      const { label, status } = arrivalCountdown(secondsUntil)
      const departed = (dep.departureMinutes * 60) <= secondsNow.value
      results.push({
        departure: dep,
        destStop,
        secondsUntil,
        label,
        status,
        arrivalTime: p.arrivalTime,
        departed,
      })
    }
  }

  results.sort((a, b) => {
    // 按目的地预计到站时间排序
    const aTime = a.destArrivalTime || a.arrivalTime || ''
    const bTime = b.destArrivalTime || b.arrivalTime || ''
    return aTime.localeCompare(bTime)
  })
  return results
})

const displayedArrivals = computed(() => {
  return showAllArrivals.value ? stopArrivals.value : stopArrivals.value.slice(0, 5)
})

// 默认视图：GPS 周边各站过站车次
const nearbyStopArrivals = computed(() => {
  if (selectedStop.value) return [] // 选了目的地就隐藏
  if (mapStore.userLat === null) return []
  const WALK_SPEED = 1.3
  const candidates = findNearestStops(mapStore.userLat!, mapStore.userLng!, scheduleStore.stations, 3, 200)
  const sections: Array<{ stopName: string; walkLabel: string; arrivals: StopArrivalItem[] }> = []

  for (const c of candidates) {
    const stopName = c.station.name
    const walkSeconds = c.distance / WALK_SPEED
    const walkLabel = formatWalkTime(walkSeconds)
    const arrivals: StopArrivalItem[] = []
    const preds = scheduleStore.getPredictionsForStop(stopName, dateType.value)

    for (const p of preds) {
      if (p.isDepartureStop || p.isReturnStop) continue
      const dep = scheduleStore.departures.find(d => d.recordId === p.departureId)
      if (!dep) continue
      const secondsUntil = Math.round(p.arrivalMinutes * 60 - secondsNow.value)
      if (secondsUntil < -300 || secondsUntil > 3600) continue
      const walkWarning = secondsUntil > 0 && walkSeconds > secondsUntil
      const { label, status } = arrivalCountdown(secondsUntil)
      arrivals.push({
        departure: dep,
        stopName,
        walkSeconds,
        walkLabel,
        walkWarning,
        secondsUntil,
        label,
        status,
        arrivalTime: p.arrivalTime,
        departed: (dep.departureMinutes * 60) <= secondsNow.value,
      })
    }

    if (arrivals.length > 0) {
      arrivals.sort((a, b) => a.secondsUntil! - b.secondsUntil!)
      sections.push({ stopName, walkLabel, arrivals })
    }
  }
  return sections
})
</script>

<template>
  <div class="home-page">
    <div class="today-header">
      <div class="today-left">
        <div class="date-text">{{ todayDate }}</div>
        <div v-if="weather" class="weather-row">
          <span class="weather-icon">{{ weather.icon }}</span>
          <span class="weather-text">{{ weather.tempNow }}° {{ weather.tempMin }}°~{{ weather.tempMax }}°</span>
        </div>
      </div>
      <van-tag :type="isWeekday ? 'primary' : 'warning'" size="large" round>{{ dateTypeLabel }}</van-tag>
    </div>

    <div class="section">
      <van-notice-bar left-icon="info-o" text="线路试运行，随时会调整，时间表和预测时间仅供参考。如方便可在记录页手动记录到站时间，帮助提高预测精度。" clickable @click="showNotice = true">
        <template #right-icon>
          <span style="color:var(--color-primary);font-size:13px;white-space:nowrap">详情 ›</span>
        </template>
      </van-notice-bar>
      <van-dialog v-model:show="showNotice" title="公告" confirm-button-text="我知道了">
        <div style="padding: 16px; font-size: 14px; line-height: 1.8; color: #374151;">
          线路试运行，随时会调整，时间表和预测时间仅供参考。<br><br>
          <b>如何帮忙校准：</b>点击底部「记录」→ 手动记录 → 输入昵称 → 选择线路 → 点击「上车」，到站停车即点击「计时」，下车提交，全程屏幕常亮，浏览器在前台。如未到站误触「计时」可点击回退，如测试功能或记录失败，可在我的记录中撤销。<br><br>
          <b>统一记录规范：</b>除首站发车是在车辆启动点击「上车」外，其余时候到站即点击「计时」，而非等上下客完毕车辆启动才点击。
        </div>
      </van-dialog>
      <van-search v-model="stopSearch" placeholder="搜索站点名称" shape="round" background="transparent" />
      <div class="stop-grid" v-if="!stopSearch">
        <template v-for="stop in (stopExpanded ? sortedStops : collapsedStops)" :key="stop">
          <span class="stop-chip" :class="{ active: selectedStop === stop }" @click="selectStop(stop)">
            {{ stop }}<span v-if="freqTop3.includes(stop)" class="freq-badge">常去</span>
          </span>
        </template>
        <span class="stop-chip more-btn" @click="stopExpanded = !stopExpanded">{{ stopExpanded ? '收起 ▲' : '更多 ▼' }}</span>
      </div>
      <div class="stop-grid" v-else>
        <span v-for="stop in filteredStops" :key="stop" class="stop-chip" :class="{ active: selectedStop === stop }" @click="selectStop(stop)">{{ stop }}</span>
        <span v-if="filteredStops.length === 0" class="no-result">未找到匹配站点</span>
      </div>
    </div>

    <div class="survey-line">
      <a href="https://v.wjx.cn/vm/thRw5hx.aspx" target="_blank" rel="noopener">📝 使用反馈</a>
    </div>

    <!-- 默认视图：周边各站过站车次 -->
    <template v-if="!selectedStop && nearbyStopArrivals.length > 0">
      <div v-for="section in nearbyStopArrivals" :key="section.stopName" class="section">
        <div class="section-title">「{{ section.stopName }}」 {{ section.walkLabel }}</div>
        <template v-for="(item, idx) in section.arrivals" :key="item.departure.recordId">
          <div v-if="idx < 5 || expandedSections.has(section.stopName)" class="bus-card nearby" :class="{ expanded: expandedCards.has(nearbyCardKey(item)) }" :style="{ borderLeft: `3px solid ${routeBorderColor(item.departure.routeKey)}` }">
            <div class="bus-card-main" @click="toggleBusCard(nearbyCardKey(item))">
            <div class="bus-card-left">
              <div class="route-col">
                <RouteBadge :route="item.departure.route" :dining="item.departure.routeKey === 'HX1_DINING'" />
                <span class="bus-shift">{{ item.departure.shiftName }}</span>
              </div>
              <span v-if="item.departure.isGaochaoDeparture" class="tags-col">
                <span class="bus-from">高超楼发车</span>
                <span class="depart-tag" :class="item.departed ? 'gone' : 'wait'">{{ item.departed ? '已发车' : '未发车' }}</span>
              </span>
              <span v-else class="depart-tag" :class="item.departed ? 'gone' : 'wait'">{{ item.departed ? '已发车' : '未发车' }}</span>
            </div>
            <div class="bus-card-right">
              <div class="walk-hint">{{ item.walkLabel }}到「{{ item.stopName }}」<van-icon v-if="item.walkWarning" name="warning-o" size="11" color="#F59E0B" class="walk-warn-icon" /></div>
              <div class="arrival-time">{{ item.arrivalTime }}</div>
              <ETAIndicator :seconds-until="item.secondsUntil!" type="arrival" />
            </div>
            </div>
            <BusStopTimeline
              v-if="expandedCards.has(nearbyCardKey(item))"
              :departure-id="item.departure.recordId"
              :route-key="item.departure.routeKey"
              :highlight-origin="item.stopName"
              @view-on-map="handleViewOnMap"
            />
          </div>
        </template>
        <div v-if="section.arrivals.length > 5" class="show-more-btn" @click="toggleNearbySection(section.stopName)">
          {{ expandedSections.has(section.stopName) ? '收起 ▲' : `展开更多 ${section.arrivals.length - 5} 趟车次 ↓` }}
        </div>
      </div>
    </template>

    <!-- 目的地车次推荐 -->
    <div v-if="selectedStop && scheduleStore.isDataLoaded" class="section">
      <div class="section-title">「{{ selectedStop }}」</div>
      <div v-if="stopArrivals.length === 0" class="empty-hint">当前时段暂无经过此站的车次</div>
      <div v-for="item in displayedArrivals" :key="busCardKey((item as any))" class="bus-card" :class="{ expanded: expandedCards.has(busCardKey((item as any))) }" :style="{ borderLeft: `3px solid ${routeBorderColor(item.departure?.routeKey)}` }">
        <div class="bus-card-main" @click="toggleBusCard(busCardKey((item as any)))">
        <div class="bus-card-left">
          <div class="route-col">
            <RouteBadge :route="item.departure?.route" :dining="item.departure?.routeKey === 'HX1_DINING'" />
            <span class="bus-shift">{{ item.departure?.shiftName }}</span>
          </div>
          <span v-if="item.departure?.isGaochaoDeparture" class="tags-col">
            <span class="bus-from">高超楼发车</span>
            <span class="depart-tag" :class="item.departed ? 'gone' : 'wait'">{{ item.departed ? '已发车' : '未发车' }}</span>
          </span>
          <span v-else class="depart-tag" :class="item.departed ? 'gone' : 'wait'">{{ item.departed ? '已发车' : '未发车' }}</span>
        </div>
        <div class="bus-card-right" v-if="item.candidateStop">
          <div class="boarding-info">{{ item.walkLabel }}到「{{ item.candidateStop }}」<van-icon v-if="item.walkWarning" name="warning-o" size="11" color="#F59E0B" class="walk-warn-icon" /></div>
          <ETAIndicator
            :seconds-until="item.boardSec!"
            :type="item.isOriginDeparture ? 'departure' : 'arrival'"
          />
          <div class="board-time">于{{ item.boardTime }}{{ item.isOriginDeparture ? '发车' : '到站' }}</div>
          <div class="dest-info">预计{{ item.destArrivalTime }} 到「{{ item.destStop }}」</div>
        </div>
        <div class="bus-card-right" v-else>
          <div class="arrival-time">{{ item.arrivalTime }}</div>
          <ETAIndicator :seconds-until="item.secondsUntil!" type="arrival" />
        </div>
        </div>
        <BusStopTimeline
          v-if="expandedCards.has(busCardKey((item as any)))"
          :departure-id="item.departure?.recordId"
          :route-key="item.departure?.routeKey"
          :highlight-stop="item.destStop || selectedStop"
          :highlight-origin="item.candidateStop"
          @view-on-map="handleViewOnMap"
        />
      </div>
      <div v-if="stopArrivals.length > 5" class="show-more-btn" @click="showAllArrivals = !showAllArrivals">
        {{ showAllArrivals ? '收起 ▲' : `展开更多 ${stopArrivals.length - 5} 趟车次 ↓` }}
      </div>
    </div>

    <div v-if="!selectedStop && (!mapStore.userLat || nearbyStopArrivals.length === 0)" class="gps-card">
      <van-icon name="location-o" size="20" />
      <span v-if="!mapStore.userLat">开启定位后自动推荐最近上车站点</span>
      <span v-else>已定位到「{{ nearestStop?.name }}」附近，请选择目的地查看推荐车次</span>
    </div>

    <div v-if="departingSoon.length > 0" class="section">
      <div class="section-title">即将发车</div>
      <template v-for="(item, idx) in departingSoon" :key="item.departure.recordId">
        <div v-if="idx < 5 || showAllDeparting"
          class="bus-card departing"
          :class="{ expanded: expandedCards.has('departing-' + item.departure.recordId) }"
          :style="{ borderLeft: `3px solid ${routeBorderColor(item.departure.routeKey)}` }">
          <div class="bus-card-main" @click="toggleBusCard('departing-' + item.departure.recordId)">
            <div class="bus-card-left">
              <div class="route-col">
                <RouteBadge :route="item.departure.route" :dining="item.departure.routeKey === 'HX1_DINING'" />
                <span class="bus-shift">{{ item.departure.shiftName }}</span>
              </div>
              <span class="bus-from" v-if="item.departure.isGaochaoDeparture">高超楼发车</span>
            </div>
            <div class="bus-card-right">
              <div class="departure-time">{{ item.departure.departureTime }}</div>
              <ETAIndicator :seconds-until="item.secondsUntil" type="departure" />
            </div>
          </div>
          <BusStopTimeline
            v-if="expandedCards.has('departing-' + item.departure.recordId)"
            :departure-id="item.departure.recordId"
            :route-key="item.departure.routeKey"
            @view-on-map="handleViewOnMap"
          />
        </div>
      </template>
      <div v-if="departingSoon.length > 5" class="show-more-btn" @click="showAllDeparting = !showAllDeparting">
        {{ showAllDeparting ? '收起 ▲' : `展开更多 ${departingSoon.length - 5} 趟车次 ↓` }}
      </div>
    </div>

    <div v-if="!scheduleStore.isDataLoaded" class="loading">
      <van-loading size="32" />
      <p>加载时刻表数据...</p>
    </div>
  </div>
</template>

<style scoped>
.home-page { padding: 16px; max-width: 640px; margin: 0 auto; }
.today-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.date-text { font-size: 16px; font-weight: 600; }
.weather-row { display: flex; align-items: center; gap: 4px; }
.weather-icon { font-size: 16px; }
.weather-text { font-size: 13px; color: var(--color-text-secondary); white-space: nowrap; }
.section { margin-bottom: 20px; }
.section-title { font-size: 15px; font-weight: 600; margin-bottom: 10px; color: var(--color-text); }
.stop-grid { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 12px; }
.stop-chip { padding: 4px 10px; background: var(--color-card); border-radius: 14px; font-size: 12px; border: 1px solid var(--color-border); cursor: pointer; position: relative; transition: all 0.15s; }
.stop-chip:active { background: #EFF6FF; border-color: var(--color-primary); }
.stop-chip.active { background: #EFF6FF; border-color: var(--color-primary); color: var(--color-primary); font-weight: 600; }
.freq-badge { position: absolute; top: -5px; right: -5px; background: var(--color-primary); color: #fff; font-size: 9px; padding: 0 3px; border-radius: 5px; line-height: 13px; }
.more-btn { background: #F3F4F6; border-color: #D1D5DB; color: var(--color-text-secondary); }
.no-result { font-size: 13px; color: var(--color-text-secondary); padding: 4px; }
.gps-card { display: flex; align-items: center; gap: 10px; padding: 14px; background: #EFF6FF; border-radius: 10px; font-size: 14px; color: var(--color-primary); margin-bottom: 16px; }
.empty-hint { color: var(--color-text-secondary); font-size: 13px; text-align: center; padding: 24px; }
.walk-hint { font-size: 11px; color: var(--color-text-secondary); margin-bottom: 2px; }
.walk-warn-icon { margin-left: 3px; vertical-align: -1px; cursor: help; }
.bus-card { background: var(--color-card); border-radius: 10px; margin-bottom: 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.04); overflow: hidden; border-left: 3px solid transparent; }
.bus-card.expanded { box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
.bus-card-main { display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; cursor: pointer; user-select: none; }
.bus-card-main:active { background: #F9FAFB; }
.bus-card-left { display: flex; align-items: center; gap: 8px; flex: 1; overflow: hidden; }
.route-col { display: flex; flex-direction: column; align-items: center; gap: 1px; flex-shrink: 0; }
.bus-shift { font-size: 13px; color: var(--color-text-secondary); white-space: nowrap; }
.bus-from { font-size: 11px; color: #F59E0B; white-space: nowrap; }
.tags-col { display: flex; flex-direction: column; align-items: center; gap: 2px; line-height: 1.2; }
.bus-card-right { text-align: right; flex-shrink: 0; }
.depart-tag { font-size: 10px; padding: 1px 5px; border-radius: 4px; white-space: nowrap; }
.depart-tag.gone { background: #D1FAE5; color: #059669; }
.depart-tag.wait { background: #FEE2E2; color: #DC2626; }
.arrival-time { font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--color-primary); }
.departure-time { font-size: 20px; font-weight: 700; color: var(--color-primary); }
.boarding-info { font-size: 12px; color: #10B981; }
.dest-info { font-size: 12px; color: var(--color-text-secondary); margin-top: 2px; }
.board-time { font-size: 12px; color: var(--color-text-secondary); }
.loading { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 0; color: var(--color-text-secondary); gap: 12px; }
.survey-line { text-align: center; padding: 0; }
.survey-line a { color: #9CA3AF; font-size: 12px; text-decoration: none; }
.survey-line a:active { color: var(--color-primary); }
</style>
