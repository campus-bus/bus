# src/views/ — 页面组件

7 个页面，均通过 `router/index.ts` 懒加载。底部 4 个 Tab 页（home/schedule/map/upload）被 `<keep-alive>` 保持状态。

| 文件 | 路由 | 职责 |
|------|------|------|
| `HomeView.vue` | `/` | 首页：日期/天气头部、公告栏、站点选择器（按点击频次排序）、GPS 附近 200m 内站点到站车次、目的地多起点搜索、即将发车。三类列表均默认显示 5 条可展开 |
| `ScheduleView.vue` | `/schedule` | Tab1 行程规划（出发/到达/期限查车次）；Tab2 总时刻表（按班次或按发车时间排序切换） |
| `StopQueryView.vue` | `/stop` | 站点查询：搜索站点 → 查看该站到站预测（过滤 isDepartureStop/isReturnStop） |
| `MapView.vue` | `/map` | 地图：双层架构（Layer0 卫星底图 transform、Layer1 overlay 用 CSS `@property`+`calc()` 定位，绕过 Vue 响应式）；rAF 驱动公交位置；切后台暂停动画省电 |
| `UploadView.vue` | `/upload` | Tab1 手动记录（选线路→昵称→上车→逐站计时→提交 Supabase）；Tab2 我的记录（查看/撤销）。自动记录 Tab 已隐藏 |
| `AboutView.vue` | `/about` | 项目介绍、数据说明、反馈问卷链接 |
| `AdminView.vue` | `/admin` | 管理面板（密码 `250030`）：日/周/月/年/总 5 维度活跃用户、柱状/折线图、设备分布、按日期筛选访问日志，每分钟自动刷新 |

## 环线起终点同站的过滤策略（重要）

- HomeView / StopQueryView / useNextBus：同时过滤 `isDepartureStop` 和 `isReturnStop`
- MapView 的 StopInfoPanel：仅过滤 `isDepartureStop`，保留回程到站（用户点站想看所有经过的车）
