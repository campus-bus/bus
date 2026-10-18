# 数据变更记录

## 2026-10-18 小程序端联调修复

- **云环境 ID 修正**：`campus-bus-d5q9cli...` → `campus-bus-d5g9cli...`（单个字符错误导致云函数全部报 `[100003] Env Not Exists`）
- **天气功能补齐**：新增 `src/composables/useWeather.ts` 与首页头部天气展示；云函数改用 `https` 模块（Node16 无全局 fetch）
- **定位接口修复**：`dist/dev` 产物缺失 `requiredPrivateInfos`（两个 watcher 互相覆盖），清理后重启单个 watcher 解决
- **云函数超时适配**：`weather`/`holidays` 均加入网络时间预算与容器内存缓存，保证 3 秒内返回；数据库集合缺失时静默降级

## 2026-10-18 — 微信小程序版工程建立（uni-app 移植）

**变更类型**：项目结构（新增小程序端，无运行时数据变更）

**背景**：主流量入口迁移至微信小程序；H5 PWA 版继续维护。因 Supabase 域名无法过小程序 ICP 白名单、高德按量收费，小程序端全面采用微信生态。

**架构决策**：uni-app Vue3 + TS；腾讯 `<map>` 组件（免费）替代卫星底图；微信云开发（云数据库+云函数）替代 Supabase；数据 import 打包加载（总包 1.5MB）。

**完成内容**（提交 `f63c159`、`c8a95c6`、`5a51338`）：
- 五个核心页面：首页/行程/地图/记录/关于（逻辑与 H5 同源）
- 数据同步：`scripts/sync_miniprogram_data.js`（`public/data` 压缩同步到 `apps/miniprogram/src/data/`，922KB）
- 云函数：`weather`、`holidays`（待上传部署）
- 云开发配置：AppID `wx9793b294a259ec3a`、云环境 `campus-bus-d5g9cli14141d5144`
- 修复：`project.config.json` 字段名 `srcMiniprogramRoot`→`miniprogramRoot`（模拟器启动失败）

**待办**：云函数上传部署、数据库权限调整（measurements/visits）、类目审核、Supabase 历史数据迁移、提审发布。详见 `CLAUDE.md` 微信小程序版章节。

---

## 2026-10-18 — measurements 历史记录站名映射与段拆分（待执行 SQL）

**变更类型**：数据库历史记录迁移（为接驳环线实测校准做准备）

**背景**：2026-10-18 线路调整后，历史实测记录中部分段已无法复用（门诊部/1号宿舍楼/图书馆不再经停，305→研究生改为绕行走向），且站名仍是旧称（系统楼、旧高超楼、未拆分的军体活动中心）。

**迁移方案**（SQL 文件：`data/backups/measurements_remap_2026-10-18.sql`，需在 Supabase 控制台执行）：
- **站名映射**：系统楼→高超楼、旧高超楼→空天楼、军体活动中心→军体活动中心东（环1/环3）或军体活动中心南（环2）
- **段拆分**：原环2/环3 记录仅保留与新接驳环线（JB2 逆时针）一致的段，route 统一改为「接驳2路」；环1（31 条）/就餐（2 条）记录仅站名映射，route 不变
- **统计**：61 条记录 UPDATE，保留 232 段 / 丢弃 32 段
- **删除**：id 39、44、83（拆分后无任何可用段）
- **备份**：原始全量在 `measurements_before_station_rename_2026-10-17.json`，映射结果预览在 `measurements_remapped_2026-10-18.json`

**305→研究生段特别说明**：旧环2/环3 的 305→研究生为直回走向，新接驳环线此段绕行（0.57km），旧秒数不可比，相关段全部丢弃。

---

## 2026-10-18 — 新发车时刻表（工作日）：环线1路更新 + 接驳1/2路时刻录入

**变更类型**：发车时刻全量更新（用户提供的新官方时刻表）

**变更明细**：
- `departures.json` 全量重建：70 → **132 条**（HX1_NORMAL 62 + HX1_DINING 10 + JB1 35 + JB2 25），recordId 重排 S0001-S0132
- `arrival_predictions.json` 重新生成：866 → **1976 条**

**环线1路（72 趟，含就餐 10 趟）**：第一班 12 趟 / 第二班 17 趟 / 第三班 16 趟 / 第四班（夜1）14 趟 / 第五班（夜2）13 趟
- 就餐专线（HX1_DINING，高超楼发车）：第一班 11:20/11:40/12:00/12:20/12:40 + 第五班 16:30/16:50/17:10/17:30/17:50
- **判定规则**：按「班次+时刻」，其他班次相同时刻不受影响（如第三班 11:20 仍为普通环线1路）
- 旧推测车次（17:10、21:30 待确认）随旧表作废，新表全部为 confirmed

**接驳1路（顺时针，35 趟）**：07:35-22:25 全天运行
**接驳2路（逆时针，25 趟）**：07:45-18:05 全天运行

> 注：接驳车**不区分班次**（用户提供时刻中的换行仅为排版），shiftName 统一为「全天班」，tripSeq 按时间顺序编号（JB1: 1-35，JB2: 1-25）。

**运行日期**：全部线路目前**仅工作日**；周末/节假日时刻表待运营方补充，周末暂无任何车次。

**站间秒数**：JB 段沿用 2026-10-18 复用方案（原环2/环3实测段 + 3 段距离估算），未改动。

---

## 2026-10-18 — 线路调整：环线2路+环线3路合并为接驳环线（接驳1路/接驳2路）

**变更类型**：路线结构重大调整

**变更内容**：
- 原环线2路与环线3路合并为一条接驳环线，双向运行：**接驳2路（JB2_NORMAL，逆时针）**与**接驳1路（JB1_NORMAL，顺时针，由 JB2 反转派生）**
- 新环线站点序列（18 站）：研究生宿舍楼→一食堂→2号宿舍楼→军体活动中心东→网球场→激光所→空天楼→高超楼→理学院→激光所→网球场→军体活动中心东→军体活动中心南→水上训练中心→二食堂→5号宿舍楼→305教学楼→研究生宿舍楼（激光所/网球场/军体东每圈经过两次）
- **站点拆分**：原「军体活动中心」拆分为「军体活动中心东」（原环3/环1 侧）与「军体活动中心南」（原环2 侧）；环线1路的军体站同步更名为「军体活动中心东」（线路走向与秒数不变）
- **站点移除**：门诊部、1号宿舍楼、图书馆不再被任何路线经停（stations 20→18）
- **routeKey 变更**：`HX2_NORMAL`/`HX3_NORMAL`/`HX3_GAOCHAO` 移除，新增 `JB1_NORMAL`/`JB2_NORMAL`

**时刻表（重要）**：
- 原环2（38 条）、环3（54+12 条）共 **104 条发车记录全部移除**，备份于 `data/backups/hx2_hx3_departures_removed_2026-10-18.json`
- **接驳线路新时刻表待运营方确认后录入**；过渡期 `departures.json` 仅剩环线1路（59 条）与就餐专线（11 条），周末/节假日暂无任何车次
- 录入方法：向 `departures.json` 添加 routeKey 为 `JB1_NORMAL`/`JB2_NORMAL` 的记录后运行 `node scripts/regenerate_predictions.js`

**站间秒数（route_params.json）**：
- JB 各段复用原环2/环3实测段（如 研究生→一食堂 76s、激光所→空天楼 105s、军体南→水上 65s）
- 三段为距离估算待实测：理学院→激光所 115s（0.55km）、军体东→军体南 40s（0.18km）、305教学楼→研究生宿舍楼 130s（0.57km 绕行段）
- JB 全程 1018s（约 17 分钟）

**前端**：
- 路线徽标/图例/地图/记录页全部切换为 环线1路（蓝）、就餐专线（橙）、接驳1路（绿）、接驳2路（紫）
- 接驳线路公交图标暂沿用原环线2/3路图标（`public/icons/环线2路.png`/`环线3路.png`），待新图标素材

**其他**：
- `scripts/recalc_segments.py`：旧环2/环3记录自动归入 JB2 统计池，新增接驳1/2路映射
- `scripts/apply_new_params.py` 归档至 `scripts/archive/`（硬编码段键已不适用于新结构）
- 数据库 `measurements` 表历史记录保留原样（route 字段"环线2路/环线3路"为历史事实，recalc 脚本已兼容）

---

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
