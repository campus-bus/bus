import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { BusPosition } from '@/types'

export const useMapStore = defineStore('map', () => {
  const userLat = ref<number | null>(null)
  const userLng = ref<number | null>(null)
  const userHeading = ref(0)
  const activeBusPositions = ref<BusPosition[]>([])
  const selectedStop = ref<string | null>(null)
  const mapCenter = ref<[number, number]>([112.99, 28.221])
  const mapZoom = ref(15)
  const visibleRoutes = ref<Set<string>>(new Set(['HX1_NORMAL', 'HX1_DINING', 'JB1_NORMAL', 'JB2_NORMAL']))
  const visibleRouteList = computed(() => [...visibleRoutes.value])
  const showLabels = ref(true)

  function setUserLocation(lat: number, lng: number) {
    userLat.value = lat
    userLng.value = lng
  }

  function setBusPositions(positions: BusPosition[]) {
    activeBusPositions.value = positions
  }

  function selectStop(stopName: string | null) {
    selectedStop.value = stopName
  }

  function toggleRoute(routeKey: string) {
    const next = new Set(visibleRoutes.value)
    if (next.has(routeKey)) {
      next.delete(routeKey)
    } else {
      next.add(routeKey)
    }
    visibleRoutes.value = next
  }

  function toggleRouteOnly(routeKey: string) {
    visibleRoutes.value = new Set([routeKey])
  }

  function toggleLabels() {
    showLabels.value = !showLabels.value
  }

  function setAllRoutesVisible() {
    visibleRoutes.value = new Set(['HX1_NORMAL', 'HX1_DINING', 'JB1_NORMAL', 'JB2_NORMAL'])
  }

  function clearAllRoutes() {
    visibleRoutes.value = new Set<string>()
  }

  function recenterOnUser() {
    if (userLat.value !== null && userLng.value !== null) {
      mapCenter.value = [userLng.value, userLat.value]
      mapZoom.value = 16
    }
  }

  return {
    userLat,
    userLng,
    userHeading,
    activeBusPositions,
    selectedStop,
    mapCenter,
    mapZoom,
    visibleRoutes,
    visibleRouteList,
    showLabels,
    setUserLocation,
    setBusPositions,
    selectStop,
    toggleRoute,
    toggleRouteOnly,
    toggleLabels,
    setAllRoutesVisible,
    clearAllRoutes,
    recenterOnUser,
  }
})
