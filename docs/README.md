# public/ — 运行时静态资源

此目录文件被 Vite 原样复制到 `dist/`（部署到 `docs/`），通过 `BASE_URL + 路径` 访问。

## 子目录

| 目录 | 内容 |
|------|------|
| `data/` | 运行时 JSON 数据 + 卫星底图（详见 `data/README.md`） |
| `icons/` | 公交图标（环线1路/环线2路/环线3路/就餐专线，png+svg 两格式；MapView 和 BusStopTimeline 用 png）、PWA 图标（icon-192/512）、bus-icon.svg |

## 注意

- 此目录改动后必须 `npm run deploy` 才会体现到线上
- 卫星底图（~1.6MB）被 PWA workbox 预缓存（上限 10MB），更新后用户端需等 SW 更新或清缓存
- 开发模式 fetch JSON 带时间戳防缓存；生产靠 SW 的 autoUpdate
