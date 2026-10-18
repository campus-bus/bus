<script setup lang="ts">
import { onLaunch } from '@dcloudio/uni-app'
import { initHolidays } from '@/utils/holidays'

// 云开发环境 ID（微信云开发控制台获取）
const CLOUD_ENV = 'campus-bus-d5q9cli14141d5144'

onLaunch(() => {
  // 初始化云开发
  if (wx.cloud) {
    wx.cloud.init({ env: CLOUD_ENV, traceUser: true })
  } else {
    console.error('当前微信版本过低，请升级微信（云开发不可用）')
  }
  // 初始化节假日数据（云函数 + 缓存 + 兜底）
  initHolidays()
})
</script>

<style>
/* 全局样式变量（与 H5 版一致的设计语言） */
page {
  --color-primary: #1A56DB;
  --color-primary-light: #3B82F6;
  --color-hx1: #2563EB;
  --color-hx1-dining: #F59E0B;
  --color-jb1: #10B981;
  --color-jb2: #8B5CF6;
  --color-bg: #F3F4F6;
  --color-card: #FFFFFF;
  --color-text: #1F2937;
  --color-text-secondary: #6B7280;
  --color-border: #E5E7EB;

  background: var(--color-bg);
  color: var(--color-text);
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif;
}
</style>
