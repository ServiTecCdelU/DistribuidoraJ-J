// Chequeos de integridad de cuentas corrientes, ventas y pedidos (solo lectura).
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
  const cls = await all("clientes", "id,name,current_balance,current_balance_mayorista");
  const txs = await all("transacciones", "id,client_id,type,amount,cuenta,anulado,afecta_saldo,saldo,sale_id,recibo_numero,created_at,description");
  const ventas = await all("ventas", "id,sale_number,client_id,client_name,order_id,total,payment_type,credit_amount,created_at");
  const pedidos = await all("pedidos", "id,status,sale_id,client_name");
  const cname = new Map(cls.map((c) => [c.id, c.name]));

  console.log("== 1. Saldo guardado vs movimientos (minorista y mayorista) ==");
  const led = { minorista: new Map(), mayorista: new Map() };
  const boletas = { minorista: new Map(), mayorista: new Map() };
  for (const t of txs) {
    if (!t.client_id || t.anulado || t.afecta_saldo === false) continue;
    const cu = t.cuenta === "mayorista" ? "mayorista" : "minorista";
    led[cu].set(t.client_id, (led[cu].get(t.client_id) || 0) + (t.type === "debt" ? 1 : -1) * Number(t.amount));
    if (t.type === "debt" && t.saldo != null) boletas[cu].set(t.client_id, (boletas[cu].get(t.client_id) || 0) + Number(t.saldo));
  }
  for (const c of cls) for (const [cu, col] of [["minorista", "current_balance"], ["mayorista", "current_balance_mayorista"]]) {
    const bal = Number(c[col] || 0), l = led[cu].get(c.id) || 0;
    if (Math.abs(bal - l) >= 1) console.log(`  ${cu} ${c.name}: guardado ${f(bal)} | movimientos ${f(l)} | dif ${f(bal - l)}`);
  }

  console.log("\n== 2. Saldo de movimientos vs suma de boletas pendientes ==");
  for (const c of cls) for (const cu of ["minorista", "mayorista"]) {
    const l = led[cu].get(c.id) || 0, b = boletas[cu].get(c.id) || 0;
    if (l > 1 && Math.abs(l - b) >= 1) console.log(`  ${cu} ${c.name}: movimientos ${f(l)} | boletas pendientes ${f(b)} | dif ${f(l - b)}`);
  }

  console.log("\n== 3. Recibos salteados (posibles pagos perdidos) ==");
  const nums = txs.map((t) => t.recibo_numero).filter((r) => /^RC-\d{4}-\d+$/.test(r || ""));
  const byYear = {};
  for (const r of nums) { const [, y, n] = r.split("-"); (byYear[y] ??= new Set()).add(Number(n)); }
  for (const [y, s] of Object.entries(byYear)) {
    const arr = [...s].sort((a, b) => a - b), gaps = [];
    for (let i = arr[0]; i <= arr[arr.length - 1]; i++) if (!s.has(i)) gaps.push(i);
    console.log(`  ${y}: ${arr.length} recibos, faltan: ${gaps.length ? gaps.map((g) => `RC-${y}-${String(g).padStart(5, "0")}`).join(", ") : "ninguno"}`);
  }

  console.log("\n== 4. Ventas con cuenta corriente sin deuda registrada / deuda distinta ==");
  const debtBySale = new Map();
  for (const t of txs) if (t.type === "debt" && t.sale_id) debtBySale.set(t.sale_id, (debtBySale.get(t.sale_id) || 0) + Number(t.amount));
  for (const v of ventas) {
    const cred = v.payment_type === "credit" ? Number(v.total) : v.payment_type === "mixed" ? Number(v.credit_amount || 0) : 0;
    const d = debtBySale.get(v.id) || 0;
    if (cred > 0 && Math.abs(cred - d) >= 1) console.log(`  ${v.sale_number} ${v.client_name}: a cta cte ${f(cred)} | deuda registrada ${f(d)}`);
  }

  console.log("\n== 5. Deudas que apuntan a ventas inexistentes ==");
  const ventaIds = new Set(ventas.map((v) => v.id));
  for (const t of txs) if (t.type === "debt" && t.sale_id && !ventaIds.has(t.sale_id)) console.log(`  ${t.id} ${cname.get(t.client_id)} ${f(t.amount)} -> ${t.sale_id}`);

  console.log("\n== 6. Pedidos: más de una venta / completados sin venta / venta inexistente ==");
  const porPedido = new Map();
  for (const v of ventas) if (v.order_id) porPedido.set(v.order_id, (porPedido.get(v.order_id) || 0) + 1);
  for (const [o, n] of porPedido) if (n > 1) console.log(`  ${o}: ${n} ventas`);
  for (const p of pedidos) {
    if (p.status === "completed" && !p.sale_id) console.log(`  completado sin venta: ${p.id} ${p.client_name}`);
    if (p.sale_id && !ventaIds.has(p.sale_id)) console.log(`  venta inexistente: ${p.id} -> ${p.sale_id}`);
  }
  const pedidoIds = new Set(pedidos.map((p) => p.id));
  for (const v of ventas) if (v.order_id && !pedidoIds.has(v.order_id)) console.log(`  venta ${v.sale_number} apunta a pedido inexistente ${v.order_id}`);

  console.log("\n== 7. Movimientos de cliente con cliente inexistente ==");
  for (const t of txs) if (t.client_id && !cname.has(t.client_id)) console.log(`  ${t.id} ${t.type} ${f(t.amount)} cliente ${t.client_id}`);
})();
