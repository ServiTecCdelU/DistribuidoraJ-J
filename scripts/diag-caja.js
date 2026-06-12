const fs = require('fs');
const path = require('path');
const env = {};
fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf-8').split('\n').forEach((l) => {
  const m = l.match(/^([^#=]+)=["']?([^"'\r]*)["']?/);
  if (m) env[m[1].trim()] = m[2].trim();
});
const BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

(async () => {
  const r = await fetch(`${BASE}/rest/v1/caja?select=id,opened_at,closed_at,opened_by,closed_by,initial_amount,final_amount,status&order=opened_at.desc&limit=10`, { headers: H });
  const rows = await r.json();
  console.log(`Ultimas cajas (${Array.isArray(rows) ? rows.length : JSON.stringify(rows)}):\n`);
  if (Array.isArray(rows)) rows.forEach((c) => {
    console.log(`${c.id} | status=${c.status} | abierta=${c.opened_at} | cerrada=${c.closed_at || '—'} | inicial=${c.initial_amount} | final=${c.final_amount ?? '—'} | by=${c.opened_by}`);
  });
})();
