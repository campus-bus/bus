<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useScheduleStore } from '@/stores/schedule'
import { getDateType } from '@/utils/datetime'
import { getDateLabel } from '@/utils/holidays'
import { getNow } from '@/utils/time'
import type { RouteName, DateType, Departure } from '@/types'
import RouteBadge from '@/components/common/RouteBadge.vue'
import BusStopTimeline from '@/components/common/BusStopTimeline.vue'

interface PlanResult {
  departure: Departure
  boardStop: string
  boardTime: string
  boardMinutes: number
  destStop: string
  destTime: string
  destMinutes: number
  isBoardDeparture: boolean
}

const scheduleStore = useScheduleStore()

// ─── 模式 ───
const activeMode = ref(0)

// ─── 总时刻表 ───
const selectedRoute = ref<RouteName>('环线1路')
const selectedDateType = ref<DateType>(getDateType())
const expandedId = ref<string | null>(null)
const sortByTime = ref(true)  // true=按发车时间排列, false=按班次排列
const routes: RouteName[] = ['环线1路', '接驳1路', '接驳2路']

const departures = computed(() => scheduleStore.getDepartures(selectedDateType.value, selectedRoute.value))

const cnNum: Record<string, number> = { '一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10 }
function shiftOrder(name: string): number {
  for (const [cn, n] of Object.entries(cnNum)) { if (name.includes(cn)) return n }
  return 0
}
const groupedDepartures = computed(() => {
  const groups = new Map<string, typeof departures.value>()
  for (const dep of departures.value) {
    if (!groups.has(dep.shiftName)) groups.set(dep.shiftName, [])
    groups.get(dep.shiftName)!.push(dep)
  }
  return new Map([...groups.entries()].sort((a, b) => shiftOrder(a[0]) - shiftOrder(b[0])))
})

// 按发车时间排列（平铺，不分班次）
const timeSortedDepartures = computed(() => {
  return [...departures.value].sort((a, b) => a.departureMinutes - b.departureMinutes)
})

function toggleExpand(recordId: string) {
  expandedId.value = expandedId.value === recordId ? null : recordId
}
function isDining(dep: (typeof departures.value)[0]): boolean {
  return dep.routeKey === 'HX1_DINING'
}
watch(selectedRoute, (r) => {
  if (r === '环线1路' && selectedDateType.value === 'weekend_holiday') selectedDateType.value = 'weekday'
})

// ─── 行程规划 ───
function todayStr(): string {
  const d = getNow()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const planDate = ref(todayStr())
const planOrigin = ref('研究生宿舍楼')
const planDest = ref('高超楼')
const planDeadline = ref('20:00')
const planResults = ref<PlanResult[]>([])
const planShowAll = ref(false)
const planDisplayed = computed(() => planShowAll.value ? planResults.value : planResults.value.slice(0, 10))
const planDateType = computed<DateType>(() => {
  if (!planDate.value) return getDateType()
  return getDateType(new Date(planDate.value + 'T00:00:00+08:00'))
})
const planDateLabel = computed(() => {
  if (!planDate.value) return ''
  return getDateLabel(new Date(planDate.value + 'T00:00:00+08:00'))
})

const allStops = computed(() => {
  const names = new Set<string>()
  for (const rp of scheduleStore.routePatterns) {
    for (const s of rp.stops) names.add(s.currentStop)
  }
  // 按首页点击频次排序
  let freq: Record<string, number> = {}
  try { freq = JSON.parse(localStorage.getItem('stop_click_freq') || '{}') } catch {}
  return [...names].sort((a, b) => (freq[b] || 0) - (freq[a] || 0))
})

// 重置，避免切换模式后不同日期类型混淆
watch(activeMode, () => { planResults.value = [] })

function doSearch() {
  if (!planOrigin.value || !planDest.value || !planDeadline.value || !planDate.value) return
  const [dh, dm] = planDeadline.value.split(':').map(Number)
  const deadlineMin = dh * 60 + dm
  const dt = planDateType.value
  const results: PlanResult[] = []

  for (const r of routes) {
    const deps = scheduleStore.getDepartures(dt, r)
    for (const dep of deps) {
      const preds = scheduleStore.predictions
        .filter(p => p.departureId === dep.recordId)
        .sort((a, b) => a.stopSeq - b.stopSeq)
      const originIdx = preds.findIndex(p => p.stopName === planOrigin.value)
      if (originIdx < 0) continue
      const destIdx = preds.findIndex((p, i) => i > originIdx && p.stopName === planDest.value)
      if (destIdx < 0) continue
      const destPred = preds[destIdx]
      if (destPred.arrivalMinutes > deadlineMin) continue
      const originPred = preds[originIdx]
      results.push({
        departure: dep,
        boardStop: originPred.stopName,
        boardTime: originPred.arrivalTime,
        boardMinutes: originPred.arrivalMinutes,
        destStop: destPred.stopName,
        destTime: destPred.arrivalTime,
        destMinutes: destPred.arrivalMinutes,
        isBoardDeparture: originPred.isDepartureStop,
      })
    }
  }
  results.sort((a, b) => b.destMinutes - a.destMinutes)
  planResults.value = results
  planShowAll.value = false
}

// 行程规划的下拉展开
const planExpandedId = ref<string | null>(null)
function togglePlanExpand(recordId: string) {
  planExpandedId.value = planExpandedId.value === recordId ? null : recordId
}
</script>

<template>
  <div class="schedule-page">
    <!-- 顶部模式切换（可滑动） -->
    <van-tabs v-model:active="activeMode" swipeable color="var(--color-primary)">
      <van-tab title="行程规划" />
      <van-tab title="总时刻表" />
    </van-tabs>

    <!-- ========== 行程规划 ========== -->
    <div v-if="activeMode === 0" class="planner-panel">
      <div class="planner-row">
        <label>日期</label>
        <input v-model="planDate" type="date" />
        <span v-if="planDateLabel" class="date-type-tag" :class="planDateType === 'weekday' ? 'tag-wd' : 'tag-we'">{{ planDateLabel }}</span>
      </div>
      <div class="planner-row">
        <label>出发</label>
        <select v-model="planOrigin">
          <option value="">选择出发站</option>
          <option v-for="s in allStops" :key="s" :value="s">{{ s }}</option>
        </select>
      </div>
      <div class="planner-row">
        <label>到达</label>
        <select v-model="planDest">
          <option value="">选择到达站</option>
          <option v-for="s in allStops" :key="s" :value="s">{{ s }}</option>
        </select>
      </div>
      <div class="planner-row">
        <label>期限</label>
        <input v-model="planDeadline" type="time" placeholder="在此之前到达" />
      </div>
      <van-button type="primary" block round @click="doSearch" :disabled="!planOrigin || !planDest || !planDeadline || !planDate">查询可乘线路</van-button>

      <!-- 结果 -->
      <div v-if="planResults.length > 0" class="plan-results">
        <div class="plan-result-title">找到 {{ planResults.length }} 趟车次（按到达时间从晚到早排列）</div>
        <div v-for="(r, i) in planDisplayed" :key="i" class="plan-card" :class="{ expanded: planExpandedId === r.departure.recordId }">
          <div class="plan-card-top" @click="togglePlanExpand(r.departure.recordId)">
            <RouteBadge :route="r.departure.route" :dining="r.departure.routeKey === 'HX1_DINING'" />
            <span class="plan-shift">{{ r.departure.shiftName }}</span>
            <span class="plan-from" v-if="r.departure.isGaochaoDeparture">高超楼发车</span>
            <van-icon name="arrow-down" class="plan-arrow" :class="{ rotated: planExpandedId === r.departure.recordId }" />
          </div>
          <div class="plan-card-body">
            <div class="plan-step">
              <span class="plan-step-dot start"></span>
              <span class="plan-step-text"><strong>{{ r.boardTime }}</strong> {{ r.isBoardDeparture ? '发车' : '上车' }} 「{{ r.boardStop }}」</span>
            </div>
            <div class="plan-step-line"></div>
            <div class="plan-step">
              <span class="plan-step-dot end"></span>
              <span class="plan-step-text"><strong>{{ r.destTime }}</strong> 到达 「{{ r.destStop }}」</span>
            </div>
          </div>
          <BusStopTimeline
            v-if="planExpandedId === r.departure.recordId"
            :departure-id="r.departure.recordId"
            :route-key="r.departure.routeKey"
            :highlight-stop="planDest"
            :highlight-origin="planOrigin"
            :show-map-btn="false"
          />
        </div>
      </div>
      <div v-if="planResults.length > 10 && !planShowAll" class="plan-expand" @click="planShowAll = true">
        展开查看更早到达的 {{ planResults.length - 10 }} 趟车次 ↓
      </div>
      <div v-else-if="planOrigin && planDest && planDeadline && planDate" class="plan-empty">该时段无可乘线路</div>
    </div>

    <!-- ========== 总时刻表 ========== -->
    <div v-if="activeMode === 1">
      <van-tabs v-model:active="selectedRoute" type="card" color="var(--color-primary)" @update:active="(name: string) => selectedRoute = name as RouteName">
        <van-tab v-for="r in routes" :key="r" :name="r" :title="r" />
      </van-tabs>

      <div class="date-toggle">
        <div class="date-toggle-left">
          <van-button :type="selectedDateType === 'weekday' ? 'primary' : 'default'" size="small" @click="selectedDateType = 'weekday'">工作日</van-button>
          <van-button :type="selectedDateType === 'weekend_holiday' ? 'primary' : 'default'" size="small" @click="selectedDateType = 'weekend_holiday'">周末/节假日</van-button>
        </div>
        <div class="sort-toggle" @click="sortByTime = !sortByTime">
          <van-icon :name="sortByTime ? 'clock-o' : 'bars'" size="14" />
          <span>{{ sortByTime ? '时间' : '班次' }}</span>
          <van-icon name="arrow" size="10" style="margin-left:2px" />
        </div>
      </div>

      <div v-if="selectedRoute === '环线1路' && selectedDateType === 'weekend_holiday'" class="notice">
        环线1路仅在<strong>工作日</strong>运行，周末/节假日无环线1路车次。
      </div>

      <div v-if="departures.length > 0" class="departures">
        <!-- 按班次排列 -->
        <template v-if="!sortByTime">
          <div v-for="[shift, deps] in groupedDepartures" :key="shift" class="shift-group">
            <div v-if="shift" class="shift-title">{{ shift }}</div>
            <div v-for="dep in deps" :key="dep.recordId" class="dep-row" :class="{ expanded: expandedId === dep.recordId }">
              <div class="dep-main" @click="toggleExpand(dep.recordId)">
                <div class="dep-left">
                  <RouteBadge :route="dep.route" :dining="isDining(dep)" />
                  <span class="dep-time">{{ dep.departureTime }}</span>
                  <span class="dep-station" v-if="dep.isGaochaoDeparture">高超楼发车</span>
                </div>
                <div class="dep-right">
                  <span v-if="dep.confidence === 'speculative'" class="tag-spec">待确认</span>
                  <span v-if="isDining(dep)" class="tag-dining">就餐</span>
                  <van-icon name="arrow-down" :class="{ rotated: expandedId === dep.recordId }" />
                </div>
              </div>
              <BusStopTimeline v-if="expandedId === dep.recordId" :departure-id="dep.recordId" :route-key="dep.routeKey" :show-map-btn="false" />
            </div>
          </div>
        </template>

        <!-- 按发车时间排列 -->
        <div v-else class="shift-group">
          <div v-for="dep in timeSortedDepartures" :key="dep.recordId" class="dep-row" :class="{ expanded: expandedId === dep.recordId }">
            <div class="dep-main" @click="toggleExpand(dep.recordId)">
              <div class="dep-left">
                <RouteBadge :route="dep.route" :dining="isDining(dep)" />
                <span class="dep-time">{{ dep.departureTime }}</span>
                <span class="dep-station" v-if="dep.isGaochaoDeparture">高超楼发车</span>
                <span class="dep-shift-tag">{{ dep.shiftName }}</span>
              </div>
              <div class="dep-right">
                <span v-if="dep.confidence === 'speculative'" class="tag-spec">待确认</span>
                <span v-if="isDining(dep)" class="tag-dining">就餐</span>
                <van-icon name="arrow-down" :class="{ rotated: expandedId === dep.recordId }" />
              </div>
            </div>
            <BusStopTimeline v-if="expandedId === dep.recordId" :departure-id="dep.recordId" :route-key="dep.routeKey" :show-map-btn="false" />
          </div>
        </div>
      </div>
      <div v-else-if="scheduleStore.isDataLoaded" class="empty">该日期类型暂无此线路发车</div>
    </div>
  </div>
</template>

<style scoped>
.schedule-page { padding-bottom: 20px; }

/* 行程规划 */
.planner-panel { padding: 12px 16px; }
.planner-row {
  display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 14px;
}
.planner-row label { width: 36px; color: var(--color-text-secondary); flex-shrink: 0; }
.planner-row select, .planner-row input[type="date"], .planner-row input[type="time"] {
  flex: 1; padding: 6px 10px; border: 1px solid var(--color-border);
  border-radius: 8px; font-size: 14px; outline: none; background: #fff;
}
.planner-row input:focus, .planner-row select:focus { border-color: var(--color-primary); }
.date-type-tag {
  font-size: 11px; padding: 2px 8px; border-radius: 10px; white-space: nowrap;
}
.tag-wd { background: #EFF6FF; color: var(--color-primary); }
.tag-we { background: #FEF3C7; color: #92400E; }

.plan-results { margin-top: 16px; }
.plan-result-title { font-size: 13px; font-weight: 600; color: var(--color-text-secondary); margin-bottom: 8px; }
.plan-card {
  background: var(--color-card); border-radius: 10px; margin-bottom: 8px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.04); overflow: hidden;
}
.plan-card-top {
  display: flex; align-items: center; gap: 8px; padding: 12px 14px; cursor: pointer; user-select: none;
}
.plan-card-top:active { background: #F9FAFB; }
.plan-shift { font-size: 13px; color: var(--color-text-secondary); flex: 1; }
.plan-from { font-size: 11px; color: #F59E0B; }
.plan-arrow { transition: transform 0.2s; flex-shrink: 0; }
.plan-arrow.rotated { transform: rotate(180deg); }
.plan-card-body { padding: 0 14px 10px; }
.plan-step { display: flex; align-items: center; gap: 8px; padding: 2px 0; }
.plan-step-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.plan-step-dot.start { background: var(--color-hx2); }
.plan-step-dot.end { background: var(--color-hx1); }
.plan-step-line { width: 2px; height: 10px; background: #E5E7EB; margin: 1px 3px; }
.plan-step-text { font-size: 13px; color: var(--color-text); }
.plan-step-text strong { color: var(--color-primary); }
.plan-empty { text-align: center; padding: 24px; color: var(--color-text-secondary); font-size: 13px; }
.plan-expand {
  text-align: center; padding: 12px; color: var(--color-primary);
  font-size: 13px; cursor: pointer; user-select: none;
}

/* 总时刻表 */
.date-toggle {
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px 16px; background: var(--color-card);
}
.date-toggle-left { display: flex; gap: 10px; }
.sort-toggle {
  display: flex; align-items: center; gap: 4px;
  padding: 4px 10px; border: 1px solid var(--color-border); border-radius: 14px;
  font-size: 12px; color: var(--color-text-secondary); cursor: pointer; user-select: none;
  white-space: nowrap;
}
.sort-toggle:active { background: #F3F4F6; }
.notice { margin: 12px 16px; padding: 12px; background: #FEF3C7; color: #92400E; border-radius: 8px; font-size: 13px; text-align: center; }
.shift-group { padding: 0 16px; }
.shift-title { font-size: 13px; font-weight: 600; color: var(--color-text-secondary); padding: 12px 0 8px; text-transform: uppercase; letter-spacing: 0.5px; }
.dep-row { background: var(--color-card); border-radius: 8px; margin-bottom: 4px; overflow: hidden; }
.dep-main { display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; cursor: pointer; user-select: none; }
.dep-main:active { background: #F9FAFB; }
.dep-left { display: flex; align-items: center; gap: 8px; }
.dep-time { font-size: 18px; font-weight: 700; font-variant-numeric: tabular-nums; }
.dep-station { font-size: 11px; color: #F59E0B; white-space: nowrap; }
.dep-shift-tag { font-size: 11px; color: #9CA3AF; white-space: nowrap; }
.dep-right { display: flex; align-items: center; gap: 6px; }
.tag-spec { font-size: 11px; padding: 1px 6px; border-radius: 4px; background: #FEF3C7; color: #92400E; }
.tag-dining { font-size: 11px; padding: 1px 6px; border-radius: 4px; background: #FDE68A; color: #7C2D12; }
.rotated { transform: rotate(180deg); transition: transform 0.2s; }
.empty { text-align: center; padding: 60px 20px; color: var(--color-text-secondary); }
</style>
