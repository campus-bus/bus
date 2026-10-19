/**
 * 运行时配置
 *
 * 天气数据来自腾讯位置服务 WebService API
 * （个人开发者免费额度 1 万次/天，无需付费、无需云开发）。
 *
 * 启用步骤：
 * 1. 打开 https://lbs.qq.com/dev/console/application/mine 注册个人开发者并完成实名
 * 2. 创建应用 → 添加 Key → 只勾选「WebServiceAPI」
 * 3. 把 Key 填到下面，并在小程序后台
 *    「开发管理 → 开发设置 → 服务器域名 → request 合法域名」添加 https://apis.map.qq.com
 * 4. 重新编译
 *
 * 留空时首页不显示天气，其余功能完全不受影响。
 */
export const TENCENT_LBS_KEY = 'QNABZ-3MULC-S6X2Q-A2W65-2KFGO-67BWY'
