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
  // una comision cualquiera para ver columnas
  let r = await fetch(`${URL}/rest/v1/comisiones?select=*&limit=1`, { headers: H });
  console.log('=== comisiones cols ===');
  let a = await r.json(); console.log(a[0] ? Object.keys(a[0]).join(', ') : 'vacia');

  // comisiones de JOANNAS por sale_id
  r = await fetch(`${URL}/rest/v1/comisiones?sale_id=in.(venta_joannasmariadelosangeles_1,venta_joannasmariadelosangeles_2)&select=*`, { headers: H });
  console.log('\n=== comisiones JOANNAS by sale_id ===');
  console.log(await r.text());

  // stock_movimientos cols
  r = await fetch(`${URL}/rest/v1/stock_movimientos?select=*&limit=1`, { headers: H });
  a = await r.json();
  console.log('\n=== stock_movimientos cols ===');
  console.log(a[0] ? Object.keys(a[0]).join(', ') : 'vacia');

  // caja cols + ultimas
  r = await fetch(`${URL}/rest/v1/caja?select=*&order=created_at.desc&limit=3`, { headers: H });
  console.log('\n=== caja ultimas 3 ===');
  let cajas = await r.json();
  for (const c of cajas) {
    const copy = {...c}; delete copy.movimientos; delete copy.ventas;
    console.log(JSON.stringify(copy));
  }
}
main().catch(e => console.error(e));
