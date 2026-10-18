# src/utils/ — 纯函数工具

| 文件 | 职责 |
|------|------|
| `time.ts` | `getNow()` 全站统一时间入口（读 global-time store，Pinia 未就绪时回退真实时间） |
| `datetime.ts` | 日期类型判定（weekday/weekend_holiday）、午夜秒数、中文日期格式化 |
| `holidays.ts` | 法定节假日：运行时拉取 NateScarlet/holiday-cn（今年+明年），localStorage 缓存，内置 2026 兜底数据；`getDateLabel()` 节日名>调休工作日>周末>工作日 |
| `countdown.ts` | 倒计时格式化：到站（已到站 ≤15s / 已过站 / x分x秒后到站）、发车（发车中 / 已发车 / x分x秒后发车）；状态分 normal/warning/urgent/arrived/passed；<-300s 返回 passed 供移除 |
| `geo.ts` | Haversine 距离、最近站查找（单个/多个限距）、方位角、点到折线路径最短距离（自动记录离开检测用）；含 `wgs84ToGcj02`（备用，当前无调用） |
| `bus_position.ts` | 公交实时位置推算：按发车时间 + `cumulativeSeconds` 定位当前段，沿 `route_paths.json` 折线按时间比例插值；`findClosestPathIndex` 的 `maxSearch` 限制搜索范围，防环线首尾同站误匹配远端 |
| `map_project.ts` | WGS-84 → Web Mercator（zoom 17）→ 卫星底图像素坐标（`wgs84ToPixel`）；底图参数与 `public/data/satellite-bounds.json` 一致 |
| `supabase.ts` | Supabase 客户端单例（`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` 环境变量） |

## 坐标系约定

全项目统一 **WGS-84**：站点 JSON、路线折线、GPS 定位、卫星底图同口径，**不做任何 GCJ-02 转换**。历史上高德地图时期的 GCJ-02 转换已全部废弃。
