# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

校园环线坐车 —— 为校园师生提供校园环线公交车（环线1路、就餐专线、接驳1路、接驳2路）的发车时刻查询、到站时间预测、地图可视化、行程规划和乘车记录服务。

**双端形态（2026-10-18 起）**：
- **H5 PWA 版**（`src/`）：https://campus-bus.github.io/bus/ ，主仓 `campus-bus/bus`，GitHub Pages 部署
- **微信小程序版**（`apps/miniprogram/`）：uni-app Vue3 重构，腾讯 map 组件 + 微信云开发，**开发中（待发布）**

> **🔒 PWA 冻结规则（2026-10-19 起，强制）**：H5 PWA 版正在线上服役，**`src/`、`public/`、`docs/`、`vite.config.ts`、`index.html` 一律不得改动**（含注释、格式、文案）。PWA 只作为对照参照。所有新功能与修复**只改 `apps/miniprogram/`**。若某改动必须触及 `public/data/`（例如发车时刻/站点数据本身变化），需先向用户确认；坐标转换等平台差异一律在 `scripts/sync_miniprogram_data.js` 里解决，不回头改 PWA。
>
> **⚠️ 双端 `utils/` 同步约定已于 2026-10-22 解除**：PWA 进入退役流程、小程序为唯一在维护的产品，`apps/miniprogram/src/utils/` 现为**权威版本**，不再要求与 `src/utils/` 字节一致。已发生的有意分歧：小程序端 `geo.ts` 删除了运行期不再使用的坐标转换与路径距离函数（H5 自动记录专用），`time.ts` 不再依赖调试用的时间覆写 store，`countdown.ts` 新增 `etaClassOf()`。**再往小程序 `utils/` 里照搬 H5 代码前，先确认它是否只服务于 H5 的已废弃功能。**

> **2026-10-18 线路调整**：原环线2路与环线3路合并为一条接驳环线，双向运行——**接驳2路（逆时针）**与**接驳1路（顺时针，同一物理环反向）**；军体活动中心拆分为东侧/南侧两站；门诊部、1号宿舍楼、图书馆不再经停。环线1路与就餐专线不变。工作日时刻表已同步更新（132 条：环1 62 + 就餐 10 + 接驳1路 35 + 接驳2路 25）；**周末/节假日时刻表待补充，目前周末无任何车次**。旧环2/环3共 104 条班次已移除，备份于 `data/backups/hx2_hx3_departures_removed_2026-10-18.json`。

## 技术栈

- **框架**：Vue 3 + TypeScript + Vite
- **状态管理**：Pinia（setup 语法）
- **UI 组件**：Vant 4（van-tabs, van-radio-group, van-button 等）
- **地图**：静态卫星底图（ESRI World Imagery 瓦片拼接，JPEG ~6MB）+ SVG 路线/站点叠加层，零 API 调用
- **数据库**：Supabase（measurements 表，存储用户乘车记录）
- **部署**：GitHub Pages（`docs/` 目录），`npm run deploy` → commit → push master。直接推 master 即可（无需 dev-time-sim 分支）
- **线上地址**：https://campus-bus.github.io/bus/ （2026-10-17 起；仓库托管于 campus-bus 组织，旧地址 liusizheng.github.io/loop-ride-assistant 已失效）

## 项目目录结构

```
环线坐车小程序/
├── src/                    # 前端源码（views/stores/composables/utils/components/types/router）
├── public/                 # 运行时静态资源（data/*.json 数据、icons/ 公交图标）
├── scripts/                # 活跃数据脚本（预测重生成、路段重估、卫星图下载）
│   └── archive/            # 一次性历史脚本（仅供参考，勿运行）
├── data/                   # 数据资料（不入运行时）
│   ├── excel/              # 时刻表主数据工作簿
│   ├── geo/                # 站点经纬度 txt（regenerate_from_txt.js 输入）
│   ├── images/             # 原始时刻表/路线图照片
│   ├── screenshots/        # 开发过程截图
│   └── backups/            # 已移除数据的备份
├── documentation/          # 开发文档（制作日志、路段预估方法）
├── docs/                   # GitHub Pages 部署产物（npm run deploy 生成，勿手改）
├── dist/                   # vite build 产物（已 gitignore）
├── CLAUDE.md               # 本文件：AI 开发指南
├── README.md               # 项目说明
└── CHANGELOG.md            # 数据变更记录
```

各文件夹内均有 `README.md` 说明本文件夹职责，新接手的 Agent 可逐级阅读。

## 关键代码文件速查

| 文件 | 职责 |
|------|------|
| `src/views/HomeView.vue` | 首页：附近站列表、目的地搜索、即将发车、折叠展开 |
| `src/views/MapView.vue` | 地图：CSS calc 定位的 overlay 图层架构 |
| `src/views/UploadView.vue` | 手动记录 + 历史记录（自动记录 Tab 已隐藏） |
| `src/views/AdminView.vue` | 管理面板：用户统计图表 |
| `src/components/map/StopInfoPanel.vue` | 地图点站弹出的到站面板（实时读秒） |
| `src/components/common/BusStopTimeline.vue` | 车次站点时间线下拉组件 |
| `src/composables/useNextBus.ts` | 首页到站车次计算逻辑 |
| `src/composables/useGeolocation.ts` | GPS 定位（精度过滤 500m） |
| `src/composables/useVisitorTracking.ts` | 匿名访问埋点（每设备每天一次） |
| `src/utils/bus_position.ts` | 公交实时位置推算 + 路径匹配（maxSearch 防绕回） || `src/utils/countdown.ts` | 倒计时格式化（已到站/已过站/xx分xx秒） |
| `src/types/index.ts` | 全部 TypeScript 类型定义 |
| `vite.config.ts` | Vite 配置（含 basicSsl 插件） |
- **PWA**：vite-plugin-pwa，workbox generateSW 模式
- **坐标系**：**H5 全程 WGS-84**（卫星瓦片、站点数据、浏览器 GPS 均为 WGS-84，零转换）；**小程序全程 GCJ-02**（`public/data` 在 `sync_miniprogram_data.js` 同步时转成 GCJ-02 写入 `apps/miniprogram/src/data/`，运行期零转换）。两套数据来源同一份 WGS-84，严禁跨端粘贴坐标

## 已实现的功能

### 首页（HomeView）
- GPS 定位后默认展示附近 200m 内所有站点（最多 3 个）的到站车次分组列表
- **不会自动选中最近站点**（移除了 `nearestStop` watcher 的自动选择），用户手动点选站点后切换为目的地模式
- 站点选择器：按使用频次排序（`sortOrder` 仅在刷新时从 localStorage 加载，避免点击后实时跳位），支持搜索
- 默认收起显示前 5 个站点，点"更多"展开
- 每个附近站点/目的地/即将发车列表默认显示前 5 趟车次，超过可点"展开更多"
- 多起点搜索：选目的地后从最近 3 个站点搜索可乘线路，含步行时间
- 车次卡片可展开查看完整站点时间线（BusStopTimeline），**"即将发车"横条也支持展开**
- 首页公告栏：`线络试运行…如方便可在记录页手动记录到站时间`，右侧显示蓝色「详情 ›」可点击查看完整说明
- 首页容器宽度：max-width 640px（原 480px）
- 调试工具（时间覆写/定位覆写）默认隐藏（`showDebugTools = false`）

### 行程规划（ScheduleView）
- Tab 1：输入出发站、到达站、到达期限，查询可乘车次
- Tab 2：总时刻表，按线路/班次展示所有发车记录

### 地图（MapView）— 架构已重大重构
- **图层分离架构**：
  - **Layer 0（map-layer）**：仅含卫星底图 `<img>`，CSS `transform: translate + scale` 驱动
  - **Layer 1（overlay-layer）**：SVG 路线、站点圆点、公交图标、用户蓝点、站点标签全部在此层
    - 定位方式：CSS 自定义属性 `--x`/`--y` + `calc(var(--x) * var(--scale) * 1px + var(--panX) * 1px)` 
    - `--scale`/`--panX`/`--panY` 由 `watchEffect` 直接写入 DOM（仅 3 次 `setProperty`），完全绕过 Vue 响应式
    - 所有元素固定像素大小，不随缩放变化，永不模糊
  - **CSS `@property`** 注册 `--scale`/`--panX`/`--panY` 为 `<number>` 类型，确保 `calc()` 正确计算
- **SVG 路线**：`vector-effect="non-scaling-stroke"` + 固定 `stroke-width="3.5"`，线宽永远清晰
- **公交位置计算**：`computeActiveBusPositions()` 基于发车时间和 `cumulativeSeconds` 插值，`requestAnimationFrame` 驱动
- **环线首尾同站路径匹配修复**：`findClosestPathIndex()` 新增 `maxSearch` 参数，限制搜索范围为路径前半段，防止首发站误匹配到路径远端的同名回程站
- 点击站点弹出 StopInfoPanel，**实时读秒倒计时**（`nowTick` + `setInterval` 1秒），显示发车时间 + 发车状态（已发车绿/未发车红）
- **环线起终点同站特殊处理**：地图上点站时保留 `isReturnStop`（回程到站正常显示），但首页过滤 `isReturnStop`（避免与"即将发车"重复）
- 定位按钮 + 回中按钮
- **桌面定位修复**：精度过滤从 50m 放宽到 500m（桌面 Wi-Fi 定位精度 100-400m），vite 配置 `@vitejs/plugin-basic-ssl` 支持 HTTPS（非 localhost 需要 HTTPS 才能用 Geolocation API）

### 记录上传（UploadView）
- Tab 1 手动记录：选线路、输入昵称、选上车站、逐站按计时按钮记录段耗时
  - 线路选项：环1、环2、环3、**环3系统发**（HX3_GAOCHAO）、就餐
- Tab 2 我的记录：查看/撤销历史记录
- **自动记录 Tab 已隐藏**（前端 UI 移除，代码保留）

### 关于页（AboutView）
- 项目介绍、数据说明、使用提示、注意事项

## 数据源

核心数据文件：
- `data/excel/校园环线时刻表_秒级可校准版.xlsx` — 最终数据工作簿，包含 16 个工作表
- `public/data/` — 小程序运行时读取的 JSON 数据文件

### public/data/ JSON 文件

| 文件 | 用途 |
|---|---|
| `departures.json` | 所有发车记录（每条含 recordId, route, routeKey, departureTime, departureStation, isGaochaoDeparture, driver, vehicleNo 等） |
| `arrival_predictions.json` | 预计算的到站预测（每条含 departureId, stopName, stopSeq, arrivalTime, arrivalMinutes, isDepartureStop, isReturnStop 等） |
| `route_params.json` | 各路线站间秒数配置（含 finalSegmentSeconds, cumulativeSeconds, distanceKm）。**已移除 baseSegmentSeconds/manualSegmentSeconds 字段**，finalSegmentSeconds 为最终采用值 |
| `route_stops.json` | 各路线站点坐标（含 lat, lng） |
| `stations.json` | 所有站点字典（含 name, lat, lng, serviceRoutes） |
| `route_paths.json` | 各路线折线坐标（用于地图绘制和离开检测） |
| `satellite-bounds.json` | 卫星底图元数据（topLeftTile, zoom, tileSize, imageWidth, imageHeight, wgs84Bounds） |
| `campus-satellite.jpg` | 卫星底图 JPEG（2816×2816px，~1.5MB，ESRI 瓦片拼接） |

### 卫星底图工具

| 文件 | 用途 |
|---|---|
| `scripts/download_satellite.mjs` | 从 ESRI 下载卫星瓦片并拼接（锚点：北门北3km + 305教学楼南3km + 理学院西2km + 东门东2km） |
| `src/utils/map_project.ts` | WGS-84 → 底图像素坐标投影（用于 SVG 叠加层定位） |

### 静态卫星地图架构

**替代高德 API 的原因**：高德地图 JS API 按调用次数收费，校园范围固定不需要动态瓦片，改用 ESRI World Imagery 免费瓦片拼接静态图，实现零 API 调用。

**架构**：
```
MapView.vue
├── 图层容器 (CSS transform: translate + scale)
│   ├── <img> 卫星底图 (JPEG, 2816×2816px, ~1.5MB)
│   ├── <svg> 路线折线 (polyline, 4条路线)
│   ├── <div> 站点标记 (HTML div + CSS 定位, 20个站点)
│   ├── <div> 公交车标记 (img + 旋转 + 班次角标)
│   └── <div> 用户位置标记 (蓝点)
├── MapLegend (路线图例 + 标签开关)
└── StopInfoPanel (站点详情面板)
```

**卫星底图参数**：
- 尺寸：2816 × 2816 px（正方形，zoom 17，11×11 瓦片拼接）
- 边距：南北 600m，东西 800m
- 瓦片参数：topLeftTile {x:106688, y:54795}，zoom 17，tileSize 256
- 压缩：JPEG quality 75，约 1.5MB
- PWA 缓存上限：`maximumFileSizeToCacheInBytes: 10MB`

**坐标投影（map_project.ts）**：
1. WGS-84 → Web Mercator 瓦片坐标（zoom 17）
2. 减去图片左上角瓦片偏移 → 底图像素坐标
- 导出：`wgs84ToPixel(lng, lat)`
- 站点/路线/GPS 数据均为 WGS-84，卫星底图同为 WGS-84，全程无坐标转换

**交互行为**：
- 拖拽：pointer events 实现单指拖拽
- 双指缩放：以双指中心为基准（不是图片左上角），通过调整 panX/panY 保持中心点固定
- 滚轮缩放：以鼠标光标位置为中心
- 双击缩放：以点击位置为中心
- 动态最小缩放：`MIN_SCALE = Math.max(viewportW/IMG_W, viewportH/IMG_H)`，图片至少占满屏幕
- 最大缩放：4 倍
- 边界限制：`clampPan()` 函数防止显示黑色区域
- 站点和路线固定视觉大小：不随地图缩放变化
- 回中按钮：点击恢复显示整个校园

**定位功能**：使用浏览器原生 `navigator.geolocation`，**不调用任何第三方 API**。GPS 返回 WGS-84，与 `public/data` 站点数据、ESRI 卫星底图同系，直接经 `wgs84ToPixel()` 投影，**无需任何坐标转换**。

**已废弃/删除的文件**：
- `src/utils/amap.ts` — 高德 SDK 加载器（已删除）
- `src/utils/geo.ts` 中 `gcj02ToPixel` 等地图投影用 GCJ-02 函数 — 已删除（H5 全程 WGS-84）；仅保留 `wgs84ToGcj02`/`gcj02ToWgs84` 作为双向转换工具函数，当前运行期无调用（小程序端改由 `scripts/lib/coord.js` 在构建期转换）
- `src/utils/map_project.ts` 中 `gcj02ToPixel`/`gcj02ToWgs84` — 已删除（2026-10-17 清理，无任何调用）
- `src/components/common/AutoRecordPanel.vue` — UI 已隐藏（`UploadView.vue` 中不再引用）
- `scripts/extract_data.py`、`scripts/fix_*.js`、`scripts/add_missing_stations.js` — 一次性历史脚本，已移至 `scripts/archive/`（2026-10-17）

### Excel 中关键工作表

| 工作表 | 用途 |
|---|---|
| `结构化数据` | 发车时刻主数据，每行一条发车记录 |
| `秒级路线参数_可调整` | 各路线站间运行秒数配置，支持实测后手动校准 |
| `预测到站明细_秒级` | 每班车每站预计到站时间（hh:mm:ss） |
| `站点字典` | 所有站点汇总 |
| `小程序数据口径` | 路线站点序列和偏移 |
| `实测记录模板` | 实测记录模板，用于后续校准站间秒数 |

## 核心业务规则

### 线路与日期
- **环线1路**：仅工作日运行，周末/节假日不运行
- **接驳1路/接驳2路**：仅工作日运行（2026-10-18 时刻表已录入）；周末/节假日时刻表待补充

### 4 条路线模式（routeKey）
| routeKey | 路线 | 发车点 | 站点序列 |
|---|---|---|---|
| HX1_NORMAL | 环线1路普通 | 研究生宿舍楼 | 研究生宿舍楼→东门→2号宿舍楼→军体活动中心东→网球场→激光所→超算中心→北门→高超楼→理学院→二食堂→5号宿舍楼→305教学楼→研究生宿舍楼 |
| HX1_DINING | 就餐专线 | 高超楼 | 高超楼→理学院→二食堂→一食堂→305教学楼→5号宿舍楼→二食堂北→理学院→高超楼 |
| JB1_NORMAL | 接驳1路（顺时针） | 研究生宿舍楼 | 研究生宿舍楼→305教学楼→5号宿舍楼→二食堂→水上训练中心→军体活动中心南→军体活动中心东→网球场→激光所→理学院→高超楼→空天楼→激光所→网球场→军体活动中心东→2号宿舍楼→一食堂→研究生宿舍楼 |
| JB2_NORMAL | 接驳2路（逆时针） | 研究生宿舍楼 | 研究生宿舍楼→一食堂→2号宿舍楼→军体活动中心东→网球场→激光所→空天楼→高超楼→理学院→激光所→网球场→军体活动中心东→军体活动中心南→水上训练中心→二食堂→5号宿舍楼→305教学楼→研究生宿舍楼 |

**接驳环线特点**：
- JB1 与 JB2 为同一物理环的两个方向，JB1 数据由 JB2 反转自动派生（`regenerate_from_txt.js`）
- 激光所、网球场、军体活动中心东在一圈中出现**两次**（去程+回程），同一班次的预测记录中同名站会有两条不同 stopSeq 的记录，属正常现象
- **上下车点选择（重要）**：行程规划与首页目的地推荐必须通过 `utils/station_group.ts` 的 `findBestRide()` 枚举 上车站×下车站 全部位置组合并取乘坐时间最短者，禁止 `findIndex` 取首次出现（会把用户带去绕大圈的去程车）
- **站点分组**：军体活动中心={东,南}、二食堂={二食堂,二食堂北}（`STATION_GROUPS`）。行程规划与首页目的地选择器只显示组名，系统按目的地自动匹配最优具体站并告知用户；手动记录与地图点站仍按具体物理站
- 原环线2路/环线3路（含 HX3_GAOCHAO）已于 2026-10-18 移除，routeKey 不再存在

### 发车站点口径
- 图片中红色字体和打钩车次 = 系统工程学院发车 = **高超楼发车**
- 普通车次发车站为 **研究生宿舍楼**
- 高超楼和空天楼是两个相邻但不同的站点，高超楼是系统工程学院所在地
- **2026-10-17 站名变更**：原「高超楼」→「空天楼」，原「系统楼」→「高超楼」，坐标与路线不变

### 环线1路打钩车次 = 就餐专线
- 环线1路中标注【系统】的车次不走普通环线1路，而是走**就餐专线**
- 就餐专线时间：11:30–12:30，16:30–18:00
- 涉及车次：11:15、11:30、11:50、12:10、12:30、16:15、16:30、16:50、17:10、17:30、17:50
- 注：11:15（第一班 S0007）和 16:15（夜2 S0042）于 2026-07-22 合并至就餐专线，见 `CHANGELOG.md`

### 推测数据（需标注"待确认"）
- 接驳1路/接驳2路周末/节假日时刻表（待补充）；工作日接驳时刻为用户提供的确认数据
- 所有预测到站时间均为估算，实测校准前应展示为"预计到达"

## 数据可信度

- **确认数据**：图片中清楚的发车时间、用户明确修正的驾驶员姓名和日期类型
- **实测数据**：33 条用户乘车记录（Supabase measurements 表），覆盖环线1路/2路/3路全部路段及就餐专线前半段
- **推测数据**：接驳线路全部发车时刻（待录入）、所有预测到站时间、所有站间运行秒数（JB 各段复用原环2/环3实测段，理学院→激光所 115s、军体东→军体南 40s、305教学楼→研究生宿舍楼 130s 三段为距离估算待实测）
- **原则**：不随意修改原始发车时刻，除非用户提供新的确认数据
- **路段预估方法**：详见 `documentation/路段运行时间预估方法.md` — 公交/接驳车分开统计，N≥5去头尾均值，N≤4直接均值，N=0参照查找
- **预估版本**：v2.0（2026-07-07，基于 33 条实测重新计算全部路线）

## 数据模型

### 前端 Store 结构

- `scheduleStore`：加载 JSON 数据，提供 departures, predictions, stations, routePatterns, routeStops, routePaths
- `mapStore`：地图状态，visibleRoutes(Set), showLabels, userLat/userLng, busPositions, selectedStop
- `uploadStore`：手动记录上传，nickname, recordedSegments, segmentSeconds, history, submit/undo/deleteRecord
- `autoRecordStore`：自动记录状态机（代码保留，UI 已隐藏）

### 关键类型（src/types/index.ts）

- `Departure`：发车记录（recordId, route, routeKey, departureTime, departureMinutes, isGaochaoDeparture 等）
- `ArrivalPrediction`：到站预测（departureId, stopName, stopSeq, arrivalMinutes, arrivalTime, isDepartureStop, isReturnStop 等）
- `RoutePattern`：路线模式（routeKey, stops: RouteStop[]）
- `Station`：站点（name, lat, lng）
- `BusPosition`：公交车实时位置（departureId, lat, lng, heading, progress 等）

### Supabase 表结构

`measurements` 表：id, user_id(昵称), route, shift, depart_time, date, segments(JSON: [{from, to, seconds}]), created_at

`visits` 表：id, visitor_id(TEXT), visited_at(DATE), device_type(TEXT), created_at(TIMESTAMPTZ)
- 匿名访问统计，每设备每天仅记录一次（localStorage UUID 去重）
- device_type: 'ios' | 'android' | 'desktop'（通过 UA + touch 检测）
- RLS 策略：anon 可 INSERT/SELECT，无需登录

### 管理面板（AdminView）
- 访问路径：`/#/admin`，密码 `250030`（localStorage 持久记住）
- 5 维度卡片：今日/近7天/近30天/近1年/历史总用户
- 点击卡片切换对应图表（日→24小时、周→7天、月→30天、年→12个月、总→全部历史月）
- 柱状图/折线图切换，带纵轴刻度和水平网格线
- 设备分布：iOS / Android / 桌面端占比条形图
- 访问日志表格：最近 200 条（日期/时间/设备ID/设备类型/累计次数）
- 每分钟自动刷新

### 数据库记录修正历史（2026-06-23）
对 Supabase `measurements` 表 21 条有效记录执行了集中修正：
- **站名修正**：环线1路/就餐专线 "高超楼"→"系统楼"（7条）、环线3路 "教勤连"→"网球场"（4条）
- **首发站修正**：环线3路 GAOCHAO 记录 "高超楼→理学院"→"系统楼→理学院"（2条）
- **时间拆分**：环线3路 "激光所→高超楼" 按预估时间比 **105:28（79%:21%）** 拆为两段（4条）
- **垃圾删除**：2 条段耗时异常记录（1~4s）已删除

## 环线起终点同站的特殊处理

所有 5 条路线都是环线（起点=终点），同一 departureId 会有两条预测记录：`isDepartureStop`(stopSeq=1) 和 `isReturnStop`(stopSeq=N)。

**差异化处理（重要）：**
- **首页（HomeView）**：同时过滤 `isDepartureStop` 和 `isReturnStop`。用户身在起终点站时，`isReturnStop` 的回程到站和"即将发车"重复，且用户不能上车——需等下一班发车。
- **地图（StopInfoPanel）**：仅过滤 `isDepartureStop`，保留 `isReturnStop`。用户点站点只想看哪些车会经过，回程到站也是有效信息。
- **useNextBus（首页附近车次列表）**：过滤两者，避免同一班车在"附近到站"中出现两次。
- 行程规划搜索时 destIdx 必须从 originIdx 之后搜索
- 多起点搜索用 `seenDepartureIds` Set 去重

## 查询下一班车逻辑

1. 根据日期判断日期类型（工作日 / 周末节假日），结合国务院法定节假日和调休
2. 筛选对应日期类型可运行的线路
3. 从预测到站表中找当前站点在当前时间之后的到站记录
4. 按预计到站时间排序，返回最近若干班车
5. 注意：环线1路周末/节假日过滤；就餐专线仅展示就餐专线站点

## 已过班车移除窗口

- 已通过/已发车的班次在列表中保留 **5 分钟**（`secondsAway < -300`）后移除
- 涉及文件：`src/composables/useNextBus.ts`、`src/utils/countdown.ts`、`src/views/HomeView.vue`
- 之前为 1 分钟（-60），改为 5 分钟以避免用户看到班车突然消失

## 自动记录功能

### 到站检测
- GPS 距离目标站 ≤30m，持续 ≥3秒 → 记录到站
- 1秒 tick 定时器检查（不仅依赖 GPS 更新事件）

### 离开检测
- `computeMinDistanceToPath()` 计算 GPS 点到路线折线的最短距离
- 距离 >50m 持续 ≥10秒 → 自动结束记录

### 错站恢复
- 切后台期间可能跳过站点，GPS 恢复后检测是否在后续某站 30m 内
- 跳过中间站，桥接段不记录（skipNextArrival）
- 排除终点站（stops.length-2），避免环线首尾同站误触发

### 其他
- `navigator.wakeLock` 保持屏幕常亮
- `visibilitychange` 事件：切后台释放 wakeLock，切回前台重新获取
- 不暂停会话，GPS 恢复后继续检测

## 部署流程

```bash
npm run deploy    # vite build → dist/，然后复制 dist/ → docs/
git add -A
git commit -m "deploy: ..."
git push          # 直接推 master，GitHub Pages 自动部署
```

注意：`npm run build` 只输出到 `dist/`，GitHub Pages 读取的是 `docs/`，必须用 `npm run deploy`。

## PWA 缓存注意事项

- **iOS PWA 缓存顽固**：service worker 缓存的旧版本不会自动更新，用户需要手动删除 PWA（长按图标 → 移除 App）再重新添加主屏幕
- **satellite image 更新后必须清缓存**：因为卫星底图是单个大文件（~1.5MB），workbox 会缓存它，更新后需要用户清除
- 当前 `registerType: 'autoUpdate'`，理论上新 service worker 会自动激活，但 iOS PWA 行为不一致
- workbox `globPatterns` 包含 `jpg`/`jpeg` 以缓存卫星底图
- `maximumFileSizeToCacheInBytes: 10MB` 以容纳 1.5MB 的卫星 JPEG

## 实测校准建议

用户实际乘车时可记录每站到站时间，计算站间实际秒数，填入 Excel 的 `秒级路线参数_可调整` 的"手动采用秒"列。自动记录功能已实现 GPS 自动采集段耗时并上传至 Supabase，可用于后续校准。

**路段预估方法已标准化**，详见 `documentation/路段运行时间预估方法.md`。该文档记录了：
- 公交/接驳车分开统计的车型分类规则
- N≥5去头尾取均值 / N≤4直接均值 的算法
- 跨路线、跨车型的参照优先级
- 就餐专线 ×1.44 倍率计算方法
- HX3 激光所→高超楼 按距离比拆分的逻辑
- HX2 平均速度推算未测段的逻辑
- 后续有新实测数据后的更新流程

后续更新预估时，直接按该文档执行即可。

## 数据来源历史

### 图片识别过程

项目数据来源于 3 张时刻表图片的 OCR 识别和人工确认：

1. **第一张图**：环线1路工作日发车时刻表
   - 识别出 5 个班次（第一班到第五班夜2）
   - 手写打钩的车次 = 系统工程学院发车
   - 后续修正：第四班括号是"夜1"不是"校1"，第五班是"夜2"不是"校2"

2. **第二张图**：工作日环线2路、环线3路发车时刻表
   - 环线2路：2 个班次，19+19 趟车
   - 环线3路：4 个班次，含驾驶员和车号信息
   - 红字车次 = 系统工程学院发车

3. **第三张图**：周末/节假日环线2路、环线3路发车时刻表
   - 环线2路：2 个班次（第一班 13 趟，第二班 4 趟）
   - 环线3路：2 个班次，含驾驶员和车号

### 驾驶员信息（已确认）

| 线路 | 班次 | 驾驶员 | 车号 |
|------|------|--------|------|
| 环线2路（工作日） | 第一班 | 刘晓燕 | 1号车 |
| 环线2路（工作日） | 第二班 | 孙五星 | 2号车 |
| 环线3路（工作日） | 第一班 | 刘虎 | 3号车 |
| 环线3路（工作日） | 第二班 | 郭海燕 | 5号车 |
| 环线3路（工作日） | 第三班 | 刘晓燕 | 4号车 |
| 环线3路（工作日） | 第四班 | 孙五星 | 3号车 |
| 环线3路（周末） | 第一班 | 孙五星 | 3号车 |
| 环线3路（周末） | 第二班 | 夏文新 | 4号车 |

**注意**：驾驶员姓名经过人工修正（刘旭→刘虎，谭海燕→郭海燕，夏文斌→夏文新）

## 完整发车时刻表

### 环线1路（仅工作日）

> **2026-10-18 新时刻表**（用户提供）：就餐车次按「班次+时刻」判定——第一班 11:20/11:40/12:00/12:20/12:40 与第五班 16:30/16:50/17:10/17:30/17:50 走就餐专线（高超楼发车）；**其他班次出现相同时刻不受影响**（如第三班 11:20 仍为普通环线1路）。

| 班次 | 发车时间 |
|------|----------|
| 第一班 | 07:30, 08:00, 08:30, 09:00, 09:30, 10:00, 10:40, **11:20【系统】, 11:40【系统】, 12:00【系统】, 12:20【系统】, 12:40【系统】** |
| 第二班 | 07:40, 08:10, 08:40, 09:10, 09:40, 10:20, 11:00, 11:40, 12:20, 14:00, 14:30, 15:00, 15:30, 16:10, 16:40, 17:20, 18:00 |
| 第三班 | 07:50, 08:20, 08:50, 09:20, 09:50, 10:30, 11:20, 12:00, 12:40, 14:20, 14:50, 15:20, 16:00, 16:30, 17:10, 17:40 |
| 第四班（夜1） | 14:10, 14:40, 15:10, 15:40, 16:20, 17:00, 17:30, 18:20, 19:00, 19:40, 20:20, 21:00, 21:40, 22:10 |
| 第五班（夜2） | 15:50, **16:30【系统】, 16:50【系统】, 17:10【系统】, 17:30【系统】, 17:50【系统】**, 18:40, 19:20, 20:00, 20:40, 21:20, 21:50, 22:30 |

【系统】= 高超楼发车，走就餐专线

### 接驳1路（顺时针，仅工作日，不区分班次）

07:35, 07:55, 08:15, 08:35, 08:55, 09:15, 09:35, 10:05, 10:35, 10:55, 11:15, 11:35, 11:55, 12:15, 12:25, 12:35, 14:15, 14:35, 14:55, 15:25, 15:45, 16:15, 16:35, 16:55, 17:15, 17:35, 17:55, 18:35, 19:05, 19:35, 20:05, 20:35, 21:05, 21:35, 22:25（共 35 趟，shiftName 统一为「全天班」）

### 接驳2路（逆时针，仅工作日，不区分班次）

07:45, 08:05, 08:25, 08:45, 09:05, 09:25, 09:45, 10:15, 10:45, 11:05, 11:25, 11:45, 12:05, 14:05, 14:25, 14:45, 15:15, 15:35, 16:05, 16:25, 16:45, 17:05, 17:25, 17:45, 18:05（共 25 趟，shiftName 统一为「全天班」）

> 周末/节假日时刻表待运营方补充（2026-10-18 起周末暂无任何车次）。原环2/环3历史时刻表见 `data/backups/hx2_hx3_departures_removed_2026-10-18.json`。

## 距离和限速信息

用户提供的关键距离信息：
- 东门到北门：约 1.9 公里
- 理学院到二食堂：约 1 公里
- 305教学楼→图书馆→2号宿舍楼→军体活动中心→水上训练中心→二食堂→5号宿舍楼→305教学楼：约 2 公里
- **校园限速：约 25 km/h**

站间秒数基于这些距离信息和限速估算，后续可通过实测校准。

## 数据库表结构设计建议

### routes（线路表）
- route_id, route_name, description, is_loop, default_start_station, status

### stations（站点表）
- station_id, station_name, alias, remark, lat, lng
- 注意：高超楼可设置 alias "系统工程学院旁"

### route_patterns（路线模式表）
- pattern_id, route_id, pattern_name, date_type, start_station, description
- 示例：R1_NORMAL, R1_MEAL, R2_NORMAL, R3_NORMAL, R3_GAOCHAO

### route_pattern_stops（路线站点顺序表）
- pattern_id, stop_sequence, station_id, station_name, cumulative_seconds, segment_seconds_from_previous

### departures（发车表）
- departure_id, route_id, pattern_id, date_type, shift_name, departure_time, start_station, is_gaochao_departure, driver, vehicle_no, source_type, confidence, remark

### arrival_predictions（预测到站表）
- departure_id, station_id, station_name, stop_sequence, predicted_arrival_time, cumulative_seconds, source_version

## 实测校准详细方法

### 用户实测时建议记录内容

```
日期：
日期类型：工作日 / 周末节假日
线路：
班次：
发车时间：
车号：
驾驶员：
实际发车站：
实际发车时间：
每站到达时间：
是否等红灯/上下客较多/临时停车：
备注：
```

### 如何更新 Excel

1. 打开 `实测记录模板`
2. 填写每段站间的实际到达时间
3. 查看自动计算出的实测站间秒
4. 对同一站间段多次实测后，取一个合理值（建议中位数）
5. 把合理值填入 `秒级路线参数_可调整` 的"手动采用秒"
6. 检查 `预测到站明细_秒级` 和 `运转校验_秒级` 是否更新合理

### 实测值取值建议

- 可取中位数，减少偶然停车或上下客导致的极端值影响
- 可分时段统计（早餐、午餐、晚餐、晚间）
- 如数据充足，可建立不同的路线参数版本

## Excel 版本演进历史

1. **整理版** → 基础时刻数据
2. **系统标识更新** → 环线1路打钩车次标注为系统工程学院发车
3. **线路日期更新** → 统一线路名，环线1路仅工作日
4. **含预测到站** → 新增路线站点、预测到站、运转校验
5. **含就餐专线路径** → 环线1路打钩车次改走就餐专线
6. **无表格修复版** → 移除导致 Excel 修复提示的表格对象
7. **秒级可校准版**（当前）→ 精确到秒，支持实测校准

## 开发交互日志摘要

项目经过 20 轮关键对话完成：

1-15. （略，见上方原始日志）
16. **地图性能重构**：CSS custom properties + calc() 替代 Vue 响应式定位，3 次 DOM 写入驱动所有 overlay 元素；SVG vector-effect 保清晰；修复环线首尾同站公交"狂奔"bug
17. **首页体验优化**：附近站点视图（移除 GPS 自动单选）、三列表统一折叠 5 条、即将发车展开时间线、站点排序冻结修复、容器加宽 640px
18. **数据库修正**：Supabase measurements 表 15 条记录站名修正 + 时间拆分 + 2 条垃圾删除；visits 表建表（匿名访问统计）
19. **管理面板**：`/admin` 密码保护，日/周/月/年/总五维度活跃用户图表（柱状/折线切换），设备分布，访问日志，每分钟自动刷新
20. **细节完善**：StopInfoPanel 实时读秒 + 发车状态显示；手动记录增加 HX3_GAOCHAO；自动记录隐藏；公告栏更新；桌面定位修复；环线起终点同站差异化处理
21. **Bug 修复**：车次突然消失 — `<keep-alive>` 保持 Tab 页状态避免 `selectedStop` 丢失；步行过滤器改为警告图标而非隐藏车次；MapView 切后台暂停 rAF 省电
22. **路段预估更新 (v2.0)**：基于 33 条实测记录重新计算全部 5 条路线站间秒数；环线2路全部 9 段首次获得实测数据（全程 586→511s, -75s）；新增 `scripts/recalc_segments.py` 和 `scripts/apply_new_params.py` 辅助脚本
23. **环线2路仅工作日**：移除 17 条周末/节假日发车记录，备份于 `data/backups/`；新增 `CHANGELOG.md` 记录所有数据变更

关键决策：
- 系统工程学院发车统一按高超楼处理
- 环线1路打钩车次走就餐专线
- 使用秒级精度而非分钟级
- 环线起终点同站需要特殊处理（过滤 isDepartureStop 和 isReturnStop）
- 部署使用 GitHub Pages（docs/ 目录）
- 地图改用静态卫星底图，彻底移除高德 API 依赖

## 微信小程序版（apps/miniprogram/）

> 2026-10-18 启动移植。目标：主流量入口迁移至微信小程序；H5 版继续维护不撤。

### 关键决策（为什么这样选型）

| 决策 | 理由 |
|---|---|
| **uni-app Vue3 + TS + Vite** | 最大化复用 H5 逻辑（utils/stores 思路同源），未来可一码多端 |
| **腾讯 `<map>` 组件** | 免费不限调用量（H5 时代因高德按量收费才改静态卫星图）；markers/polyline/rotate/show-location 原生支持，卫星图方案在小程序端彻底废弃 |
| **微信云开发（云数据库+云函数）** | Supabase 域名无法过小程序 ICP 白名单；云开发免域名备案、原生集成、有免费体验期 |
| **数据 import 加载** | `src/data/*.json` 打进包内（同步脚本压缩，总包 1.5MB < 2MB 限制），启动即读无网络请求；开启 `lazyCodeLoading` |
| **小程序数据统一 GCJ-02** | 微信定位（`onLocationChange`）、腾讯 `<map>`、腾讯 LBS 只认 GCJ-02；在 `sync_miniprogram_data.js` 同步时一次性转换，运行期零转换。改动前曾是运行期转换，正是这种边界混用导致过 670m 偏移 |
| **UI 原生组件重写** | Vant 不能在小程序用；第一版全部原生 view/text/picker/map 组件 + rpx，未引入 uv-ui（后续可按需） |

### 云开发配置（已生效）

- **AppID**：`wx9793b294a259ec3a`（个人主体，类目审核中）
- **云环境 ID**：`campus-bus-d5g9cli14141d5144`（在 `src/App.vue` onLaunch 的 `wx.cloud.init` 中引用）
- **云函数**（`cloudfunctions/`，需在开发者工具右键「上传并部署：云端安装依赖」）：
  - `weather`：Open-Meteo 天气代理，云数据库 `weather_cache` 缓存 30 分钟
  - `holidays`：holiday-cn 节假日，云数据库 `holiday_cache` 按年缓存，内置 2026 兜底
- **云数据库集合**（首次写入自动创建，无需手动建）：`measurements`（乘车记录）、`visits`（访客统计）、`weather_cache`、`holiday_cache`
- **数据库权限**：`measurements`/`visits` 需在云开发控制台改为「所有用户可读，仅创建者可写」（默认"仅创建者可读写"会导致他人记录不可见）
- 注意：云函数出网无白名单限制（天气/节假日/GitHub 均可直连）

### 目录与数据流

```
apps/miniprogram/
├── src/
│   ├── pages/{index,schedule,map,record,about}/   # 5 页，与 H5 一一对应
│   ├── stores/      # schedule(import JSON)/location/upload/global-time
│   ├── utils/       # 与 H5 同源（station_group/countdown/geo/bus_position/datetime/holidays/time）
│   ├── composables/ # useGeolocation（GCJ-02）、useWeather（腾讯位置服务）
│   ├── data/        # sync_miniprogram_data.js 生成（GCJ-02，勿手改）
│   ├── static/icons/# 公交图标（暂沿用 H5 素材）
│   └── static/tabbar/# tabBar 图标（81×81 PNG，generate_tabbar_icons.py 生成）
├── cloudfunctions/  # weather / holidays
└── project.config.json  # miniprogramRoot=dist/dev/mp-weixin, cloudfunctionRoot=cloudfunctions/
```

**数据同步流程**：改 `public/data/` → `node scripts/regenerate_predictions.js`（如涉及预测） → `node scripts/sync_miniprogram_data.js`（压缩同步 + 经纬度 WGS-84→GCJ-02，写入 `apps/miniprogram/src/data/`） → 两端各自构建发布。

**逻辑同步约定（2026-10-22 起）**：`apps/miniprogram/src/utils/` 是权威版本，不再与 `src/utils/` 保持复制关系（见顶部「双端 utils 同步约定已解除」）。**业务语义**（`findBestRide` 同名站取最优组合、环线首尾同站过滤、5 分钟保留窗口、日期类型判定）两端必须一致，改动后跑 `node scripts/test_scenarios.cjs` 回归；具体实现允许按平台各自优化。

### 踩坑记录（后续勿重蹈）

1. **project.config.json 源码目录字段是 `miniprogramRoot`**，不是 `srcMiniprogramRoot`（后者是 uni-app 内部字段）。写错会导致微信开发者工具"模拟器启动失败"（已在 5a51338 修复）。
2. **npm 直连安装超时**：本机直连 npmjs.org 会卡死，必须 `--registry=https://registry.npmmirror.com`。
3. **pinia 版本冲突**：uni-app 自带 vue 版本与 pinia 3 不兼容，固定 `pinia@2.1.7 --legacy-peer-deps`。
4. **云数据库权限默认"仅创建者可读写"**：访客统计/记录共享场景必须手动改权限。
5. **tabBar 图标**：已补齐（`src/static/tabbar/`，81×81 PNG，灰/蓝两版），由 `scripts/generate_tabbar_icons.py` 从 SVG 生成；改图标只需改该脚本再重跑，勿手改 PNG。微信 tabBar 只认本地图片，不支持 SVG 直引。
6. **AppID 与云环境 ID 是两个东西**：AppID（小程序后台→开发设置，wx 开头 16 位）≠ 云环境 ID（云开发控制台）。
7. **云函数默认运行时是 Node 16，没有全局 `fetch`**：云函数里请求外部接口必须用 `https` 模块（`cloudfunctions/weather` 已按此实现）。若用 fetch 会直接抛错，前端只能静默降级（天气不显示、节假日退回内置兜底）。
8. **云函数不部署 = 前端拿不到数据**：`wx.cloud.callFunction` 会 reject，前端必须 try/catch 静默降级，否则整页报错。排查"天气不显示"先看云函数是否已右键"上传并部署：云端安装依赖"。
9. **automator 的 `callWxMethod('setStorageSync', ...)` 要传位置参数**：`(key, data)`，不能传 `{key, data}`（那是异步 `setStorage` 的写法），否则静默失败、回读为空。
10. **云函数默认超时只有 3 秒**（运行时 `Nodejs16.13`），且函数目录下 `config.json` 里的 `timeout` **不生效**（实测仍是 3 秒），只能去云开发控制台改。因此 `weather`/`holidays` 都在代码里设了网络时间预算（2 秒），超时就降级返回，避免整个调用失败。
11. **云数据库集合不会自动创建**：对不存在的集合 `add` 会报 `-502005 collection not exists`。集合读写必须包 try/catch 当"可选缓存"，否则云函数整体失败。需在控制台手动建 `weather_cache`、`holiday_cache` 才有缓存效果。
12. **`requiredPrivateInfos` 在 dev 产物中丢失**：`dist/dev/mp-weixin/app.json` 缺该字段时，所有定位接口报 `the api need to be declared in the requiredPrivateInfos field`。根因是**同时跑了两个 `npm run dev:mp-weixin` watcher** 互相覆盖产物。排查：`Get-CimInstance Win32_Process` 查重 → 杀掉 → 删 `dist/dev` → 只启一个。
13. **云环境 ID 少一个字符就 `[100003] Env Not Exists`**：本项目是 `campus-bus-d5g9cli14141d5144`（d5g9，不是 d5q9）。改 `App.vue` 后必须重新编译并重启小程序，`onLaunch` 才会重新 `cloud.init`。
14. **`mp.evaluate` 返回响应式对象会卡死**：不要直接返回 pinia store 的值（proxy 无法序列化），改用 `String(...)` 拼原始值，或先写 storage 再 `callWxMethod('getStorageSync')` 读回。
15. **文档类中文文件不要用 PowerShell `Set-Content` 改写**：PowerShell 5.1 默认输出 ANSI(GBK)，会把 UTF-8 中文写成乱码且不可逆。改文档一律用编辑器/工具或 Node 显式 `utf8` 读写。

### 调试工作流纪律（强制，违反必返工）

**第一步永远是拿到逐字错误，不是猜现象。** 拿不到就说明探针写错了，先修探针，禁止动业务代码。

| 现象 | 取证命令 |
|---|---|
| 定位失效 / 权限异常 | `node scripts/mp_probe.cjs location` |
| 天气不显示 | `node scripts/mp_probe.cjs weather` |
| 节假日 / 车次异常 | `node scripts/mp_probe.cjs holidays` |
| 授权与隐私协议 | `node scripts/mp_probe.cjs setting` |
| 编译异常 | `apps/miniprogram/dev-build.log` 原文 |

**探针只用 `scripts/mp_probe.cjs`。** 它内置了唯一正确的写法（evaluate 只做同步启动 → 异步结果写 storage → Node 轮询读回 → 硬超时 → finally 断开）。
禁止自己另写 `mp.evaluate`，以下三类写法会让 automator **永久挂起**，只能杀进程：

1. `return new Promise(...)` —— `evaluate` 不会 await thenable；
2. 返回 pinia store / 响应式 proxy —— 无法序列化；
3. 依赖 `uni` 全局或额外入参 —— 注入环境只有 `wx`，且 `evaluate` 不传 args，storage key 必须写成字面量。

**定位三要素齐全才动手**：哪个文件、哪一行、根因是什么。一次只验证一个假设，改一处 → 用同一探针复测 → 通过再进行下一步。禁止"顺手多改几处"。

**改完必须三层验证，缺一不可（在最后统一跑一次，不是每改一处跑一次）：**

1. 功能：`node scripts/mp_probe.cjs <相关探针>`
2. 类型：`cd apps/miniprogram && npx vue-tsc --noEmit`
3. 数据回归（三项都要，不是任选其一）：
   - `node scripts/test_scenarios.cjs`（数据层场景）
   - `node scripts/test_core_logic.mjs`（核心逻辑：**直接 import 小程序源码真实模块**，不复刻算法）
   - `node scripts/check_coord.js`（坐标一致性：锚点快照 + 370 点全量，能识别双重转换）

### 效率纪律（强制，违反即返工）

用户的明确要求（2026-10-20）：**批量改完再统一验证，不要改一下验一下、改一处截一张图。**

历史教训：一个几分钟的改动被拖到三四十分钟，原因是每步都截图、读图、重建、复测。禁止重蹈：

1. **不逐步截图。** 只有用户明确要求看界面效果、或确需视觉判断（布局错位、颜色、图标）时才截图；其余一律用文本断言（`element.text()` / `data()` / 探针输出）验证。
2. **不每改一处就验证。** 把所有相关改动一次做完，最后统一跑：`vue-tsc` → （涉及逻辑/资源才）`build:mp-weixin` → `test_scenarios`。
3. **不重复 `build`。** 改文案/CSS/注释不需要 build；`vue-tsc` 就够。build 只用于逻辑改动或最终交付。
4. **不新建一次性探针文件。** 用 `scripts/mp_probe.cjs` 或一个带参数的复用脚本；用完即删，不留 `_probe_*.cjs`。
5. **一次试错上限 2 次。** 同一现象连续两次没定位到根因，立即停下来把逐字错误报给用户，禁止连续试五六种可能（本项目真实踩过：门禁页"没渲染"折腾十几分钟，其实只是开发者工具缓存跑旧包，先看 `dev-build.log` 就能秒判）。
6. **改前先看日志。** 凡"改了没反应"，第一动作看 `dev-build.log` 末尾，而不是改代码。

**云函数改动必须重新部署并复测。** 注意容器可能仍在跑旧代码：以返回字段（如 `cached`）判断是不是新版本，**不能凭"刚才通过"就认定新代码生效**。
本项目就吃过亏：给 `weather` 加内存缓存时误删 `const CACHE_MS`，提交后靠探针才发现线上报 `CACHE_MS is not defined`。

**易误判清单（先查这里再动手）**

- 两个 `npm run dev:mp-weixin` 会互相覆盖 `dist/dev`，表现为"配置莫名缺失" → 先查重进程；
- `dist/dev` 异常优先删目录重建，不要改 `manifest.json` 去"绕"；
- CLI `--env` 只适用于 `deploy` / `info` / `list`；
- `cloudfunctions/*/config.json` 里的 `timeout` 不生效，别再试。

**本地文件操作铁律**

- 改含中文的文件：用 StrReplace / 编辑器 / Node `fs.writeFileSync(p, s, 'utf8')`；
- **禁止** PowerShell `Set-Content` / `Out-File` 改写文档（默认 GBK / UTF-16 BOM，会毁掉中文且不可逆）；
- 读 git 内容用 `execSync('git show ...').toString('utf8')`，**禁止** `git show > file`（PS 重定向产出 UTF-16 BOM）；
- 每次写完立即校验：`new TextDecoder('utf-8', { fatal: true }).decode(fs.readFileSync(p))`；
- 截图前先枚举窗口 `GetWindowRect` 拿真实 rect，**禁止猜坐标**（猜错会白读多张图，污染上下文）。


16. **tabBar 图标显示为灰色占位框 = 开发者工具文件索引与重建后的 `dist/dev` 不同步**：`iconPath` 指向的文件存在、MD5 正确、PNG 可解码、日志无任何报错，但模拟器里四个 tab 都显示**同一个灰色方框**。
    判别方法（可量化，别靠肉眼）：把屏幕 tabBar 图标带裁出来统计深/中灰像素，**四个 tab 数值几乎相同 → 就是占位符**；正常时四个图标的像素分布各不相同，且与各自源图标做滑动窗口相关性搜索能匹配到自己。
    根因：整体 `Remove-Item -Recurse dist\dev` 后重建，工具的文件监听索引没跟着更新。解法：`cli.bat cache --clean file` → `cache --clean compile` → `close` → `open`。
    预防：**不要整体删 `dist/dev`**；若必须删，删完一定要重开项目（并重新开 `cli auto`）。
17. **automator 依赖不要装在 `%TEMP%`**：临时目录会被系统清理，导致探针突然报 `Cannot find module`。应装为项目 devDependency：
    `npm i -D miniprogram-automator --registry=https://registry.npmmirror.com --legacy-peer-deps`（不加 `--legacy-peer-deps` 会因 `@vitejs/plugin-basic-ssl` 的 peer 冲突失败）。
    另注意：`cli.bat close` + `open` 重置项目后，自动化端口 9420 会失效，需重新执行 `cli.bat auto --project <项目> --auto-port 9420`。
18. **坐标系：H5 = WGS-84，小程序 = GCJ-02，转换只发生在同步脚本里**（2026-10-19 调整）：
    - `public/data/*.json` 仍是 **WGS-84**（H5 卫星底图、浏览器 GPS 都是 WGS-84，不能动）。
    - `apps/miniprogram/src/data/*.json` 由 `scripts/sync_miniprogram_data.js` 在同步时把 `stations`/`route_stops`/`route_paths` 转成 **GCJ-02** 写入；小程序运行期（定位/渲染/天气）**零坐标转换**。
    - 转换实现：`scripts/lib/coord.js` 是**构建期唯一实现**（PWA 的 `src/utils/geo.ts` 那份已随 PWA 退役，不要再引用它）。脚本启动时跑 `selfCheck()`，偏移量不在 550-800m 直接抛错。
    - **`selfCheck()` 抓不住双重转换**：把 GCJ-02 当 WGS-84 再转一次，偏移同样是约 672m，照样落在区间内。判断「转了几次」必须靠 `node scripts/check_coord.js`（冻结锚点绝对坐标快照 + 370 个坐标全量比对），任何坐标相关改动都要跑它。
    - **新增含坐标的数据文件必须加进 `COORD_FILES`**，否则漏转 = 该文件整体偏移约 670m。
    - `wx.onLocationChange` 官方文档固定回调 GCJ-02，不受 `startLocationUpdate` 的 `type` 影响；`wx.getLocation` 虽支持 `type:'wgs84'`，但**开发者工具忽略 type**（`node scripts/mp_probe.cjs geo` 可复现：两种类型返回同一模拟点）。既然数据已是 GCJ-02，`handleWechatLocation()` 直接入库即可。
    - 若把 GCJ-02 当 WGS-84 用（或反之），长沙地区固定偏移 **约 670m**（实测 18 个站点里 14 个会误判到别的站：把 GCJ 的「理学院」当成 WGS，最近站会变成「网球场」，仅 23m）。
    - 距离计算对坐标系不敏感：153 个站对在 WGS-84 与 GCJ-02 下算出的距离最大只差 **2.8m**，远小于 GPS 精度（20-50m）与 200m 附近站阈值——**只要不混用就行**，混用才是 670m。
    - 开发者工具没有真实 GPS，模拟定位点常驻上次设置的值（面板用 GCJ-02）。想在工具里模拟「研究生宿舍楼」，填 `28.254769, 113.051463`（该站的 GCJ-02 值）。
    - 排查口诀：**看文件名就知道坐标系**——`public/data` 是 WGS，`apps/miniprogram/src/data` 是 GCJ。
19. **同名站一圈过两次，禁止用 `indexOf(站名)` 定位站点**（2026-10-22）：接驳1路/2路的`军体活动中心东`、`网球场`、`激光所`在同一圈里各经过两次（去程一次、绕回来再停一次），站名完全相同。用 `indexOf(站名)` 永远只拿到**去程**那一次，本项目已因此出过三次问题：首页目的地推荐会把用户带去绕大圈的车（改用 `findBestRide()` 枚举上下车组合解决）；记录页「一键上车」（旧代码 `@tap="boardAt(stop)"` 传站名 + `indexOf`）和手动点行都会把回程上车的计时记到去程路段上（现改用 `utils/stop_seq.ts`：`findStopIndexes()` 返回**全部**站序，`nextArrivalsBySeq()` 按到站时间判断下一班是去程还是回程）。**新写任何「按站名找站」的代码，先想清楚同名站是否会出现两次；会出现就必须按站序（stopSeq）处理。**
20. **「改了没反应」先看 `dist/dev` 时间戳，别怀疑代码**（2026-10-22）：记录页回程上车 bug 在源码 `2750ede` 已修，但开发者工具跑的是 10-20 编译的 `dist/dev`（仍是 `boardAt(stopName)` + `indexOf`），用户复测时照样复现，白折腾一轮。判别：`(Get-Item apps/miniprogram/dist/dev/mp-weixin/pages/record/record.js).LastWriteTime` 比源码旧就是产物没重建。**改完页面代码必须重建 `dist/dev`**（`npm run dev:mp-weixin` 起一次 watcher 等 `Build complete` 即可，不必常驻）；只跑过 `build:mp-weixin` 不代表开发者工具里的包更新了。

### 位置接口申请材料（2026-10-19，`startLocationUpdate`/`onLocationChange` 重提）

- **申请文案 + 上传清单**：`apps/miniprogram/docs/接口权限申请材料.md`（含两段互不重复的 300 字文案、8 张图的逐张说明、驳回对策）。
- **图片生成**：`node scripts/capture_location_permission_shots.cjs`（automator 抓 8 张原图到 `docs/接口申请截图-持续定位/原图/`）→ `powershell -File scripts/annotate_location_shots.ps1` 加底部说明条输出到 `上传用/`（**上传这个目录**）。
- **图形依据（重要）**：单张静止图无法证明「必须持续定位」——`getLocation` + `<map show-location>` 也能画出蓝点。所以截图做成**同一地图页 5 帧连续画面**（网球场→激光所，距离 135→98→69→49→14 米）。
- **已清理**：当时为截图临时加过 `nearestStopInfo`（左上角距离 HUD）与 `userMarker`（自绘蓝色定位点，`src/static/icons/user-location.png`）。自绘 marker 已删除——原生 `show-location` 蓝点风格与微信统一、位置无偏移，自绘 marker 因默认锚点是底边中点，会偏离真实坐标约 26m（scale 16 下 22px 图标上浮 11px），视觉上和原生蓝点打架。
- **`nearestStopInfo` 于 2026-10-22 恢复（顶部距离 HUD）**：它曾于 10-19 一并删除，但位置接口申请材料的第一、二节文案和 3/8–7/8 截图都是围绕这行「距「激光所」135 米 · 步行约1分44秒」写的——删掉它等于材料与界面不一致，提审会被判「使用场景无法确认」。恢复的是**纯文字 HUD**（不涉及自绘 marker），数值随 `onLocationChange` 刷新，是本项目持续定位唯一可被截图证明的使用场景。**不要再次删除**。

- **合规落地**：`useGeolocation.ts` 新增 `onAppHide`/`onAppShow` 钩子，切后台立即 `stopLocationUpdate` + `offLocationChange`，回前台恢复；关于页新增「位置信息」声明。
- **开关只有一个入口 `syncWatch()`（2026-10-22 修复竞态）**：`wx.startLocationUpdate` 是异步的，成功回调可能在页面已经切走 / 已切后台之后才回来。旧写法在回调里直接 `onLocationChange`，造成「人已经离开、监听才刚开始」。现在所有开关都走 `syncWatch()`，由 `shouldWatch()`（前台 && 有页面持有 && 用户愿意 && 未被拒）决定目标状态，并用 `watchEpoch` 序号让过期回调自我作废。**不要在别处直接调 `startLocationUpdate`/`stopLocationUpdate`**，否则竞态会回来。
- **PowerShell 脚本必须存 UTF-8 带 BOM**：无 BOM 时 PS 5.1 按 GBK 解析，中文注释里的字节可能被当成反引号续行，导致 `Add-Type` 被吞、报「找不到类型 System.Drawing」。用 Node 写入 `'\ufeff' + s` 即可。

### 待办（按优先级）

1. 微信开发者工具编译预览，逐页验收（首页/行程/地图/记录/关于）
2. 云函数 weather/holidays 右键上传部署（云端安装依赖）
3. 云数据库 `measurements`/`visits` 权限调整
4. 小程序类目审核通过后：`npm run build:mp-weixin` → 开发者工具上传 → 后台提审发布
5. Supabase `measurements`/`visits` 历史数据迁移到云数据库（JSON 导出→控制台导入，58+ 条）
6. 访客统计埋点（useVisitorTracking 小程序版）+ 管理面板小程序版（AdminView）
7. 可选增强：时间覆写调试面板（H5 已有）、BusStopTimeline 公交动画、订阅消息提醒（小程序独占能力）

### H5 版继续维护

- H5（campus-bus.github.io/bus）不撤，数据同源；正式发布小程序后在 H5 首页挂"小程序版上线"引导
- 旧地址迁移页（`migration/`）继续服役于 liusizheng.github.io/loop-ride-assistant

## 关键注意事项

1. 不要随意修改原始发车时刻
2. 系统工程学院发车统一按**高超楼**处理（2026-10-17 站名变更：原「系统楼」→「高超楼」，原「高超楼」→「空天楼」）
3. 环线1路打钩车次走就餐专线，不走普通环线1路
4. **全部线路目前仅工作日运行**（2026-10-18 起）；周末/节假日时刻表待补充，周末暂无任何车次
5. 环线1路就餐车次按「班次+时刻」判定（第一班 11:20-12:40、第五班 16:30-17:50），其他班次相同时刻不受影响
6. 预测到站时间是估算结果；JB 各段复用原环2/环3实测段秒数，理学院→激光所、军体东→军体南、305→研究生（绕行）三段为距离估算待实测
7. 所有路线都是环线，起终点同站需要特殊处理：首页过滤 isReturnStop，地图点站保留 isReturnStop
8. H5 卫星底图与 `public/data` 站点数据均为 WGS-84；小程序 `src/data` 为 GCJ-02（同步脚本转换），**两套坐标严禁互粘**
9. `showDebugTools = false`，调试时改为 `true` 恢复时间和定位覆写面板
10. 地图 overlay 层使用 CSS `@property` + `calc()` 定位，修改时注意不要引入 Vue 响应式依赖 `scale`/`panX`/`panY`
11. `route_params.json` 中仅有 `finalSegmentSeconds` 和 `cumulativeSeconds`，无 `baseSegmentSeconds`
12. 管理面板密码 `250030`，访问 `/#/admin`
13. dev server 使用 `@vitejs/plugin-basic-ssl` HTTPS，桌面 Chrome 需接受自签名证书才能使用定位
14. Supabase visits 表 RLS 允许匿名 INSERT/SELECT，无需 service_role key
15. 就餐专线 ×1.44 倍率（相比同路段普通公交），激光所→空天楼→高超楼 时间比 79:21
16. 数据变更记录在 `CHANGELOG.md`；移除的历史发车记录备份在 `data/backups/` 目录
17. 重新计算路段预估：运行 `python scripts/recalc_segments.py` 查看最新结果，`python scripts/apply_new_params.py` 写回 route_params.json，然后 `node scripts/regenerate_predictions.js` 重新生成预测
