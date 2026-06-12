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
  for (const id of ['venta_supermercadolarroque_2', 'venta_supermercadolarroque_3']) {
    const r = await fetch(`${BASE}/rest/v1/ventas?id=eq.${id}&select=*`, { headers: H });
    const v = (await r.json())[0];
    console.log(`=== ${id} ===`);
    console.log(JSON.stringify({ sale_number: v.sale_number, total: v.total, payment_type: v.payment_type, efectivo: v.efectivo, transferencia: v.transferencia, cuenta_corriente: v.cuenta_corriente, remito_number: v.remito_number, seller_name: v.seller_name, commission_amount: v.commission_amount, order_id: v.order_id, created_at: v.created_at }, null, 1));
    console.log('items:', (v.items || []).map((i) => `${i.quantity}x ${i.name}`).join(' | '));
    console.log('');
  }
})();
