import { onShareAppMessage, onShareTimeline } from '@dcloudio/uni-app'

/**
 * 统一转发配置
 *
 * 小程序默认不开启「转发」菜单：不注册 onShareAppMessage，右上角「转发」是灰的，
 * 群聊/好友路径直接断掉。朋友圈分享（onShareTimeline）还要单独注册。
 *
 * 落地页固定为首页——分享出去的入口必须自身完整可读，不能依赖前一个页面的状态。
 */
const DEFAULT_TITLE = '环线坐车 · 校园班车时刻与到站预测'

export function useShare(title = DEFAULT_TITLE) {
  onShareAppMessage(() => ({
    title,
    path: '/pages/index/index',
  }))
  onShareTimeline(() => ({ title }))
}
