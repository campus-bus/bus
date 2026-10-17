<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useUploadStore } from '@/stores/upload'
import { useScheduleStore } from '@/stores/schedule'
import { useMapStore } from '@/stores/map'
import { useGeolocation } from '@/composables/useGeolocation'
import { findNearestStop } from '@/utils/geo'
import { showConfirmDialog, showSuccessToast, showFailToast } from 'vant'
import { getNow } from '@/utils/time'

const uploadStore = useUploadStore()
const scheduleStore = useScheduleStore()
const mapStore = useMapStore()
useGeolocation()

const tabActive = ref(0)
const nickInput = ref(uploadStore.nickname)
const selectedRoute = ref('环线1路')

function formatLocalTime(isoStr?: string): string {
  if (!isoStr) return ''
  const d = new Date(isoStr)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// routeKey 映射
const routeToKey: Record<string, string> = {
  '环线1路': 'HX1_NORMAL', '环线2路': 'HX2_NORMAL', '环线3路': 'HX3_NORMAL', '环线3路(高超楼发车)': 'HX3_GAOCHAO', '就餐专线': 'HX1_DINING'
}
const routeOptions = ['环线1路', '环线2路', '环线3路', '环线3路(高超楼发车)', '就餐专线']

// 当前路线的完整站点序列（含终点站）
const routeStops = computed(() => {
  const rk = routeToKey[selectedRoute.value]
  const rp = scheduleStore.routePatterns.find(p => p.routeKey === rk)
  if (!rp || !rp.stops) return []
  // 返回副本，避免意外修改 store 数据
  return [...rp.stops.map(s => s.currentStop)]
})

// 推荐最近上车站点
const nearestRouteStop = computed(() => {
  if (mapStore.userLat === null || mapStore.userLng === null) return null
  const routeStopNames = new Set(routeStops.value.slice(0, -1)) // 排除终点站
  const routeStations = scheduleStore.stations.filter(s => routeStopNames.has(s.name))
  const result = findNearestStop(mapStore.userLat, mapStore.userLng, routeStations)
  return result?.station.name ?? null
})

// boardIdx = 上车站在 routeStops 中的索引
// recordedCount = 已经按过计时按钮的次数
const boardIdx = ref(-1)
const recordedCount = computed(() => uploadStore.recordedSegments.length)
const timingActive = computed(() => boardIdx.value >= 0)

// 到达终点站（全部段都记录完）
const allRecorded = computed(() => {
  if (boardIdx.value < 0) return false
  const totalSegments = routeStops.value.length - 1 - boardIdx.value
  return recordedCount.value >= totalSegments
})

const canSubmit = computed(() =>
  !!uploadStore.nickname && recordedCount.value > 0 && !uploadStore.uploading
)

function saveNick() {
  uploadStore.saveNickname(nickInput.value)
}

// 上车
function boardAt(stopName: string) {
  const idx = routeStops.value.indexOf(stopName)
  if (idx < 0 || idx >= routeStops.value.length - 1) return // 终点站不能上车
  boardIdx.value = idx
  uploadStore.startRecordingAt(stopName)
  showSuccessToast(`已上车：${stopName}`)
}

// 按顺序记录到站
function tapStop(idx: number) {
  if (!timingActive.value) return
  // 必须是 boardIdx + recordedCount + 1（下一站）
  if (idx !== boardIdx.value + recordedCount.value + 1) {
    showFailToast('请按站点顺序依次记录')
    return
  }
  const stopName = routeStops.value[idx]
  uploadStore.recordSegment(stopName)
}

// 判断各站的状态
// -1: 还没到（不显示按钮或显示"上车"）
//  0: 上车点（显示"上"）
//  1: 当前要点的站（显示"计时"）
//  2: 已记录（显示✓ + 秒数）
function stopState(idx: number): number {
  if (!timingActive.value) {
    // 未上车：终点站无按钮，其他显示上车
    return idx >= routeStops.value.length - 1 ? -1 : -1
  }
  if (idx === boardIdx.value) return 0 // 上车站
  if (idx < boardIdx.value) return -1 // 上车之前的站
  const segIdx = idx - boardIdx.value - 1 // 这是第几段
  if (segIdx < recordedCount.value) return 2 // 已记录
  if (segIdx === recordedCount.value) return 1 // 当前要记录
  return -1 // 还没到
}

function getSegmentSeconds(idx: number): string {
  const segIdx = idx - boardIdx.value - 1
  if (segIdx < 0 || segIdx >= uploadStore.segmentSeconds.length) return ''
  return `${uploadStore.segmentSeconds[segIdx]}秒`
}

async function handleSubmit() {
  try {
    await showConfirmDialog({
      title: '确认提交',
      message: `提交 ${recordedCount.value} 段行程记录？`,
    })
  } catch { return }

  const ok = await uploadStore.submit({
    route: selectedRoute.value,
    shift: '',
    departTime: '',
    date: getNow().toISOString().slice(0, 10),
  })
  if (ok) {
    showSuccessToast('提交成功！')
    boardIdx.value = -1
  } else {
    showFailToast('提交失败，请重试')
  }
}

async function handleUndo() {
  try {
    await showConfirmDialog({
      title: '确认回退',
      message: '撤销刚才的计时记录？回退后计时不会重置。',
      confirmButtonText: '确认回退',
      cancelButtonText: '取消',
    })
  } catch { return }
  uploadStore.undoLastSegment()
}

// 加载历史
watch(tabActive, (v) => {
  if (v === 1) uploadStore.loadHistory()
})
onMounted(() => {
  if (tabActive.value === 1) uploadStore.loadHistory()
})
watch(selectedRoute, () => {
  boardIdx.value = -1
  uploadStore.resetRecording()
})
</script>

<template>
  <div class="upload-page">
    <van-tabs v-model:active="tabActive" animated>
      <!-- Tab 1: 手动记录 -->
      <van-tab title="手动记录">
        <div class="form-section">
          <!-- 昵称 -->
          <div class="nick-row">
            <span>昵称</span>
            <input v-model="nickInput" placeholder="输入你的昵称" @blur="saveNick" class="nick-input" />
          </div>

          <!-- 线路 -->
          <div class="field-row">
            <span class="label">线路</span>
            <van-radio-group v-model="selectedRoute" direction="horizontal">
              <van-radio v-for="r in routeOptions" :key="r" :name="r">{{ r.replace('环线1路','环1').replace('环线2路','环2').replace('环线3路(高超楼发车)','环3高超发').replace('环线3路','环3').replace('就餐专线','就餐') }}</van-radio>
            </van-radio-group>
          </div>

          <!-- 站点 + 计时 -->
          <div v-if="routeStops.length" class="stops-section">
            <!-- 推荐上车 -->
            <div v-if="nearestRouteStop && !timingActive" class="nearest-card" @click="boardAt(nearestRouteStop)">
              <van-icon name="location-o" />
              <span>距你最近「{{ nearestRouteStop }}」，点此一键上车</span>
            </div>

            <div class="stops-title" v-if="!timingActive">选择上车站点</div>
            <div class="stops-title" v-else>到站请点「计时」</div>

            <div v-for="(stop, idx) in routeStops" :key="`${selectedRoute}-${idx}`" class="stop-row">
              <!-- 状态标记 -->
              <span class="stop-dot" :class="{
                boarding: stopState(idx) === 0,
                current: stopState(idx) === 1,
                done: stopState(idx) === 2,
              }">
                <template v-if="stopState(idx) === 0">上</template>
                <template v-else-if="stopState(idx) === 2">✓</template>
                <template v-else>{{ idx + 1 }}</template>
              </span>

              <span class="stop-name" :class="{ bold: stopState(idx) === 0 }">{{ stop }}</span>

              <!-- 已记录段的时间显示（在对应站的右侧） -->
              <span v-if="stopState(idx) === 2" class="seg-secs">
                {{ getSegmentSeconds(idx) }}
                <van-button
                  v-if="idx === boardIdx + recordedCount"
                  size="mini" type="danger" plain
                  style="margin-left:6px;padding:0 6px;font-size:11px"
                  @click="handleUndo"
                >回退</van-button>
              </span>

              <!-- 上车按钮 -->
              <van-button
                v-if="!timingActive && idx < routeStops.length - 1"
                size="small" type="primary" round @click="boardAt(stop)"
              >上车</van-button>

              <!-- 计时按钮 -->
              <van-button
                v-if="stopState(idx) === 1"
                size="small" type="warning" round @click="tapStop(idx)"
              >计时</van-button>

              <!-- 到达终点站（最后一站计时后） -->
              <span v-if="idx === routeStops.length - 1 && stopState(idx) === 2" class="seg-secs">{{ getSegmentSeconds(idx) }}</span>
            </div>

            <!-- 提交 -->
            <div v-if="timingActive && recordedCount > 0" style="margin-top:16px">
              <van-button
                type="success" block round
                :disabled="!canSubmit"
                :loading="uploadStore.uploading"
                @click="handleSubmit"
              >{{ allRecorded ? '到达终点，提交记录' : `已记录 ${recordedCount} 段，提交` }}</van-button>
              <div v-if="!uploadStore.nickname" class="hint">请先输入昵称</div>
            </div>
          </div>
        </div>
      </van-tab>

      <!-- Tab 2: 我的记录 -->
      <van-tab title="我的记录">
        <div class="history-section">
          <div v-if="!uploadStore.nickname" class="hint">请先在「手动记录」中输入昵称</div>
          <van-loading v-if="uploadStore.loadingHistory" size="24" style="margin:40px auto;display:block" />
          <div v-if="uploadStore.history.length === 0 && !uploadStore.loadingHistory && uploadStore.nickname" class="hint">暂无记录</div>

          <div v-for="rec in uploadStore.history" :key="rec.id" class="history-card">
            <div class="history-header">
              <span>{{ rec.date }} {{ formatLocalTime(rec.created_at) }} {{ rec.route }}</span>
              <van-button size="mini" type="danger" plain @click="uploadStore.deleteRecord(rec.id)">撤销</van-button>
            </div>
            <div class="history-segs">
              <template v-for="(seg, i) in rec.segments" :key="i">
                <span class="hseg">{{ seg.from }}→{{ seg.seconds }}s→{{ seg.to }}</span>
                <span v-if="i < rec.segments.length - 1" class="hseg-gap"></span>
              </template>
            </div>
          </div>
        </div>
      </van-tab>
    </van-tabs>
  </div>
</template>

<style scoped>
.upload-page { padding-bottom: 20px; max-width: 480px; margin: 0 auto; }
.form-section { padding: 16px; }
.nick-row { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; font-size: 15px; }
.nick-input { flex: 1; border: 1px solid var(--color-border); border-radius: 8px; padding: 6px 10px; font-size: 14px; outline: none; }
.nick-input:focus { border-color: var(--color-primary); }

.field-row { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; font-size: 14px; flex-wrap: wrap; }
.label { color: var(--color-text-secondary); white-space: nowrap; }

.stops-section { margin-top: 12px; }
.stops-title { font-size: 15px; font-weight: 600; margin-bottom: 8px; }
.nearest-card {
  display: flex; align-items: center; gap: 8px;
  padding: 12px 14px; background: #EFF6FF; border-radius: 10px;
  border: 1px solid var(--color-primary); font-size: 14px; color: var(--color-primary);
  cursor: pointer; margin-bottom: 12px;
}
.nearest-card:active { background: #DBEAFE; }

.stop-row { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid #F3F4F6; }
.stop-dot { width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; background: #E5E7EB; color: #6B7280; flex-shrink: 0; }
.stop-dot.boarding { background: var(--color-primary); color: #fff; font-size: 10px; }
.stop-dot.current { background: #F59E0B; color: #fff; font-weight: 600; }
.stop-dot.done { background: #10B981; color: #fff; }
.stop-name { flex: 1; font-size: 14px; }
.stop-name.bold { font-weight: 600; }
.seg-secs { font-size: 13px; color: #10B981; font-weight: 600; min-width: 40px; text-align: right; }
.hint { color: var(--color-text-secondary); font-size: 13px; }

.history-section { padding: 16px; }
.history-card { background: var(--color-card); border-radius: 10px; padding: 12px; margin-bottom: 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.04); }
.history-header { display: flex; justify-content: space-between; align-items: center; font-size: 13px; font-weight: 600; margin-bottom: 6px; }
.history-segs { font-size: 12px; color: var(--color-text-secondary); line-height: 1.8; word-break: break-all; }
.hseg { white-space: normal; }
.hseg-gap { display: inline-block; width: 1em; }
</style>
