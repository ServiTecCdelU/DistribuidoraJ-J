// Corrige las 13 ventas con precio pisado: deja el precio del remito firmado.
// SOLO toca: ventas (items, subtotal, total, monto de pago), transacciones (deuda
// de cuenta corriente) y vendedores (comision acumulada). NO toca pedidos ni remito_pdf.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const g = (k) => ((env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1] || '').trim().replace(/^"|"$/g, '');
const U = g('NEXT_PUBLIC_SUPABASE_URL'), K = g('SUPABASE_SERVICE_ROLE_KEY');
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };
const r2 = (x) => Math.round(x * 100) / 100;
const codeOf = (pid) => (pid || '').replace(/^prod_/, '').replace(/^mp_/, '');
const get = async (p) => (await fetch(`${U}/rest/v1/${p}`, { headers: H })).json();
const patch = async (p, b) => { const r = await fetch(`${U}/rest/v1/${p}`, { method: 'PATCH', headers: H, body: JSON.stringify(b) }); return { ok: r.ok, data: await r.json() }; };

const bugs = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'outputs', 'precio-pisado.json'), 'utf8'));
const ids = '(' + bugs.map((b) => `"${b.sale_id}"`).join(',') + ')';
const ventas = await get(`ventas?id=in.${ids}&select=id,sale_number,items,subtotal,total,discount,discount_type,payment_type,payment_method,cash_amount,credit_amount,efectivo_amount,transferencia_amount,seller_id`);
const vById = new Map(ventas.map((v) => [v.id, v]));

const deltaPorVendedor = new Map();

for (const b of bugs) {
  const v = vById.get(b.sale_id);
  const priceByCode = new Map(b.items.map((d) => [d.cod, d.precioRemito]));
  // corregir precios de items
  const newItems = v.items.map((it) => {
    const c = codeOf(it.productId);
    const np = priceByCode.get(c) ?? priceByCode.get(c.replace(/^0+/, ''));
    return np != null ? { ...it, price: np } : it;
  });
  // recalcular subtotal (neto por linea) y total (con descuento global si hubiera)
  const subtotalNew = newItems.reduce((a, it) => a + Number(it.price) * it.quantity * (1 - (it.itemDiscount || 0) / 100), 0);
  const disc = Number(v.discount) || 0;
  let totalNew = subtotalNew;
  if (disc > 0) totalNew = Math.max(0, subtotalNew - (v.discount_type === 'percent' ? subtotalNew * disc / 100 : disc));
  const realDelta = r2(Number(v.total) - totalNew); // sobrecobrado a revertir

  const upd = { items: newItems, subtotal: r2(subtotalNew), total: r2(totalNew) };
  // ajustar monto de pago
  if (v.payment_type === 'credit') {
    upd.credit_amount = v.credit_amount != null ? r2(Number(v.credit_amount) - realDelta) : v.credit_amount;
  } else if (v.payment_method === 'transferencia') {
    if (v.transferencia_amount != null) upd.transferencia_amount = r2(Number(v.transferencia_amount) - realDelta);
    if (v.cash_amount != null) upd.cash_amount = r2(Number(v.cash_amount) - realDelta);
  } else {
    if (v.efectivo_amount != null) upd.efectivo_amount = r2(Number(v.efectivo_amount) - realDelta);
    if (v.cash_amount != null) upd.cash_amount = r2(Number(v.cash_amount) - realDelta);
  }
  const rv = await patch(`ventas?id=eq.${v.id}`, upd);

  // ajustar deuda de cuenta corriente (transaccion type=debt ligada a la venta)
  let deudaMsg = '';
  if (v.payment_type === 'credit') {
    const tx = await get(`transacciones?sale_id=eq.${v.id}&type=eq.debt&select=id,amount,saldo`);
    if (tx[0]) {
      const nuevoAmount = r2(Number(tx[0].amount) - realDelta);
      const nuevoSaldo = r2(Math.max(0, Number(tx[0].saldo) - realDelta));
      await patch(`transacciones?id=eq.${tx[0].id}`, { amount: nuevoAmount, saldo: nuevoSaldo });
      deudaMsg = ` | deuda ${tx[0].amount}->${nuevoAmount}`;
    }
  }

  deltaPorVendedor.set(v.seller_id, r2((deltaPorVendedor.get(v.seller_id) || 0) + realDelta));
  console.log(`${v.sale_number.padEnd(17)} total ${Number(v.total).toFixed(2)} -> ${r2(totalNew).toFixed(2)}  (-${realDelta})  pay=${v.payment_type}${deudaMsg}  ok=${rv.ok}`);
}

// ajustar acumulados de los vendedores
console.log('\n--- COMISIONES ---');
for (const [sellerId, delta] of deltaPorVendedor) {
  const [s] = await get(`vendedores?id=eq.${sellerId}&select=name,total_sales,total_commission,commission_rate`);
  const rate = Number(s.commission_rate) || 0;
  const deltaCom = r2(delta * rate / 100);
  const r = await patch(`vendedores?id=eq.${sellerId}`, {
    total_sales: r2(Number(s.total_sales) - delta),
    total_commission: r2(Number(s.total_commission) - deltaCom),
  });
  console.log(`${s.name.padEnd(14)} ventas -${delta}  comision(${rate}%) -${deltaCom}  | sales->${r.data?.[0]?.total_sales}  com->${r.data?.[0]?.total_commission}  ok=${r.ok}`);
}
console.log('\nLISTO. No se tocaron pedidos ni remitos.');
