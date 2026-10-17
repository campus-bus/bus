# src/composables/ — 组合式函数

| 文件 | 职责 |
|------|------|
| `useNextBus.ts` | 首页核心计算：即将到站（10 分钟窗）、附近站到站、即将发车（60 分钟窗）；统一过滤 `isDepartureStop`/`isReturnStop`，过站 5 分钟（-300s）移除 |
| `useGeolocation.ts` | GPS watchPosition 封装：精度 >500m 丢弃（桌面 Wi-Fi 定位 100-400m）；位置模拟激活时用模拟坐标并忽略真实 GPS；GPS 返回 WGS-84 直接存储 |
| `useVisitorTracking.ts` | 匿名访问埋点：localStorage UUID 作为 visitor_id，每次访问写 Supabase `visits` 表（日活靠 DISTINCT 去重）；设备类型 ios/android/desktop 检测 |
| `useWeather.ts` | Open-Meteo 免费 API 取天气（当前温度+当日最高最低），WMO 天气码 → emoji |
| `useInstallPrompt.ts` | PWA 添加主屏幕提示（standalone 不弹、"不再提示"永久记忆、3 秒延迟） |
| `useOnlineStatus.ts` | online/offline 事件 → isOnline |
| `useAutoRecord.ts` | ⚠️ 自动记录逻辑（GPS 到站/离开检测、错站恢复、wakeLock），UI 已隐藏，代码保留备用 |

## 约定

- 获取当前时间一律 `getNow()`（`utils/time.ts`），兼容全局时间覆写
-  composable 中用到 store 时在函数体内调用 `useXxxStore()`，不要模块级调用（Pinia 未初始化会报错）
