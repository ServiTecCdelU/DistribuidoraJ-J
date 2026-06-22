"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { MainLayout } from "@/components/layout/main-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DollarSign,
  Banknote,
  CreditCard,
  Clock,
  CheckCircle2,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  LockKeyhole,
  Unlock,
  FileText,
  CalendarIcon,
  Search,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Receipt,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { salesApi, auditApi } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import type { Sale } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { generateReadableId } from "@/services/supabase-helpers";
import { formatCurrency, formatTime } from "@/lib/utils/format";
import { toast } from "sonner";
import { Document, Page as PdfPage, Text, View, StyleSheet, pdf } from "@react-pdf/renderer";

interface CashRegister {
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
}

// ── Helpers ──
const formatDateShort = (d: Date) =>
  d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });

const formatDateLong = (d: Date) =>
  new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);

const formatTimeStr = (d: Date) =>
  d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });

const mapRegister = (data: any): CashRegister => ({
  id: data.id,
  openedAt: new Date(data.opened_at),
  closedAt: data.closed_at ? new Date(data.closed_at) : undefined,
  openedBy: data.opened_by || "",
  closedBy: data.closed_by || undefined,
  initialAmount: data.initial_amount || 0,
  finalAmount: data.final_amount != null ? data.final_amount : undefined,
  expectedAmount: data.expected_amount != null ? data.expected_amount : undefined,
  difference: data.difference != null ? data.difference : undefined,
  status: data.status || "open",
  notes: data.notes,
  salesCount: data.sales_count,
  totalSales: data.total_sales,
  cashTotal: data.cash_total,
  creditTotal: data.credit_total,
  transferTotal: data.transfer_total,
});

// ══════════════════════ PDF DE CAJA ══════════════════════

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
  saleRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3, borderBottom: "0.5px solid #f0f0f0", alignItems: "center" },
  saleClient: { fontSize: 8, fontWeight: "bold", width: "30%" },
  saleNumber: { fontSize: 7, color: "#888", width: "12%" },
  saleTime: { fontSize: 7, color: "#888", width: "10%" },
  saleAmount: { fontSize: 8, fontWeight: "bold", textAlign: "right", width: "18%" },
  saleBadge: { fontSize: 6, textAlign: "center", width: "15%", padding: "2px 4px", borderRadius: 3 },
  cashBadge: { backgroundColor: "#d1fae5", color: "#065f46" },
  transferBadge: { backgroundColor: "#ede9fe", color: "#5b21b6" },
  creditBadge: { backgroundColor: "#dbeafe", color: "#1e40af" },
  mixedBadge: { backgroundColor: "#fef9c3", color: "#92400e" },
  notesBox: { backgroundColor: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 4, padding: 8, marginTop: 6 },
  notesText: { fontSize: 8, color: "#555", fontStyle: "italic" },
  footer: { marginTop: "auto", paddingTop: 8, borderTop: "1px solid #e5e7eb", flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: "#aaa" },
});

const CajaPdfDocument = ({ register, sales, losses = [], pagos = [], rejected = [] }: { register: CashRegister; sales: Sale[]; losses?: { id: string; amount: number; description: string; date: string }[]; pagos?: { id: string; sellerName: string; monto: number; createdAt: string }[]; rejected?: { id: string; clientName: string; remitoNumber?: string; date: string }[] }) => {
  const isClosed = register.status === "closed";

  // Calcular desglose desde ventas si no hay datos guardados
  let efectivoTotal = 0;
  let transferTotal = 0;
  let creditTotalCalc = 0;
  let totalCalc = 0;
  for (const s of sales) {
    totalCalc += s.total || 0;
    const method = (s as any).paymentMethod || "efectivo";
    if (s.paymentType === "cash") {
      if (method === "transferencia") transferTotal += s.total || 0;
      else efectivoTotal += s.total || 0;
    } else if (s.paymentType === "credit") {
      creditTotalCalc += s.total || 0;
    } else if (s.paymentType === "mixed") {
      const cashAmt = (s as any).cashAmount || 0;
      const creditAmt = (s as any).creditAmount || 0;
      const efectivoAmt = (s as any).efectivo_amount ?? (method !== "transferencia" ? cashAmt : 0);
      const transferenciaAmt = (s as any).transferencia_amount ?? (method === "transferencia" ? cashAmt : 0);
      efectivoTotal += efectivoAmt;
      transferTotal += transferenciaAmt;
      creditTotalCalc += creditAmt;
    }
  }

  const cashTotal = register.cashTotal ?? efectivoTotal;
  const transferTotalFinal = register.transferTotal ?? transferTotal;
  const creditTotal = register.creditTotal ?? creditTotalCalc;
  const totalSales = register.totalSales ?? totalCalc;
  const salesCount = register.salesCount ?? sales.length;
  const pagosTotal = pagos.reduce((a, p) => a + p.monto, 0);
  const expectedCash = register.initialAmount + cashTotal - pagosTotal;

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
            <Text style={cajaPdfStyles.headerDate}>{formatDateLong(register.openedAt)}</Text>
            <Text style={cajaPdfStyles.headerTime}>
              Abierta: {formatTimeStr(register.openedAt)}
              {register.closedAt && ` | Cerrada: ${formatTimeStr(register.closedAt)}`}
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
            <Text style={cajaPdfStyles.statSub}>Inicial + efectivo - comisiones</Text>
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

        {/* Detalle de ventas */}
        {sales.length > 0 && (
          <View style={cajaPdfStyles.section}>
            <Text style={cajaPdfStyles.sectionTitle}>Detalle de ventas ({sales.length})</Text>
            {/* Header de tabla */}
            <View style={[cajaPdfStyles.saleRow, { borderBottom: "1px solid #d1d5db", paddingBottom: 4, marginBottom: 2 }]}>
              <Text style={[cajaPdfStyles.saleClient, { fontWeight: "bold", color: "#333" }]}>Cliente</Text>
              <Text style={[cajaPdfStyles.saleNumber, { fontWeight: "bold", color: "#333" }]}>#Venta</Text>
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
                  <Text style={cajaPdfStyles.saleClient}>{sale.clientName || "Cons. Final"}{(sale as any).hojaRutaNumber ? `  (HR ${(sale as any).hojaRutaNumber})` : ""}</Text>
                  <Text style={cajaPdfStyles.saleNumber}>{sale.saleNumber ? `#${sale.saleNumber}` : "-"}</Text>
                  <Text style={cajaPdfStyles.saleTime}>{formatTimeStr(new Date(sale.createdAt))}</Text>
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
              <Text style={[cajaPdfStyles.saleTime, { fontWeight: "bold", color: "#333" }]}>Hora</Text>
              <Text style={[cajaPdfStyles.saleBadge, { fontWeight: "bold", color: "#333" }]}>Estado</Text>
            </View>
            {rejected.map((o, i) => (
              <View key={i} style={cajaPdfStyles.saleRow}>
                <Text style={cajaPdfStyles.saleClient}>{o.clientName || "Cons. Final"}</Text>
                <Text style={cajaPdfStyles.saleNumber}>{o.remitoNumber || "-"}</Text>
                <Text style={cajaPdfStyles.saleTime}>{formatTimeStr(new Date(o.date))}</Text>
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
          <Text>Generado: {formatDateShort(new Date())} {formatTimeStr(new Date())}</Text>
        </View>
      </PdfPage>
    </Document>
  );
};

const generarCajaPdf = async (register: CashRegister, sales: Sale[], losses: { id: string; amount: number; description: string; date: string }[] = [], pagos: { id: string; sellerName: string; monto: number; createdAt: string }[] = [], rejected: { id: string; clientName: string; remitoNumber?: string; date: string }[] = []) => {
  const blob = await pdf(<CajaPdfDocument register={register} sales={sales} losses={losses} pagos={pagos} rejected={rejected} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `caja_${formatDateShort(register.openedAt).replace(/\//g, "-")}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
};

// ══════════════════════ COMPONENTE PRINCIPAL ══════════════════════

export default function CajaPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [sales, setSales] = useState<Sale[]>([]);
  // Pedidos rechazados del día (cliente no los quiso). Se muestran en caja sin monto.
  const [rejectedOrders, setRejectedOrders] = useState<{ id: string; clientName: string; remitoNumber?: string; date: string }[]>([]);
  const [losses, setLosses] = useState<{ id: string; amount: number; description: string; date: string }[]>([]);
  const [pagosComisiones, setPagosComisiones] = useState<{ id: string; sellerName: string; monto: number; createdAt: string }[]>([]);
  const [currentRegister, setCurrentRegister] = useState<CashRegister | null>(null);

  // Open register modal
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [initialAmount, setInitialAmount] = useState("");

  // Close register modal
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [finalAmount, setFinalAmount] = useState("");
  const [closeNotes, setCloseNotes] = useState("");
  const [closingRegister, setClosingRegister] = useState<CashRegister | null>(null);
  const [closingSales, setClosingSales] = useState<Sale[] | null>(null);

  const [saving, setSaving] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  // Comprobante de transferencia (visor)
  const [comprobanteUrl, setComprobanteUrl] = useState<string | null>(null);

  // Historial
  const [historialRegisters, setHistorialRegisters] = useState<CashRegister[]>([]);
  const [historialLoading, setHistorialLoading] = useState(false);
  const [searchDate, setSearchDate] = useState<Date | undefined>(undefined);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [historialPage, setHistorialPage] = useState(0);
  const HISTORIAL_PAGE_SIZE = 10;

  // Detalle de caja histórica
  const [selectedHistorial, setSelectedHistorial] = useState<CashRegister | null>(null);
  const [selectedSales, setSelectedSales] = useState<Sale[]>([]);
  const [selectedRejected, setSelectedRejected] = useState<{ id: string; clientName: string; remitoNumber?: string; date: string }[]>([]);
  const [filtroVendedorCaja, setFiltroVendedorCaja] = useState<string>("all");
  const [detailLoading, setDetailLoading] = useState(false);
  const [generatingHistorialPdf, setGeneratingHistorialPdf] = useState<string | null>(null);

  // Reconciliación por horario fijo: la caja abre 06:00 y cierra 23:00, automáticamente.
  // - Cierra (con final = esperado; se controla por PDF) toda caja abierta cuyo cierre 23:00 ya pasó.
  // - Si estamos dentro del horario y no hay caja del día, abre una nueva (06:00, inicial 0).
  // - Fuera de horario (23:00–06:00) no hay caja activa.
  // Devuelve la fila (snake_case) de la caja activa, o null si está fuera de horario.
  const reconciliarCajaHorario = useCallback(async (): Promise<any | null> => {
    const HORA_APERTURA = 6;
    const HORA_CIERRE = 23;
    const ahora = new Date();
    const diaHoy = new Date(ahora); diaHoy.setHours(0, 0, 0, 0);
    const aperturaHoy = new Date(diaHoy); aperturaHoy.setHours(HORA_APERTURA, 0, 0, 0);
    const cierreHoy = new Date(diaHoy); cierreHoy.setHours(HORA_CIERRE, 0, 0, 0);
    const dentroHorario = ahora >= aperturaHoy && ahora < cierreHoy;

    const agg = (src: any[]) => {
      let efectivo = 0, transfer = 0, credito = 0, total = 0;
      for (const s of src) {
        total += s.total || 0;
        const method = (s as any).paymentMethod || "efectivo";
        if (s.paymentType === "cash") {
          if (method === "transferencia") transfer += s.total || 0; else efectivo += s.total || 0;
        } else if (s.paymentType === "credit") {
          credito += s.total || 0;
        } else if (s.paymentType === "mixed") {
          const cashAmt = (s as any).cashAmount || 0;
          const creditAmt = (s as any).creditAmount || 0;
          const ef = (s as any).efectivo_amount ?? (method !== "transferencia" ? cashAmt : 0);
          const tr = (s as any).transferencia_amount ?? (method === "transferencia" ? cashAmt : 0);
          efectivo += ef; transfer += tr; credito += creditAmt;
        }
      }
      return { efectivo, transfer, credito, total, count: src.length };
    };

    try {
      // 1) Cerrar automáticamente cajas abiertas cuyo cierre programado (23:00 de su día) ya pasó.
      const { data: abiertas } = await supabase
        .from("caja").select("*").eq("status", "open").order("opened_at", { ascending: true });
      const allSales = await salesApi.getAll();
      for (const reg of (abiertas || [])) {
        const ap = new Date(reg.opened_at);
        const diaReg = new Date(ap); diaReg.setHours(0, 0, 0, 0);
        const cierreReg = new Date(diaReg); cierreReg.setHours(HORA_CIERRE, 0, 0, 0);
        const esDeHoy = diaReg.getTime() === diaHoy.getTime();
        if (esDeHoy && ahora < cierreReg) continue; // caja de hoy aún en horario: sigue activa

        const periodo = allSales.filter((s: any) => {
          const d = new Date(s.createdAt);
          return d >= ap && d <= cierreReg && Boolean(s.remitoNumber);
        });
        const st = agg(periodo);
        const { data: pagos } = await supabase
          .from("pagos_comisiones").select("monto")
          .gte("created_at", ap.toISOString()).lte("created_at", cierreReg.toISOString());
        const comis = (pagos || []).reduce((a: number, p: any) => a + (Number(p.monto) || 0), 0);
        const esperado = (reg.initial_amount || 0) + st.efectivo - comis;
        // .eq("status","open") en el update evita doble cierre si dos pestañas reconcilian a la vez.
        await supabase.from("caja").update({
          closed_at: cierreReg.toISOString(),
          closed_by: "Cierre automático",
          final_amount: esperado,
          expected_amount: esperado,
          difference: 0,
          status: "closed",
          notes: "Cierre automático 23:00",
          sales_count: st.count,
          total_sales: st.total,
          cash_total: st.efectivo,
          credit_total: st.credito,
          transfer_total: st.transfer,
        }).eq("id", reg.id).eq("status", "open");
      }

      // 1.5) Backfill: crear cajas CERRADAS retroactivas para días pasados que tuvieron ventas
      //      con remito pero quedaron sin caja (p.ej. fines de semana donde nadie abrió la página,
      //      o cualquier hueco entre la última caja y hoy). Sin esto, esas ventas no aparecen en
      //      ninguna caja del historial.
      const LIMITE_DIAS = 31;
      const limite = new Date(diaHoy); limite.setDate(limite.getDate() - LIMITE_DIAS);
      const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

      const { data: cajasRango } = await supabase
        .from("caja").select("opened_at").gte("opened_at", limite.toISOString());
      const diasConCaja = new Set((cajasRango || []).map((r: any) => dayKey(new Date(r.opened_at))));

      const { data: pagosRango } = await supabase
        .from("pagos_comisiones").select("monto, created_at").gte("created_at", limite.toISOString());

      // Agrupar ventas con remito de días pasados (dentro del rango, sin contar hoy) por día.
      const ventasPorDia = new Map<string, any[]>();
      for (const s of allSales) {
        if (!(s as any).remitoNumber) continue;
        const d = new Date(s.createdAt);
        if (d < limite || d >= diaHoy) continue;
        const dia = new Date(d); dia.setHours(0, 0, 0, 0);
        const key = dayKey(dia);
        if (diasConCaja.has(key)) continue;
        if (!ventasPorDia.has(key)) ventasPorDia.set(key, []);
        ventasPorDia.get(key)!.push(s);
      }

      for (const [key, ventasDia] of ventasPorDia) {
        const [yy, mm, dd] = key.split("-").map(Number);
        const dia = new Date(yy, mm, dd, 0, 0, 0, 0);
        const ap = new Date(dia); ap.setHours(HORA_APERTURA, 0, 0, 0);
        const cierre = new Date(dia); cierre.setHours(HORA_CIERRE, 0, 0, 0);
        const periodo = ventasDia.filter((s: any) => {
          const d = new Date(s.createdAt);
          return d >= ap && d <= cierre;
        });
        if (periodo.length === 0) continue;
        const st = agg(periodo);
        const comis = (pagosRango || []).reduce((a: number, p: any) => {
          const pd = new Date(p.created_at);
          return pd >= ap && pd <= cierre ? a + (Number(p.monto) || 0) : a;
        }, 0);
        const esperado = st.efectivo - comis; // inicial 0 (apertura automática)
        const dateStr = `${yy}${String(mm + 1).padStart(2, "0")}${String(dd).padStart(2, "0")}`;
        const id = await generateReadableId("caja", "caja", dateStr);
        await supabase.from("caja").insert({
          id,
          opened_at: ap.toISOString(),
          opened_by: "Apertura automática",
          initial_amount: 0,
          closed_at: cierre.toISOString(),
          closed_by: "Cierre automático",
          final_amount: esperado,
          expected_amount: esperado,
          difference: 0,
          status: "closed",
          notes: "Cierre automático 23:00 (retroactivo)",
          sales_count: st.count,
          total_sales: st.total,
          cash_total: st.efectivo,
          credit_total: st.credito,
          transfer_total: st.transfer,
        });
      }

      // 2) ¿Ya hay una caja abierta de hoy? Usarla.
      const { data: deHoy } = await supabase
        .from("caja").select("*").eq("status", "open")
        .gte("opened_at", diaHoy.toISOString()).order("opened_at", { ascending: false }).limit(1);
      if (deHoy && deHoy.length) return deHoy[0];

      // 3) Dentro de horario y sin caja de hoy: abrir automáticamente (06:00, inicial 0).
      if (dentroHorario) {
        const dateStr = `${diaHoy.getFullYear()}${String(diaHoy.getMonth() + 1).padStart(2, "0")}${String(diaHoy.getDate()).padStart(2, "0")}`;
        const id = await generateReadableId("caja", "caja", dateStr);
        const { data: nueva, error } = await supabase.from("caja").insert({
          id,
          opened_at: aperturaHoy.toISOString(),
          opened_by: "Apertura automática",
          initial_amount: 0,
          status: "open",
        }).select().single();
        if (!error && nueva) return nueva;
        // Si falló (carrera), releer la de hoy.
        const { data: retry } = await supabase
          .from("caja").select("*").eq("status", "open")
          .gte("opened_at", diaHoy.toISOString()).limit(1);
        return (retry && retry[0]) || null;
      }

      return null; // fuera de horario (23:00–06:00): caja cerrada
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const doLoad = async () => {
      try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Reconciliar por horario (06:00–23:00): cierra cajas vencidas y abre la del día.
        const activeRegister = await reconciliarCajaHorario();
        if (!mounted) return;
        setCurrentRegister(activeRegister ? mapRegister(activeRegister) : null);

        // Cargar ventas desde la fecha de apertura de la caja activa
        const salesData = await salesApi.getAll();
        if (!mounted) return;
        const cajaDate = activeRegister ? new Date(activeRegister.opened_at) : today;
        cajaDate.setHours(0, 0, 0, 0);
        // Caja toma SOLO ventas con remito. Una venta sin remito es un cobro duplicado/incompleto
        // (vale el remito) y no debe sumar al efectivo del día.
        const todaySales = salesData.filter((sale) => {
          const dt = new Date(sale.createdAt);
          return dt >= cajaDate && Boolean(sale.remitoNumber);
        });
        setSales(todaySales);

        // Cargar pérdidas (roturas) del día
        const { data: lossData } = await supabase
          .from("transacciones")
          .select("*")
          .like("description", "[ROTURA]%")
          .gte("date", cajaDate.toISOString());
        if (!mounted) return;
        setLosses((lossData || []).map((l: any) => ({ id: l.id, amount: Math.abs(Number(l.amount)) || 0, description: (l.description || "").replace("[ROTURA] ", ""), date: l.date })));

        // Cargar pagos de comisiones del día
        const { data: pagosData } = await supabase
          .from("pagos_comisiones")
          .select("id, seller_name, monto, created_at")
          .gte("created_at", cajaDate.toISOString());
        if (!mounted) return;
        setPagosComisiones((pagosData || []).map((p: any) => ({ id: p.id, sellerName: p.seller_name, monto: Number(p.monto) || 0, createdAt: p.created_at })));

        // Cargar pedidos rechazados del día (no afectan totales)
        const { data: rejData } = await supabase
          .from("pedidos")
          .select("id, client_name, remito_number, updated_at")
          .eq("status", "rechazado")
          .gte("updated_at", cajaDate.toISOString());
        if (!mounted) return;
        setRejectedOrders((rejData || []).map((p: any) => ({ id: p.id, clientName: p.client_name, remitoNumber: p.remito_number ?? undefined, date: p.updated_at })));
      } catch {
        if (!mounted) return;
        toast.error("Error al cargar datos de caja");
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    };
    doLoad();
    return () => { mounted = false; };
  }, []);

  const loadData = async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data: registers } = await supabase
        .from("caja")
        .select("*")
        .gte("opened_at", today.toISOString())
        .order("opened_at", { ascending: false })
        .limit(1);

      let activeRegister = registers && registers.length > 0 ? registers[0] : null;

      if (!activeRegister) {
        const { data: openRegisters } = await supabase
          .from("caja")
          .select("*")
          .eq("status", "open")
          .order("opened_at", { ascending: false })
          .limit(1);
        if (openRegisters && openRegisters.length > 0) {
          activeRegister = openRegisters[0];
        }
      }

      if (activeRegister) {
        setCurrentRegister(mapRegister(activeRegister));
      }

      const salesData = await salesApi.getAll();
      const cajaDate = activeRegister ? new Date(activeRegister.opened_at) : today;
      cajaDate.setHours(0, 0, 0, 0);
      // Caja toma SOLO ventas con remito (vale el remito; sin remito = cobro duplicado/incompleto).
      const todaySales = salesData.filter((sale) => {
        const d = new Date(sale.createdAt);
        return d >= cajaDate && Boolean(sale.remitoNumber);
      });
      setSales(todaySales);

      const { data: lossData } = await supabase
        .from("transacciones")
        .select("*")
        .like("description", "[ROTURA]%")
        .gte("date", cajaDate.toISOString());
      setLosses((lossData || []).map((l: any) => ({ id: l.id, amount: Math.abs(Number(l.amount)) || 0, description: (l.description || "").replace("[ROTURA] ", ""), date: l.date })));

      // Cargar pagos de comisiones del día
      const { data: pagosData } = await supabase
        .from("pagos_comisiones")
        .select("id, seller_name, monto, created_at")
        .gte("created_at", cajaDate.toISOString());
      setPagosComisiones((pagosData || []).map((p: any) => ({ id: p.id, sellerName: p.seller_name, monto: Number(p.monto) || 0, createdAt: p.created_at })));

      const { data: rejData } = await supabase
        .from("pedidos")
        .select("id, client_name, remito_number, updated_at")
        .eq("status", "rechazado")
        .gte("updated_at", cajaDate.toISOString());
      setRejectedOrders((rejData || []).map((p: any) => ({ id: p.id, clientName: p.client_name, remitoNumber: p.remito_number ?? undefined, date: p.updated_at })));
    } catch {
      toast.error("Error al recargar ventas");
    } finally {
      setLoading(false);
    }
  };

  const loadHistorial = useCallback(async (date?: Date, page = 0) => {
    setHistorialLoading(true);
    try {
      let query = supabase
        .from("caja")
        .select("*")
        .order("opened_at", { ascending: false });

      if (date) {
        const start = new Date(date);
        start.setHours(0, 0, 0, 0);
        const end = new Date(date);
        end.setHours(23, 59, 59, 999);
        query = query.gte("opened_at", start.toISOString()).lte("opened_at", end.toISOString());
      }

      // Vista por defecto: historial = cajas CERRADAS (incluye la de hoy si ya cerró, p.ej. el
      // cierre automático de las 23:00). Antes filtraba opened_at < hoy, lo que ocultaba la caja
      // cerrada de hoy cuando ya no había caja activa (fuera de horario 23:00–06:00).
      if (!date) {
        query = query.eq("status", "closed");
      }

      query = query.range(page * HISTORIAL_PAGE_SIZE, (page + 1) * HISTORIAL_PAGE_SIZE - 1);

      const { data, error } = await query;
      if (error) throw error;

      setHistorialRegisters((data || []).map(mapRegister));
    } catch {
      toast.error("Error al cargar historial");
    } finally {
      setHistorialLoading(false);
    }
  }, []);

  const loadHistorialDetail = async (register: CashRegister) => {
    setDetailLoading(true);
    setSelectedHistorial(register);
    try {
      const start = new Date(register.openedAt);
      start.setHours(0, 0, 0, 0);
      const end = new Date(register.openedAt);
      end.setHours(23, 59, 59, 999);

      const salesData = await salesApi.getAll();
      const daySales = salesData.filter((s) => {
        const d = new Date(s.createdAt);
        return d >= start && d <= end && Boolean(s.remitoNumber);
      });
      setSelectedSales(daySales);

      // Pedidos rechazados del día (mismo criterio que la caja del día: por updated_at).
      const { data: rejData } = await supabase
        .from("pedidos")
        .select("id, client_name, remito_number, updated_at")
        .eq("status", "rechazado")
        .gte("updated_at", start.toISOString())
        .lte("updated_at", end.toISOString());
      setSelectedRejected((rejData || []).map((p: any) => ({ id: p.id, clientName: p.client_name, remitoNumber: p.remito_number ?? undefined, date: p.updated_at })));
    } catch {
      toast.error("Error al cargar ventas del día");
    } finally {
      setDetailLoading(false);
    }
  };

  const todayStats = useMemo(() => {
    let efectivoTotal = 0;
    let transferTotal = 0;
    let creditTotal = 0;
    let total = 0;

    for (const s of sales) {
      total += s.total || 0;
      const method = (s as any).paymentMethod || "efectivo";
      if (s.paymentType === "cash") {
        if (method === "transferencia") {
          transferTotal += s.total || 0;
        } else {
          efectivoTotal += s.total || 0;
        }
      } else if (s.paymentType === "credit") {
        creditTotal += s.total || 0;
      } else if (s.paymentType === "mixed") {
        const cashAmt = (s as any).cashAmount || 0;
        const creditAmt = (s as any).creditAmount || 0;
        const efectivoAmt = (s as any).efectivo_amount ?? (method !== "transferencia" ? cashAmt : 0);
        const transferenciaAmt = (s as any).transferencia_amount ?? (method === "transferencia" ? cashAmt : 0);
        efectivoTotal += efectivoAmt;
        transferTotal += transferenciaAmt;
        creditTotal += creditAmt;
      }
    }

    const lossTotal = losses.reduce((acc, l) => acc + l.amount, 0);
    const comisionesTotal = pagosComisiones.reduce((acc, p) => acc + p.monto, 0);
    return { efectivoTotal, transferTotal, cashTotal: efectivoTotal + transferTotal, creditTotal, total, count: sales.length, lossTotal, lossCount: losses.length, comisionesTotal, comisionesCount: pagosComisiones.length };
  }, [sales, losses, pagosComisiones]);

  const expectedCash = (currentRegister?.initialAmount || 0) + todayStats.efectivoTotal - todayStats.comisionesTotal;

  // Stats para el modal de cierre (puede ser caja actual o una del historial)
  const closingStats = useMemo(() => {
    const src = closingSales ?? sales;
    let efectivoTotal = 0, transferTotal = 0, creditTotal = 0, total = 0;
    for (const s of src) {
      total += s.total || 0;
      const method = (s as any).paymentMethod || "efectivo";
      if (s.paymentType === "cash") {
        if (method === "transferencia") transferTotal += s.total || 0;
        else efectivoTotal += s.total || 0;
      } else if (s.paymentType === "credit") {
        creditTotal += s.total || 0;
      } else if (s.paymentType === "mixed") {
        const cashAmt = (s as any).cashAmount || 0;
        const creditAmt = (s as any).creditAmount || 0;
        const efectivoAmt = (s as any).efectivo_amount ?? (method !== "transferencia" ? cashAmt : 0);
        const transferenciaAmt = (s as any).transferencia_amount ?? (method === "transferencia" ? cashAmt : 0);
        efectivoTotal += efectivoAmt;
        transferTotal += transferenciaAmt;
        creditTotal += creditAmt;
      }
    }
    return { efectivoTotal, transferTotal, creditTotal, total, count: src.length };
  }, [closingSales, sales]);
  const closingRegisterData = closingRegister ?? currentRegister;
  const closingExpectedCash = (closingRegisterData?.initialAmount || 0) + closingStats.efectivoTotal - todayStats.comisionesTotal;

  const handleOpenRegister = async () => {
    if (!initialAmount || !user) return;
    setSaving(true);
    try {
      const dateStr = new Date().toISOString().split("T")[0].replace(/-/g, '');
      const id = await generateReadableId("caja", "caja", dateStr);
      const { error } = await supabase.from("caja").insert({
        id,
        opened_at: new Date().toISOString(),
        opened_by: user.name || user.email,
        initial_amount: parseFloat(initialAmount),
        status: "open",
      });
      if (error) throw error;
      setCurrentRegister({
        id,
        openedAt: new Date(),
        openedBy: user.name || user.email,
        initialAmount: parseFloat(initialAmount),
        status: "open",
      });
      await auditApi.log({
        action: "cash_register_opened",
        userId: user.id,
        userName: user.name || user.email,
        description: `Abrio caja con ${formatCurrency(parseFloat(initialAmount))}`,
        entityType: "caja",
        entityId: id,
      });
      setShowOpenModal(false);
      setInitialAmount("");
    } catch {
      toast.error("Error al abrir la caja");
    } finally {
      setSaving(false);
    }
  };

  const handleCloseRegister = async () => {
    const reg = closingRegisterData;
    if (!finalAmount || !reg || !user) return;
    setSaving(true);
    try {
      const final_ = parseFloat(finalAmount);
      const diff = final_ - closingExpectedCash;

      const { error } = await supabase.from("caja").update({
        closed_at: new Date().toISOString(),
        closed_by: user.name || user.email,
        final_amount: final_,
        expected_amount: closingExpectedCash,
        difference: diff,
        status: "closed",
        notes: closeNotes || "",
        sales_count: closingStats.count,
        total_sales: closingStats.total,
        cash_total: closingStats.efectivoTotal,
        credit_total: closingStats.creditTotal,
        transfer_total: closingStats.transferTotal,
      }).eq("id", reg.id);
      if (error) throw error;

      const updatedReg = {
        ...reg,
        closedAt: new Date(),
        closedBy: user.name || user.email,
        finalAmount: final_,
        expectedAmount: closingExpectedCash,
        difference: diff,
        status: "closed" as const,
        notes: closeNotes,
        salesCount: closingStats.count,
        totalSales: closingStats.total,
        cashTotal: closingStats.efectivoTotal,
        creditTotal: closingStats.creditTotal,
        transferTotal: closingStats.transferTotal,
      };

      // Actualizar en currentRegister si es la misma
      if (currentRegister?.id === reg.id) {
        setCurrentRegister(updatedReg);
      }
      // Actualizar en historial si está ahí
      setHistorialRegisters(prev => prev.map(r => r.id === reg.id ? updatedReg : r));

      await auditApi.log({
        action: "cash_register_closed",
        userId: user.id,
        userName: user.name || user.email,
        description: `Cerro caja. Esperado: ${formatCurrency(closingExpectedCash)}, Contado: ${formatCurrency(final_)}, Diferencia: ${formatCurrency(diff)}`,
        entityType: "caja",
        entityId: reg.id,
      });
      setShowCloseModal(false);
      setFinalAmount("");
      setCloseNotes("");
      setClosingRegister(null);
      setClosingSales(null);
    } catch {
      toast.error("Error al cerrar la caja");
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!currentRegister) return;
    setGeneratingPdf(true);
    try {
      await generarCajaPdf(currentRegister, sales, losses, pagosComisiones, rejectedOrders);
      toast.success("PDF descargado");
    } catch {
      toast.error("Error al generar PDF");
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handleDownloadHistorialPdf = async (register: CashRegister) => {
    setGeneratingHistorialPdf(register.id);
    try {
      // Cargar ventas del día si no están cargadas
      const start = new Date(register.openedAt);
      start.setHours(0, 0, 0, 0);
      const end = new Date(register.openedAt);
      end.setHours(23, 59, 59, 999);
      const salesData = await salesApi.getAll();
      const daySales = salesData.filter((s) => {
        const d = new Date(s.createdAt);
        return d >= start && d <= end && Boolean(s.remitoNumber);
      });
      // Cargar pérdidas del día
      const { data: lossData } = await supabase
        .from("transacciones")
        .select("*")
        .like("description", "[ROTURA]%")
        .gte("date", start.toISOString())
        .lte("date", end.toISOString());
      const dayLosses = (lossData || []).map((l: any) => ({ id: l.id, amount: Math.abs(Number(l.amount)) || 0, description: (l.description || "").replace("[ROTURA] ", ""), date: l.date }));

      // Cargar pagos de comisiones del día
      const { data: pagosData } = await supabase
        .from("pagos_comisiones")
        .select("id, seller_name, monto, created_at")
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString());
      const dayPagos = (pagosData || []).map((p: any) => ({ id: p.id, sellerName: p.seller_name, monto: Number(p.monto) || 0, createdAt: p.created_at }));

      // Cargar pedidos rechazados del día
      const { data: rejData } = await supabase
        .from("pedidos")
        .select("id, client_name, remito_number, updated_at")
        .eq("status", "rechazado")
        .gte("updated_at", start.toISOString())
        .lte("updated_at", end.toISOString());
      const dayRejected = (rejData || []).map((p: any) => ({ id: p.id, clientName: p.client_name, remitoNumber: p.remito_number ?? undefined, date: p.updated_at }));

      await generarCajaPdf(register, daySales, dayLosses, dayPagos, dayRejected);
      toast.success("PDF descargado");
    } catch {
      toast.error("Error al generar PDF");
    } finally {
      setGeneratingHistorialPdf(null);
    }
  };

  const isOpen = currentRegister?.status === "open";
  const isClosed = currentRegister?.status === "closed";

  const vendedoresEnCaja = Array.from(
    new Map(
      sales
        .filter((s) => s.sellerId)
        .map((s) => [s.sellerId as string, s.sellerName || "Vendedor"]),
    ).entries(),
  ).map(([id, name]) => ({ id, name }));

  const salesFiltradas = filtroVendedorCaja === "all"
    ? sales
    : sales.filter((s) => s.sellerId === filtroVendedorCaja);

  return (
    <MainLayout allowedRoles={['admin']} title="Caja de Reparto" description="Apertura y cierre de caja de reparto">
      <div className="p-4 lg:p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Caja de Reparto</h1>
            <p className="text-muted-foreground text-sm">
              {formatDateLong(new Date())}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {currentRegister && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadPdf}
                disabled={generatingPdf}
              >
                {generatingPdf ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4 mr-2" />
                )}
                PDF
              </Button>
            )}
            {!currentRegister && (
              <Button onClick={() => setShowOpenModal(true)}>
                <Unlock className="h-4 w-4 mr-2" />
                Abrir Caja
              </Button>
            )}
            {isOpen && (
              <Button
                variant="destructive"
                onClick={() => { setClosingRegister(null); setClosingSales(null); setShowCloseModal(true); }}
              >
                <LockKeyhole className="h-4 w-4 mr-2" />
                Cerrar Caja
              </Button>
            )}
            {isClosed && (
              <Badge variant="secondary" className="text-sm px-3 py-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                Caja cerrada
              </Badge>
            )}
          </div>
        </div>

        <Tabs defaultValue="hoy" onValueChange={(v) => {
          if (v === "historial") {
            loadHistorial();
          }
        }}>
          <TabsList>
            <TabsTrigger value="hoy">Hoy</TabsTrigger>
            <TabsTrigger value="historial">Historial</TabsTrigger>
          </TabsList>

          {/* ═══ TAB HOY ═══ */}
          <TabsContent value="hoy" className="space-y-6 mt-4">
            {loading ? (
              <div className="space-y-6">
                <div className="border border-border rounded-2xl p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-10 w-10 rounded-full" />
                      <div className="space-y-1.5">
                        <Skeleton className="h-5 w-32" />
                        <Skeleton className="h-3 w-48" />
                      </div>
                    </div>
                    <div className="text-right space-y-1">
                      <Skeleton className="h-3 w-20 ml-auto" />
                      <Skeleton className="h-5 w-24 ml-auto" />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="border border-border rounded-2xl p-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <Skeleton className="h-4 w-4 rounded" />
                        <Skeleton className="h-3 w-20" />
                      </div>
                      <Skeleton className="h-6 w-28" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  ))}
                </div>
                <div className="border border-border rounded-2xl p-4 space-y-3">
                  <Skeleton className="h-5 w-36" />
                  <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                        <div className="flex items-center gap-3">
                          <Skeleton className="h-3.5 w-3.5 rounded" />
                          <div className="space-y-1">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-3 w-24" />
                          </div>
                        </div>
                        <div className="text-right space-y-1">
                          <Skeleton className="h-4 w-20 ml-auto" />
                          <Skeleton className="h-4 w-16 ml-auto rounded-full" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : !currentRegister ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                  <Banknote className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-1">Caja no abierta</h3>
                  <p className="text-muted-foreground text-sm mb-4">
                    Abri la caja para comenzar a registrar el dia
                  </p>
                  <Button onClick={() => setShowOpenModal(true)}>
                    <Unlock className="h-4 w-4 mr-2" />
                    Abrir Caja
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Register info */}
                <Card className={isOpen ? "border-emerald-500/30 bg-emerald-500/5" : ""}>
                  <CardContent className="px-3 py-2 sm:p-4">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                        <div className={`h-8 w-8 sm:h-10 sm:w-10 rounded-full flex items-center justify-center shrink-0 ${isOpen ? "bg-emerald-500/10" : "bg-muted"}`}>
                          {isOpen ? (
                            <Unlock className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-500" />
                          ) : (
                            <LockKeyhole className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-[16px] sm:text-base">
                            {isOpen ? "Caja abierta" : "Caja cerrada"}
                          </p>
                          <p className="text-[13px] sm:text-xs text-muted-foreground">
                            Abierta a las {formatTime(currentRegister.openedAt)} por{" "}
                            {currentRegister.openedBy}
                            {currentRegister.closedAt &&
                              ` | Cerrada a las ${formatTime(currentRegister.closedAt)} por ${currentRegister.closedBy}`}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-[13px] sm:text-xs text-muted-foreground">Monto inicial</p>
                        <p className="font-bold text-[16px] sm:text-base">{formatCurrency(currentRegister.initialAmount)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Stats */}
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-1.5 sm:gap-4">
                  <Card>
                    <CardContent className="px-2.5 py-1 sm:p-4 text-center sm:text-left">
                      <div className="flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 mb-0.5 sm:mb-1">
                        <DollarSign className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-emerald-500 shrink-0" />
                        <span className="text-[13px] sm:text-xs text-muted-foreground truncate">Venta total</span>
                      </div>
                      <p className="text-[16px] sm:text-xl font-bold tabular-nums">{formatCurrency(todayStats.total)}</p>
                      <p className="text-[12px] sm:text-xs text-muted-foreground">{todayStats.count} ventas</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="px-2.5 py-1 sm:p-4 text-center sm:text-left">
                      <div className="flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 mb-0.5 sm:mb-1">
                        <Banknote className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-green-500 shrink-0" />
                        <span className="text-[13px] sm:text-xs text-muted-foreground truncate">Efectivo</span>
                      </div>
                      <p className="text-[16px] sm:text-xl font-bold tabular-nums">{formatCurrency(todayStats.efectivoTotal)}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="px-2.5 py-1 sm:p-4 text-center sm:text-left">
                      <div className="flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 mb-0.5 sm:mb-1">
                        <ArrowUpRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-violet-500 shrink-0" />
                        <span className="text-[13px] sm:text-xs text-muted-foreground truncate">Transferencia</span>
                      </div>
                      <p className="text-[16px] sm:text-xl font-bold tabular-nums">{formatCurrency(todayStats.transferTotal)}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="px-2.5 py-1 sm:p-4 text-center sm:text-left">
                      <div className="flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 mb-0.5 sm:mb-1">
                        <CreditCard className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-500 shrink-0" />
                        <span className="text-[13px] sm:text-xs text-muted-foreground truncate">Cta. Corriente</span>
                      </div>
                      <p className="text-[16px] sm:text-xl font-bold tabular-nums">{formatCurrency(todayStats.creditTotal)}</p>
                    </CardContent>
                  </Card>
                  <Card className="col-span-2 lg:col-span-1">
                    <CardContent className="px-2.5 py-1 sm:p-4 text-center sm:text-left">
                      <div className="flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 mb-0.5 sm:mb-1">
                        <Banknote className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-amber-500 shrink-0" />
                        <span className="text-[13px] sm:text-xs text-muted-foreground truncate">Efectivo esperado</span>
                      </div>
                      <p className="text-[16px] sm:text-xl font-bold tabular-nums">{formatCurrency(expectedCash)}</p>
                      <p className="text-[12px] sm:text-xs text-muted-foreground">
                        Inicial + efectivo - comisiones
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Pérdidas por roturas */}
                {todayStats.lossCount > 0 && (
                  <Card className="border-red-500/30 bg-red-500/5">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-red-500" />
                          <span className="text-sm font-semibold text-red-700">Pérdidas por roturas</span>
                        </div>
                        <span className="text-lg font-bold text-red-600">-{formatCurrency(todayStats.lossTotal)}</span>
                      </div>
                      <div className="space-y-1.5">
                        {losses.map((l) => (
                          <div key={l.id} className="flex items-center justify-between text-xs">
                            <span className="text-red-600/80 truncate flex-1 mr-2">{l.description}</span>
                            <span className="text-red-600 font-medium shrink-0">-{formatCurrency(l.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Pagos de comisiones */}
                {todayStats.comisionesCount > 0 && (
                  <Card className="border-orange-500/30 bg-orange-500/5">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <ArrowDownRight className="h-4 w-4 text-orange-500" />
                          <span className="text-sm font-semibold text-orange-700">Pagos de comisiones</span>
                        </div>
                        <span className="text-lg font-bold text-orange-600">-{formatCurrency(todayStats.comisionesTotal)}</span>
                      </div>
                      <div className="space-y-1.5">
                        {pagosComisiones.map((p) => (
                          <div key={p.id} className="flex items-center justify-between text-xs">
                            <span className="text-orange-600/80 truncate flex-1 mr-2">{p.sellerName}</span>
                            <span className="text-orange-600 font-medium shrink-0">-{formatCurrency(p.monto)}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Closed register summary */}
                {isClosed && currentRegister.difference !== undefined && (
                  <Card className={currentRegister.difference === 0 ? "border-emerald-500/30" : currentRegister.difference > 0 ? "border-blue-500/30" : "border-red-500/30"}>
                    <CardContent className="p-4">
                      <h3 className="font-semibold mb-3">Resultado del cierre</h3>
                      <div className="grid grid-cols-3 gap-4 text-center">
                        <div>
                          <p className="text-xs text-muted-foreground">Esperado</p>
                          <p className="font-bold">{formatCurrency(currentRegister.expectedAmount || 0)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Contado</p>
                          <p className="font-bold">{formatCurrency(currentRegister.finalAmount || 0)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Diferencia</p>
                          <p className={`font-bold flex items-center justify-center gap-1 ${currentRegister.difference === 0 ? "text-emerald-600" : currentRegister.difference > 0 ? "text-blue-600" : "text-red-600"}`}>
                            {currentRegister.difference === 0 ? (
                              <CheckCircle2 className="h-4 w-4" />
                            ) : currentRegister.difference > 0 ? (
                              <ArrowUpRight className="h-4 w-4" />
                            ) : (
                              <ArrowDownRight className="h-4 w-4" />
                            )}
                            {formatCurrency(currentRegister.difference)}
                          </p>
                        </div>
                      </div>
                      {currentRegister.notes && (
                        <p className="text-sm text-muted-foreground mt-3 border-t pt-2">
                          {currentRegister.notes}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Today's sales */}
                <Card>
                  <CardHeader className="pb-3">
                    {vendedoresEnCaja.length > 1 && (
                      <select
                        className="mb-2 h-9 w-full rounded-2xl border border-input bg-background px-3 text-sm"
                        value={filtroVendedorCaja}
                        onChange={(e) => setFiltroVendedorCaja(e.target.value)}
                      >
                        <option value="all">Todos los vendedores</option>
                        {vendedoresEnCaja.map((v) => (
                          <option key={v.id} value={v.id}>{v.name}</option>
                        ))}
                      </select>
                    )}
                    <CardTitle className="text-base">
                      Ventas del dia ({salesFiltradas.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {sales.length === 0 && rejectedOrders.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        No hay ventas hoy
                      </p>
                    ) : (
                      <>
                        {salesFiltradas.length === 0 && (
                          <p className="text-sm text-muted-foreground text-center py-4">
                            No hay ventas de este vendedor
                          </p>
                        )}

                        {/* MOBILE: tabla 2 filas */}
                        <div className="sm:hidden rounded-xl border divide-y overflow-hidden" style={{ fontSize: '12px' }}>
                          {/* Encabezado de columnas */}
                          <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_6.5rem] gap-x-2 px-2.5 py-1.5 bg-muted/50 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            <span>Cliente</span>
                            <span className="text-center">Pago</span>
                            <span className="text-right">Total</span>
                          </div>
                          {salesFiltradas.map((sale) => {
                            const paymentLabel = sale.paymentType === "cash"
                              ? ((sale as any).paymentMethod === "transferencia" ? "Transferencia" : "Efectivo")
                              : sale.paymentType === "credit" ? "Cta.Cte." : "Mixto";
                            const badgeClass = sale.paymentType === "cash"
                              ? ((sale as any).paymentMethod === "transferencia" ? "bg-violet-100 text-violet-800" : "bg-green-100 text-green-800")
                              : sale.paymentType === "credit" ? "bg-blue-100 text-blue-800" : "bg-amber-100 text-amber-800";
                            return (
                              <div key={sale.id} className="p-2.5">
                                <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_6.5rem] gap-x-2 items-center leading-tight">
                                  {/* Col 1: cliente / n° venta */}
                                  <div className="min-w-0">
                                    <p className="font-medium text-xs truncate">{sale.clientName || "Consumidor Final"}</p>
                                    {sale.saleNumber && <p className="text-xs text-muted-foreground truncate">{sale.saleNumber}</p>}
                                  </div>
                                  {/* Col 2: forma de pago / fecha */}
                                  <div className="text-center">
                                    <div className="flex items-center justify-center gap-1">
                                      {(sale as any).comprobanteTransferencia && (
                                        <button
                                          type="button"
                                          onClick={() => setComprobanteUrl((sale as any).comprobanteTransferencia)}
                                          className="text-violet-600 hover:text-violet-800"
                                          title="Ver comprobante de transferencia"
                                        >
                                          <Receipt className="h-3.5 w-3.5" />
                                        </button>
                                      )}
                                      <Badge className={`text-[10px] border-0 ${badgeClass}`}>{paymentLabel}</Badge>
                                    </div>
                                    <p className="text-xs text-muted-foreground">{formatDateShort(new Date(sale.createdAt))}</p>
                                  </div>
                                  {/* Col 3: total / vendedor */}
                                  <div className="text-right">
                                    <p className="font-semibold text-xs tabular-nums">{formatCurrency(sale.total || 0)}</p>
                                    <p className="text-xs text-muted-foreground truncate">{sale.sellerName || "—"}</p>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                          {rejectedOrders.map((o) => (
                            <div key={o.id} className="p-2.5">
                              <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_6.5rem] gap-x-2 items-center leading-tight">
                                <div className="min-w-0">
                                  <p className="font-medium text-xs truncate">{o.clientName || "Consumidor Final"}</p>
                                  {o.remitoNumber && <p className="text-xs text-muted-foreground truncate">{o.remitoNumber}</p>}
                                </div>
                                <div className="text-center">
                                  <Badge className="text-[10px] border-0 bg-red-100 text-red-700">Rechazado</Badge>
                                  <p className="text-xs text-muted-foreground">{formatDateShort(new Date(o.date))}</p>
                                </div>
                                <div className="text-right" />
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* DESKTOP: lista en una línea */}
                        <div className="hidden sm:block space-y-1">
                        {salesFiltradas.map((sale) => {
                          const paymentLabel = sale.paymentType === "cash"
                            ? ((sale as any).paymentMethod === "transferencia" ? "Transferencia" : "Efectivo")
                            : sale.paymentType === "credit"
                              ? "Cta.Cte."
                              : "Mixto";
                          const badgeClass = sale.paymentType === "cash"
                            ? ((sale as any).paymentMethod === "transferencia"
                              ? "bg-violet-100 text-violet-800"
                              : "bg-green-100 text-green-800")
                            : sale.paymentType === "credit"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-amber-100 text-amber-800";
                          return (
                            <div
                              key={sale.id}
                              className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0 gap-2"
                            >
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span className="text-sm font-medium truncate">
                                  {sale.clientName || "Consumidor Final"}
                                </span>
                                {sale.saleNumber && (
                                  <span className="text-xs text-muted-foreground shrink-0">
                                    #{sale.saleNumber}
                                  </span>
                                )}
                                <span className="text-xs text-muted-foreground shrink-0">
                                  {formatTimeStr(new Date(sale.createdAt))}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {(sale as any).comprobanteTransferencia && (
                                  <button
                                    type="button"
                                    onClick={() => setComprobanteUrl((sale as any).comprobanteTransferencia)}
                                    className="text-violet-600 hover:text-violet-800"
                                    title="Ver comprobante de transferencia"
                                  >
                                    <Receipt className="h-4 w-4" />
                                  </button>
                                )}
                                <Badge className={`text-[10px] border-0 ${badgeClass}`}>
                                  {paymentLabel}
                                </Badge>
                                <span className="text-sm font-semibold text-right tabular-nums">
                                  {formatCurrency(sale.total || 0)}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                        {rejectedOrders.map((o) => (
                          <div
                            key={o.id}
                            className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0 gap-2"
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <span className="text-sm font-medium truncate">
                                {o.clientName || "Consumidor Final"}
                              </span>
                              {o.remitoNumber && (
                                <span className="text-xs text-muted-foreground shrink-0">
                                  {o.remitoNumber}
                                </span>
                              )}
                              <span className="text-xs text-muted-foreground shrink-0">
                                {formatTimeStr(new Date(o.date))}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Badge className="text-[10px] border-0 bg-red-100 text-red-700">
                                Rechazado
                              </Badge>
                            </div>
                          </div>
                        ))}
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* ═══ TAB HISTORIAL ═══ */}
          <TabsContent value="historial" className="space-y-4 mt-4">
            {/* Barra de búsqueda */}
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full sm:w-auto justify-start text-left font-normal">
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    {searchDate ? formatDateShort(searchDate) : "Buscar por fecha"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={searchDate}
                    onSelect={(date) => {
                      setSearchDate(date);
                      setCalendarOpen(false);
                      setHistorialPage(0);
                      loadHistorial(date, 0);
                    }}
                    disabled={(date) => date > new Date()}
                  />
                </PopoverContent>
              </Popover>
              {searchDate && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearchDate(undefined);
                    setHistorialPage(0);
                    loadHistorial(undefined, 0);
                  }}
                >
                  Limpiar filtro
                </Button>
              )}
            </div>

            {/* Detalle de caja seleccionada */}
            {selectedHistorial && (
              <Card className="border-teal-500/30 bg-teal-500/5">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">
                      Caja del {formatDateShort(selectedHistorial.openedAt)}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownloadHistorialPdf(selectedHistorial)}
                        disabled={generatingHistorialPdf === selectedHistorial.id}
                      >
                        {generatingHistorialPdf === selectedHistorial.id ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <FileText className="h-4 w-4 mr-2" />
                        )}
                        PDF
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => { setSelectedHistorial(null); setSelectedSales([]); }}>
                        Cerrar
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {detailLoading ? (
                    <div className="space-y-2">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="h-8 w-full" />
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Info */}
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">Monto inicial</p>
                          <p className="font-bold">{formatCurrency(selectedHistorial.initialAmount)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Venta total</p>
                          <p className="font-bold">{formatCurrency(selectedHistorial.totalSales || 0)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Efectivo</p>
                          <p className="font-bold">{formatCurrency(selectedHistorial.cashTotal || 0)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Transferencia</p>
                          <p className="font-bold">{formatCurrency(selectedHistorial.transferTotal || 0)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Cta. Corriente</p>
                          <p className="font-bold">{formatCurrency(selectedHistorial.creditTotal || 0)}</p>
                        </div>
                      </div>

                      {/* Cierre */}
                      {selectedHistorial.status === "closed" && selectedHistorial.difference != null && (
                        <div className="grid grid-cols-3 gap-3 text-sm p-3 rounded-lg bg-muted/50">
                          <div>
                            <p className="text-xs text-muted-foreground">Esperado</p>
                            <p className="font-bold">{formatCurrency(selectedHistorial.expectedAmount || 0)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Contado</p>
                            <p className="font-bold">{formatCurrency(selectedHistorial.finalAmount || 0)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Diferencia</p>
                            <p className={`font-bold ${selectedHistorial.difference === 0 ? "text-emerald-600" : selectedHistorial.difference > 0 ? "text-blue-600" : "text-red-600"}`}>
                              {formatCurrency(selectedHistorial.difference)}
                            </p>
                          </div>
                        </div>
                      )}

                      {selectedHistorial.notes && (
                        <p className="text-sm text-muted-foreground italic">
                          Notas: {selectedHistorial.notes}
                        </p>
                      )}

                      {/* Ventas del día */}
                      {selectedSales.length > 0 && (
                        <div>
                          <p className="text-sm font-medium mb-2">Ventas ({selectedSales.length})</p>
                          <div className="space-y-1 max-h-60 overflow-y-auto">
                            {selectedSales.map((sale) => {
                              const paymentLabel = sale.paymentType === "cash"
                                ? ((sale as any).paymentMethod === "transferencia" ? "Transf." : "Efectivo")
                                : sale.paymentType === "credit" ? "Cta.Cte." : "Mixto";
                              const badgeClass = sale.paymentType === "cash"
                                ? ((sale as any).paymentMethod === "transferencia"
                                  ? "bg-violet-100 text-violet-800"
                                  : "bg-green-100 text-green-800")
                                : sale.paymentType === "credit"
                                  ? "bg-blue-100 text-blue-800"
                                  : "bg-amber-100 text-amber-800";
                              return (
                                <div key={sale.id} className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0 text-sm gap-2">
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <span className="font-medium truncate">{sale.clientName || "Cons. Final"}</span>
                                    {sale.saleNumber && (
                                      <span className="text-xs text-muted-foreground shrink-0">#{sale.saleNumber}</span>
                                    )}
                                    {(sale as any).hojaRutaNumber && (
                                      <span className="text-xs text-teal-600 font-medium shrink-0">HR {(sale as any).hojaRutaNumber}</span>
                                    )}
                                    <span className="text-xs text-muted-foreground shrink-0">{formatTimeStr(new Date(sale.createdAt))}</span>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    {(sale as any).comprobanteTransferencia && (
                                      <button
                                        type="button"
                                        onClick={() => setComprobanteUrl((sale as any).comprobanteTransferencia)}
                                        className="text-violet-600 hover:text-violet-800"
                                        title="Ver comprobante de transferencia"
                                      >
                                        <Receipt className="h-4 w-4" />
                                      </button>
                                    )}
                                    <Badge className={`text-[10px] border-0 ${badgeClass}`}>
                                      {paymentLabel}
                                    </Badge>
                                    <span className="font-semibold text-right tabular-nums">{formatCurrency(sale.total || 0)}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {selectedRejected.length > 0 && (
                        <div>
                          <p className="text-sm font-medium mb-2">Rechazados ({selectedRejected.length})</p>
                          <div className="space-y-1 max-h-60 overflow-y-auto">
                            {selectedRejected.map((o) => (
                              <div key={o.id} className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0 text-sm gap-2">
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <span className="font-medium truncate">{o.clientName || "Cons. Final"}</span>
                                  {o.remitoNumber && (
                                    <span className="text-xs text-muted-foreground shrink-0">{o.remitoNumber}</span>
                                  )}
                                  <span className="text-xs text-muted-foreground shrink-0">{formatTimeStr(new Date(o.date))}</span>
                                </div>
                                <Badge className="text-[10px] border-0 bg-red-100 text-red-700 shrink-0">Rechazado</Badge>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Lista de cajas históricas */}
            {historialLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="border border-border rounded-2xl p-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1.5">
                        <Skeleton className="h-5 w-40" />
                        <Skeleton className="h-3 w-56" />
                      </div>
                      <Skeleton className="h-8 w-20" />
                    </div>
                  </div>
                ))}
              </div>
            ) : historialRegisters.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <Search className="h-10 w-10 text-muted-foreground mb-3" />
                  <p className="text-muted-foreground text-sm">
                    {searchDate ? "No hay cajas para esa fecha" : "No hay cajas anteriores"}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="space-y-3">
                  {historialRegisters.map((reg) => (
                    <Card
                      key={reg.id}
                      className={`cursor-pointer transition-colors hover:border-teal-500/40 ${selectedHistorial?.id === reg.id ? "border-teal-500/50 bg-teal-500/5" : ""}`}
                      onClick={() => loadHistorialDetail(reg)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-3">
                            <div className={`h-9 w-9 rounded-full flex items-center justify-center ${reg.status === "closed" ? "bg-muted" : "bg-amber-500/10"}`}>
                              {reg.status === "closed" ? (
                                <LockKeyhole className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <Unlock className="h-4 w-4 text-amber-500" />
                              )}
                            </div>
                            <div>
                              <p className="font-semibold text-sm">
                                {formatDateShort(reg.openedAt)}
                                <span className="text-muted-foreground font-normal ml-2">
                                  {reg.openedBy}
                                </span>
                              </p>
                              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                                <span>Ventas: {reg.salesCount ?? "?"}</span>
                                <span>Total: {formatCurrency(reg.totalSales || 0)}</span>
                                {reg.difference != null && (
                                  <span className={reg.difference === 0 ? "text-emerald-600" : reg.difference > 0 ? "text-blue-600" : "text-red-600"}>
                                    Dif: {formatCurrency(reg.difference)}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDownloadHistorialPdf(reg);
                              }}
                              disabled={generatingHistorialPdf === reg.id}
                            >
                              {generatingHistorialPdf === reg.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <FileText className="h-3.5 w-3.5" />
                              )}
                            </Button>
                            {reg.status === "open" && (
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  setClosingRegister(reg);
                                  // Cargar ventas del día de esa caja
                                  const cajaDate = new Date(reg.openedAt);
                                  cajaDate.setHours(0, 0, 0, 0);
                                  const nextDay = new Date(cajaDate);
                                  nextDay.setDate(nextDay.getDate() + 1);
                                  const salesData = await salesApi.getAll();
                                  const cajaSales = salesData.filter((s) => {
                                    const d = new Date(s.createdAt);
                                    return d >= cajaDate && d < nextDay;
                                  });
                                  setClosingSales(cajaSales);
                                  setShowCloseModal(true);
                                }}
                              >
                                <LockKeyhole className="h-3.5 w-3.5 mr-1" />
                                Cerrar
                              </Button>
                            )}
                            <Badge variant={reg.status === "closed" ? "secondary" : "default"} className="text-[10px]">
                              {reg.status === "closed" ? "Cerrada" : "Abierta"}
                            </Badge>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Paginación */}
                <div className="flex items-center justify-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={historialPage === 0}
                    onClick={() => {
                      const p = historialPage - 1;
                      setHistorialPage(p);
                      loadHistorial(searchDate, p);
                    }}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Página {historialPage + 1}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={historialRegisters.length < HISTORIAL_PAGE_SIZE}
                    onClick={() => {
                      const p = historialPage + 1;
                      setHistorialPage(p);
                      loadHistorial(searchDate, p);
                    }}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>

        {/* Open Register Modal */}
        <Dialog open={showOpenModal} onOpenChange={setShowOpenModal}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Abrir Caja</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  Monto inicial en caja
                </label>
                <Input
                  type="number"
                  placeholder="0"
                  value={initialAmount}
                  onChange={(e) => setInitialAmount(e.target.value)}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Ingresa el monto con el que arranca la caja hoy
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowOpenModal(false)}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleOpenRegister}
                disabled={!initialAmount || saving}
              >
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Abrir Caja
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Close Register Modal */}
        <Dialog open={showCloseModal} onOpenChange={setShowCloseModal}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Cerrar Caja</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="p-3 bg-muted/50 rounded-lg space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Monto inicial</span>
                  <span className="font-medium">{formatCurrency(closingRegisterData?.initialAmount || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Ventas efectivo</span>
                  <span className="font-medium">{formatCurrency(closingStats.efectivoTotal)}</span>
                </div>
                {closingStats.transferTotal > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Transferencias (no entra en caja)</span>
                    <span className="font-medium text-muted-foreground">{formatCurrency(closingStats.transferTotal)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-1.5">
                  <span className="font-medium">Esperado en caja</span>
                  <span className="font-bold">{formatCurrency(closingExpectedCash)}</span>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  Monto contado en caja
                </label>
                <Input
                  type="number"
                  placeholder="0"
                  value={finalAmount}
                  onChange={(e) => setFinalAmount(e.target.value)}
                  autoFocus
                />
              </div>
              {finalAmount && (
                <div className={`p-3 rounded-lg text-sm font-medium ${parseFloat(finalAmount) - closingExpectedCash === 0 ? "bg-emerald-500/10 text-emerald-700" : parseFloat(finalAmount) - closingExpectedCash > 0 ? "bg-blue-500/10 text-blue-700" : "bg-red-500/10 text-red-700"}`}>
                  Diferencia: {formatCurrency(parseFloat(finalAmount) - closingExpectedCash)}
                  {parseFloat(finalAmount) - closingExpectedCash === 0 && " - Cuadra perfecto"}
                  {parseFloat(finalAmount) - closingExpectedCash > 0 && " - Sobrante"}
                  {parseFloat(finalAmount) - closingExpectedCash < 0 && " - Faltante"}
                </div>
              )}
              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  Notas (opcional)
                </label>
                <Input
                  placeholder="Observaciones del cierre..."
                  value={closeNotes}
                  onChange={(e) => setCloseNotes(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => { setShowCloseModal(false); setClosingRegister(null); setClosingSales(null); }}
              >
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={handleCloseRegister}
                disabled={!finalAmount || saving}
              >
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Cerrar Caja
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Visor de comprobante de transferencia */}
        <Dialog open={!!comprobanteUrl} onOpenChange={(open) => !open && setComprobanteUrl(null)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Receipt className="h-4 w-4 text-violet-600" />
                Comprobante de transferencia
              </DialogTitle>
            </DialogHeader>
            {comprobanteUrl && (
              <div className="space-y-3">
                <img
                  src={comprobanteUrl}
                  alt="Comprobante de transferencia"
                  className="w-full max-h-[70vh] object-contain rounded-lg border border-border bg-muted/30"
                />
                <a
                  href={comprobanteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-violet-600 hover:underline"
                >
                  Abrir en pestaña nueva
                </a>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
