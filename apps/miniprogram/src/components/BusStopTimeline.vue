<script setup lang="ts">
/**
 * 车次站点时间线（点击车次卡片后展开）
 *
 * 与 H5 版 BusStopTimeline 对齐：一条竖向轨道 + 沿轨道移动的公交图标，
 * 按顺序列出全部站点及预计到站时间，并支持上车站/目的地高亮。
 *
 * 小程序实现差异：
 * 1. 行高用固定 rpx，公交位置直接换算成 rpx 数值，不依赖 calc(%)，
 *    避免个别基础库对百分比嵌套计算的偏差；
 * 2. 组件只在卡片展开时挂载，1 秒刷新只影响当前展开的卡片，
 *    页面无需额外计时器；
 * 3. 环线首尾同站：首站显示「发」、末站显示「终」，与地图/首页的过滤规则保持一致。
 */
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useScheduleStore } from '@/stores/schedule'
import { getNow } from '@/utils/time'
import { getSecondsSinceMidnight } from '@/utils/datetime'

const props = withDefaults(defineProps<{
  departureId: string
  routeKey: string
  /** 目的地站名（蓝色高亮） */
  highlightStop?: string
  /** 上车站名（绿色高亮） */
  highlightOrigin?: string
  /** 同名站一圈多次出现时，用 stopSeq 精确指定高亮位置（1 起） */
  highlightDestSeq?: number
  highlightOriginSeq?: number
  /** 浏览任意时刻表时关掉，避免用"当前时间"误判车辆进度 */
  showProgress?: boolean
}>(), {
  highlightStop: '',
  highlightOrigin: '',
  highlightDestSeq: 0,
  highlightOriginSeq: 0,
  showProgress: true,
})

/** 行高（rpx），必须与样式 .tl-row 的 height 一致，公交位置按此换算 */
const ROW_H = 52
/** 轨道中心距行顶部偏移 */
const RAIL_OFFSET = ROW_H / 2

const scheduleStore = useScheduleStore()

const tick = ref(0)
let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => { timer = setInterval(() => { tick.value++ }, 1000) })
onUnmounted(() => { if (timer) { clearInterval(timer); timer = null } })

const ROUTE_COLORS: Record<string, string> = {
  HX1_NORMAL: '#2563EB', HX1_DINING: '#F59E0B',
  JB1_NORMAL: '#10B981', JB2_NORMAL: '#8B5CF6',
}
const routeColor = computed(() => ROUTE_COLORS[props.routeKey] || '#6B7280')

/** 该班次的全部到站预测，按 stopSeq 升序（第 1 站为发车站，末站为回程到站） */
const stops = computed(() =>
  scheduleStore.predictions
    .filter(p => p.departureId === props.departureId)
    .sort((a, b) => a.stopSeq - b.stopSeq)
)

const busIcon = computed(() => {
  if (props.routeKey === 'HX1_DINING') return '/static/icons/就餐专线.png'
  if (props.routeKey === 'JB1_NORMAL') return '/static/icons/接驳1路.png'
  if (props.routeKey === 'JB2_NORMAL') return '/static/icons/接驳2路.png'
  return '/static/icons/环线1路.png'
})

/**
 * 车辆运行进度：按「发车时刻 + 站间累计秒数」插值，与地图页算法一致。
 * idx 表示当前所处的起点站下标（在两站之间时为前站下标）。
 */
const progress = computed(() => {
  void tick.value // 建立响应式依赖，每秒重新计算
  const s = stops.value
  if (s.length < 2) return { idx: 0, frac: 0, phase: 'idle' as const }

  const nowSec = getSecondsSinceMidnight(getNow())
  const depSec = (s[0].departureMinutes ?? 0) * 60
  if (nowSec < depSec) return { idx: 0, frac: 0, phase: 'idle' as const }

  const totalSec = s[s.length - 1].cumulativeSeconds
  if (nowSec >= depSec + totalSec) return { idx: s.length - 1, frac: 0, phase: 'done' as const }

  const elapsed = nowSec - depSec
  for (let i = 1; i < s.length; i++) {
    const segStart = s[i - 1].cumulativeSeconds
    const segEnd = s[i].cumulativeSeconds
    if (elapsed <= segEnd) {
      const dur = segEnd - segStart
      const frac = dur > 0 ? (elapsed - segStart) / dur : 0
      return { idx: i - 1, frac: Math.max(0, Math.min(1, frac)), phase: 'running' as const }
    }
  }
  return { idx: s.length - 1, frac: 0, phase: 'done' as const }
})

/** 是否展示运行进度：仅当显式传 false 时隐藏（小程序端未传的 Boolean prop 可能为 undefined） */
const progressVisible = computed(() => props.showProgress !== false)

const isRunning = computed(() => progressVisible.value && progress.value.phase === 'running')

/** 公交图标纵向位置（rpx）：首站中心 + 已走过的行数 × 行高 */
const busTop = computed(() => RAIL_OFFSET + (progress.value.idx + progress.value.frac) * ROW_H)

/** 轨道填充比例：已走过的站数占总站间数的百分比 */
const railStyle = computed(() => {
  const s = stops.value
  const { idx, frac, phase } = progress.value
  let pct = 0
  if (phase === 'done') pct = 100
  else if (phase === 'running' && s.length > 1) pct = Math.round(((idx + frac) / (s.length - 1)) * 100)
  return {
    opacity: progressVisible.value ? 1 : 0,
    background: `linear-gradient(to bottom, ${routeColor.value} ${pct}%, #E5E7EB ${pct}%)`,
  }
})

/** 公交图标位置与显隐（不用 v-if，见模板注释） */
const busStyle = computed(() => ({
  top: busTop.value + 'rpx',
  opacity: isRunning.value ? 1 : 0,
}))

/** 顶部状态文案 */
const statusText = computed(() => {
  const s = stops.value
  if (s.length === 0) return '暂无站点数据'
  if (!progressVisible.value) return `共 ${s.length} 站`
  const { idx, phase } = progress.value
  if (phase === 'idle') return `尚未发车 · 共 ${s.length} 站`
  if (phase === 'done') return `已到达终点 · 共 ${s.length} 站`
  const next = s[Math.min(idx + 1, s.length - 1)]
  return `运行中 · 下一站「${next.stopName}」`
})

/** 站点是否已过（用于圆点着色） */
function isPassed(idx: number): boolean {
  if (!progressVisible.value) return false
  const { idx: cur, phase } = progress.value
  if (phase === 'done') return true
  if (phase === 'idle') return false
  return idx <= cur
}

/**
 * 目的地高亮：优先按精确 stopSeq；未指定时取该站名在本次行程中最后一次出现
 * （环线同名站会出现两次，取后一次才是真正下车点）
 */
function isDest(idx: number): boolean {
  const s = stops.value
  const stop = s[idx]
  if (!stop) return false
  if (props.highlightDestSeq) return stop.stopSeq === props.highlightDestSeq
  if (!props.highlightStop || stop.stopName !== props.highlightStop) return false
  let last = idx
  for (let i = idx + 1; i < s.length; i++) if (s[i].stopName === stop.stopName) last = i
  return idx === last
}

/** 上车站高亮：未指定 stopSeq 时取该站名第一次出现 */
function isOrigin(idx: number): boolean {
  const s = stops.value
  const stop = s[idx]
  if (!stop) return false
  if (props.highlightOriginSeq) return stop.stopSeq === props.highlightOriginSeq
  if (!props.highlightOrigin || stop.stopName !== props.highlightOrigin) return false
  let first = idx
  for (let i = idx - 1; i >= 0; i--) if (s[i].stopName === stop.stopName) first = i
  return idx === first
}
</script>

<template>
  <view class="tl-root">
    <view class="tl-head">
      <text class="tl-head-dot" :style="{ background: isRunning ? routeColor : '#CBD5E1' }"></text>
      <text class="tl-head-text">{{ statusText }}</text>
    </view>

    <view class="tl-list">
      <!-- 竖向轨道：已运行部分按线路颜色填充 -->
      <view class="tl-rail" :style="railStyle"></view>

      <!-- 公交图标骑在轨道上 -->
      <!-- 不用 v-if：小程序端 wx:if 对绝对定位节点偶发不刷新，改用透明度控制显隐 -->
      <view class="tl-bus" :style="busStyle">
        <image class="tl-bus-img" :src="busIcon" mode="aspectFit" />
      </view>

      <view
        v-for="(stop, idx) in stops" :key="stop.stopSeq"
        class="tl-row"
        :class="{ 'is-dest': isDest(idx), 'is-origin': isOrigin(idx) }"
      >
        <view class="tl-indicator">
          <view v-if="stop.isDepartureStop" class="tl-dot start">发</view>
          <view v-else-if="stop.isReturnStop && idx === stops.length - 1" class="tl-dot end">终</view>
          <view
            v-else class="tl-dot"
            :class="{ passed: isPassed(idx) }"
            :style="isPassed(idx) ? { background: routeColor } : {}"
          ></view>
        </view>
        <text class="tl-name">{{ stop.stopName }}</text>
        <text class="tl-time">{{ stop.arrivalTime.slice(0, 5) }}</text>
      </view>
    </view>
  </view>
</template>

<style scoped>
.tl-root { border-top: 1rpx solid #E5E7EB; background: #FAFBFC; padding: 14rpx 20rpx 8rpx; }

.tl-head { display: flex; align-items: center; gap: 8rpx; padding: 4rpx 4rpx 10rpx; }
.tl-head-dot { width: 12rpx; height: 12rpx; border-radius: 50%; flex-shrink: 0; }
.tl-head-text { font-size: 24rpx; color: #6B7280; }

.tl-list { position: relative; }

/* 轨道两端各留半个行高，正好连接首末站圆点中心 */
.tl-rail {
  position: absolute; left: 19rpx; top: 26rpx; bottom: 26rpx;
  width: 3rpx; border-radius: 2rpx; z-index: 1;
}

.tl-bus {
  position: absolute; left: 19rpx; z-index: 3;
  width: 40rpx; height: 40rpx;
  transform: translate(-50%, -50%);
  transition: top 0.5s linear, opacity 0.2s linear;
  pointer-events: none;
}
.tl-bus-img { width: 34rpx; height: 34rpx; display: block; filter: drop-shadow(0 2rpx 4rpx rgba(0, 0, 0, 0.25)); }

/* 行高必须与脚本中的 ROW_H 一致 */
.tl-row {
  display: flex; align-items: center; gap: 10rpx;
  height: 52rpx; font-size: 26rpx;
}
.tl-indicator {
  width: 40rpx; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  position: relative; z-index: 2;
}
.tl-dot { width: 14rpx; height: 14rpx; border-radius: 50%; background: #CBD5E1; }
.tl-dot.passed { box-shadow: 0 0 6rpx rgba(0, 0, 0, 0.12); }
.tl-dot.start, .tl-dot.end {
  width: 30rpx; height: 30rpx; font-size: 18rpx; color: #fff;
  display: flex; align-items: center; justify-content: center;
}
.tl-dot.start { background: #10B981; }
.tl-dot.end { background: #1A56DB; }

.tl-name { flex: 1; color: #1F2937; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.tl-time { font-size: 24rpx; color: #6B7280; font-variant-numeric: tabular-nums; flex-shrink: 0; }

/* 目的地（蓝）/ 上车站（绿）高亮 */
.tl-row.is-dest { background: linear-gradient(90deg, rgba(26, 86, 219, 0.08), transparent); border-radius: 8rpx; }
.tl-row.is-dest .tl-name { font-weight: 700; color: #1A56DB; }
.tl-row.is-dest .tl-time { font-weight: 700; color: #1A56DB; }

.tl-row.is-origin { background: linear-gradient(90deg, rgba(16, 185, 129, 0.08), transparent); border-radius: 8rpx; }
.tl-row.is-origin .tl-name { font-weight: 700; color: #10B981; }
.tl-row.is-origin .tl-time { font-weight: 700; color: #10B981; }
</style>
