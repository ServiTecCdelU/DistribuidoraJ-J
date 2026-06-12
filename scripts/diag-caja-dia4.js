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

// agg igual que el reconciliador de la caja
function agg(src) {
  let efectivo = 0, transfer = 0, credito = 0, total = 0;
  for (const s of src) {
    total += s.total || 0;
    const method = s.payment_method || 'efectivo';
    if (s.payment_type === 'cash') {
      if (method === 'transferencia') transfer += s.total || 0; else efectivo += s.total || 0;
    } else if (s.payment_type === 'credit') {
      credito += s.total || 0;
    } else if (s.payment_type === 'mixed') {
      const ef = s.efectivo_amount != null ? s.efectivo_amount : (method !== 'transferencia' ? (s.cash_amount || 0) : 0);
      const tr = s.transferencia_amount != null ? s.transferencia_amount : (method === 'transferencia' ? (s.cash_amount || 0) : 0);
      efectivo += ef; transfer += tr; credito += (s.credit_amount || 0);
    }
  }
  return { efectivo: +efectivo.toFixed(2), transfer: +transfer.toFixed(2), credito: +credito.toFixed(2), total: +total.toFixed(2), count: src.length };
}

async function main() {
  const cajas = await get('/rest/v1/caja?id=in.(caja_20260604_1,caja_20260604_2)&select=*&order=opened_at.asc');
  console.log('=== CAJAS DIA 4 ===');
  for (const c of cajas) {
    console.log(`${c.id} | ${c.status} | open=${c.opened_at} close=${c.closed_at} | by=${c.opened_by}/${c.closed_by} | cash=${c.cash_total} total=${c.total_sales} n=${c.sales_count} init=${c.initial_amount}`);
  }

  // Ventas del dia 4 calendario (Argentina) CON remito
  const ventas = await get('/rest/v1/ventas?created_at=gte.2026-06-04T03:00:00&created_at=lt.2026-06-05T03:00:00&remito_number=not.is.null&select=sale_number,total,payment_type,payment_method,efectivo_amount,transferencia_amount,cash_amount,credit_amount,created_at,remito_number&order=created_at.asc');
  console.log(`\n=== VENTAS DIA 4 (calendario) CON REMITO: ${ventas.length} ===`);
  const st = agg(ventas);
  console.log('agg dia4 calendario:', JSON.stringify(st));

  // Por rango de cada caja (opened_at..closed_at) con remito
  for (const c of cajas) {
    const vs = await get(`/rest/v1/ventas?created_at=gte.${c.opened_at}&created_at=lte.${c.closed_at}&remito_number=not.is.null&select=total,payment_type,payment_method,efectivo_amount,transferencia_amount,cash_amount,credit_amount`);
    console.log(`\nRango ${c.id} (${c.opened_at} -> ${c.closed_at}): ${vs.length} ventas con remito ->`, JSON.stringify(agg(vs)));
  }
}
main().catch(e => console.error(e));
