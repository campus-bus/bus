# src/stores/ — Pinia 状态（setup 语法）

| 文件 | 职责 |
|------|------|
| `schedule.ts` | **核心数据 store**：fetch 加载 `public/data/` 的 6 个 JSON（departures/route_params/stations/arrival_predictions/route_paths/route_stops），建立 dateType/stopName/routeKey 三个索引；提供 getDepartures/getPredictionsForStop/getPattern/getStopsForRoute |
| `map.ts` | 地图状态：用户位置、公交位置数组、选中站点、可见路线 Set（HX3 两种模式默认全显）、站名标签开关 |
| `upload.ts` | 手动记录：昵称（localStorage 持久化）、段计时状态机（startRecordingAt/recordSegment/undoLastSegment 回退恢复计时起点）、提交/历史/删除（Supabase `measurements` 表） |
| `autoRecord.ts` | ⚠️ 自动记录状态机（idle/active/paused/completed），UI 已隐藏，代码保留备用 |
| `global-time.ts` | 全局时间覆写：simBase 基准 + 实时流逝；`getNow()` 是全站统一时间入口 |
| `global-location.ts` | 全球定位覆写：设置后 useGeolocation 忽略真实 GPS |
| `user.ts` | GPS 开关状态、定位权限拒绝标记、dateTypeOverride（预留） |

## 约定

- 数据只从 `schedule.ts` 读，不要在组件里自行 fetch JSON
- 写操作（上传记录、访客埋点）走 Supabase anon key，RLS 已放行匿名 INSERT/SELECT
