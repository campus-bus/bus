// 同步 H5 运行时数据到小程序工程
// 用法：node scripts/sync_miniprogram_data.js
// 每次 public/data 变更（时刻表/路线/预测重新生成）后运行，保持两端数据同源

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const SRC = path.join(__dirname, '..', 'public', 'data')
// 输出到 src/data/（import 同步加载，无需网络请求，启动即读）
const DEST = path.join(__dirname, '..', 'apps', 'miniprogram', 'src', 'data')

// 需要同步的数据文件（satellite 底图不需要——小程序用腾讯 map 组件）
const FILES = [
  'departures.json',
  'route_params.json',
  'route_stops.json',
  'route_paths.json',
  'stations.json',
  'arrival_predictions.json',
]

fs.mkdirSync(DEST, { recursive: true })

let totalKB = 0
for (const f of FILES) {
  const src = path.join(SRC, f)
  const dst = path.join(DEST, f)
  // 压缩写入（去空白），控制小程序主包体积；源文件保持 pretty-print 便于 git diff
  const data = JSON.parse(fs.readFileSync(src, 'utf-8'))
  fs.writeFileSync(dst, JSON.stringify(data))
  const kb = Math.round(fs.statSync(dst).size / 1024)
  totalKB += kb
  console.log(`✅ ${f} → apps/miniprogram/src/data/（${kb}KB，已压缩）`)
}
console.log(`\n共同步 ${FILES.length} 个文件，${totalKB}KB（小程序包内数据）`)
