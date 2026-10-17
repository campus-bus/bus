# public/data/ — 运行时数据

应用启动时由 `src/stores/schedule.ts` 加载的 JSON 数据文件 + 卫星底图。

## JSON 数据

| 文件 | 内容 | 生成方式 |
|------|------|----------|
| `departures.json` | 174 条发车记录（recordId/route/shiftName/departureTime/departureMinutes/routeKey/isGaochaoDeparture/driver/vehicleNo/confidence） | 手工维护（依据 Excel 主数据） |
| `route_params.json` | 5 条路线模式的站点序列与站间秒数（finalSegmentSeconds/cumulativeSeconds/distanceKm） | 实测校准：`recalc_segments.py` → `apply_new_params.py` |
| `arrival_predictions.json` | 2104 条预计算到站预测（departureId+stopSeq 唯一） | **脚本生成**：`node scripts/regenerate_predictions.js`，勿手改 |
| `route_stops.json` | 各路线站点坐标（同名站点在不同路线可有不同坐标） | **脚本生成**：`node scripts/regenerate_from_txt.js` |
| `route_paths.json` | 各路线折线坐标 `[lng, lat][]`（地图绘制 + 公交插值 + 离开检测） | 同上 |
| `stations.json` | 20 个站点字典（取首现坐标，serviceRoutes 仅展示用） | 同上 |
| `satellite-bounds.json` | 卫星底图元数据（topLeftTile 106688,54795 / zoom 17 / 2816×2816 / wgs84Bounds） | **脚本生成**：`download_satellite.mjs` |

## 卫星底图

| 文件 | 说明 |
|------|------|
| `campus-satellite.jpg` | ESRI World Imagery 瓦片拼接，2816×2816px ~1.6MB，zoom 17，WGS-84 |

## 坐标系

全部为 **WGS-84**，与 GPS、卫星底图同口径，无 GCJ-02 转换。

## 修改规则

1. 发车时刻变更 → 改 `departures.json` → 跑 `regenerate_predictions.js` → 记 `CHANGELOG.md`
2. 站间秒数校准 → `recalc_segments.py` 看结果 → `apply_new_params.py` 写入 → 跑 `regenerate_predictions.js`
3. 站点/路径坐标变更 → 改 `data/geo/站点经纬度信息路径细化.txt` → 跑 `regenerate_from_txt.js`
4. 以上任何变更后：`npm run deploy` + commit + push
