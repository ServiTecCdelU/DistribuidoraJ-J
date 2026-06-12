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
  // movimientos de HARINA hoy
  let r = await fetch(`${URL}/rest/v1/stock_movimientos?mayorista_producto_id=eq.mp_0102045&created_at=gte.2026-06-05T20:00:00&select=*&order=created_at.asc`, { headers: H });
  console.log('=== MOV HARINA mp_0102045 desde 20:00 UTC ===');
  console.log(await r.text());

  // stock actual de productos involucrados
  const prods = ['prod_mp_0102045','prod_mp_0210610','prod_mp_0106450','prod_mp_0105348'];
  r = await fetch(`${URL}/rest/v1/productos?id=in.(${prods.join(',')})&select=id,name,stock`, { headers: H });
  console.log('\n=== STOCK ACTUAL productos clave ===');
  console.log(await r.text());

  // total movimientos hoy (para ver si se loguea algo)
  r = await fetch(`${URL}/rest/v1/stock_movimientos?created_at=gte.2026-06-05T00:00:00&select=id&limit=1`, { headers: H });
  console.log('\n=== hay movimientos hoy? ===');
  console.log(await r.text());
}
main().catch(e => console.error(e));
