// Muestra, para cada item de la venta duplicada N49, el stock actual en productos y
// mayorista_productos, para decidir la restauracion del doble descuento.
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

const norm = (pid) => (pid && pid.startsWith('mp_') ? `prod_${pid}` : pid);

(async () => {
  const r = await fetch(`${BASE}/rest/v1/ventas?id=eq.venta_supermercadolarroque_2&select=items`, { headers: H });
  const items = (await r.json())[0].items || [];

  // columnas de mayorista_productos
  const mp = await fetch(`${BASE}/rest/v1/mayorista_productos?select=*&limit=1`, { headers: H });
  console.log('mayorista_productos cols:', Object.keys((await mp.json())[0] || {}).join(', '), '\n');

  for (const it of items) {
    const prodId = norm(it.productId);
    const pr = await fetch(`${BASE}/rest/v1/productos?id=eq.${encodeURIComponent(prodId)}&select=id,stock`, { headers: H });
    const p = (await pr.json())[0];
    const mr = await fetch(`${BASE}/rest/v1/mayorista_productos?producto_id=eq.${encodeURIComponent(prodId)}&select=id,stock_local`, { headers: H });
    const mrow = (await mr.json())[0];
    console.log(`${it.quantity}x ${it.name}`);
    console.log(`   productos[${prodId}].stock = ${p ? p.stock : 'NO EXISTE'} | mayorista.stock_local = ${mrow ? mrow.stock_local : '—'}`);
  }
})();
