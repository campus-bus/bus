import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

/**
 * 全局时间模拟 Store（与 H5 版一致，调试用）
 */
export const useGlobalTime = defineStore('global-time', () => {
  const simBase = ref<{ real: number; target: number } | null>(null)

  function getNow(): Date {
    if (simBase.value === null) return new Date()
    const elapsed = Date.now() - simBase.value.real
    return new Date(simBase.value.target + elapsed)
  }

  function setSimulated(isoString: string): void {
    simBase.value = { real: Date.now(), target: new Date(isoString).getTime() }
  }

  function setPreset(hour: number, minute: number): void {
    const base = simBase.value ? new Date(simBase.value.target) : new Date()
    base.setHours(hour, minute, 0, 0)
    simBase.value = { real: Date.now(), target: base.getTime() }
  }

  function setDateTime(year: number, month: number, day: number, hour: number, minute: number): void {
    simBase.value = { real: Date.now(), target: new Date(year, month - 1, day, hour, minute).getTime() }
  }

  function reset(): void {
    simBase.value = null
  }

  const isActive = computed(() => simBase.value !== null)

  return { simBase, isActive, getNow, setSimulated, setPreset, setDateTime, reset }
})
