<script setup lang="ts">
import { useScheduleStore } from '@/stores/schedule'

const scheduleStore = useScheduleStore()
</script>

<template>
  <div class="about-page">
    <div class="about-header">
      <h1>环线坐车</h1>
      <p class="version">v1.0.0</p>
    </div>

    <div class="section">
      <h3>关于</h3>
      <p>
        校园环线公交车时刻表查询与到站预测应用。支持环线1路、就餐专线、接驳1路（顺时针）、接驳2路（逆时针）的发车时刻查询、站点到站预测和地图可视化。
      </p>
    </div>

    <div class="section">
      <h3>数据说明</h3>
      <p>
        到站时间为根据路线距离、校园限速和发车时刻估算，实际时间可能受上下客、道路情况和车辆调度影响。
      </p>
      <br />
      <p>
        接驳1路（顺时针）、接驳2路（逆时针）为同一环线的两个运行方向，线路站点相同、方向相反。
      </p>
    </div>

    <div class="section">
      <h3>使用提示</h3>
      <ul>
        <li>添加本页到手机桌面可获得 App 般的体验</li>
        <li>开启 GPS 定位可自动查找最近站点</li>
        <li>支持离线查时刻表（地图需联网）</li>
      </ul>
    </div>

    <div class="section">
      <h3>注意</h3>
      <ul>
        <li>环线1路仅在<strong>工作日</strong>运行</li>
        <li>标有"就餐"的车次走就餐专线，站点与普通环线1路不同</li>
        <li>高超楼是系统工程学院所在地，就餐专线在此发车，接驳1路/2路均经过</li>
      </ul>
    </div>
    <div class="section feedback">
      <h3>反馈意见</h3>
      <p>如有建议或问题，欢迎填写问卷：</p>
      <a class="survey-link" href="https://v.wjx.cn/vm/thRw5hx.aspx" target="_blank" rel="noopener">
        <van-icon name="smile-comment-o" />
        <span>使用反馈问卷 →</span>
      </a>
    </div>
  </div>
</template>

<style scoped>
.about-page {
  padding: 24px 16px;
  max-width: 480px;
  margin: 0 auto;
}

.about-header {
  text-align: center;
  padding: 20px 0 30px;
}
.about-header h1 {
  font-size: 24px;
  color: var(--color-primary);
}
.version {
  color: var(--color-text-secondary);
  font-size: 14px;
  margin-top: 4px;
}

.section {
  background: var(--color-card);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 12px;
}
.section h3 {
  font-size: 15px;
  margin-bottom: 8px;
}
.section p,
.section li {
  font-size: 14px;
  color: var(--color-text-secondary);
  line-height: 1.6;
}
.section ul {
  padding-left: 18px;
}
.section li {
  margin-bottom: 4px;
}

.spec-label {
  display: inline-block;
  padding: 0 6px;
  background: #FEF3C7;
  color: #92400E;
  border-radius: 4px;
  font-size: 12px;
}

.feedback {
  text-align: center;
}
.survey-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  padding: 10px 20px;
  background: var(--color-primary);
  color: #fff;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
  transition: opacity 0.15s;
}
.survey-link:active { opacity: 0.8; }
</style>
