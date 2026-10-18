<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useAutoRecordStore } from '@/stores/autoRecord'
import { useMapStore } from '@/stores/map'
import { useScheduleStore } from '@/stores/schedule'
import { useUploadStore } from '@/stores/upload'
import { useAutoRecord } from '@/composables/useAutoRecord'
import { haversineDistance } from '@/utils/geo'
import RouteBadge from '@/components/common/RouteBadge.vue'
import { showConfirmDialog } from 'vant'

const autoStore = useAutoRecordStore()
const mapStore = useMapStore()
const scheduleStore = useScheduleStore()
const uploadStore = useUploadStore()
const { startRecording, resumeRecording, stopRecording, cancelRecording } = useAutoRecord()

const ROUTE_TO_KEY: Record<string, string> = {
  '环线1路': 'HX1_NORMAL', '接驳1路': 'JB1_NORMAL',
  '接驳2路': 'JB2_NORMAL', '就餐专线': 'HX1_DINING',
}

const selectedRoute = ref('环线1路')
const routeOptions = ['环线1路', '接驳1路', '接驳2路', '就餐专线']

// 手动选择上车站
const manualBoard = ref('')
const showStopPicker = ref(false)

// 当前路线可选站点
const pickerStops = computed(() => {
  const rk = ROUTE_TO_KEY[selectedRoute.value] || ''
  const list = scheduleStore.routeStops[rk]
  return list ? list.slice(0, -1).map(s => s.name) : []
})

// 根据GPS检测最近站
const detectedStop = computed(() => {
  if (mapStore.userLat === null || mapStore.userLng === null) return ''
  const rk = ROUTE_TO_KEY[selectedRoute.value] || ''
  const list = scheduleStore.routeStops[rk]
  if (!list) return ''
  let best = ''; let bestD = Infinity
  for (let i = 0; i < list.length - 1; i++) {
    const d = haversineDistance(mapStore.userLat, mapStore.userLng, list[i].lat, list[i].lng)
    if (d < bestD) { bestD = d; best = list[i].name }
  }
  return bestD < 100 ? best : ''
})

// 自动预填检测到的站
watch(detectedStop, (name) => {
  if (name && !manualBoard.value) {
    manualBoard.value = name
  }
})
watch(selectedRoute, () => {
  manualBoard.value = detectedStop.value || ''
})

const hasGps = computed(() => mapStore.userLat !== null)

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  if (min === 0) return `${sec}秒`
  return `${min}分${sec}秒`
}

function handleStart() {
  if (!hasGps.value) return
  startRecording(selectedRoute.value, manualBoard.value || undefined)
}

async function handleStop() {
  try { await showConfirmDialog({ title: '结束记录', message: '确认要结束本次自动记录吗？' }) } catch { return }
  stopRecording()
}

async function handleCancel() {
  if (autoStore.sessionState === 'active') {
    try { await showConfirmDialog({ title: '取消记录', message: '确认取消？已记录的数据将不会保存。' }) } catch { return }
  }
  cancelRecording()
}

function handleReset() {
  autoStore.reset()
}

// 离开路线倒计时进度
const leaveCountdown = computed(() => {
  const leaveSince = autoStore.leaveOutOfRangeSince
  if (leaveSince === null) return 0
  const elapsed = (Date.now() - leaveSince) / 1000
  return Math.min(100, Math.round((elapsed / 10) * 100))
})
const leavingSoon = computed(() => autoStore.leaveOutOfRangeSince !== null)

// Paused 状态记录
const wasPausedByVisibility = ref(false)
function handleVisibilityPause() {
  wasPausedByVisibility.value = true
}

// 监听是否因 visibility 触发暂停（在 composable 中处理）
onMounted(() => {
  const origHandler = () => {
    if (document.hidden && autoStore.sessionState === 'active') {
      wasPausedByVisibility.value = true
    }
  }
  document.addEventListener('visibilitychange', origHandler)
  onUnmounted(() => document.removeEventListener('visibilitychange', origHandler))
})
</script>

<template>
  <div class="auto-panel">
    <!-- ====== Idle ====== -->
    <template v-if="autoStore.sessionState === 'idle'">
      <div class="field-row">
        <span class="label">线路</span>
        <van-radio-group v-model="selectedRoute" direction="horizontal">
          <van-radio v-for="r in routeOptions" :key="r" :name="r">
            {{ r.replace('环线1路','环1').replace('接驳1路','接1').replace('接驳2路','接2').replace('就餐专线','就餐') }}
          </van-radio>
        </van-radio-group>
      </div>

      <div v-if="!hasGps" class="gps-warn">
        <van-icon name="warning-o" />
        <span>请开启GPS定位后开始自动记录</span>
      </div>

      <!-- 上车站点检测/选择 -->
      <div class="field-row" v-if="hasGps && pickerStops.length > 0">
        <span class="label">上车</span>
        <span class="board-select" @click="showStopPicker = !showStopPicker">
          {{ manualBoard || detectedStop || '选择站点' }}
          <van-icon :name="showStopPicker ? 'arrow-up' : 'arrow-down'" size="12" />
        </span>
        <span v-if="detectedStop && manualBoard === detectedStop" class="auto-detect">自动</span>
      </div>

      <!-- 内嵌站点列表 -->
      <div v-if="showStopPicker" class="stop-list-inline">
        <div
          v-for="s in pickerStops"
          :key="s"
          class="stop-list-item"
          :class="{ active: s === (manualBoard || detectedStop) }"
          @click="manualBoard = s; showStopPicker = false"
        >{{ s }}</div>
      </div>

      <van-button
        type="primary"
        size="large"
        round
        block
        :disabled="!hasGps"
        @click="handleStart"
        style="margin-top:16px"
      >开始自动记录</van-button>

      <div class="auto-hint">
        <p>自动记录将：</p>
        <ul>
          <li>通过GPS自动检测到站并记录站点间耗时</li>
          <li>下车后自动提交数据</li>
          <li>记录期间请保持应用在前台</li>
        </ul>
      </div>
    </template>

    <!-- ====== Active ====== -->
    <template v-if="autoStore.sessionState === 'active'">
      <!-- 顶部信息栏 -->
      <div class="recording-header">
        <div class="recording-route">
          <RouteBadge :route="autoStore.selectedRoute" :dining="autoStore.routeKey === 'HX1_DINING'" />
          <span class="recording-label">自动记录中</span>
          <span class="recording-dot" />
        </div>
        <div class="recording-time">{{ formatTime(autoStore.totalElapsedMs) }}</div>
      </div>

      <!-- 上车站提示 -->
      <div class="board-info" v-if="autoStore.boardStopName">
        已从「{{ autoStore.boardStopName }}」上车
        <span v-if="autoStore.nearestStopName" class="nearest-hint"> · 当前靠近「{{ autoStore.nearestStopName }}」</span>
      </div>

      <!-- 站点进度 -->
      <div class="stop-timeline" v-if="autoStore.stopsDisplay.length > 0">
        <div
          v-for="(stop, idx) in autoStore.stopsDisplay"
          :key="idx"
          class="stop-row"
          :class="{
            'is-boarding': stop.status === 'boarding',
            'is-passed': stop.status === 'passed',
            'is-current': stop.status === 'current',
          }"
        >
          <div class="stop-indicator">
            <div v-if="stop.status === 'boarding'" class="dot boarding">上</div>
            <div v-else-if="stop.status === 'passed'" class="dot passed">✓</div>
            <div v-else-if="stop.status === 'current'" class="dot current" />
            <div v-else class="dot normal" />
          </div>
          <span class="stop-name">{{ stop.name }}</span>
          <span v-if="stop.elapsedSec != null" class="stop-secs">{{ stop.elapsedSec }}秒</span>
          <span v-else-if="stop.status === 'current'" class="stop-secs live">{{ formatTime(autoStore.currentSegmentElapsedMs) }}</span>
        </div>
      </div>

      <!-- 离开路线检测倒计时 -->
      <div v-if="leavingSoon && autoStore.sessionState === 'active'" class="leave-warn">
        <van-icon name="warning-o" />
        <span>检测到已离开路线，{{ 10 - Math.ceil((Date.now() - (autoStore.leaveOutOfRangeSince || Date.now())) / 1000) }}秒后自动结束</span>
      </div>

      <!-- 底部按钮 -->
      <div v-if="autoStore.sessionState === 'active'" class="bottom-actions">
        <van-button type="danger" round block @click="handleStop">我已下车</van-button>
        <van-button type="default" round block @click="handleCancel" style="margin-top:8px">取消记录</van-button>
      </div>
    </template>

    <!-- ====== Completed ====== -->
    <template v-if="autoStore.sessionState === 'completed'">
      <div class="completed-box">
        <van-icon v-if="autoStore.submitOk" name="success" size="48" color="#10B981" />
        <van-icon v-else name="fail" size="48" color="#DC2626" />
        <p class="completed-title">{{ autoStore.submitOk ? '记录已提交' : '提交失败' }}</p>
        <p v-if="autoStore.error" class="completed-error">{{ autoStore.error }}</p>

        <div v-if="autoStore.segments.length > 0" class="completed-segs">
          <div v-for="(seg, i) in autoStore.segments" :key="i" class="cseg">
            {{ seg.from }} → {{ seg.seconds }}秒 → {{ seg.to }}
          </div>
        </div>

        <van-button type="primary" round block @click="handleReset" style="margin-top:16px">再来一次</van-button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.auto-panel { padding: 16px; }
.field-row { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; font-size: 14px; flex-wrap: wrap; }
.label { color: var(--color-text-secondary); white-space: nowrap; }
.gps-warn { display: flex; align-items: center; gap: 6px; padding: 10px 14px; background: #FEF3C7; border-radius: 8px; font-size: 13px; color: #92400E; }
.auto-hint { margin-top: 16px; padding: 12px; background: #F9FAFB; border-radius: 8px; font-size: 12px; color: var(--color-text-secondary); }
.auto-hint ul { margin: 4px 0 0 16px; padding: 0; }
.auto-hint li { margin-bottom: 2px; }

/* recording header */
.recording-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; }
.recording-route { display: flex; align-items: center; gap: 8px; }
.recording-label { font-size: 13px; color: var(--color-text-secondary); }
.recording-dot { width: 8px; height: 8px; border-radius: 50%; background: #DC2626; animation: pulse 1.5s ease-in-out infinite; }
.recording-time { font-size: 18px; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--color-primary); }
.board-info { font-size: 12px; color: #10B981; padding: 4px 0 10px; }
.nearest-hint { color: #8B5CF6; }
.auto-detect { font-size: 11px; color: #10B981; white-space: nowrap; }
.board-select { padding: 4px 10px; background: var(--color-card); border: 1px solid var(--color-border); border-radius: 6px; font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 4px; }
.stop-list-inline { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px 0; }
.stop-list-item { padding: 4px 10px; background: #F3F4F6; border-radius: 14px; font-size: 12px; cursor: pointer; border: 1px solid transparent; }
.stop-list-item:active { background: #E5E7EB; }
.stop-list-item.active { background: #EFF6FF; border-color: var(--color-primary); color: var(--color-primary); font-weight: 600; }

/* stop timeline */
.stop-timeline { position: relative; }
.stop-row { display: flex; align-items: center; gap: 10px; padding: 6px 0; font-size: 13px; }
.stop-indicator { width: 20px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
.dot { width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px; flex-shrink: 0; }
.dot.normal { background: #E5E7EB; width: 8px; height: 8px; }
.dot.boarding { background: var(--color-primary); color: #fff; }
.dot.passed { background: #10B981; color: #fff; }
.dot.current { background: #F59E0B; width: 10px; height: 10px; animation: pulse 1s ease-in-out infinite; }
.stop-name { flex: 1; }
.stop-secs { font-size: 12px; color: #10B981; font-weight: 600; }
.stop-secs.live { color: #F59E0B; }

/* leave warning */
.leave-warn { display: flex; align-items: center; gap: 6px; padding: 10px 14px; background: #FEF3C7; border-radius: 8px; font-size: 12px; color: #92400E; margin-top: 12px; }

/* bottom actions */
.bottom-actions { margin-top: 20px; }

/* completed */
.completed-box { text-align: center; padding: 24px 16px; }
.completed-title { font-size: 16px; font-weight: 600; margin: 8px 0; }
.completed-error { font-size: 13px; color: #DC2626; margin-bottom: 8px; }
.completed-segs { text-align: left; margin-top: 12px; font-size: 12px; color: var(--color-text-secondary); }
.cseg { padding: 2px 0; }

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
</style>
