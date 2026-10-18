# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

校园环线坐车 PWA —— 为校园师生提供校园环线公交车（环线1路、就餐专线、接驳1路、接驳2路）的发车时刻查询、到站时间预测、地图可视化、行程规划和乘车记录服务。

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
| `src/utils/bus_position.ts` | 公交实时位置推算 + 路径匹配（maxSearch 防绕回） |
| `src/utils/countdown.ts` | 倒计时格式化（已到站/已过站/xx分xx秒） |
| `src/types/index.ts` | 全部 TypeScript 类型定义 |
| `vite.config.ts` | Vite 配置（含 basicSsl 插件） |
- **PWA**：vite-plugin-pwa，workbox generateSW 模式
- **坐标系**：全项目统一 WGS-84（卫星瓦片、站点数据、GPS 定位均为 WGS-84，无坐标转换）

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

**定位功能**：使用浏览器原生 `navigator.geolocation`，**不调用任何第三方 API**。GPS 返回 WGS-84，经 `wgs84ToGcj02()` 转换后用于地图定位。

**已废弃/删除的文件**：
- `src/utils/amap.ts` — 高德 SDK 加载器（已删除）
- `src/utils/geo.ts` 中 GCJ-02 转换函数 — 已删除，全部使用 WGS-84
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
| HX1_NORMAL | 环线1路普通 | 研究生宿舍楼 | 研究生宿舍楼→东门→2号宿舍楼→军体活动中心东→激光所→超算中心→北门→高超楼→理学院→二食堂→5号宿舍楼→305教学楼→研究生宿舍楼 |
| HX1_DINING | 就餐专线 | 高超楼 | 高超楼→理学院→二食堂→一食堂→305教学楼→5号宿舍楼→二食堂北→理学院→高超楼 |
| JB1_NORMAL | 接驳1路（顺时针） | 研究生宿舍楼 | 研究生宿舍楼→305教学楼→5号宿舍楼→二食堂→水上训练中心→军体活动中心南→军体活动中心东→网球场→激光所→理学院→高超楼→空天楼→激光所→网球场→军体活动中心东→2号宿舍楼→一食堂→研究生宿舍楼 |
| JB2_NORMAL | 接驳2路（逆时针） | 研究生宿舍楼 | 研究生宿舍楼→一食堂→2号宿舍楼→军体活动中心东→网球场→激光所→空天楼→高超楼→理学院→激光所→网球场→军体活动中心东→军体活动中心南→水上训练中心→二食堂→5号宿舍楼→305教学楼→研究生宿舍楼 |

**接驳环线特点**：
- JB1 与 JB2 为同一物理环的两个方向，JB1 数据由 JB2 反转自动派生（`regenerate_from_txt.js`）
- 激光所、网球场、军体活动中心东在一圈中出现**两次**（去程+回程），同一班次的预测记录中同名站会有两条不同 stopSeq 的记录，属正常现象
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

### 接驳1路（顺时针，仅工作日）

- 第一班：07:35, 07:55, 08:15, 08:35, 08:55, 09:15, 09:35, 10:05, 10:35, 10:55, 11:15, 11:35, 11:55, 12:15, 12:25, 12:35
- 第二班：14:15, 14:35, 14:55, 15:25, 15:45, 16:15, 16:35, 16:55, 17:15, 17:35, 17:55
- 第三班：18:35, 19:05, 19:35, 20:05, 20:35, 21:05, 21:35, 22:25

### 接驳2路（逆时针，仅工作日）

- 第一班：07:45, 08:05, 08:25, 08:45, 09:05, 09:25, 09:45, 10:15, 10:45, 11:05, 11:25, 11:45, 12:05
- 第二班：14:05, 14:25, 14:45, 15:15, 15:35, 16:05, 16:25, 16:45, 17:05, 17:25, 17:45
- 第三班：18:05

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

## 关键注意事项

1. 不要随意修改原始发车时刻
2. 系统工程学院发车统一按**高超楼**处理（2026-10-17 站名变更：原「系统楼」→「高超楼」，原「高超楼」→「空天楼」）
3. 环线1路打钩车次走就餐专线，不走普通环线1路
4. **全部线路目前仅工作日运行**（2026-10-18 起）；周末/节假日时刻表待补充，周末暂无任何车次
5. 环线1路就餐车次按「班次+时刻」判定（第一班 11:20-12:40、第五班 16:30-17:50），其他班次相同时刻不受影响
6. 预测到站时间是估算结果；JB 各段复用原环2/环3实测段秒数，理学院→激光所、军体东→军体南、305→研究生（绕行）三段为距离估算待实测
7. 所有路线都是环线，起终点同站需要特殊处理：首页过滤 isReturnStop，地图点站保留 isReturnStop
8. 卫星底图使用 WGS-84，站点数据使用 WGS-84（已废弃 GCJ-02）
9. `showDebugTools = false`，调试时改为 `true` 恢复时间和定位覆写面板
10. 地图 overlay 层使用 CSS `@property` + `calc()` 定位，修改时注意不要引入 Vue 响应式依赖 `scale`/`panX`/`panY`
11. `route_params.json` 中仅有 `finalSegmentSeconds` 和 `cumulativeSeconds`，无 `baseSegmentSeconds`
12. 管理面板密码 `250030`，访问 `/#/admin`
13. dev server 使用 `@vitejs/plugin-basic-ssl` HTTPS，桌面 Chrome 需接受自签名证书才能使用定位
14. Supabase visits 表 RLS 允许匿名 INSERT/SELECT，无需 service_role key
15. 就餐专线 ×1.44 倍率（相比同路段普通公交），激光所→空天楼→高超楼 时间比 79:21
16. 数据变更记录在 `CHANGELOG.md`；移除的历史发车记录备份在 `data/backups/` 目录
17. 重新计算路段预估：运行 `python scripts/recalc_segments.py` 查看最新结果，`python scripts/apply_new_params.py` 写回 route_params.json，然后 `node scripts/regenerate_predictions.js` 重新生成预测
