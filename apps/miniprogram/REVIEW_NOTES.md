# 审阅说明（第 5 版送审包）

本文件只送审阅用，随源码一起提供，帮助快速定位「这轮改了什么、怎么自己验证、哪些不是缺陷」。

## 包结构与运行前提

- 包根目录 = 仓库的 `apps/miniprogram/`（小程序全部源码，可直接导入微信开发者工具）
- `_upstream_data/` = 仓库根的上游数据链路（WGS-84 源数据 + 数据生成脚本），**不是小程序运行代码**，
  运行方式见 `_upstream_data/README.md`（需先还原仓库布局）
- 已排除：`node_modules/`、`dist/`、`dev-build.log`、开发截图、接口申请截图（均可重建或与代码无关）

## 本轮（第四轮复核之后）的修改

### 1. 修复持续定位状态机卡死（对应第四轮 P1，确认为真缺陷）

**根因**：旧 `syncWatch()` 一进来就 `++watchEpoch`，导致「已在启动中」的提前返回之前也把版本号改了。
`wx.startLocationUpdate` 的回调回来后发现版本不匹配就退出，而 `startingWatch` 仍为 `true`，
此后每次 sync 都在 `if (watching || startingWatch) return` 处返回——**监听再也不会建立，且全程无报错**。

触发门槛比报告描述的更低：不需要离开页面。`src/pages/map/map.vue` 的 `onShow` 里
`initLocation()` 的 `wx.getSetting` 回调与 `acquireWatch()` 各调一次 `syncWatch()`，
只要本机已有坐标就会触发。

**修法**：把状态机抽成零依赖纯模块 `src/composables/watch_machine.ts`（不 import vue/uni/wx/store），
**只有确实不该再监听时才自增 epoch**，正常同步不碰版本号。`src/composables/useGeolocation.ts`
保留为「wx 四个副作用 + 响应式状态」的薄封装。

**如何自己验证修复**：

```bash
# 还原仓库布局后（见 _upstream_data/README.md）
node scripts/test_geo_state.mjs
# 期望：17 通过，0 失败
```

该脚本用假端口重放 17 条交错顺序（回调晚到 / 切后台 / 快速往返 / 启动失败 / 授权被拒 / 换页）。
**已验证它能抓到原缺陷**：把 `watch_machine.ts` 里 `sync()` 的 `++epoch` 挪回无条件自增位置，
17 条里会红 3 条，输出与第四轮报告里的模拟结果一致
（`watching:false, startingWatch:true, registered:0`）。

### 2. 隐私授权返回后复核页面归属（对应第四轮 P2，按「禁止」一侧处理）

`requestLocation()` 在 `await ensurePrivacy()` 之后检查「仍有页面持有 && 小程序在前台」，
否则放弃本次 `uni.getLocation` 并打一条 `console.warn`（不静默，便于排查）。
`openSetting()` 的成功回调原先直接 `startWatch()`，现改为走 `syncWatch()`——
该回调同样可能晚于页面离开或切后台到达。

取舍说明：本项目对外声明是「只在停留于位置页且在前台时定位」，故按禁止处理；
若审阅认为应允许「离页后完成已发起的单次定位」，这一处是可以商量的策略点，不影响持续定位合规。

### 3. 记录页细节（功能修复，与前几轮审查无关）

- 修 `record.vue` 同名站（接驳线一圈过两次的「军体活动中心东/网球场/激光所」）回程上车时
  计时起点被跳到去程站的问题：改为按**站序**索引（`utils/stop_seq.ts`），不再用 `indexOf(站名)`
- 「一键上车」改为比较当前时间与到站预测（`nextArrivalsBySeq` / `recommendedPass`），
  用「下一班到站时间」判断眼前这趟是去程还是回程，并让用户确认
- 上车按钮文案统一为「上车」（此前同名站在按钮上追加「· 第N站」，整列长短不齐）

## 刻意设计，请勿记为缺陷

| 项 | 说明 |
|---|---|
| 地图页保留 `isReturnStop`（回程到站） | 用户点站点只想看「哪些车会经过」；首页才过滤回程到站，避免与「即将发车」重复。见首页/地图差异化处理 |
| 地图顶部「距「XX」N 米」HUD | 位置接口申请材料的文案与 3/8–7/8 截图都围绕这行写，删除会导致材料与界面不一致；不要建议移除 |
| 未做真机验收 | 模拟器与真机行为差异已知（见下），不作为「已验证」声明 |

## 已知未覆盖

- 真机：隐私弹窗期间的页面切换、系统级关闭定位、真实前后台切换——模拟器无法提供真实弹窗与前后台事件
- 微信原生权限弹窗的调度顺序、开发者工具与真机 `onLocationChange` 时序差异
- 云开发已全面移除（2026-10-19），包里不再有 `cloudfunctions/`，`docs/archive/` 仅为历史存档

## 本地自验清单（全部通过后才送审）

```bash
node scripts/test_scenarios.cjs     # 32 通过
node scripts/test_core_logic.mjs    # 49 通过（直接 import 小程序源码真实模块）
node scripts/check_coord.js         # 10 通过（370 个坐标全量比对）
node scripts/test_geo_state.mjs     # 17 通过（持续定位状态机）
cd apps/miniprogram && npx vue-tsc --noEmit   # 0 错误
```
