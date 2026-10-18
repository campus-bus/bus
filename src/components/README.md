# src/components/ — 可复用组件

## common/ 通用组件

| 文件 | 职责 |
|------|------|
| `BusStopTimeline.vue` | 车次站点时间线：垂直进度轨 + 公交图标按时间进度移动（每秒 tick），支持高亮上车站（绿）/目的地站（蓝），"在地图上查看"跳转 |
| `RouteBadge.vue` | 线路徽标（环1蓝/就餐橙/环2绿/环3紫） |
| `ETAIndicator.vue` | 倒计时文字（蓝 normal/橙 warning/红 urgent 脉冲/绿 arrived/灰 passed），arrival/departure 两种口径 |
| `OfflineBanner.vue` | 断网顶部横幅 |
| `AutoRecordPanel.vue` | ⚠️ 自动记录面板，UI 已从 UploadView 隐藏，代码保留备用 |

## map/ 地图组件

| 文件 | 职责 |
|------|------|
| `StopInfoPanel.vue` | 点站弹出的底部到站面板：实时读秒（1s tick），仅过滤 isDepartureStop（保留 isReturnStop 回程到站），显示发车状态（已发车绿/未发车红） |
| `MapLegend.vue` | 路线图例：4 条路线显示开关（环1/就餐/接驳1/接驳2）+ 站名标签开关 |

## layout/ 布局组件

| 文件 | 职责 |
|------|------|
| `TabBar.vue` | 底部 4 Tab 导航（首页/行程/地图/记录） |

## dev/ 调试组件（生产默认隐藏）

| 文件 | 职责 |
|------|------|
| `TimeOverride.vue` | 全局时间覆写面板（由 `App.vue` 的 `showDebugTools = false` 控制） |
| `LocationOverride.vue` | 全局定位覆写面板（同上） |

> 调试：将 `App.vue` 中 `showDebugTools` 改为 `true` 即可恢复这两个面板。
