import { defineStore } from 'pinia'
import { ref } from 'vue'
import { localDateStr } from '@/utils/datetime'

export interface TimeSegment {
  from: string
  to: string
  seconds: number
  /** 起止站的站序（从 1 起）。接驳环线同一站名一圈过两次，只靠站名无法区分 */
  fromSeq?: number
  toSeq?: number
}

export interface Measurement {
  id: string
  route: string
  /** 路线 key（HX1_NORMAL / JB1_NORMAL …）。同一路线名下有普通/就餐等多种模式时必须存 */
  routeKey?: string
  shift: string
  depart_time: string
  date: string
  segments: TimeSegment[]
  created_at: number
}

const STORAGE_KEY = 'measurement_history_v1'
/** 本地只保留最近 200 条，约 60KB，远低于单 key 1MB 上限 */
const MAX_RECORDS = 200

/** 读取本地记录；storage 损坏时返回空数组，避免页面白屏 */
function readAll(): Measurement[] {
  try {
    const raw = uni.getStorageSync(STORAGE_KEY)
    if (!raw) return []
    const list = JSON.parse(raw as string)
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function writeAll(list: Measurement[]) {
  uni.setStorageSync(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_RECORDS)))
}

/**
 * 手动记录（仅开发者在本机使用，不经过任何服务器）
 *
 * 设计说明：乘车记录的唯一用途是校准站间秒数，实际只需要少量高质量样本。
 * 因此不做云端汇总，全部存在本机，避免引入云开发或第三方后端。
 */
export const useUploadStore = defineStore('upload', () => {
  const nickname = ref(uni.getStorageSync('bus_nickname') || '管理员')
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

  /** 当前计时的起点站序（从 1 起），与站名一起记录，避免同名站错位 */
  const currentFromSeq = ref(0)

  function saveNickname(name: string) {
    nickname.value = name
    uni.setStorageSync('bus_nickname', name)
  }

  function startRecordingAt(stopName: string, stopSeq = 0) {
    recordedSegments.value = []
    segmentSeconds.value = []
    timingActive.value = true
    currentFromStop.value = stopName
    currentFromSeq.value = stopSeq
    boardingTime.value = Date.now()
    startTime.value = boardingTime.value
  }

  function recordSegment(toStop: string, toSeq = 0) {
    if (!startTime.value || !timingActive.value) return
    const elapsed = Math.round((Date.now() - startTime.value) / 1000)
    recordedSegments.value.push({
      from: currentFromStop.value, to: toStop, seconds: elapsed,
      fromSeq: currentFromSeq.value, toSeq,
    })
    segmentSeconds.value.push(elapsed)
    currentFromStop.value = toStop
    currentFromSeq.value = toSeq
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
    currentFromSeq.value = 0
    timingActive.value = false
  }

  /** 保存到本机；返回是否成功 */
  function submit(route: string, shift = '', departTime = '', routeKey = ''): boolean {
    if (recordedSegments.value.length === 0) return false
    uploading.value = true
    try {
      const record: Measurement = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        route,
        routeKey,
        shift,
        depart_time: departTime,
        date: localDateStr(),
        segments: [...recordedSegments.value],
        created_at: Date.now(),
      }
      writeAll([record, ...readAll()])
      resetRecording()
      loadHistory()
      return true
    } catch (e) {
      console.error('保存记录失败', e)
      return false
    } finally {
      uploading.value = false
    }
  }

  function loadHistory() {
    loadingHistory.value = true
    try {
      history.value = readAll()
    } finally {
      loadingHistory.value = false
    }
  }

  function deleteRecord(id: string) {
    try {
      writeAll(readAll().filter(r => r.id !== id))
      history.value = history.value.filter(r => r.id !== id)
    } catch (e) {
      console.error('删除记录失败', e)
      uni.showToast({ title: '删除失败', icon: 'none' })
    }
  }

  /**
   * 生成可直接粘贴给管理员做校准的纯文本（每行一段：日期 线路 起点→终点 秒数）
   * 用户量少时比任何云端汇总都实用，也便于人工核对异常值。
   */
  function buildCalibrationText(): string {
    const rows: string[] = []
    for (const rec of readAll()) {
      const d = new Date(rec.created_at)
      const hh = String(d.getHours()).padStart(2, '0')
      const mm = String(d.getMinutes()).padStart(2, '0')
      const routeLabel = rec.routeKey ? `${rec.route}(${rec.routeKey})` : rec.route
      for (const seg of rec.segments) {
        // 站序只在有值时拼上：接驳环线同名站一圈过两次，没有站序无法判断是哪一段
        const from = seg.fromSeq ? `${seg.from}#${seg.fromSeq}` : seg.from
        const to = seg.toSeq ? `${seg.to}#${seg.toSeq}` : seg.to
        rows.push(`${rec.date} ${hh}:${mm} ${routeLabel} ${from}→${to} ${seg.seconds}s`)
      }
    }
    return rows.length ? rows.join('\n') : '暂无记录'
  }

  /** 复制校准文本到剪贴板（无服务器也能交给管理员汇总） */
  function copyCalibrationText() {
    uni.setClipboardData({
      data: buildCalibrationText(),
      success: () => uni.showToast({ title: '已复制，可粘贴发给我', icon: 'none' }),
    })
  }

  return {
    nickname, saveNickname,
    uploading, history, loadingHistory,
    startTime, boardingTime, recordedSegments, currentFromStop, segmentSeconds, timingActive,
    startRecordingAt, recordSegment, undoLastSegment, resetRecording,
    submit, loadHistory, deleteRecord,
    buildCalibrationText, copyCalibrationText,
  }})
