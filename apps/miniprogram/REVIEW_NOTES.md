# 审阅说明（第 8 版送审包 · v1.0.1）

本文件只送审阅用，随源码一起提供，帮助快速定位「这轮改了什么、怎么自己验证、哪些不是缺陷」。

## 本轮（v1.0.1）：修复「右上角没有转发入口」

**这是真缺陷，且是上一版送审包（第 7 版）里存在、但静态阅读看不出来的问题。**

上一版 `src/utils/share.ts` 用 `useShare()` 封装了 `onShareAppMessage` / `onShareTimeline`，
首页、行程页、地图页都调用了它。**从代码上看完全正确，运行期也不报任何错，但微信右上角
`···` 菜单里没有「转发给朋友」**，群聊/好友这条入口实际是断的。

### 根因（uni-app 编译期机制，不是调用写法问题）

`node_modules/@dcloudio/uni-mp-vite/dist/plugins/runtimeHooks.js`（插件名 `uni:mp-runtime-hooks`）
**用正则扫描「页面文件自身的源码」**，匹配到 `onShareAppMessage` / `onShareTimeline` 这些**字面量**，
才给页面组件补上 `__runtimeHooks` 位掩码：

```js
const matches = source.match(new RegExp(`(${Object.keys(MINI_PROGRAM_PAGE_RUNTIME_HOOKS).join('|')})`, 'g'));
if (!matches) {
    return null;             // ← 匹配不到就什么都不加
}
```

运行时侧（`@dcloudio/uni-mp-weixin` 的 `uni.mp.esm.js`）里，`onShareAppMessage` / `onShareTimeline`
**不在**自动注入的 `PAGE_INIT_HOOKS` 列表里（源码第 219–222 行是注释掉的），只能靠
`initRuntimeHooks(pageOptions, vueOptions.__runtimeHooks)` 按位加进去。

于是：钩子调用被藏进 `utils/share.ts` 后，页面源码里只剩 `useShare()` 五个字，正则匹配不到
→ 位掩码不生成 → 微信 Page options 里没有转发钩子 → 菜单项灰掉。**全程无报错**，
所以只读代码或只看控制台都会误判为「已配置」。

### 修法

- `src/utils/share.ts` 改为**只导出常量** `SHARE_TITLE` / `SHARE_PATH`，不再注册钩子
  （文件头注释写明原因，防止以后再被封装回去）
- `pages/index` / `pages/schedule` / `pages/map` / `pages/about` 各自
  `import { onShareAppMessage, onShareTimeline } from '@dcloudio/uni-app'`，
  在 `<script setup>` **顶层直接调用**
- 落地页固定为 `/pages/index/index`：好友点开都是首页，不依赖原页面状态
- 版本号 `1.0.0` → `1.0.1`

### 如何自己验证（可量化，不依赖肉眼）

```bash
cd apps/miniprogram && npm run build:mp-weixin
# 1) 编译期：产物里必须出现位掩码 = 6（2=好友，4=朋友圈）
node -e "const s=require('fs').readFileSync('dist/build/mp-weixin/pages/index/index.js','utf8');console.log(/__runtimeHooks=(\d+)/.exec(s)?.[1])"
# 期望输出 6；index / schedule / map / about 四页都应是 6

# 2) 运行时：微信 Page 实例上必须是 function
#    （用 miniprogram-automator 在开发者工具里执行）
#    getCurrentPages().at(-1).onShareAppMessage   → 'function'
#    getCurrentPages().at(-1).onShareTimeline      → 'function'
```

第 7 版送审包实测：四页位掩码**均未生成**，运行时两者都是 `undefined`。
本版实测：四页位掩码均为 `6`，运行时两者均为 `function`。

对照实验（用于确认根因）：给第 7 版的产物**仅**注入一句 `__runtimeHooks=6`（不动任何业务代码），
同一页面立即从 `undefined` 变成 `function`。

### 平台限制（非缺陷）

`onShareTimeline`（分享到朋友圈）微信目前**仅 Android 支持**，iOS 上即使配置正确也没有入口。
这是微信平台限制，不作为缺陷处理。

---

## 包结构与运行前提

- 包根目录 = 仓库的 `apps/miniprogram/`（小程序全部源码，可直接导入微信开发者工具）
- `_upstream_data/` = 仓库根的上游数据链路（WGS-84 源数据 + 数据生成脚本），**不是小程序运行代码**，
  运行方式见 `_upstream_data/README.md`（需先还原仓库布局）
- 已排除：`node_modules/`、`dist/`、`dev-build.log`、开发截图、接口申请截图（均可重建或与代码无关）

## 上一版（第 7 版）：记录页三条 + 行程规划

送审依据是 `miniprogram-full-source(4).zip`，其中的行程规划问题已在第 6 版修复；这一版按同一份验收报告
补齐了记录功能的三条。三条都在真实数据/真实页面上复现过，不是按描述改的。

### 1. 记录中退出页面再进入，计时与提交入口会消失（已修）

**根因**：`boardIdx`（上车站索引）与 `selectedRoute`（本次记录的线路）都只是页面级 `ref`，
而记录页是 `navigateTo` 打开的非 tab 页，返回即销毁。重进时 `boardIdx` 归 `-1`、
线路回默认「环线1路」，但 store 里的段数据还在：页面不显示计时进度和提交区，
此时点「上车」会走 `startRecordingAt()` **清空已采集的段**（真实采样十几分钟全部作废）；
即使侥幸提交，站序属于旧线路、站名列表属于新线路，数据整体错位。

**修法**：`boardIdx` / `recordingRoute` 移入 `stores/upload.ts`，`timingActive` 改为
`computed(() => boardIdx >= 0)` 派生（两者不可能再不一致）；记录页线路初值取
`uploadStore.recordingRoute || '环线1路'`。

**验证**：automator 在真实页面走完整路径
（首页 navigateTo → 接驳2路 → 第4站上车 → 计时1段 → navigateBack → 再 navigateTo），13 项断言全通过：
重进后标题仍是「到站请点『计时』」、提交区仍在且显示「已记录 1 段」、不再出现「上车」按钮、
线路仍为「接2」、第4站后的段耗时已渲染。

### 2. 记录页「下一班」混用了其他线路的到站时间（已修）

**根因**：`record.vue` 遍历 `scheduleStore.departures` 时只过滤日期类型，没有过滤 `routeKey`。
同名站在不同线路可能**站序恰好相同**：「军体活动中心东」在环线1路与接驳2路都是第 4 站。

**实测**（真实数据，工作日 07:00、选中接驳2路）：

| | 第 4 站下一次到站 |
|---|---|
| 修复前（全线路） | 07:33:27（来源：**环线1路 07:30 第一班**） |
| 修复后（仅接驳2路） | 07:48:00 |

差 15 分钟，「下一班」标记会指向错误方向，用户按它上车后整条计时链都记到错误路段。

**修法**：抽成 `utils/stop_seq.ts` 的 `collectStopArrivals()`，强制按 `routeKey` 过滤；
`record.vue` 改用它。新增断言 X1–X4：X1 锁定 07:48:00、X2 锁定环线1路的 07:33:27（证明站序会撞车）、
X3 要求两者不同（过滤失效会立刻红）、X4 要求结果只含本线路班次。

### 3. 复制校准文本用的是提交时刻，不是上车时刻（已修）

**根因**：`buildCalibrationText()` 用 `new Date(rec.created_at)`（提交时刻）。
10:00 上车、10:15 提交会写成 10:15，后续按文本回溯班次会对应到错误的那一趟。
（记录里其实已存了 `depart_time`＝上车时刻，只是没被使用；历史卡片显示同样是 `created_at`。）

**修法**：格式化抽成 `utils/measurement.ts`（纯函数）：
`boardingClock()` 优先取 `depart_time`，旧记录没有该字段时回退提交时刻（不编造时间），
并兼容「7:30」这类未补零的历史写法；`calibrationRows()` 生成文本。
历史卡片与复制文本现在用**同一个**上车时刻。

**验证**：断言 Y1–Y5（10:00/10:15 场景、站序保留、旧记录回退、未补零兼容、两处一致）；
另在真实页面提交一条记录并读回本地存储，确认 `depart_time`、`routeKey`、
段站序（`军体活动中心东#4→网球场#5`）均正确落库（6 项断言）。

### 上一版已修（本版仍包含）

- 行程规划推荐今天已错过的班次（`utils/plan_window.ts` 的 `isCatchable()`，W1–W6）
- 定位隐私说明与实际持续定位行为对齐；首页校园外提示卡的 `null` 站点插值
- 生产构建与包体积：`vue-tsc` 0 错误、`build:mp-weixin` 成功、主包 1.17 MB、
  `requiredPrivateInfos` 三接口齐备

## 更早（第 6 版）：最终上线评估提出的三条

上一轮评估提出「1 个必修 + 2 个顺带」，三条全部处理，并补上了评估环境做不了的生产构建验证。

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

## 更早（第 5 版）：第四轮复核之后的修改

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
| 分享落地页统一为首页 | 三类页面发起分享都落到首页，避免好友打开时缺原页面状态（如行程页的查询条件）。属刻意取舍，不是遗漏 |
| iOS 无「分享到朋友圈」 | 微信平台限制，`onShareTimeline` 目前仅 Android 生效，不作为缺陷 |
| 记录页未配置转发 | 维护者专用页（口令进入），不需要对外分享入口 |
| 未做真机验收 | 模拟器与真机行为差异已知（见下），不作为「已验证」声明 |

## 已知未覆盖

- 真机：隐私弹窗期间的页面切换、系统级关闭定位、真实前后台切换——模拟器无法提供真实弹窗与前后台事件
- 微信原生权限弹窗的调度顺序、开发者工具与真机 `onLocationChange` 时序差异
- 云开发已全面移除（2026-10-19），包里不再有 `cloudfunctions/`，`docs/archive/` 仅为历史存档

## 本地自验清单（全部通过后才送审）

```bash
node scripts/test_scenarios.cjs     # 32 通过
node scripts/test_core_logic.mjs    # 64 通过（直接 import 小程序源码真实模块；W=行程规划 X=记录页下一班 Y=校准文本）
node scripts/check_coord.js         # 10 通过（370 个坐标全量比对）
node scripts/test_geo_state.mjs     # 17 通过（持续定位状态机）
cd apps/miniprogram && npx vue-tsc --noEmit   # 0 错误
cd apps/miniprogram && npm run build:mp-weixin # DONE，主包 1.18 MB
# 转发钩子：四页产物 __runtimeHooks 均为 6，运行时 onShareAppMessage/onShareTimeline 均为 function
```

## 已知未覆盖（补充）

- 记录中途小程序被系统杀掉：计时状态在内存 store 里，杀进程即丢失（页面返回/切页已覆盖）。
  要跨进程恢复需把 `recordedSegments` 与 `boardingTime` 落 storage 并加时间上限，属独立改动，本轮未做。

## 仍需真机/后台确认（代码侧无法覆盖）

- **转发真机验证**：本版的转发钩子只在开发者工具里通过 automator 断言（编译期位掩码 + 运行时
  `typeof` 均为 `function`）。微信原生 `···` 菜单项是否真的出现、分享卡片点开后是否正确进入首页，
  需在真机体验版上点一次确认（开发者工具无法渲染原生菜单）
- 微信后台的 `getLocation`、`startLocationUpdate`、`onLocationChange` 接口权限与隐私指引是否已通过配置/审批
- 体验版真机：拒绝定位仍可查时刻、快速切页、授权弹窗期间切走、前后台恢复
- 腾讯地图 Key 的额度与域名限制（Key 在前端属于已知取舍，非本轮阻断项）
