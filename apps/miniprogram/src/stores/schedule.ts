import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  Departure,
  RoutePattern,
  Station,
  ArrivalPrediction,
  RouteName,
  DateType,
  RouteKey,
} from '@/types'

// 数据以 import 方式同步加载（由 scripts/sync_miniprogram_data.js 从 H5 public/data 同步生成）
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
  const routePaths = ref<Record<string, RoutePath>>(routePathsJson as Record<string, RoutePath>)
  const routeStops = ref<Record<string, Array<{ name: string; lng: number; lat: number }>>>(
    routeStopsJson as Record<string, Array<{ name: string; lng: number; lat: number }>>
  )

  // 索引（与 H5 版一致）
  const departuresByDateType = computed<Map<DateType, Departure[]>>(() => {
    const m = new Map<DateType, Departure[]>()
    m.set('weekday', [])
    m.set('weekend_holiday', [])
    for (const d of departures.value) m.get(d.dateType)?.push(d)
    return m
  })

  const predictionsByStop = computed<Map<string, ArrivalPrediction[]>>(() => {
    const m = new Map<string, ArrivalPrediction[]>()
    for (const p of predictions.value) {
      const l = m.get(p.stopName)
      if (l) l.push(p)
      else m.set(p.stopName, [p])
    }
    return m
  })

  const predictionsByDeparture = computed<Map<string, ArrivalPrediction[]>>(() => {
    const m = new Map<string, ArrivalPrediction[]>()
    for (const p of predictions.value) {
      const l = m.get(p.departureId)
      if (l) l.push(p)
      else m.set(p.departureId, [p])
    }
    return m
  })

  const patternByKey = computed<Map<RouteKey, RoutePattern>>(() => {
    const m = new Map<RouteKey, RoutePattern>()
    for (const rp of routePatterns.value) m.set(rp.routeKey, rp)
    return m
  })

  function getDepartures(dateType: DateType, route?: RouteName): Departure[] {
    let result = departuresByDateType.value.get(dateType) || []
    if (route) result = result.filter((d) => d.route === route)
    return result
  }

  function getPredictionsForStop(stopName: string, dateType: DateType): ArrivalPrediction[] {
    const all = predictionsByStop.value.get(stopName) || []
    return all.filter((p) => p.dateType === dateType)
  }

  function getPattern(routeKey: RouteKey): RoutePattern | undefined {
    return patternByKey.value.get(routeKey)
  }

  const isDataLoaded = computed(() => departures.value.length > 0)

  return {
    departures,
    routePatterns,
    stations,
    predictions,
    routePaths,
    routeStops,
    isDataLoaded,
    getDepartures,
    getPredictionsForStop,
    getPattern,
  }
})
