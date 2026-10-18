<script setup lang="ts">
defineProps<{
  route: string
  dining?: boolean
}>()
</script>

<template>
  <span
    class="route-badge"
    :class="{
      'route-hx1': route === '环线1路' && !dining,
      'route-hx1-dining': route === '环线1路' && dining,
      'route-jb1': route === '接驳1路',
      'route-jb2': route === '接驳2路',
    }"
  >
    {{ dining ? '环1·就餐' : route }}
  </span>
</template>

<style scoped>
.route-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  white-space: nowrap;
}
.route-hx1 { background: var(--color-hx1); }
.route-hx1-dining { background: var(--color-hx1-dining); }
.route-jb1 { background: var(--color-hx2); }  /* 接驳1路沿用绿 */
.route-jb2 { background: var(--color-hx3); }  /* 接驳2路沿用紫 */
</style>
