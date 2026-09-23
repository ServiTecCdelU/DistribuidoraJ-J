// Complemento del diagnóstico de KIOSCO MARCELA: clientes, ventas por id, HR 112/114 y transacciones.
require("dotenv").config({ path: ".env.local" });
require("dotenv").config({ path: ".env" });
const { createClient } = require("@supabase/supabase-js");
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const f = (d) => (d ? new Date(d).toLocaleString("es-AR") : "—");

(async () => {
  const { data: c1 } = await supabase.from("clientes").select("*").limit(1);
  console.log("COLUMNAS clientes:", c1 && c1[0] ? Object.keys(c1[0]).join(", ") : "—");

  const { data: cls } = await supabase
    .from("clientes")
    .select("*")
    .in("id", ["cliente_kioscomarcela_1", "cliente_kioscomarcela_2"]);
  console.log("\n=== CLIENTES ===");
  (cls || []).forEach((c) => console.log("  ", JSON.stringify(c).slice(0, 700)));

  const { data: v } = await supabase
    .from("ventas")
    .select("id, sale_number, order_id, remito_number, total, created_at, items_no_entregados, payment_type, anulada")
    .in("order_id", ["pedido_kioscomarcela_8", "pedido_kioscomarcela_9"]);
  console.log("\n=== VENTAS DE LOS PEDIDOS 8 y 9 ===");
  (v || []).forEach((x) => console.log("  ", JSON.stringify(x).slice(0, 600)));

  const { data: hr } = await supabase.from("hojas_ruta").select("*").in("numero", ["112", "114", 112, 114]);
  console.log("\n=== HOJAS DE RUTA 112 / 114 ===");
  (hr || []).forEach((h) => console.log("  ", JSON.stringify(h).slice(0, 1500)));

  const { data: cfg } = await supabase.from("configuracion").select("*").ilike("key", "%hoja%");
  console.log("\n=== CONFIG HOJA DE RUTA ===");
  (cfg || []).forEach((x) => console.log("  ", JSON.stringify(x).slice(0, 800)));

  const { data: t1 } = await supabase.from("transacciones").select("*").limit(1);
  console.log("\nCOLUMNAS transacciones:", t1 && t1[0] ? Object.keys(t1[0]).join(", ") : "—");
  const { data: tx } = await supabase
    .from("transacciones")
    .select("*")
    .or("client_id.eq.cliente_kioscomarcela_1,client_id.eq.cliente_kioscomarcela_2")
    .order("created_at", { ascending: false })
    .limit(30);
  console.log("=== TRANSACCIONES ===");
  (tx || []).forEach((x) => console.log("  ", JSON.stringify(x).slice(0, 400)));

  // Auditoría completa del 14/09 (día del pedido colgado) para ver qué más se tocó
  const { data: dia } = await supabase
    .from("auditoria")
    .select("*")
    .gte("created_at", "2026-09-14T00:00:00")
    .lte("created_at", "2026-09-14T23:59:59")
    .order("created_at", { ascending: true });
  console.log("\n=== AUDITORIA DEL 14/09 (todo el día) ===", (dia || []).length, "movimientos");
  (dia || []).forEach((a) =>
    console.log(`  ${f(a.created_at)} | ${a.action} | ${a.entity_id ?? "—"} | ${(a.details?.description ?? "").slice(0, 160)}`)
  );
})();
