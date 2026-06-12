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
  for (const vid of ['venta_joannasmariadelosangeles_1', 'venta_joannasmariadelosangeles_2']) {
    const r = await fetch(`${URL}/rest/v1/stock_movimientos?venta_id=eq.${vid}&select=id,mayorista_producto_id,tipo,cantidad,stock_anterior,stock_posterior,motivo,created_at&order=created_at.asc`, { headers: H });
    const rows = await r.json();
    console.log(`\n===== STOCK MOV de ${vid} (${rows.length} filas) =====`);
    for (const m of rows) {
      console.log(`  ${m.tipo} ${m.cantidad} | ${m.mayorista_producto_id} | ${m.stock_anterior}->${m.stock_posterior} | ${m.motivo}`);
    }
  }
}
main().catch(e => console.error(e));
