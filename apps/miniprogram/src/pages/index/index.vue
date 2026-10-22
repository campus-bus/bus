<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import { onShow, onHide } from '@dcloudio/uni-app'
import { useScheduleStore } from '@/stores/schedule'
import { useLocationStore } from '@/stores/location'
import { usePreferenceStore } from '@/stores/preference'
import { useMapFocusStore } from '@/stores/map_focus'
import { useGeolocation } from '@/composables/useGeolocation'
import { useWeather } from '@/composables/useWeather'
import { getDateType, getSecondsSinceMidnight, formatDate } from '@/utils/datetime'
import { getDateLabel } from '@/utils/holidays'
import { getNow } from '@/utils/time'
import { findNearestStop, findNearestStops, formatWalkTime, WALK_SPEED_MPS } from '@/utils/geo'
import { arrivalCountdown, departureCountdown } from '@/utils/countdown'
import { toGroup, groupMembers, findBestRide } from '@/utils/station_group'
import { useShare } from '@/utils/share'
import ArrivalCard from '@/components/ArrivalCard.vue'
import BusStopTimeline from '@/components/BusStopTimeline.vue'
import type { Departure, DateType, RideInfo } from '@/types'

/** 步行速度（m/s）来自 utils/geo，地图页顶部距离提示用同一个值，避免两处口径不一致 */
const WALK_SPEED = WALK_SPEED_MPS
/** 附近站搜索半径（米）与最多展示站数 */
const NEARBY_RADIUS_M = 200
const NEARBY_LIMIT = 3
/**
 * 校园服务半径（米）
 *
 * 200m 内没有站时，旧逻辑会退到「全站最近的一个」且不设上限——
 * 人在外地打开首页，会看到「步行约 68 小时去赶车」这种建议。
 * 超出这个范围就不做乘车规划，只显示该站时刻（用户可能正在返校路上）。
 * 校园东西约 2km，取 3km 留出余量。
 */
const CAMPUS_SERVICE_RADIUS_M = 3000
/** 列表时间窗：已过站保留 5 分钟，最多看到 60 分钟后 */
const KEEP_PASSED_SEC = -300
const LOOKAHEAD_SEC = 3600

/**
 * 一条到站条目。
 *
 * 注意只存**分钟数**，不存算好的倒计时文案：
 * 文案每秒都变，列表结构却只随分钟变。把两者拆开，
 * 秒级刷新就只重算屏幕上的十几行文字，不必重建整张表（2038 条预测）。
 */
interface ArrivalItem {
  departure: Departure
  /** 直达场景：预计到站时间与分钟数 */
  arrivalTime?: string
  arrivalMinutes?: number
  /** 多起点场景：上车站、步行时间、上车时刻 */
  candidateStop?: string
  walkLabel?: string
  walkWarning?: boolean
  isOriginDeparture?: boolean
  boardTime?: string
  boardMinutes?: number
  boardSeq?: number
  /** 下车站与到达时刻 */
  destStop?: string
  destTime?: string
  destMinutes?: number
  destSeq?: number
  /**
   * 上车可行性档位（仅多起点场景使用，排序用，不显示）：
   * 0 = 走得到且车还没来；1 = 车还没来但走过去来不及；2 = 车已过站
   */
  boardTier?: number
}

const scheduleStore = useScheduleStore()
const locationStore = useLocationStore()
const preferenceStore = usePreferenceStore()
const mapFocus = useMapFocusStore()

useShare()

// ─── 定位（用户主动点击后才获取，不在加载时自动调用） ───
const {
  ready: locReady, loading: locLoading, error: locError, authorized: locAuthorized,
  init: initLocation, requestLocation, openSetting, openPrivacyContract,
  acquireWatch, releaseWatch,
} = useGeolocation()

// ─── 天气（腾讯位置服务，未配置 Key 时静默不展示） ───
const { weather, initWeather } = useWeather()

/** 是否已经拿到有效位置 */
const hasLocation = computed(() => locationStore.userLat !== null && locationStore.userLng !== null)
/**
 * 当前位置是否已经离开校园服务范围
 *
 * 用途：超出范围时不做「走过去赶这班车」的建议（详见 CAMPUS_SERVICE_RADIUS_M），
 * 但目的地时刻照常展示，用户仍能查车。
 */
const outOfCampus = computed(() => {
  if (locationStore.userLat === null || locationStore.userLng === null) return false
  const nearest = findNearestStop(locationStore.userLat, locationStore.userLng, scheduleStore.stations)
  return !!nearest && nearest.distance > CAMPUS_SERVICE_RADIUS_M
})
/**
 * 未定位功能区块的说明文案（讲清"点了能得到什么"）
 *
 * 只在「已授权但暂时拿不到坐标」时叠加错误原因；未授权时说明定位能带来什么。
 */
const locateDesc = computed(() => {
  if (locationStore.permissionDenied) return '位置权限已关闭，开启后即可显示离你最近的站和到站时间'
  if (locError.value) return locError.value
  return '定位后显示离你最近的站、步行距离和还有几分钟到站；位置仅在本机使用'
})
function onLocateTap() {
  if (locationStore.permissionDenied) openSetting()
  else requestLocation()
}

// ─── 秒级刷新 ───
const nowTick = ref(0)
/** 每秒变化：只供倒计时文案使用 */
const secondsNow = computed(() => { void nowTick.value; return getSecondsSinceMidnight(getNow()) })
/**
 * 每分钟变化：供列表结构使用。
 *
 * computed 只在值真正变化时才通知下游，所以依赖 minuteBaseSec 的列表
 * 每分钟才重建一次，倒计时仍逐秒刷新。
 */
const minuteBaseSec = computed(() => Math.floor(secondsNow.value / 60) * 60)

const dateType = computed<DateType>(() => { void nowTick.value; return getDateType(getNow()) })
const dateTypeLabel = computed(() => { void nowTick.value; return getDateLabel(getNow()) })
const todayDate = computed(() => { void nowTick.value; return formatDate(getNow()) })

let timer: ReturnType<typeof setInterval> | null = null
function startTimer() { if (!timer) timer = setInterval(() => { nowTick.value++ }, 1000) }
function stopTimer() { if (timer) { clearInterval(timer); timer = null } }
onShow(() => {
  startTimer()
  initLocation()
  // 附近站点与步行时间随走动实时变化：停留首页期间保持定位，离开即停
  acquireWatch('index')
  initWeather()
})
onHide(() => {
  stopTimer()
  releaseWatch('index')
})
onUnmounted(() => {
  stopTimer()
  releaseWatch('index')
})

/** 打开关于页（维护者工具入口也在这里） */
function goAbout() {
  uni.navigateTo({ url: '/pages/about/about' })
}

// ─── 站点选择（组化 + 频次排序） ───
const selectedStop = ref<string | null>(null)
const stopSearch = ref('')
const stopExpanded = ref(false)

/** 全部泛站点，按启动时冻结的点击频次排序 */
const sortedStops = computed(() => {
  const groups = new Set(scheduleStore.stations.map(s => toGroup(s.name)))
  const order = preferenceStore.stopOrder
  return [...groups].sort((a, b) => (order[b] || 0) - (order[a] || 0))
})
/** 频次最高的 3 个站点，展示「常去」标记（首次使用无点击记录时一个都不标） */
const freqTop3 = computed(() => {
  const order = preferenceStore.stopOrder
  return sortedStops.value.filter(s => (order[s] || 0) > 0).slice(0, 3)
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
  preferenceStore.recordStopClick(name)
  selectedStop.value = name
  stopSearch.value = ''
  showAllArrivals.value = false
}

// ─── 班次预测索引（departureId → 该班全部预测，已按 stopSeq 升序） ───
// 索引由 scheduleStore 统一维护（predictionsByDeparture），这里只负责按需取用
function predsOf(recordId: string) { return scheduleStore.getPredictions(recordId) }

// ─── 附近站到站（默认视图） ───
const nearbySections = computed(() => {
  if (selectedStop.value) return []
  if (locationStore.userLat === null || locationStore.userLng === null) return []
  const base = minuteBaseSec.value
  const candidates = findNearestStops(
    locationStore.userLat, locationStore.userLng,
    scheduleStore.stations, NEARBY_LIMIT, NEARBY_RADIUS_M,
  )
  const sections: Array<{ stopName: string; walkLabel: string; arrivals: ArrivalItem[] }> = []
  for (const c of candidates) {
    const walkSeconds = c.distance / WALK_SPEED
    const preds = scheduleStore.getPredictionsForStop(c.station.name, dateType.value)
    const arrivals: ArrivalItem[] = []
    for (const p of preds) {
      // 环线首尾同站的回程到站与「即将发车」重复，且用户不能在此上车
      if (p.isDepartureStop || p.isReturnStop) continue
      const dep = scheduleStore.departureById.get(p.departureId)
      if (!dep) continue
      const secondsUntil = Math.round(p.arrivalMinutes * 60 - base)
      if (secondsUntil < KEEP_PASSED_SEC || secondsUntil > LOOKAHEAD_SEC) continue
      arrivals.push({
        departure: dep,
        arrivalTime: p.arrivalTime,
        arrivalMinutes: p.arrivalMinutes,
        destSeq: p.stopSeq,
      })
    }
    if (arrivals.length > 0) {
      arrivals.sort((a, b) => (a.arrivalMinutes ?? 0) - (b.arrivalMinutes ?? 0))
      sections.push({ stopName: c.station.name, walkLabel: formatWalkTime(walkSeconds), arrivals })
    }
  }
  return sections
})

// ─── 目的地推荐（组 + 最优组合） ───
const destArrivals = computed<ArrivalItem[]>(() => {
  if (!selectedStop.value) return []
  const base = minuteBaseSec.value
  const destMembers = groupMembers(selectedStop.value)
  const results: ArrivalItem[] = []
  const hasGps = locationStore.userLat !== null && locationStore.userLng !== null

  if (hasGps && !outOfCampus.value) {
    const nearStops = findNearestStops(
      locationStore.userLat!, locationStore.userLng!,
      scheduleStore.stations, NEARBY_LIMIT, NEARBY_RADIUS_M,
    )

    // 目的地就在附近：只报该站的到站时间，不规划乘车
    if (nearStops.some(c => destMembers.includes(c.station.name))) {
      for (const dep of scheduleStore.departures) {
        if (dep.dateType !== dateType.value) continue
        for (const p of predsOf(dep.recordId)) {
          if (!destMembers.includes(p.stopName)) continue
          if (p.isDepartureStop || p.isReturnStop) continue
          const secondsUntil = Math.round(p.arrivalMinutes * 60 - base)
          if (secondsUntil < KEEP_PASSED_SEC || secondsUntil > LOOKAHEAD_SEC) continue
          results.push({
            departure: dep,
            arrivalTime: p.arrivalTime,
            arrivalMinutes: p.arrivalMinutes,
            destStop: p.stopName,
            destSeq: p.stopSeq,
          })
        }
      }
      results.sort((a, b) => (a.arrivalMinutes ?? 0) - (b.arrivalMinutes ?? 0))
      return results
    }

    // 多起点搜索：附近 3 个站各自枚举，同一班次保留「最能上车」的那个上车站。
    //
    // 不能按邻近顺序「先到先得、命中就 seen 掉同班次」：最近的站这班车可能刚过。
    // 实测 11:25 站在二食堂、去高超楼：S0008 到二食堂 11:24:37（已过 23 秒）、
    // 到二食堂北 11:32:12（还来得及）。旧逻辑先遍历二食堂就把它判给二食堂，
    // 二食堂北这个唯一能赶上的上车站反而被丢掉，用户看到的是「已过站」。
    let candidates = nearStops
    if (candidates.length === 0) {
      const fb = findNearestStop(locationStore.userLat!, locationStore.userLng!, scheduleStore.stations)
      if (fb) candidates = [fb]
    }
    /** 同一班次去同一目的地，到站时刻相同 → 只比「上不上得去」和「走多远」 */
    const bestByDep = new Map<string, { item: ArrivalItem; tier: number; walkSeconds: number }>()
    for (const c of candidates) {
      const candidateStop = c.station.name
      if (destMembers.includes(candidateStop)) continue
      const walkSeconds = c.distance / WALK_SPEED
      for (const dep of scheduleStore.departures) {
        if (dep.dateType !== dateType.value) continue
        const best = findBestRide(predsOf(dep.recordId), [candidateStop], destMembers)
        if (!best) continue
        const secBoard = Math.round(best.origin.arrivalMinutes * 60 - base)
        const secDest = Math.round(best.dest.arrivalMinutes * 60 - base)
        if (secDest > LOOKAHEAD_SEC || secBoard < KEEP_PASSED_SEC) continue
        const isOriginDeparture = best.origin.isDepartureStop ?? false
        // 档位：0 走得到且车还没来 / 1 车还没来但走过去来不及 / 2 车已过站
        const tier = secBoard <= 0 ? 2 : (walkSeconds > secBoard ? 1 : 0)
        const prev = bestByDep.get(dep.recordId)
        if (prev && (prev.tier < tier || (prev.tier === tier && prev.walkSeconds <= walkSeconds))) continue
        bestByDep.set(dep.recordId, {
          tier,
          walkSeconds,
          item: {
            departure: dep,
            candidateStop,
            walkLabel: formatWalkTime(walkSeconds),
            walkWarning: tier === 1,
            isOriginDeparture,
            boardTime: best.origin.arrivalTime,
            boardMinutes: best.origin.arrivalMinutes,
            boardSeq: best.origin.stopSeq,
            destStop: best.dest.stopName,
            destTime: best.dest.arrivalTime,
            destMinutes: best.dest.arrivalMinutes,
            destSeq: best.dest.stopSeq,
            boardTier: tier,
          },
        })
      }
    }
    results.push(...[...bestByDep.values()].map(x => x.item))
  } else {
    // 未定位，或定位显示已离开校园：只报目的地站的到站时间，不做「走过去赶车」规划
    for (const dep of scheduleStore.departures) {
      if (dep.dateType !== dateType.value) continue
      for (const p of predsOf(dep.recordId)) {
        if (!destMembers.includes(p.stopName)) continue
        if (p.isDepartureStop || p.isReturnStop) continue
        const secondsUntil = Math.round(p.arrivalMinutes * 60 - base)
        if (secondsUntil < KEEP_PASSED_SEC || secondsUntil > LOOKAHEAD_SEC) continue
        results.push({
          departure: dep,
          arrivalTime: p.arrivalTime,
          arrivalMinutes: p.arrivalMinutes,
          destStop: p.stopName,
          destSeq: p.stopSeq,
        })
      }
    }
  }
  // 先按「能不能上车」分档，同档内按到目的地时间
  results.sort((a, b) => {
    const ta = a.boardTier ?? 0
    const tb = b.boardTier ?? 0
    if (ta !== tb) return ta - tb
    return (a.destMinutes ?? a.arrivalMinutes ?? 0) - (b.destMinutes ?? b.arrivalMinutes ?? 0)
  })
  return results
})

// ─── 即将发车 ───
const departingSoon = computed(() => {
  const base = minuteBaseSec.value
  const list: Array<{ departure: Departure; departureMinutes: number }> = []
  for (const dep of scheduleStore.getDepartures(dateType.value)) {
    const secondsUntil = Math.round(dep.departureMinutes * 60 - base)
    if (secondsUntil < KEEP_PASSED_SEC || secondsUntil > LOOKAHEAD_SEC) continue
    list.push({ departure: dep, departureMinutes: dep.departureMinutes })
  }
  list.sort((a, b) => a.departureMinutes - b.departureMinutes)
  return list
})

/** 当天全天无车（2026-10-18 起周末/节假日时刻表尚未公布） */
const noServiceToday = computed(() => scheduleStore.getDepartures(dateType.value).length === 0)

// ─── 倒计时（逐秒派生，不改动列表结构） ───
function arrivalEta(item: { arrivalMinutes?: number }) {
  return arrivalCountdown(Math.round((item.arrivalMinutes ?? 0) * 60 - secondsNow.value))
}
function boardEta(item: { boardMinutes?: number; isOriginDeparture?: boolean }) {
  const seconds = Math.round((item.boardMinutes ?? 0) * 60 - secondsNow.value)
  return item.isOriginDeparture ? departureCountdown(seconds) : arrivalCountdown(seconds)
}
function departingEta(item: { departureMinutes: number }) {
  return departureCountdown(Math.round(item.departureMinutes * 60 - secondsNow.value))
}

/** 把多起点条目整理成卡片右侧要的四行信息；非多起点返回 null */
function rideOf(item: ArrivalItem): RideInfo | null {
  if (!item.candidateStop) return null
  const board = boardEta(item)
  return {
    walkLabel: item.walkLabel || '',
    candidateStop: item.candidateStop,
    walkWarning: item.walkWarning,
    boardTime: item.boardTime || '',
    isOriginDeparture: !!item.isOriginDeparture,
    boardLabel: board.label,
    boardStatus: board.status,
    destTime: item.destTime || '',
    destStop: item.destStop || '',
  }
}

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

// ─── 车次卡片展开（显示站点时间线与车辆进度） ───
// 用 Set 保存已展开卡片的 key，同一页可同时展开多趟车次互不干扰
const expandedCards = ref<Set<string>>(new Set())
function toggleCard(key: string) {
  const next = new Set(expandedCards.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  expandedCards.value = next
}

/**
 * 时间线里的「在地图上查看」：只显示这条线路，并把视角落到该车当前位置。
 * 地图是 tabBar 页，switchTab 不能带参数，先把目标车次存进 store，
 * 由地图页 onShow 取走。
 */
function onViewOnMap(departureId: string, routeKey: string) {
  mapFocus.requestFocus(departureId, routeKey)
  uni.switchTab({ url: '/pages/map/map' })
}

/** 附近站卡片的 key 需带站名与 stopSeq：同一班车在多个附近站点、或环线同一站两次经过都会出现 */
function nearbyCardKey(stopName: string, recordId: string, stopSeq: number) {
  return `nb-${stopName}-${recordId}-${stopSeq}`
}
function destCardKey(recordId: string) { return `dest-${recordId}` }
function departingCardKey(recordId: string) { return `dep-${recordId}` }
</script>

<template>
  <view class="home-page">
    <!-- 头部：日期 + 天气 + 日期类型 -->
    <view class="today-header">
      <view class="header-left">
        <view class="date-text">{{ todayDate }}</view>
        <view v-if="weather" class="weather-row">
          <text class="weather-icon">{{ weather.icon }}</text>
          <text class="weather-text">{{ weather.tempNow }}° {{ weather.desc }}</text>
        </view>
      </view>
      <view class="date-tag" :class="dateType === 'weekday' ? 'wd' : 'we'">{{ dateTypeLabel }}</view>
    </view>

    <!-- 全天无车：说清是「没收录」还是「确认停运」，不要把两者混为一谈 -->
    <view v-if="noServiceToday" class="notice-card">
      <text class="notice-title">今天暂无可查询的班车</text>
      <text class="notice-text">周末 / 节假日时刻表尚未收录，目前仅有工作日时刻表；如学校安排有车，请以现场通知为准。</text>
    </view>

    <!-- 附近站点：未定位时作为首屏功能区块展示。
         定位必须由用户点击触发（微信规范：不得进入页面即申请授权），点一次后永久静默。 -->
    <view v-if="locReady && !hasLocation && !locLoading" class="nearby-block">
      <view class="nearby-block-head">
        <text class="nearby-block-title">附近站点</text>
        <text class="nearby-block-tag">{{ locationStore.permissionDenied ? '定位未开启' : (locAuthorized ? '暂时无法定位' : '未定位') }}</text>
      </view>
      <text class="nearby-block-desc">{{ locateDesc }}</text>
      <view class="nearby-block-actions">
        <view class="nearby-block-btn" @tap="onLocateTap">
          <image class="nearby-block-btn-icon" src="/static/icons/ui/locate-white.png" mode="aspectFit" />
          <text>{{ locationStore.permissionDenied ? '去设置开启' : (locAuthorized ? '重新定位' : '定位我的位置') }}</text>
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
      >{{ stop }}<text v-if="freqTop3.includes(stop)" class="freq-badge">常去</text></view>
      <view v-if="!stopSearch" class="stop-chip more" @tap="stopExpanded = !stopExpanded">
        {{ stopExpanded ? '收起' : '更多' }}
      </view>
    </view>

    <!-- 附近站（默认视图） -->
    <template v-if="!selectedStop">
      <view v-for="section in nearbySections" :key="section.stopName" class="section">
        <view class="section-title">「{{ section.stopName }}」 {{ section.walkLabel }}</view>
        <view
          v-for="(item, idx) in section.arrivals" :key="item.departure.recordId + '-' + item.destSeq"
          v-show="idx < 5 || expandedSections.has(section.stopName)"
        >
          <ArrivalCard
            :departure="item.departure"
            :expanded="expandedCards.has(nearbyCardKey(section.stopName, item.departure.recordId, item.destSeq || 0))"
            :time="item.arrivalTime"
            :label="arrivalEta(item).label"
            :status="arrivalEta(item).status"
            @toggle="toggleCard(nearbyCardKey(section.stopName, item.departure.recordId, item.destSeq || 0))"
          >
            <template #detail>
              <BusStopTimeline
                :departure-id="item.departure.recordId"
                :route-key="item.departure.routeKey"
                :highlight-origin="section.stopName"
                :highlight-origin-seq="item.destSeq"
                @view-on-map="onViewOnMap"
              />
            </template>
          </ArrivalCard>
        </view>
        <view v-if="section.arrivals.length > 5" class="show-more" @tap="toggleSection(section.stopName)">
          <text>{{ expandedSections.has(section.stopName) ? '收起' : `展开更多 ${section.arrivals.length - 5} 趟车次` }}</text>
          <image
            class="chevron" :class="{ rotated: expandedSections.has(section.stopName) }"
            src="/static/icons/ui/chevron-down.png" mode="aspectFit"
          />
        </view>
      </view>

      <view v-if="outOfCampus" class="hint-card">
        <text>你当前不在校园附近，已隐藏步行赶车建议；下面是「{{ selectedStop }}」的到站时刻</text>
      </view>
      <view v-else-if="hasLocation && !noServiceToday && nearbySections.length === 0" class="hint-card">
        <text>当前时段附近暂无到站车次，可从上方列表手动选择站点</text>
      </view>
    </template>

    <!-- 目的地推荐 -->
    <view v-if="selectedStop" class="section">
      <view class="section-title">「{{ selectedStop }}」</view>
      <view v-if="destArrivals.length === 0" class="empty">当前时段暂无经过此站的车次</view>
      <view
        v-for="item in (showAllArrivals ? destArrivals : destArrivals.slice(0, 5))"
        :key="item.departure.recordId"
      >
          <ArrivalCard
            :departure="item.departure"
            :expanded="expandedCards.has(destCardKey(item.departure.recordId))"
            :time="item.arrivalTime"
            :label="arrivalEta(item).label"
            :status="arrivalEta(item).status"
            :ride="rideOf(item)"
            @toggle="toggleCard(destCardKey(item.departure.recordId))"
          >
            <template #detail>
            <BusStopTimeline
              :departure-id="item.departure.recordId"
              :route-key="item.departure.routeKey"
              :highlight-stop="item.destStop || selectedStop || ''"
              :highlight-origin="item.candidateStop || ''"
              :highlight-dest-seq="item.destSeq"
              :highlight-origin-seq="item.boardSeq"
              @view-on-map="onViewOnMap"
            />
          </template>
        </ArrivalCard>
      </view>
      <view v-if="destArrivals.length > 5" class="show-more" @tap="showAllArrivals = !showAllArrivals">
        <text>{{ showAllArrivals ? '收起' : `展开更多 ${destArrivals.length - 5} 趟车次` }}</text>
        <image
          class="chevron" :class="{ rotated: showAllArrivals }"
          src="/static/icons/ui/chevron-down.png" mode="aspectFit"
        />
      </view>
    </view>

    <!-- 即将发车 -->
    <view v-if="departingSoon.length > 0" class="section">
      <view class="section-title">即将发车</view>
      <view
        v-for="item in (showAllDeparting ? departingSoon : departingSoon.slice(0, 5))"
        :key="item.departure.recordId"
      >
        <ArrivalCard
          :departure="item.departure"
          :expanded="expandedCards.has(departingCardKey(item.departure.recordId))"
          :time="item.departure.departureTime"
          :label="departingEta(item).label"
          :status="departingEta(item).status"
          @toggle="toggleCard(departingCardKey(item.departure.recordId))"
        >
          <template #detail>
            <BusStopTimeline
              :departure-id="item.departure.recordId"
              :route-key="item.departure.routeKey"
              @view-on-map="onViewOnMap"
            />
          </template>
        </ArrivalCard>
      </view>
      <view v-if="departingSoon.length > 5" class="show-more" @tap="showAllDeparting = !showAllDeparting">
        <text>{{ showAllDeparting ? '收起' : `展开更多 ${departingSoon.length - 5} 趟车次` }}</text>
        <image
          class="chevron" :class="{ rotated: showAllDeparting }"
          src="/static/icons/ui/chevron-down.png" mode="aspectFit"
        />
      </view>
    </view>

    <!-- 页脚 -->
    <view class="footer-link" @tap="goAbout">关于本应用</view>
  </view>
</template>

<style scoped>
.home-page { padding: 24rpx; }
.today-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 20rpx; }
.header-left { display: flex; flex-direction: column; gap: 6rpx; }
.date-text { font-size: 32rpx; font-weight: 600; }
.weather-row { display: flex; align-items: center; gap: 8rpx; }
.weather-icon { font-size: 26rpx; }
.weather-text { font-size: 24rpx; color: var(--color-text-secondary); }
.date-tag { font-size: 24rpx; padding: 6rpx 18rpx; border-radius: 999rpx; }
.date-tag.wd { background: var(--color-primary-soft); color: var(--color-primary); }
.date-tag.we { background: var(--color-warning-soft); color: var(--color-warning-text); }

/* 全天无车提示 */
.notice-card {
  display: flex; flex-direction: column; gap: 6rpx;
  background: var(--color-warning-soft); border-radius: 16rpx; padding: 24rpx 28rpx; margin-bottom: 18rpx;
}
.notice-title { font-size: 28rpx; font-weight: 700; color: var(--color-warning-text); }
.notice-text { font-size: 24rpx; color: var(--color-warning-text); line-height: 1.6; }

/* 附近站点：未定位时的功能区块（不是权限提示，而是首屏内容的一部分） */
.nearby-block {
  background: var(--color-card); border-radius: 16rpx; padding: 26rpx 28rpx 24rpx; margin-bottom: 18rpx;
  border: 1rpx solid var(--color-border); box-shadow: 0 2rpx 10rpx rgba(17, 24, 39, 0.04);
}
.nearby-block-head { display: flex; align-items: center; justify-content: space-between; }
.nearby-block-title { font-size: 30rpx; font-weight: 700; color: var(--color-text); }
.nearby-block-tag {
  font-size: 20rpx; color: var(--color-text-secondary); background: var(--color-bg);
  padding: 4rpx 14rpx; border-radius: 999rpx;
}
.nearby-block-desc { display: block; font-size: 23rpx; color: var(--color-text-secondary); line-height: 1.6; margin-top: 10rpx; }
.nearby-block-actions { display: flex; align-items: center; justify-content: space-between; margin-top: 22rpx; }
.nearby-block-btn {
  display: flex; align-items: center; gap: 10rpx;
  background: var(--color-primary); color: #fff; font-size: 27rpx; font-weight: 600;
  padding: 16rpx 34rpx; border-radius: 999rpx;
}
.nearby-block-btn-icon { width: 30rpx; height: 30rpx; }
.locate-privacy { font-size: 22rpx; color: var(--color-primary); }

.hint-card { background: var(--color-bg); border-radius: 12rpx; padding: 24rpx; margin: 16rpx 0; font-size: 24rpx; color: var(--color-text-secondary); text-align: center; }

.search-box { margin-bottom: 16rpx; }
.search-input { background: var(--color-card); border-radius: 999rpx; padding: 14rpx 24rpx; font-size: 26rpx; }
.ph { color: var(--color-text-tertiary); }

.stop-grid { display: flex; flex-wrap: wrap; gap: 14rpx; margin-bottom: 8rpx; }
.stop-chip { padding: 8rpx 20rpx; background: var(--color-card); border-radius: 999rpx; font-size: 24rpx; border: 1rpx solid var(--color-border); color: var(--color-text); }
.stop-chip.active { background: var(--color-primary-soft); border-color: var(--color-primary); color: var(--color-primary); font-weight: 600; }
.stop-chip.more { background: var(--color-bg); color: var(--color-text-secondary); }
.freq-badge { margin-left: 8rpx; padding: 0 8rpx; border-radius: 6rpx; background: var(--color-warning-soft); color: var(--color-warning-text); font-size: 18rpx; }

.section { margin-top: 24rpx; }
.section-title { font-size: 30rpx; font-weight: 600; margin-bottom: 14rpx; }

.footer-link { text-align: center; font-size: 24rpx; color: var(--color-text-tertiary); padding: 24rpx 0 8rpx; }
</style>
