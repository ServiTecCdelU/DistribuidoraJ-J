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
  const r = await fetch(`${URL}/rest/v1/stock_movimientos?motivo=ilike.*joannas*&select=id,mayorista_producto_id,cantidad,stock_anterior,stock_posterior,motivo,created_at&order=created_at.asc`, { headers: H });
  const rows = await r.json();
  console.log(`=== TODOS LOS MOV con motivo joannas (${rows.length}) ===`);
  const byMotivo = {};
  for (const m of rows) {
    console.log(`  ${m.created_at} | ${m.motivo} | ${m.mayorista_producto_id} | ${m.cantidad} | ${m.stock_anterior}->${m.stock_posterior}`);
    byMotivo[m.motivo] = (byMotivo[m.motivo] || 0) + 1;
  }
  console.log('\n=== RESUMEN por motivo ===');
  console.log(byMotivo);
}
main().catch(e => console.error(e));
