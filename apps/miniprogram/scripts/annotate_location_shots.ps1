param(
  [string]$SrcDir,
  [string]$OutDir
)
# 给申请材料截图加一条底部说明条（步骤 n/8 + 时间 + 一句话），
# 便于审核按顺序看「同一页面、位置在更新」。原图保持不动，只写新文件。
Add-Type -AssemblyName System.Drawing

if (-not (Test-Path $SrcDir)) { Write-Error "找不到目录：$SrcDir"; exit 1 }
$manifestPath = Join-Path $SrcDir '_captions.json'
if (-not (Test-Path $manifestPath)) { Write-Error "找不到 $manifestPath"; exit 1 }
$manifest = Get-Content $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$fontCaption = [System.Drawing.Font]::new('Microsoft YaHei', 27, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$fontBadge = [System.Drawing.Font]::new('Microsoft YaHei', 22, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$barBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(222, 15, 23, 42))
$accentBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 26, 86, 219))
$whiteBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
$badgeBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 26, 86, 219))

$total = $manifest.Count
$index = 0
foreach ($item in $manifest) {
  $index++
  $src = Join-Path $SrcDir $item.file
  if (-not (Test-Path $src)) { Write-Warning "跳过（原图不存在）：$($item.file)"; continue }

  $img = [System.Drawing.Image]::FromFile($src)
  $bmp = [System.Drawing.Bitmap]::new($img.Width, $img.Height)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
  $g.DrawImage($img, 0, 0, $img.Width, $img.Height)

  # 说明条：贴在底部 tabBar 上沿之上（tabBar 约 160px 高）
  $barH = 104
  $barTop = $img.Height - 160 - $barH
  $g.FillRectangle($barBrush, 0, $barTop, $img.Width, $barH)
  $g.FillRectangle($accentBrush, 0, $barTop, $img.Width, 4)

  # 步骤徽标 n/8
  $badgeW = 78; $badgeH = 42
  $badgeX = 22; $badgeY = $barTop + [int](($barH - $badgeH) / 2) + 2
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $rr = 10
  $path.AddArc($badgeX, $badgeY, $rr*2, $rr*2, 180, 90)
  $path.AddArc($badgeX + $badgeW - $rr*2, $badgeY, $rr*2, $rr*2, 270, 90)
  $path.AddArc($badgeX + $badgeW - $rr*2, $badgeY + $badgeH - $rr*2, $rr*2, $rr*2, 0, 90)
  $path.AddArc($badgeX, $badgeY + $badgeH - $rr*2, $rr*2, $rr*2, 90, 90)
  $path.CloseFigure()
  $g.FillPath($badgeBrush, $path)

  $badgeText = "$index/$total"
  $badgeSize = $g.MeasureString($badgeText, $fontBadge)
  $g.DrawString($badgeText, $fontBadge, $whiteBrush,
    $badgeX + ($badgeW - $badgeSize.Width) / 2, $badgeY + ($badgeH - $badgeSize.Height) / 2)

  # 说明文字
  $textY = $barTop + [int](($barH - 34) / 2)
  $g.DrawString($item.caption, $fontCaption, $whiteBrush, 118, $textY)

  $out = Join-Path $OutDir $item.file
  $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)

  $g.Dispose(); $bmp.Dispose(); $img.Dispose(); $path.Dispose()
  Write-Output "已标注: $($item.file)"
}

$fontCaption.Dispose(); $fontBadge.Dispose()
$barBrush.Dispose(); $accentBrush.Dispose(); $whiteBrush.Dispose(); $badgeBrush.Dispose()
Write-Output "完成，输出目录：$OutDir"
