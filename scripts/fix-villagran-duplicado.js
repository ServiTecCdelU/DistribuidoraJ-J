const fs = require('fs');
const path = require('path');
const env = {};
fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf-8').split('\n').forEach((line) => {
  const m = line.match(/^([^#=]+)=["']?([^"'\r]*)["']?/);
  if (m) env[m[1].trim()] = m[2].trim();
});
const BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

(async () => {
  const r = await fetch(`${BASE}/rest/v1/pedidos?id=eq.pedido_villagranmaximiliano_1`, {
    method: 'DELETE',
    headers: { ...H, Prefer: 'return=representation' },
  });
  const d = await r.json();
  console.log('Borrados:', Array.isArray(d) ? d.length : JSON.stringify(d));
  if (Array.isArray(d) && d[0]) console.log('  ->', d[0].id, d[0].remito_number);
})();
