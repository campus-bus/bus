<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useUploadStore } from '@/stores/upload'
import { useScheduleStore } from '@/stores/schedule'
import { useLocationStore } from '@/stores/location'
import { findNearestStop } from '@/utils/geo'
import { findStopIndexes, stopStateOf } from '@/utils/stop_seq'
import { isDevUnlocked } from '@/utils/dev'
import { onShow, onLoad } from '@dcloudio/uni-app'

// 开发者专属页面：未解锁时直接退回首页，避免普通用户误入
onLoad(() => {
  if (isDevUnlocked()) return
  uni.showToast({ title: '该页面仅维护者可用', icon: 'none' })
  setTimeout(() => uni.switchTab({ url: '/pages/index/index' }), 1200)
})

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
  const name = result?.station.name
  if (!name) return null
  /**
   * 该站名在本圈内的**全部**经过位置（按站序升序），而不是只取第一次。
   *
   * 接驳1路/2路是环线，军体活动中心东、网球场、激光所在同一圈里经过两次
   * （去程一次、绕回来再停一次）。以前这里用 `indexOf(站名)` 静默取第一次，
   * 结果用户在回程那趟车前点「一键上车」，页面却把上车站设成去程的站序，
   * 之后每一段计时都会记到错误的路段上。
   * 站名相同、物理位置也相同，靠代码猜不出用户要上哪一趟 —— 必须让用户选。
   */
  const idxs = findStopIndexes(routeStops.value, name)
  if (idxs.length === 0) return null
  return { name, idxs }
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

/**
 * 按「站序」而不是「站名」定位上车站
 *
 * 接驳1路的激光所是第 9、13 站，接驳2路是第 6、10 站，就餐专线的理学院是第 2、8 站：
 * 用 indexOf(站名) 永远只会拿到第一次经过的位置，从第二次上车时整条计时链都会错位，
 * 采出来的段耗时也就没法用于校准。这里一律用 v-for 的 idx（与 stopSeq 严格一一对应）。
 */
function boardAt(idx: number) {
  const stopName = routeStops.value[idx]
  if (!stopName || idx >= routeStops.value.length - 1) return
  boardIdx.value = idx
  uploadStore.startRecordingAt(stopName, idx + 1)
  // 同名站在一圈内出现两次时，站名不足以让用户确认自己选对了哪一趟
  uni.showToast({ title: `已上车：${stopName}（第 ${idx + 1} 站）`, icon: 'none' })
}

function tapStop(idx: number) {
  if (!timingActive.value) return
  if (idx !== boardIdx.value + recordedCount.value + 1) {
    uni.showToast({ title: '请按站点顺序依次记录', icon: 'none' })
    return
  }
  uploadStore.recordSegment(routeStops.value[idx], idx + 1)
}

function stopState(idx: number): number {
  return stopStateOf(idx, boardIdx.value, recordedCount.value)
}

/**
 * 每行的状态缓存
 *
 * 模板里每个 stop-row 原来要算 4~6 次 stopState，18 行就是上百次；
 * 缓存成数组后模板只做取值，也便于给整行加高亮，让「到底选了哪一站」一眼可见。
 */
const stopStates = computed(() => routeStops.value.map((_, idx) => stopState(idx)))

/**
 * 出现多次的站名的行索引
 *
 * 用来给「上车」按钮补上站序：一圈过两次的站（军体东/网球场/激光所）
 * 光看名字满屏都一样，点之前必须能看出自己点的是第几站。
 */
const duplicatedIdxs = computed(() => {
  const seen = new Map<string, number[]>()
  routeStops.value.forEach((s, i) => {
    const list = seen.get(s)
    if (list) list.push(i)
    else seen.set(s, [i])
  })
  const out = new Set<number>()
  for (const list of seen.values()) if (list.length > 1) list.forEach(i => out.add(i))
  return out
})

function boardLabel(idx: number): string {
  return duplicatedIdxs.value.has(idx) ? `上车 · 第${idx + 1}站` : '上车'
}

/** store 被重置（切线路、提交完成）时，页面高亮必须跟着清掉，否则会停在旧的站序上 */
watch(() => uploadStore.timingActive, (active) => {
  if (!active) boardIdx.value = -1
})

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
      // 带上路线 key 与上车时刻：同一路线一天几十班，只存线路名无法回溯测的是哪一趟
      const ok = await uploadStore.submit(
        selectedRoute.value,
        '',
        formatTime(uploadStore.boardingTime),
        routeToKey[selectedRoute.value] || '',
      )
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

watch(tabActive, (v) => { if (v === 1) uploadStore.loadHistory() })
onShow(() => { if (tabActive.value === 1) uploadStore.loadHistory() })

/**
 * 切换线路
 *
 * 旧逻辑一点别的线路就 resetRecording()：真实采样要十几分钟，
 * 误触一下整趟白测。有已记录段时先确认，取消则保持原线路不变。
 */
function pickRoute(r: string) {
  if (r === selectedRoute.value) return
  if (timingActive.value && recordedCount.value > 0) {
    uni.showModal({
      title: '切换线路会清空本次计时',
      content: `已记录 ${recordedCount.value} 段，确定放弃并切换到「${routeShort(r)}」？`,
      confirmText: '放弃并切换',
      confirmColor: '#DC2626',
      success: (res) => { if (res.confirm) applyRoute(r) },
    })
    return
  }
  applyRoute(r)
}
function applyRoute(r: string) {
  selectedRoute.value = r
  boardIdx.value = -1
  uploadStore.resetRecording()
}

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
          @tap="pickRoute(r)"
        >{{ routeShort(r) }}</view>
      </view>

      <view v-if="routeStops.length">
        <!-- 最近站卡片：站名只经过一次时一键上车；经过多次时必须让用户选，
             否则会默认选中去程那一次，把回程上车的计时记到错误路段上 -->
        <view v-if="nearestRouteStop && !timingActive" class="nearest-card">
          <view class="nearest-main">
            <image class="nearest-icon" src="/static/icons/ui/locate.png" mode="aspectFit" />
            <text>距你最近「{{ nearestRouteStop.name }}」</text>
          </view>
          <template v-if="nearestRouteStop.idxs.length === 1">
            <view class="nearest-btns">
              <view class="nearest-btn" @tap="boardAt(nearestRouteStop.idxs[0])">点此上车</view>
            </view>
          </template>
          <template v-else>
            <text class="nearest-hint">
              这一站在一圈里经过 {{ nearestRouteStop.idxs.length }} 次，请按你上的那趟车选站序
            </text>
            <view class="nearest-btns">
              <view
                v-for="i in nearestRouteStop.idxs" :key="i"
                class="nearest-btn" @tap="boardAt(i)"
              >第 {{ i + 1 }} 站</view>
            </view>
          </template>
        </view>
        <view class="stops-title">{{ timingActive ? '到站请点「计时」' : '选择上车站点' }}</view>

        <view
          v-for="(stop, idx) in routeStops" :key="idx"
          class="stop-row"
          :class="{ boarding: stopStates[idx] === 0, current: stopStates[idx] === 1, done: stopStates[idx] === 2 }"
        >
          <view class="stop-dot" :class="{ boarding: stopStates[idx] === 0, current: stopStates[idx] === 1, done: stopStates[idx] === 2 }">
            <text v-if="stopStates[idx] === 0">上</text>
            <image v-else-if="stopStates[idx] === 2" class="stop-dot-check" src="/static/icons/ui/check-white.png" mode="aspectFit" />
            <text v-else>{{ idx + 1 }}</text>
          </view>
          <text class="stop-name" :class="{ bold: stopStates[idx] === 0 }">{{ stop }}</text>
          <text v-if="stopStates[idx] === 2" class="seg-secs">{{ getSegmentSeconds(idx) }}</text>
          <view v-if="stopStates[idx] === 2 && idx === boardIdx + recordedCount" class="undo-btn" @tap="handleUndo">回退</view>
          <view v-if="!timingActive && idx < routeStops.length - 1" class="board-btn" @tap="boardAt(idx)">{{ boardLabel(idx) }}</view>
          <view v-if="stopStates[idx] === 1" class="timing-btn" @tap="tapStop(idx)">计时</view>
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
      <view v-for="rec in uploadStore.history" :key="rec.id" class="history-card">
        <view class="history-header">
          <text>{{ rec.date }} {{ formatTime(rec.created_at) }} {{ rec.route }}</text>
          <text class="delete-btn" @tap="handleDelete(rec.id)">撤销</text>
        </view>
        <view class="history-segs">{{ formatSegs(rec.segments) }}</view>
      </view>
      <view v-if="uploadStore.history.length > 0" class="copy-btn" @tap="uploadStore.copyCalibrationText()">
        复制全部记录（用于校准时刻表）
      </view>
    </view>
  </view>
</template>

<style scoped>
.record-page {
  /* 非 tabBar 页：给 Home 指示条留安全区，避免最后一条记录被遮住 */
  padding-bottom: calc(24rpx + env(safe-area-inset-bottom));
}
.top-tabs { display: flex; background: var(--color-card); }
.top-tab { flex: 1; text-align: center; padding: 24rpx 0; font-size: 28rpx; color: var(--color-text-secondary); border-bottom: 4rpx solid transparent; }
.top-tab.active { color: var(--color-primary); font-weight: 600; border-bottom-color: var(--color-primary); }

.panel { padding: 20rpx 24rpx; }
.nick-row { display: flex; align-items: center; gap: 14rpx; margin-bottom: 18rpx; font-size: 28rpx; }
.nick-input { flex: 1; border: 1rpx solid var(--color-border); border-radius: 12rpx; padding: 12rpx 18rpx; font-size: 26rpx; background: var(--color-card); }

.route-row { display: flex; gap: 12rpx; margin-bottom: 18rpx; }
.route-opt { padding: 10rpx 22rpx; font-size: 26rpx; background: var(--color-card); border-radius: 999rpx; border: 1rpx solid var(--color-border); color: var(--color-text-secondary); }
.route-opt.active { background: var(--color-primary-soft); color: var(--color-primary); border-color: var(--color-primary); font-weight: 600; }

.nearest-card {
  display: flex; flex-direction: column; gap: 12rpx;
  background: var(--color-primary-soft); border: 1rpx solid var(--color-primary); border-radius: 12rpx;
  padding: 18rpx 20rpx; font-size: 26rpx; color: var(--color-primary); margin-bottom: 16rpx;
}
.nearest-main { display: flex; align-items: center; gap: 10rpx; }
.nearest-icon { width: 30rpx; height: 30rpx; flex-shrink: 0; }
.nearest-hint { font-size: 22rpx; line-height: 1.5; opacity: 0.85; }
.nearest-btns { display: flex; flex-wrap: wrap; gap: 12rpx; }
.nearest-btn {
  background: var(--color-primary); color: #fff; font-size: 24rpx;
  padding: 10rpx 26rpx; border-radius: 999rpx;
}
.stops-title { font-size: 28rpx; font-weight: 600; margin-bottom: 10rpx; }

.stop-row { display: flex; align-items: center; gap: 16rpx; padding: 14rpx 0; border-bottom: 1rpx solid var(--color-divider); }
/* 整行高亮：重复站名（军体东/网球场/激光所一圈过两次）时，只靠小圆点看不出选中了哪一趟 */
.stop-row.boarding { background: var(--color-primary-soft); border-radius: 10rpx; }
.stop-row.current { background: var(--color-warning-soft); border-radius: 10rpx; }
.stop-dot { width: 40rpx; height: 40rpx; border-radius: 50%; background: var(--color-border); color: var(--color-text-secondary); display: flex; align-items: center; justify-content: center; font-size: 20rpx; flex-shrink: 0; }
.stop-dot.boarding { background: var(--color-primary); color: #fff; }
.stop-dot.current { background: var(--color-warning); color: #fff; font-weight: 600; }
.stop-dot.done { background: var(--color-success); color: #fff; }
.stop-dot-check { width: 24rpx; height: 24rpx; }
.stop-name { flex: 1; font-size: 28rpx; }
.stop-name.bold { font-weight: 600; }
.seg-secs { font-size: 24rpx; color: var(--color-success); font-weight: 600; }
.undo-btn { font-size: 22rpx; color: var(--color-danger); border: 1rpx solid var(--color-danger); border-radius: 8rpx; padding: 4rpx 12rpx; }
.board-btn { background: var(--color-primary); color: #fff; font-size: 24rpx; padding: 8rpx 22rpx; border-radius: 999rpx; }
.timing-btn { background: var(--color-warning); color: #fff; font-size: 24rpx; padding: 8rpx 22rpx; border-radius: 999rpx; }

.submit-area { margin-top: 24rpx; }
.submit-btn { background: var(--color-success); color: #fff; text-align: center; padding: 18rpx; border-radius: 999rpx; font-size: 30rpx; }
.submit-btn.disabled { background: var(--color-text-tertiary); }
.hint { text-align: center; font-size: 24rpx; color: var(--color-text-secondary); padding: 24rpx; }

.history-card { background: var(--color-card); border-radius: 14rpx; padding: 18rpx 22rpx; margin-bottom: 12rpx; }
.history-header { display: flex; justify-content: space-between; align-items: center; font-size: 26rpx; font-weight: 600; margin-bottom: 8rpx; }
.delete-btn { font-size: 22rpx; color: var(--color-danger); border: 1rpx solid var(--color-danger); border-radius: 8rpx; padding: 4rpx 14rpx; font-weight: 400; }
.history-segs { font-size: 24rpx; color: var(--color-text-secondary); line-height: 1.8; word-break: break-all; }
.copy-btn { margin-top: 24rpx; text-align: center; font-size: 26rpx; color: var(--color-primary); background: var(--color-primary-soft); border-radius: 999rpx; padding: 18rpx; }
</style>
