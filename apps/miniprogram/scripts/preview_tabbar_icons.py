"""把 8 个 tabBar 图标拼成一张预览图，方便肉眼核对造型与配色"""

import os

from PIL import Image, ImageDraw

ICON_DIR = os.path.join(os.path.dirname(__file__), "..", "src", "static", "tabbar")
OUT = os.path.join(os.path.dirname(__file__), "..", "docs", "tabbar-图标预览.png")

NAMES = ["home", "schedule", "map", "record"]
LABELS = ["首页", "行程", "地图", "记录"]

CELL = 200
PAD = 24
W = len(NAMES) * CELL + PAD * 2
H = 2 * CELL + PAD * 3 + 60

canvas = Image.new("RGB", (W, H), "#FFFFFF")
draw = ImageDraw.Draw(canvas)

for row, (suffix, color_tag) in enumerate([("", "未选中"), ("-active", "选中")]):
    y0 = PAD + row * (CELL + PAD + 20)
    for col, name in enumerate(NAMES):
        x0 = PAD + col * CELL
        path = os.path.join(ICON_DIR, f"{name}{suffix}.png")
        icon = Image.open(path).convert("RGBA").resize((120, 120), Image.LANCZOS)
        canvas.paste(icon, (x0 + (CELL - 120) // 2, y0 + 16), icon)
        draw.rectangle([x0, y0, x0 + CELL - 8, y0 + CELL - 8], outline="#E5E7EB")
        draw.text((x0 + 12, y0 + 8), f"{LABELS[col]} ({color_tag})", fill="#6B7280")

canvas.save(OUT)
print("saved", os.path.abspath(OUT))
