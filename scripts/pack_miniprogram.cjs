#!/usr/bin/env node
/**
 * 把小程序打包成「送外部审查」用的完整源码压缩包
 *
 * 为什么需要：小程序目录里有 node_modules（几百 MB）、dist（编译产物）、
 * docs 下的开发截图（十几 MB），直接压缩整个目录又大又干扰审阅。
 * 这里只排除「可重建 / 非源码」的东西，所有源码与数据一条不删。
 *
 * 用法：
 *   node scripts/pack_miniprogram.cjs                  # 默认：代码 + 数据 + 上游数据链路
 *   node scripts/pack_miniprogram.cjs --no-pipeline    # 只打 apps/miniprogram
 *   node scripts/pack_miniprogram.cjs --with-screenshots
 *
 * 输出：
 *   review/miniprogram-full-source.zip
 *
 * 排除清单（都可由源码重建或与代码无关）：
 *   node_modules/                 依赖，npm ci 可重建
 *   dist/                         编译产物，npm run build:mp-weixin 可重建
 *   docs 下的 png/jpg             开发过程截图
 *   docs/接口申请截图 系列目录     微信审核材料（约 13 MB）
 *   dev-build.log                 编译日志
 *   project.private.config.json   开发者工具本机私有配置
 *
 * 上游数据链路（`_upstream_data/`）为什么默认打进去：
 * 审查方连续两轮都指出「包里没有 public/data 与 sync_miniprogram_data.js，
 * 无法判断内置 GCJ-02 数据是否正确、以后怎么维护」。它不属于小程序运行代码，
 * 但缺了它无法回答「数据从哪来」，所以单独放一个目录并附说明。
 *
 * 为什么用自写的 zip_writer 而不是 Compress-Archive / ZipFile：
 *   前者在 PS 5.1 不写 UTF-8 标志位（中文名解压乱码），
 *   后者把条目名写成反斜杠（Linux/macOS 解压后目录结构错乱）。详见该文件注释。
 */
const fs = require('fs')
const path = require('path')
const { writeZip } = require('./lib/zip_writer.cjs')

const ROOT = path.resolve(__dirname, '..')
const SRC = path.join(ROOT, 'apps/miniprogram')
const OUT_DIR = path.join(ROOT, 'review')
const ZIP = path.join(OUT_DIR, 'miniprogram-full-source.zip')

const WITH_SHOTS = process.argv.includes('--with-screenshots')
const WITH_PIPELINE = !process.argv.includes('--no-pipeline')

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'unpackage', '.probe'])
const SKIP_FILES = new Set(['dev-build.log', 'project.private.config.json'])

/** 上游数据链路：仓库根目录的真实路径 → 压缩包内路径 */
const PIPELINE = [
  { from: 'scripts/sync_miniprogram_data.js', to: '_upstream_data/scripts/sync_miniprogram_data.js' },
  { from: 'scripts/lib/coord.js', to: '_upstream_data/scripts/lib/coord.js' },
  { from: 'scripts/regenerate_predictions.js', to: '_upstream_data/scripts/regenerate_predictions.js' },
  { from: 'scripts/test_scenarios.cjs', to: '_upstream_data/scripts/test_scenarios.cjs' },
  { from: 'scripts/lib/data_pipeline_readme.md', to: '_upstream_data/README.md' },
]
/** 源数据目录里只要 JSON（卫星底图 JPEG 是 H5 专用，1.5MB 且与小程序无关） */
const PIPELINE_DATA_DIR = 'public/data'

/** 收集要打包的文件（路径统一为正斜杠，符合 ZIP 规范） */
function collect(dir, prefix, out, filterFile) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name)
    const rel = prefix + ent.name
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(ent.name)) continue
      if (!WITH_SHOTS && ent.name.includes('接口申请截图')) continue
      collect(full, rel + '/', out, filterFile)
    } else {
      if (SKIP_FILES.has(ent.name)) continue
      if (filterFile && !filterFile(rel, ent.name)) continue
      out.push({ full, rel })
    }
  }
}

const files = []
collect(SRC, '', files, (rel, name) => {
  // docs 下的开发截图不属于源码
  if (!WITH_SHOTS && rel.startsWith('docs/') && /\.(png|jpe?g)$/i.test(name)) return false
  return true
})

if (WITH_PIPELINE) {
  for (const p of PIPELINE) {
    const abs = path.join(ROOT, p.from)
    if (fs.existsSync(abs)) files.push({ full: abs, rel: p.to })
    else console.warn(`[warn] 缺少上游文件：${p.from}`)
  }
  const dataDir = path.join(ROOT, PIPELINE_DATA_DIR)
  if (fs.existsSync(dataDir)) {
    collect(dataDir, '_upstream_data/public/data/', files, (rel, name) => /\.json$/i.test(name))
  } else {
    console.warn(`[warn] 缺少源数据目录：${PIPELINE_DATA_DIR}`)
  }
}

files.sort((a, b) => a.rel.localeCompare(b.rel))
const entries = files.map(f => ({
  name: f.rel,
  data: fs.readFileSync(f.full),
  mtime: fs.statSync(f.full).mtime,
}))

fs.mkdirSync(OUT_DIR, { recursive: true })
if (fs.existsSync(ZIP)) fs.rmSync(ZIP)
writeZip(ZIP, entries)

const rawBytes = entries.reduce((s, e) => s + e.data.length, 0)
const size = fs.statSync(ZIP).size

console.log('✅ 完整源码包已生成')
console.log('   路径:', path.relative(ROOT, ZIP))
console.log(`   体积: ${(size / 1024).toFixed(0)} KB（原始 ${(rawBytes / 1024 / 1024).toFixed(2)} MB）`)
console.log(`   文件: ${entries.length} 个`)
if (!WITH_SHOTS) console.log('   说明: 已排除开发截图与审核材料，源码与数据全量包含')
if (WITH_PIPELINE) console.log('   说明: 含 _upstream_data/（数据生成脚本 + WGS-84 源数据，非小程序运行代码）')
