require("dotenv").config({ path: ".env", quiet: true });
const { createClient } = require("@supabase/supabase-js");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function all(table, sel) {
  let out = [], from = 0;
  for (;;) { const { data, error } = await sb.from(table).select(sel).range(from, from + 999); if (error) throw error; out = out.concat(data); if (data.length < 1000) break; from += 1000; }
  return out;
}
(async () => {
  const ventas = await all("ventas", "id,sale_number,client_name,order_id,total,payment_type,credit_amount,remito_number,created_at");
  const txs = await all("transacciones", "sale_id,type");
  const pedidos = await all("pedidos", "id,sale_id,status");
  const txBySale = new Set(txs.filter(t => t.sale_id && t.type === "debt").map(t => t.sale_id));
  const pedSale = new Map(pedidos.map(p => [p.id, p.sale_id]));
  const byOrder = new Map();
  for (const v of ventas) if (v.order_id) { if (!byOrder.has(v.order_id)) byOrder.set(v.order_id, []); byOrder.get(v.order_id).push(v); }
  console.log("== Pedidos con más de una venta ==");
  for (const [o, vs] of byOrder) if (vs.length > 1) {
    console.log(o, "| venta vinculada al pedido:", pedSale.get(o));
    vs.sort((a,b)=>a.created_at.localeCompare(b.created_at)).forEach(v => console.log("   ", v.created_at.slice(0,16), v.sale_number, v.client_name, v.total, v.payment_type, "remito:", v.remito_number, "txDeuda:", txBySale.has(v.id), v.id));
  }
  console.log("\n== Ventas a crédito sin movimiento de deuda ==");
  for (const v of ventas) {
    const cred = v.payment_type === "credit" ? Number(v.total) : v.payment_type === "mixed" ? Number(v.credit_amount || 0) : 0;
    if (cred > 0 && !txBySale.has(v.id)) console.log("   ", v.created_at.slice(0,16), v.sale_number, v.client_name, cred, "pedido:", v.order_id, "vinculada:", v.order_id ? pedSale.get(v.order_id) === v.id : "-", v.id);
  }
})();
