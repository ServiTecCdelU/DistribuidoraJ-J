// Corrige el PRECIO de los items de una venta para que coincida con el remito firmado
// (parser posicional). No toca cantidades (las incidencias ya las ajustaron).
// Ajusta: ventas (items, subtotal, total, pago), transaccion de deuda (credit) y comision.
// Uso: node scripts/fix-por-remito.mjs N147-12-06-2026 [otra...]
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const g = (k) => ((env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1] || '').trim().replace(/^"|"$/g, '');
const U = g('NEXT_PUBLIC_SUPABASE_URL'), K = g('SUPABASE_SERVICE_ROLE_KEY');
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
const num = (s) => Number(s.replace(/\./g, '').replace(',', '.'));
const r2 = (x) => Math.round(x * 100) / 100;
const codeOf = (pid) => (pid || '').replace(/^prod_/, '').replace(/^mp_/, '').replace(/^0+/, '');
const get = async (p) => (await fetch(`${U}/rest/v1/${p}`, { headers: H })).json();
const patch = async (p, b) => { const r = await fetch(`${U}/rest/v1/${p}`, { method: 'PATCH', headers: H, body: JSON.stringify(b) }); return { ok: r.ok, data: await r.json() }; };

function lineasOrdenadas(items) {
  const rows = [];
  for (const it of items) {
    if (!it.str.trim()) continue;
    const x = it.transform[4], y = it.transform[5];
    let row = rows.find((r) => Math.abs(r.y - y) < 3);
    if (!row) { row = { y, cells: [] }; rows.push(row); }
    row.cells.push({ x, s: it.str });
  }
  rows.sort((a, b) => b.y - a.y);
  return rows.map((r) => r.cells.sort((a, b) => a.x - b.x).map((c) => c.s).join(' '));
}
async function remitoMap(base64) {
  const data = new Uint8Array(Buffer.from(base64, 'base64'));
  const doc = await pdfjs.getDocument({ data, disableFontFace: true, isEvalSupported: false }).promise;
  const lineas = [];
  for (let i = 1; i <= doc.numPages; i++) lineas.push(...lineasOrdenadas((await (await doc.getPage(i)).getTextContent()).items));
  await doc.destroy();
  const map = new Map();
  for (const ln of lineas) {
    const m = ln.match(/^\s*(\d{6,8})\s+(\d+)\s+(.*?)\$\s*([\d.]+,\d{2})\s+(?:(\d+)\s*%|-)/);
    if (m) { const c = m[1].replace(/^0+/, ''); if (!map.has(c)) map.set(c, num(m[4])); }
  }
  return map;
}

const deltaVend = new Map();
for (const sn of process.argv.slice(2)) {
  const [v] = await get(`ventas?sale_number=eq.${sn}&select=id,sale_number,items,subtotal,total,discount,discount_type,payment_type,payment_method,cash_amount,credit_amount,efectivo_amount,transferencia_amount,seller_id`);
  const [p] = await get(`pedidos?sale_id=eq.${v.id}&select=remito_pdf_base64`);
  const rem = await remitoMap(p.remito_pdf_base64);
  const cambios = [];
  const newItems = v.items.map((it) => {
    const pr = rem.get(codeOf(it.productId));
    if (pr != null && Math.abs(Number(it.price) - pr) > 0.01) { cambios.push(`${it.name.slice(0,28)} $${it.price}->$${pr}`); return { ...it, price: pr }; }
    return it;
  });
  if (!cambios.length) { console.log(`${sn}: sin cambios de precio`); continue; }
  const subtotalNew = newItems.reduce((a, it) => a + Number(it.price) * it.quantity * (1 - (it.itemDiscount || 0) / 100), 0);
  const disc = Number(v.discount) || 0;
  let totalNew = subtotalNew;
  if (disc > 0) totalNew = Math.max(0, subtotalNew - (v.discount_type === 'percent' ? subtotalNew * disc / 100 : disc));
  const realDelta = r2(Number(v.total) - totalNew);
  const upd = { items: newItems, subtotal: r2(subtotalNew), total: r2(totalNew) };
  if (v.payment_type === 'credit') upd.credit_amount = v.credit_amount != null ? r2(Number(v.credit_amount) - realDelta) : v.credit_amount;
  else if (v.payment_method === 'transferencia') { if (v.transferencia_amount != null) upd.transferencia_amount = r2(Number(v.transferencia_amount) - realDelta); if (v.cash_amount != null) upd.cash_amount = r2(Number(v.cash_amount) - realDelta); }
  else { if (v.efectivo_amount != null) upd.efectivo_amount = r2(Number(v.efectivo_amount) - realDelta); if (v.cash_amount != null) upd.cash_amount = r2(Number(v.cash_amount) - realDelta); }
  const rv = await patch(`ventas?id=eq.${v.id}`, upd);
  let deudaMsg = '';
  if (v.payment_type === 'credit') {
    const tx = await get(`transacciones?sale_id=eq.${v.id}&type=eq.debt&select=id,amount,saldo`);
    if (tx[0]) { await patch(`transacciones?id=eq.${tx[0].id}`, { amount: r2(Number(tx[0].amount) - realDelta), saldo: r2(Math.max(0, Number(tx[0].saldo) - realDelta)) }); deudaMsg = ` deuda-${realDelta}`; }
  }
  deltaVend.set(v.seller_id, r2((deltaVend.get(v.seller_id) || 0) + realDelta));
  console.log(`${sn}: total ${Number(v.total).toFixed(2)}->${r2(totalNew).toFixed(2)} (-${realDelta}) ${v.payment_type}${deudaMsg} ok=${rv.ok}`);
  cambios.forEach((c) => console.log('     ' + c));
}
console.log('\n--- COMISIONES ---');
for (const [sid, delta] of deltaVend) {
  const [s] = await get(`vendedores?id=eq.${sid}&select=name,total_sales,total_commission,commission_rate`);
  const dc = r2(delta * (Number(s.commission_rate) || 0) / 100);
  const r = await patch(`vendedores?id=eq.${sid}`, { total_sales: r2(Number(s.total_sales) - delta), total_commission: r2(Number(s.total_commission) - dc) });
  console.log(`${s.name}: ventas -${delta} comision -${dc} ok=${r.ok}`);
}
console.log('\nLISTO. No se tocaron pedidos ni remitos.');
