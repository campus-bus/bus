// 临时脚本：验证 measurements 迁移结果（用后删除）
const fs = require('fs');
const env = fs.readFileSync('.env', 'utf-8');
const url = env.match(/VITE_SUPABASE_URL=(.+)/)[1].trim();
const key = env.match(/VITE_SUPABASE_ANON_KEY=(.+)/)[1].trim();

(async () => {
  const r = await fetch(url + '/rest/v1/measurements?select=id,route,segments&order=id', {
    headers: { apikey: key, Authorization: 'Bearer ' + key },
  });
  const data = await r.json();

  console.log('总记录:', data.length, '（预期 58 = 61-3 删除）');
  const routes = {};
  for (const x of data) routes[x.route] = (routes[x.route] || 0) + 1;
  console.log('route 分布:', JSON.stringify(routes), '（预期 环1:31 就餐:2 接驳2路:25）');

  for (const name of ['系统楼', '教勤连', '门诊部', '1号宿舍楼', '图书馆']) {
    const hits = data.filter(x => JSON.stringify(x.segments).includes(name));
    console.log('旧站名「' + name + '」残留:', hits.length, hits.length === 0 ? '✅' : '❌ id:' + hits.map(x=>x.id).join(','));
  }
  const oldJunti = data.filter(x => JSON.stringify(x.segments).includes('"军体活动中心"'));
  console.log('旧名「军体活动中心」（无后缀精确）残留:', oldJunti.length, oldJunti.length === 0 ? '✅' : '❌ id:' + oldJunti.map(x=>x.id).join(','));
  const kongtian = data.filter(x => JSON.stringify(x.segments).includes('空天楼'));
  const gaochao = data.filter(x => JSON.stringify(x.segments).includes('高超楼'));
  const juntiE = data.filter(x => JSON.stringify(x.segments).includes('军体活动中心东'));
  const juntiS = data.filter(x => JSON.stringify(x.segments).includes('军体活动中心南'));
  console.log('新名统计: 空天楼', kongtian.length, '| 高超楼', gaochao.length, '| 军体东', juntiE.length, '| 军体南', juntiS.length);

  const s37 = data.find(x => x.id === 37);
  console.log('\n抽查 id=37（环3→接驳2路）:', s37.route, s37.segments.map(s => s.from + '>' + s.to).join(' '));
  const s63 = data.find(x => x.id === 63);
  console.log('抽查 id=63（环2拆分）:', s63.route, s63.segments.map(s => s.from + '>' + s.to + '(' + s.seconds + 's)').join(' '));
  const s29 = data.find(x => x.id === 29);
  console.log('抽查 id=29（环1军体东）:', s29.route, s29.segments.map(s => s.from + '>' + s.to).join(' '));
})();
