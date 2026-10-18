"""
生成小程序 tabBar 图标

微信 tabBar 只认本地图片（不支持字体图标/SVG 直接引用），所以这里用 SVG 定义形状，
再用 cairosvg 渲染成 81×81 的 PNG，每个图标出「未选中(灰)」「选中(蓝)」两版。

用法（在 apps/miniprogram 目录下）：
    python scripts/generate_tabbar_icons.py

输出：src/static/tabbar/{home,schedule,map,record}[-active].png
"""

import io
import os

import cairosvg
from PIL import Image

# 尺寸：微信官方推荐 81×81 px；先按 4 倍渲染再缩采样，保证边缘平滑
SIZE = 81
SCALE = 4

# 与 pages.json 中 tabBar 的 color / selectedColor 保持一致
COLOR_NORMAL = "#6B7280"
COLOR_ACTIVE = "#1A56DB"

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "src", "static", "tabbar")

# 图标形状：24×24 视图，统一 1.8 描边 + 圆头圆角，视觉重量与微信原生图标接近
ICONS = {
    # 首页：房子
    "home": """
        <path d="M3.2 10.4 L12 3.4 L20.8 10.4 V19.2 A1.8 1.8 0 0 1 19 21 H5 A1.8 1.8 0 0 1 3.2 19.2 Z" />
        <path d="M9.4 21 V14.4 H14.6 V21" />
    """,
    # 行程：路线（起点圆点 + 曲线 + 终点圆点）
    "schedule": """
        <path d="M6 18.6 C 11.4 18.6, 12.6 5.4, 18 5.4" />
        <circle cx="5.2" cy="19.4" r="2.1" />
        <circle cx="18.8" cy="4.6" r="2.1" />
    """,
    # 地图：定位图钉
    "map": """
        <path d="M12 21.2 C12 21.2 19.2 14.6 19.2 9.6 A7.2 7.2 0 1 0 4.8 9.6 C4.8 14.6 12 21.2 12 21.2 Z" />
        <circle cx="12" cy="9.5" r="2.7" />
    """,
    # 记录：记录板
    "record": """
        <path d="M8.8 4.6 H15.2 V7.4 H8.8 Z" />
        <path d="M7.6 5.6 H5.8 A1.8 1.8 0 0 0 4 7.4 V19.2 A1.8 1.8 0 0 0 5.8 21 H18.2 A1.8 1.8 0 0 0 20 19.2 V7.4 A1.8 1.8 0 0 0 18.2 5.6 H16.4" />
        <path d="M8.2 11.4 H15.8" />
        <path d="M8.2 15.4 H13.4" />
    """,
}

SVG_TEMPLATE = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
    width="{size}" height="{size}" fill="none" stroke="{color}"
    stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    {body}
</svg>"""


def render(body: str, color: str) -> bytes:
    """把图标形状渲染成指定颜色的 PNG 字节流"""
    svg = SVG_TEMPLATE.format(body=body, color=color, size=SIZE * SCALE)
    raw = cairosvg.svg2png(bytestring=svg.encode("utf-8"))

    # 缩采样：先转 RGBA，再用 LANCZOS 缩到目标尺寸
    img = Image.open(io.BytesIO(raw)).convert("RGBA")
    img = img.resize((SIZE, SIZE), Image.LANCZOS)

    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)

    for name, body in ICONS.items():
        for suffix, color in (("", COLOR_NORMAL), ("-active", COLOR_ACTIVE)):
            data = render(body, color)
            path = os.path.join(OUT_DIR, f"{name}{suffix}.png")
            with open(path, "wb") as f:
                f.write(data)
            print(f"  OK {os.path.basename(path)}  ({len(data) / 1024:.1f} KB)")

    print(f"\n共生成 {len(ICONS) * 2} 个图标，输出目录：{os.path.abspath(OUT_DIR)}")


if __name__ == "__main__":
    main()
