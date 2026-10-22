// 由 scripts/gen_station_markers.py 自动生成，勿手改
// 站点标记图：站名气泡 + 圆点合成一张 PNG，运行期只给 marker 一个 iconPath
export interface StationMarkerMeta {
  width: number
  height: number
  /** 让圆点圆心落在经纬度上所需的 anchor.y */
  anchorY: number
}

export const STATION_MARKER_META: Record<string, StationMarkerMeta> = {
  '研究生宿舍楼': { width: 76, height: 25, anchorY: 0.86 },
  '东门': { width: 32, height: 25, anchorY: 0.86 },
  '2号宿舍楼': { width: 60, height: 25, anchorY: 0.86 },
  '军体活动中心东': { width: 87, height: 25, anchorY: 0.86 },
  '网球场': { width: 43, height: 25, anchorY: 0.86 },
  '激光所': { width: 43, height: 25, anchorY: 0.86 },
  '超算中心': { width: 54, height: 25, anchorY: 0.86 },
  '北门': { width: 32, height: 25, anchorY: 0.86 },
  '高超楼': { width: 43, height: 25, anchorY: 0.86 },
  '理学院': { width: 43, height: 25, anchorY: 0.86 },
  '二食堂': { width: 43, height: 25, anchorY: 0.86 },
  '5号宿舍楼': { width: 60, height: 25, anchorY: 0.86 },
  '305教学楼': { width: 62, height: 25, anchorY: 0.86 },
  '一食堂': { width: 43, height: 25, anchorY: 0.86 },
  '二食堂北': { width: 54, height: 25, anchorY: 0.86 },
  '空天楼': { width: 43, height: 25, anchorY: 0.86 },
  '军体活动中心南': { width: 87, height: 25, anchorY: 0.86 },
  '水上训练中心': { width: 76, height: 25, anchorY: 0.86 },
}
