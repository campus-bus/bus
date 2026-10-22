#!/usr/bin/env node
/**
 * 把 apps/miniprogram 打包成「送外部审查」用的完整源码压缩包
 *
 * 为什么需要：小程序目录里有 node_modules（几百 MB）、dist（编译产物）、
 * docs 下的开发截图（3+ MB），直接压缩整个目录会有 300+ MB 且被无关内容干扰。
 * 这里只排除「可重建 / 非源码」的东西，所有源码与数据一条不删。
 *
 * 用法：
 *   node scripts/pack_miniprogram.cjs
 *   node scripts/pack_miniprogram.cjs --with-screenshots   # 连开发截图一起打（默认不含）
 *
 * 输出：
 *   review/miniprogram-full-source.zip
 *
 * 排除清单（都可由源码重建或与代码无关）：
 *   node_modules/                 依赖，npm install 可重建
 *   dist/                         编译产物，npm run build:mp-weixin 可重建
 *   docs 下的 png/jpg             开发过程截图（隐私合规验证、tabbar 效果、天气）
 *   docs/接口申请截图 系列目录     微信审核材料（约 13 MB）
 *   dev-build.log                 编译日志
 *   package-lock.json             锁文件（审代码无关；如需复现依赖请单独提供）
 *   project.private.config.json   开发者工具本机私有配置
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

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'unpackage', '.probe'])
const SKIP_FILES = new Set(['dev-build.log', 'package-lock.json', 'project.private.config.json'])

/** 收集要打包的文件（路径统一为正斜杠，符合 ZIP 规范） */
function collect(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name)
    const rel = path.relative(SRC, full).split(path.sep).join('/')
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(ent.name)) continue
      if (!WITH_SHOTS && ent.name.includes('接口申请截图')) continue
      collect(full, out)
    } else {
      if (SKIP_FILES.has(ent.name)) continue
      if (!WITH_SHOTS && rel.startsWith('docs/') && /\.(png|jpe?g)$/i.test(ent.name)) continue
      out.push({ full, rel })
    }
  }
  return out
}

const files = collect(SRC).sort((a, b) => a.rel.localeCompare(b.rel))
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
