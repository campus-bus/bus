/**
 * 开发者模式开关
 *
 * 记录功能只对维护者开放：普通用户看不到入口，也无法进入记录页。
 * 说明：这里的口令只是"藏起来"，防止误入，并不作为安全边界
 * （前端代码总能被反编译），记录页本身也不包含任何敏感信息。
 */
const DEV_KEY = 'dev_unlocked'
/** 与 H5 管理面板保持一致 */
const DEV_PASSWORD = '250030'

/** 是否已解锁开发者模式 */
export function isDevUnlocked(): boolean {
  return uni.getStorageSync(DEV_KEY) === '1'
}

/** 校验口令，成功则持久化解锁状态 */
export function unlockDev(password: string): boolean {
  if (password.trim() !== DEV_PASSWORD) return false
  uni.setStorageSync(DEV_KEY, '1')
  return true
}

/** 退出开发者模式 */
export function lockDev() {
  uni.removeStorageSync(DEV_KEY)
}
