// 迁移专用 Service Worker —— 唯一使命：接管旧 SW，注销自身并清空缓存
//
// 原理：
// 1. 浏览器打开旧地址时会请求 sw.js 检查更新（主脚本不走 HTTP 缓存）
// 2. 本文件与旧 workbox SW 内容不同 → 浏览器安装本 SW
// 3. 激活时：清空全部 Cache Storage → 注销自身 → 强制所有已打开页面重新导航
// 4. 此后所有请求直达网络（无 SW 拦截），用户看到迁移提示页

self.addEventListener('install', function () {
  self.skipWaiting()
})

self.addEventListener('activate', function (event) {
  event.waitUntil(
    (async function () {
      // 清空所有缓存
      try {
        const keys = await caches.keys()
        await Promise.all(keys.map(function (k) { return caches.delete(k) }))
      } catch (e) { /* 忽略 */ }

      // 注销自身
      try {
        await self.registration.unregister()
      } catch (e) { /* 忽略 */ }

      // 强制已打开的旧页面重新加载（此时已无 SW 拦截，直达网络获取迁移页）
      try {
        const clients = await self.clients.matchAll({ type: 'window' })
        for (const client of clients) {
          client.navigate(client.url)
        }
      } catch (e) { /* 忽略 */ }
    })()
  )
})

// 不做任何缓存拦截：所有请求直接走网络
self.addEventListener('fetch', function (event) {
  event.respondWith(fetch(event.request))
})
