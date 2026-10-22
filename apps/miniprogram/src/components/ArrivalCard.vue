<script setup lang="ts">
/**
 * 车次卡片（首页三处列表共用）
 *
 * 改动前：附近站 / 目的地 / 即将发车 各写了一段几乎逐字相同的卡片结构。
 * 这里把外壳收进组件——左侧色条、线路徽标、就餐标记、展开箭头，
 * 右侧默认是「大号时间 + 倒计时」，多起点方案通过 ride 属性切换成四行信息。
 *
 * 为什么右侧不用插槽：小程序端对「带 v-if 的具名插槽」会静态声明 slot 列表，
 * 组件无法可靠判断父级这次到底传没传该插槽，默认内容可能整块不渲染。
 * 改成普通对象属性后，判断就是普通 JS 布尔值，跨端行为一致。
 */
import { computed } from 'vue'
import { routeColorOf, routeLabelOf } from '@/constants/routes'
import { etaClassOf } from '@/utils/countdown'
import type { Departure, RideInfo } from '@/types'

const props = withDefaults(defineProps<{
  departure: Departure
  expanded: boolean
  /** 右侧大号时间（到达时间或发车时间） */
  time?: string
  /** 倒计时文案 */
  label?: string
  /** 倒计时状态，决定文案颜色 */
  status?: string
  /** 给了就渲染乘车方案，替代「时间 + 倒计时」 */
  ride?: RideInfo | null
}>(), {
  time: '',
  label: '',
  status: '',
  ride: null,
})

defineEmits<{ toggle: [] }>()

const color = computed(() => routeColorOf(props.departure.routeKey))
const routeLabel = computed(() => routeLabelOf(props.departure))
</script>

<template>
  <view
    class="bus-card"
    :class="{ expanded }"
    :style="{ borderLeftColor: color }"
  >
    <view class="bus-card-main" @tap="$emit('toggle')">
      <view class="card-left">
        <view class="route-badge" :style="{ background: color }">{{ routeLabel }}</view>
        <text v-if="departure.isGaochaoDeparture" class="tag-dining">高超楼发车</text>
      </view>

      <view class="card-right">
        <template v-if="ride">
          <text class="boarding" :class="{ warn: ride.walkWarning }">
            {{ ride.walkLabel }}到「{{ ride.candidateStop }}」
          </text>
          <text class="board-time">于{{ ride.boardTime }}{{ ride.isOriginDeparture ? '发车' : '到站' }}</text>
          <text :class="etaClassOf(ride.boardStatus)">{{ ride.boardLabel }}</text>
          <text class="dest-info">预计 {{ ride.destTime }} 到「{{ ride.destStop }}」</text>
        </template>
        <template v-else>
          <text class="arrival-time">{{ time }}</text>
          <text :class="etaClassOf(status)">{{ label }}</text>
        </template>
      </view>

      <image
        class="chevron" :class="{ rotated: expanded }"
        src="/static/icons/ui/chevron-down.png" mode="aspectFit"
      />
    </view>
    <slot v-if="expanded" name="detail" />
  </view>
</template>

<style scoped>
.bus-card {
  background: var(--color-card); border-radius: 14rpx; margin-bottom: 12rpx; overflow: hidden;
  border-left: 6rpx solid transparent;
}
.bus-card.expanded { box-shadow: 0 4rpx 18rpx rgba(0, 0, 0, 0.08); }
.bus-card-main {
  display: flex; justify-content: space-between; align-items: center;
  padding: 20rpx 24rpx; gap: 12rpx;
}
.bus-card-main:active { background: var(--color-bg-hover); }
.card-left { display: flex; align-items: center; gap: 12rpx; flex: 1; min-width: 0; }
.card-right { display: flex; flex-direction: column; align-items: flex-end; gap: 2rpx; flex-shrink: 0; }

.arrival-time {
  font-size: 36rpx; font-weight: 700; color: var(--color-primary);
  font-variant-numeric: tabular-nums; white-space: nowrap;
}

/* 多起点方案：四行信息都比较长，统一右对齐并允许省略 */
.boarding { font-size: 22rpx; color: var(--color-success); max-width: 420rpx; }
.boarding.warn { color: var(--color-warning); }
.board-time { font-size: 22rpx; color: var(--color-text-secondary); }
.dest-info { font-size: 22rpx; color: var(--color-text-secondary); }
</style>
