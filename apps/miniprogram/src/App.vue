<script setup lang="ts">
/**
 * 应用入口
 *
 * 本项目不拉取任何服务器数据：时刻表 / 站点 / 预测都打进包内（src/data），
 * 节假日内置（utils/holidays），天气走腾讯位置服务（可选），乘车记录仅存本机。
 * 因此启动期无需任何初始化，不放空的生命周期钩子。
 *
 * 全局样式约定：
 * - 设计令牌定义在 page 上，所有页面/组件共享（--color-*）；
 * - 跨页面复用的基础类（线路徽标 / 倒计时 / 空状态 / 展开更多）也在这里，
 *   页面只写自己专属的样式，不要重复定义。
 */
</script>

<style>
/* ─── 设计令牌 ─── */
page {
  /* 主色与语义色 */
  --color-primary: #1A56DB;
  --color-primary-light: #3B82F6;
  /* 主色浅底：选中态 chip / 提示卡片背景 */
  --color-primary-soft: #EFF6FF;
  --color-info: #2563EB;
  --color-success: #10B981;
  --color-warning: #F59E0B;
  /* 警示浅底与其上的深色文字（周末提示 / 常去标记） */
  --color-warning-soft: #FEF3C7;
  --color-warning-text: #92400E;
  --color-danger: #DC2626;

  /* 线路色（与 constants/routes.ts 的 ROUTE_COLORS 保持一致） */
  --color-route-hx1: #2563EB;
  --color-route-dining: #F59E0B;
  --color-route-jb1: #10B981;
  --color-route-jb2: #8B5CF6;

  /* 中性色 */
  --color-bg: #F3F4F6;
  --color-card: #FFFFFF;
  --color-text: #1F2937;
  --color-text-secondary: #6B7280;
  --color-text-tertiary: #9CA3AF;
  --color-border: #E5E7EB;
  /* 分隔线（比 border 更浅，用于行内分割）与按压态背景 */
  --color-divider: #F3F4F6;
  --color-bg-hover: #F9FAFB;

  background: var(--color-bg);
  color: var(--color-text);
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif;
}

/* ─── 线路徽标（首页卡片 / 行程结果 / 地图面板共用） ─── */
.route-badge {
  flex: 0 0 auto;
  max-width: 220rpx;
  color: #fff; font-size: 22rpx; font-weight: 600;
  padding: 4rpx 14rpx; border-radius: 8rpx;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  box-sizing: border-box;
}

/* ─── 倒计时文案状态色 ─── */
.eta { font-size: 26rpx; color: var(--color-info); white-space: nowrap; }
.eta.warning { color: var(--color-warning); }
.eta.urgent { color: var(--color-danger); font-weight: 600; }
.eta.arrived { color: var(--color-success); font-weight: 600; }
.eta.passed { color: var(--color-text-tertiary); }

/* ─── 就餐专线标记 ─── */
.tag-dining { font-size: 20rpx; color: var(--color-warning); white-space: nowrap; flex-shrink: 0; }

/* ─── 空状态 ─── */
.empty { text-align: center; padding: 48rpx 24rpx; font-size: 26rpx; color: var(--color-text-secondary); }

/* ─── 展开更多 / 收起 ─── */
.show-more {
  display: flex; align-items: center; justify-content: center; gap: 6rpx;
  padding: 16rpx; font-size: 24rpx; color: var(--color-primary);
}
/* ─── 展开箭头（卡片 / 展开更多 共用一张图，靠旋转表达状态） ─── */
.chevron { width: 22rpx; height: 22rpx; flex-shrink: 0; transition: transform 0.2s; }
.chevron.rotated { transform: rotate(180deg); }
</style>
