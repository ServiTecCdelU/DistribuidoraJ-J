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

async function get(p) { return (await fetch(URL + p, { headers: H })).json(); }

async function main() {
  // Todas las cajas
  const cajas = await get('/rest/v1/caja?select=id,status,opened_at,closed_at,opened_by,closed_by,initial_amount,final_amount,expected_amount,cash_total,total_sales,sales_count&order=opened_at.asc');
  console.log('=== TODAS LAS CAJAS ===');
  for (const c of cajas) {
    console.log(`${c.id} | ${c.status} | open=${c.opened_at} close=${c.closed_at} | cash=${c.cash_total} total=${c.total_sales} n=${c.sales_count} | by=${c.opened_by}/${c.closed_by}`);
  }

  // Ventas del dia 5 (rango local Argentina: 2026-06-05 00:00 -03 = 03:00Z a 2026-06-06 03:00Z)
  const ventas = await get('/rest/v1/ventas?created_at=gte.2026-06-05T03:00:00&created_at=lt.2026-06-06T03:00:00&select=id,sale_number,total,payment_type,efectivo_amount,transferencia_amount,cash_amount,remito_number,created_at&order=created_at.asc');
  console.log(`\n=== VENTAS DIA 5 (${ventas.length}) ===`);
  let efeConRemito = 0, efeSinRemito = 0, nConR = 0, nSinR = 0;
  for (const v of ventas) {
    const efe = (v.efectivo_amount != null ? v.efectivo_amount : (v.payment_type === 'cash' ? (v.cash_amount || 0) : 0));
    const tieneR = !!v.remito_number;
    if (tieneR) { efeConRemito += efe; nConR++; } else { efeSinRemito += efe; nSinR++; }
    console.log(`${tieneR ? 'R ' : 'SR'} | ${v.sale_number} | ${v.payment_type} | efe=${efe} | total=${v.total} | ${v.remito_number || ''}`);
  }
  console.log(`\nEFECTIVO con remito (${nConR}): ${efeConRemito.toFixed(2)}`);
  console.log(`EFECTIVO sin remito (${nSinR}): ${efeSinRemito.toFixed(2)}`);
}
main().catch(e => console.error(e));
