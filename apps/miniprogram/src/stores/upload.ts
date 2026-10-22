import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { localDateStr } from '@/utils/datetime'
import { calibrationRows, type MeasurementSlice } from '@/utils/measurement'

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

  /**
   * 当前计时的上车站索引（0 起，-1 表示尚未上车）
   *
   * 必须放在 store 而不是页面里：记录页是 navigateTo 打开的普通页，
   * 按返回键就销毁。以前这个索引只存在页面自己的 ref 中，重新进入时归 -1，
   * 而 store 里的段数据还在 → 页面看不到计时进度、也看不到提交入口，
   * 再点一次「上车」还会把已采集的段清空（真实采样十几分钟全部作废）。
   */
  const boardIdx = ref(-1)
  /** 本次计时所属的线路名（记录页线路选择也是页面级 ref，重进会丢，一起存这里） */
  const recordingRoute = ref('')
  /** 是否正在计时：由 boardIdx 派生，保证两者不可能不一致 */
  const timingActive = computed(() => boardIdx.value >= 0)

  /** 当前计时的起点站序（从 1 起），与站名一起记录，避免同名站错位 */
  const currentFromSeq = ref(0)

  function saveNickname(name: string) {
    nickname.value = name
    uni.setStorageSync('bus_nickname', name)
  }

  function startRecordingAt(stopName: string, stopSeq = 0, route = '') {
    recordedSegments.value = []
    segmentSeconds.value = []
    boardIdx.value = stopSeq > 0 ? stopSeq - 1 : -1
    recordingRoute.value = route
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
    // 站序必须一起回退：只还原站名会让下一段带上被撤销那段的终点站序，
    // 同名站（军体东/网球场/激光所）一圈过两次时，记录的 fromSeq 会指向错误位置
    currentFromSeq.value = last.fromSeq ?? 0
    const prevTotal = recordedSegments.value.reduce((sum, s) => sum + s.seconds, 0)
    startTime.value = boardingTime.value + prevTotal * 1000
  }

  function resetRecording() {
    startTime.value = null
    recordedSegments.value = []
    segmentSeconds.value = []
    currentFromStop.value = ''
    currentFromSeq.value = 0
    boardIdx.value = -1
    recordingRoute.value = ''
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
   * 生成可直接粘贴给管理员做校准的纯文本（每行一段：日期 上车时刻 线路 起点→终点 秒数）
   *
   * 时刻必须用**上车时刻**而不是提交时刻：10:00 上车、10:15 提交的记录
   * 若输出 10:15，回溯班次时会对应到错误的那一趟。格式化逻辑在 utils/measurement.ts
   * （纯函数，可被 Node 直接测试）。
   */
  function buildCalibrationText(): string {
    const rows = calibrationRows(readAll() as MeasurementSlice[])
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
    startTime, boardingTime, recordedSegments, currentFromStop, currentFromSeq, segmentSeconds,
    boardIdx, recordingRoute, timingActive,
    startRecordingAt, recordSegment, undoLastSegment, resetRecording,
    submit, loadHistory, deleteRecord,
    buildCalibrationText, copyCalibrationText,
  }})
