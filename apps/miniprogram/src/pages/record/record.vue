<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useUploadStore } from '@/stores/upload'
import { useScheduleStore } from '@/stores/schedule'
import { useLocationStore } from '@/stores/location'
import { findNearestStop } from '@/utils/geo'
import { onShow } from '@dcloudio/uni-app'

const uploadStore = useUploadStore()
const scheduleStore = useScheduleStore()
const locationStore = useLocationStore()

const tabActive = ref(0)
const nickInput = ref(uploadStore.nickname)
const selectedRoute = ref('环线1路')

const routeToKey: Record<string, string> = {
  '环线1路': 'HX1_NORMAL', '接驳1路': 'JB1_NORMAL', '接驳2路': 'JB2_NORMAL', '就餐专线': 'HX1_DINING',
}
const routeOptions = ['环线1路', '接驳1路', '接驳2路', '就餐专线']
const routeShort = (r: string) => r.replace('环线1路', '环1').replace('接驳1路', '接1').replace('接驳2路', '接2').replace('就餐专线', '就餐')

const routeStops = computed(() => {
  const rk = routeToKey[selectedRoute.value]
  const rp = scheduleStore.routePatterns.find(p => p.routeKey === rk)
  return rp ? [...rp.stops.map(s => s.currentStop)] : []
})

// 推荐最近上车站
const nearestRouteStop = computed(() => {
  if (locationStore.userLat === null || locationStore.userLng === null) return null
  const names = new Set(routeStops.value.slice(0, -1))
  const routeStations = scheduleStore.stations.filter(s => names.has(s.name))
  const result = findNearestStop(locationStore.userLat, locationStore.userLng, routeStations)
  return result?.station.name ?? null
})

const boardIdx = ref(-1)
const recordedCount = computed(() => uploadStore.recordedSegments.length)
const timingActive = computed(() => boardIdx.value >= 0)
const allRecorded = computed(() => {
  if (boardIdx.value < 0) return false
  return recordedCount.value >= routeStops.value.length - 1 - boardIdx.value
})
const canSubmit = computed(() => !!uploadStore.nickname && recordedCount.value > 0 && !uploadStore.uploading)

function saveNick() { uploadStore.saveNickname(nickInput.value) }

function boardAt(stopName: string) {
  const idx = routeStops.value.indexOf(stopName)
  if (idx < 0 || idx >= routeStops.value.length - 1) return
  boardIdx.value = idx
  uploadStore.startRecordingAt(stopName)
  uni.showToast({ title: `已上车：${stopName}`, icon: 'none' })
}

function tapStop(idx: number) {
  if (!timingActive.value) return
  if (idx !== boardIdx.value + recordedCount.value + 1) {
    uni.showToast({ title: '请按站点顺序依次记录', icon: 'none' })
    return
  }
  uploadStore.recordSegment(routeStops.value[idx])
}

function stopState(idx: number): number {
  if (!timingActive.value) return -1
  if (idx === boardIdx.value) return 0
  if (idx < boardIdx.value) return -1
  const segIdx = idx - boardIdx.value - 1
  if (segIdx < recordedCount.value) return 2
  if (segIdx === recordedCount.value) return 1
  return -1
}

function getSegmentSeconds(idx: number): string {
  const segIdx = idx - boardIdx.value - 1
  if (segIdx < 0 || segIdx >= uploadStore.segmentSeconds.length) return ''
  return `${uploadStore.segmentSeconds[segIdx]}秒`
}

function handleUndo() {
  uni.showModal({
    title: '确认回退',
    content: '撤销刚才的计时记录？回退后计时不会重置。',
    confirmText: '确认回退',
    success: (res) => { if (res.confirm) uploadStore.undoLastSegment() },
  })
}

function handleSubmit() {
  uni.showModal({
    title: '确认提交',
    content: `提交 ${recordedCount.value} 段行程记录？`,
    success: async (res) => {
      if (!res.confirm) return
      const ok = await uploadStore.submit(selectedRoute.value)
      if (ok) {
        uni.showToast({ title: '提交成功！', icon: 'success' })
        boardIdx.value = -1
      } else {
        uni.showToast({ title: uploadStore.nickname ? '提交失败，请重试' : '请先输入昵称', icon: 'none' })
      }
    },
  })
}

function handleDelete(id: string) {
  uni.showModal({
    title: '确认撤销',
    content: '删除这条记录？',
    confirmColor: '#DC2626',
    success: (res) => { if (res.confirm) uploadStore.deleteRecord(id) },
  })
}

watch(selectedRoute, () => {
  boardIdx.value = -1
  uploadStore.resetRecording()
})
watch(tabActive, (v) => { if (v === 1) uploadStore.loadHistory() })
onShow(() => { if (tabActive.value === 1) uploadStore.loadHistory() })

function formatSegs(segs: Array<{ from: string; to: string; seconds: number }>) {
  return segs.map(s => `${s.from}→${s.seconds}s→${s.to}`).join(' ')
}
function formatTime(ts: number) {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
</script>

<template>
  <view class="record-page">
    <view class="top-tabs">
      <view class="top-tab" :class="{ active: tabActive === 0 }" @tap="tabActive = 0">手动记录</view>
      <view class="top-tab" :class="{ active: tabActive === 1 }" @tap="tabActive = 1">我的记录</view>
    </view>

    <!-- 手动记录 -->
    <view v-if="tabActive === 0" class="panel">
      <view class="nick-row">
        <text>昵称</text>
        <input v-model="nickInput" class="nick-input" placeholder="输入你的昵称" @blur="saveNick" />
      </view>

      <view class="route-row">
        <view
          v-for="r in routeOptions" :key="r"
          class="route-opt" :class="{ active: selectedRoute === r }"
          @tap="selectedRoute = r"
        >{{ routeShort(r) }}</view>
      </view>

      <view v-if="routeStops.length">
        <view v-if="nearestRouteStop && !timingActive" class="nearest-card" @tap="boardAt(nearestRouteStop)">
          <text>📍 距你最近「{{ nearestRouteStop }}」，点此一键上车</text>
        </view>
        <view class="stops-title">{{ timingActive ? '到站请点「计时」' : '选择上车站点' }}</view>

        <view v-for="(stop, idx) in routeStops" :key="idx" class="stop-row">
          <view class="stop-dot" :class="{ boarding: stopState(idx) === 0, current: stopState(idx) === 1, done: stopState(idx) === 2 }">
            <text v-if="stopState(idx) === 0">上</text>
            <text v-else-if="stopState(idx) === 2">✓</text>
            <text v-else>{{ idx + 1 }}</text>
          </view>
          <text class="stop-name" :class="{ bold: stopState(idx) === 0 }">{{ stop }}</text>
          <text v-if="stopState(idx) === 2" class="seg-secs">{{ getSegmentSeconds(idx) }}</text>
          <view v-if="stopState(idx) === 2 && idx === boardIdx + recordedCount" class="undo-btn" @tap="handleUndo">回退</view>
          <view v-if="!timingActive && idx < routeStops.length - 1" class="board-btn" @tap="boardAt(stop)">上车</view>
          <view v-if="stopState(idx) === 1" class="timing-btn" @tap="tapStop(idx)">计时</view>
        </view>

        <view v-if="timingActive && recordedCount > 0" class="submit-area">
          <view class="submit-btn" :class="{ disabled: !canSubmit }" @tap="canSubmit && handleSubmit()">
            {{ allRecorded ? '到达终点，提交记录' : `已记录 ${recordedCount} 段，提交` }}
          </view>
          <view v-if="!uploadStore.nickname" class="hint">请先输入昵称</view>
        </view>
      </view>
    </view>

    <!-- 我的记录 -->
    <view v-else class="panel">
      <view v-if="!uploadStore.nickname" class="hint">请先在「手动记录」中输入昵称</view>
      <view v-else-if="uploadStore.loadingHistory" class="hint">加载中…</view>
      <view v-else-if="uploadStore.history.length === 0" class="hint">暂无记录</view>
      <view v-for="rec in uploadStore.history" :key="rec._id" class="history-card">
        <view class="history-header">
          <text>{{ rec.date }} {{ formatTime(rec.created_at) }} {{ rec.route }}</text>
          <text class="delete-btn" @tap="handleDelete(rec._id)">撤销</text>
        </view>
        <view class="history-segs">{{ formatSegs(rec.segments) }}</view>
      </view>
    </view>
  </view>
</template>

<style scoped>
.record-page { padding-bottom: 24rpx; }
.top-tabs { display: flex; background: #fff; }
.top-tab { flex: 1; text-align: center; padding: 24rpx 0; font-size: 28rpx; color: #6B7280; border-bottom: 4rpx solid transparent; }
.top-tab.active { color: #1A56DB; font-weight: 600; border-bottom-color: #1A56DB; }

.panel { padding: 20rpx 24rpx; }
.nick-row { display: flex; align-items: center; gap: 14rpx; margin-bottom: 18rpx; font-size: 28rpx; }
.nick-input { flex: 1; border: 1rpx solid #E5E7EB; border-radius: 12rpx; padding: 12rpx 18rpx; font-size: 26rpx; background: #fff; }

.route-row { display: flex; gap: 12rpx; margin-bottom: 18rpx; }
.route-opt { padding: 10rpx 22rpx; font-size: 26rpx; background: #fff; border-radius: 999rpx; border: 1rpx solid #E5E7EB; color: #6B7280; }
.route-opt.active { background: #EFF6FF; color: #1A56DB; border-color: #1A56DB; font-weight: 600; }

.nearest-card { background: #EFF6FF; border: 1rpx solid #1A56DB; border-radius: 12rpx; padding: 18rpx 20rpx; font-size: 26rpx; color: #1A56DB; margin-bottom: 16rpx; }
.stops-title { font-size: 28rpx; font-weight: 600; margin-bottom: 10rpx; }

.stop-row { display: flex; align-items: center; gap: 16rpx; padding: 14rpx 0; border-bottom: 1rpx solid #F3F4F6; }
.stop-dot { width: 40rpx; height: 40rpx; border-radius: 50%; background: #E5E7EB; color: #6B7280; display: flex; align-items: center; justify-content: center; font-size: 20rpx; flex-shrink: 0; }
.stop-dot.boarding { background: #1A56DB; color: #fff; }
.stop-dot.current { background: #F59E0B; color: #fff; font-weight: 600; }
.stop-dot.done { background: #10B981; color: #fff; }
.stop-name { flex: 1; font-size: 28rpx; }
.stop-name.bold { font-weight: 600; }
.seg-secs { font-size: 24rpx; color: #10B981; font-weight: 600; }
.undo-btn { font-size: 22rpx; color: #DC2626; border: 1rpx solid #DC2626; border-radius: 8rpx; padding: 4rpx 12rpx; }
.board-btn { background: #1A56DB; color: #fff; font-size: 24rpx; padding: 8rpx 22rpx; border-radius: 999rpx; }
.timing-btn { background: #F59E0B; color: #fff; font-size: 24rpx; padding: 8rpx 22rpx; border-radius: 999rpx; }

.submit-area { margin-top: 24rpx; }
.submit-btn { background: #10B981; color: #fff; text-align: center; padding: 18rpx; border-radius: 999rpx; font-size: 30rpx; }
.submit-btn.disabled { background: #9CA3AF; }
.hint { text-align: center; font-size: 24rpx; color: #6B7280; padding: 24rpx; }

.history-card { background: #fff; border-radius: 14rpx; padding: 18rpx 22rpx; margin-bottom: 12rpx; }
.history-header { display: flex; justify-content: space-between; align-items: center; font-size: 26rpx; font-weight: 600; margin-bottom: 8rpx; }
.delete-btn { font-size: 22rpx; color: #DC2626; border: 1rpx solid #DC2626; border-radius: 8rpx; padding: 4rpx 14rpx; font-weight: 400; }
.history-segs { font-size: 24rpx; color: #6B7280; line-height: 1.8; word-break: break-all; }
</style>
