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
  for (const id of ['venta_joannasmariadelosangeles_1', 'venta_joannasmariadelosangeles_2']) {
    const r = await fetch(`${URL}/rest/v1/ventas?id=eq.${id}&select=*`, { headers: H });
    const [v] = await r.json();
    console.log(`\n========== ${id} ==========`);
    for (const k of Object.keys(v)) {
      if (k === 'items' || k.includes('base64')) continue;
      console.log(`  ${k} = ${JSON.stringify(v[k])}`);
    }
    const items = typeof v.items === 'string' ? JSON.parse(v.items) : v.items;
    console.log('  ITEMS:');
    for (const it of (items || [])) console.log(`    ${it.quantity} x ${it.name} $${it.price}`);
  }

  // Comisiones asociadas
  let r = await fetch(`${URL}/rest/v1/comisiones?or=(sale_id.eq.venta_joannasmariadelosangeles_1,sale_id.eq.venta_joannasmariadelosangeles_2)&select=*`, { headers: H });
  console.log('\n========== COMISIONES ==========');
  console.log(await r.text());

  // Cliente: deuda/credito actual
  r = await fetch(`${URL}/rest/v1/clientes?id=eq.cliente_joannasmariadelosangeles_1&select=id,name,balance,debt,credit,saldo,cuenta_corriente`, { headers: H });
  console.log('\n========== CLIENTE (saldo) ==========');
  console.log(await r.text());
}
main().catch(e => console.error(e));
