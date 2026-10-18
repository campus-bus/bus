<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useMapStore } from '@/stores/map'
import { useScheduleStore } from '@/stores/schedule'
import { getDateType, getSecondsSinceMidnight } from '@/utils/datetime'
import RouteBadge from '@/components/common/RouteBadge.vue'
import ETAIndicator from '@/components/common/ETAIndicator.vue'
import type { Departure, ArrivalPrediction } from '@/types'

interface ArrivalItem extends ArrivalPrediction {
  departure: Departure | undefined
  secondsUntil: number
}

const mapStore = useMapStore()
const scheduleStore = useScheduleStore()
const dateType = computed(() => getDateType())

// 1 秒滴答：驱动 secondsNow 每秒钟重新计算，实现实时读秒
const nowTick = ref(0)
let tickTimer: ReturnType<typeof setInterval> | null = null
const secondsNow = computed(() => { void nowTick.value; return getSecondsSinceMidnight() })

const arrivals = computed<ArrivalItem[]>(() => {
  if (!mapStore.selectedStop) return []
  const preds = scheduleStore.getPredictionsForStop(
    mapStore.selectedStop,
    dateType.value
  )

  return preds
    .filter(p => !p.isDepartureStop)
    .map((p) => {
      let delta = p.arrivalMinutes * 60 - secondsNow.value
      if (delta < -300) return null   // 过站 5 分钟后移除
      if (delta > 3600) return null

      const departure = scheduleStore.departures.find(
        (d) => d.recordId === p.departureId
      )

      return {
        ...p,
        departure,
        secondsUntil: Math.round(delta),
      }
    })
    .filter((item): item is ArrivalItem => item !== null)
    .sort((a, b) => a.secondsUntil - b.secondsUntil)
    .slice(0, 6)
})

function close() {
  mapStore.selectStop(null)
}

onMounted(() => {
  tickTimer = setInterval(() => { nowTick.value++ }, 1000)
})

onUnmounted(() => {
  if (tickTimer) clearInterval(tickTimer)
})
</script>

<template>
  <transition name="slide-up">
    <!-- 阻止冒泡：面板上快速点击时避免触发地图双击缩放与拖拽 -->
    <div v-if="mapStore.selectedStop" class="stop-panel" @dblclick.stop @pointerdown.stop @touchstart.stop>
      <div class="panel-header">
        <span class="panel-title">{{ mapStore.selectedStop }}</span>
        <van-icon name="cross" @click="close" />
      </div>

      <div class="panel-body">
        <div v-if="arrivals.length === 0" class="empty">
          当前时段无经过此站的班车
        </div>

        <div
          v-for="(item, idx) in arrivals"
          :key="idx"
          class="panel-row"
        >
          <RouteBadge
            :route="(item as any).departure?.route"
            :dining="(item as any).departure?.routeKey === 'HX1_DINING'"
          />
          <div class="panel-info">
            <span class="panel-arrival-time">{{ (item as any).arrivalTime }}</span>
            <ETAIndicator
              :seconds-until="(item as any).secondsUntil"
            />
            <div class="panel-depart-note">
              {{ (item as any).departure?.departureTime }} 发车 ·
              <span :class="(item as any).departure?.departureMinutes * 60 <= secondsNow ? 'departed' : 'not-departed'">
                {{ (item as any).departure?.departureMinutes * 60 <= secondsNow ? '已发车' : '未发车' }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.stop-panel {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 70;
  background: var(--color-card);
  border-radius: 16px 16px 0 0;
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.1);
  max-height: 50vh;
  display: flex;
  flex-direction: column;
}
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid var(--color-border);
}
.panel-title {
  font-size: 17px;
  font-weight: 600;
}
.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 0 16px 20px;
}
.panel-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 0;
  border-bottom: 1px solid #F3F4F6;
}
.panel-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}
.panel-arrival-time {
  font-size: 16px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.panel-depart-note {
  font-size: 11px;
  color: var(--color-text-secondary);
  white-space: nowrap;
}
.panel-depart-note .departed { color: #059669; }
.panel-depart-note .not-departed { color: #DC2626; }

.empty {
  text-align: center;
  padding: 24px;
  color: var(--color-text-secondary);
  font-size: 14px;
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: transform 0.3s ease;
}
.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100%);
}
</style>
