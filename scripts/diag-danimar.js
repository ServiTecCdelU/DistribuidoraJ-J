// Diagnostica pedidos abiertos de despensa danimar (mismatch remito vs cobro).
const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '..', '.env');
const env = {};
fs.readFileSync(envPath, 'utf-8').split('\n').forEach((line) => {
  const m = line.match(/^([^#=]+)=["']?([^"'\r]*)["']?/);
  if (m) env[m[1].trim()] = m[2].trim();
});
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const total = (items) => (items || []).reduce((a, it) => {
  const base = (it.quantity || 0) * (it.price || 0);
  const d = it.itemDiscount ? base * it.itemDiscount / 100 : 0;
  return a + base - d;
}, 0);

(async () => {
  const r = await fetch(`${URL}/rest/v1/pedidos?status=neq.completed&or=(client_name.ilike.*danimar*,id.ilike.*danimar*)&select=id,client_id,client_name,status,remito_number,created_at,items`, { headers: H });
  const peds = await r.json();
  console.log(`Pedidos abiertos danimar: ${peds.length}\n`);
  let suma = 0;
  for (const p of peds) {
    const t = total(p.items);
    suma += t;
    console.log(`${p.id} | ${p.status} | remito=${p.remito_number || '—'} | items=${(p.items||[]).length} | total=${t.toFixed(2)} | ${(p.created_at||'').slice(0,10)}`);
    for (const it of (p.items || [])) {
      console.log(`     ${it.quantity} x ${it.name} @ ${it.price}${it.itemDiscount ? ` (-${it.itemDiscount}%)` : ''}`);
    }
  }
  console.log(`\nSUMA cobro (agrupado por cliente) = ${suma.toFixed(2)}`);
})();
