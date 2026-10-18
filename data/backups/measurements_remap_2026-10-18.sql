-- ============================================================
-- measurements 历史记录站名映射与段拆分（2026-10-18 线路调整）
-- 站名：系统楼→高超楼、旧高超楼→空天楼、军体活动中心→军体活动中心东/南（按路线）
-- 段拆分：原环线2路/环线3路记录仅保留与新接驳环线（JB2 逆时针）一致的段，
--         route 统一更新为「接驳2路」；环1/就餐记录仅站名映射，route 不变
-- 删除：id 39/44/83（拆分后无任何可用段：图书馆/305直回段，新线不经停）
-- 原始备份：data/backups/measurements_before_station_rename_2026-10-17.json
-- 映射结果：data/backups/measurements_remapped_2026-10-18.json
-- ============================================================

BEGIN;
UPDATE measurements SET route = '环线1路', segments = '[{"from":"研究生宿舍楼","to":"东门","seconds":65},{"from":"东门","to":"2号宿舍楼","seconds":73},{"from":"2号宿舍楼","to":"军体活动中心东","seconds":47},{"from":"军体活动中心东","to":"激光所","seconds":67},{"from":"激光所","to":"超算中心","seconds":44},{"from":"超算中心","to":"北门","seconds":34},{"from":"北门","to":"高超楼","seconds":53}]'::jsonb WHERE id = 14;
UPDATE measurements SET route = '环线1路', segments = '[{"from":"高超楼","to":"理学院","seconds":45},{"from":"理学院","to":"二食堂","seconds":198},{"from":"二食堂","to":"5号宿舍楼","seconds":75},{"from":"5号宿舍楼","to":"305教学楼","seconds":75}]'::jsonb WHERE id = 15;
UPDATE measurements SET route = '环线1路', segments = '[{"from":"东门","to":"2号宿舍楼","seconds":88},{"from":"2号宿舍楼","to":"军体活动中心东","seconds":63},{"from":"军体活动中心东","to":"激光所","seconds":80},{"from":"激光所","to":"超算中心","seconds":79},{"from":"超算中心","to":"北门","seconds":51},{"from":"北门","to":"高超楼","seconds":94}]'::jsonb WHERE id = 29;
UPDATE measurements SET route = '环线1路', segments = '[{"from":"二食堂","to":"5号宿舍楼","seconds":73},{"from":"5号宿舍楼","to":"305教学楼","seconds":74}]'::jsonb WHERE id = 30;
UPDATE measurements SET route = '环线1路', segments = '[{"from":"研究生宿舍楼","to":"东门","seconds":71},{"from":"东门","to":"2号宿舍楼","seconds":72},{"from":"2号宿舍楼","to":"军体活动中心东","seconds":38},{"from":"军体活动中心东","to":"激光所","seconds":78},{"from":"激光所","to":"超算中心","seconds":22},{"from":"超算中心","to":"北门","seconds":72},{"from":"北门","to":"高超楼","seconds":54}]'::jsonb WHERE id = 31;
UPDATE measurements SET route = '环线1路', segments = '[{"from":"高超楼","to":"理学院","seconds":21},{"from":"理学院","to":"二食堂","seconds":140},{"from":"二食堂","to":"5号宿舍楼","seconds":56},{"from":"5号宿舍楼","to":"305教学楼","seconds":45},{"from":"305教学楼","to":"研究生宿舍楼","seconds":55}]'::jsonb WHERE id = 32;
UPDATE measurements SET route = '环线1路', segments = '[{"from":"研究生宿舍楼","to":"东门","seconds":88},{"from":"东门","to":"2号宿舍楼","seconds":59},{"from":"2号宿舍楼","to":"军体活动中心东","seconds":39},{"from":"军体活动中心东","to":"激光所","seconds":76},{"from":"激光所","to":"超算中心","seconds":22},{"from":"超算中心","to":"北门","seconds":82},{"from":"北门","to":"高超楼","seconds":59}]'::jsonb WHERE id = 33;
UPDATE measurements SET route = '接驳2路', segments = '[{"from":"研究生宿舍楼","to":"一食堂","seconds":91}]'::jsonb WHERE id = 35;
UPDATE measurements SET route = '接驳2路', segments = '[{"from":"高超楼","to":"理学院","seconds":49}]'::jsonb WHERE id = 36;
UPDATE measurements SET route = '接驳2路', segments = '[{"from":"研究生宿舍楼","to":"一食堂","seconds":73},{"from":"一食堂","to":"2号宿舍楼","seconds":46},{"from":"2号宿舍楼","to":"军体活动中心东","seconds":41},{"from":"军体活动中心东","to":"网球场","seconds":26},{"from":"网球场","to":"激光所","seconds":44},{"from":"激光所","to":"空天楼","seconds":104},{"from":"空天楼","to":"高超楼","seconds":28}]'::jsonb WHERE id = 37;
UPDATE measurements SET route = '就餐专线', segments = '[{"from":"高超楼","to":"理学院","seconds":43},{"from":"理学院","to":"二食堂","seconds":229},{"from":"二食堂","to":"一食堂","seconds":171}]'::jsonb WHERE id = 38;
UPDATE measurements SET route = '接驳2路', segments = '[]'::jsonb WHERE id = 39;
UPDATE measurements SET route = '接驳2路', segments = '[{"from":"研究生宿舍楼","to":"一食堂","seconds":70},{"from":"一食堂","to":"2号宿舍楼","seconds":49},{"from":"2号宿舍楼","to":"军体活动中心东","seconds":66},{"from":"军体活动中心东","to":"网球场","seconds":37},{"from":"网球场","to":"激光所","seconds":46},{"from":"激光所","to":"空天楼","seconds":137},{"from":"空天楼","to":"高超楼","seconds":37}]'::jsonb WHERE id = 40;
UPDATE measurements SET route = '接驳2路', segments = '[{"from":"高超楼","to":"理学院","seconds":38}]'::jsonb WHERE id = 41;
UPDATE measurements SET route = '接驳2路', segments = '[{"from":"研究生宿舍楼","to":"一食堂","seconds":70},{"from":"一食堂","to":"2号宿舍楼","seconds":39},{"from":"2号宿舍楼","to":"军体活动中心东","seconds":44},{"from":"军体活动中心东","to":"网球场","seconds":34},{"from":"网球场","to":"激光所","seconds":47},{"from":"激光所","to":"空天楼","seconds":104},{"from":"空天楼","to":"高超楼","seconds":28}]'::jsonb WHERE id = 42;
UPDATE measurements SET route = '就餐专线', segments = '[{"from":"高超楼","to":"理学院","seconds":47},{"from":"理学院","to":"二食堂","seconds":234},{"from":"二食堂","to":"一食堂","seconds":177}]'::jsonb WHERE id = 43;
UPDATE measurements SET route = '接驳2路', segments = '[]'::jsonb WHERE id = 44;
UPDATE measurements SET route = '接驳2路', segments = '[{"from":"研究生宿舍楼","to":"一食堂","seconds":110},{"from":"一食堂","to":"2号宿舍楼","seconds":64},{"from":"2号宿舍楼","to":"军体活动中心东","seconds":66},{"from":"军体活动中心东","to":"网球场","seconds":27},{"from":"网球场","to":"激光所","seconds":51},{"from":"激光所","to":"空天楼","seconds":75},{"from":"空天楼","to":"高超楼","seconds":20}]'::jsonb WHERE id = 45;
UPDATE measurements SET route = '环线1路', segments = '[{"from":"高超楼","to":"理学院","seconds":31},{"from":"理学院","to":"二食堂","seconds":136},{"from":"二食堂","to":"5号宿舍楼","seconds":60},{"from":"5号宿舍楼","to":"305教学楼","seconds":58},{"from":"305教学楼","to":"研究生宿舍楼","seconds":61}]'::jsonb WHERE id = 46;
UPDATE measurements SET route = '接驳2路', segments = '[{"from":"军体活动中心南","to":"水上训练中心","seconds":64},{"from":"水上训练中心","to":"二食堂","seconds":47}]'::jsonb WHERE id = 51;
UPDATE measurements SET route = '接驳2路', segments = '[{"from":"二食堂","to":"5号宿舍楼","seconds":46},{"from":"5号宿舍楼","to":"305教学楼","seconds":60}]'::jsonb WHERE id = 52;
UPDATE measurements SET route = '环线1路', segments = '[{"from":"东门","to":"2号宿舍楼","seconds":64},{"from":"2号宿舍楼","to":"军体活动中心东","seconds":54},{"from":"军体活动中心东","to":"激光所","seconds":88},{"from":"激光所","to":"超算中心","seconds":65},{"from":"超算中心","to":"北门","seconds":46},{"from":"北门","to":"高超楼","seconds":81}]'::jsonb WHERE id = 53;
UPDATE measurements SET route = '环线1路', segments = '[{"from":"高超楼","to":"理学院","seconds":41},{"from":"理学院","to":"二食堂","seconds":150},{"from":"二食堂","to":"5号宿舍楼","seconds":66},{"from":"5号宿舍楼","to":"305教学楼","seconds":46},{"from":"305教学楼","to":"研究生宿舍楼","seconds":62}]'::jsonb WHERE id = 54;
UPDATE measurements SET route = '环线1路', segments = '[{"from":"研究生宿舍楼","to":"东门","seconds":61},{"from":"东门","to":"2号宿舍楼","seconds":90},{"from":"2号宿舍楼","to":"军体活动中心东","seconds":59},{"from":"军体活动中心东","to":"激光所","seconds":82},{"from":"激光所","to":"超算中心","seconds":69},{"from":"超算中心","to":"北门","seconds":32},{"from":"北门","to":"高超楼","seconds":61}]'::jsonb WHERE id = 55;
UPDATE measurements SET route = '环线1路', segments = '[{"from":"研究生宿舍楼","to":"东门","seconds":81},{"from":"东门","to":"2号宿舍楼","seconds":90},{"from":"2号宿舍楼","to":"军体活动中心东","seconds":70},{"from":"军体活动中心东","to":"激光所","seconds":80},{"from":"激光所","to":"超算中心","seconds":43},{"from":"超算中心","to":"北门","seconds":46},{"from":"北门","to":"高超楼","seconds":80}]'::jsonb WHERE id = 56;
UPDATE measurements SET route = '环线1路', segments = '[{"from":"研究生宿舍楼","to":"东门","seconds":72},{"from":"东门","to":"2号宿舍楼","seconds":83},{"from":"2号宿舍楼","to":"军体活动中心东","seconds":42},{"from":"军体活动中心东","to":"激光所","seconds":62},{"from":"激光所","to":"超算中心","seconds":21},{"from":"超算中心","to":"北门","seconds":92},{"from":"北门","to":"高超楼","seconds":61}]'::jsonb WHERE id = 57;
UPDATE measurements SET route = '环线1路', segments = '[{"from":"研究生宿舍楼","to":"东门","seconds":77},{"from":"东门","to":"2号宿舍楼","seconds":87},{"from":"2号宿舍楼","to":"军体活动中心东","seconds":64},{"from":"军体活动中心东","to":"激光所","seconds":77},{"from":"激光所","to":"超算中心","seconds":54},{"from":"超算中心","to":"北门","seconds":47},{"from":"北门","to":"高超楼","seconds":65}]'::jsonb WHERE id = 58;
UPDATE measurements SET route = '环线1路', segments = '[{"from":"研究生宿舍楼","to":"东门","seconds":74},{"from":"东门","to":"2号宿舍楼","seconds":72},{"from":"2号宿舍楼","to":"军体活动中心东","seconds":64},{"from":"军体活动中心东","to":"激光所","seconds":76},{"from":"激光所","to":"超算中心","seconds":75},{"from":"超算中心","to":"北门","seconds":49},{"from":"北门","to":"高超楼","seconds":70}]'::jsonb WHERE id = 59;
UPDATE measurements SET route = '环线1路', segments = '[{"from":"研究生宿舍楼","to":"东门","seconds":83},{"from":"东门","to":"2号宿舍楼","seconds":94},{"from":"2号宿舍楼","to":"军体活动中心东","seconds":24},{"from":"军体活动中心东","to":"激光所","seconds":69},{"from":"激光所","to":"超算中心","seconds":75},{"from":"超算中心","to":"北门","seconds":32},{"from":"北门","to":"高超楼","seconds":69}]'::jsonb WHERE id = 60;
UPDATE measurements SET route = '接驳2路', segments = '[{"from":"军体活动中心南","to":"水上训练中心","seconds":68},{"from":"水上训练中心","to":"二食堂","seconds":48}]'::jsonb WHERE id = 62;
UPDATE measurements SET route = '接驳2路', segments = '[{"from":"研究生宿舍楼","to":"一食堂","seconds":73}]'::jsonb WHERE id = 63;
UPDATE measurements SET route = '接驳2路', segments = '[{"from":"军体活动中心南","to":"水上训练中心","seconds":62},{"from":"水上训练中心","to":"二食堂","seconds":62}]'::jsonb WHERE id = 64;
UPDATE measurements SET route = '接驳2路', segments = '[{"from":"二食堂","to":"5号宿舍楼","seconds":52},{"from":"5号宿舍楼","to":"305教学楼","seconds":48}]'::jsonb WHERE id = 65;
UPDATE measurements SET route = '环线1路', segments = '[{"from":"高超楼","to":"理学院","seconds":41},{"from":"理学院","to":"二食堂","seconds":210}]'::jsonb WHERE id = 66;
UPDATE measurements SET route = '环线1路', segments = '[{"from":"高超楼","to":"理学院","seconds":69},{"from":"理学院","to":"二食堂","seconds":212},{"from":"二食堂","to":"5号宿舍楼","seconds":53},{"from":"5号宿舍楼","to":"305教学楼","seconds":69},{"from":"305教学楼","to":"研究生宿舍楼","seconds":75}]'::jsonb WHERE id = 67;
UPDATE measurements SET route = '接驳2路', segments = '[{"from":"研究生宿舍楼","to":"一食堂","seconds":78}]'::jsonb WHERE id = 68;
UPDATE measurements SET route = '接驳2路', segments = '[{"from":"军体活动中心南","to":"水上训练中心","seconds":36},{"from":"水上训练中心","to":"二食堂","seconds":39}]'::jsonb WHERE id = 69;
UPDATE measurements SET route = '环线1路', segments = '[{"from":"理学院","to":"二食堂","seconds":176},{"from":"二食堂","to":"5号宿舍楼","seconds":86},{"from":"5号宿舍楼","to":"305教学楼","seconds":113},{"from":"305教学楼","to":"研究生宿舍楼","seconds":51}]'::jsonb WHERE id = 70;
UPDATE measurements SET route = '环线1路', segments = '[{"from":"研究生宿舍楼","to":"东门","seconds":86},{"from":"东门","to":"2号宿舍楼","seconds":68},{"from":"2号宿舍楼","to":"军体活动中心东","seconds":57},{"from":"军体活动中心东","to":"激光所","seconds":81},{"from":"激光所","to":"超算中心","seconds":58},{"from":"超算中心","to":"北门","seconds":34},{"from":"北门","to":"高超楼","seconds":73}]'::jsonb WHERE id = 71;
UPDATE measurements SET route = '接驳2路', segments = '[{"from":"研究生宿舍楼","to":"一食堂","seconds":83},{"from":"一食堂","to":"2号宿舍楼","seconds":4},{"from":"2号宿舍楼","to":"军体活动中心东","seconds":43},{"from":"军体活动中心东","to":"网球场","seconds":18},{"from":"网球场","to":"激光所","seconds":51},{"from":"激光所","to":"空天楼","seconds":86},{"from":"空天楼","to":"高超楼","seconds":44}]'::jsonb WHERE id = 72;
UPDATE measurements SET route = '接驳2路', segments = '[{"from":"军体活动中心南","to":"水上训练中心","seconds":54}]'::jsonb WHERE id = 73;
UPDATE measurements SET route = '接驳2路', segments = '[{"from":"二食堂","to":"5号宿舍楼","seconds":34},{"from":"5号宿舍楼","to":"305教学楼","seconds":45}]'::jsonb WHERE id = 74;
UPDATE measurements SET route = '环线1路', segments = '[{"from":"高超楼","to":"理学院","seconds":76},{"from":"理学院","to":"二食堂","seconds":182},{"from":"二食堂","to":"5号宿舍楼","seconds":159},{"from":"5号宿舍楼","to":"305教学楼","seconds":4},{"from":"305教学楼","to":"研究生宿舍楼","seconds":53}]'::jsonb WHERE id = 75;
UPDATE measurements SET route = '接驳2路', segments = '[{"from":"高超楼","to":"理学院","seconds":35}]'::jsonb WHERE id = 76;
UPDATE measurements SET route = '接驳2路', segments = '[{"from":"军体活动中心南","to":"水上训练中心","seconds":52},{"from":"水上训练中心","to":"二食堂","seconds":40}]'::jsonb WHERE id = 77;
UPDATE measurements SET route = '环线1路', segments = '[{"from":"二食堂","to":"5号宿舍楼","seconds":41},{"from":"5号宿舍楼","to":"305教学楼","seconds":41},{"from":"305教学楼","to":"研究生宿舍楼","seconds":51}]'::jsonb WHERE id = 78;
UPDATE measurements SET route = '接驳2路', segments = '[{"from":"军体活动中心南","to":"水上训练中心","seconds":52},{"from":"水上训练中心","to":"二食堂","seconds":44}]'::jsonb WHERE id = 79;
UPDATE measurements SET route = '环线1路', segments = '[{"from":"高超楼","to":"理学院","seconds":50},{"from":"理学院","to":"二食堂","seconds":161},{"from":"二食堂","to":"5号宿舍楼","seconds":47},{"from":"5号宿舍楼","to":"305教学楼","seconds":82},{"from":"305教学楼","to":"研究生宿舍楼","seconds":59}]'::jsonb WHERE id = 80;
UPDATE measurements SET route = '接驳2路', segments = '[{"from":"高超楼","to":"理学院","seconds":38}]'::jsonb WHERE id = 81;
UPDATE measurements SET route = '环线1路', segments = '[{"from":"高超楼","to":"理学院","seconds":49},{"from":"理学院","to":"二食堂","seconds":139},{"from":"二食堂","to":"5号宿舍楼","seconds":68},{"from":"5号宿舍楼","to":"305教学楼","seconds":32},{"from":"305教学楼","to":"研究生宿舍楼","seconds":68}]'::jsonb WHERE id = 82;
UPDATE measurements SET route = '接驳2路', segments = '[]'::jsonb WHERE id = 83;
UPDATE measurements SET route = '接驳2路', segments = '[{"from":"水上训练中心","to":"二食堂","seconds":75}]'::jsonb WHERE id = 84;
UPDATE measurements SET route = '接驳2路', segments = '[{"from":"水上训练中心","to":"二食堂","seconds":39}]'::jsonb WHERE id = 85;
UPDATE measurements SET route = '环线1路', segments = '[{"from":"高超楼","to":"理学院","seconds":23}]'::jsonb WHERE id = 86;
UPDATE measurements SET route = '接驳2路', segments = '[{"from":"研究生宿舍楼","to":"一食堂","seconds":76},{"from":"一食堂","to":"2号宿舍楼","seconds":48},{"from":"2号宿舍楼","to":"军体活动中心东","seconds":61},{"from":"军体活动中心东","to":"网球场","seconds":27},{"from":"网球场","to":"激光所","seconds":68},{"from":"激光所","to":"空天楼","seconds":95},{"from":"空天楼","to":"高超楼","seconds":80}]'::jsonb WHERE id = 87;
UPDATE measurements SET route = '环线1路', segments = '[{"from":"理学院","to":"二食堂","seconds":229},{"from":"二食堂","to":"5号宿舍楼","seconds":110},{"from":"5号宿舍楼","to":"305教学楼","seconds":26},{"from":"305教学楼","to":"研究生宿舍楼","seconds":79}]'::jsonb WHERE id = 88;
UPDATE measurements SET route = '环线1路', segments = '[{"from":"研究生宿舍楼","to":"东门","seconds":90},{"from":"东门","to":"2号宿舍楼","seconds":65},{"from":"2号宿舍楼","to":"军体活动中心东","seconds":32},{"from":"军体活动中心东","to":"激光所","seconds":64},{"from":"激光所","to":"超算中心","seconds":95},{"from":"超算中心","to":"北门","seconds":9},{"from":"北门","to":"高超楼","seconds":70},{"from":"高超楼","to":"理学院","seconds":45}]'::jsonb WHERE id = 89;
UPDATE measurements SET route = '环线1路', segments = '[{"from":"研究生宿舍楼","to":"东门","seconds":386}]'::jsonb WHERE id = 90;
UPDATE measurements SET route = '环线1路', segments = '[{"from":"北门","to":"高超楼","seconds":35},{"from":"高超楼","to":"理学院","seconds":55}]'::jsonb WHERE id = 91;
UPDATE measurements SET route = '环线1路', segments = '[{"from":"二食堂","to":"5号宿舍楼","seconds":94},{"from":"5号宿舍楼","to":"305教学楼","seconds":24},{"from":"305教学楼","to":"研究生宿舍楼","seconds":81}]'::jsonb WHERE id = 92;
UPDATE measurements SET route = '环线1路', segments = '[{"from":"高超楼","to":"理学院","seconds":37},{"from":"理学院","to":"二食堂","seconds":163},{"from":"二食堂","to":"5号宿舍楼","seconds":58},{"from":"5号宿舍楼","to":"305教学楼","seconds":50},{"from":"305教学楼","to":"研究生宿舍楼","seconds":61}]'::jsonb WHERE id = 93;

-- 删除拆分后无有效段的 3 条记录
DELETE FROM measurements WHERE id IN (39, 44, 83);

-- 验证 1：旧站名/废弃站点应全部消失（预期 0；"军体活动中心" 带引号精确匹配旧名，不误伤东/南新名）
SELECT count(*) AS old_name_left FROM measurements
WHERE segments::text ~ '系统楼|教勤连|门诊部|1号宿舍楼|图书馆|"军体活动中心"';

-- 验证 2：route 分布预览
SELECT route, count(*) FROM measurements GROUP BY route ORDER BY route;

COMMIT;
