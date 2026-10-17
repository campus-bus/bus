# scripts/archive/ — 一次性历史脚本（勿直接运行）

这些脚本完成了各自的一次性任务后归档，**仅供历史参考**。直接运行可能因路径变更、坐标口径废弃（GCJ-02→WGS-84）而产生错误结果。

| 脚本 | 历史作用 |
|------|----------|
| `extract_data.py` | 项目初期从 Excel 主数据工作簿提取生成 `departures.json`/`route_params.json`/`stations.json`/`arrival_predictions.json`（含已废弃的 WGS-84→GCJ-02 转换） |
| `fix_route_paths.js` | 修复 route_paths.json 折线坐标，使起终点与站点坐标一致 |
| `fix_route_stops.js` | 统一各路线同名站点坐标 |
| `fix_route_params.js` | 修正 route_params.json 站名与序列（高超楼→系统楼等） |
| `add_missing_stations.js` | 向 stations.json 补充系统楼、网球场两个站点 |

## 如需重新执行类似操作

- 重新生成预测：`node scripts/regenerate_predictions.js`
- 重新生成站点/路径：`node scripts/regenerate_from_txt.js`（已修正坐标口径）
- 修改站名/时刻：直接编辑对应 JSON + `regenerate_predictions.js`，并在 `CHANGELOG.md` 记录
