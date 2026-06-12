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

async function show(label, path) {
  const r = await fetch(URL + path, { headers: H });
  console.log(`\n===== ${label} =====`);
  console.log((await r.text()).slice(0, 2000));
}

async function main() {
  // items de venta_2 (duplicado)
  let r = await fetch(`${URL}/rest/v1/ventas?id=eq.venta_joannasmariadelosangeles_2&select=items`, { headers: H });
  const [v] = await r.json();
  const items = typeof v.items === 'string' ? JSON.parse(v.items) : v.items;
  console.log('===== ITEMS venta_2 (N83, duplicado a revertir) =====');
  for (const it of (items || [])) console.log(`  ${it.quantity} x ${it.name} (${it.codigo || it.productId})`);

  await show('COMISIONES (ambas)', `/rest/v1/comisiones?or=(venta_id.eq.venta_joannasmariadelosangeles_1,venta_id.eq.venta_joannasmariadelosangeles_2,sale_id.eq.venta_joannasmariadelosangeles_1,sale_id.eq.venta_joannasmariadelosangeles_2)&select=*`);
  await show('CLIENTE saldo', `/rest/v1/clientes?id=eq.cliente_joannasmariadelosangeles_1&select=*`);
  await show('CAJA abierta', `/rest/v1/caja?status=eq.open&select=*`);
  await show('STOCK_MOV venta_2', `/rest/v1/stock_movimientos?or=(reference.ilike.*joannas*2*,sale_id.eq.venta_joannasmariadelosangeles_2)&select=*&limit=20`);
}
main().catch(e => console.error(e));
