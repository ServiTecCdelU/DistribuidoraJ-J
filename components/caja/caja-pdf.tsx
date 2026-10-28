// PDF del cierre de caja. Módulo aparte para que @react-pdf/renderer (pesado) se cargue
// recién al descargar el PDF y no al abrir Caja, que es la pantalla de inicio del admin.
import { Document, Page as PdfPage, Text, View, StyleSheet, pdf } from "@react-pdf/renderer";
import type { Sale } from "@/lib/types";
import { agregarDesglose, efectivoEsperado, totalesMovimientos, type MovimientoEfectivo } from "@/lib/utils/caja-desglose";
import { formatCurrency, formatDate, formatDateWeekday, formatTime } from "@/lib/utils/format";

export interface CashRegister {
  id: string;
  openedAt: Date;
  closedAt?: Date;
  openedBy: string;
  closedBy?: string;
  initialAmount: number;
  finalAmount?: number;
  expectedAmount?: number;
  difference?: number;
  status: "open" | "closed";
  notes?: string;
  salesCount?: number;
  totalSales?: number;
  cashTotal?: number;
  creditTotal?: number;
  transferTotal?: number;
  verified: boolean;
  verifiedAt?: Date;
  verifiedBy?: string;
  verifiedAmount?: number;
  verifiedNotes?: string;
}

const cajaPdfStyles = StyleSheet.create({
  page: { padding: "14mm", fontFamily: "Helvetica", fontSize: 9, color: "#1a1a1a", backgroundColor: "white" },
  header: { borderBottom: "2px solid #0d9488", paddingBottom: 10, marginBottom: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  title: { fontSize: 20, fontWeight: "bold", color: "#0d9488" },
  subtitle: { fontSize: 10, color: "#555", marginTop: 2 },
  headerRight: { alignItems: "flex-end" },
  headerDate: { fontSize: 11, fontWeight: "bold" },
  headerTime: { fontSize: 8, color: "#666", marginTop: 2 },
  section: { marginBottom: 12 },
  sectionTitle: { fontSize: 11, fontWeight: "bold", marginBottom: 6, color: "#0d9488", borderBottom: "1px solid #e5e7eb", paddingBottom: 3 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3, borderBottom: "0.5px solid #f3f4f6" },
  label: { fontSize: 9, color: "#555" },
  value: { fontSize: 9, fontWeight: "bold" },
  statsGrid: { flexDirection: "row", gap: 10, marginBottom: 12 },
  statBox: { flex: 1, border: "1px solid #e5e7eb", borderRadius: 4, padding: 8 },
  statLabel: { fontSize: 7, color: "#888", marginBottom: 2 },
  statValue: { fontSize: 13, fontWeight: "bold" },
  statSub: { fontSize: 7, color: "#888", marginTop: 1 },
  diffPositive: { color: "#059669" },
  diffNegative: { color: "#dc2626" },
  diffNeutral: { color: "#059669" },
  saleRow: { flexDirection: "row", paddingVertical: 3, borderBottom: "0.5px solid #f0f0f0", alignItems: "center" },
  saleClient: { fontSize: 8, fontWeight: "bold", width: "33%", paddingRight: 4 },
  saleNumber: { fontSize: 7, color: "#888", width: "12%" },
  saleHr: { fontSize: 7, color: "#0d9488", fontWeight: "bold", textAlign: "center", width: "8%" },
  saleTime: { fontSize: 7, color: "#888", textAlign: "center", width: "9%" },
  saleAmount: { fontSize: 8, fontWeight: "bold", textAlign: "right", width: "22%" },
  saleBadge: { fontSize: 6, textAlign: "center", width: "16%", padding: "2px 4px", borderRadius: 3 },
  cashBadge: { backgroundColor: "#d1fae5", color: "#065f46" },
  transferBadge: { backgroundColor: "#ede9fe", color: "#5b21b6" },
  creditBadge: { backgroundColor: "#dbeafe", color: "#1e40af" },
  mixedBadge: { backgroundColor: "#fef9c3", color: "#92400e" },
  notesBox: { backgroundColor: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 4, padding: 8, marginTop: 6 },
  notesText: { fontSize: 8, color: "#555", fontStyle: "italic" },
  footer: { marginTop: "auto", paddingTop: 8, borderTop: "1px solid #e5e7eb", flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: "#aaa" },
});

const MOV_LABEL: Record<MovimientoEfectivo["tipo"], string> = {
  cobro: "Cobro",
  cobro_cobrador: "Cobro de cobrador",
  devolucion: "Devolución",
  descuento: "Descuento",
};

const CajaPdfDocument = ({ register, sales, losses = [], pagos = [], rejected = [], movimientos = [] }: { register: CashRegister; sales: Sale[]; losses?: { id: string; amount: number; description: string; date: string }[]; pagos?: { id: string; sellerName: string; monto: number; createdAt: string }[]; rejected?: { id: string; clientName: string; remitoNumber?: string; date: string }[]; movimientos?: MovimientoEfectivo[] }) => {
  const isClosed = register.status === "closed";

  // Calcular desglose desde ventas si no hay datos guardados.
  // Se informa lo COBRADO (no el total de la venta): ver lib/utils/caja-desglose.ts
  const agregado = agregarDesglose(sales as any[]);
  const efectivoTotal = agregado.efectivo;
  const transferTotal = agregado.transferencia;
  const creditTotalCalc = agregado.credito;
  const totalCalc = agregado.total;

  const cashTotal = register.cashTotal ?? efectivoTotal;
  const transferTotalFinal = register.transferTotal ?? transferTotal;
  const creditTotal = register.creditTotal ?? creditTotalCalc;
  const totalSales = register.totalSales ?? totalCalc;
  const salesCount = register.salesCount ?? sales.length;
  const pagosTotal = pagos.reduce((a, p) => a + p.monto, 0);
  const movs = totalesMovimientos(movimientos);
  const expectedCash = efectivoEsperado({
    inicial: register.initialAmount, efectivoVentas: cashTotal,
    cobros: movs.cobros, devoluciones: movs.devoluciones, comisiones: pagosTotal,
  });
  const hojasRutaCaja = Array.from(new Set(sales.map((s) => (s as any).hojaRutaNumber).filter(Boolean))).sort() as string[];

  return (
    <Document>
      <PdfPage size="A4" style={cajaPdfStyles.page}>
        {/* Header */}
        <View style={cajaPdfStyles.header}>
          <View>
            <Text style={cajaPdfStyles.title}>Caja de Reparto</Text>
            <Text style={cajaPdfStyles.subtitle}>Distribuidora Patricia</Text>
          </View>
          <View style={cajaPdfStyles.headerRight}>
            <Text style={cajaPdfStyles.headerDate}>{formatDateWeekday(register.openedAt)}</Text>
            <Text style={cajaPdfStyles.headerTime}>
              Abierta: {formatTime(register.openedAt)}
              {register.closedAt && ` | Cerrada: ${formatTime(register.closedAt)}`}
            </Text>
          </View>
        </View>

        {/* Info de apertura/cierre */}
        <View style={cajaPdfStyles.section}>
          <Text style={cajaPdfStyles.sectionTitle}>Datos de la caja</Text>
          <View style={cajaPdfStyles.row}>
            <Text style={cajaPdfStyles.label}>Estado</Text>
            <Text style={cajaPdfStyles.value}>{isClosed ? "CERRADA" : "ABIERTA"}</Text>
          </View>
          <View style={cajaPdfStyles.row}>
            <Text style={cajaPdfStyles.label}>Abierta por</Text>
            <Text style={cajaPdfStyles.value}>{register.openedBy}</Text>
          </View>
          {register.closedBy && (
            <View style={cajaPdfStyles.row}>
              <Text style={cajaPdfStyles.label}>Cerrada por</Text>
              <Text style={cajaPdfStyles.value}>{register.closedBy}</Text>
            </View>
          )}
          <View style={cajaPdfStyles.row}>
            <Text style={cajaPdfStyles.label}>Monto inicial</Text>
            <Text style={cajaPdfStyles.value}>{formatCurrency(register.initialAmount)}</Text>
          </View>
          {hojasRutaCaja.length > 0 && (
            <View style={cajaPdfStyles.row}>
              <Text style={cajaPdfStyles.label}>Hojas de ruta</Text>
              <Text style={cajaPdfStyles.value}>{hojasRutaCaja.join(", ")}</Text>
            </View>
          )}
        </View>

        {/* Estadísticas */}
        <View style={cajaPdfStyles.statsGrid}>
          <View style={cajaPdfStyles.statBox}>
            <Text style={cajaPdfStyles.statLabel}>VENTA TOTAL</Text>
            <Text style={cajaPdfStyles.statValue}>{formatCurrency(totalSales)}</Text>
            <Text style={cajaPdfStyles.statSub}>{salesCount} ventas</Text>
          </View>
          <View style={cajaPdfStyles.statBox}>
            <Text style={cajaPdfStyles.statLabel}>EFECTIVO</Text>
            <Text style={cajaPdfStyles.statValue}>{formatCurrency(cashTotal)}</Text>
          </View>
          <View style={cajaPdfStyles.statBox}>
            <Text style={cajaPdfStyles.statLabel}>TRANSFERENCIA</Text>
            <Text style={cajaPdfStyles.statValue}>{formatCurrency(transferTotalFinal)}</Text>
          </View>
          <View style={cajaPdfStyles.statBox}>
            <Text style={cajaPdfStyles.statLabel}>CTA. CORRIENTE</Text>
            <Text style={cajaPdfStyles.statValue}>{formatCurrency(creditTotal)}</Text>
          </View>
        </View>
        <View style={[cajaPdfStyles.statsGrid, { marginTop: 0 }]}>
          <View style={cajaPdfStyles.statBox}>
            <Text style={cajaPdfStyles.statLabel}>EFECTIVO ESPERADO EN CAJA</Text>
            <Text style={cajaPdfStyles.statValue}>{formatCurrency(expectedCash)}</Text>
            <Text style={cajaPdfStyles.statSub}>Inicial + efectivo + cobros cta. cte. - devoluciones - comisiones</Text>
          </View>
        </View>

        {/* Resultado del cierre */}
        {isClosed && register.difference != null && (
          <View style={cajaPdfStyles.section}>
            <Text style={cajaPdfStyles.sectionTitle}>Resultado del cierre</Text>
            <View style={cajaPdfStyles.row}>
              <Text style={cajaPdfStyles.label}>Esperado en caja</Text>
              <Text style={cajaPdfStyles.value}>{formatCurrency(register.expectedAmount || expectedCash)}</Text>
            </View>
            <View style={cajaPdfStyles.row}>
              <Text style={cajaPdfStyles.label}>Contado en caja</Text>
              <Text style={cajaPdfStyles.value}>{formatCurrency(register.finalAmount || 0)}</Text>
            </View>
            <View style={cajaPdfStyles.row}>
              <Text style={cajaPdfStyles.label}>Diferencia</Text>
              <Text style={[
                cajaPdfStyles.value,
                register.difference === 0
                  ? cajaPdfStyles.diffNeutral
                  : register.difference > 0
                    ? cajaPdfStyles.diffPositive
                    : cajaPdfStyles.diffNegative,
              ]}>
                {formatCurrency(register.difference)}
                {register.difference === 0 ? " (cuadra)" : register.difference > 0 ? " (sobrante)" : " (faltante)"}
              </Text>
            </View>
            {register.notes && (
              <View style={cajaPdfStyles.notesBox}>
                <Text style={cajaPdfStyles.notesText}>Notas: {register.notes}</Text>
              </View>
            )}
          </View>
        )}

        {/* Verificación del admin (caja diaria conciliada) */}
        {register.verified && (
          <View style={cajaPdfStyles.section}>
            <Text style={cajaPdfStyles.sectionTitle}>Verificación</Text>
            <View style={cajaPdfStyles.row}>
              <Text style={cajaPdfStyles.label}>Contado por reparto</Text>
              <Text style={cajaPdfStyles.value}>{formatCurrency(register.finalAmount || 0)}</Text>
            </View>
            <View style={cajaPdfStyles.row}>
              <Text style={cajaPdfStyles.label}>Verificado por admin</Text>
              <Text style={cajaPdfStyles.value}>{formatCurrency(register.verifiedAmount || 0)}</Text>
            </View>
            <View style={cajaPdfStyles.row}>
              <Text style={cajaPdfStyles.label}>Verificado por</Text>
              <Text style={cajaPdfStyles.value}>
                {register.verifiedBy}{register.verifiedAt ? ` — ${register.verifiedAt.toLocaleDateString("es-AR")}` : ""}
              </Text>
            </View>
            {register.verifiedNotes && (
              <View style={cajaPdfStyles.notesBox}>
                <Text style={cajaPdfStyles.notesText}>Motivo: {register.verifiedNotes}</Text>
              </View>
            )}
          </View>
        )}

        {/* Detalle de ventas */}
        {sales.length > 0 && (
          <View style={cajaPdfStyles.section}>
            <Text style={cajaPdfStyles.sectionTitle}>Detalle de ventas ({sales.length})</Text>
            {/* Header de tabla */}
            <View style={[cajaPdfStyles.saleRow, { borderBottom: "1px solid #d1d5db", paddingBottom: 4, marginBottom: 2 }]}>
              <Text style={[cajaPdfStyles.saleClient, { fontWeight: "bold", color: "#333" }]}>Cliente</Text>
              <Text style={[cajaPdfStyles.saleNumber, { fontWeight: "bold", color: "#333" }]}>#Venta</Text>
              <Text style={[cajaPdfStyles.saleHr, { fontWeight: "bold", color: "#333" }]}>HR</Text>
              <Text style={[cajaPdfStyles.saleTime, { fontWeight: "bold", color: "#333" }]}>Hora</Text>
              <Text style={[cajaPdfStyles.saleBadge, { fontWeight: "bold", color: "#333" }]}>Pago</Text>
              <Text style={[cajaPdfStyles.saleAmount, { fontWeight: "bold", color: "#333" }]}>Monto</Text>
            </View>
            {sales.map((sale, i) => {
              const badgeStyle = sale.paymentType === "cash"
                ? ((sale as any).paymentMethod === "transferencia" ? cajaPdfStyles.transferBadge : cajaPdfStyles.cashBadge)
                : sale.paymentType === "credit"
                  ? cajaPdfStyles.creditBadge
                  : cajaPdfStyles.mixedBadge;
              return (
                <View key={i} style={cajaPdfStyles.saleRow}>
                  <Text style={cajaPdfStyles.saleClient}>{sale.clientName || "Cons. Final"}</Text>
                  <Text style={cajaPdfStyles.saleNumber}>{sale.saleNumber ? `#${sale.saleNumber}` : "-"}</Text>
                  <Text style={cajaPdfStyles.saleHr}>{(sale as any).hojaRutaNumber || "Local"}</Text>
                  <Text style={cajaPdfStyles.saleTime}>{formatTime(new Date(sale.createdAt))}</Text>
                  <Text style={[cajaPdfStyles.saleBadge, badgeStyle]}>
                    {sale.paymentType === "cash"
                      ? ((sale as any).paymentMethod === "transferencia" ? "Transf." : "Efectivo")
                      : sale.paymentType === "credit" ? "Cta.Cte." : "Mixto"}
                  </Text>
                  <Text style={cajaPdfStyles.saleAmount}>{formatCurrency(sale.total || 0)}</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Pedidos rechazados */}
        {rejected.length > 0 && (
          <View style={cajaPdfStyles.section}>
            <Text style={[cajaPdfStyles.sectionTitle, { color: "#dc2626" }]}>Pedidos rechazados ({rejected.length})</Text>
            <View style={[cajaPdfStyles.saleRow, { borderBottom: "1px solid #d1d5db", paddingBottom: 4, marginBottom: 2 }]}>
              <Text style={[cajaPdfStyles.saleClient, { fontWeight: "bold", color: "#333" }]}>Cliente</Text>
              <Text style={[cajaPdfStyles.saleNumber, { fontWeight: "bold", color: "#333" }]}>Remito</Text>
              <Text style={[cajaPdfStyles.saleHr, { fontWeight: "bold", color: "#333" }]}>HR</Text>
              <Text style={[cajaPdfStyles.saleTime, { fontWeight: "bold", color: "#333" }]}>Hora</Text>
              <Text style={[cajaPdfStyles.saleBadge, { fontWeight: "bold", color: "#333" }]}>Estado</Text>
            </View>
            {rejected.map((o, i) => (
              <View key={i} style={cajaPdfStyles.saleRow}>
                <Text style={cajaPdfStyles.saleClient}>{o.clientName || "Cons. Final"}</Text>
                <Text style={cajaPdfStyles.saleNumber}>{o.remitoNumber || "-"}</Text>
                <Text style={cajaPdfStyles.saleHr}>-</Text>
                <Text style={cajaPdfStyles.saleTime}>{formatTime(new Date(o.date))}</Text>
                <Text style={[cajaPdfStyles.saleBadge, { color: "#dc2626" }]}>Rechazado</Text>
              </View>
            ))}
          </View>
        )}

        {/* Pérdidas por roturas */}
        {losses.length > 0 && (
          <View style={cajaPdfStyles.section}>
            <Text style={[cajaPdfStyles.sectionTitle, { color: "#dc2626" }]}>Pérdidas por roturas</Text>
            {losses.map((l, i) => (
              <View key={i} style={cajaPdfStyles.row}>
                <Text style={[cajaPdfStyles.label, { flex: 3 }]}>{l.description}</Text>
                <Text style={[cajaPdfStyles.value, { color: "#dc2626" }]}>-{formatCurrency(l.amount)}</Text>
              </View>
            ))}
            <View style={[cajaPdfStyles.row, { borderTop: "1px solid #fecaca", marginTop: 4, paddingTop: 4 }]}>
              <Text style={[cajaPdfStyles.label, { fontWeight: "bold" }]}>Total pérdidas</Text>
              <Text style={[cajaPdfStyles.value, { fontWeight: "bold", color: "#dc2626" }]}>-{formatCurrency(losses.reduce((a, l) => a + l.amount, 0))}</Text>
            </View>
          </View>
        )}

        {/* Cobros de cta cte y devoluciones en efectivo */}
        {movimientos.length > 0 && (
          <View style={cajaPdfStyles.section}>
            <Text style={[cajaPdfStyles.sectionTitle, { color: "#047857" }]}>Efectivo fuera de ventas</Text>
            {movimientos.map((m, i) => (
              <View key={i} style={cajaPdfStyles.row}>
                <Text style={[cajaPdfStyles.label, { flex: 3 }]}>{MOV_LABEL[m.tipo]}{m.cliente ? ` · ${m.cliente}` : ""}</Text>
                <Text style={[cajaPdfStyles.value, { color: m.monto >= 0 ? "#047857" : "#dc2626" }]}>
                  {m.monto >= 0 ? "+" : "-"}{formatCurrency(Math.abs(Number(m.monto)))}
                </Text>
              </View>
            ))}
            <View style={[cajaPdfStyles.row, { borderTop: "1px solid #a7f3d0", marginTop: 4, paddingTop: 4 }]}>
              <Text style={[cajaPdfStyles.label, { fontWeight: "bold" }]}>Cobros / Devoluciones</Text>
              <Text style={[cajaPdfStyles.value, { fontWeight: "bold" }]}>+{formatCurrency(movs.cobros)} / -{formatCurrency(movs.devoluciones)}</Text>
            </View>
          </View>
        )}

        {/* Pagos de comisiones */}
        {pagos.length > 0 && (
          <View style={cajaPdfStyles.section}>
            <Text style={[cajaPdfStyles.sectionTitle, { color: "#ea580c" }]}>Pagos de comisiones</Text>
            {pagos.map((p, i) => (
              <View key={i} style={cajaPdfStyles.row}>
                <Text style={[cajaPdfStyles.label, { flex: 3 }]}>{p.sellerName}</Text>
                <Text style={[cajaPdfStyles.value, { color: "#ea580c" }]}>-{formatCurrency(p.monto)}</Text>
              </View>
            ))}
            <View style={[cajaPdfStyles.row, { borderTop: "1px solid #fed7aa", marginTop: 4, paddingTop: 4 }]}>
              <Text style={[cajaPdfStyles.label, { fontWeight: "bold" }]}>Total comisiones pagadas</Text>
              <Text style={[cajaPdfStyles.value, { fontWeight: "bold", color: "#ea580c" }]}>-{formatCurrency(pagosTotal)}</Text>
            </View>
          </View>
        )}

        {/* Footer */}
        <View style={cajaPdfStyles.footer}>
          <Text>Caja de Reparto - Distribuidora Patricia</Text>
          <Text>Generado: {formatDate(new Date())} {formatTime(new Date())}</Text>
        </View>
      </PdfPage>
    </Document>
  );
};

export const generarCajaPdf = async (register: CashRegister, sales: Sale[], losses: { id: string; amount: number; description: string; date: string }[] = [], pagos: { id: string; sellerName: string; monto: number; createdAt: string }[] = [], rejected: { id: string; clientName: string; remitoNumber?: string; date: string }[] = [], movimientos: MovimientoEfectivo[] = []) => {
  const blob = await pdf(<CajaPdfDocument register={register} sales={sales} losses={losses} pagos={pagos} rejected={rejected} movimientos={movimientos} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `caja_${formatDate(register.openedAt).replace(/\//g, "-")}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
};
