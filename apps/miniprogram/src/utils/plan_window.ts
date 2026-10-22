/**
 * 行程规划的「可乘窗口」判断
 *
 * 期限（比如「20:00 前到达」）只约束**何时到达**，不约束**现在几点**。
 * 若只看期限，20:01 查询时 07:30 那趟早已发出的车也会被列出来——用户按它去等车会白等。
 * 所以查「今天」时，上车时间已经过去的班次不应进入结果；查未来日期时车还没开，保持原逻辑。
 *
 * 想查全天班次（含已发出的）仍可用「总时刻表」，那里本来就是全量清单。
 *
 * 抽成纯函数的原因：这条规则是容易回退的业务语义（第四轮之后的复核就是从这里发现的），
 * 放在 .vue 里无法被 Node 直接 import 测试，只能靠人肉复刻判断。
 */

/**
 * @param boardMinutes 该班次在用户上车站的到站（=可上车）时间，距 00:00 的分钟数
 * @param nowSeconds   当前时间距 00:00 的秒数
 * @param isToday      查询的是不是今天
 */
export function isCatchable(boardMinutes: number, nowSeconds: number, isToday: boolean): boolean {
  if (!isToday) return true
  return boardMinutes * 60 > nowSeconds
}
