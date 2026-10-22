<#
.SYNOPSIS
  构建并上传小程序正式包到微信后台（开发版）

.DESCRIPTION
  为什么需要这个脚本：
  apps/miniprogram/project.config.json 的 miniprogramRoot 指向 dist/dev/mp-weixin，
  那是给开发者工具日常调试用的（未压缩、带 sourcemap）。
  直接点「上传」会把 dev 包传上去，所以这里改为：
    1. npm run build:mp-weixin 生成 dist/build/mp-weixin（压缩后的正式包）
    2. 用微信开发者工具 CLI 上传这个目录
  好处是不用改 project.config.json，日常 dev 热更新和发布互不干扰。

.PARAMETER Version
  版本号，默认取 package.json 的 version。

.PARAMETER Desc
  版本描述，会显示在后台「版本管理」里。

.PARAMETER CliPath
  微信开发者工具 cli.bat 路径。不传则自动在常见安装位置查找。

.PARAMETER DryRun
  只构建并打印将要执行的命令，不真正上传（用于验证环境）。

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/upload_release.ps1

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/upload_release.ps1 -Version 1.0.1 -Desc "修复地图站标"
#>
param(
  [string]$Version = '',
  [string]$Desc = '',
  [string]$CliPath = '',
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $here
Set-Location $root

# 版本号与描述缺省值：从 package.json 取，避免两处手改
$pkg = Get-Content (Join-Path $root 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not $Version) { $Version = $pkg.version }
if (-not $Desc) { $Desc = '环线坐车小程序 ' + $Version }

# 1. 构建正式包
Write-Host '[1/3] 构建正式包 ...' -ForegroundColor Cyan
npm run build:mp-weixin
if ($LASTEXITCODE -ne 0) { throw "构建失败（exit=$LASTEXITCODE）" }

$build = Join-Path $root 'dist\build\mp-weixin'
if (-not (Test-Path (Join-Path $build 'app.json'))) {
  throw "找不到构建产物：$build，请检查 uni build 是否成功"
}

# 正式包必须带 requiredPrivateInfos，否则定位接口在正式版直接失败
$appJson = Get-Content (Join-Path $build 'app.json') -Raw -Encoding UTF8
if ($appJson -notmatch 'requiredPrivateInfos') {
  throw '构建产物缺少 requiredPrivateInfos，切勿上传（定位接口会被平台拦截）'
}

# 2. 定位开发者工具 CLI
if (-not $CliPath) {
  $candidates = @(
    'D:\02_Softwares\Tencent\微信web开发者工具\cli.bat',
    'C:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat',
    'C:\Program Files\Tencent\微信web开发者工具\cli.bat'
  )
  foreach ($c in $candidates) { if (Test-Path $c) { $CliPath = $c; break } }
}
if (-not $CliPath) {
  throw '未找到 cli.bat，请用 -CliPath 指向微信开发者工具目录下的 cli.bat'
}

# 3. 上传
$cliArgs = @('upload', '--project', $build, '-v', $Version, '-d', $Desc)
Write-Host ('[2/3] 上传：' + $CliPath + ' ' + ($cliArgs -join ' '))
if ($DryRun) {
  Write-Host '[3/3] DryRun：未实际上传' -ForegroundColor Yellow
  exit 0
}

& $CliPath @cliArgs
if ($LASTEXITCODE -ne 0) {
  throw "上传失败（exit=$LASTEXITCODE）：确认开发者工具已登录、且处于打开状态（CLI 需要工具在运行）"
}

Write-Host ('[3/3] 已上传 ' + $Version + ' 为开发版 → 微信后台「管理 → 版本管理」提交审核并发布') -ForegroundColor Green
