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
import { routeColorOf, busIconOf } from '@/constants/routes'

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
  /** 是否显示「在地图上查看」跳转按钮（行程页看时刻表时关掉） */
  showMapBtn?: boolean
}>(), {
  highlightStop: '',
  highlightOrigin: '',
  highlightDestSeq: 0,
  highlightOriginSeq: 0,
  showProgress: true,
  showMapBtn: true,
})

const emit = defineEmits<{
  'view-on-map': [departureId: string, routeKey: string]
}>()

/** 行高（rpx），必须与样式 .tl-row 的 height 一致，公交位置按此换算 */
const ROW_H = 52
/** 轨道中心距行顶部偏移 */
const RAIL_OFFSET = ROW_H / 2

const scheduleStore = useScheduleStore()

const tick = ref(0)
let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => { timer = setInterval(() => { tick.value++ }, 1000) })
onUnmounted(() => { if (timer) { clearInterval(timer); timer = null } })

const routeColor = computed(() => routeColorOf(props.routeKey))

/** 该班次的全部到站预测，按 stopSeq 升序（第 1 站为发车站，末站为回程到站） */
// 索引由 scheduleStore 维护并已排好序，这里不再 filter + sort 全表
const stops = computed(() => scheduleStore.getPredictions(props.departureId))

const busIcon = computed(() => busIconOf(props.routeKey))

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

/** 是否显示「在地图上查看」：同样按「未传即显示」处理 */
const mapBtnVisible = computed(() => props.showMapBtn !== false)

function handleViewOnMap() {
  emit('view-on-map', props.departureId, props.routeKey)
}

const isRunning = computed(() => progressVisible.value && progress.value.phase === 'running')

/** 首站「发」/末站「终」徽标直径（rpx），必须与 .tl-dot.start/.end 的 30rpx 一致 */
const BADGE_SIZE = 30
/** 徽标半径 */
const BADGE_R = BADGE_SIZE / 2
/** 普通站点小圆点半径（rpx），必须与 .tl-dot 的 14rpx 一致 */
const DOT_R = 7
/**
 * 轨道端头缩进量（rpx）。
 * 轨道只画到徽标/圆点内部这一点点，端头被不透明圆点压住，
 * 于是既不会在徽标外露出线头，也不会因为渲染取整而在边缘浮出半像素。
 */
const RAIL_INSET = 3

/** 首站端头：从「发」徽标内部起画 */
const startPadRpx = BADGE_R - RAIL_INSET

/**
 * 末站端头收尾半径（rpx）。
 * 末站是回程到站时画「终」徽标（半径 15），否则画普通小圆点（半径 7）。
 */
const endPadRpx = computed(() => {
  const s = stops.value
  const last = s[s.length - 1]
  const r = last && last.isReturnStop ? BADGE_R : DOT_R
  return Math.max(1, r - RAIL_INSET)
})

/** 轨道顶部位置（rpx）：首站「发」徽标内部 */
const railTopRpx = RAIL_OFFSET - startPadRpx

/** 轨道总高（rpx）：首站到末站的行距 + 两端各自缩进 */
const railHeightRpx = computed(() => {
  const n = stops.value.length
  return n < 2 ? 0 : (n - 1) * ROW_H + startPadRpx + endPadRpx.value
})

/**
 * 车辆沿轨道的比例（0~1）。
 * 填充渐变和车标位置都用这一个值换算，二者共用同一坐标系，
 * 因此任何机型/像素密度下都不会出现「图标脱离进度条头部」。
 */
const busRatio = computed(() => {
  if (railHeightRpx.value <= 0) return 0
  const k = progress.value.idx + progress.value.frac
  return Math.max(0, Math.min(1, (startPadRpx + k * ROW_H) / railHeightRpx.value))
})

/** 公交图标纵向位置（rpx）：由轨道比例反算，与填充头严格一致 */
const busTop = computed(() => railTopRpx + busRatio.value * railHeightRpx.value)

/** 轨道填充：显式给出 top/height，填充头与车标共用 busRatio */
const railStyle = computed(() => {
  const pct = (busRatio.value * 100).toFixed(2)
  return {
    top: railTopRpx + 'rpx',
    height: railHeightRpx.value + 'rpx',
    opacity: progressVisible.value ? 1 : 0,
    background: `linear-gradient(to bottom, ${routeColor.value} ${pct}%, var(--color-border) ${pct}%)`,
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
      <text class="tl-head-dot" :style="{ background: isRunning ? routeColor : 'var(--color-border)' }"></text>
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
        <text class="tl-time">{{ stop.arrivalTime }}</text>
      </view>
    </view>

    <!-- 跳转地图：只看这条线路，并把视角落到该车当前位置（与 H5 行为一致） -->
    <view v-if="mapBtnVisible" class="tl-map-btn" @tap.stop="handleViewOnMap">
      <image class="tl-map-icon" src="/static/tabbar/map-active.png" mode="aspectFit" />
      <text class="tl-map-text">在地图上查看</text>
    </view>
  </view>
</template>

<style scoped>
.tl-root { border-top: 1rpx solid var(--color-border); background: var(--color-bg-hover); padding: 14rpx 20rpx 8rpx; }

.tl-head { display: flex; align-items: center; gap: 8rpx; padding: 4rpx 4rpx 10rpx; }
.tl-head-dot { width: 12rpx; height: 12rpx; border-radius: 50%; flex-shrink: 0; }
.tl-head-text { font-size: 24rpx; color: var(--color-text-secondary); }

.tl-list { position: relative; }

/* 轨道：与站点圆点同一条中轴（left 20rpx = 指示器 40rpx 宽的中心） */
.tl-rail {
  position: absolute; left: 20rpx;
  width: 3rpx; border-radius: 2rpx; z-index: 1;
  transform: translateX(-50%);
}

.tl-bus {
  position: absolute; left: 20rpx; z-index: 3;
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
.tl-dot { width: 14rpx; height: 14rpx; border-radius: 50%; background: var(--color-border); }
.tl-dot.passed { box-shadow: 0 0 6rpx rgba(0, 0, 0, 0.12); }
.tl-dot.start, .tl-dot.end {
  width: 30rpx; height: 30rpx; font-size: 18rpx; color: #fff;
  display: flex; align-items: center; justify-content: center;
}
.tl-dot.start { background: var(--color-success); }
.tl-dot.end { background: var(--color-primary); }

.tl-name { flex: 1; min-width: 0; color: var(--color-text); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
/* 时间精确到秒，用 margin-left:auto 保证贴右不被站名推挤 */
.tl-time { margin-left: auto; font-size: 24rpx; color: var(--color-text-secondary); font-variant-numeric: tabular-nums; flex-shrink: 0; }

/* 目的地（蓝）/ 上车站（绿）高亮 */
.tl-row.is-dest { background: linear-gradient(90deg, rgba(26, 86, 219, 0.08), transparent); border-radius: 8rpx; }
.tl-row.is-dest .tl-name { font-weight: 700; color: var(--color-primary); }
.tl-row.is-dest .tl-time { font-weight: 700; color: var(--color-primary); }

.tl-row.is-origin { background: linear-gradient(90deg, rgba(16, 185, 129, 0.08), transparent); border-radius: 8rpx; }
.tl-row.is-origin .tl-name { font-weight: 700; color: var(--color-success); }
.tl-row.is-origin .tl-time { font-weight: 700; color: var(--color-success); }

/* 「在地图上查看」：浅底分隔条 + 蓝色文字，点击整行生效 */
.tl-map-btn {
  display: flex; align-items: center; justify-content: center; gap: 8rpx;
  margin: 10rpx -20rpx -8rpx;
  padding: 18rpx 0;
  border-top: 1rpx solid var(--color-border);
  background: var(--color-card);
}
.tl-map-btn:active { background: var(--color-bg); }
.tl-map-icon { width: 26rpx; height: 26rpx; }
.tl-map-text { font-size: 25rpx; color: var(--color-primary); font-weight: 600; }
</style>
