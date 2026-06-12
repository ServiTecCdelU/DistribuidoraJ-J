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
  for (const tabla of ['comisiones', 'stock_movimientos']) {
    const r = await fetch(`${BASE}/rest/v1/${tabla}?select=*&limit=1`, { headers: H });
    const d = await r.json();
    console.log(`\n=== ${tabla} columnas ===`);
    console.log(Array.isArray(d) && d[0] ? Object.keys(d[0]).join(', ') : JSON.stringify(d));
  }
  // comisiones por sale (probar nombres comunes)
  for (const col of ['sale_id', 'venta_id']) {
    for (const sid of ['venta_supermercadolarroque_2', 'venta_supermercadolarroque_3']) {
      const r = await fetch(`${BASE}/rest/v1/comisiones?${col}=eq.${sid}&select=*`, { headers: H });
      const d = await r.json();
      if (Array.isArray(d)) { console.log(`comisiones ${col}=${sid}: ${d.length}`); d.forEach(x=>console.log('  ',JSON.stringify(x))); }
    }
  }
  // stock_movimientos por referencia larroque o N49/N50
  const r2 = await fetch(`${BASE}/rest/v1/stock_movimientos?or=(referencia.ilike.*larroque*,referencia.ilike.*N49*,referencia.ilike.*N50*)&select=*&order=created_at.desc&limit=40`, { headers: H });
  const d2 = await r2.json();
  console.log(`\nstock_movimientos larroque/N49/N50: ${Array.isArray(d2)?d2.length:JSON.stringify(d2)}`);
  if (Array.isArray(d2)) d2.forEach(x=>console.log('  ',JSON.stringify(x)));
})();
