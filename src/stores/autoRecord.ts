import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useScheduleStore } from '@/stores/schedule'
import { useUploadStore } from '@/stores/upload'
import { haversineDistance, computeMinDistanceToPath } from '@/utils/geo'
import { getNow } from '@/utils/time'
import type { TimeSegment } from './upload'

export type SessionState = 'idle' | 'active' | 'paused' | 'completed'

export const useAutoRecordStore = defineStore('autoRecord', () => {
  const scheduleStore = useScheduleStore()
  const uploadStore = useUploadStore()

  // ---- 状态 ----
  const sessionState = ref<SessionState>('idle')
  const selectedRoute = ref('')
  const routeKey = ref('')
  const stops = ref<Array<{ name: string; lng: number; lat: number }>>([])
  const boardStopIndex = ref(-1)
  const currentStopIndex = ref(-1) // 下一个要到达的站
  const segments = ref<TimeSegment[]>([])
  const segmentStartTime = ref<number | null>(null) // Date.now()
  const sessionStartTime = ref(0)
  const totalPausedMs = ref(0)
  const pauseStartTime = ref<number | null>(null)
  const arrivalInRangeSince = ref<number | null>(null)
  const leaveOutOfRangeSince = ref<number | null>(null)
  const skipNextArrival = ref(false) // 错站恢复后，下个到站不记录（桥接段无意义）
  const lastLat = ref<number | null>(null)
  const lastLng = ref<number | null>(null)
  const error = ref<string | null>(null)
  const submitOk = ref(false)

  // ---- 计算 ----
  const tick = ref(0)
  function bumpTick() { tick.value++ }

  const totalElapsedMs = computed(() => {
    void tick.value
    if (sessionState.value === 'idle') return 0
    if (sessionStartTime.value === 0) return 0
    let elapsed = Date.now() - sessionStartTime.value - totalPausedMs.value
    if (pauseStartTime.value) elapsed -= (Date.now() - pauseStartTime.value)
    return Math.max(0, elapsed)
  })

  const currentSegmentElapsedMs = computed(() => {
    void tick.value
    if (!segmentStartTime.value || sessionState.value !== 'active') return 0
    return Math.max(0, Date.now() - segmentStartTime.value)
  })

  const currentStop = computed(() => {
    if (currentStopIndex.value < 0 || currentStopIndex.value >= stops.value.length) return null
    return stops.value[currentStopIndex.value]
  })

  const allSegmentsRecorded = computed(() => {
    // 最后一个是终点（环线首尾同站），倒数第二站到达即完成
    return currentStopIndex.value >= stops.value.length - 1
  })

  const stopsDisplay = computed(() => {
    return stops.value.map((s, idx) => {
      let status: 'boarding' | 'passed' | 'current' | 'upcoming' = 'upcoming'
      if (idx === boardStopIndex.value) status = 'boarding'
      else if (idx < currentStopIndex.value && idx > boardStopIndex.value) status = 'passed'
      else if (idx === currentStopIndex.value && sessionState.value === 'active') status = 'current'

      let elapsedSec: number | undefined
      if (status === 'passed') {
        // 找到这个站作为 toStop 的 segment
        const seg = segments.value.find(s => s.to === stops.value[idx]?.name)
        if (seg) elapsedSec = seg.seconds
      }
      return { ...s, status, elapsedSec, idx }
    })
  })

  /** 上车站名 */
  const boardStopName = computed(() => {
    if (boardStopIndex.value < 0 || boardStopIndex.value >= stops.value.length) return ''
    return stops.value[boardStopIndex.value].name
  })

  // 手动覆盖的上车站点
  const manualBoardStop = ref('')

  /** 开始前检测到的最近站点 */
  const detectedStopName = computed(() => {
    if (lastLat.value === null || lastLng.value === null) return ''
    const stopList = scheduleStore.routeStops[routeKey.value]
    if (!stopList || stopList.length === 0) return ''
    let best = ''
    let bestD = Infinity
    for (let i = 0; i < stopList.length - 1; i++) {
      const d = haversineDistance(lastLat.value, lastLng.value, stopList[i].lat, stopList[i].lng)
      if (d < bestD) { bestD = d; best = stopList[i].name }
    }
    return bestD < 100 ? best : ''
  })

  /** 当前路线站点列表（用于选择器） */
  const routeStopOptions = computed(() => {
    if (!routeKey.value) return []
    const stopList = scheduleStore.routeStops[routeKey.value]
    if (!stopList) return []
    return stopList.slice(0, -1).map(s => s.name) // 排除终点站
  })

  /** GPS 当前最靠近的站点名 */
  const nearestStopName = computed(() => {
    void tick.value
    if (lastLat.value === null || lastLng.value === null || stops.value.length === 0) return ''
    let bestName = ''
    let bestDist = Infinity
    for (const s of stops.value) {
      const d = haversineDistance(lastLat.value, lastLng.value, s.lat, s.lng)
      if (d < bestDist) { bestDist = d; bestName = s.name }
    }
    return bestDist < 100 ? bestName : ''
  })

  // ---- 动作 ----

  function startSession(route: string, manualStop?: string) {
    let rk = ROUTE_TO_KEY[route] || ''

    // 环线3路 GPS 感知：距高超楼更近 → HX3_GAOCHAO，否则 HX3_NORMAL
    if (route === '环线3路' && lastLat.value !== null && lastLng.value !== null) {
      const sysStop = scheduleStore.routeStops['HX3_GAOCHAO']?.[0] // 高超楼（首发站）
      const yjsStop = scheduleStore.routeStops['HX3_NORMAL']?.[0]  // 研究生宿舍楼（首发站）
      if (sysStop && yjsStop) {
        const dSys = haversineDistance(lastLat.value, lastLng.value, sysStop.lat, sysStop.lng)
        const dYjs = haversineDistance(lastLat.value, lastLng.value, yjsStop.lat, yjsStop.lng)
        if (dSys < dYjs) rk = 'HX3_GAOCHAO'
      }
    }

    if (!rk) { error.value = '无法识别路线'; return }

    const stopList = scheduleStore.routeStops[rk]
    if (!stopList || stopList.length < 2) { error.value = '路线站点数据不足'; return }

    // 找最近站作为上车站（如用户手动选了则优先）
    let boardIdx = 0
    if (manualStop) {
      boardIdx = stopList.findIndex(s => s.name === manualStop)
      if (boardIdx < 0 || boardIdx >= stopList.length - 1) boardIdx = 0
    } else if (lastLat.value !== null && lastLng.value !== null) {
      let minDist = Infinity
      for (let i = 0; i < stopList.length - 1; i++) {
        const d = haversineDistance(lastLat.value, lastLng.value, stopList[i].lat, stopList[i].lng)
        if (d < minDist) { minDist = d; boardIdx = i }
      }
    }

    reset()
    selectedRoute.value = route
    routeKey.value = rk
    stops.value = stopList.map(s => ({ name: s.name, lng: s.lng, lat: s.lat }))
    boardStopIndex.value = boardIdx
    currentStopIndex.value = boardIdx + 1
    sessionState.value = 'active'
    sessionStartTime.value = Date.now()
    segmentStartTime.value = Date.now()
    error.value = null
    submitOk.value = false
  }

  function processGpsUpdate(lat: number, lng: number, ts: number) {
    if (sessionState.value !== 'active') return
    lastLat.value = lat
    lastLng.value = lng

    // ---- 错站检测：切后台期间可能跳过了一些站 ----
    let bestStopIdx = currentStopIndex.value
    let bestDist = Infinity
    // 不检查最后一站（环线首尾同站，人在起点会误触发）
    const maxCheckIdx = stops.value.length - 2
    for (let i = currentStopIndex.value; i <= maxCheckIdx; i++) {
      const d = haversineDistance(lat, lng, stops.value[i].lat, stops.value[i].lng)
      if (d < bestDist) { bestDist = d; bestStopIdx = i }
    }
    // 如果在后面某站的 30m 内，且跳过了至少一站 → 跳过中间站，重置计时
    if (bestStopIdx > currentStopIndex.value && bestDist <= 30) {
      currentStopIndex.value = bestStopIdx
      segmentStartTime.value = Date.now()
      arrivalInRangeSince.value = null
      leaveOutOfRangeSince.value = null
      skipNextArrival.value = true // 桥接段不记录
    }

    const stop = stops.value[currentStopIndex.value]
    if (!stop) return

    // ---- 到站检测 ----
    const distToStop = haversineDistance(lat, lng, stop.lat, stop.lng)
    if (distToStop <= 30) {
      if (arrivalInRangeSince.value === null) {
        arrivalInRangeSince.value = ts
      } else if (ts - arrivalInRangeSince.value >= 3000) {
        recordArrival()
        return
      }
    } else {
      arrivalInRangeSince.value = null
    }

    // ---- 离开路线检测 ----
    const path = scheduleStore.routePaths[routeKey.value]
    if (path && path.length > 0) {
      const minPathDist = computeMinDistanceToPath(lat, lng, path)
      if (minPathDist > 50) {
        if (leaveOutOfRangeSince.value === null) {
          leaveOutOfRangeSince.value = ts
        }
        // composable 负责 10 秒倒计时
      } else {
        leaveOutOfRangeSince.value = null
      }
    }
  }

  function recordArrival() {
    const stop = stops.value[currentStopIndex.value]
    if (!stop || !segmentStartTime.value) return

    if (skipNextArrival.value) {
      // 错站恢复后的桥接段：不记录，只重置计时
      skipNextArrival.value = false
      segmentStartTime.value = Date.now()
      currentStopIndex.value++
      arrivalInRangeSince.value = null
    } else {
      const elapsed = Math.round((Date.now() - segmentStartTime.value) / 1000)
      const fromName = stops.value[currentStopIndex.value - 1]?.name || boardStopName.value
      segments.value.push({ from: fromName, to: stop.name, seconds: elapsed })
      segmentStartTime.value = Date.now()
      currentStopIndex.value++
      arrivalInRangeSince.value = null
    }

    if (allSegmentsRecorded.value) {
      finishSession('complete')
    }
  }

  function pauseSession() {
    if (sessionState.value !== 'active') return
    sessionState.value = 'paused'
    pauseStartTime.value = Date.now()
  }

  function resumeSession() {
    if (sessionState.value !== 'paused') return
    if (pauseStartTime.value) {
      const pauseMs = Date.now() - pauseStartTime.value
      totalPausedMs.value += pauseMs
      // 修正 segmentStartTime，排除暂停时段
      if (segmentStartTime.value) segmentStartTime.value += pauseMs
      pauseStartTime.value = null
    }
    sessionState.value = 'active'
    arrivalInRangeSince.value = null
    leaveOutOfRangeSince.value = null
  }

  function manualLeave() {
    // 不记录额外段：最后一段已被 recordArrival 记录，离开路程不计入
    finishSession('manual_leave')
  }

  function autoLeave() {
    finishSession('auto_leave')
  }

  async function finishSession(reason: string) {
    sessionState.value = 'completed'
    error.value = null

    if (segments.value.length > 0 && uploadStore.nickname) {
      try {
        // 将 autoRecord 的 segments 注入 uploadStore
        uploadStore.recordedSegments = segments.value.map(s => ({ ...s }))
        const ok = await uploadStore.submit({
          route: selectedRoute.value,
          shift: '',
          departTime: '',
          date: getNow().toISOString().slice(0, 10),
        })
        submitOk.value = ok
        if (!ok) error.value = '提交失败，请检查网络后重试'
      } catch {
        error.value = '提交失败，请检查网络后重试'
      }
    } else if (!uploadStore.nickname) {
      error.value = '请先在手动记录中设置昵称'
    }
  }

  function reset() {
    sessionState.value = 'idle'
    selectedRoute.value = ''
    routeKey.value = ''
    stops.value = []
    boardStopIndex.value = -1
    currentStopIndex.value = -1
    segments.value = []
    segmentStartTime.value = null
    sessionStartTime.value = 0
    totalPausedMs.value = 0
    pauseStartTime.value = null
    arrivalInRangeSince.value = null
    leaveOutOfRangeSince.value = null
    skipNextArrival.value = false
    manualBoardStop.value = ''
    error.value = null
    submitOk.value = false
  }

  const ROUTE_TO_KEY: Record<string, string> = {
    '环线1路': 'HX1_NORMAL',
    '环线2路': 'HX2_NORMAL',
    '环线3路': 'HX3_NORMAL',
    '就餐专线': 'HX1_DINING',
  }

  return {
    sessionState, selectedRoute, routeKey, stops, boardStopIndex, currentStopIndex,
    segments, segmentStartTime, sessionStartTime, totalPausedMs, pauseStartTime,
    arrivalInRangeSince, leaveOutOfRangeSince, lastLat, lastLng, error, submitOk,
    totalElapsedMs, currentSegmentElapsedMs, currentStop, allSegmentsRecorded,
    stopsDisplay, boardStopName, nearestStopName, detectedStopName, routeStopOptions, manualBoardStop, tick: bumpTick,
    startSession, processGpsUpdate, pauseSession, resumeSession,
    manualLeave, autoLeave, finishSession, reset, recordArrival,
  }
})

// Re-export TimeSegment from upload store for convenience
export type { TimeSegment }
