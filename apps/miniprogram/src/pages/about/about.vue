<script setup lang="ts">
import { ref } from 'vue'
import { isDevUnlocked, unlockDev, lockDev } from '@/utils/dev'

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
      <view class="section-title">注意</view>
      <view class="text">· 全部线路目前仅工作日运行，周末/节假日时刻表待公布</view>
      <view class="text">· 标有"就餐"的车次走就餐专线，站点与普通环线1路不同</view>
      <view class="text">· 高超楼是系统工程学院所在地，就餐专线在此发车，接驳1路/2路均经过</view>
    </view>

    <view class="section">
      <view class="section-title">网页版</view>
      <view class="text">本应用另有 H5 网页版（可添加到手机主屏幕）：</view>
      <text class="link" selectable user-select>https://campus-bus.github.io/bus/</text>
      <view class="tip">长按链接可复制</view>
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
.about-page { padding: 32rpx 24rpx; }
.header { text-align: center; padding: 32rpx 0 40rpx; }
.app-name { font-size: 44rpx; font-weight: 700; color: #1A56DB; }
.version { font-size: 24rpx; color: #6B7280; margin-top: 8rpx; }
.section { background: #fff; border-radius: 16rpx; padding: 24rpx; margin-bottom: 16rpx; }
.section-title { font-size: 28rpx; font-weight: 600; margin-bottom: 12rpx; }
.text { font-size: 26rpx; color: #6B7280; line-height: 1.7; }
.link { display: block; font-size: 26rpx; color: #1A56DB; margin-top: 10rpx; word-break: break-all; }
.tip { font-size: 22rpx; color: #9CA3AF; margin-top: 8rpx; }
.feedback { text-align: center; }
.feedback .section-title { text-align: left; }
.feedback .text { text-align: left; }
.dev { background: #FAFAFA; border: 1rpx dashed #D1D5DB; }
.dev-btn { margin-top: 16rpx; text-align: center; font-size: 26rpx; color: #6B7280; border: 1rpx solid #D1D5DB; border-radius: 999rpx; padding: 14rpx; }
.dev-exit { margin-top: 12rpx; text-align: center; font-size: 24rpx; color: #9CA3AF; }
</style>
