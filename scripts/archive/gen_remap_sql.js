// ⚠️ 已归档（2026-10-18）：一次性脚本，SQL 已生成完毕（data/backups/measurements_remap_2026-10-18.sql），勿重复运行
// 一次性脚本：由映射结果 JSON 生成 Supabase 控制台执行用 SQL
// 用法：node scripts/archive/gen_remap_sql.js
import fs from 'fs'

const updates = JSON.parse(fs.readFileSync('data/backups/measurements_remapped_2026-10-18.json', 'utf-8'))

let sql = `-- ============================================================
-- measurements 历史记录站名映射与段拆分（2026-10-18 线路调整）
-- 站名：系统楼→高超楼、旧高超楼→空天楼、军体活动中心→军体活动中心东/南（按路线）
-- 段拆分：原环线2路/环线3路记录仅保留与新接驳环线（JB2 逆时针）一致的段，
--         route 统一更新为「接驳2路」；环1/就餐记录仅站名映射，route 不变
-- 删除：id 39/44/83（拆分后无任何可用段：图书馆/305直回段，新线不经停）
-- 原始备份：data/backups/measurements_before_station_rename_2026-10-17.json
-- 映射结果：data/backups/measurements_remapped_2026-10-18.json
-- ============================================================

BEGIN;
`

for (const u of updates) {
  sql += `UPDATE measurements SET route = '${u.route}', segments = '${JSON.stringify(u.segments)}'::jsonb WHERE id = ${u.id};\n`
}

sql += `
-- 删除拆分后无有效段的 3 条记录
DELETE FROM measurements WHERE id IN (39, 44, 83);

-- 验证 1：旧站名/废弃站点应全部消失（预期 0）
SELECT count(*) AS old_name_left FROM measurements
WHERE segments::text ~ '系统楼|教勤连|门诊部|1号宿舍楼|图书馆|"军体活动中心"';

-- 验证 2：route 分布预览
SELECT route, count(*) FROM measurements GROUP BY route ORDER BY route;

COMMIT;
`

fs.writeFileSync('data/backups/measurements_remap_2026-10-18.sql', sql)
console.log('✅ SQL 已生成: data/backups/measurements_remap_2026-10-18.sql')
console.log('  UPDATE:', updates.length, '条 + DELETE 1 条 + 验证 2 条')
