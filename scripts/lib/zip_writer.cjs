#!/usr/bin/env node
/**
 * 极简 ZIP 写入器（只为打包源码，不追求通用）
 *
 * 为什么不用现成方案：
 *   - PowerShell 的 Compress-Archive 在 5.1 下不写 UTF-8 标志位（通用位 11），
 *     中文文件名在别的机器解压会乱码；
 *   - .NET Framework 的 ZipFile.CreateFromDirectory 会把条目名写成反斜杠 `\`，
 *     不符合 ZIP 规范（应为 `/`），Linux/macOS 解压后会得到一串带反斜杠的
 *     文件名而不是目录结构。
 *   两个坑都踩过，所以这里自己写：条目名一律 `/`，标志位一律 0x0800（UTF-8），
 *   压缩仅用 deflate-raw，不加密、不分卷、不做 zip64（源码包远小于 4GB）。
 */
const zlib = require('zlib')

// ─── CRC32 ───
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[i] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** JS Date → MS-DOS 时间/日期（ZIP 头里的固定格式，1980 起算） */
function dosDateTime(d) {
  const time = ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((d.getSeconds() / 2) & 0x1f)
  const date = (((d.getFullYear() - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0xf) << 5) | (d.getDate() & 0x1f)
  return { time, date }
}

/**
 * @param {string} outPath 输出文件路径
 * @param {Array<{name: string, data: Buffer, mtime?: Date}>} entries
 *        name 必须用 `/` 分隔，且不能以 `/` 开头
 */
function writeZip(outPath, entries) {
  const chunks = []
  const central = []
  let offset = 0

  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf8')
    const raw = e.data
    const deflated = zlib.deflateRawSync(raw, { level: 9 })
    // 压缩后反而更大时用 store（方法 0），避免膨胀
    const useDeflate = deflated.length < raw.length
    const body = useDeflate ? deflated : raw
    const method = useDeflate ? 8 : 0
    const crc = crc32(raw)
    const { time, date } = dosDateTime(e.mtime || new Date())

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0) // 本地文件头签名
    local.writeUInt16LE(20, 4) // 解压所需版本
    local.writeUInt16LE(0x0800, 6) // 通用位：bit 11 = 文件名 UTF-8
    local.writeUInt16LE(method, 8)
    local.writeUInt16LE(time, 10)
    local.writeUInt16LE(date, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(body.length, 18) // 压缩后大小
    local.writeUInt32LE(raw.length, 22) // 原始大小
    local.writeUInt16LE(nameBuf.length, 26)
    local.writeUInt16LE(0, 28) // extra 长度

    chunks.push(local, nameBuf, body)

    const cd = Buffer.alloc(46)
    cd.writeUInt32LE(0x02014b50, 0) // 中央目录头签名
    cd.writeUInt16LE(20, 4) // 创建版本
    cd.writeUInt16LE(20, 6) // 解压所需版本
    cd.writeUInt16LE(0x0800, 8)
    cd.writeUInt16LE(method, 10)
    cd.writeUInt16LE(time, 12)
    cd.writeUInt16LE(date, 14)
    cd.writeUInt32LE(crc, 16)
    cd.writeUInt32LE(body.length, 20)
    cd.writeUInt32LE(raw.length, 24)
    cd.writeUInt16LE(nameBuf.length, 28)
    cd.writeUInt16LE(0, 30) // extra
    cd.writeUInt16LE(0, 32) // comment
    cd.writeUInt16LE(0, 34) // 起始磁盘号
    cd.writeUInt16LE(0, 36) // 内部属性
    cd.writeUInt32LE(0, 38) // 外部属性
    cd.writeUInt32LE(offset, 42) // 本地头偏移
    central.push(cd, nameBuf)

    offset += local.length + nameBuf.length + body.length
  }

  const cdBuf = Buffer.concat(central)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0) // 中央目录结束签名
  eocd.writeUInt16LE(0, 4) // 本磁盘号
  eocd.writeUInt16LE(0, 6) // 中央目录起始磁盘
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(cdBuf.length, 12)
  eocd.writeUInt32LE(offset, 16)
  eocd.writeUInt16LE(0, 20) // 注释长度

  require('fs').writeFileSync(outPath, Buffer.concat([...chunks, cdBuf, eocd]))
}

module.exports = { writeZip }
