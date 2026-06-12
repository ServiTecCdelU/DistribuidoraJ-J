// Revisa comisiones y stock_movimientos ligados a las ventas duplicadas N49/N50 de larroque.
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

const ids = ['venta_supermercadolarroque_2', 'venta_supermercadolarroque_3'];

(async () => {
  for (const tabla of ['comisiones', 'stock_movimientos', 'transacciones']) {
    for (const sid of ids) {
      const cols = tabla === 'comisiones' ? 'id,sale_id,seller_name,monto,created_at'
        : tabla === 'stock_movimientos' ? 'id,producto_id,tipo,cantidad,referencia,sale_id,created_at'
        : 'id,sale_id,type,amount,description,created_at';
      // Probar por sale_id
      const r = await fetch(`${BASE}/rest/v1/${tabla}?sale_id=eq.${sid}&select=${cols}`, { headers: H });
      const d = await r.json();
      if (Array.isArray(d) && d.length) {
        console.log(`${tabla} sale_id=${sid}: ${d.length} filas`);
        d.forEach((x) => console.log('   ', JSON.stringify(x)));
      } else if (!Array.isArray(d)) {
        console.log(`${tabla}: ${JSON.stringify(d).slice(0,120)}`);
        break;
      }
    }
  }
})();
