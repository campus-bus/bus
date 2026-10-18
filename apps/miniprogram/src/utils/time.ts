import { useGlobalTime } from '@/stores/global-time'

/**
 * 返回当前时间（模拟或真实）
 * 全站统一入口：所有 `new Date()` 都应替换为此调用。
 * 与 H5 版行为一致，支持全局时间覆写（调试用）。
 */
export function getNow(): Date {
  try {
    const store = useGlobalTime()
    return store.getNow()
  } catch {
    return new Date()
  }
}
