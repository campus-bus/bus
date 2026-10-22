<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useScheduleStore } from '@/stores/schedule'
import { usePreferenceStore } from '@/stores/preference'
import { getDateType, localDateStr, parseDateStr } from '@/utils/datetime'
import { getDateLabel } from '@/utils/holidays'
import { getNow } from '@/utils/time'
import { toGroup, groupMembers, findBestRide } from '@/utils/station_group'
import { routeColorOf, routeLabelOf } from '@/constants/routes'
import { useShare } from '@/utils/share'
import BusStopTimeline from '@/components/BusStopTimeline.vue'
import type { Departure, RouteName, DateType } from '@/types'
const scheduleStore = useScheduleStore()
const preferenceStore = usePreferenceStore()

useShare()

const activeTab = ref(0)

// ─── 站点列表（组化） ───
// 站点按组聚合显示：军体活动中心东/南 → 军体活动中心，二食堂/二食堂北 → 二食堂
// 排序沿用首页的点击频次（启动时冻结），常用站排在前面
const allStops = computed(() => {
  const names = new Set<string>()
  for (const rp of scheduleStore.routePatterns) {
    for (const s of rp.stops) names.add(toGroup(s.currentStop))
  }
  const order = preferenceStore.stopOrder
  return [...names].sort((a, b) => (order[b] || 0) - (order[a] || 0))
})

// ─── 行程规划 ───
const planDate = ref(localDateStr())
const planOrigin = ref('研究生宿舍楼')
const planDest = ref('高超楼')
const planDeadline = ref('20:00')
/** 用户是否手动改过日期 / 日期类型：跨零点刷新默认值时不能覆盖用户的主动选择 */
const userPickedDate = ref(false)
const userPickedDateType = ref(false)

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

// 顶部 tab、日期、起止站、到达期限任一变化，旧结果都已失效，清空避免误导
// （漏掉 planDeadline 会让「18:00 前到达」的标题下挂着 20:00 的旧结果）
function resetPlanResults() {
  planResults.value = []
  planShowAll.value = false
  planExpandedId.value = null
  searched.value = false
}
watch([activeTab, planDate, planOrigin, planDest, planDeadline], resetPlanResults)

// 用 parseDateStr 而非 `new Date(s + 'T00:00:00+08:00')`：后者是绝对时刻，
// 在境外时区会落到前一天，星期算错就会选错工作日/周末时刻表
const planDateType = computed<DateType>(() => getDateType(parseDateStr(planDate.value)))
const planDateLabel = computed(() => getDateLabel(parseDateStr(planDate.value)))

const routes: RouteName[] = ['环线1路', '接驳1路', '接驳2路']

function doSearch() {
  // 环线首尾同站：起终点选同一个站时，findBestRide 会把「回到起点」当成到达，
  // 输出「07:30 发车、07:43 回到研究生宿舍楼」这种绕一圈的无效行程。
  // 分组后比较，避免「军体活动中心」与「军体活动中心东」这类同组站漏判。
  if (toGroup(planOrigin.value) === toGroup(planDest.value)) {
    uni.showToast({ title: '出发站和到达站不能是同一个站', icon: 'none' })
    return
  }
  const [dh, dm] = planDeadline.value.split(':').map(Number)
  const deadlineMin = dh * 60 + dm
  const dt = planDateType.value
  const originMembers = groupMembers(planOrigin.value)
  const destMembers = groupMembers(planDest.value)
  const results: PlanResult[] = []

  for (const r of routes) {
    for (const dep of scheduleStore.getDepartures(dt, r)) {
      const best = findBestRide(scheduleStore.getPredictions(dep.recordId), originMembers, destMembers)
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
/** 行程规划结果卡片：展开显示完整站点时间线 */
const planExpandedId = ref<string | null>(null)
function togglePlanExpand(id: string) { planExpandedId.value = planExpandedId.value === id ? null : id }
/**
 * 「查询日期是不是今天」
 *
 * 必须依赖 todayTick：这是 tabBar 页，实例常驻不销毁，
 * 不显式依赖的话跨零点后会一直用创建时的日期做比较，历史日期被当成今天，
 * 从而错误地显示车辆运行进度。
 */
const todayTick = ref(0)
const todayStr = computed(() => { void todayTick.value; return localDateStr() })
const isPlanToday = computed(() => planDate.value === todayStr.value)

onShow(() => {
  todayTick.value++
  // 页面常驻：跨零点后把「没被用户手动改过」的默认值同步到新的一天
  if (!userPickedDate.value) planDate.value = localDateStr()
  if (!userPickedDateType.value) selectedDateType.value = getDateType(getNow())
})

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

/**
 * 切换线路：不改动日期类型过滤器
 *
 * 旧逻辑在切到环线1路时会把「周末/节假日」偷偷改成「工作日」——
 * 切换内容过滤器却暗改另一个过滤器，用户会以为自己看的是周末时刻表。
 * 现在只切线路，没有数据时由下方的提示条说明原因。
 */
function switchRoute(r: RouteName) {
  selectedRoute.value = r
}
function pickDateType(dt: DateType) {
  userPickedDateType.value = true
  selectedDateType.value = dt
}
function pickPlanDate(v: string) {
  userPickedDate.value = true
  planDate.value = v
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
        <picker class="picker" mode="date" :value="planDate" @change="(e: any) => pickPlanDate(e.detail.value)">
          <view class="input">
            <text class="input-text">{{ planDate }}</text>
            <text class="date-tag" :class="planDateType === 'weekday' ? 'wd' : 'we'">{{ planDateLabel }}</text>
          </view>
        </picker>
      </view>
      <view class="row">
        <text class="label">出发</text>
        <picker class="picker" :range="allStops" :value="allStops.indexOf(planOrigin)" @change="(e: any) => planOrigin = allStops[e.detail.value]">
          <view class="input">
            <text class="input-text">{{ planOrigin || '选择出发站' }}</text>
          </view>
        </picker>
      </view>
      <view class="row">
        <text class="label">到达</text>
        <picker class="picker" :range="allStops" :value="allStops.indexOf(planDest)" @change="(e: any) => planDest = allStops[e.detail.value]">
          <view class="input">
            <text class="input-text">{{ planDest || '选择到达站' }}</text>
          </view>
        </picker>
      </view>
      <view class="row">
        <text class="label">期限</text>
        <picker class="picker" mode="time" :value="planDeadline" @change="(e: any) => planDeadline = e.detail.value">
          <view class="input">
            <text class="input-text">{{ planDeadline }} 前到达</text>
          </view>
        </picker>
      </view>
      <view class="search-btn" @tap="doSearch">查询可乘线路</view>

      <view v-if="planResults.length > 0" class="results">
        <view class="result-title">找到 {{ planResults.length }} 趟车次（按到达时间从晚到早排列）</view>
        <view v-for="(r, i) in (planShowAll ? planResults : planResults.slice(0, 10))" :key="i" class="plan-card" :class="{ expanded: planExpandedId === r.departure.recordId }">
          <view class="plan-head" @tap="togglePlanExpand(r.departure.recordId)">
            <view class="route-badge" :style="{ background: routeColorOf(r.departure.routeKey) }">{{ routeLabelOf(r.departure) }}</view>
            <text class="plan-shift">{{ r.departure.shiftName }}</text>
            <text v-if="r.departure.isGaochaoDeparture" class="tag-dining">高超楼发车</text>
            <image class="chevron" :class="{ rotated: planExpandedId === r.departure.recordId }" src="/static/icons/ui/chevron-down.png" mode="aspectFit" />
          </view>
          <view class="plan-body">
            <view class="step"><view class="dot start"></view>
              <text><text class="time-strong">{{ r.boardTime }}</text> {{ r.isBoardDeparture ? '发车' : '上车' }} 「{{ r.boardStop }}」</text>
            </view>
            <view class="step-line"></view>
            <view class="step"><view class="dot end"></view>
              <text><text class="time-strong">{{ r.destTime }}</text> 到达 「{{ r.destStop }}」</text>
            </view>
          </view>
          <BusStopTimeline
            v-if="planExpandedId === r.departure.recordId"
            :departure-id="r.departure.recordId"
            :route-key="r.departure.routeKey"
            :highlight-stop="r.destStop"
            :highlight-origin="r.boardStop"
            :highlight-dest-seq="r.destSeq"
            :highlight-origin-seq="r.boardSeq"
            :show-progress="isPlanToday"
            :show-map-btn="false"
          />
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
          <view class="dt-btn" :class="{ active: selectedDateType === 'weekday' }" @tap="pickDateType('weekday')">工作日</view>
          <view class="dt-btn" :class="{ active: selectedDateType === 'weekend_holiday' }" @tap="pickDateType('weekend_holiday')">周末/节假日</view>
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
                <view class="route-badge" :style="{ background: routeColorOf(dep.routeKey) }">{{ routeLabelOf(dep) }}</view>
                <text class="dep-time">{{ dep.departureTime }}</text>
                <text v-if="dep.isGaochaoDeparture" class="tag-dining">高超楼发车</text>
                <text v-if="dep.shiftName" class="dep-shift">{{ dep.shiftName }}</text>
              </view>
              <image class="chevron" :class="{ rotated: expandedId === dep.recordId }" src="/static/icons/ui/chevron-down.png" mode="aspectFit" />
            </view>
            <BusStopTimeline v-if="expandedId === dep.recordId" :departure-id="dep.recordId" :route-key="dep.routeKey" :show-progress="false" :show-map-btn="false" />
          </view>
        </template>
        <!-- 按班次 -->
        <template v-else>
          <view v-for="[shift, deps] in grouped" :key="shift || 'all'">
            <view v-if="shift" class="shift-title">{{ shift }}</view>
            <view v-for="dep in deps" :key="dep.recordId" class="dep-row">
              <view class="dep-main" @tap="toggleExpand(dep.recordId)">
                <view class="dep-left">
                  <view class="route-badge" :style="{ background: routeColorOf(dep.routeKey) }">{{ routeLabelOf(dep) }}</view>
                  <text class="dep-time">{{ dep.departureTime }}</text>
                  <text v-if="dep.isGaochaoDeparture" class="tag-dining">高超楼发车</text>
                </view>
                <image class="chevron" :class="{ rotated: expandedId === dep.recordId }" src="/static/icons/ui/chevron-down.png" mode="aspectFit" />
              </view>
              <BusStopTimeline v-if="expandedId === dep.recordId" :departure-id="dep.recordId" :route-key="dep.routeKey" :show-progress="false" :show-map-btn="false" />
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
.top-tabs { display: flex; background: var(--color-card); }
.top-tab { flex: 1; text-align: center; padding: 24rpx 0; font-size: 28rpx; color: var(--color-text-secondary); border-bottom: 4rpx solid transparent; }
.top-tab.active { color: var(--color-primary); font-weight: 600; border-bottom-color: var(--color-primary); }

.planner { padding: 20rpx 24rpx; }
.row { display: flex; align-items: center; gap: 14rpx; margin-bottom: 14rpx; }
.label { width: 72rpx; font-size: 26rpx; color: var(--color-text-secondary); flex-shrink: 0; }
/* picker 撑满剩余宽度，四个输入框才能等宽通栏 */
.picker { flex: 1; min-width: 0; display: block; }
.input {
  display: flex; align-items: center; justify-content: space-between; gap: 12rpx;
  width: 100%; box-sizing: border-box;
  background: var(--color-card); border-radius: 12rpx; padding: 14rpx 20rpx; font-size: 28rpx;
}
.input-text { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.date-tag { font-size: 22rpx; padding: 4rpx 14rpx; border-radius: 999rpx; flex-shrink: 0; }
.date-tag.wd { background: var(--color-primary-soft); color: var(--color-primary); }
.date-tag.we { background: var(--color-warning-soft); color: var(--color-warning-text); }
.search-btn { background: var(--color-primary); color: #fff; text-align: center; padding: 18rpx; border-radius: 999rpx; font-size: 30rpx; margin: 20rpx 0; }

.result-title { font-size: 24rpx; color: var(--color-text-secondary); margin-bottom: 12rpx; }
.plan-card { background: var(--color-card); border-radius: 14rpx; margin-bottom: 12rpx; overflow: hidden; }
.plan-card.expanded { box-shadow: 0 4rpx 18rpx rgba(0, 0, 0, 0.08); }
/* 内边距下放到 head/body，展开时时间线可通栏铺满卡片底部 */
.plan-head { display: flex; align-items: center; gap: 12rpx; padding: 18rpx 22rpx 0; margin-bottom: 12rpx; }
.plan-shift { font-size: 24rpx; color: var(--color-text-secondary); flex: 1; }
.plan-body { padding: 0 22rpx 18rpx 30rpx; }
.step { display: flex; align-items: center; gap: 12rpx; font-size: 26rpx; padding: 4rpx 0; }
.dot { width: 14rpx; height: 14rpx; border-radius: 50%; flex-shrink: 0; }
.dot.start { background: var(--color-success); }
.dot.end { background: var(--color-primary); }
.step-line { width: 4rpx; height: 18rpx; background: var(--color-border); margin: 2rpx 5rpx; }
.time-strong { color: var(--color-primary); font-weight: 700; }

.route-tabs { display: flex; gap: 12rpx; padding: 16rpx 24rpx; }
.route-tab { flex: 1; text-align: center; padding: 12rpx 0; font-size: 26rpx; background: var(--color-card); border-radius: 10rpx; color: var(--color-text-secondary); border: 1rpx solid var(--color-border); }
.route-tab.active { background: var(--color-primary); color: #fff; border-color: var(--color-primary); }
.date-toggle { display: flex; justify-content: space-between; align-items: center; padding: 0 24rpx 16rpx; }
.dt-left { display: flex; gap: 12rpx; }
.dt-btn { padding: 8rpx 20rpx; font-size: 24rpx; border-radius: 999rpx; background: var(--color-card); color: var(--color-text-secondary); border: 1rpx solid var(--color-border); }
.dt-btn.active { background: var(--color-primary-soft); color: var(--color-primary); border-color: var(--color-primary); }
.sort-toggle { font-size: 24rpx; color: var(--color-text-secondary); padding: 8rpx 16rpx; border: 1rpx solid var(--color-border); border-radius: 999rpx; background: var(--color-card); }
.notice { margin: 0 24rpx 16rpx; padding: 16rpx; background: var(--color-warning-soft); color: var(--color-warning-text); border-radius: 10rpx; font-size: 24rpx; text-align: center; }

.dep-list { padding: 0 24rpx; }
.shift-title { font-size: 24rpx; font-weight: 600; color: var(--color-text-secondary); padding: 16rpx 0 8rpx; }
.dep-row { background: var(--color-card); border-radius: 12rpx; margin-bottom: 10rpx; overflow: hidden; }
.dep-main { display: flex; justify-content: space-between; align-items: center; padding: 18rpx 22rpx; }
.dep-left { display: flex; align-items: center; gap: 14rpx; }
.dep-time { font-size: 34rpx; font-weight: 700; font-variant-numeric: tabular-nums; }
.dep-shift { font-size: 22rpx; color: var(--color-text-tertiary); }
</style>
