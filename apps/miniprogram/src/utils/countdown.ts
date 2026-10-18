/**
 * 倒计时显示逻辑
 *
 * 规则：
 * - 每 1 秒刷新
 * - 到站：显示 10 分钟内的车次
 * - 发车：显示 30 分钟内的车次
 */

export type CountdownStatus = 'normal' | 'warning' | 'urgent' | 'arrived' | 'passed'

export interface CountdownItem {
  secondsUntil: number          // 实际剩余秒数
  label: string                  // 显示文字
  status: CountdownStatus        // 颜色状态
}

/**
 * 将秒数向上取整到整数秒
 */
function snapTo1(seconds: number): number {
  return Math.ceil(seconds)
}

/**
 * 格式化倒计时显示文字
 */
function formatSeconds(snapped: number): string {
  if (snapped <= 0) return ''
  const min = Math.floor(snapped / 60)
  const sec = snapped % 60
  if (min === 0) return `${sec}秒`
  if (sec === 0) return `${min}分钟`
  return `${min}分${sec}秒`
}

/**
 * 到站倒计时
 * @param secondsUntil 实际剩余秒数（可为负数）
 * @returns { label, status }
 */
export function arrivalCountdown(secondsUntil: number): CountdownItem {
  if (secondsUntil < -300) {
    return { secondsUntil, label: '', status: 'passed' }  // 已过站超5分钟，移除
  }
  if (secondsUntil <= 15 && secondsUntil >= 0) {
    return { secondsUntil, label: '已到站', status: 'arrived' }
  }
  if (secondsUntil < 0) {
    return { secondsUntil, label: '已过站', status: 'passed' }
  }

  const snapped = snapTo1(secondsUntil)
  const label = formatSeconds(snapped) + '后到站'

  let status: CountdownStatus = 'normal'
  if (snapped < 120)  status = 'urgent'    // < 2分钟 红色
  else if (snapped < 300) status = 'warning'  // 2-5分钟 橙色

  return { secondsUntil, label, status }
}

/**
 * 发车倒计时
 * 显示 30 分钟内的车次，15s 步进
 */
export function departureCountdown(secondsUntil: number): CountdownItem {
  if (secondsUntil < -300) {
    return { secondsUntil, label: '', status: 'passed' }  // 已发车超5分钟，移除
  }
  if (secondsUntil < 0) {
    return { secondsUntil, label: '已发车', status: 'passed' }  // 发车后 15s~1min
  }
  if (secondsUntil <= 15) {
    return { secondsUntil, label: '发车中', status: 'arrived' }  // 0~15秒
  }

  const snapped = snapTo1(secondsUntil)
  const label = formatSeconds(snapped) + '后发车'

  let status: CountdownStatus = 'normal'
  if (snapped < 120)  status = 'urgent'
  else if (snapped < 300) status = 'warning'

  return { secondsUntil, label, status }
}
