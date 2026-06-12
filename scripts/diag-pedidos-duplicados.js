// Detecta pedidos potencialmente duplicados: mismo cliente, varios pedidos NO completados.
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

async function fetchAll(table, select, extra = '') {
  const out = []; let off = 0;
  for (;;) {
    const r = await fetch(`${URL}/rest/v1/${table}?select=${select}${extra}&limit=1000&offset=${off}`, { headers: H });
    const rows = await r.json(); out.push(...rows);
    if (rows.length < 1000) break; off += 1000;
  }
  return out;
}

(async () => {
  const peds = await fetchAll('pedidos', 'id,client_id,client_name,status,remito_number,created_at,items', '&status=neq.completed');
  const byClient = {};
  for (const p of peds) {
    const k = p.client_id || p.client_name || 'sin';
    (byClient[k] = byClient[k] || []).push(p);
  }
  const dupes = Object.entries(byClient).filter(([, arr]) => arr.length > 1);
  console.log(`Clientes con >1 pedido activo: ${dupes.length}\n`);
  for (const [k, arr] of dupes) {
    arr.sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
    const name = arr[0].client_name || k;
    const sum = arr.reduce((a, p) => a + total(p.items), 0);
    console.log(`${name} — ${arr.length} pedidos | importe listado=${sum.toFixed(2)}`);
    for (const p of arr) {
      console.log(`   ${p.id} | ${p.status} | remito=${p.remito_number || '—'} | items=${(p.items||[]).length} | total=${total(p.items).toFixed(2)} | ${p.created_at.slice(0,10)}`);
    }
  }
})();
