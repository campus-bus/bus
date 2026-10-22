"""
生成小程序 UI 图标（PNG）

背景：小程序里原本用字符当图标（◎ ⌂ ✕ ✓ ▾ 📍），不同机型字体不同，字重和
包围盒都控制不住，和 static/icons 里的精致 PNG 站牌完全不是一个语言。
这里统一生成一套风格一致的线性图标。

为什么是 PNG 而不是 SVG：微信 <image> 对本地 SVG 支持不稳定，
tabBar 更是只认 PNG，所以整套图标统一用 PNG。

用法：python scripts/gen_ui_icons.py
输出：src/static/icons/ui/*.png
"""
import os
from PIL import Image, ImageDraw

SIZE = 72          # 最终边长（px），显示时用 rpx 再缩放
SS = 4             # 超采样倍数，绘制 4 倍尺寸后缩小，得到抗锯齿边缘

BLUE = (26, 86, 219)      # #1A56DB 主色
WHITE = (255, 255, 255)
GREY = (156, 163, 175)    # #9CA3AF
GREEN = (16, 185, 129)    # #10B981

OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'src', 'static', 'icons', 'ui')


def _canvas():
    s = SIZE * SS
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    return img, ImageDraw.Draw(img)


def _stroke_points(draw, pts, color, width):
    """画折线并补圆形端点（Pillow 的 line 没有 lineCap 参数）"""
    draw.line(pts, fill=color, width=width, joint='curve')
    r = width / 2
    for x, y in pts:
        draw.ellipse([x - r, y - r, x + r, y + r], fill=color)


def icon_locate(color):
    """定位：准星圆 + 中心点 + 四向刻度"""
    img, d = _canvas()
    s = SIZE * SS
    c = s / 2
    w = int(0.075 * s)
    r = 0.335 * s
    d.ellipse([c - r, c - r, c + r, c + r], outline=color, width=w)
    dr = 0.095 * s
    d.ellipse([c - dr, c - dr, c + dr, c + dr], fill=color)
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        p1 = (c + dx * 0.36 * s, c + dy * 0.36 * s)
        p2 = (c + dx * 0.47 * s, c + dy * 0.47 * s)
        _stroke_points(d, [p1, p2], color, w)
    return img


def icon_reset(color):
    """回中：四角取景框"""
    img, d = _canvas()
    s = SIZE * SS
    w = int(0.075 * s)
    a, b = 0.13 * s, 0.35 * s
    corners = [
        [(a, b), (a, a), (b, a)],
        [(s - b, a), (s - a, a), (s - a, b)],
        [(s - a, s - b), (s - a, s - a), (s - b, s - a)],
        [(b, s - a), (a, s - a), (a, s - b)],
    ]
    for pts in corners:
        _stroke_points(d, pts, color, w)
    return img


def icon_close(color):
    """关闭：X"""
    img, d = _canvas()
    s = SIZE * SS
    w = int(0.075 * s)
    a, b = 0.28 * s, 0.72 * s
    _stroke_points(d, [(a, a), (b, b)], color, w)
    _stroke_points(d, [(b, a), (a, b)], color, w)
    return img


def icon_chevron(color):
    """展开箭头：朝下的 V（收起状态靠 CSS rotate(180deg) 复用同一张图）"""
    img, d = _canvas()
    s = SIZE * SS
    w = int(0.085 * s)
    _stroke_points(d, [(0.26 * s, 0.39 * s), (0.5 * s, 0.62 * s), (0.74 * s, 0.39 * s)], color, w)
    return img


def icon_check(color):
    """勾选：✓"""
    img, d = _canvas()
    s = SIZE * SS
    w = int(0.085 * s)
    _stroke_points(d, [(0.22 * s, 0.52 * s), (0.42 * s, 0.71 * s), (0.78 * s, 0.31 * s)], color, w)
    return img


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    icons = {
        'locate.png': icon_locate(BLUE),
        'locate-white.png': icon_locate(WHITE),
        'reset.png': icon_reset(BLUE),
        'close.png': icon_close(GREY),
        'chevron-down.png': icon_chevron(GREY),
        'check.png': icon_check(GREEN),
        'check-white.png': icon_check(WHITE),
    }
    for name, img in icons.items():
        out = img.resize((SIZE, SIZE), Image.LANCZOS)
        path = os.path.join(OUT_DIR, name)
        out.save(path, 'PNG', optimize=True)
        print('wrote', os.path.relpath(path), out.size)


if __name__ == '__main__':
    main()
