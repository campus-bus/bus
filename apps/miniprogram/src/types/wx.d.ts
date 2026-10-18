/**
 * 微信小程序原生全局对象声明
 *
 * @dcloudio/types 只提供 uni.* 的类型，不含 wx.*，
 * 而本项目在用到微信原生能力（云开发、隐私授权、前台持续定位）时需要直接调用 wx.*。
 * 这里只声明实际用到的部分，避免整个项目报 "Cannot find name 'wx'"。
 */
declare const wx: {
  /** 云开发 */
  cloud: {
    init(opts: { env: string; traceUser?: boolean }): void
    database(): any
    callFunction(opts: { name: string; data?: Record<string, unknown> }): Promise<any>
  }
  /** 获取用户已授权的 scope 列表 */
  getSetting(opts: {
    success?: (res: { authSetting: Record<string, boolean | undefined> }) => void
    fail?: (err: unknown) => void
  }): void
  /** 开启小程序进入前台时接收位置消息 */
  startLocationUpdate(opts?: {
    type?: 'wgs84' | 'gcj02'
    success?: () => void
    fail?: (err: { errMsg?: string }) => void
  }): void
  /** 关闭位置消息接收 */
  stopLocationUpdate(opts?: { success?: () => void; fail?: (err: unknown) => void }): void
  /** 监听实时地理位置变化 */
  onLocationChange(listener: (res: { latitude: number; longitude: number; accuracy?: number }) => void): void
  /** 取消监听实时地理位置变化 */
  offLocationChange(listener?: (res: { latitude: number; longitude: number; accuracy?: number }) => void): void
  /** 模拟隐私接口调用，用于在调用真实隐私接口前同步隐私协议同意状态（基础库 2.32.3+） */
  requirePrivacyAuthorize?: (opts: { success?: () => void; fail?: (err: unknown) => void }) => void
  /** 打开《用户隐私保护指引》页面（基础库 2.32.3+） */
  openPrivacyContract?: (opts?: { success?: () => void; fail?: (err: unknown) => void }) => void
}
