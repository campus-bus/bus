# 已停用的云开发代码

2026-10-19 起，小程序不再使用微信云开发（不创建云环境、不买套餐）。

原因是云开发的唯一用途是「天气代理 / 节假日 / 乘车记录上传」，而这三项都已改为更省钱的方案：

| 原云函数 | 现方案 |
|---|---|
| `weather`（Open-Meteo 代理 + 云数据库缓存） | 前端直连腾讯位置服务（1 万次/天免费），见 `src/composables/useWeather.ts` |
| `holidays`（holiday-cn + 云数据库缓存） | 数据内置，见 `src/utils/holidays.ts` |
| 云数据库 `measurements` | 只存本机 storage，仅维护者使用，见 `src/stores/upload.ts` |

这里仅作历史存档，**不要重新部署**。如需回退，可从 git 历史 `020f8cf` 之前的提交取回。
