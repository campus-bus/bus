# ⚠️ 已归档（2026-10-18）：本脚本为 v2.0 路段重估时的一次性写回脚本，
# 内部硬编码的 HX2/HX3 段键已不适用于接驳环线（JB1/JB2）新结构，请勿直接运行。
# 后续站间秒数校准：编辑 public/data/route_params.json 对应段的 finalSegmentSeconds，
# 然后运行 node scripts/regenerate_predictions.js。
#!/usr/bin/env python3
"""更新 route_params.json 中的 finalSegmentSeconds / cumulativeSeconds / totalSeconds"""

import json

# New values from the recalculation
NEW_VALUES = {
    # HX1_NORMAL
    ("HX1_NORMAL", "研究生宿舍楼", "研究生宿舍楼"): 0,
    ("HX1_NORMAL", "研究生宿舍楼", "东门"): 75,
    ("HX1_NORMAL", "东门", "2号宿舍楼"): 80,
    ("HX1_NORMAL", "2号宿舍楼", "军体活动中心"): 52,
    ("HX1_NORMAL", "军体活动中心", "激光所"): 76,
    ("HX1_NORMAL", "激光所", "超算中心"): 52,
    ("HX1_NORMAL", "超算中心", "北门"): 51,
    ("HX1_NORMAL", "北门", "高超楼"): 67,
    ("HX1_NORMAL", "高超楼", "理学院"): 34,
    ("HX1_NORMAL", "理学院", "二食堂"): 156,
    ("HX1_NORMAL", "二食堂", "5号宿舍楼"): 66,
    ("HX1_NORMAL", "5号宿舍楼", "305教学楼"): 59,
    ("HX1_NORMAL", "305教学楼", "研究生宿舍楼"): 59,

    # HX1_DINING
    ("HX1_DINING", "高超楼", "高超楼"): 0,
    ("HX1_DINING", "高超楼", "理学院"): 45,
    ("HX1_DINING", "理学院", "二食堂"): 232,
    ("HX1_DINING", "二食堂", "一食堂"): 174,
    ("HX1_DINING", "一食堂", "305教学楼"): 101,
    ("HX1_DINING", "305教学楼", "5号宿舍楼"): 85,
    ("HX1_DINING", "5号宿舍楼", "二食堂北"): 95,
    ("HX1_DINING", "二食堂北", "理学院"): 232,
    ("HX1_DINING", "理学院", "高超楼"): 45,

    # HX2_NORMAL
    ("HX2_NORMAL", "研究生宿舍楼", "研究生宿舍楼"): 0,
    ("HX2_NORMAL", "研究生宿舍楼", "一食堂"): 73,
    ("HX2_NORMAL", "一食堂", "门诊部"): 46,
    ("HX2_NORMAL", "门诊部", "1号宿舍楼"): 82,
    ("HX2_NORMAL", "1号宿舍楼", "军体活动中心"): 28,
    ("HX2_NORMAL", "军体活动中心", "水上训练中心"): 65,
    ("HX2_NORMAL", "水上训练中心", "二食堂"): 52,
    ("HX2_NORMAL", "二食堂", "5号宿舍楼"): 49,
    ("HX2_NORMAL", "5号宿舍楼", "305教学楼"): 54,
    ("HX2_NORMAL", "305教学楼", "研究生宿舍楼"): 62,

    # HX3_NORMAL
    ("HX3_NORMAL", "研究生宿舍楼", "研究生宿舍楼"): 0,
    ("HX3_NORMAL", "研究生宿舍楼", "一食堂"): 78,
    ("HX3_NORMAL", "一食堂", "2号宿舍楼"): 50,
    ("HX3_NORMAL", "2号宿舍楼", "军体活动中心"): 54,
    ("HX3_NORMAL", "军体活动中心", "网球场"): 31,
    ("HX3_NORMAL", "网球场", "激光所"): 47,
    ("HX3_NORMAL", "激光所", "空天楼"): 105,
    ("HX3_NORMAL", "空天楼", "高超楼"): 28,
    ("HX3_NORMAL", "高超楼", "理学院"): 44,
    ("HX3_NORMAL", "理学院", "二食堂"): 180,
    ("HX3_NORMAL", "二食堂", "图书馆"): 152,
    ("HX3_NORMAL", "图书馆", "305教学楼"): 70,
    ("HX3_NORMAL", "305教学楼", "研究生宿舍楼"): 78,

    # HX3_GAOCHAO
    ("HX3_GAOCHAO", "高超楼", "高超楼"): 0,
    ("HX3_GAOCHAO", "高超楼", "理学院"): 44,
    ("HX3_GAOCHAO", "理学院", "二食堂"): 180,
    ("HX3_GAOCHAO", "二食堂", "图书馆"): 152,
    ("HX3_GAOCHAO", "图书馆", "305教学楼"): 70,
    ("HX3_GAOCHAO", "305教学楼", "研究生宿舍楼"): 78,
    ("HX3_GAOCHAO", "研究生宿舍楼", "一食堂"): 78,
    ("HX3_GAOCHAO", "一食堂", "2号宿舍楼"): 50,
    ("HX3_GAOCHAO", "2号宿舍楼", "军体活动中心"): 54,
    ("HX3_GAOCHAO", "军体活动中心", "网球场"): 31,
    ("HX3_GAOCHAO", "网球场", "激光所"): 47,
    ("HX3_GAOCHAO", "激光所", "空天楼"): 105,
    ("HX3_GAOCHAO", "空天楼", "高超楼"): 28,
}


def main():
    path = r"C:\Users\Liu Sizheng\Desktop\claude code\环线坐车小程序\public\data\route_params.json"
    with open(path, encoding="utf-8") as f:
        route_params = json.load(f)

    changes = []
    for rp in route_params:
        rk = rp["routeKey"]
        cum = 0
        for s in rp["stops"]:
            key = (rk, s["prevStop"], s["currentStop"])
            old_v = s["finalSegmentSeconds"]
            new_v = NEW_VALUES.get(key, old_v)

            if old_v != new_v:
                changes.append(f"  {rk} {s['prevStop']}→{s['currentStop']}: {old_v}s→{new_v}s ({new_v-old_v:+d}s)")

            s["finalSegmentSeconds"] = new_v
            cum += new_v
            s["cumulativeSeconds"] = cum

        old_total = rp["totalSeconds"]
        rp["totalSeconds"] = cum
        if old_total != cum:
            changes.append(f"  {rk} totalSeconds: {old_total}s→{cum}s ({cum-old_total:+d}s)")

    with open(path, "w", encoding="utf-8") as f:
        json.dump(route_params, f, ensure_ascii=False, indent=2)

    print(f"Updated route_params.json — {len(changes)} changes:")
    for c in changes:
        print(c)


if __name__ == "__main__":
    main()
