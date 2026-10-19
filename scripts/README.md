# scripts/ — 数据处理脚本

Node.js / Python 离线工具，操作 `public/data/*.json`。**运行前先备份相关 JSON。**

## 活跃脚本

| 脚本 | 用途 | 用法 |
|------|------|------|
| `regenerate_predictions.js` | 按 `route_params.json`（站间秒数）+ `departures.json`（发车时刻）重新生成 `arrival_predictions.json` | `node scripts/regenerate_predictions.js` |
| `recalc_segments.py` | 从 Supabase 拉全部实测记录，按《路段运行时间预估方法》重新计算各段秒数（只打印结果，不写文件；旧环2/环3记录自动归入 JB2 统计池） | `python scripts/recalc_segments.py` |
| `regenerate_from_txt.js` | 从 `data/geo/站点经纬度信息路径细化.txt` 重新生成 `route_stops.json`/`route_paths.json`/`stations.json`（JB1 由 JB2 反转自动派生） | `node scripts/regenerate_from_txt.js` |
| `download_satellite.mjs` | 从 ESRI 下载卫星瓦片拼接底图，生成 `public/data/campus-satellite.jpg` + `satellite-bounds.json`（内部把锚点 GCJ-02 转 WGS-84 下瓦片，属正常用途） | `node scripts/download_satellite.mjs` |
| `test_scenarios.cjs` | **回归测试**：复刻 findBestRide 等核心逻辑，对真实数据断言 24 个关键场景（同名站多次经过、站点分组、行程规划、时间逻辑等）。每次数据变更后必跑 | `node scripts/test_scenarios.cjs` |
| `sync_miniprogram_data.js` | 将 `public/data/*.json` 压缩同步到 `apps/miniprogram/src/data/`（小程序端 import 加载），**并把 `stations`/`route_stops`/`route_paths` 的经纬度 WGS-84→GCJ-02**。数据变更后运行 | `node scripts/sync_miniprogram_data.js` |
| `lib/coord.js` | 构建期坐标转换：`wgs84ToGcj02()` + `selfCheck()`（偏移量不在 550-800m 直接抛错）。算法与 `src/utils/geo.ts` 一致，改动需同步 | 被同步脚本引用 |

## 坐标口径（重要）

- txt 源文件与 `public/data/*.json` 全部 **WGS-84**，`regenerate_from_txt.js` 直接存储不转换 → 供 H5（ESRI 卫星底图 + 浏览器 GPS）使用
- **`apps/miniprogram/src/data/*.json` 是 GCJ-02**：由 `sync_miniprogram_data.js` 在同步时转换，小程序运行期零转换（腾讯 `<map>`、微信定位、腾讯 LBS 同源）
- 2026-10-17 前 `regenerate_from_txt.js` 曾错误地执行 WGS-84→GCJ-02 转换，已修复；若发现坐标整体偏移约 670m，先查数据文件属于哪个坐标系
- 新增含坐标的数据文件必须加进 `sync_miniprogram_data.js` 的 `COORD_FILES`，否则漏转

## regenerate_from_txt.js 的安全保证

- **幂等**：在当前数据上重复运行，输出文件与线上数据保持一致（2026-10-17 验证 100% 一致）
- **JB1 反转派生内置**：txt 只需提供接驳2路（逆时针）坐标，接驳1路（顺时针）由脚本自动反转派生
- **stations.json 坐标保留**：同名站在不同路线坐标略有差异，线上 stations.json 为人工校准值；脚本检测到已有 stations.json 时保留其坐标，仅更新 serviceRoutes 与新增站点（日志会打印保留明细）

## 站间秒数校准流程（2026-10-18 起）

1. `python scripts/recalc_segments.py` 查看实测重估结果
2. 手动编辑 `public/data/route_params.json` 对应段的 `finalSegmentSeconds` 与 `cumulativeSeconds`、`totalSeconds`
3. `node scripts/regenerate_predictions.js`
4. 记 `CHANGELOG.md` 后 deploy

## 数据变更标准流程

1. 改 `departures.json`（发车时刻）或 `route_params.json`（段秒数）
2. `node scripts/regenerate_predictions.js`
3. 在 `CHANGELOG.md` 记录变更
4. `npm run deploy` + commit + push

## archive/ — 一次性历史脚本

`extract_data.py`、`fix_*.js`、`add_missing_stations.js`：初始数据提取与一次性修复脚本，任务已完成，**仅供历史参考，勿直接运行**。详见 `archive/README.md`。
