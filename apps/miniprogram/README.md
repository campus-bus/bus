# apps/miniprogram — 环线坐车微信小程序

基于 **uni-app（Vue 3 + TypeScript + Vite）** 的微信小程序版，与 H5 版（`src/`）共享数据与业务逻辑。

**2026-10-19 起不再使用微信云开发**：时刻表数据打包进小程序、节假日内置、天气直连腾讯位置服务（可选）、乘车记录只存本机。因此**无需购买云开发套餐**，也没有任何必须的服务器成本。

## 与 H5 版的关系

| 层 | 复用方式 |
|---|---|
| 数据 | `scripts/sync_miniprogram_data.js` 从 `public/data/` 压缩同步到 `src/data/`（import 加载），**同步时把经纬度从 WGS-84 转成 GCJ-02**；两份数据坐标系不同，见下 |
| 业务逻辑 | `src/utils/`（station_group/ride_rank/stop_seq/countdown/geo/bus_position 等）**为权威版本**，与 H5 的 `src/utils/` 不再要求字节一致（2026-10-22 起）；两端**业务语义**必须一致——同名站取最优上下车组合、环线首尾同站过滤、5 分钟保留窗口、日期类型判定 |
| UI | 全部重写（Vant → 原生组件 + rpx），页面一一对应 |

## 坐标系（重要）

| 位置 | 坐标系 | 说明 |
|---|---|---|
| `public/data/*.json`（H5 用） | **WGS-84** | 与 ESRI 卫星底图、浏览器 GPS 一致 |
| `apps/miniprogram/src/data/*.json` | **GCJ-02** | 同步脚本转换后产出，与腾讯 `<map>`、微信定位、腾讯 LBS 一致 |
| 小程序运行期（store/渲染/请求） | **GCJ-02** | **不做任何坐标转换** |

因此**不要手改 `src/data/*.json`**，也不要把 `public/data` 的坐标直接粘进小程序；
加站点请改 `data/geo/*.txt` 或 `public/data`，然后重跑同步脚本。

## 技术架构

- **地图**：腾讯 `<map>` 组件（免费不限量），站点/路线/公交用 markers+polyline，用户位置用原生 `show-location`；坐标已在数据同步阶段转为 GCJ-02，渲染时无需转换
- **数据加载**：`stores/schedule.ts` 直接 import 打包 JSON（无网络请求，启动即读；lazyCodeLoading 按需注入）
- **节假日**：`utils/holidays.ts` 内置当年法定节假日与调休安排，**不请求网络**；每年 11 月补齐次年数据后发版
- **天气**：`composables/useWeather.ts` 调腾讯位置服务 `apis.map.qq.com`（个人开发者 1 万次/天免费），本地缓存 60 分钟；**未配置 Key 时不展示天气**，其余功能不受影响
- **乘车记录**：`stores/upload.ts` 仅写本机 storage（最多 200 条），入口在「关于 → 维护者工具」，普通用户不可见；支持复制校准文本
- **访客统计**：使用微信官方「We 分析」内置报表（免费、零代码），无需自建上报

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

## 一次性配置（按需）

### 天气（可选）

1. https://lbs.qq.com/dev/console/application/mine 注册个人开发者并实名
2. 创建应用 → 添加 Key → **只勾选「WebServiceAPI」**
3. 把 Key 填入 `src/config.ts` 的 `TENCENT_LBS_KEY`
4. 小程序后台 → 开发管理 → 开发设置 → 服务器域名 → request 合法域名，添加 `https://apis.map.qq.com`
5. 重新编译

不配置也不会报错，首页只是不显示天气。

### 定位

`app.json` 的 `requiredPrivateInfos` 已包含 `getLocation` / `startLocationUpdate` / `onLocationChange`，需在小程序后台对应接口权限审核通过后方可使用。

### 访客统计

小程序后台 →「We 分析」→ 基础版（免费）即可查看访问人数、打开次数、留存、页面分析。
如需自定义事件（如站点点击），在 We 分析「数据管理 → 上报管理」建好事件后，再用 `wx.reportEvent` 上报；本项目默认不埋点。

## 目录说明

```
src/
├── pages/           # index(首页) schedule(行程) map(地图) record(维护者记录) about(关于)
├── stores/          # schedule(数据) location(定位) upload(记录，本地) preference map_focus
├── utils/           # 业务逻辑（与 H5 同源）+ dev(维护者开关)
├── composables/     # useGeolocation(GCJ-02 定位) + watch_machine(定位状态机，纯逻辑可回归)、useWeather(腾讯位置服务)
├── data/            # sync_miniprogram_data.js 生成（GCJ-02），勿手改
├── types/           # index(业务类型，与 H5 一致)、wx(微信原生 API 声明)
├── static/icons/    # 公交图标
├── static/tabbar/   # tabBar 图标（generate_tabbar_icons.py 生成）
├── config.ts        # 运行时配置（腾讯位置服务 Key）
└── pages.json       # 页面与 tabBar 配置
scripts/             # 小程序专用工具脚本（截图、tabBar 图标生成）
docs/                # 接口申请材料与截图；docs/archive/ 存放已停用的云函数
project.config.json  # 开发者工具工程配置（appid 已填）
```
