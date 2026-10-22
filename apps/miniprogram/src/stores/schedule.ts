import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  Departure,
  RoutePattern,
  Station,
  ArrivalPrediction,
  RouteName,
  DateType,
} from '@/types'

// 数据以 import 方式同步加载（由 scripts/sync_miniprogram_data.js 从 public/data 同步生成）
import departuresJson from '@/data/departures.json'
import routeParamsJson from '@/data/route_params.json'
import stationsJson from '@/data/stations.json'
import predictionsJson from '@/data/arrival_predictions.json'
import routePathsJson from '@/data/route_paths.json'
import routeStopsJson from '@/data/route_stops.json'

type RoutePath = [number, number][] // [[lng, lat], ...]

export const useScheduleStore = defineStore('schedule', () => {
  // 同步初始化（数据打包进小程序，启动即读，无网络请求）
  const departures = ref<Departure[]>(departuresJson as Departure[])
  const routePatterns = ref<RoutePattern[]>(routeParamsJson as RoutePattern[])
  const stations = ref<Station[]>(stationsJson as Station[])
  const predictions = ref<ArrivalPrediction[]>(predictionsJson as ArrivalPrediction[])
  // JSON 中的折线是 number[][]，TS 无法自动收窄成元组，这里显式转换
  const routePaths = ref<Record<string, RoutePath>>(routePathsJson as unknown as Record<string, RoutePath>)
  const routeStops = ref<Record<string, Array<{ name: string; lng: number; lat: number }>>>(
    routeStopsJson as Record<string, Array<{ name: string; lng: number; lat: number }>>
  )

  // ─── 索引 ───
  // 首页 / 地图 / 时间线都要「按 recordId 找班次」「按 departureId 找该班全部预测」。
  // 之前每处都自己 filter + sort 一遍 2038 条预测，现在建一次索引复用。
  const departuresByDateType = computed<Map<DateType, Departure[]>>(() => {
    const m = new Map<DateType, Departure[]>()
    m.set('weekday', [])
    m.set('weekend_holiday', [])
    for (const d of departures.value) m.get(d.dateType)?.push(d)
    return m
  })

  /** recordId → 班次（替代各页面的 departures.find，O(n) → O(1)） */
  const departureById = computed<Map<string, Departure>>(() => {
    const m = new Map<string, Departure>()
    for (const d of departures.value) m.set(d.recordId, d)
    return m
  })

  /** stopName → 该站的全部预测 */
  const predictionsByStop = computed<Map<string, ArrivalPrediction[]>>(() => {
    const m = new Map<string, ArrivalPrediction[]>()
    for (const p of predictions.value) {
      const l = m.get(p.stopName)
      if (l) l.push(p)
      else m.set(p.stopName, [p])
    }
    return m
  })

  /**
   * departureId → 该班次全部预测，**已按 stopSeq 升序**。
   * 时间线、最优乘车组合、经纬度端点都按站点顺序处理，
   * 入索引时排一次，调用方不必重复 sort。
   */
  const predictionsByDeparture = computed<Map<string, ArrivalPrediction[]>>(() => {
    const m = new Map<string, ArrivalPrediction[]>()
    for (const p of predictions.value) {
      const l = m.get(p.departureId)
      if (l) l.push(p)
      else m.set(p.departureId, [p])
    }
    for (const list of m.values()) list.sort((a, b) => a.stopSeq - b.stopSeq)
    return m
  })

  /** routeKey → 路线模式 */
  const patternByKey = computed<Map<string, RoutePattern>>(() => {
    const m = new Map<string, RoutePattern>()
    for (const rp of routePatterns.value) m.set(rp.routeKey, rp)
    return m
  })

  function getDepartures(dateType: DateType, route?: RouteName): Departure[] {
    const all = departuresByDateType.value.get(dateType) || []
    return route ? all.filter((d) => d.route === route) : all
  }

  function getPredictionsForStop(stopName: string, dateType: DateType): ArrivalPrediction[] {
    const all = predictionsByStop.value.get(stopName) || []
    return all.filter((p) => p.dateType === dateType)
  }

  /**
   * 取某班次按站点顺序排列的预测。
   * 返回只读数组：索引里的数组是共享的，调用方不得原地修改。
   */
  function getPredictions(departureId: string): ArrivalPrediction[] {
    return predictionsByDeparture.value.get(departureId) || []
  }

  return {
    departures,
    routePatterns,
    stations,
    predictions,
    routePaths,
    routeStops,
    departureById,
    patternByKey,
    getDepartures,
    getPredictionsForStop,
    getPredictions,
  }
})
