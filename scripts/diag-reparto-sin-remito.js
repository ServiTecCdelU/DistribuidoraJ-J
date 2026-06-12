const fs = require('fs');
const path = require('path');
const env = {};
fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf-8').split('\n').forEach((line) => {
  const m = line.match(/^([^#=]+)=["']?([^"'\r]*)["']?/);
  if (m) env[m[1].trim()] = m[2].trim();
});
const BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const orderTotal = (o) => {
  const t = (o.items || []).reduce((a, it) => {
    const base = (it.quantity || 0) * (it.price || 0);
    return a + base - (it.itemDiscount ? base * it.itemDiscount / 100 : 0);
  }, 0);
  if (o.discount > 0) return Math.max(0, t - (o.discount_type === 'percent' ? t * o.discount / 100 : o.discount));
  return t;
};
const money = (n) => '$' + Math.round(n).toLocaleString('es-AR');

(async () => {
  const r = await fetch(`${BASE}/rest/v1/pedidos?select=id,client_name,status,remito_number,items,discount,discount_type,held&status=eq.delivery&order=client_name`, { headers: H });
  const p = await r.json();
  const groups = {};
  p.forEach((o) => { const c = o.client_name || 'Sin cliente'; (groups[c] = groups[c] || []).push(o); });
  console.log('=== LISTADO DE CARGA (lo que va a imprimir) ===\n');
  let total = 0, dobles = 0;
  Object.keys(groups).sort().forEach((c) => {
    const con = groups[c].filter((o) => o.remito_number && !o.held);
    if (!con.length) return;
    if (con.length > 1) dobles++;
    const importe = con.reduce((a, o) => a + orderTotal(o), 0);
    total += importe;
    const flag = con.length > 1 ? '  <-- 2 REMITOS' : '';
    console.log(`${c.padEnd(28)} ${con.map((o) => o.remito_number).join(', ').padEnd(26)} ${money(importe)}${flag}`);
  });
  console.log(`\nTOTAL: ${money(total)}`);
  console.log(dobles ? `\n!! ${dobles} cliente(s) con 2 remitos` : '\nOK: cada cliente con 1 remito');
})();
