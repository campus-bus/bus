# -*- coding: utf-8 -*-
"""
生成地图站点标记图（圆点 + 站名合成一张 PNG）

为什么这样做：
  微信 map 的 callout 在 markers 增删/切换线路后会漏绘（圆点还在、名字不画）；
  label 的 anchorX/anchorY 语义不直观（原点是经纬度，值是「放到哪个偏移处」），
  极易把文字摆错。而 iconPath 是实测最稳的一层——公交车辆图标从未丢过。
所以把「站名 + 圆点」在构建期画进同一张图，运行期只给 marker 一个 iconPath，
位置由图片内容决定，完全可控，也不再依赖任何原生文字层。

画布布局（1x 逻辑像素，实际按 SCALE 倍绘制保证清晰）：
  ┌─────────────┐
  │  站 名 气 泡  │  ← 高 TEXT_H，蓝色圆角矩形 + 白字居中
  ├─────────────┤  ← GAP 像素透明间隙
  │      ●      │  ← 圆点，直径 DOT_D，圆心正对 marker 坐标
  └─────────────┘
marker 的 anchor 计算为 (0.5, 1 - DOT_D/2/IMG_H)，使圆点圆心正好落在经纬度上。

用法：python scripts/gen_station_markers.py
输出：src/static/icons/stations/<站名>.png，以及 _dot-only.png（隐藏站名时用）
"""
import json
import os
from PIL import Image, ImageDraw, ImageFont

SCALE = 4            # 超采样倍数，运行时按 1x 显示
FONT_SIZE = 11       # 站名字号（逻辑像素）
TEXT_PAD_X = 5       # 气泡左右内边距
TEXT_PAD_Y = 2       # 气泡上下内边距
GAP = 3              # 气泡与圆点之间的透明间隙（太大会显得站名和圆点各说各话）
DOT_D = 7            # 圆点直径（用户反馈原 9px 偏大）
# 气泡配色：沿用环线1路的蓝（#2563EB）但压深一档，白字在卫星图上更稳
# 原深灰 #374151 在卫星底图上偏「脏」，与线路蓝放在一起也不成体系
BG = (26, 86, 219)   # #1A56DB
FG = (255, 255, 255)
# 圆点描边与气泡同色，圆点与站名读作同一个标记
DOT_RING = (26, 86, 219)
DOT_FILL = (255, 255, 255)
RADIUS = 3           # 气泡圆角

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, 'src', 'data', 'stations.json')
OUT_DIR = os.path.join(ROOT, 'src', 'static', 'icons', 'stations')
FONT_PATH = r'C:\Windows\Fonts\msyh.ttc'


def text_width(text, font):
    box = font.getbbox(text)
    return box[2] - box[0]


def draw_bubble(width, text, font):
    """画站名气泡，返回 1x 尺寸的 RGBA 图"""
    text_h = FONT_SIZE
    h = text_h + TEXT_PAD_Y * 2
    w = max(width, 1)
    im = Image.new('RGBA', (w * SCALE, h * SCALE), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle(
        [0, 0, w * SCALE - 1, h * SCALE - 1],
        radius=RADIUS * SCALE,
        fill=BG,
    )
    # 文字垂直居中
    tw = text_width(text, font)
    tx = (w * SCALE - tw) // 2
    box = font.getbbox(text)
    ty = (h * SCALE - (box[3] - box[1])) // 2 - box[1]
    d.text((tx, ty), text, font=font, fill=FG)
    return im


def main():
    with open(DATA, 'r', encoding='utf-8') as f:
        stations = json.load(f)
    names = [s['name'] for s in stations]
    # 路线独有的站名可能不在 stations.json 里，补上代码中会用到的
    os.makedirs(OUT_DIR, exist_ok=True)

    font = ImageFont.truetype(FONT_PATH, FONT_SIZE * SCALE)
    space_w = text_width(' ', font)
    # 统一气泡高度：用最高的一项（中文）确定
    sample_h = FONT_SIZE + TEXT_PAD_Y * 2

    meta = {}
    for name in names:
        tw = text_width(name, font) / SCALE
        bubble_w = int(round(tw)) + TEXT_PAD_X * 2
        # 图片总尺寸：气泡 + 间隙 + 圆点
        img_w = max(bubble_w, DOT_D)
        img_h = sample_h + GAP + DOT_D

        im = Image.new('RGBA', (img_w * SCALE, img_h * SCALE), (0, 0, 0, 0))
        bubble = draw_bubble(bubble_w, name, font)
        im.paste(bubble, ((img_w - bubble_w) * SCALE // 2, 0), bubble)

        d = ImageDraw.Draw(im)
        cx = img_w * SCALE / 2
        cy = (sample_h + GAP) * SCALE + DOT_D * SCALE / 2
        r = DOT_D * SCALE / 2
        # 圆点：白色实心 + 蓝色描边（描边让它在浅色/深色底图上都看得见）
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=DOT_RING)
        r2 = r - 1 * SCALE
        d.ellipse([cx - r2, cy - r2, cx + r2, cy + r2], fill=DOT_FILL)

        path = os.path.join(OUT_DIR, name + '.png')
        im.save(path)
        meta[name] = {
            'img': path,
            'width': img_w,
            'height': img_h,
            # anchor.y：让圆点圆心落在经纬度上
            'anchorY': round(1 - (DOT_D / 2) / img_h, 4),
        }
        print(f'  {name}: {img_w}x{img_h}  anchorY={meta[name]["anchorY"]}')

    # 隐藏站名时用：只有圆点的小图
    im = Image.new('RGBA', (DOT_D * SCALE, DOT_D * SCALE), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    r = DOT_D * SCALE / 2
    d.ellipse([0, 0, DOT_D * SCALE - 1, DOT_D * SCALE - 1], fill=DOT_RING)
    r2 = r - 1 * SCALE
    d.ellipse([r - r2, r - r2, r + r2, r + r2], fill=DOT_FILL)
    im.save(os.path.join(OUT_DIR, '_dot-only.png'))

    # 把尺寸表写成 TS，运行期直接查表，不必在 JS 里重复计算排版
    ts = ['// 由 scripts/gen_station_markers.py 自动生成，勿手改',
          '// 站点标记图：站名气泡 + 圆点合成一张 PNG，运行期只给 marker 一个 iconPath',
          'export interface StationMarkerMeta {',
          '  width: number',
          '  height: number',
          '  /** 让圆点圆心落在经纬度上所需的 anchor.y */',
          '  anchorY: number',
          '}',
          '',
          'export const STATION_MARKER_META: Record<string, StationMarkerMeta> = {']
    for name, m in meta.items():
        ts.append(f"  '{name}': {{ width: {m['width']}, height: {m['height']}, anchorY: {m['anchorY']} }},")
    ts.append('}')
    ts.append('')
    ts_path = os.path.join(ROOT, 'src', 'utils', 'station_marker_meta.ts')
    with open(ts_path, 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(ts))
    print(f'已生成 {len(meta)} 张站标图 → {OUT_DIR}')
    print(f'尺寸表 → {ts_path}')


if __name__ == '__main__':
    main()
