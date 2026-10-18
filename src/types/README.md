# src/types/ — TypeScript 类型定义

`index.ts` 单文件集中定义全部类型，与 `public/data/*.json` 的结构一一对应。

## 核心类型

| 类型 | 对应数据 | 关键字段 |
|------|----------|----------|
| `DateType` | — | `'weekday' \| 'weekend_holiday'` |
| `RouteKey` | — | 4 种路线模式：`HX1_NORMAL`/`HX1_DINING`/`JB1_NORMAL`（接驳1路·顺时针）/`JB2_NORMAL`（接驳2路·逆时针） |
| `Departure` | departures.json | recordId, departureTime, departureMinutes, routeKey, isGaochaoDeparture, confidence |
| `RouteStop` / `RoutePattern` | route_params.json | finalSegmentSeconds, cumulativeSeconds, isDepartureStop, isReturnStop |
| `Station` | stations.json | name, lat, lng（WGS-84） |
| `ArrivalPrediction` | arrival_predictions.json | departureId+stopSeq 唯一，arrivalMinutes/arrivalTime，isDepartureStop/isReturnStop |
| `BusPosition` | 运行时计算 | lat/lng/heading/progress（`utils/bus_position.ts` 生成） |

## 修改注意

- 改 JSON 结构必须同步改这里；改这里必须检查 `scripts/regenerate_predictions.js` 的输出字段
- `arrivalMinutes` 是**含小数的分钟**（秒级精度/60），显示用 `arrivalTime`（hh:mm:ss），计算用 `arrivalMinutes * 60` 转秒
