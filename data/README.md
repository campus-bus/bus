# data/ — 数据资料（不入运行时）

项目的源数据与资料归档。运行时数据在 `public/data/`（由脚本从这里的源数据生成）。

## 子目录

| 目录 | 内容 |
|------|------|
| `excel/` | `国防科大校园环线时刻表_秒级可校准版 (1).xlsx` — 时刻表主数据工作簿（16 个工作表，发车时刻的权威来源，勿随意修改原始时刻） |
| `geo/` | 站点经纬度 txt：`站点经纬度信息路径细化.txt`（**活跃**，`scripts/regenerate_from_txt.js` 的输入，WGS-84，站名行 + `>` 前缀的路径中间点）；`站点经纬度信息.txt` 与 `站点经纬度信息路径细化原版.txt`（历史版本，留档） |
| `images/` | 7 张原始资料照片：3 张发车时刻表（环1工作日/环23工作日/环23周末）、环线123路路线图、环线2路/环线3路图、就餐专线路线图——全部发车数据的 OCR 来源 |
| `screenshots/` | 开发过程截图（地图修复验证等），历史留档 |
| `backups/` | 已从线上数据移除的记录备份（如 HX2 周末班次 17 条，2026-07-07 移除），恢复方法见 `CHANGELOG.md` 对应条目 |

## 数据流向

```
data/images（照片）── OCR/人工确认 ──▶ data/excel（主数据）
                                            │
data/geo/路径细化.txt ── regenerate_from_txt.js ──▶ route_stops/paths/stations.json
                                            │
                     extract/手工维护 ──▶ departures.json + route_params.json
                                            │
                     regenerate_predictions.js ──▶ arrival_predictions.json
                                            │
                                        public/data/（运行时）
```
