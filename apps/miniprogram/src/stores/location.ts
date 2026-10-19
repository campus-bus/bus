import { defineStore } from 'pinia'
import { ref } from 'vue'

/** 用户位置状态（GCJ-02，与小程序站点数据、腾讯地图同源） */
export const useLocationStore = defineStore('location', () => {
  const userLat = ref<number | null>(null)
  const userLng = ref<number | null>(null)
  const permissionDenied = ref(false)

  function setUserLocation(lat: number, lng: number) {
    userLat.value = lat
    userLng.value = lng
    permissionDenied.value = false
  }

  function setPermissionDenied(denied: boolean) {
    permissionDenied.value = denied
  }

  return { userLat, userLng, permissionDenied, setUserLocation, setPermissionDenied }
})
