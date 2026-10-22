# 数据生成链路（仓库根目录，不在小程序包内）

这个目录是从仓库根拷进来的**上游数据脚本**，不属于小程序运行代码，`apps/miniprogram` 构建时完全不需要它。
放进来只是为了回答「内置 `src/data/*.json` 是怎么来的、以后怎么改」。

## ⚠️ 不能直接在本压缩包根目录运行

下面所有脚本都按**仓库布局**找文件（`public/data`、`apps/miniprogram/src`、`scripts/lib`），
而本目录在压缩包里叫 `_upstream_data/`。要实际执行，先还原仓库布局：

```powershell
# PowerShell（项目主环境），在解压后的目录里执行
New-Item -ItemType Directory -Force scripts, public, apps/miniprogram | Out-Null
Copy-Item _upstream_data\scripts\* scripts\ -Recurse -Force
Copy-Item _upstream_data\public\data public\data -Recurse -Force
# 压缩包根目录的 src/ 就是小程序源码，整体放回 apps/miniprogram/src 即可
Copy-Item src apps\miniprogram\src -Recurse -Force
```

```bash
# bash（Linux / macOS）等价写法
mkdir -p scripts public apps/miniprogram
cp -r _upstream_data/scripts/* scripts/
cp -r _upstream_data/public/data public/data
cp -r src apps/miniprogram/src
```

还原后才能跑下面的命令。`check_coord.js` 也要读两端的 JSON 做逐一比对，
`test_core_logic.mjs` 要 import `apps/miniprogram/src/utils/*.ts`，所以两者都依赖这个布局。

## 目录对应关系

| 压缩包里 | 仓库里的真实路径 | 作用 |
|---|---|---|
| `_upstream_data/scripts/sync_miniprogram_data.js` | `scripts/sync_miniprogram_data.js` | 把 `public/data/*.json`（WGS-84）压缩 + 转成 GCJ-02，写入 `apps/miniprogram/src/data/` |
| `_upstream_data/scripts/lib/coord.js` | `scripts/lib/coord.js` | WGS-84 → GCJ-02 转换的**唯一实现**，启动时自检偏移量 |
| `_upstream_data/scripts/check_coord.js` | `scripts/check_coord.js` | 坐标一致性回归：冻结锚点快照 + 全部 370 个坐标逐一比对（能识别双重转换） |
| `_upstream_data/scripts/regenerate_predictions.js` | `scripts/regenerate_predictions.js` | 按 `route_params.json` 重新生成 `arrival_predictions.json` |
| `_upstream_data/scripts/test_scenarios.cjs` | `scripts/test_scenarios.cjs` | 数据层回归断言（节假日、环线首尾同站、最优上下车组合等） |
| `_upstream_data/scripts/test_core_logic.mjs` | `scripts/test_core_logic.mjs` | 核心逻辑回归：直接 import 小程序源码里的 TS 模块，测的是线上实现 |
| `_upstream_data/scripts/test_geo_state.mjs` | `scripts/test_geo_state.mjs` | 持续定位状态机回归：假端口重放 `startLocationUpdate` 回调晚到等交错顺序 |
| `_upstream_data/public/data/*.json` | `public/data/*.json` | 源数据（**WGS-84**，供 H5 卫星地图使用） |

> `test_core_logic.mjs` 与 `test_geo_state.mjs` 都用 Node 的 TypeScript 类型擦除直接 `import`
> 小程序源码，因此必须能找到 `apps/miniprogram/src/` 下的 `.ts`——`test_core_logic.mjs` 读
> `src/utils/*.ts`，`test_geo_state.mjs` 读 `src/composables/watch_machine.ts`
> （所以上面还原布局时要把「压缩包根目录的 `src/`」整体放回 `apps/miniprogram/src`）。
> Node 需 ≥ 22.6（`--experimental-strip-types`）；Node 23.6+ 默认开启，本项目用 Node 24。

## 坐标系（最容易踩的坑）

- `public/data/*.json` = **WGS-84**（H5 版卫星底图、浏览器 GPS 都是 WGS-84）
- `apps/miniprogram/src/data/*.json` = **GCJ-02**（微信定位、腾讯地图同源）

转换只发生在 `sync_miniprogram_data.js` 里，运行时两端都**零转换**。
把 WGS-84 数据直接手工粘进小程序目录、或反过来，长沙地区会产生约 **670m** 的固定偏移
（实测 18 个站点里 14 个会被误判到别的站）。

## 改数据的正确流程

```bash
# 1. 改 public/data/ 下的源 JSON（发车时刻、站点、路径）
# 2. 如果改了站间秒数或发车时刻，重新生成预测
node scripts/regenerate_predictions.js
# 3. 同步到小程序（压缩 + 坐标转换）
node scripts/sync_miniprogram_data.js
# 4. 四项校验，缺一不可
node scripts/test_scenarios.cjs     # 数据层断言
node scripts/test_core_logic.mjs    # 核心逻辑（直接 import 小程序源码）
node scripts/check_coord.js         # 坐标一致性（锚点快照 + 370 点全量比对）
node scripts/test_geo_state.mjs     # 持续定位状态机（改 useGeolocation / watch_machine 后必跑）
```

**为什么坐标要单独一项校验**：`coord.js` 的 `selfCheck()` 只看「偏移量是否在 550-800m」，
而把 GCJ-02 再转一次（双重转换）偏移同样是约 672m，照样通过。
只有 `check_coord.js` 的绝对坐标快照能区分「转了一次」和「转了两次」。

**不要手改 `apps/miniprogram/src/data/*.json`**：它是生成产物，下一次同步会被覆盖，
而且手改时很容易忘掉坐标转换。
