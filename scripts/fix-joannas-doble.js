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
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
const VENTA = 'venta_joannasmariadelosangeles_2';
const CAJA = 'caja_20260605_3';
const MONTO = 112984.67;
// productos a devolver: id productos -> unidades a sumar
const RESTORE = { 'prod_mp_0102676': 6, 'prod_mp_0105129': 8 };

async function get(p) { return (await fetch(URL + p, { headers: H })).json(); }

async function main() {
  // 1) Devolver stock (leer actual y sumar, robusto)
  for (const [id, add] of Object.entries(RESTORE)) {
    const [prod] = await get(`/rest/v1/productos?id=eq.${id}&select=id,name,stock`);
    const nuevo = (prod.stock || 0) + add;
    const r = await fetch(`${URL}/rest/v1/productos?id=eq.${id}`, {
      method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify({ stock: nuevo })
    });
    console.log(`STOCK ${prod.name}: ${prod.stock} -> ${nuevo} (+${add}) [${r.status}]`);
  }

  // 2) Borrar movimientos erroneos de N83
  let r = await fetch(`${URL}/rest/v1/stock_movimientos?motivo=eq.${VENTA}`, { method: 'DELETE', headers: { ...H, Prefer: 'return=minimal' } });
  console.log(`DELETE stock_movimientos motivo=${VENTA} [${r.status}]`);

  // 3) Borrar la venta duplicada
  r = await fetch(`${URL}/rest/v1/ventas?id=eq.${VENTA}`, { method: 'DELETE', headers: { ...H, Prefer: 'return=minimal' } });
  console.log(`DELETE venta ${VENTA} [${r.status}]`);

  // 4) Corregir caja cerrada
  const [caja] = await get(`/rest/v1/caja?id=eq.${CAJA}&select=*`);
  const upd = {
    cash_total: +(caja.cash_total - MONTO).toFixed(2),
    final_amount: +(caja.final_amount - MONTO).toFixed(2),
    expected_amount: +(caja.expected_amount - MONTO).toFixed(2),
    total_sales: +(caja.total_sales - MONTO).toFixed(2),
    sales_count: caja.sales_count - 1,
  };
  r = await fetch(`${URL}/rest/v1/caja?id=eq.${CAJA}`, {
    method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
    body: JSON.stringify(upd)
  });
  console.log(`CAJA ${CAJA} [${r.status}]:`);
  console.log(`  cash_total ${caja.cash_total} -> ${upd.cash_total}`);
  console.log(`  total_sales ${caja.total_sales} -> ${upd.total_sales}`);
  console.log(`  sales_count ${caja.sales_count} -> ${upd.sales_count}`);

  // 5) Verificar
  const v = await get(`/rest/v1/ventas?id=eq.${VENTA}&select=id`);
  console.log(`\nVERIFY venta N83 existe? ${v.length ? 'SI (ERROR)' : 'NO (ok, borrada)'}`);
}
main().catch(e => console.error(e));
