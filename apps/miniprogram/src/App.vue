<script setup lang="ts">
import { onLaunch } from '@dcloudio/uni-app'

// 说明：本项目不从任何服务器拉取数据。
// 时刻表/站点/预测数据在小程序包内（src/data），节假日内置（utils/holidays），
// 天气走腾讯位置服务（可选，未配置 Key 时不展示），乘车记录仅存本机。
onLaunch(() => {
  // 占位：后续如需启动期初始化，在此处补充
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
