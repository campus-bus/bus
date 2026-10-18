# apps/miniprogram — 环线坐车微信小程序

基于 **uni-app（Vue 3 + TypeScript + Vite）** 的微信小程序版，与 H5 版（`src/`）共享数据与业务逻辑，全面使用微信生态：腾讯 `<map>` 组件、云开发（云数据库 + 云函数）。

## 与 H5 版的关系

| 层 | 复用方式 |
|---|---|
| 数据 | `scripts/sync_miniprogram_data.js` 从 `public/data/` 压缩同步到 `src/data/`（import 加载） |
| 业务逻辑 | `src/utils/`（station_group/countdown/geo/bus_position/datetime）与 H5 同源复制，改动需双向同步 |
| UI | 全部重写（Vant → 原生组件 + rpx），页面一一对应 |

## 技术架构

- **地图**：腾讯 `<map>` 组件（免费不限量），WGS-84→GCJ-02 由 `utils/geo.ts` 的 `wgs84ToGcj02` 转换；站点/路线/公交用 markers+polyline，用户位置用原生 `show-location`
- **数据库**：云开发云数据库 `measurements`（乘车记录）/ `visits`（访客统计）/ `weather_cache` / `holiday_cache`（集合首次写入自动创建）
- **云函数**（`cloudfunctions/`）：`weather`（Open-Meteo 代理 + 30 分钟缓存）、`holidays`（holiday-cn + 按年缓存 + 2026 兜底）
- **天气**：首页头部展示当前温度/今日高低温/天气描述；小程序不能直连第三方域名，故由 `composables/useWeather.ts` 调云函数 `weather`，本地再缓存 10 分钟；云函数未部署时静默不展示（不影响其他功能）
- **数据加载**：`stores/schedule.ts` 直接 import 打包 JSON（无网络请求，启动即读；lazyCodeLoading 按需注入）

## 本地开发

```bash
cd apps/miniprogram
npm install          # 首次（建议 --registry=https://registry.npmmirror.com）
npm run dev:mp-weixin # watch 编译到 dist/dev/mp-weixin（保持运行）
node ../../scripts/sync_miniprogram_data.js  # 数据变更后同步（在主项目根目录跑）
```

然后用**微信开发者工具**导入本目录（`apps/miniprogram`，含 `project.config.json`），AppID 填你的小程序 AppID 即可预览/真机调试。

## 发布

```bash
npm run build:mp-weixin  # 生产构建（压缩）
# 微信开发者工具 → 上传 → 小程序后台提交审核
```

## 云开发一次性配置（已完成/待办）

- [x] 云函数代码（weather / holidays）
- [x] 前端天气展示（`composables/useWeather.ts` + 首页头部）
- [ ] 微信开发者工具中右键 `cloudfunctions/weather` → 上传并部署（云端安装依赖）—— **未部署时首页不会显示天气**
- [ ] 同上部署 `holidays`
- [ ] 云数据库权限：`measurements`/`visits` 集合改为「所有用户可读，仅创建者可写」（默认仅创建者可读写会导致他人记录不可见）

## 目录说明

```
src/
├── pages/           # index(首页) schedule(行程) map(地图) record(记录) about(关于)
├── stores/          # schedule(数据) location(定位) upload(记录) global-time(调试)
├── utils/           # 业务逻辑（与 H5 同源）
├── composables/     # useGeolocation（WGS-84 定位）
├── data/            # 同步生成的 JSON（勿手改）
├── static/icons/    # 公交图标（暂沿用 H5 素材）
└── pages.json       # 页面与 tabBar 配置
cloudfunctions/      # 云函数（weather/holidays）
project.config.json  # 开发者工具工程配置（appid 待填）
```
