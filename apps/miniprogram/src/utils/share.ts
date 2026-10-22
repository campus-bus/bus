/**
 * 转发文案 / 落地页（只放常量，不要在这里注册转发钩子）
 *
 * ⚠️ 为什么不能封装成 useShare()：
 * uni-app 的 mp-weixin 编译器（@dcloudio/uni-mp-vite 的 uni:mp-runtime-hooks 插件）
 * 是**用正则扫描页面文件自身的源码**，看到 `onShareAppMessage` / `onShareTimeline`
 * 这些字面量，才给页面组件补上 `__runtimeHooks` 位掩码；运行时 `initRuntimeHooks()`
 * 只有拿到这个位掩码，才会把钩子挂进微信 Page 的 options。
 * 一旦把钩子调用藏进 utils 里的函数，页面源码只剩 `useShare()`，位掩码不会生成
 * → 微信右上角菜单里没有「转发给朋友」，而且运行期不报任何错（最难查的一类）。
 *
 * 所以：各页面必须自己 `import { onShareAppMessage, onShareTimeline } from '@dcloudio/uni-app'`
 * 并在 setup 顶层直接调用，只从这里取文案常量。
 */

/** 分享卡片标题 */
export const SHARE_TITLE = '环线坐车 · 校园班车时刻与到站预测'

/** 分享落地页：固定首页，避免好友打开时缺原页面状态 */
export const SHARE_PATH = '/pages/index/index'
