#!/usr/bin/env python3
"""路段运行时间重新预估 — 基于最新 Supabase 实测数据"""

import json
import ssl
import urllib.request
from collections import defaultdict
from statistics import mean, median

# ─── 1. 拉取 Supabase 全部实测记录 ───
url = "https://wmpvunpvdxkiuufnzydr.supabase.co/rest/v1/measurements?select=*&order=created_at.desc"
headers = {
    "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtcHZ1bnB2ZHhraXV1Zm56eWRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExODY0MjEsImV4cCI6MjA5Njc2MjQyMX0.LFhLyfpriamrGemH7zVCTZ569TUhmSNkbbDO--UjB40",
    "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtcHZ1bnB2ZHhraXV1Zm56eWRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExODY0MjEsImV4cCI6MjA5Njc2MjQyMX0.LFhLyfpriamrGemH7zVCTZ569TUhmSNkbbDO--UjB40",
}
req = urllib.request.Request(url, headers=headers)
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE
resp = urllib.request.urlopen(req, context=ctx)
records = json.loads(resp.read().decode())
print(f"从 Supabase 拉取 {len(records)} 条实测记录")

# ─── 2. 读取当前 route_params.json ───
with open(r"C:\Users\Liu Sizheng\Desktop\claude code\环线坐车小程序\public\data\route_params.json", encoding="utf-8") as f:
    route_params = json.load(f)

# 构建 (routeKey, from, to) -> current_finalSegmentSeconds
old_seg = {}
for rp in route_params:
    rk = rp["routeKey"]
    for s in rp["stops"]:
        key = (rk, s["prevStop"], s["currentStop"])
        old_seg[key] = s["finalSegmentSeconds"]

# ─── 3. 站名修正 ───
# 站名沿革：
#   2026-06-23 前：环线1路/就餐专线的"系统楼"曾记作"高超楼"，"网球场"曾记作"教勤连"
#   2026-10-17 起：旧「高超楼」改名「空天楼」，旧「系统楼」改名「高超楼」
#   数据库已于 2026-10-17 批量更新为新名，此函数兜底可能存在的未更新旧记录。
def correct_station(route, seg_from, seg_to):
    """修正历史站名（对原始值直接映射，不链式）"""
    def map_one(name):
        # 旧"系统楼"（任何路线）→ 现行"高超楼"
        if name == "系统楼":
            return "高超楼"
        # 旧"教勤连" → 网球场
        if name == "教勤连":
            return "网球场"
        # 旧"高超楼"（仅环线3路系列存在的独立站，激光所之后）→ 空天楼
        # 注意：环线1路/就餐专线的旧"高超楼"在 2026-06-23 已统一改为"系统楼"，
        # 数据库中不可能再出现，故此处按环3口径映射为空天楼是安全的。
        if name == "高超楼" and route in ("环线3路", "环线3路(系统楼发车)", "环线3路(高超楼发车)"):
            return "空天楼"
        return name
    return map_one(seg_from), map_one(seg_to)

# ─── 4. 按 (routeKey, from, to) 分组实测数据 ───
# route name → routeKey mapping
name_to_key = {
    "环线1路": "HX1_NORMAL",
    "就餐专线": "HX1_DINING",
    # 2026-10-18 起：环线2路/环线3路合并为接驳环线（JB1 顺时针 / JB2 逆时针）
    # 旧环2/环3记录的段与新线逆时针（JB2）主体走向一致，统一归入 JB2 统计池
    "环线2路": "JB2_NORMAL",              # 历史记录（2026-10-18 前）
    "环线3路": "JB2_NORMAL",              # 历史记录
    "环线3路(系统楼发车)": "JB2_NORMAL",  # 历史记录
    "环线3路(高超楼发车)": "JB2_NORMAL",  # 历史记录
    "接驳1路": "JB1_NORMAL",
    "接驳2路": "JB2_NORMAL",
}

# routeKey → vehicle type（公交/接驳车分开统计）
bus_routes = {"HX1_NORMAL", "HX1_DINING"}
shuttle_routes = {"JB1_NORMAL", "JB2_NORMAL"}

def vehicle_type(rk):
    return "bus" if rk in bus_routes else "shuttle"

# 收集实测: (routeKey, from, to) -> [seconds, ...]
measured = defaultdict(list)
record_count = defaultdict(int)  # (routeKey, from, to) -> count of contributing records

for rec in records:
    route_name = rec["route"]
    rk = name_to_key.get(route_name, "")
    if not rk:
        continue
    for seg in rec["segments"]:
        f, t = correct_station(route_name, seg["from"], seg["to"])
        key = (rk, f, t)
        measured[key].append(seg["seconds"])

# ─── 5. 获取各路线站点序列 ───
route_stops_seq = {}
route_total_old = {}
for rp in route_params:
    rk = rp["routeKey"]
    stops = [(s["prevStop"], s["currentStop"]) for s in rp["stops"]]
    route_stops_seq[rk] = stops
    route_total_old[rk] = rp["totalSeconds"]

# ─── 6. 计算预估值 ───
def calc_estimate(times):
    """N≥5去头尾均值, N≤4直接均值, N=0返回None"""
    n = len(times)
    if n == 0:
        return None, n, "无实测"
    if n >= 5:
        s = sorted(times)
        trimmed = s[1:-1]
        v = round(mean(trimmed))
        return v, n, f"去头尾均值(去掉{s[0]}s/{s[-1]}s, 剩{len(trimmed)}个取均)"
    else:
        v = round(mean(times))
        return v, n, f"直接均值({n}个)"

# ─── 7. 参照查找 ───
# 路线家族: 同一物理环路的不同变体
ROUTE_FAMILY = {
    "HX1_NORMAL": "HX1", "HX1_DINING": "HX1",
    "HX3_NORMAL": "HX3", "HX3_GAOCHAO": "HX3",
    "HX2_NORMAL": "HX2",
}

def find_reference(rk, f, t, calculated, verbose=True):
    """
    优先级:
    0. 同路线家族 + 同路段 (HX3_GAOCHAO→HX3_NORMAL, HX1_DINING→HX1_NORMAL)
    1. 同车型 + 同路段
    2. 跨车型 + 同路段
    3. 同路线反向等同段
    4. 其他路线反向等同段 → ×倍率(就餐)
    5. 保持原值
    """
    vt = vehicle_type(rk)
    family = ROUTE_FAMILY.get(rk, "")

    # Priority 0: same route family + same segment
    if family:
        for other_rk, other_val in calculated.get((f, t), []):
            if ROUTE_FAMILY.get(other_rk) == family and other_rk != rk:
                return other_val, f"同路线家族: {other_rk} {other_val}s"

    # Priority 1: same vehicle type + same segment
    for other_rk, other_val in calculated.get((f, t), []):
        if other_rk != rk and vehicle_type(other_rk) == vt:
            return other_val, f"同车型同路段: {other_rk} {other_val}s"

    # Priority 2: cross vehicle type + same segment
    for other_rk, other_val in calculated.get((f, t), []):
        if other_rk != rk:
            return other_val, f"跨车型同路段: {other_rk} {other_val}s"

    # Priority 3: same route reverse equivalent
    rev_val = calculated.get((t, f), None)
    if rev_val:
        for other_rk, other_val in rev_val:
            if other_rk == rk:
                return other_val, f"自身反向: {rk} {t}→{f} {other_val}s"

    # Priority 4: other route reverse → apply multiplier for dining
    if rev_val:
        for other_rk, other_val in rev_val:
            if rk == "HX1_DINING":
                v = round(other_val * 1.44)
                return v, f"其他路线反向×1.44: {other_rk} {t}→{f} {other_val}s×1.44={v}s"
            else:
                return other_val, f"其他路线反向: {other_rk} {t}→{f} {other_val}s"

    # Priority 5: keep current value
    old_v = old_seg.get((rk, f, t), 0)
    return old_v, f"保持原值: {old_v}s"


# ─── 8. 逐路线计算 ───
print("\n" + "="*80)
print("详细计算过程")
print("="*80)

# First pass: calculate all segments with measurements
new_values = {}  # (rk, from, to) -> new_seconds
calc_details = {}  # (rk, from, to) -> (value, n_records, method)
calculated_index = defaultdict(list)  # (from, to) -> [(rk, value), ...]

for rk, stops in route_stops_seq.items():
    for f, t in stops:
        times = measured.get((rk, f, t), [])
        val, n, method = calc_estimate(times)
        if val is not None:
            new_values[(rk, f, t)] = val
            calc_details[(rk, f, t)] = (val, n, method)
            calculated_index[(f, t)].append((rk, val))

# Second pass: fill missing with references
for rk, stops in route_stops_seq.items():
    for f, t in stops:
        if (rk, f, t) not in new_values:
            ref_val, ref_method = find_reference(rk, f, t, calculated_index)
            new_values[(rk, f, t)] = ref_val
            calc_details[(rk, f, t)] = (ref_val, 0, ref_method)

# ─── 9. 输出详细计算 + 对比 ───
route_names_display = {
    "HX1_NORMAL": "环线1路（公交）",
    "HX1_DINING": "就餐专线（公交）",
    "HX2_NORMAL": "环线2路（接驳车）",
    "HX3_NORMAL": "环线3路（接驳车）",
    "HX3_GAOCHAO": "环线3路高超楼发车（接驳车）",
}

for rk, stops in route_stops_seq.items():
    rname = route_names_display.get(rk, rk)
    print(f"\n{'─'*80}")
    print(f"【{rname}】{rk}")
    print(f"{'─'*80}")
    print(f"{'路段':28s} {'旧值':>5s} {'新值':>5s} {'Δ':>5s} {'实测N':>5s}  计算方法")
    print(f"{'─'*28} {'───':>5} {'───':>5} {'───':>5} {'───':>5}  {'─'*50}")

    total_old = 0
    total_new = 0

    for f, t in stops:
        old_v = old_seg.get((rk, f, t), 0)
        new_v = new_values.get((rk, f, t), old_v)
        n_records = 0
        method = ""
        if (rk, f, t) in calc_details:
            _, n_records, method = calc_details[(rk, f, t)]

        delta = new_v - old_v
        delta_str = f"+{delta}" if delta > 0 else str(delta)
        seg_name = f"{f}→{t}"
        print(f"{seg_name:28s} {old_v:4d}s {new_v:4d}s {delta_str:>5s} {n_records:4d}   {method}")

        total_old += old_v
        total_new += new_v

    old_total_s = route_total_old.get(rk, 0)
    print(f"{'─'*28} {'───':>5} {'───':>5} {'───':>5}")
    print(f"{'全程总计':28s} {old_total_s:4d}s {total_new:4d}s {total_new-old_total_s:+d}s")
    old_min = old_total_s // 60
    old_sec = old_total_s % 60
    new_min = total_new // 60
    new_sec = total_new % 60
    print(f"{'':28s} {old_min}分{old_sec}秒 → {new_min}分{new_sec}秒")

print("\n" + "="*80)
print("数据来源统计")
print("="*80)
total_segments = 0
segments_with_data = 0
for rk, stops in route_stops_seq.items():
    has = 0
    total = 0
    for f, t in stops:
        total += 1
        if measured.get((rk, f, t)):
            has += 1
    total_segments += total
    segments_with_data += has
    rname = route_names_display.get(rk, rk)
    print(f"  {rname}: {has}/{total} 段有实测数据")

print(f"\n  总计: {segments_with_data}/{total_segments} 段有实测 ({segments_with_data/total_segments*100:.0f}%)")
print(f"  实测记录总数: {len(records)} 条")
print(f"  贡献用户: {len(set(r['user_id'] for r in records))} 人")
