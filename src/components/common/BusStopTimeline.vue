<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useScheduleStore } from '@/stores/schedule'
import { getNow } from '@/utils/time'
import { getSecondsSinceMidnight } from '@/utils/datetime'
import type { ArrivalPrediction } from '@/types'

const props = withDefaults(defineProps<{
  departureId: string
  routeKey: string
  showMapBtn?: boolean
  highlightStop?: string
  highlightOrigin?: string
}>(), {
  showMapBtn: true,
})

const emit = defineEmits<{
  'view-on-map': [departureId: string, routeKey: string]
}>()

const scheduleStore = useScheduleStore()

const tick = ref(0)
let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => { timer = setInterval(() => { tick.value++ }, 1000) })
onUnmounted(() => { if (timer) clearInterval(timer) })

const ROUTE_COLORS: Record<string, string> = {
  HX1_NORMAL: '#2563EB', HX1_DINING: '#F59E0B',
  JB1_NORMAL: '#10B981', JB2_NORMAL: '#8B5CF6',
}
const routeColor = computed(() => ROUTE_COLORS[props.routeKey] || '#6B7280')

const stops = computed<ArrivalPrediction[]>(() =>
  scheduleStore.predictions
    .filter((p) => p.departureId === props.departureId)
    .sort((a, b) => a.stopSeq - b.stopSeq)
)

// 当前时间进度 — 基于秒数，NON-uniform speed per segment
const busProgress = computed(() => {
  void tick.value
  const s = stops.value
  if (s.length < 2) return { currentIdx: -1, fraction: 0, isBeforeStart: true, isAfterEnd: false }
  const nowSec = getSecondsSinceMidnight(getNow())
  const depMin = s[0]?.departureMinutes ?? 0
  if (nowSec < depMin) return { currentIdx: -1, fraction: 0, isBeforeStart: true, isAfterEnd: false }
  const last = s[s.length - 1]
  if (nowSec >= last.cumulativeSeconds + depMin * 60)
    return { currentIdx: s.length - 1, fraction: 0, isBeforeStart: false, isAfterEnd: true }
  for (let i = 1; i < s.length; i++) {
    const segStart = s[i - 1].cumulativeSeconds
    const segEnd = s[i].cumulativeSeconds
    if (nowSec <= depMin * 60 + segEnd) {
      const dur = segEnd - segStart
      const frac = dur > 0 ? (nowSec - depMin * 60 - segStart) / dur : 0
      return { currentIdx: i - 1, fraction: Math.max(0, Math.min(1, frac)), isBeforeStart: false, isAfterEnd: false }
    }
  }
  return { currentIdx: s.length - 1, fraction: 0, isBeforeStart: false, isAfterEnd: true }
})

const showBus = computed(() => !busProgress.value.isBeforeStart && !busProgress.value.isAfterEnd)

// 公交位置：等间距布局，但 fraction 基于时间 → 不同段移动速度不同
const busTopStyle = computed(() => {
  const { currentIdx, fraction, isBeforeStart, isAfterEnd } = busProgress.value
  const total = stops.value.length
  if (total <= 1 || isBeforeStart || isAfterEnd) return '0px'
  const frac = (currentIdx + fraction) / (total - 1)
  return `calc(${frac * 100}% - ${frac * 22}px + 11px)`
})

// 进度条渐变
const progressFraction = computed(() => {
  const { currentIdx, fraction, isBeforeStart, isAfterEnd } = busProgress.value
  const total = stops.value.length
  if (total <= 1 || isBeforeStart) return 0
  if (isAfterEnd) return 1
  return (currentIdx + fraction) / (total - 1)
})

const railStyle = computed(() => {
  const pct = Math.round(progressFraction.value * 100)
  return { background: `linear-gradient(to bottom, ${routeColor.value} ${pct}%, #E5E7EB ${pct}%)` }
})

const iconFile = computed(() => {
  if (props.routeKey === 'HX1_DINING') return 'icons/就餐专线.png'
  if (props.routeKey.includes('JB1')) return 'icons/环线2路.png'
  if (props.routeKey.includes('JB2')) return 'icons/环线3路.png'
  return 'icons/环线1路.png'
})

const BASE_URL = import.meta.env.BASE_URL

function handleViewOnMap() {
  emit('view-on-map', props.departureId, props.routeKey)
}

// 判断是否应高亮：终点只高亮最后一次出现；起点高亮第一次出现
function isDestHighlighted(stopName: string, idx: number): boolean {
  if (!props.highlightStop || stopName !== props.highlightStop) return false
  const s = stops.value
  let lastIdx = idx
  for (let i = idx + 1; i < s.length; i++) {
    if (s[i].stopName === stopName) lastIdx = i
  }
  return idx === lastIdx
}
function isOriginHighlighted(stopName: string, idx: number): boolean {
  if (!props.highlightOrigin || stopName !== props.highlightOrigin) return false
  const s = stops.value
  let firstIdx = idx
  for (let i = idx - 1; i >= 0; i--) {
    if (s[i].stopName === stopName) firstIdx = i
  }
  return idx === firstIdx
}
</script>

<template>
  <div class="timeline-root">
    <div class="stop-list">
      <!-- 单条连续进度条 -->
      <div class="progress-rail" :style="railStyle"></div>
      <!-- 公交车骑在进度条前端 -->
      <div v-if="showBus" class="bus-on-line" :style="{ top: busTopStyle }">
        <img :src="`${BASE_URL}${iconFile}`" width="20" height="20"
          style="display:block;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.3))" />
      </div>

      <div v-for="(stop, idx) in stops" :key="idx" class="stop-row"
        :class="{
          'is-dest': isDestHighlighted(stop.stopName, idx),
          'is-origin': isOriginHighlighted(stop.stopName, idx),
        }">
        <div class="stop-indicator">
          <div v-if="stop.isDepartureStop" class="dot start">发</div>
          <div v-else-if="stop.isReturnStop && idx === stops.length - 1" class="dot end">终</div>
          <div v-else class="dot normal"
            :class="{ passed: idx <= busProgress.currentIdx && !busProgress.isBeforeStart }"
            :style="(idx <= busProgress.currentIdx && !busProgress.isBeforeStart) ? { background: routeColor } : {}"
          ></div>
        </div>
        <span class="stop-name">{{ stop.stopName }}</span>
        <span class="stop-time" :class="{
          'is-dest-time': isDestHighlighted(stop.stopName, idx),
          'is-origin-time': isOriginHighlighted(stop.stopName, idx),
        }">{{ stop.arrivalTime }}</span>
      </div>
    </div>

    <div v-if="showMapBtn !== false" class="timeline-footer" @click.stop="handleViewOnMap">
      <span>在地图上查看</span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z"/><path d="M8 2v16M16 6v16"/>
      </svg>
    </div>
  </div>
</template>

<style scoped>
.timeline-root {
  position: relative; padding: 4px 14px 0 26px;
  border-top: 1px solid var(--color-border); background: #FAFBFC;
}
.bus-on-line {
  position: absolute; left: 9px; z-index: 3;
  transform: translate(-50%, -50%);
  transition: top 0.5s linear; pointer-events: none;
}
.stop-list { position: relative; }
.stop-row {
  display: flex; align-items: center; gap: 10px;
  padding: 3px 0; font-size: 13px; line-height: 20px;
}
.stop-indicator {
  width: 18px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  position: relative; z-index: 2;
}
.dot {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; transition: background 0.4s;
}
.dot.normal { background: #CBD5E1; }
.dot.normal.passed { box-shadow: 0 0 4px rgba(0,0,0,0.15); }
.dot.start {
  background: var(--color-hx2); width: 16px; height: 16px;
  font-size: 10px; color: #fff; display: flex; align-items: center; justify-content: center;
}
.dot.end {
  background: var(--color-hx1); width: 16px; height: 16px;
  font-size: 10px; color: #fff; display: flex; align-items: center; justify-content: center;
}
.progress-rail {
  position: absolute; left: 8px; top: 11px; bottom: 11px;
  width: 2px; z-index: 1; border-radius: 1px;
}

.stop-name { flex: 1; color: var(--color-text); }
.stop-time {
  font-variant-numeric: tabular-nums; color: var(--color-text-secondary); font-size: 12px;
}

/* 目的地站点高亮 */
.stop-row.is-dest {
  background: linear-gradient(90deg, rgba(26,86,219,0.08) 0%, transparent 100%);
  border-radius: 6px;
  margin: 2px -8px;
  padding: 2px 8px;
}
.stop-row.is-dest .stop-name {
  font-weight: 700;
  color: var(--color-primary);
}
.is-dest-time {
  font-weight: 700;
  color: var(--color-primary) !important;
  font-size: 13px !important;
}

/* 起点高亮（绿色） */
.stop-row.is-origin {
  background: linear-gradient(90deg, rgba(16,185,129,0.08) 0%, transparent 100%);
  border-radius: 6px;
  margin: 2px -8px;
  padding: 2px 8px;
}
.stop-row.is-origin .stop-name {
  font-weight: 700;
  color: #10B981;
}
.is-origin-time {
  font-weight: 700;
  color: #10B981 !important;
  font-size: 13px !important;
}

.timeline-footer {
  display: flex; align-items: center; justify-content: center;
  gap: 6px; padding: 8px 0 10px; margin-top: 4px;
  font-size: 12px; color: var(--color-primary); cursor: pointer; user-select: none;
  border-top: 1px dashed #E5E7EB;
}
.timeline-footer:active { opacity: 0.7; }
</style>
