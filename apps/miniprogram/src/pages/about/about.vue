<script setup lang="ts">
import { ref } from 'vue'
import { onShareAppMessage, onShareTimeline } from '@dcloudio/uni-app'
import { isDevUnlocked, unlockDev, lockDev } from '@/utils/dev'
import { SHARE_TITLE, SHARE_PATH } from '@/utils/share'

// 转发（钩子必须在本文件顶层直接调用，不能封装进 utils，原因见 utils/share.ts）
onShareAppMessage(() => ({ title: SHARE_TITLE, path: SHARE_PATH }))
onShareTimeline(() => ({ title: SHARE_TITLE }))

const devUnlocked = ref(isDevUnlocked())

/** 维护者入口：口令正确后进入记录页（普通用户看不到任何记录功能） */
function openDevEntry() {
  if (devUnlocked.value) {
    uni.navigateTo({ url: '/pages/record/record' })
    return
  }
  uni.showModal({
    title: '维护者入口',
    editable: true,
    placeholderText: '请输入口令',
    success: (res) => {
      if (!res.confirm) return
      const input = (res as { content?: string }).content || ''
      if (unlockDev(input)) {
        devUnlocked.value = true
        uni.navigateTo({ url: '/pages/record/record' })
      } else {
        uni.showToast({ title: '口令不正确', icon: 'none' })
      }
    },
  })
}

function exitDev() {
  lockDev()
  devUnlocked.value = false
  uni.showToast({ title: '已退出维护者模式', icon: 'none' })
}
</script>

<template>
  <view class="about-page">
    <view class="header">
      <view class="app-name">环线坐车</view>
      <view class="version">小程序版 v1.0.0</view>
    </view>

    <view class="section">
      <view class="section-title">关于</view>
      <view class="text">校园环线公交车时刻表查询与到站预测应用。支持环线1路、就餐专线、接驳1路（顺时针）、接驳2路（逆时针）的发车时刻查询、站点到站预测和地图可视化。</view>
    </view>

    <view class="section">
      <view class="section-title">数据说明</view>
      <view class="text">到站时间根据路线站间秒数（基于用户实测校准）和发车时刻估算，实际时间可能受上下客、道路情况和车辆调度影响。</view>
      <view class="text" style="margin-top: 12rpx;">接驳1路（顺时针）、接驳2路（逆时针）为同一环线的两个运行方向，线路站点相同、方向相反。</view>
    </view>

    <view class="section">
      <view class="section-title">位置信息</view>
      <view class="text">· 首次使用定位功能时需主动授权。授权后，停留在首页或地图页时会持续更新位置，用于计算附近站点、步行距离与在地图上显示你的位置；离开这些页面时立即停止</view>
      <view class="text">· 位置只在本机参与计算与显示，不上传服务器、不保存、不生成行程轨迹、不共享给第三方</view>
      <view class="text">· 仅在小程序处于前台时使用（未申请后台定位能力）：切到后台立即停止，回到前台且仍停留在上述页面时自动恢复</view>
      <view class="text">· 拒绝授权仍可手动搜索并选择站点，时刻查询功能不受影响</view>
    </view>

    <view class="section">
      <view class="section-title">注意</view>
      <view class="text">· 全部线路目前仅工作日运行，周末/节假日时刻表待公布</view>
      <view class="text">· 标有"就餐"的车次走就餐专线，站点与普通环线1路不同</view>
      <view class="text">· 高超楼是系统工程学院所在地，就餐专线在此发车，接驳1路/2路均经过</view>
    </view>

    <view class="section feedback">
      <view class="section-title">反馈意见</view>
      <view class="text">如有建议或问题，欢迎填写问卷：</view>
      <text class="link" selectable user-select>https://v.wjx.cn/vm/thRw5hx.aspx</text>
      <view class="tip">长按链接可复制</view>
    </view>

    <!-- 维护者工具：普通用户无需理会 -->
    <view class="section dev">
      <view class="section-title">维护者工具</view>
      <view class="text">用于实测校准站间秒数，仅本机保存，不会上传。</view>
      <view class="dev-btn" @tap="openDevEntry">{{ devUnlocked ? '进入记录页' : '维护者入口' }}</view>
      <view v-if="devUnlocked" class="dev-exit" @tap="exitDev">退出维护者模式</view>
    </view>
  </view>
</template>

<style scoped>
.about-page {
  padding: 32rpx 24rpx;
  /* 关于页不是 tabBar 页，页面一直延伸到屏幕底部，必须给 Home 指示条留出安全区 */
  padding-bottom: calc(32rpx + env(safe-area-inset-bottom));
}
.header { text-align: center; padding: 32rpx 0 40rpx; }
.app-name { font-size: 44rpx; font-weight: 700; color: var(--color-primary); }
.version { font-size: 24rpx; color: var(--color-text-secondary); margin-top: 8rpx; }
.section { background: var(--color-card); border-radius: 16rpx; padding: 24rpx; margin-bottom: 16rpx; }
.section-title { font-size: 28rpx; font-weight: 600; margin-bottom: 12rpx; }
.text { font-size: 26rpx; color: var(--color-text-secondary); line-height: 1.7; }
.link { display: block; font-size: 26rpx; color: var(--color-primary); margin-top: 10rpx; word-break: break-all; }
.tip { font-size: 22rpx; color: var(--color-text-tertiary); margin-top: 8rpx; }
.feedback { text-align: center; }
.feedback .section-title { text-align: left; }
.feedback .text { text-align: left; }
.dev { background: var(--color-bg); border: 1rpx dashed var(--color-border); }
.dev-btn { margin-top: 16rpx; text-align: center; font-size: 26rpx; color: var(--color-text-secondary); border: 1rpx solid var(--color-border); border-radius: 999rpx; padding: 14rpx; }
.dev-exit { margin-top: 12rpx; text-align: center; font-size: 24rpx; color: var(--color-text-tertiary); }
</style>
