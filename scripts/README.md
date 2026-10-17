# scripts/ — 数据处理脚本

Node.js / Python 离线工具，操作 `public/data/*.json`。**运行前先备份相关 JSON。**

## 活跃脚本

| 脚本 | 用途 | 用法 |
|------|------|------|
| `regenerate_predictions.js` | 按 `route_params.json`（站间秒数）+ `departures.json`（发车时刻）重新生成 `arrival_predictions.json` | `node scripts/regenerate_predictions.js` |
| `recalc_segments.py` | 从 Supabase 拉全部实测记录，按《路段运行时间预估方法》重新计算各段秒数（只打印结果，不写文件） | `python scripts/recalc_segments.py` |
| `apply_new_params.py` | 将重估后的段秒数写回 `route_params.json`（随后须运行 regenerate_predictions.js） | `python scripts/apply_new_params.py` |
| `regenerate_from_txt.js` | 从 `data/geo/站点经纬度信息路径细化.txt` 重新生成 `route_stops.json`/`route_paths.json`/`stations.json` | `node scripts/regenerate_from_txt.js` |
| `download_satellite.mjs` | 从 ESRI 下载卫星瓦片拼接底图，生成 `public/data/campus-satellite.jpg` + `satellite-bounds.json`（内部把锚点 GCJ-02 转 WGS-84 下瓦片，属正常用途） | `node scripts/download_satellite.mjs` |

## 坐标口径（重要）

- txt 源文件与 `public/data/*.json` 全部 **WGS-84**，`regenerate_from_txt.js` 直接存储不转换
- 2026-10-17 前该脚本曾错误地执行 WGS-84→GCJ-02 转换，已修复；若发现坐标整体偏移约数百米，检查是否误用了旧版脚本

## regenerate_from_txt.js 的安全保证（2026-10-17 验证）

- **幂等**：在当前数据上重复运行，三个输出文件与线上数据 100% 一致
- **HX3_GAOCHAO 派生内置**：txt 无 GAOCHAO 独立坐标，脚本自动按 GAOCHAO 站序从 HX3_NORMAL 同名站取坐标派生（已验证与线上一致）
- **stations.json 坐标保留**：同名站在不同路线坐标略有差异，线上 stations.json 为人工校准值；脚本检测到已有 stations.json 时保留其坐标，仅更新 serviceRoutes 与新增站点（日志会打印保留明细）

## 数据变更标准流程

1. 改 `departures.json`（发车时刻）或 `route_params.json`（段秒数）
2. `node scripts/regenerate_predictions.js`
3. 在 `CHANGELOG.md` 记录变更
4. `npm run deploy` + commit + push

## archive/ — 一次性历史脚本

`extract_data.py`、`fix_*.js`、`add_missing_stations.js`：初始数据提取与一次性修复脚本，任务已完成，**仅供历史参考，勿直接运行**。详见 `archive/README.md`。
