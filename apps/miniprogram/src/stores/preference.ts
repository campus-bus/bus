import { ref } from 'vue'
import { defineStore } from 'pinia'
import { toGroup } from '@/utils/station_group'

/**
 * 用户偏好（站点点击频次）
 *
 * 之前 index.vue 与 schedule.vue 各自读一次 storage、各自解析、各自把
 * 具体站频次聚合成组频次，逻辑重复且容易只改一处。现在统一在此。
 */
const STORAGE_KEY = 'stop_click_freq'

/** 读取点击频次；storage 损坏时回退为空，绝不让首页 setup 抛错白屏 */
function readFromStorage(): Record<string, number> {
  try {
    const raw = uni.getStorageSync(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

/** 具体站频次 → 组频次（军体活动中心东/南 合并计入「军体活动中心」） */
function aggregateByGroup(freq: Record<string, number>): Record<string, number> {
  const agg: Record<string, number> = {}
  for (const [stop, n] of Object.entries(freq)) {
    const g = toGroup(stop)
    agg[g] = (agg[g] || 0) + n
  }
  return agg
}

const initialFreq = readFromStorage()

/**
 * 排序快照：应用启动时冻结。
 *
 * 站点按钮按使用频次排序，但若点一次就实时重排，用户的手指会「追不到」按钮
 * （H5 时期踩过的问题）。因此本次会话内顺序固定，下次启动才反映新偏好。
 */
const stopOrder = aggregateByGroup(initialFreq)

export const usePreferenceStore = defineStore('preference', () => {
  /** 实时频次（只增不改，供记录使用） */
  const clickFreq = ref<Record<string, number>>(initialFreq)

  /** 记录一次站点点击并持久化 */
  function recordStopClick(name: string) {
    clickFreq.value[name] = (clickFreq.value[name] || 0) + 1
    uni.setStorageSync(STORAGE_KEY, JSON.stringify(clickFreq.value))
  }

  return { clickFreq, stopOrder, recordStopClick }
})
