// app/pedidos/cargo-print.ts
// Construcción del HTML del "Listado de Carga" para impresión.
// Función pura: recibe los datos por parámetro (sin estado de React) para poder
// testearla y para aligerar la página de pedidos.

import type { Order, Client } from '@/lib/types'

export interface CargoGroup {
  client: string
  orders: Order[]
}

export interface BuildCargoListHtmlParams {
  groups: CargoGroup[]
  clients: Client[]
  heldOrderIds: Set<string>
  selectedOrderIds: Set<string>
  /** Total de un pedido (se inyecta para no acoplar con la página). */
  calcTotal: (order: Order) => number
  now?: Date
}

export function buildCargoListHtml({
  groups,
  clients,
  heldOrderIds,
  selectedOrderIds,
  calcTotal,
  now = new Date(),
}: BuildCargoListHtmlParams): string {
  const dateStr = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "long", year: "numeric" }).format(now);
  const stampStr = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(now);
  const fmtMoney = (n: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0 }).format(n);

  let html = `<!DOCTYPE html><html><head><title>Listado de Carga</title><style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,sans-serif;padding:24px;font-size:13px;color:#1f2937}
table{width:100%;border-collapse:collapse}
th,td{padding:7px 12px;border-bottom:1px solid #f3f4f6}
th{font-size:10px;font-weight:700;color:#6b7280;background:#f9fafb;border-bottom:1px solid #e5e7eb;text-transform:uppercase;letter-spacing:0.05em}
td.right,th.right{text-align:right}
th.center,td.center{text-align:center}
.checkbox{display:inline-block;width:14px;height:14px;border:2px solid #9ca3af;border-radius:3px}
.section{border:1px solid #d1d5db;border-radius:8px;overflow:hidden;margin-bottom:20px}
.section-title{background:#f3f4f6;padding:8px 12px;border-bottom:1px solid #d1d5db;font-size:10px;font-weight:700;text-transform:uppercase;color:#374151;letter-spacing:0.05em}
.tfoot td{border-top:2px solid #d1d5db;background:#f3f4f6;font-weight:700}
.client-row{display:flex;align-items:center;justify-content:space-between;background:#f3f4f6;color:#111827;padding:8px 12px;font-size:13px;font-weight:800;border-bottom:1px solid #d1d5db;border-top:2px solid #9ca3af}
.client-row .debt{font-size:11px;font-weight:600;padding:2px 8px;border-radius:4px}
.client-meta{display:flex;gap:18px;flex-wrap:wrap;padding:6px 12px;background:#f9fafb;border-bottom:1px solid #e5e7eb;font-size:11px;color:#374151}
.client-meta b{color:#6b7280;font-weight:600}
.debt-moroso{background:#fca5a5;color:#991b1b}
.debt-incobrable{background:#f87171;color:#7f1d1d}
.debt-normal{background:#fde68a;color:#92400e}
.debt-ok{background:#bbf7d0;color:#166534}
.stop{display:flex;align-items:flex-start;gap:12px;padding:10px 12px;border-bottom:1px solid #e5e7eb}
.stop:last-child{border-bottom:none}
.stop-num{flex-shrink:0;width:24px;height:24px;border-radius:50%;background:#e5e7eb;color:#374151;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700}
.header{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid #1f2937}
.header h2{font-size:18px;line-height:1.2}
.header .meta{text-align:right;font-size:11px;color:#6b7280}
.summary{display:flex;gap:16px;margin-bottom:20px}
.summary-card{flex:1;border:1px solid #d1d5db;border-radius:8px;padding:12px;text-align:center}
.summary-card .num{font-size:22px;font-weight:800;color:#1f2937}
.summary-card .label{font-size:10px;color:#6b7280;text-transform:uppercase;font-weight:600;margin-top:2px}
.footer{margin-top:20px;text-align:center;font-size:10px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:8px}
.cliente-block{page-break-inside:avoid}
*{-webkit-print-color-adjust:exact;print-color-adjust:exact}
@media print{body{padding:16px}}
</style></head><body>`;

  // Header compacto + lista al inicio (sin tarjetas de resumen)
  html += `<div class="header"><div><h2>Listado de Carga</h2></div><div class="meta"><div style="font-weight:600;color:#1f2937;font-size:13px">${dateStr}</div></div></div>`;

  // Entregas por cliente con deuda (excluye retenidos).
  // Solo se cargan pedidos con remito vigente: si se borró el remito, ese
  // pedido no aparece ni suma (evita mostrar remitos/montos que ya no van).
  html += `<div class="section"><div class="section-title">Entregas por Cliente</div>`;
  groups
    .filter(({ orders }) => orders.some((o) => !heldOrderIds.has(o.id)))
    .filter(({ orders }) => selectedOrderIds.size === 0 || orders.some((o) => selectedOrderIds.has(o.id)))
    .map(({ client, orders }) => ({ client, orders: orders.filter((o) => o.remitoNumber && !heldOrderIds.has(o.id) && (selectedOrderIds.size === 0 || selectedOrderIds.has(o.id))) }))
    .filter(({ orders }) => orders.length > 0)
    .forEach(({ client, orders: clientOrders }) => {
    const firstOrder = clientOrders[0];
    const clientData = clients.find((c) => c.id === firstOrder.clientId);
    const deuda = clientData?.currentBalance || 0;
    const clasificacion = clientData?.debtClassification;
    let debtHtml = "";
    if (deuda > 0) {
      const cls = clasificacion === "moroso" ? "debt-moroso" : clasificacion === "incobrable" ? "debt-incobrable" : "debt-normal";
      const label = clasificacion === "moroso" ? "MOROSO" : clasificacion === "incobrable" ? "INCOBRABLE" : "";
      debtHtml = `<span class="debt ${cls}">Deuda: ${fmtMoney(deuda)}${label ? ` — ${label}` : ""}</span>`;
    } else {
      debtHtml = `<span class="debt debt-ok">Al día</span>`;
    }
    const codCli = clientData?.codigo ? ` (${clientData.codigo})` : "";
    // Meta por cliente: remito(s), importe y vendedor
    const remitos = clientOrders.map((o) => o.remitoNumber).filter(Boolean);
    const importe = clientOrders.reduce((a, o) => a + calcTotal(o), 0);
    const vendedor = firstOrder.sellerName || "—";
    html += `<div class="cliente-block">`;
    html += `<div class="client-row"><span>${client}${codCli} — ${clientOrders.length} ${clientOrders.length === 1 ? "pedido" : "pedidos"}</span>${debtHtml}</div>`;
    html += `<div class="client-meta"><span><b>Remito:</b> ${remitos.length ? remitos.join(", ") : "— (sin generar)"}</span><span><b>Importe:</b> ${fmtMoney(importe)}</span><span><b>Vendedor:</b> ${vendedor}</span></div>`;
    clientOrders.forEach((order, idx) => {
      const addr = order.address || "Sin dirección";
      const city = order.city ? ` · ${order.city}` : "";
      html += `<div class="stop"><div class="stop-num">${idx+1}</div><div style="flex:1"><div style="display:flex;justify-content:space-between;align-items:center"><strong style="font-size:12px">${addr}${city}</strong><span class="checkbox"></span></div></div></div>`;
    });
    html += `</div>`;
  });
  html += `</div><div class="footer">Generado el ${stampStr}</div></body></html>`;
  return html;
}
