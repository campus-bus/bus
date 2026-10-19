<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useScheduleStore } from '@/stores/schedule'
import { getDateType } from '@/utils/datetime'
import { getDateLabel } from '@/utils/holidays'
import { getNow } from '@/utils/time'
import { toGroup, groupMembers, findBestRide } from '@/utils/station_group'
import type { Departure, RouteName, DateType } from '@/types'

const scheduleStore = useScheduleStore()

const activeTab = ref(0)

// ─── 站点列表（组化） ───
// 站点按组聚合显示：军体活动中心东/南 → 军体活动中心，二食堂/二食堂北 → 二食堂
const allStops = computed(() => {
  const names = new Set<string>()
  for (const rp of scheduleStore.routePatterns) {
    for (const s of rp.stops) names.add(toGroup(s.currentStop))
  }
  // 按首页点击频次排序（组频次 = 成员频次之和），常用站排在前面
  let freq: Record<string, number> = {}
  try { freq = JSON.parse(uni.getStorageSync('stop_click_freq') || '{}') } catch { freq = {} }
  const groupFreq: Record<string, number> = {}
  for (const [stop, f] of Object.entries(freq)) {
    const g = toGroup(stop)
    groupFreq[g] = (groupFreq[g] || 0) + f
  }
  return [...names].sort((a, b) => (groupFreq[b] || 0) - (groupFreq[a] || 0))
})

// ─── 行程规划 ───
function todayStr() {
  const d = getNow()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const planDate = ref(todayStr())
const planOrigin = ref('研究生宿舍楼')
const planDest = ref('高超楼')
const planDeadline = ref('20:00')

interface PlanResult {
  departure: Departure
  boardStop: string
  boardTime: string
  boardMinutes: number
  boardSeq: number
  destStop: string
  destTime: string
  destMinutes: number
  destSeq: number
  isBoardDeparture: boolean
}
const planResults = ref<PlanResult[]>([])
const planShowAll = ref(false)
const searched = ref(false)

// 切换顶部 tab、日期或起止站后，旧查询结果已失效，清空避免误导
function resetPlanResults() {
  planResults.value = []
  planShowAll.value = false
  searched.value = false
}
watch([activeTab, planDate, planOrigin, planDest], resetPlanResults)

const planDateType = computed<DateType>(() => getDateType(new Date(planDate.value + 'T00:00:00+08:00')))
const planDateLabel = computed(() => getDateLabel(new Date(planDate.value + 'T00:00:00+08:00')))

const routes: RouteName[] = ['环线1路', '接驳1路', '接驳2路']
const predsByDeparture = computed(() => {
  const m = new Map<string, typeof scheduleStore.predictions>()
  for (const p of scheduleStore.predictions) {
    const l = m.get(p.departureId)
    if (l) l.push(p)
    else m.set(p.departureId, [p])
  }
  return m
})

function doSearch() {
  const [dh, dm] = planDeadline.value.split(':').map(Number)
  const deadlineMin = dh * 60 + dm
  const dt = planDateType.value
  const originMembers = groupMembers(planOrigin.value)
  const destMembers = groupMembers(planDest.value)
  const results: PlanResult[] = []

  for (const r of routes) {
    for (const dep of scheduleStore.getDepartures(dt, r)) {
      const preds = (predsByDeparture.value.get(dep.recordId) || []).slice().sort((a, b) => a.stopSeq - b.stopSeq)
      const best = findBestRide(preds, originMembers, destMembers)
      if (!best) continue
      if (best.dest.arrivalMinutes > deadlineMin) continue
      results.push({
        departure: dep,
        boardStop: best.origin.stopName, boardTime: best.origin.arrivalTime,
        boardMinutes: best.origin.arrivalMinutes, boardSeq: best.origin.stopSeq,
        destStop: best.dest.stopName, destTime: best.dest.arrivalTime,
        destMinutes: best.dest.arrivalMinutes, destSeq: best.dest.stopSeq,
        isBoardDeparture: best.origin.isDepartureStop,
      })
    }
  }
  results.sort((a, b) => b.destMinutes - a.destMinutes)
  planResults.value = results
  planShowAll.value = false
  searched.value = true
}

// ─── 总时刻表 ───
const selectedRoute = ref<RouteName>('环线1路')
const selectedDateType = ref<DateType>(getDateType(getNow()))
const sortByTime = ref(true)
const expandedId = ref<string | null>(null)

const departures = computed(() => scheduleStore.getDepartures(selectedDateType.value, selectedRoute.value))
const timeSorted = computed(() => [...departures.value].sort((a, b) => a.departureMinutes - b.departureMinutes))

const cnNum: Record<string, number> = { '一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10 }
function shiftOrder(name: string): number {
  for (const [cn, n] of Object.entries(cnNum)) if (name.includes(cn)) return n
  return 0
}
const grouped = computed(() => {
  const g = new Map<string, Departure[]>()
  for (const d of departures.value) {
    if (!g.has(d.shiftName)) g.set(d.shiftName, [])
    g.get(d.shiftName)!.push(d)
  }
  return new Map([...g.entries()].sort((a, b) => shiftOrder(a[0]) - shiftOrder(b[0])))
})

function toggleExpand(id: string) { expandedId.value = expandedId.value === id ? null : id }
function getTimeline(recordId: string) {
  return (predsByDeparture.value.get(recordId) || []).slice().sort((a, b) => a.stopSeq - b.stopSeq)
}

const ROUTE_COLORS: Record<string, string> = {
  HX1_NORMAL: '#2563EB', HX1_DINING: '#F59E0B',
  JB1_NORMAL: '#10B981', JB2_NORMAL: '#8B5CF6',
}
function routeColor(routeKey?: string) { return ROUTE_COLORS[routeKey || ''] || '#6B7280' }
function routeNameOf(dep: Departure) { return dep.routeKey === 'HX1_DINING' ? '环1·就餐' : dep.route }
function switchRoute(r: RouteName) {
  selectedRoute.value = r
  if (r === '环线1路' && selectedDateType.value === 'weekend_holiday') selectedDateType.value = 'weekday'
}
</script>

<template>
  <view class="schedule-page">
    <!-- 顶部 tab -->
    <view class="top-tabs">
      <view class="top-tab" :class="{ active: activeTab === 0 }" @tap="activeTab = 0">行程规划</view>
      <view class="top-tab" :class="{ active: activeTab === 1 }" @tap="activeTab = 1">总时刻表</view>
    </view>

    <!-- 行程规划 -->
    <view v-if="activeTab === 0" class="planner">
      <view class="row">
        <text class="label">日期</text>
        <picker mode="date" :value="planDate" @change="(e: any) => planDate = e.detail.value">
          <view class="input">{{ planDate }}</view>
        </picker>
        <text class="date-tag" :class="planDateType === 'weekday' ? 'wd' : 'we'">{{ planDateLabel }}</text>
      </view>
      <view class="row">
        <text class="label">出发</text>
        <picker :range="allStops" :value="allStops.indexOf(planOrigin)" @change="(e: any) => planOrigin = allStops[e.detail.value]">
          <view class="input">{{ planOrigin || '选择出发站' }}</view>
        </picker>
      </view>
      <view class="row">
        <text class="label">到达</text>
        <picker :range="allStops" :value="allStops.indexOf(planDest)" @change="(e: any) => planDest = allStops[e.detail.value]">
          <view class="input">{{ planDest || '选择到达站' }}</view>
        </picker>
      </view>
      <view class="row">
        <text class="label">期限</text>
        <picker mode="time" :value="planDeadline" @change="(e: any) => planDeadline = e.detail.value">
          <view class="input">{{ planDeadline }} 前到达</view>
        </picker>
      </view>
      <view class="search-btn" @tap="doSearch">查询可乘线路</view>

      <view v-if="planResults.length > 0" class="results">
        <view class="result-title">找到 {{ planResults.length }} 趟车次（按到达时间从晚到早排列）</view>
        <view v-for="(r, i) in (planShowAll ? planResults : planResults.slice(0, 10))" :key="i" class="plan-card">
          <view class="plan-head">
            <view class="route-badge" :style="{ background: routeColor(r.departure.routeKey) }">{{ routeNameOf(r.departure) }}</view>
            <text class="plan-shift">{{ r.departure.shiftName }}</text>
            <text v-if="r.departure.isGaochaoDeparture" class="tag-dining">高超楼发车</text>
          </view>
          <view class="plan-body">
            <view class="step"><view class="dot start"></view>
              <text><text class="time-strong">{{ r.boardTime.slice(0, 5) }}</text> {{ r.isBoardDeparture ? '发车' : '上车' }} 「{{ r.boardStop }}」</text>
            </view>
            <view class="step-line"></view>
            <view class="step"><view class="dot end"></view>
              <text><text class="time-strong">{{ r.destTime.slice(0, 5) }}</text> 到达 「{{ r.destStop }}」</text>
            </view>
          </view>
        </view>
        <view v-if="planResults.length > 10 && !planShowAll" class="show-more" @tap="planShowAll = true">
          展开查看更早到达的 {{ planResults.length - 10 }} 趟车次 ▼
        </view>
      </view>
      <view v-else-if="searched" class="empty">该时段无可乘线路</view>
    </view>

    <!-- 总时刻表 -->
    <view v-else>
      <view class="route-tabs">
        <view v-for="r in routes" :key="r" class="route-tab" :class="{ active: selectedRoute === r }" @tap="switchRoute(r)">{{ r }}</view>
      </view>
      <view class="date-toggle">
        <view class="dt-left">
          <view class="dt-btn" :class="{ active: selectedDateType === 'weekday' }" @tap="selectedDateType = 'weekday'">工作日</view>
          <view class="dt-btn" :class="{ active: selectedDateType === 'weekend_holiday' }" @tap="selectedDateType = 'weekend_holiday'">周末/节假日</view>
        </view>
        <view class="sort-toggle" @tap="sortByTime = !sortByTime">{{ sortByTime ? '按时间' : '按班次' }}</view>
      </view>

      <view v-if="selectedRoute === '环线1路' && selectedDateType === 'weekend_holiday'" class="notice">
        环线1路仅在工作日运行，周末/节假日无环线1路车次。
      </view>
      <view v-if="selectedRoute !== '环线1路' && selectedDateType === 'weekend_holiday'" class="notice">
        周末/节假日时刻表暂未公布。
      </view>

      <view v-if="departures.length > 0" class="dep-list">
        <!-- 按时间 -->
        <template v-if="sortByTime">
          <view v-for="dep in timeSorted" :key="dep.recordId" class="dep-row">
            <view class="dep-main" @tap="toggleExpand(dep.recordId)">
              <view class="dep-left">
                <view class="route-badge" :style="{ background: routeColor(dep.routeKey) }">{{ routeNameOf(dep) }}</view>
                <text class="dep-time">{{ dep.departureTime }}</text>
                <text v-if="dep.isGaochaoDeparture" class="tag-dining">高超楼发车</text>
                <text v-if="dep.shiftName" class="dep-shift">{{ dep.shiftName }}</text>
              </view>
              <text class="arrow" :class="{ rotated: expandedId === dep.recordId }">▾</text>
            </view>
            <view v-if="expandedId === dep.recordId" class="timeline">
              <view v-for="stop in getTimeline(dep.recordId)" :key="stop.stopSeq" class="tl-row">
                <view class="tl-dot" :class="{ start: stop.isDepartureStop, end: stop.isReturnStop }"></view>
                <text class="tl-name">{{ stop.stopName }}</text>
                <text class="tl-time">{{ stop.arrivalTime }}</text>
              </view>
            </view>
          </view>
        </template>
        <!-- 按班次 -->
        <template v-else>
          <view v-for="[shift, deps] in grouped" :key="shift || 'all'">
            <view v-if="shift" class="shift-title">{{ shift }}</view>
            <view v-for="dep in deps" :key="dep.recordId" class="dep-row">
              <view class="dep-main" @tap="toggleExpand(dep.recordId)">
                <view class="dep-left">
                  <view class="route-badge" :style="{ background: routeColor(dep.routeKey) }">{{ routeNameOf(dep) }}</view>
                  <text class="dep-time">{{ dep.departureTime }}</text>
                  <text v-if="dep.isGaochaoDeparture" class="tag-dining">高超楼发车</text>
                </view>
                <text class="arrow" :class="{ rotated: expandedId === dep.recordId }">▾</text>
              </view>
              <view v-if="expandedId === dep.recordId" class="timeline">
                <view v-for="stop in getTimeline(dep.recordId)" :key="stop.stopSeq" class="tl-row">
                  <view class="tl-dot" :class="{ start: stop.isDepartureStop, end: stop.isReturnStop }"></view>
                  <text class="tl-name">{{ stop.stopName }}</text>
                  <text class="tl-time">{{ stop.arrivalTime }}</text>
                </view>
              </view>
            </view>
          </view>
        </template>
      </view>
      <view v-else class="empty">该日期类型暂无此线路发车</view>
    </view>
  </view>
</template>

<style scoped>
.schedule-page { padding-bottom: 24rpx; }
.top-tabs { display: flex; background: #fff; }
.top-tab { flex: 1; text-align: center; padding: 24rpx 0; font-size: 28rpx; color: #6B7280; border-bottom: 4rpx solid transparent; }
.top-tab.active { color: #1A56DB; font-weight: 600; border-bottom-color: #1A56DB; }

.planner { padding: 20rpx 24rpx; }
.row { display: flex; align-items: center; gap: 14rpx; margin-bottom: 14rpx; }
.label { width: 72rpx; font-size: 26rpx; color: #6B7280; flex-shrink: 0; }
.input { flex: 1; background: #fff; border-radius: 12rpx; padding: 14rpx 20rpx; font-size: 28rpx; }
.date-tag { font-size: 22rpx; padding: 4rpx 14rpx; border-radius: 999rpx; flex-shrink: 0; }
.date-tag.wd { background: #EFF6FF; color: #1A56DB; }
.date-tag.we { background: #FEF3C7; color: #92400E; }
.search-btn { background: #1A56DB; color: #fff; text-align: center; padding: 18rpx; border-radius: 999rpx; font-size: 30rpx; margin: 20rpx 0; }

.result-title { font-size: 24rpx; color: #6B7280; margin-bottom: 12rpx; }
.plan-card { background: #fff; border-radius: 14rpx; padding: 18rpx 22rpx; margin-bottom: 12rpx; }
.plan-head { display: flex; align-items: center; gap: 12rpx; margin-bottom: 12rpx; }
.plan-shift { font-size: 24rpx; color: #6B7280; flex: 1; }
.plan-body { padding-left: 8rpx; }
.step { display: flex; align-items: center; gap: 12rpx; font-size: 26rpx; padding: 4rpx 0; }
.dot { width: 14rpx; height: 14rpx; border-radius: 50%; flex-shrink: 0; }
.dot.start { background: #10B981; }
.dot.end { background: #1A56DB; }
.step-line { width: 4rpx; height: 18rpx; background: #E5E7EB; margin: 2rpx 5rpx; }
.time-strong { color: #1A56DB; font-weight: 700; }
.show-more { text-align: center; padding: 16rpx; font-size: 24rpx; color: #1A56DB; }

.route-tabs { display: flex; gap: 12rpx; padding: 16rpx 24rpx; }
.route-tab { flex: 1; text-align: center; padding: 12rpx 0; font-size: 26rpx; background: #fff; border-radius: 10rpx; color: #6B7280; border: 1rpx solid #E5E7EB; }
.route-tab.active { background: #1A56DB; color: #fff; border-color: #1A56DB; }
.date-toggle { display: flex; justify-content: space-between; align-items: center; padding: 0 24rpx 16rpx; }
.dt-left { display: flex; gap: 12rpx; }
.dt-btn { padding: 8rpx 20rpx; font-size: 24rpx; border-radius: 999rpx; background: #fff; color: #6B7280; border: 1rpx solid #E5E7EB; }
.dt-btn.active { background: #EFF6FF; color: #1A56DB; border-color: #1A56DB; }
.sort-toggle { font-size: 24rpx; color: #6B7280; padding: 8rpx 16rpx; border: 1rpx solid #E5E7EB; border-radius: 999rpx; background: #fff; }
.notice { margin: 0 24rpx 16rpx; padding: 16rpx; background: #FEF3C7; color: #92400E; border-radius: 10rpx; font-size: 24rpx; text-align: center; }

.dep-list { padding: 0 24rpx; }
.shift-title { font-size: 24rpx; font-weight: 600; color: #6B7280; padding: 16rpx 0 8rpx; }
.dep-row { background: #fff; border-radius: 12rpx; margin-bottom: 10rpx; overflow: hidden; }
.dep-main { display: flex; justify-content: space-between; align-items: center; padding: 18rpx 22rpx; }
.dep-left { display: flex; align-items: center; gap: 14rpx; }
.dep-time { font-size: 34rpx; font-weight: 700; font-variant-numeric: tabular-nums; }
.dep-shift { font-size: 22rpx; color: #9CA3AF; }
.tag-dining { font-size: 20rpx; color: #F59E0B; }
.route-badge { color: #fff; font-size: 22rpx; font-weight: 600; padding: 4rpx 14rpx; border-radius: 8rpx; }
.arrow { color: #9CA3AF; transition: transform 0.2s; }
.arrow.rotated { transform: rotate(180deg); }
.timeline { border-top: 1rpx solid #F3F4F6; padding: 12rpx 22rpx; background: #FAFBFC; }
.tl-row { display: flex; align-items: center; gap: 14rpx; padding: 6rpx 0; }
.tl-dot { width: 12rpx; height: 12rpx; border-radius: 50%; background: #CBD5E1; flex-shrink: 0; }
.tl-dot.start { background: #10B981; }
.tl-dot.end { background: #1A56DB; }
.tl-name { flex: 1; font-size: 26rpx; }
.tl-time { font-size: 24rpx; color: #6B7280; font-variant-numeric: tabular-nums; }
.empty { text-align: center; padding: 80rpx 24rpx; font-size: 26rpx; color: #6B7280; }
</style>
