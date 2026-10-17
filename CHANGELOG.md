# 数据变更记录

## 2026-10-17 — 站名变更：原「高超楼」→「空天楼」，原「系统楼」→「高超楼」

**变更类型**：站名重命名（坐标、路线、发车时刻均不变）

**变更明细**：

| 原名 | 新名 | 说明 |
|------|------|------|
| 高超楼 | 空天楼 | 环线3路激光所之后的独立站点 |
| 系统楼 | 高超楼 | 系统工程学院所在地，就餐专线与环线3路（HX3_GAOCHAO）发车点 |

**影响范围**：
- `public/data/route_params.json`、`departures.json`、`route_stops.json`、`stations.json`：站名字段替换（高超楼×4/2/1 处等）
- `public/data/arrival_predictions.json`：`regenerate_predictions.js` 重新生成（2104 条不变，到站时间不变；旧系统楼 159 条→新高超楼，旧高超楼 66 条→空天楼，已逐条验证）
- `data/geo/站点经纬度信息*.txt`（3 个源文件）与 `scripts/regenerate_from_txt.js` 站名列表同步更新，脚本幂等性保持
- 前端 UI 文案：「系统楼发车」→「高超楼发车」（首页/行程页）；记录页选项「环线3路(系统楼发车)」→「环线3路(高超楼发车)」
- `scripts/recalc_segments.py` 站名修正规则与路线名映射更新（兼容新旧记录，**数据库未更新时重算也不受影响**）；`scripts/apply_new_params.py` 段键同步
- Supabase `measurements` 表：anon key 无 UPDATE 权限（RLS），历史记录改名将通过控制台 SQL 执行（语句见下）；改名前全量 61 条已备份至 `data/backups/measurements_before_station_rename_2026-10-17.json`

**数据库待执行 SQL**（Supabase 控制台 SQL Editor）：

```sql
-- 第一步：高超楼 → 空天楼
UPDATE measurements
SET segments = REPLACE(segments::text, '高超楼', '空天楼')::jsonb
WHERE segments::text LIKE '%高超楼%';
-- 第二步：系统楼 → 高超楼
UPDATE measurements
SET segments = REPLACE(segments::text, '系统楼', '高超楼')::jsonb
WHERE segments::text LIKE '%系统楼%';
-- 验证：应返回 0 行
SELECT id FROM measurements WHERE segments::text LIKE '%系统楼%';
```
- 内部标识不变：`HX3_GAOCHAO` routeKey、`isGaochaoDeparture` 字段名保持不变（改名后语义反而更贴合：现为"高超楼发车"）

**注意**：`data/excel/` 主数据工作簿与 `documentation/校园环线时刻表_制作日志与使用手册.md` 为历史资料，其中站名仍为旧称（系统楼=现高超楼、高超楼=现空天楼），阅读时注意对照。

---

## 2026-10-17 — 项目结构规范化整理（无数据变更）

**变更类型**：仓库整理（不影响运行时数据与功能）

**变更明细**：
- 根目录零散文件归档：7 张原始时刻表/路线图照片 → `data/images/`；Excel 工作簿 → `data/excel/`；3 个站点经纬度 txt → `data/geo/`；3 张开发截图 → `data/screenshots/`；`data_backups/` → `data/backups/`
- 制作日志、路段预估方法文档 → `documentation/`
- 一次性历史脚本（extract_data.py、fix_*.js、add_missing_stations.js）→ `scripts/archive/`
- 代码清理：`src/utils/map_project.ts` 删除无引用的 `gcj02ToPixel`/`gcj02ToWgs84`；`scripts/regenerate_from_txt.js` 移除过时的 GCJ-02 转换（与线上 WGS-84 数据口径对齐）；`satellite-bounds.json` 字段 `gcj02Bounds` → `wgs84Bounds`
- 各文件夹新增 `README.md` 说明职责

**影响范围**：无运行时行为变化；`public/data/*.json` 数据未改动。

---

## 2026-07-22 — 环线1路两趟车次合并至就餐专线

**变更类型**：路线变更

**原因**：环线1路第一班 11:15 和第五班 16:15 合并至就餐专线。

**影响范围**：
- `public/data/departures.json`：S0007 (11:15) 和 S0042 (16:15) 从 HX1_NORMAL 改为 HX1_DINING，发车站改为系统楼
- `public/data/arrival_predictions.json`：重新生成（2112→2104 条）

**变更明细**：

| recordId | 班次 | 时间 | 原路线 | 新路线 |
|----------|------|------|--------|--------|
| S0007 | 第一班 | 11:15 | HX1_NORMAL（研究生宿舍楼发车） | HX1_DINING（系统楼发车） |
| S0042 | 第五班（夜2） | 16:15 | HX1_NORMAL（研究生宿舍楼发车） | HX1_DINING（系统楼发车） |

## 2026-07-20 — 环线1路第三班发车时间调整

**变更类型**：修改

**原因**：环线1路第三班运行时间调整。

**影响范围**：
- `public/data/departures.json`：S0018 11:30→11:20, S0019 11:50→12:00
- `public/data/arrival_predictions.json`：重新生成

**变更明细**：

| recordId | 班次 | 原时间 | 新时间 |
|----------|------|--------|--------|
| S0018 | 第三班 | 11:30 | 11:20 |
| S0019 | 第三班 | 11:50 | 12:00 |

## 2026-07-07 — 环线2路周末/节假日班次移除

**变更类型**：移除（数据保留备份）

**原因**：环线2路自即日起不再于周末和节假日运营，仅工作日运行。

**影响范围**：
- `public/data/departures.json`：移除 17 条 HX2 周末/节假日发车记录（191→174）
- `public/data/arrival_predictions.json`：重新生成，预测记录 2282→2112 条

**移除的记录清单**（共 17 条，备份于 `data/backups/hx2_weekend_departures_removed_2026-07-07.json`）：

| recordId | 班次 | 发车时间 | 驾驶员 | 车号 |
|----------|------|----------|--------|------|
| S0157 | 第一班 | 8:20 | 刘晓燕 | 1号车 |
| S0158 | 第一班 | 8:40 | 刘晓燕 | 1号车 |
| S0159 | 第一班 | 9:00 | 刘晓燕 | 1号车 |
| S0160 | 第一班 | 9:20 | 刘晓燕 | 1号车 |
| S0161 | 第一班 | 9:40 | 刘晓燕 | 1号车 |
| S0162 | 第一班 | 11:30 | 刘晓燕 | 1号车 |
| S0163 | 第一班 | 12:00 | 刘晓燕 | 1号车 |
| S0164 | 第一班 | 12:30 | 刘晓燕 | 1号车 |
| S0165 | 第一班 | 14:30 | 刘晓燕 | 1号车 |
| S0166 | 第一班 | 15:00 | 刘晓燕 | 1号车 |
| S0167 | 第一班 | 17:00 | 刘晓燕 | 1号车 |
| S0168 | 第一班 | 17:30 | 刘晓燕 | 1号车 |
| S0169 | 第一班 | 18:00 | 刘晓燕 | 1号车 |
| S0170 | 第二班 | 20:40 | 孙五星 | 2号车 |
| S0171 | 第二班 | 21:00 | 孙五星 | 2号车 |
| S0172 | 第二班 | 21:25 | 孙五星 | 2号车 |
| S0173 | 第二班 | 21:50 | 孙五星 | 2号车 |

**恢复方法**：将 `data/backups/hx2_weekend_departures_removed_2026-07-07.json` 中的记录合并回 `departures.json`，然后运行 `node scripts/regenerate_predictions.js` 重新生成预测。
