// Chequeos de integridad de ventas (solo lectura).
require("dotenv").config({ path: ".env", quiet: true });
const { createClient } = require("@supabase/supabase-js");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function all(table, sel) {
  let out = [], from = 0;
  for (;;) { const { data, error } = await sb.from(table).select(sel).order("id").range(from, from + 999); if (error) throw new Error(table + ": " + error.message); out = out.concat(data); if (data.length < 1000) break; from += 1000; }
  return out;
}
const f = (n) => Number(n).toFixed(2);
(async () => {
  const ventas = await all("ventas", "id,sale_number,client_id,client_name,seller_id,order_id,source,items,subtotal,total,discount,discount_type,payment_type,cash_amount,credit_amount,efectivo_amount,transferencia_amount,remito_number,status,created_at");
  const clientes = new Set((await all("clientes", "id")).map((c) => c.id));
  const vendedores = await all("vendedores", "id,name,total_sales");
  const pedidos = new Map((await all("pedidos", "id,status,sale_id")).map((p) => [p.id, p]));
  console.log("Ventas:", ventas.length);

  console.log("\n== 1. Números de venta repetidos ==");
  const porNum = new Map();
  for (const v of ventas) { const k = (v.sale_number || "").split("-")[0]; if (!porNum.has(k)) porNum.set(k, []); porNum.get(k).push(v); }
  for (const [k, vs] of porNum) if (vs.length > 1) console.log(`  ${k}: ${vs.map((v) => `${v.sale_number} ${v.client_name}`).join(" | ")}`);
  const maxN = Math.max(...[...porNum.keys()].map((k) => Number(k.slice(1)) || 0));
  console.log(`  N más alto: N${maxN} | cantidad de ventas: ${ventas.length} -> la próxima saldría N${ventas.length + 1}${ventas.length + 1 <= maxN ? " (YA EXISTE: se repetirían números)" : ""}`);

  console.log("\n== 2. Total distinto a la suma de los productos ==");
  for (const v of ventas) {
    const sub = (v.items || []).reduce((a, i) => { const b = (Number(i.price) || 0) * (Number(i.quantity) || 0); return a + b - (i.itemDiscount ? (b * i.itemDiscount) / 100 : 0); }, 0);
    const d = Number(v.discount) || 0;
    const tot = Math.max(0, sub - (d > 0 ? (v.discount_type === "percent" ? (sub * d) / 100 : d) : 0));
    if (Math.abs(tot - Number(v.total)) >= 1) console.log(`  ${v.sale_number} ${v.client_name}: total ${f(v.total)} | productos ${f(tot)} | dif ${f(Number(v.total) - tot)}`);
  }

  console.log("\n== 3. Pago mixto que no suma el total / a cta cte sin cliente / cliente inexistente ==");
  for (const v of ventas) {
    if (v.payment_type === "mixed" && Math.abs((Number(v.cash_amount) || 0) + (Number(v.credit_amount) || 0) - Number(v.total)) >= 1)
      console.log(`  mixto ${v.sale_number} ${v.client_name}: contado ${f(v.cash_amount || 0)} + cta cte ${f(v.credit_amount || 0)} != total ${f(v.total)}`);
    if ((v.payment_type === "credit" || v.payment_type === "mixed") && !v.client_id) console.log(`  a cta cte sin cliente: ${v.sale_number}`);
    if (v.client_id && !clientes.has(v.client_id)) console.log(`  cliente inexistente: ${v.sale_number} ${v.client_name} -> ${v.client_id}`);
    const ef = Number(v.efectivo_amount) || 0, tr = Number(v.transferencia_amount) || 0;
    if ((ef || tr) && v.payment_type === "cash" && Math.abs(ef + tr - Number(v.total)) >= 1) console.log(`  efectivo+transferencia != total: ${v.sale_number} ${v.client_name}: ${f(ef)} + ${f(tr)} vs ${f(v.total)}`);
  }

  console.log("\n== 4. Ventas de pedido: sin remito / pedido no completado / pedido apunta a otra venta ==");
  for (const v of ventas) {
    if (!v.order_id) continue;
    const p = pedidos.get(v.order_id);
    if (!p) { console.log(`  ${v.sale_number}: pedido inexistente ${v.order_id}`); continue; }
    if (!v.remito_number) console.log(`  sin remito: ${v.sale_number} ${v.client_name}`);
    if (p.status !== "completed") console.log(`  pedido en estado ${p.status}: ${v.sale_number} ${v.client_name}`);
    if (p.sale_id !== v.id) console.log(`  el pedido apunta a ${p.sale_id}: ${v.sale_number} ${v.client_name}`);
  }

  console.log("\n== 5. Ventas con total 0 o negativo ==");
  for (const v of ventas) if (!(Number(v.total) > 0)) console.log(`  ${v.sale_number} ${v.client_name}: ${f(v.total)}`);

  console.log("\n== 6. Total de ventas por vendedor (guardado vs real) ==");
  const real = new Map();
  for (const v of ventas) if (v.seller_id) real.set(v.seller_id, (real.get(v.seller_id) || 0) + Number(v.total));
  for (const s of vendedores) { const r = real.get(s.id) || 0; if (Math.abs(r - Number(s.total_sales || 0)) >= 1) console.log(`  ${s.name}: guardado ${f(s.total_sales || 0)} | real ${f(r)} | dif ${f(Number(s.total_sales || 0) - r)}`); }
})();
