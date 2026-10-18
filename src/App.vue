<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useScheduleStore } from '@/stores/schedule'
import { useOnlineStatus } from '@/composables/useOnlineStatus'
import { initHolidays } from '@/utils/holidays'
import TabBar from '@/components/layout/TabBar.vue'
import OfflineBanner from '@/components/common/OfflineBanner.vue'
import TimeOverride from '@/components/dev/TimeOverride.vue'
import LocationOverride from '@/components/dev/LocationOverride.vue'

import { useInstallPrompt } from '@/composables/useInstallPrompt'
import { useVisitorTracking } from '@/composables/useVisitorTracking'

const route = useRoute()
const scheduleStore = useScheduleStore()
const { isOnline } = useOnlineStatus()
const { showPrompt, isIOS, dismiss, dismissForever } = useInstallPrompt()
useVisitorTracking()

// 调试工具开关：true 显示时间/位置模拟面板，false 隐藏
const showDebugTools = false

const showTabBar = computed(() => {
  const tabRoutes = ['home', 'schedule', 'stop', 'upload', 'map']
  return tabRoutes.includes((route.meta.tab as string) || '')
})

onMounted(() => {
  scheduleStore.loadData()
  initHolidays()
})
</script>

<template>
  <OfflineBanner v-if="!isOnline" />
  <div class="app-container">
    <router-view v-slot="{ Component }">
      <transition name="fade" mode="out-in">
        <keep-alive :include="['HomeView', 'MapView', 'ScheduleView', 'StopQueryView', 'UploadView']">
          <component :is="Component" />
        </keep-alive>
      </transition>
    </router-view>
  </div>
  <TabBar v-if="showTabBar" />
  <TimeOverride v-if="showDebugTools" />
  <LocationOverride v-if="showDebugTools" />

  <!-- PWA 添加到桌面提示 -->
  <van-dialog
    v-model:show="showPrompt"
    title="添加到桌面"
    :show-cancel-button="true"
    cancel-button-text="不再提示"
    confirm-button-text="知道了"
    @confirm="dismiss"
    @cancel="dismissForever"
  >
    <div style="padding: 8px 16px 16px; font-size: 14px; line-height: 1.8; color: #374151;">
      <template v-if="isIOS">
        点击底部 <strong>分享按钮</strong> → <strong>添加到主屏幕</strong>，即可像 App 一样使用环线坐车。
      </template>
      <template v-else>
        在浏览器菜单中选择<strong>「添加到主屏幕」</strong>，即可像 App 一样使用环线坐车。
      </template>
    </div>
  </van-dialog>
</template>

<style>
:root {
  --color-primary: #1A56DB;
  --color-primary-light: #3B82F6;
  --color-hx1: #2563EB;
  --color-hx1-dining: #F59E0B;
  --color-hx2: #10B981;
  --color-hx3: #8B5CF6;
  --color-bg: #F3F4F6;
  --color-card: #FFFFFF;
  --color-text: #1F2937;
  --color-text-secondary: #6B7280;
  --color-border: #E5E7EB;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body {
  height: 100%;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  background: var(--color-bg);
  color: var(--color-text);
  -webkit-font-smoothing: antialiased;
}

#app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.app-container {
  flex: 1;
  padding-bottom: 60px;
  overflow-y: auto;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
