# src/data — 小程序运行时数据（GCJ-02）

**本目录由 `scripts/sync_miniprogram_data.js` 生成，请勿手改。**

| 项 | 说明 |
|---|---|
| 数据来源 | `public/data/*.json`（WGS-84） |
| 本目录坐标 | **GCJ-02**（同步时由脚本转换） |
| 为什么转 | 微信 `wx.onLocationChange`、腾讯 `<map>`、腾讯 LBS 只认 GCJ-02 |
| 转换实现 | `scripts/lib/coord.js`（与 `src/utils/geo.ts` 的 `wgs84ToGcj02` 算法一致） |
| 含坐标的文件 | `stations.json`、`route_stops.json`、`route_paths.json` |

因此小程序运行期**不需要任何坐标转换**：定位、站点、路线、地图渲染、天气请求全部是 GCJ-02。

## 常见错误

- ❌ 把 `public/data/stations.json` 的坐标直接粘到本目录 → 整体偏移约 670m
- ❌ 手改本目录 JSON → 下次同步被覆盖
- ❌ 新增含坐标的数据文件却忘记加入 `sync_miniprogram_data.js` 的 `COORD_FILES` → 该文件漏转，混用坐标系

正确做法：改 `data/geo/*.txt` 或 `public/data/`，然后重跑

```bash
node scripts/sync_miniprogram_data.js
```
