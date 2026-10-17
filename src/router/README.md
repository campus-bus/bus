# src/router/ — 路由配置

`index.ts`：vue-router **hash 模式**（GitHub Pages 静态托管无服务端路由，必须用 hash）。

| 路径 | 页面 | meta.tab |
|------|------|----------|
| `/` | HomeView | home |
| `/schedule` | ScheduleView | schedule |
| `/stop` | StopQueryView | stop |
| `/map` | MapView | map |
| `/upload` | UploadView | upload |
| `/about` | AboutView | —（无 Tab） |
| `/admin` | AdminView | —（无 Tab，密码 `250030`） |
| `*` | → 重定向 `/` | — |

- 全部路由懒加载
- `meta.tab` 驱动 `TabBar.vue` 高亮与 `App.vue` 的 TabBar 显示
- 管理面板直达：`/#/admin`
