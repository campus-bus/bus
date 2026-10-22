/**
 * 线路展示常量（全项目唯一来源）
 *
 * 改动前：index / map / schedule / BusStopTimeline 各自写了一份 ROUTE_COLORS、
 * routeColor()、routeName()、车辆图标映射，改一种颜色要改四处，极易漏改。
 * 现在全部收在这里，页面只引用，不再自己定义。
 */
import type { RouteKey } from '@/types'

/** 四条路线模式的展示色（与 App.vue 的 --color-route-* 变量同值） */
export const ROUTE_COLORS: Record<RouteKey, string> = {
  HX1_NORMAL: '#2563EB',
  HX1_DINING: '#F59E0B',
  JB1_NORMAL: '#10B981',
  JB2_NORMAL: '#8B5CF6',
}

/** 中性灰：未知 routeKey 的兜底色（正常数据不会走到这里） */
const NEUTRAL_COLOR = '#6B7280'

/** 取线路色 */
export function routeColorOf(routeKey?: string): string {
  return (routeKey && ROUTE_COLORS[routeKey as RouteKey]) || NEUTRAL_COLOR
}

/**
 * 卡片 / 面板上展示的线路短名。
 * 就餐专线不是独立 route（数据里 route 仍是「环线1路」），单独标出以免误解。
 */
export function routeLabelOf(dep: { route?: string; routeKey?: string }): string {
  if (dep.routeKey === 'HX1_DINING') return '环1·就餐'
  return dep.route || ''
}

/** 车辆图标（按路线区分车头外观，与地图 marker 共用） */
const BUS_ICON: Record<RouteKey, string> = {
  HX1_NORMAL: '/static/icons/环线1路.png',
  HX1_DINING: '/static/icons/就餐专线.png',
  JB1_NORMAL: '/static/icons/接驳1路.png',
  JB2_NORMAL: '/static/icons/接驳2路.png',
}

/** 取车辆图标；未知路线按环线1路处理 */
export function busIconOf(routeKey?: string): string {
  return (routeKey && BUS_ICON[routeKey as RouteKey]) || BUS_ICON.HX1_NORMAL
}
