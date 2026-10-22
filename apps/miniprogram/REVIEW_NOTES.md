# 审阅说明（第 6 版送审包）

本文件只送审阅用，随源码一起提供，帮助快速定位「这轮改了什么、怎么自己验证、哪些不是缺陷」。

## 包结构与运行前提

- 包根目录 = 仓库的 `apps/miniprogram/`（小程序全部源码，可直接导入微信开发者工具）
- `_upstream_data/` = 仓库根的上游数据链路（WGS-84 源数据 + 数据生成脚本），**不是小程序运行代码**，
  运行方式见 `_upstream_data/README.md`（需先还原仓库布局）
- 已排除：`node_modules/`、`dist/`、`dev-build.log`、开发截图、接口申请截图（均可重建或与代码无关）

## 本轮（最终上线评估之后）的修改

上一轮评估提出「1 个必修 + 2 个顺带」，本轮三条全部处理，并补上了评估环境做不了的生产构建验证。

### 1. 行程规划不再推荐今天已错过的班次（必修项，已用真实数据复现并修复）

**问题确认**：`doSearch()` 只比较「到达时间 ≤ 期限」，不比较「上车时间 vs 现在」。
我用包内真实数据复刻了评估给出的场景（工作日 20:01、研究生宿舍楼 → 高超楼、20:00 前到达）：
**返回 108 趟，其中 108 趟的上车时间都已过去**（首条是 07:30 上车），与评估结论一致。

**修法**：这条规则抽成纯函数 `src/utils/plan_window.ts` 的 `isCatchable(boardMinutes, nowSeconds, isToday)`，
`doSearch()` 在 `findBestRide()` 之后剔除上车时间已过的班次；**查未来日期时不受当前时间影响**。
总时刻表 tab 保持全量清单，不做过滤（历史班次仍可查）。

边界取「正好到点算已过」（20:01:00 的班次在 20:01 不再推荐），避免让用户去追已经开走的车。

**如何自己验证**：

```bash
node scripts/test_core_logic.mjs   # W1–W6 六条断言，直接 import 真实 isCatchable
```

实测（真实页面，非 mock）：19:30 查默认的 20:00 期限，只返回 2 趟（19:35、19:40 上车），
修复前会返回上百趟从 07:30 开始的已发车次。

### 2. 定位隐私说明与实际行为对齐（必修核对项）

`about.vue` 原文写「仅在你点击允许定位或打开地图页时获取位置」，但实际是**授权后只要停留在首页/地图页
就持续更新**（`startLocationUpdate` + `onLocationChange`），回到首页会自动恢复监听。原文与行为不符，
也与位置接口申请材料里的使用场景描述不一致。

已改为：首次使用需主动授权；授权后停留在首页或地图页时持续更新位置，用于计算附近站点、步行距离与地图定位，
**离开这些页面时立即停止**；并补充「仅前台使用（未申请后台定位能力），切后台立即停止，回前台且仍在上述页面时自动恢复」。

### 3. 首页「null」文案（顺带项）

`outOfCampus` 提示卡位于 `v-if="!selectedStop"` 内，其中的 `selectedStop` **必然为 null**，
所以原句「下面是「null」的到站时刻」在校园外且未选站时**每次都会出现**（不是偶发）。
已改为不引用站名的「可从上方列表手动选择站点查看该站到站时刻」。

### 4. 生产构建与包体积（评估环境因缺依赖未能完成的部分，这边补齐）

```
npx vue-tsc --noEmit            0 错误
npm run build:mp-weixin         DONE Build complete.
主包总体积                      1.17 MB（上限 2 MB）
js 979KB / png 176KB / wxss 23KB / wxml 22KB
app.json                        requiredPrivateInfos = getLocation, startLocationUpdate, onLocationChange
                                permission.scope.userLocation 文案齐备，lazyCodeLoading=requiredComponents
```

> 注意：`requiredPrivateInfos` 在 dev 产物里曾因「同时跑两个 watcher」丢失（见踩坑 12）。
> 本次是**单 watcher** 构建，已逐字段核对产物，不只看构建成功。

## 上一轮（第四轮复核之后）的修改

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
node scripts/test_core_logic.mjs    # 55 通过（直接 import 小程序源码真实模块，本轮新增 W1–W6）
node scripts/check_coord.js         # 10 通过（370 个坐标全量比对）
node scripts/test_geo_state.mjs     # 17 通过（持续定位状态机）
cd apps/miniprogram && npx vue-tsc --noEmit   # 0 错误
```

## 仍需真机/后台确认（代码侧无法覆盖）

- 微信后台的 `getLocation`、`startLocationUpdate`、`onLocationChange` 接口权限与隐私指引是否已通过配置/审批
- 体验版真机：拒绝定位仍可查时刻、快速切页、授权弹窗期间切走、前后台恢复
- 腾讯地图 Key 的额度与域名限制（Key 在前端属于已知取舍，非本轮阻断项）
