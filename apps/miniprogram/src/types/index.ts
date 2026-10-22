// ====== 核心数据模型 ======

/** 日期类型 */
export type DateType = 'weekday' | 'weekend_holiday'

/** 线路名称 */
export type RouteName = '环线1路' | '接驳1路' | '接驳2路'

/** 路线键（4组路线模式）
 * HX1_NORMAL  环线1路（公交，仅工作日）
 * HX1_DINING  就餐专线（公交，仅工作日就餐时段）
 * JB1_NORMAL  接驳1路（顺时针环线）
 * JB2_NORMAL  接驳2路（逆时针环线，与 JB1 同物理环反向）
 */
export type RouteKey =
  | 'HX1_NORMAL'
  | 'HX1_DINING'
  | 'JB1_NORMAL'
  | 'JB2_NORMAL'

/** 数据可信度 */
export type Confidence = 'confirmed' | 'speculative'

/** 发车记录 */
export interface Departure {
  recordId: string
  dateType: DateType
  route: RouteName
  shiftName: string
  tripSeq: number
  departureTime: string
  departureMinutes: number
  departureStation: string
  isGaochaoDeparture: boolean
  routeKey: RouteKey
  patternName: string
  driver: string
  vehicleNo: string
  confidence: Confidence
  remark: string
}

/** 路线站点参数 */
export interface RouteStop {
  routeStopKey: string
  routeKey: RouteKey
  stopSeq: number
  prevStop: string
  currentStop: string
  distanceKm: number
  finalSegmentSeconds: number
  cumulativeSeconds: number
  isDepartureStop: boolean
  isReturnStop: boolean
}

/** 路线模式 */
export interface RoutePattern {
  routeKey: RouteKey
  route: RouteName
  patternName: string
  departureStation: string
  totalSeconds: number
  stopCount: number
  stops: RouteStop[]
}

/** 站点 */
export interface Station {
  name: string
  serviceRoutes: string
  locationNote?: string
  remark?: string
  lat: number
  lng: number
}

/** 预计算到站预测 */
export interface ArrivalPrediction {
  departureId: string
  dateType: DateType
  route: RouteName
  shiftName: string
  tripSeq: number
  departureTime: string
  departureMinutes: number
  departureStation: string
  routeKey: RouteKey
  stopSeq: number
  stopName: string
  cumulativeSeconds: number
  arrivalMinutes: number
  arrivalTime: string
  isDepartureStop: boolean
  isReturnStop: boolean
  driver: string
  vehicleNo: string
  confidence: Confidence
  remark?: string
}

/** 多起点乘车方案（首页目的地卡片右侧的四行信息） */
export interface RideInfo {
  /** 步行到上车站的提示文案 */
  walkLabel: string
  candidateStop: string
  /** 步行时间可能赶不上这班车 */
  walkWarning?: boolean
  boardTime: string
  isOriginDeparture: boolean
  boardLabel: string
  boardStatus: string
  destTime: string
  destStop: string
}

/** 公交车实时位置 */
export interface BusPosition {
  departureId: string
  route: RouteName
  routeKey: RouteKey
  shiftName: string
  vehicleNo: string
  lat: number
  lng: number
  fromStop: string
  toStop: string
  progress: number
  heading: number
}
