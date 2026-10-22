/**
 * 全站统一时间入口
 *
 * 所有「取当前时间」都应经过这里，而不是散落 `new Date()`，
 * 便于将来需要统一时钟（模拟时间、时区修正）时只改一处。
 *
 * 历史说明：本文件曾转调 `stores/global-time`（H5 时间覆写面板的 store）。
 * 小程序没有该面板、也没有任何调用方，却让每次取时间都要解析一次 pinia store，
 * 而它每秒被调用十几次，故于 2026-10-22 移除该依赖。
 */
export function getNow(): Date {
  return new Date()
}
