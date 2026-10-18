# migration/ — 旧地址迁移提示页

本目录是**另一个仓库**（`LiuSizheng/loop-ride-assistant`）的部署源码，不属于本小程序本体。

## 用途

2026-10-17 主仓库从 `LiuSizheng/loop-ride-assistant` 转移到 `campus-bus/bus` 后：

- 旧地址 `liusizheng.github.io/loop-ride-assistant/` 在服务端已 404
- 但**已安装旧版 PWA / 被旧 Service Worker 缓存的用户**仍会打开旧版本（SW 离线缓存，且旧地址 404 导致 SW 永远检查不到更新，用户被永久卡在旧版）

因此在旧仓库重新部署一个迁移提示页：

| 文件 | 作用 |
|------|------|
| `index.html` | 迁移提示 + 15 秒倒计时自动跳转新地址 + 页面级 SW/缓存清理（双保险） |
| `sw.js` | 迁移专用 Service Worker：安装后激活即清空全部缓存、注销自身、强制已打开页面重新导航到迁移页（此后无 SW 拦截，请求直达网络） |

## 部署方式（已执行过一次，如提示内容需修改则重新执行）

```bash
# 在任意临时目录：
git init && git checkout -b master
# 复制本目录的 index.html 和 sw.js 进去
git add -A && git commit -m "migration page"
git remote add origin https://github.com/LiuSizheng/loop-ride-assistant.git
git push -f origin master
# 开启 Pages（master 分支根目录）：
gh api repos/LiuSizheng/loop-ride-assistant/pages -X POST -f "source[branch]=master" -f "source[path]=/"
```

## 注意事项

- 本目录的 `index.html` 部署在**根路径**（旧仓库 Pages source 为 master `/`），与本项目 `docs/` 部署体系无关
- 切勿把本目录复制进 `public/` 或 `docs/`——它会污染主项目部署
- 新地址变更时需同步修改 `index.html` 中的 3 处跳转链接
