import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useScheduleStore } from '@/stores/schedule'
import { getNow } from '@/utils/time'

export interface TimeSegment {
  from: string
  to: string
  seconds: number
}

export interface Measurement {
  _id: string
  user_id: string
  route: string
  date: string
  segments: TimeSegment[]
  created_at: number
}

/** 手动记录上传（云数据库 measurements 集合） */
export const useUploadStore = defineStore('upload', () => {
  const nickname = ref(uni.getStorageSync('bus_nickname') || '')
  const uploading = ref(false)
  const history = ref<Measurement[]>([])
  const loadingHistory = ref(false)

  // 计时状态
  const boardingTime = ref(0)
  const startTime = ref<number | null>(null)
  const recordedSegments = ref<TimeSegment[]>([])
  const currentFromStop = ref('')
  const segmentSeconds = ref<number[]>([])
  const timingActive = ref(false)

  function saveNickname(name: string) {
    nickname.value = name
    uni.setStorageSync('bus_nickname', name)
  }

  const scheduleStore = useScheduleStore()

  function getStopsForRoute(routeKey: string): string[] {
    const rp = scheduleStore.routePatterns.find(p => p.routeKey === routeKey)
    if (!rp) return []
    return rp.stops.map(s => s.currentStop)
  }

  function startRecordingAt(stopName: string) {
    recordedSegments.value = []
    segmentSeconds.value = []
    timingActive.value = true
    currentFromStop.value = stopName
    boardingTime.value = Date.now()
    startTime.value = boardingTime.value
  }

  function recordSegment(toStop: string) {
    if (!startTime.value || !timingActive.value) return
    const elapsed = Math.round((Date.now() - startTime.value) / 1000)
    recordedSegments.value.push({ from: currentFromStop.value, to: toStop, seconds: elapsed })
    segmentSeconds.value.push(elapsed)
    currentFromStop.value = toStop
    startTime.value = Date.now()
  }

  function undoLastSegment() {
    if (recordedSegments.value.length === 0) return
    const last = recordedSegments.value.pop()!
    segmentSeconds.value.pop()
    currentFromStop.value = last.from
    const prevTotal = recordedSegments.value.reduce((sum, s) => sum + s.seconds, 0)
    startTime.value = boardingTime.value + prevTotal * 1000
  }

  function resetRecording() {
    startTime.value = null
    recordedSegments.value = []
    segmentSeconds.value = []
    currentFromStop.value = ''
    timingActive.value = false
  }

  function db() {
    return wx.cloud.database()
  }

  async function submit(route: string): Promise<boolean> {
    if (!nickname.value || recordedSegments.value.length === 0) return false
    uploading.value = true
    try {
      await db().collection('measurements').add({
        data: {
          user_id: nickname.value,
          route,
          date: getNow().toISOString().slice(0, 10),
          segments: recordedSegments.value,
          created_at: Date.now(),
        },
      })
      resetRecording()
      await loadHistory()
      return true
    } catch (e) {
      console.error('上传失败', e)
      return false
    } finally {
      uploading.value = false
    }
  }

  async function loadHistory() {
    if (!nickname.value) return
    loadingHistory.value = true
    try {
      const res = await db().collection('measurements')
        .where({ user_id: nickname.value })
        .orderBy('created_at', 'desc')
        .limit(50)
        .get()
      history.value = res.data as Measurement[]
    } catch (e) {
      console.error('加载历史失败', e)
    } finally {
      loadingHistory.value = false
    }
  }

  async function deleteRecord(id: string) {
    try {
      await db().collection('measurements').doc(id).remove()
      history.value = history.value.filter(r => r._id !== id)
    } catch (e) {
      console.error('删除失败', e)
      uni.showToast({ title: '删除失败', icon: 'none' })
    }
  }

  return {
    nickname, saveNickname,
    uploading, history, loadingHistory,
    startTime, recordedSegments, currentFromStop, segmentSeconds, timingActive,
    startRecordingAt, recordSegment, undoLastSegment, resetRecording,
    submit, loadHistory, deleteRecord,
  }
})
