# src/ — 前端源码

Vue 3 + TypeScript 单页应用（PWA），入口 `main.ts` → `App.vue` → 路由懒加载各 View。

## 子目录

| 目录 | 职责 |
|------|------|
| `views/` | 7 个页面级组件（首页/行程/站点查询/地图/记录/关于/管理） |
| `components/` | 可复用组件（common 通用、map 地图、dev 调试、layout 布局） |
| `composables/` | Vue 组合式函数（定位、下一班车计算、天气、埋点等） |
| `stores/` | Pinia 状态（时刻表数据、地图状态、上传、时间/位置调试覆写） |
| `utils/` | 纯函数工具（时间、倒计时、地理、投影、Supabase 客户端） |
| `types/` | 全部 TypeScript 类型定义（`index.ts` 单文件） |
| `router/` | vue-router 配置（hash 模式，7 条路由） |

## 根文件

| 文件 | 职责 |
|------|------|
| `main.ts` | 应用入口：createApp + Pinia + router + Vant CSS |
| `App.vue` | 根组件：数据加载、节假日初始化、TabBar、PWA 安装提示、访客埋点；`<keep-alive>` 保持 5 个 Tab 页状态 |
| `vite-env.d.ts` | Vite 环境类型声明 |

## 关键约定

- **时间统一走 `utils/time.ts` 的 `getNow()`**（支持全局时间覆写调试），禁止直接 `new Date()`
- **坐标统一 WGS-84**：GPS、站点、路线、卫星底图同口径，无坐标转换
- 所有路线是环线（起点=终点），预测记录含 `isDepartureStop`/`isReturnStop` 标记，各页面过滤策略不同（见 `CLAUDE.md`）
- 已过班车保留 5 分钟（`secondsAway < -300`）后从列表移除
