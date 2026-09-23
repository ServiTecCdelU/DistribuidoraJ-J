// Auditoría completa de los pedidos de KIOSCO MARCELA:
// el que quedó en reparto y el último que pasó a ventas.
// Uso: node scripts/diag-marcela-auditoria.js
require("dotenv").config({ path: ".env.local" });
require("dotenv").config({ path: ".env" });
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const f = (d) => (d ? new Date(d).toLocaleString("es-AR") : "—");

(async () => {
  const { data: clientes } = await supabase
    .from("clientes")
    .select("id, name, current_balance, cuenta_corriente_habilitada, seller_id, codigo_vendedor")
    .ilike("name", "%MARCELA%");
  console.log("=== CLIENTES ===");
  (clientes || []).forEach((c) =>
    console.log(`  ${c.id} | "${c.name}" | saldo ${c.current_balance} | cc:${c.cuenta_corriente_habilitada} | vend:${c.codigo_vendedor ?? c.seller_id ?? "—"}`)
  );

  const ids = (clientes || []).map((c) => c.id);
  const { data: pedidos } = await supabase
    .from("pedidos")
    .select("id, client_id, client_name, status, remito_number, sale_id, seller_name, transportista_name, created_at, updated_at, notes, stock_descontado, items, anulado_at, anulado_motivo, held")
    .or([`client_id.in.(${ids.join(",")})`, "client_name.ilike.%MARCELA%"].join(","))
    .order("created_at", { ascending: false });

  console.log("\n=== PEDIDOS ===");
  for (const p of pedidos || []) {
    const items = Array.isArray(p.items) ? p.items : [];
    console.log(
      `\n  ${p.id}\n   cliente: ${p.client_id} "${p.client_name}"\n   estado: ${p.status} | remito: ${p.remito_number ?? "—"} | venta: ${p.sale_id ?? "—"}\n   vendedor: ${p.seller_name ?? "—"} | transportista: ${p.transportista_name ?? "—"}\n   creado: ${f(p.created_at)} | modificado: ${f(p.updated_at)}\n   stockDescontado: ${p.stock_descontado} | held: ${p.held} | anulado: ${p.anulado_at ? f(p.anulado_at) + " " + (p.anulado_motivo ?? "") : "no"}\n   notas: ${p.notes ?? "—"}\n   items (${items.length}): ${items.map((i) => `${i.name} x${i.quantity}`).join(", ")}`
    );
  }

  const pedidoIds = (pedidos || []).map((p) => p.id);
  const saleIds = (pedidos || []).map((p) => p.sale_id).filter(Boolean);

  if (saleIds.length) {
    const { data: ventas } = await supabase
      .from("ventas")
      .select("id, sale_number, client_name, total, payment_type, created_at, remito_number, invoice_number, items_no_entregados, anulada, order_id")
      .in("id", saleIds);
    console.log("\n=== VENTAS ===");
    (ventas || []).forEach((v) =>
      console.log(
        `  ${v.id} | ${v.sale_number} | ${f(v.created_at)} | total ${v.total} | pago ${v.payment_type} | remito ${v.remito_number ?? "—"} | anulada:${v.anulada ?? false}\n     no entregados: ${JSON.stringify(v.items_no_entregados ?? [])}`
      )
    );
  }

  // Ventas del cliente sin pasar por pedido
  const { data: ventasCliente } = await supabase
    .from("ventas")
    .select("id, sale_number, client_name, total, created_at, order_id, remito_number")
    .ilike("client_name", "%MARCELA%")
    .order("created_at", { ascending: false })
    .limit(20);
  console.log("\n=== TODAS LAS VENTAS DEL CLIENTE ===");
  (ventasCliente || []).forEach((v) =>
    console.log(`  ${v.sale_number} | ${f(v.created_at)} | $${v.total} | pedido:${v.order_id ?? "—"} | remito:${v.remito_number ?? "—"}`)
  );

  // Auditoría de esos pedidos + de las ventas
  const entityIds = [...pedidoIds, ...saleIds];
  const { data: audit } = await supabase
    .from("auditoria")
    .select("*")
    .in("entity_id", entityIds)
    .order("created_at", { ascending: true });
  console.log("\n=== AUDITORIA POR PEDIDO/VENTA ===");
  (audit || []).forEach((a) =>
    console.log(`  ${f(a.created_at)} | ${a.action} | ${a.entity_id} | ${a.details?.description ?? ""} | por ${a.user_email}\n      details: ${JSON.stringify(a.details).slice(0, 600)}`)
  );

  // Auditoría por texto (por si quedó sin entity_id)
  const { data: auditTexto } = await supabase
    .from("auditoria")
    .select("*")
    .ilike("details->>description", "%MARCELA%")
    .order("created_at", { ascending: true });
  console.log("\n=== AUDITORIA POR TEXTO 'MARCELA' ===");
  (auditTexto || []).forEach((a) =>
    console.log(`  ${f(a.created_at)} | ${a.action} | ${a.entity_id ?? "—"} | ${a.details?.description ?? ""} | por ${a.user_email}`)
  );

  // Hojas de ruta que contienen esos pedidos
  const { data: hojas } = await supabase
    .from("hojas_ruta")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(300);
  console.log("\n=== HOJAS DE RUTA QUE INCLUYEN ESOS PEDIDOS ===");
  (hojas || []).forEach((h) => {
    const incluidos = (h.pedido_ids || []).filter((id) => pedidoIds.includes(id));
    if (incluidos.length === 0) return;
    console.log(
      `  HR ${h.numero} | reparto ${h.fecha_reparto} | creada ${f(h.created_at)} | pedidos ${h.cantidad_pedidos} | incluye: ${incluidos.join(", ")}`
    );
  });

  // Transacciones (roturas/faltantes/cobranzas) del cliente
  const { data: tx } = await supabase
    .from("transacciones")
    .select("*")
    .in("client_id", ids)
    .order("created_at", { ascending: false })
    .limit(50);
  console.log("\n=== TRANSACCIONES DEL CLIENTE ===");
  (tx || []).forEach((t) =>
    console.log(`  ${f(t.created_at)} | ${t.type ?? t.tipo} | $${t.amount ?? t.monto} | ${t.description ?? t.descripcion ?? ""} | venta:${t.sale_id ?? t.venta_id ?? "—"}`)
  );
})();
