#!/usr/bin/env node
/**
 * 生成「送外部大模型审查」用的单文件bundle
 *
 * 为什么需要这个脚本：
 *   小程序目录有 63 个文件、1.1 MB，逐个上传给大模型既不现实也没必要。
 *   实测其中 80% 体积是 data/*.json（仅 arrival_predictions.json 就 875 KB，
 *   内容是 2038 条结构完全相同的到站时间记录）——这些对代码审查零价值，
 *   真正要审的代码只有约 230 KB。脚本按文件类型分层处理：
 *     - 源码：全文收录
 *     - 大数据 JSON：只放结构摘要 + 前 2 条样本（足够判断数据结构是否正确）
 *     - 图片/锁文件/日志：完全跳过
 *
 * 用法：
 *   node scripts/bundle_for_review.cjs                 # 生成完整审查包
 *   node scripts/bundle_for_review.cjs --code-only     # 只放代码，数据全部只留摘要
 *   node scripts/bundle_for_review.cjs --no-data-json  # 保留小型 JSON 全文（默认行为）
 *
 * 输出：
 *   review/miniprogram_review.md    单文件审查包（直接拖给大模型）
 *   review/miniprogram_source.zip   纯源码压缩包（需要按文件看时用）
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const SRC_DIR = path.join(ROOT, 'apps/miniprogram')
const OUT_DIR = path.join(ROOT, 'review')

const argv = process.argv.slice(2)
const CODE_ONLY = argv.includes('--code-only')

/** 单个 JSON 超过这个体积就不放全文，改为结构摘要（实测样本取前 2 条） */
const JSON_FULL_LIMIT = 30 * 1024

// ─── 排除规则 ───
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'unpackage', '.probe'])
const SKIP_FILE_RE = [
  /\.log$/i,
  /\.(png|jpe?g|gif|webp|ico)$/i,
  /^package-lock\.json$/i,
  /^project\.private\.config\.json$/i,
]
/** 截图类材料目录（微信审核用，与代码无关） */
const SKIP_PATH_RE = /\\docs\\接口申请截图/

/** 展示顺序：按依赖方向排，读者从上往下读不会看到「用了还没定义的东西」 */
const ORDER = [
  'package.json', 'tsconfig.json', 'vite.config.ts', 'index.html', 'project.config.json',
  'src/manifest.json', 'src/pages.json', 'src/uni.scss',
  'src/types/', 'src/constants/', 'src/config.ts', 'src/main.ts', 'src/App.vue',
  'src/utils/', 'src/stores/', 'src/composables/', 'src/components/', 'src/pages/', 'src/data/README.md',
]

// ─── 收集文件 ───
function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(ent.name)) continue
      if (SKIP_PATH_RE.test(full)) continue
      walk(full, out)
    } else {
      if (SKIP_FILE_RE.some(re => re.test(ent.name))) continue
      out.push(full)
    }
  }
  return out
}

/** 相对路径统一用正斜杠，方便跨平台阅读 */
const rel = f => path.relative(SRC_DIR, f).split(path.sep).join('/')

function orderKey(r) {
  for (let i = 0; i < ORDER.length; i++) {
    if (r === ORDER[i].replace(/\/$/, '') || r.startsWith(ORDER[i])) return i
  }
  return ORDER.length
}

const allFiles = walk(SRC_DIR)
  .map(f => ({ abs: f, rel: rel(f), size: fs.statSync(f).size }))
  .sort((a, b) => {
    const ka = orderKey(a.rel), kb = orderKey(b.rel)
    return ka !== kb ? ka - kb : a.rel.localeCompare(b.rel)
  })

// ─── 文件树 ───
function buildTree(files) {
  const tree = {}
  for (const f of files) {
    const parts = f.rel.split('/')
    let node = tree
    for (let i = 0; i < parts.length - 1; i++) {
      node[parts[i]] = node[parts[i]] || {}
      node = node[parts[i]]
    }
    node[parts[parts.length - 1]] = null
  }
  const lines = []
  function render(node, prefix) {
    const keys = Object.keys(node).sort((a, b) => {
      const ad = node[a] !== null, bd = node[b] !== null
      return ad !== bd ? (ad ? -1 : 1) : a.localeCompare(b)
    })
    keys.forEach((k, i) => {
      const last = i === keys.length - 1
      const isDir = node[k] !== null
      lines.push(prefix + (last ? '└── ' : '├── ') + k + (isDir ? '/' : ''))
      if (isDir) render(node[k], prefix + (last ? '    ' : '│   '))
    })
  }
  render(tree, '')
  return lines.join('\n')
}

// ─── JSON 摘要（大数据文件不放全文）──
function describeValue(v, depth = 0) {
  if (Array.isArray(v)) {
    if (v.length === 0) return '[] (空数组)'
    const sample = v[0]
    if (sample && typeof sample === 'object' && !Array.isArray(sample)) {
      const fields = Object.keys(sample).map(k => `${k}: ${typeName(sample[k])}`).join(', ')
      return `Array(${v.length}) 每项字段 → ${fields}`
    }
    return `Array(${v.length}) 每项为 ${typeName(sample)}`
  }
  if (v && typeof v === 'object') {
    if (depth >= 2) return 'object{…}'
    return 'object { ' + Object.keys(v).map(k => {
      const c = v[k]
      const n = Array.isArray(c) ? `Array(${c.length})` : typeName(c)
      return `${k}: ${n}`
    }).join(', ') + ' }'
  }
  return typeName(v)
}
function typeName(v) {
  if (v === null) return 'null'
  if (Array.isArray(v)) return `Array(${v.length})`
  return typeof v
}

function jsonSummary(text, label) {
  let data
  try { data = JSON.parse(text) } catch (e) {
    return '_JSON 解析失败：' + e.message + '_'
  }
  const parts = []
  if (Array.isArray(data)) {
    parts.push(`- 顶层：${describeValue(data)}`)
    if (data.length) {
      parts.push(`- 前 2 条样本（共 ${data.length} 条，以下截断展示）：`)
      parts.push('```json')
      parts.push(JSON.stringify(data.slice(0, 2), null, 2))
      parts.push('```')
    }
  } else if (data && typeof data === 'object') {
    parts.push(`- 顶层键：${Object.keys(data).join(', ')}`)
    for (const [k, v] of Object.entries(data)) {
      parts.push(`- \`${k}\`：${describeValue(v, 1)}`)
      if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'object' && k !== 'README') {
        parts.push('  ```json')
        parts.push(indent(JSON.stringify(v.slice(0, 2), null, 2), '  '))
        parts.push('  ```')
      }
    }
  }
  return parts.join('\n')
}
const indent = (s, pad) => s.split('\n').map(l => pad + l).join('\n')

// ─── 正文渲染 ───
function langOf(r) {
  const ext = path.extname(r).toLowerCase()
  return { '.ts': 'ts', '.vue': 'vue', '.js': 'js', '.cjs': 'js', '.json': 'json', '.scss': 'scss', '.md': 'md', '.html': 'html', '.d.ts': 'ts' }[ext] || ''
}

function renderFile(f) {
  const text = fs.readFileSync(f.abs, 'utf8')
  const isJson = f.rel.endsWith('.json')
  const tooBig = CODE_ONLY && isJson
  if (isJson && (f.size > JSON_FULL_LIMIT || tooBig)) {
    return [
      `### \`${f.rel}\``,
      '',
      `> 体积 ${(f.size / 1024).toFixed(1)} KB —— 数据体量过大，仅给出结构摘要（结构是否正确据此即可判断）`,
      '',
      jsonSummary(text, f.rel),
      '',
    ].join('\n')
  }
  const lang = langOf(f.rel)
  // 数据文件即使不大，若超 8KB 也给摘要，避免样本淹没代码
  if (isJson && f.size > 8 * 1024) {
    return [
      `### \`${f.rel}\``,
      '',
      `> 体积 ${(f.size / 1024).toFixed(1)} KB —— 仅给出结构摘要`,
      '',
      jsonSummary(text, f.rel),
      '',
    ].join('\n')
  }
  return [`### \`${f.rel}\``, '', '```' + lang, text.replace(/\s+$/, ''), '```', ''].join('\n')
}

// ─── 组装 ───
const codeFiles = allFiles.filter(f => !f.rel.endsWith('.json'))
const dataFiles = allFiles.filter(f => f.rel.endsWith('.json'))
const codeBytes = codeFiles.reduce((s, f) => s + f.size, 0)

const header = [
  '# 环线坐车 · 微信小程序 源码审查包',
  '',
  '> 本文件由 `scripts/bundle_for_review.cjs` 自动生成，内容与仓库现状一致，未手工编辑。',
  '',
  '## 项目一句话说明',
  '',
  '校园环线公交车时刻查询应用。技术栈 **uni-app + Vue 3 + TypeScript + Pinia**，编译目标为微信小程序。',
  '数据（发车时刻表、到站预测、站点坐标）在构建期一步转换后打进包内，**运行期不请求任何数据接口**；',
  '唯一的外部网络请求是可选的天气接口（腾讯位置服务），失败则静默不展示。',
  '',
  '## 审查者须知（重要，请先读）',
  '',
  '1. **坐标系**：本项目小程序端所有经纬度数据**已经是 GCJ-02**（国测局坐标）。',
  '   WGS-84 → GCJ-02 的转换在构建脚本 `scripts/sync_miniprogram_data.js` 里一次性完成（不在本包内）。',
  '   因此源码中**看不到任何坐标转换代码**，这**不是遗漏**。',
  '2. **不是 Web 项目**：不要用 React/Vue-H5 的思维审查 DOM、CSS 布局、路由。',
  '   页面是微信页面（`pages.json` 注册，`uni.navigateTo`/`switchTab` 跳转），样式单位是 `rpx`。',
  '3. **没有后端**：乘车记录仅存本机 storage（维护者工具），时刻表数据全部编译进包。',
  '   不存在登录、鉴权、数据库请求。',
  '4. **业务背景**：4 条线路（环线1路 / 就餐专线 / 接驳1路顺时针 / 接驳2路逆时针），全部为**环线**，',
  '   起点站 = 终点站。接驳环线中「激光所」「网球场」「军体活动中心东」在一圈内会经过 **两次**，',
  '   因此同一班次的预测记录里同名站有多条不同 `stopSeq` 的记录，这是**正确数据**。',
  '   选上/下车站时必须枚举组合取最短乘坐时间（`utils/station_group.ts` 的 `findBestRide`），',
  '   不能用 `findIndex` 取首次出现——那会把用户带上绕大圈的方向。',
  '5. **全部线路目前仅工作日运行**，周末时刻表尚未公布（数据里 `dateType` 全部是 `weekday`）。',
  '',
  '## 数据文件说明（本包内为结构摘要，非全文）',
  '',
  '| 文件 | 真实体积 | 内容 |',
  '|---|---|---|',
  '| `src/data/arrival_predictions.json` | 875 KB | 2038 条预计算到站时间，每班约 15 条 |',
  '| `src/data/departures.json` | 47 KB | 132 条发车记录 |',
  '| `src/data/route_params.json` | 14 KB | 各路线站间秒数配置 |',
  '| `src/data/route_paths.json` | 7 KB | 路线折线坐标 |',
  '| `src/data/route_stops.json` | 3 KB | 各路线站点序列与坐标 |',
  '| `src/data/stations.json` | 2 KB | 18 个站点字典 |',
  '',
  '这些文件由同步脚本生成，**不属于审查对象**；本包只保留结构摘要以便判断字段设计是否合理。',
  '若需真实数据样例，可单独特索对应文件。',
  '',
  `## 包内统计`,
  '',
  `- 纳入审查的文件：**${allFiles.length}** 个（其中代码 ${codeFiles.length} 个 / 数据摘要 ${dataFiles.length} 个）`,
  `- 代码总体积：**${(codeBytes / 1024).toFixed(1)} KB**（原始源码，未压缩）`,
  '',
  '## 文件树',
  '',
  '```',
  buildTree(allFiles),
  '```',
  '',
  '## 建议的审查维度',
  '',
  '1. **架构合理性**：目录划分、模块边界、状态管理（Pinia store 职责）是否清晰；有无过度设计或职责混淆。',
  '2. **微信小程序规范性**：是否用到了 H5 才有的写法（DOM 操作、`window`/`document`、CSS 特性不支持）；',
  '   页面生命周期、tabBar 跳转、安全区（`env(safe-area-inset-bottom)`）、转发（`onShareAppMessage`）是否正确。',
  '3. **性能**：列表渲染、每秒刷新的定时器、computed 依赖粒度、大数组的重复扫描。',
  '4. **正确性**：环线同名站的处理、`stopSeq` 与站名的匹配、边界时间（跨零点、已过站）、日期类型判定。',
  '5. **可维护性**：重复代码、魔法数字、命名一致性、类型定义是否被真正使用。',
  '6. **UI/UX**：信息层级、空状态、加载态、错误降级、无障碍（字号、对比度）。',
  '',
  '请按「问题 → 文件与行号 → 为什么是问题 → 建议改法」的形式输出，并区分 **必改（bug/违规）** 与 **建议（风格/优化）**。',
  '',
  '---',
  '',
  '# 源码',
  '',
].join('\n')

let body = ''
let currentGroup = ''
for (const f of allFiles) {
  const group = f.rel.includes('/') ? f.rel.split('/').slice(0, 2).join('/') : '工程配置'
  if (group !== currentGroup) {
    const label = group.startsWith('src/pages') ? 'src/pages（页面）'
      : group.startsWith('src/utils') ? 'src/utils（工具函数）'
      : group.startsWith('src/stores') ? 'src/stores（状态管理）'
      : group.startsWith('src/components') ? 'src/components（组件）'
      : group.startsWith('src/composables') ? 'src/composables（组合式函数）'
      : group.startsWith('src/types') ? 'src/types（类型定义）'
      : group.startsWith('src/constants') ? 'src/constants（常量）'
      : group.startsWith('src/data') ? 'src/data（数据结构摘要）'
      : group
    body += `\n## ${label}\n\n`
    currentGroup = group
  }
  body += renderFile(f) + '\n'
}

const out =
  header + body +
  '\n---\n\n## 审查输出模板（可直接按此作答）\n\n' +
  '```\n' +
  '### 🔴 必改\n' +
  '1. [文件:行号] 问题描述 → 建议\n\n' +
  '### 🟡 建议\n' +
  '1. [文件:行号] 问题描述 → 建议\n\n' +
  '### 🟢 做得好的地方\n' +
  '1. ...\n' +
  '```\n'

fs.mkdirSync(OUT_DIR, { recursive: true })
const outPath = path.join(OUT_DIR, 'miniprogram_review.md')
fs.writeFileSync(outPath, out, 'utf8')

// 写入后立刻校验 UTF-8 完整性（本项目铁律：防编码损坏）
try {
  new TextDecoder('utf-8', { fatal: true }).decode(fs.readFileSync(outPath))
} catch (e) {
  console.error('❌ 输出文件不是合法 UTF-8：', e.message)
  process.exit(1)
}

const kb = Buffer.byteLength(out, 'utf8') / 1024
// 中文约 1.5 字符/token，英文约 4 字符/token；本项目注释多中文，取保守估算
const cnChars = (out.match(/[\u4e00-\u9fa5]/g) || []).length
const estTokens = Math.round(cnChars / 1.5 + (out.length - cnChars) / 4)

console.log('✅ 审查包已生成')
console.log('   路径:', path.relative(ROOT, outPath))
console.log(`   体积: ${kb.toFixed(1)} KB`)
console.log(`   估算 token: 约 ${(estTokens / 1000).toFixed(0)}k`)
console.log(`   文件: ${allFiles.length} 个（代码 ${codeFiles.length} / 数据摘要 ${dataFiles.length}）`)
console.log(`   代码原始体积: ${(codeBytes / 1024).toFixed(1)} KB`)
