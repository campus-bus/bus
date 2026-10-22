/**
 * 持续定位的状态机（纯逻辑，不依赖 vue / uni / wx / pinia）
 *
 * 为什么单独拆出来：
 * `wx.startLocationUpdate` 是异步的，它的回调可能在「页面已切走」「已切后台」
 * 「另一次启动已经在途」之后才回来。这类交错顺序靠人工推理极易漏，本项目已经
 * 在第四轮外部复核里被打到一次（P1）：
 *   正常的状态同步也自增版本号 → 把仍然需要的那次启动误判成过期 → 回调退出时
 *   startingWatch 一直是 true → 此后 sync() 永远在「已在启动」处返回 → 监听再也不会建立。
 * 拆成不碰 wx 的纯状态机后，`scripts/test_geo_state.mjs` 能用假端口在 Node 里重放
 * 这些顺序，回归成本几乎为零。
 *
 * 三条不变量：
 * 1. 同一时刻最多只有一次 startLocationUpdate 在途（startingWatch 为真）。
 * 2. 监听注册严格跟随 watching：watching 为真时 onLocationChange 恰好挂了一次。
 * 3. 只有「确实不该再监听」时才让在途启动作废（自增 epoch）。
 */

/** 状态机需要的外部副作用。真实实现里是 wx.*，测试里是计数用的假端口 */
export interface WatchPort {
  /** 发起持续定位；完成后回调 ok（失败时带 errMsg） */
  start(done: (ok: boolean, errMsg?: string) => void): void
  /** 停止持续定位 */
  stop(): void
  /** 注册位置变化回调 */
  attach(): void
  /** 注销位置变化回调 */
  detach(): void
}

/** 状态快照，仅供排查与测试断言 */
export interface WatchSnapshot {
  foreground: boolean
  owner: string | null
  want: boolean
  denied: boolean
  shouldWatch: boolean
  watching: boolean
  startingWatch: boolean
  epoch: number
}

export interface WatchMachine {
  /** 前后台切换（onAppShow / onAppHide） */
  setForeground(v: boolean): void
  isForeground(): boolean
  /** 页面开始使用位置（onShow） */
  acquire(owner: string): void
  /** 页面离开（onHide）；只有所有权还在自己手上时才停 */
  release(owner: string): void
  hasOwner(): boolean
  /** 用户意愿：是否希望持续定位 */
  setWant(v: boolean): void
  /** 用户是否已明确拒绝授权 */
  setDenied(v: boolean): void
  isDenied(): boolean
  /** 是否已经在监听，或已有一次启动在途 */
  isActive(): boolean
  /** 让实际状态向「该不该监听」收敛；所有开关都只走这一个入口 */
  sync(): void
  /** 彻底停用（want=false 且放弃所有权） */
  stopAll(): void
  snapshot(): WatchSnapshot
}

/**
 * @param port 真实副作用（wx 接口）
 * @param onStartFail startLocationUpdate 失败回调，用于打日志（不影响单次定位）
 */
export function createWatchMachine(
  port: WatchPort,
  onStartFail?: (errMsg: string) => void
): WatchMachine {
  let foreground = true
  let owner: string | null = null
  let want = false
  let denied = false
  let watching = false
  let startingWatch = false
  let epoch = 0

  /** 四个条件缺一不可：在前台、有页面在用、用户愿意、没被明确拒绝 */
  function shouldWatch(): boolean {
    return foreground && owner !== null && want && !denied
  }

  /** 真正关掉监听。只做「关」这一件事，要不要关由 sync() 决定 */
  function teardown() {
    startingWatch = false
    if (!watching) return
    port.detach()
    port.stop()
    watching = false
  }

  function sync() {
    if (!shouldWatch()) {
      // 只有这里才让在途启动作废：此刻确实没人要监听了
      ++epoch
      teardown()
      return
    }

    // 已在监听、或已有一次启动在途：状态没变，**绝对不能自增 epoch**。
    // 自增会让在途那次的回调认为自己是过期回调而提前退出，可此刻明明还需要它；
    // 退出时 startingWatch 仍是 true，此后每次 sync 都在这里返回，监听再也不会建立。
    // 这就是第四轮复核 P1 的根因。
    if (watching || startingWatch) return

    const token = ++epoch
    startingWatch = true
    port.start((ok, errMsg) => {
      if (!ok) {
        // 过期回调不清 startingWatch：那可能是更新的一次启动的标记
        if (token === epoch) startingWatch = false
        onStartFail?.(errMsg || '')
        return
      }
      if (token === epoch) {
        startingWatch = false
        if (watching) return
        watching = true
        port.attach()
        return
      }
      // 过期回调：期间状态变过。
      // - 若此刻仍需要监听，说明已有更新的一次启动在途，startingWatch 归它，一律别碰；
      // - 若此刻已不需要，就把这次偷偷多开起来的监听收掉。
      if (!shouldWatch()) {
        startingWatch = false
        port.stop()
      }
    })
  }

  return {
    setForeground(v) {
      foreground = v
      sync()
    },
    isForeground: () => foreground,
    acquire(name) {
      owner = name
      sync()
    },
    release(name) {
      if (owner !== name) return
      owner = null
      sync()
    },
    hasOwner: () => owner !== null,
    setWant(v) {
      want = v
    },
    setDenied(v) {
      denied = v
    },
    isDenied: () => denied,
    isActive: () => watching || startingWatch,
    sync,
    stopAll() {
      want = false
      owner = null
      sync()
    },
    snapshot: () => ({
      foreground, owner, want, denied,
      shouldWatch: shouldWatch(), watching, startingWatch, epoch,
    }),
  }
}
