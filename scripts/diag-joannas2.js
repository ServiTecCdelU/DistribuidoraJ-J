const fs = require('fs');
const path = require('path');
const envText = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const env = {};
for (const line of envText.split('\n')) {
  const m = line.match(/^([^=#]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
}
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY };

async function main() {
  const ids = ['pedido_joannasmariadelosangeles_1', 'pedido_joannasmariadelosangeles_2'];
  for (const id of ids) {
    const r = await fetch(`${URL}/rest/v1/pedidos?id=eq.${id}&select=*`, { headers: H });
    const arr = await r.json();
    const p = arr[0];
    if (!p) { console.log(`\n=== ${id} === NO EXISTE`); continue; }
    console.log(`\n=== ${id} === status=${p.status} remito=${p.remito_number || 'NULL'} fecha=${p.created_at || p.fecha || p.date || '?'}`);
    const items = typeof p.items === 'string' ? JSON.parse(p.items) : p.items;
    for (const it of (items || [])) {
      console.log(`  ${it.quantity} x ${it.name} (${it.codigo || it.productId}) $${it.price}`);
    }
  }
}
main().catch(e => console.error(e));
