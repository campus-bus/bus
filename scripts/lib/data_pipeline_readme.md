# 数据生成链路（仓库根目录，不在小程序包内）

这个目录是从仓库根拷进来的**上游数据脚本**，不属于小程序运行代码，`apps/miniprogram` 构建时完全不需要它。
放进来只是为了回答「内置 `src/data/*.json` 是怎么来的、以后怎么改」。

## 目录对应关系

| 压缩包里 | 仓库里的真实路径 | 作用 |
|---|---|---|
| `_upstream_data/scripts/sync_miniprogram_data.js` | `scripts/sync_miniprogram_data.js` | 把 `public/data/*.json`（WGS-84）压缩 + 转成 GCJ-02，写入 `apps/miniprogram/src/data/` |
| `_upstream_data/scripts/lib/coord.js` | `scripts/lib/coord.js` | WGS-84 → GCJ-02 转换实现，启动时自检偏移量 |
| `_upstream_data/scripts/regenerate_predictions.js` | `scripts/regenerate_predictions.js` | 按 `route_params.json` 重新生成 `arrival_predictions.json` |
| `_upstream_data/scripts/test_scenarios.cjs` | `scripts/test_scenarios.cjs` | 数据层回归断言（节假日、环线首尾同站、最优上下车组合等） |
| `_upstream_data/public/data/*.json` | `public/data/*.json` | 源数据（**WGS-84**，供 H5 卫星地图使用） |

## 坐标系（最容易踩的坑）

- `public/data/*.json` = **WGS-84**（H5 版卫星底图、浏览器 GPS 都是 WGS-84）
- `apps/miniprogram/src/data/*.json` = **GCJ-02**（微信定位、腾讯地图同源）

转换只发生在 `sync_miniprogram_data.js` 里，运行时两端都**零转换**。
把 WGS-84 数据直接手工粘进小程序目录、或反过来，长沙地区会产生约 **670m** 的固定偏移
（实测 18 个站点里 14 个会被误判到别的站）。

## 改数据的正确流程

```bash
# 1. 改 public/data/ 下的源 JSON（发车时刻、站点、路径）
# 2. 如果改了站间秒数或发车时刻，重新生成预测
node scripts/regenerate_predictions.js
# 3. 同步到小程序（压缩 + 坐标转换）
node scripts/sync_miniprogram_data.js
# 4. 数据回归
node scripts/test_scenarios.cjs
```

**不要手改 `apps/miniprogram/src/data/*.json`**：它是生成产物，下一次同步会被覆盖，
而且手改时很容易忘掉坐标转换。
