// Reabre caja_20260604_2 (se cerro por error). Vuelve a status open y limpia el cierre.
const fs = require('fs');
const path = require('path');
const env = {};
fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf-8').split('\n').forEach((l) => {
  const m = l.match(/^([^#=]+)=["']?([^"'\r]*)["']?/);
  if (m) env[m[1].trim()] = m[2].trim();
});
const BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const ID = 'caja_20260604_2';

(async () => {
  const r = await fetch(`${BASE}/rest/v1/caja?id=eq.${ID}`, {
    method: 'PATCH',
    headers: { ...H, Prefer: 'return=representation' },
    body: JSON.stringify({
      status: 'open',
      closed_at: null,
      closed_by: null,
      final_amount: null,
      expected_amount: null,
      difference: null,
    }),
  });
  const d = await r.json();
  console.log(`PATCH ${ID} -> ${r.status}`);
  console.log(JSON.stringify(d, null, 1));
})();
