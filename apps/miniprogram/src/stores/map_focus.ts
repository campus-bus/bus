import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * 首页 → 地图页的跨 tab 传参
 *
 * switchTab 不能带 query，而地图是 tabBar 页面，
 * 因此用这个极轻的 store 暂存「要看哪一班车」，由地图页 onShow 时取走。
 */
export interface MapFocusTarget {
  /** 发车记录 id（对应 arrival_predictions.departureId） */
  departureId: string
  /** 路线 key，例如 HX1_NORMAL */
  routeKey: string
}

export const useMapFocusStore = defineStore('mapFocus', () => {
  const pending = ref<MapFocusTarget | null>(null)

  /** 首页点「在地图上查看」时写入 */
  function requestFocus(departureId: string, routeKey: string) {
    pending.value = { departureId, routeKey }
  }

  /** 地图页消费：取出即清空，避免下次进入地图页重复定位 */
  function takeFocus(): MapFocusTarget | null {
    const target = pending.value
    pending.value = null
    return target
  }

  return { pending, requestFocus, takeFocus }
})
