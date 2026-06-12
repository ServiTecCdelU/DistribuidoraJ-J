const fs = require('fs');
const path = require('path');
const env = {};
fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf-8').split('\n').forEach((l) => {
  const m = l.match(/^([^#=]+)=["']?([^"'\r]*)["']?/);
  if (m) env[m[1].trim()] = m[2].trim();
});
const BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

(async () => {
  for (const sid of ['venta_supermercadolarroque_2', 'venta_supermercadolarroque_3']) {
    const r = await fetch(`${BASE}/rest/v1/stock_movimientos?venta_id=eq.${sid}&select=id,mayorista_producto_id,tipo,cantidad,stock_anterior,stock_posterior,motivo,created_at&order=created_at.asc`, { headers: H });
    const d = await r.json();
    console.log(`\n=== ${sid}: ${Array.isArray(d)?d.length:JSON.stringify(d)} movimientos ===`);
    if (Array.isArray(d)) d.forEach((x) => console.log(`  ${x.mayorista_producto_id} | ${x.tipo} | cant=${x.cantidad} | ${x.stock_anterior}->${x.stock_posterior} | ${x.motivo}`));
  }
})();
