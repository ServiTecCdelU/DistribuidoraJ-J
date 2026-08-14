// components/ListaVentas.tsx
"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTableSkeleton } from "@/components/ui/data-table-skeleton";
import {
  Search,
  ShoppingBag,
  User,
  X,
  Calendar,
  Banknote,
  CreditCard,
  Sparkles,
  ArrowLeftRight,
  Receipt,
  Eye,
  Plus,
  Store,
  MapPin,
  Truck,
  Download,
  FileSpreadsheet,
  Filter,
  Tag,
  FileText,
  TrendingUp,
  TrendingDown,
  RotateCcw,
} from "lucide-react";
import Link from "next/link";
import type { ListaVentasProps } from "../types";
import { formatDate, formatTime, formatCurrency } from "@/lib/utils/format";
import { incidenciasVenta } from "@/lib/utils/incidencias";
import { toDate } from "@/services/supabase-helpers";
import { toast } from "sonner";
import { useMemo, useState, useCallback, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

// ─── helpers ─────────────────────────────────────────────────────────────────

const payIcon = (pt: string, pm?: string) => {
  if (pt === "cash" && pm === "transferencia") return <ArrowLeftRight className="h-3.5 w-3.5" />;
  if (pt === "cash") return <Banknote className="h-3.5 w-3.5" />;
  if (pt === "credit") return <CreditCard className="h-3.5 w-3.5" />;
  if (pt === "mixed") return <Sparkles className="h-3.5 w-3.5" />;
  return null;
};

const payLabel = (pt: string, pm?: string) => {
  if (pt === "cash" && pm === "transferencia") return "Transferencia";
  if (pt === "cash") return "Efectivo";
  if (pt === "credit") return "Cta. Corriente";
  if (pt === "mixed") return "Mixto";
  return pt;
};

const payBadgeCls = (pt: string, pm?: string) => {
  if (pt === "cash" && pm === "transferencia") return "bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-400 dark:border-violet-800";
  if (pt === "cash") return "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800";
  if (pt === "credit") return "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800";
  if (pt === "mixed") return "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800";
  return "";
};

// Pérdida (rotura), faltante y rechazo (no_quiso) de una venta.
const calcIncidencia = (venta: any) => incidenciasVenta((venta as any)?.itemsNoEntregados);

const periodLabels: Record<string, string> = {
  all: "Todas",
  today: "Hoy",
  week: "Esta semana",
  month: "Este mes",
  year: "Este año",
  custom: "Personalizado",
};

const safeGetDate = (date: unknown): Date | null => {
  if (!date) return null;
  try {
    const d = toDate(date);
    return isNaN(d.getTime()) || d.getTime() === 0 ? null : d;
  } catch { return null; }
};

const EMPTY_FILTROS = {
  searchQuery: "",
  paymentFilter: "all",
  invoiceFilter: "all",
  remitoFilter: "all",
  discountFilter: "all",
  periodFilter: "all",
  dateFrom: "",
  dateTo: "",
  clientId: "",
  sellerId: "",
  city: "",
  deliveryFilter: "all",
  rejectedFilter: "all",
} as const;

// ─── componente principal ─────────────────────────────────────────────────────

export function ListaVentas({
  ventas,
  cargando,
  filtros,
  onCambiarFiltros,
  onVerDetalle,
  onEmitirDocumento,
  clients = [],
  sellers = [],
  isAdmin = false,
  onExportData,
  devolucionesPorVenta = {},
  descuentosPorVenta = {},
}: ListaVentasProps) {
  const {
    searchQuery, invoiceFilter, paymentFilter, periodFilter, dateFrom, dateTo,
    clientId, sellerId, city,
  } = filtros;
  const deliveryFilter = (filtros as any).deliveryFilter || "all";
  const remitoFilter = (filtros as any).remitoFilter || "all";
  const discountFilter = (filtros as any).discountFilter || "all";
  const rejectedFilter = (filtros as any).rejectedFilter || "all";

  const fmt = formatCurrency;
  const fmtDate = formatDate;
  const fmtTime = formatTime;

  const [incidenciaModal, setIncidenciaModal] = useState<"perdida" | "rechazo" | "nc" | null>(null);


  const uniqueCities = useMemo(() => {
    const cities = clients.map((c) => c.city).filter((c): c is string => !!c);
    return [...new Set(cities)].sort();
  }, [clients]);

  // ─── conteo de filtros activos ─────────────────────────────���───────────────
  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (paymentFilter !== "all") n++;
    if (invoiceFilter !== "all") n++;
    if (remitoFilter !== "all") n++;
    if (discountFilter !== "all") n++;
    if (periodFilter !== "all") n++;
    if (dateFrom) n++;
    if (dateTo) n++;
    if (sellerId) n++;
    if (city) n++;
    if (deliveryFilter !== "all") n++;
    if (rejectedFilter !== "all") n++;
    return n;
  }, [paymentFilter, invoiceFilter, remitoFilter, discountFilter, periodFilter, dateFrom, dateTo, sellerId, city, deliveryFilter, rejectedFilter]);

  const hayFiltrosActivos = !!(searchQuery || activeFilterCount > 0);

  // ─── resumen (cards) ────────────────────────────────────────────────────────
  // Suma sobre lo que está mostrado (ya filtrado por fecha/período y demás filtros).
  const resumen = useMemo(() => {
    let total = 0, count = 0, perdida = 0, faltante = 0, rechazo = 0, nc = 0, desc = 0;
    for (const v of ventas as any[]) {
      if (v.rechazado) continue; // pedido rechazado sin monto
      total += Number(v.total) || 0;
      count++;
      const inc = incidenciasVenta(v.itemsNoEntregados);
      perdida += inc.perdida;
      faltante += inc.faltante;
      rechazo += inc.rechazo;
      nc += devolucionesPorVenta[v.id] || 0;
      desc += descuentosPorVenta[v.id] || 0;
    }
    return { total, count, perdida, faltante, rechazo, nc, desc };
  }, [ventas, devolucionesPorVenta, descuentosPorVenta]);

  // Lista de ventas para el modal de incidencias (pérdidas / rechazos / notas de crédito)
  const incidenciaLista = useMemo(() => {
    if (!incidenciaModal) return [];
    const rows: { id: string; cliente: string; ref: string; fecha: any; monto: number; detalle?: string }[] = [];
    for (const v of ventas as any[]) {
      const inc = incidenciasVenta(v.itemsNoEntregados);
      let monto = 0;
      let detalle = "";
      if (incidenciaModal === "perdida") {
        monto = inc.perdida + inc.faltante;
        detalle = `Rotura ${fmt(inc.perdida)} · Faltante ${fmt(inc.faltante)}`;
      } else if (incidenciaModal === "rechazo") {
        monto = inc.rechazo;
      } else {
        const dev = devolucionesPorVenta[v.id] || 0;
        const dto = descuentosPorVenta[v.id] || 0;
        monto = dev + dto;
        detalle = [dev > 0.005 ? `Devolución ${fmt(dev)}` : "", dto > 0.005 ? `Descuentos ${fmt(dto)}` : ""]
          .filter(Boolean)
          .join(" · ");
      }
      if (monto > 0.005) {
        rows.push({
          id: v.id,
          cliente: v.clientName || "Venta directa",
          ref: v.saleNumber || v.remitoNumber || v.id,
          fecha: v.createdAt,
          monto,
          detalle: detalle || undefined,
        });
      }
    }
    return rows.sort((a, b) => b.monto - a.monto);
  }, [incidenciaModal, ventas, devolucionesPorVenta, descuentosPorVenta]);

  const incidenciaMeta = {
    perdida: { titulo: "Ventas con pérdidas", color: "text-rose-600" },
    rechazo: { titulo: "Ventas con rechazos", color: "text-amber-600" },
    nc: { titulo: "Ventas con notas de crédito y descuentos", color: "text-violet-600" },
  } as const;

  const resumenLabel = useMemo(() => {
    if (searchQuery) return "Resultados de búsqueda";
    if (dateFrom || dateTo) return `${dateFrom || "inicio"} a ${dateTo || "hoy"}`;
    return periodLabels[periodFilter] || "Todas";
  }, [searchQuery, dateFrom, dateTo, periodFilter]);

  // ─── paginación ───────────────────────────────────────────────────────────
  const [pageSize, setPageSize] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.ceil(ventas.length / pageSize);
  const ventasPaginadas = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return ventas.slice(start, start + pageSize);
  }, [ventas, currentPage, pageSize]);
  useMemo(() => { setCurrentPage(1); }, [ventas.length]);

  // Panel de filtros oculto por defecto; se muestra con el botón "Filtros".
  const [filtrosVisibles, setFiltrosVisibles] = useState(false);

  // ─── período: modo del desplegable ────────────────────────────────────────
  // Los modos "day", "specificMonth" y "custom" se traducen a periodFilter="custom"
  // con dateFrom/dateTo; el resto son valores directos de periodFilter.
  const [periodMode, setPeriodMode] = useState<string>(periodFilter === "custom" ? "custom" : periodFilter);
  useEffect(() => {
    if (periodFilter !== "custom") setPeriodMode(periodFilter);
    else setPeriodMode((m) => (["day", "specificMonth", "custom"].includes(m) ? m : "custom"));
  }, [periodFilter]);
  const cambiarPeriodo = (mode: string) => {
    setPeriodMode(mode);
    if (["all", "today", "week", "month", "year"].includes(mode)) {
      onCambiarFiltros({ periodFilter: mode as any, dateFrom: "", dateTo: "" });
    } else {
      onCambiarFiltros({ periodFilter: "custom", dateFrom: "", dateTo: "" });
    }
  };

  // Buscador: el texto se escribe en estado local y la búsqueda se dispara al presionar
  // Enter (o la lupa). Evita la consulta al servidor + re-render en cada tecla, que trababa
  // la escritura.
  const [localSearch, setLocalSearch] = useState(searchQuery);
  useEffect(() => { setLocalSearch(searchQuery); }, [searchQuery]);
  const ejecutarBusqueda = () => onCambiarFiltros({ searchQuery: localSearch.trim() });
  const limpiarBusqueda = () => { setLocalSearch(""); onCambiarFiltros({ searchQuery: "" }); };

  // ─── export Excel ─────────────────────────────────────────────────────────
  const [exportOpen, setExportOpen] = useState(false);
  const [exportPeriod, setExportPeriod] = useState("all");
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");

  const exportExcel = useCallback(async () => {
    // Trae las ventas del per\u00EDodo desde el servidor (no depende de lo cargado en
    // pantalla, que por defecto es solo hoy). Fallback al set en memoria si no se
    // provey\u00F3 onExportData.
    let ventasToExport: any[];
    if (onExportData) {
      try {
        ventasToExport = await onExportData(exportPeriod, exportFrom, exportTo);
      } catch {
        toast.error("No se pudieron traer las ventas para exportar");
        return;
      }
    } else {
      ventasToExport = [...ventas];
      if (exportPeriod !== "all" && exportPeriod !== "custom") {
        const now = new Date();
        ventasToExport = ventasToExport.filter((v) => {
          const d = safeGetDate(v.createdAt);
          if (!d) return false;
          if (exportPeriod === "today") { const t = new Date(now); t.setHours(0,0,0,0); return d >= t; }
          if (exportPeriod === "week") { const w = new Date(now); w.setDate(w.getDate()-7); w.setHours(0,0,0,0); return d >= w; }
          if (exportPeriod === "month") return d >= new Date(now.getFullYear(), now.getMonth(), 1);
          if (exportPeriod === "year") return d >= new Date(now.getFullYear(), 0, 1);
          return true;
        });
      }
      if (exportFrom) { const f = new Date(exportFrom); f.setHours(0,0,0,0); ventasToExport = ventasToExport.filter(v => { const d = safeGetDate(v.createdAt); return d && d >= f; }); }
      if (exportTo) { const t = new Date(exportTo); t.setHours(23,59,59,999); ventasToExport = ventasToExport.filter(v => { const d = safeGetDate(v.createdAt); return d && d <= t; }); }
    }

    if (ventasToExport.length === 0) { toast.error("No hay ventas en ese per\u00EDodo"); return; }

    const XLSX = (await import("xlsx-js-style")).default ?? (await import("xlsx-js-style"));

    const headers = ["N\u00B0 Venta", "Fecha", "Cliente", "Vendedor", "Total", "M\u00E9todo de Pago"];
    // Columna num\u00E9rica (0-based): Total=4. Columnas centradas: N\u00B0 Venta=0, Fecha=1
    const MONEY_COLS = new Set([4]);
    const CENTER_COLS = new Set([0, 1]);

    let totTotal = 0;
    const dataRows = ventasToExport.map((v: any) => {
      const d = safeGetDate(v.createdAt);
      const fecha = d ? `${d.getDate().toString().padStart(2,"0")}/${(d.getMonth()+1).toString().padStart(2,"0")}/${d.getFullYear()}` : "";
      const total = Number(v.total) || 0;
      const metodoPago = v.paymentType === "cash"
        ? (v.paymentMethod === "transferencia" ? "Transferencia" : "Efectivo")
        : v.paymentType === "credit" ? "Cta. Corriente" : "Mixto";
      totTotal += total;
      return [v.saleNumber || "\u2014", fecha, v.clientName || "Consumidor Final", v.sellerName || "\u2014", total, metodoPago];
    });

    const totalRow = ["TOTALES", "", "", "", totTotal, ""];
    const aoa = [headers, ...dataRows, totalRow];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const lastRow = aoa.length; // 1-based \u00EDndice de la fila de totales

    // Anchos de columna (un poco amplios para que no se pisen)
    ws["!cols"] = [
      { wch: 22 },  // N\u00B0 Venta
      { wch: 14 },  // Fecha
      { wch: 36 },  // Cliente
      { wch: 26 },  // Vendedor
      { wch: 18 },  // Total
      { wch: 22 },  // M\u00E9todo de Pago
    ];
    // Filtro + congelar encabezado
    ws["!autofilter"] = { ref: `A1:F${lastRow - 1}` };
    ws["!freeze"] = { xSplit: 0, ySplit: 1, topLeftCell: "A2", activePane: "bottomLeft", state: "frozen" } as any;

    const MONEY_FMT = '"$ "#,##0.00';
    const headerStyle = {
      font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11 },
      fill: { fgColor: { rgb: "0D9488" } },
      alignment: { horizontal: "center", vertical: "center" },
      border: { bottom: { style: "thin", color: { rgb: "0B7C72" } } },
    };
    const range = XLSX.utils.decode_range(ws["!ref"] as string);
    for (let R = range.s.r; R <= range.e.r; R++) {
      const isHeader = R === 0;
      const isTotal = R === lastRow - 1;
      for (let C = range.s.c; C <= range.e.c; C++) {
        const ref = XLSX.utils.encode_cell({ r: R, c: C });
        const cell = ws[ref];
        if (!cell) continue;
        if (isHeader) { cell.s = headerStyle; continue; }
        const money = MONEY_COLS.has(C);
        const base: any = {
          alignment: { horizontal: money ? "right" : CENTER_COLS.has(C) ? "center" : "left", vertical: "center" },
        };
        if (money) { cell.z = MONEY_FMT; }
        if (isTotal) {
          base.font = { bold: true };
          base.fill = { fgColor: { rgb: "F1F5F9" } };
          base.border = { top: { style: "thin", color: { rgb: "94A3B8" } } };
        }
        cell.s = base;
      }
    }
    // Alto del encabezado
    ws["!rows"] = [{ hpt: 22 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ventas");
    const fileName = `ventas_${exportPeriod === "custom" ? `${exportFrom||"inicio"}_a_${exportTo||"hoy"}` : exportPeriod}_${new Date().toISOString().slice(0,10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
    setExportOpen(false);
  }, [ventas, exportPeriod, exportFrom, exportTo, onExportData]);

  if (cargando) return <DataTableSkeleton columns={5} rows={8} />;

  // ─── render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-foreground">Historial de Ventas</h2>
          <p className="text-muted-foreground text-sm mt-1">
            {ventas.length} {ventas.length === 1 ? "venta registrada" : "ventas registradas"}
            {periodFilter === "today" && " hoy"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setExportOpen(true)}>
            <FileSpreadsheet className="h-4 w-4" />
            <span className="hidden sm:inline">Exportar Excel</span>
          </Button>
          <Button asChild className="gap-2 shadow-lg shadow-primary/20">
            <Link href="/ventas/nueva">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Nueva Venta</span>
            </Link>
          </Button>
        </div>
      </div>

      {/* ── CARDS RESUMEN ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <ResumenCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="Total de ventas"
          value={fmt(resumen.total)}
          sub={`${resumen.count} ${resumen.count === 1 ? "venta" : "ventas"} · ${resumenLabel}`}
          accent="teal"
          netoLabel="Neto (con incidencias)"
          netoValue={fmt(resumen.total - resumen.perdida - resumen.faltante - resumen.rechazo - resumen.nc - resumen.desc)}
        />
        <ResumenCard
          icon={<TrendingDown className="h-5 w-5" />}
          label="Pérdidas"
          value={`-${fmt(resumen.perdida + resumen.faltante)}`}
          sub={`Rotura ${fmt(resumen.perdida)} · Faltante ${fmt(resumen.faltante)}`}
          accent="rose"
          onVer={() => setIncidenciaModal("perdida")}
        />
        <ResumenCard
          icon={<RotateCcw className="h-5 w-5" />}
          label="Rechazos"
          value={`-${fmt(resumen.rechazo)}`}
          sub="Cliente no quiso"
          accent="amber"
          onVer={() => setIncidenciaModal("rechazo")}
        />
        <ResumenCard
          icon={<FileText className="h-5 w-5" />}
          label="Notas de crédito"
          value={`-${fmt(resumen.nc + resumen.desc)}`}
          sub={`Devoluciones ${fmt(resumen.nc)} · Descuentos ${fmt(resumen.desc)}`}
          accent="violet"
          onVer={() => setIncidenciaModal("nc")}
        />
      </div>

      {/* ── BARRA DE FILTROS ─────────────────────────────────────────────── */}
      <Card className="border-border/60 shadow-sm">
        <CardContent className="p-3 md:p-4">
          {/* Búsqueda + botón Filtros — siempre visibles */}
          <div className="flex gap-2">
            <div className="relative flex-1 min-w-0">
              <button type="button" onClick={ejecutarBusqueda} title="Buscar" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <Search className="h-4 w-4" />
              </button>
              <Input
                placeholder="Buscar por cliente, vendedor, producto, remito, hoja de ruta o N°... (Enter para buscar)"
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") ejecutarBusqueda(); }}
                className="pl-10 h-10 bg-background"
              />
              {localSearch && (
                <button onClick={limpiarBusqueda} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <Button
              variant={filtrosVisibles ? "default" : "outline"}
              className="h-10 gap-2 shrink-0 relative"
              onClick={() => setFiltrosVisibles((v) => !v)}
            >
              <Filter className="h-4 w-4" />
              Filtros
              {activeFilterCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </Button>
          </div>

          {/* Filtros inline — sin modal, todos desplegables hacia abajo */}
          {filtrosVisibles && (
          <div className="flex flex-wrap items-center gap-2 mt-3">
            {/* Período — modo (todas/hoy/semana/mes/año/día/mes específico/rango) + input según modo */}
            <Select value={periodMode} onValueChange={cambiarPeriodo}>
              <SelectTrigger className="h-9 w-[160px]">
                <Calendar className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" side="bottom" avoidCollisions={false}>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="today">Hoy</SelectItem>
                <SelectItem value="week">Esta semana</SelectItem>
                <SelectItem value="month">Este mes</SelectItem>
                <SelectItem value="year">Este año</SelectItem>
                <SelectItem value="day">Día específico</SelectItem>
                <SelectItem value="specificMonth">Mes específico</SelectItem>
                <SelectItem value="custom">Rango personalizado</SelectItem>
              </SelectContent>
            </Select>

            {periodMode === "day" && (
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => { const v = e.target.value; onCambiarFiltros({ periodFilter: "custom", dateFrom: v, dateTo: v }); }}
                className="h-9 w-[160px] bg-background"
              />
            )}

            {periodMode === "specificMonth" && (
              <Input
                type="month"
                value={dateFrom ? dateFrom.slice(0, 7) : ""}
                onChange={(e) => {
                  const ym = e.target.value;
                  if (!ym) { onCambiarFiltros({ periodFilter: "custom", dateFrom: "", dateTo: "" }); return; }
                  const [y, m] = ym.split("-").map(Number);
                  const last = new Date(y, m, 0).getDate();
                  onCambiarFiltros({ periodFilter: "custom", dateFrom: `${ym}-01`, dateTo: `${ym}-${String(last).padStart(2, "0")}` });
                }}
                className="h-9 w-[160px] bg-background"
              />
            )}

            {periodMode === "custom" && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">Desde</span>
                <Input type="date" value={dateFrom} onChange={(e) => onCambiarFiltros({ periodFilter: "custom", dateFrom: e.target.value })} className="h-9 w-[150px] bg-background" />
                <span className="text-xs font-medium text-muted-foreground">Hasta</span>
                <Input type="date" value={dateTo} onChange={(e) => onCambiarFiltros({ periodFilter: "custom", dateTo: e.target.value })} className="h-9 w-[150px] bg-background" />
              </div>
            )}

            {/* Método de pago */}
            <Select value={paymentFilter} onValueChange={(v) => onCambiarFiltros({ paymentFilter: v as any })}>
              <SelectTrigger className="h-9 w-[160px]">
                <Banknote className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" side="bottom" avoidCollisions={false}>
                <SelectItem value="all">Método de pago</SelectItem>
                <SelectItem value="efectivo">Efectivo</SelectItem>
                <SelectItem value="transferencia">Transferencia</SelectItem>
                <SelectItem value="credit">Cta. Corriente</SelectItem>
                <SelectItem value="mixed">Mixto</SelectItem>
              </SelectContent>
            </Select>

            {/* Remitos */}
            <Select value={remitoFilter} onValueChange={(v) => onCambiarFiltros({ remitoFilter: v } as any)}>
              <SelectTrigger className="h-9 w-[140px]">
                <Truck className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" side="bottom" avoidCollisions={false}>
                <SelectItem value="all">Remitos</SelectItem>
                <SelectItem value="emitted">Emitidos</SelectItem>
                <SelectItem value="pending">Pendientes</SelectItem>
              </SelectContent>
            </Select>

            {/* Descuento */}
            <Select value={discountFilter} onValueChange={(v) => onCambiarFiltros({ discountFilter: v } as any)}>
              <SelectTrigger className="h-9 w-[150px]">
                <Tag className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" side="bottom" avoidCollisions={false}>
                <SelectItem value="all">Descuento</SelectItem>
                <SelectItem value="with">Con descuento</SelectItem>
                <SelectItem value="without">Sin descuento</SelectItem>
              </SelectContent>
            </Select>

            {/* Método de entrega */}
            <Select value={deliveryFilter} onValueChange={(v) => onCambiarFiltros({ deliveryFilter: v } as any)}>
              <SelectTrigger className="h-9 w-[165px]">
                <MapPin className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" side="bottom" avoidCollisions={false}>
                <SelectItem value="all">Método de entrega</SelectItem>
                <SelectItem value="delivery">A domicilio</SelectItem>
                <SelectItem value="pickup">Retira en local</SelectItem>
              </SelectContent>
            </Select>

            {/* Rechazados */}
            <Select value={rejectedFilter} onValueChange={(v) => onCambiarFiltros({ rejectedFilter: v } as any)}>
              <SelectTrigger className="h-9 w-[160px]">
                <X className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" side="bottom" avoidCollisions={false}>
                <SelectItem value="all">Rechazados</SelectItem>
                <SelectItem value="only">Solo rechazados</SelectItem>
                <SelectItem value="exclude">Ocultar rechazados</SelectItem>
              </SelectContent>
            </Select>

            {/* Vendedor — solo admin */}
            {isAdmin && sellers.length > 0 && (
              <Select value={sellerId || "all-sellers"} onValueChange={(v) => onCambiarFiltros({ sellerId: v === "all-sellers" ? "" : v })}>
                <SelectTrigger className="h-9 w-[160px]">
                  <Store className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" side="bottom" avoidCollisions={false}>
                  <SelectItem value="all-sellers">Vendedor</SelectItem>
                  {sellers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}

            {/* Ciudad */}
            {uniqueCities.length > 0 && (
              <Select value={city || "all-cities"} onValueChange={(v) => onCambiarFiltros({ city: v === "all-cities" ? "" : v })}>
                <SelectTrigger className="h-9 w-[150px]">
                  <MapPin className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" side="bottom" avoidCollisions={false}>
                  <SelectItem value="all-cities">Ciudad</SelectItem>
                  {uniqueCities.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>
          )}

          {/* Chips de filtros activos */}
          {hayFiltrosActivos && (
            <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-border/50">
              <span className="text-xs text-muted-foreground">Filtros activos:</span>
              {searchQuery && <FilterChip label={`"${searchQuery}"`} onRemove={() => onCambiarFiltros({ searchQuery: "" })} />}
              {periodFilter !== "all" && periodFilter !== "custom" && <FilterChip label={periodLabels[periodFilter]} onRemove={() => onCambiarFiltros({ periodFilter: "all", dateFrom: "", dateTo: "" })} />}
              {dateFrom && <FilterChip label={`Desde: ${dateFrom}`} onRemove={() => onCambiarFiltros({ dateFrom: "" })} />}
              {dateTo && <FilterChip label={`Hasta: ${dateTo}`} onRemove={() => onCambiarFiltros({ dateTo: "" })} />}
              {sellerId && <FilterChip label={sellers.find(s => s.id === sellerId)?.name || "Vendedor"} onRemove={() => onCambiarFiltros({ sellerId: "" })} />}
              {city && <FilterChip label={city} onRemove={() => onCambiarFiltros({ city: "" })} />}
              {paymentFilter !== "all" && <FilterChip label={payLabel(paymentFilter)} onRemove={() => onCambiarFiltros({ paymentFilter: "all" })} />}
              {/* Chip boletas — deshabilitado temporalmente */}
              {remitoFilter !== "all" && <FilterChip label={remitoFilter === "emitted" ? "Remitos emitidos" : "Remitos pendientes"} onRemove={() => onCambiarFiltros({ remitoFilter: "all" } as any)} />}
              {discountFilter !== "all" && <FilterChip label={discountFilter === "with" ? "Con descuento" : "Sin descuento"} onRemove={() => onCambiarFiltros({ discountFilter: "all" } as any)} />}
              {deliveryFilter !== "all" && <FilterChip label={deliveryFilter === "delivery" ? "A domicilio" : "Retira en local"} onRemove={() => onCambiarFiltros({ deliveryFilter: "all" } as any)} />}
              {rejectedFilter !== "all" && <FilterChip label={rejectedFilter === "only" ? "Solo rechazados" : "Ocultar rechazados"} onRemove={() => onCambiarFiltros({ rejectedFilter: "all" } as any)} />}
              <button onClick={() => onCambiarFiltros({ ...EMPTY_FILTROS } as any)} className="text-xs text-primary hover:underline">
                Limpiar todos
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── LISTA DE VENTAS ──────────────────────────────────────────────── */}
      <Card className="border-border/60 shadow-sm">
        {ventas.length === 0 ? (
          <div className="p-12 text-center">
            <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
              <ShoppingBag className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">No se encontraron ventas</h3>
            <p className="text-muted-foreground text-sm">Intenta ajustar los filtros o busca con otros términos</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {/* Header desktop */}
            <div className="hidden md:grid grid-cols-12 gap-4 p-4 bg-muted text-xs font-semibold text-muted-foreground uppercase tracking-wider sticky top-0 z-20 border-b border-border/50 rounded-t-xl">
              <div className="col-span-2">Venta</div>
              <div className="col-span-2">Cliente</div>
              <div className="col-span-1 text-right">Pérdida</div>
              <div className="col-span-1 text-right">Faltante</div>
              <div className="col-span-1 text-right">Rechazo</div>
              <div className="col-span-1 text-right">N.C. / Desc.</div>
              <div className="col-span-2 text-right">Total</div>
              <div className="col-span-1 text-center">Pago</div>
              <div className="col-span-1 text-center">Acc.</div>
            </div>

            {ventasPaginadas.map((venta, index) => (
              <div key={venta.id} className="group flex flex-col md:grid md:grid-cols-12 gap-2 md:gap-4 p-3 md:p-4 hover:bg-muted/30 transition-colors">
                {/* Mobile row — compacto */}
                <div className="flex md:hidden items-center justify-between w-full gap-2" onClick={() => onVerDetalle(venta)}>
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Receipt className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-foreground truncate">{venta.clientName || "Venta directa"}</p>
                      <p className="text-[11px] text-muted-foreground">{fmtDate(venta.createdAt)} · {venta.saleNumber || venta.remitoNumber || `#${ventas.length - index}`}</p>
                      {venta.hojaRutaNumber
                        ? <p className="text-[10px] text-teal-600 font-medium">Hoja de ruta: {venta.hojaRutaNumber}</p>
                        : <p className="text-[10px] text-slate-500 font-medium">Entregado en local</p>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {venta.rechazado ? (
                      <Badge variant="outline" className="text-[10px] bg-red-100 text-red-700 border-red-200">Rechazado</Badge>
                    ) : (
                      <>
                        {(() => {
                          const { perdida, faltante, rechazo } = calcIncidencia(venta);
                          const nc = devolucionesPorVenta[venta.id] || 0;
                          const dto = descuentosPorVenta[venta.id] || 0;
                          const totalOriginal = Number(venta.total) || 0;
                          return (
                            <>
                              {dto > 0.005 ? (
                                <>
                                  <p className="text-[10px] text-muted-foreground line-through">{fmt(totalOriginal)}</p>
                                  <p className="text-[10px] text-emerald-600 font-medium">Desc: -{fmt(dto)}</p>
                                  <p className="font-bold text-sm text-foreground">{fmt(totalOriginal - dto)}</p>
                                </>
                              ) : (
                                <p className="font-bold text-sm text-foreground">{fmt(totalOriginal)}</p>
                              )}
                              {perdida > 0.005 && <p className="text-[10px] text-rose-600 font-medium">Pérd: -{fmt(perdida)}</p>}
                              {faltante > 0.005 && <p className="text-[10px] text-orange-600 font-medium">Falt: -{fmt(faltante)}</p>}
                              {rechazo > 0.005 && <p className="text-[10px] text-amber-600 font-medium">Rech: -{fmt(rechazo)}</p>}
                              {nc > 0.005 && <p className="text-[10px] text-violet-600 font-medium">N.Créd: -{fmt(nc)}</p>}
                            </>
                          );
                        })()}
                        <Badge variant="outline" className={`text-[10px] ${payBadgeCls(venta.paymentType, venta.paymentMethod)}`}>
                          {payLabel(venta.paymentType, venta.paymentMethod)}
                        </Badge>
                      </>
                    )}
                  </div>
                </div>

                {/* Desktop */}
                <div className="hidden md:flex md:col-span-2 items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                    <Receipt className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground text-sm">{venta.saleNumber || venta.remitoNumber || `N° ${ventas.length - index}`}</p>
                    <p className="text-[10px] text-muted-foreground">{fmtDate(venta.createdAt)} · {fmtTime(venta.createdAt)}</p>
                  </div>
                </div>
                <div className="hidden md:flex md:col-span-2 items-center gap-2">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-muted text-muted-foreground text-xs"><User className="h-3.5 w-3.5" /></AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{venta.clientName || "Venta directa"}</p>
                    {venta.sellerName && <p className="text-[10px] text-muted-foreground truncate">Vendedor: {venta.sellerName}</p>}
                    {venta.hojaRutaNumber
                      ? <p className="text-[10px] text-teal-600 font-medium truncate">Hoja de ruta: {venta.hojaRutaNumber}</p>
                      : <p className="text-[10px] text-slate-500 font-medium truncate">Entregado en local</p>}
                  </div>
                </div>
                {(() => {
                  const { perdida, faltante, rechazo } = calcIncidencia(venta);
                  const nc = (devolucionesPorVenta[venta.id] || 0) + (descuentosPorVenta[venta.id] || 0);
                  return (
                    <>
                      <div className="hidden md:flex md:col-span-1 items-center justify-end">
                        {perdida > 0.005
                          ? <p className="font-semibold text-rose-600 text-sm">-{fmt(perdida)}</p>
                          : <p className="text-muted-foreground/50 text-sm">—</p>}
                      </div>
                      <div className="hidden md:flex md:col-span-1 items-center justify-end">
                        {faltante > 0.005
                          ? <p className="font-semibold text-orange-600 text-sm">-{fmt(faltante)}</p>
                          : <p className="text-muted-foreground/50 text-sm">—</p>}
                      </div>
                      <div className="hidden md:flex md:col-span-1 items-center justify-end">
                        {rechazo > 0.005
                          ? <p className="font-semibold text-amber-600 text-sm">-{fmt(rechazo)}</p>
                          : <p className="text-muted-foreground/50 text-sm">—</p>}
                      </div>
                      <div className="hidden md:flex md:col-span-1 items-center justify-end">
                        {nc > 0.005
                          ? <p className="font-semibold text-violet-600 text-sm">-{fmt(nc)}</p>
                          : <p className="text-muted-foreground/50 text-sm">—</p>}
                      </div>
                    </>
                  );
                })()}
                <div className="hidden md:flex md:col-span-2 items-center justify-end">
                  {venta.rechazado ? (
                    <Badge variant="outline" className="px-2.5 py-1 bg-red-100 text-red-700 border-red-200">Rechazado</Badge>
                  ) : (() => {
                    const dto = descuentosPorVenta[venta.id] || 0;
                    const totalOriginal = Number(venta.total) || 0;
                    if (dto <= 0.005) return <p className="font-bold text-foreground text-base">{fmt(totalOriginal)}</p>;
                    return (
                      <div className="text-right leading-tight">
                        <p className="text-[11px] text-muted-foreground line-through">{fmt(totalOriginal)}</p>
                        <p className="text-[11px] text-emerald-600 font-medium">Desc: -{fmt(dto)}</p>
                        <p className="font-bold text-foreground text-base">{fmt(totalOriginal - dto)}</p>
                      </div>
                    );
                  })()}
                </div>
                <div className="hidden md:flex md:col-span-1 items-center justify-center">
                  {!venta.rechazado && (
                    <Badge variant="outline" className={`gap-1.5 px-2.5 py-1 ${payBadgeCls(venta.paymentType, venta.paymentMethod)}`}>
                      {payIcon(venta.paymentType, venta.paymentMethod)}
                      {payLabel(venta.paymentType, venta.paymentMethod)}
                    </Badge>
                  )}
                </div>
                <div className="hidden md:flex md:col-span-1 items-center justify-center">
                  <Button variant="ghost" size="sm" className="h-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50 gap-1" onClick={() => onVerDetalle(venta)}>
                    <Eye className="h-4 w-4" />
                    <span className="hidden lg:inline text-xs">Ver</span>
                  </Button>
                </div>

              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-2">
          <p className="text-sm text-muted-foreground">
            Mostrando {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, ventas.length)} de {ventas.length}
          </p>
          <div className="flex items-center gap-2">
            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setCurrentPage(1); }}>
              <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[10, 20, 50, 100].map(n => <SelectItem key={n} value={String(n)} className="text-xs">{n} / pág</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>Anterior</Button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
              .reduce<(number | string)[]>((acc, p, i, arr) => {
                if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("...");
                acc.push(p); return acc;
              }, [])
              .map((p, i) => typeof p === "string"
                ? <span key={`dot-${i}`} className="px-1 text-muted-foreground">…</span>
                : <Button key={p} variant={p === currentPage ? "default" : "outline"} size="sm" className="h-8 w-8 p-0" onClick={() => setCurrentPage(p)}>{p}</Button>
              )}
            <Button variant="outline" size="sm" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>Siguiente</Button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL INCIDENCIAS (pérdidas / rechazos / notas de crédito) ────── */}
      <Dialog open={!!incidenciaModal} onOpenChange={(o) => { if (!o) setIncidenciaModal(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {incidenciaModal && incidenciaMeta[incidenciaModal].titulo}
              <span className="text-xs font-normal text-muted-foreground">({incidenciaLista.length})</span>
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto divide-y divide-border/50">
            {incidenciaLista.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No hay ventas en este período.</p>
            ) : incidenciaLista.map((r) => (
              <button
                key={r.id}
                onClick={() => { const v = (ventas as any[]).find((x) => x.id === r.id); if (v) { setIncidenciaModal(null); onVerDetalle(v); } }}
                className="w-full flex items-center justify-between gap-3 py-2.5 px-1 text-left hover:bg-muted/40 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{r.cliente}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{r.ref} · {fmtDate(r.fecha)}</p>
                  {r.detalle && <p className="text-[10px] text-muted-foreground truncate">{r.detalle}</p>}
                </div>
                <p className={`text-sm font-bold tabular-nums shrink-0 ${incidenciaModal ? incidenciaMeta[incidenciaModal].color : ""}`}>-{fmt(r.monto)}</p>
              </button>
            ))}
          </div>
          {incidenciaLista.length > 0 && (
            <div className="flex items-center justify-between pt-2 border-t border-border/50 text-sm font-semibold">
              <span>Total</span>
              <span className={incidenciaModal ? incidenciaMeta[incidenciaModal].color : ""}>-{fmt(incidenciaLista.reduce((a, r) => a + r.monto, 0))}</span>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── EXPORT EXCEL ─────────────────────────────────────────────────── */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Exportar ventas a Excel
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Período</label>
              <Select value={exportPeriod} onValueChange={v => { setExportPeriod(v); if (v !== "custom") { setExportFrom(""); setExportTo(""); } }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las ventas</SelectItem>
                  <SelectItem value="today">Hoy</SelectItem>
                  <SelectItem value="week">Esta semana</SelectItem>
                  <SelectItem value="month">Este mes</SelectItem>
                  <SelectItem value="year">Este año</SelectItem>
                  <SelectItem value="custom">Elegir fechas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {exportPeriod === "custom" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><label className="text-xs font-medium text-muted-foreground">Desde</label><Input type="date" value={exportFrom} onChange={e => setExportFrom(e.target.value)} /></div>
                <div className="space-y-1.5"><label className="text-xs font-medium text-muted-foreground">Hasta</label><Input type="date" value={exportTo} onChange={e => setExportTo(e.target.value)} /></div>
              </div>
            )}
            <p className="text-xs text-muted-foreground">Se exporta un Excel con: N° Venta, Fecha, Cliente, Vendedor, Total y Método de Pago. Incluye fila de totales.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportOpen(false)}>Cancelar</Button>
            <Button onClick={exportExcel} className="gap-2"><Download className="h-4 w-4" />Descargar Excel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* FAB mobile */}
      <div className="md:hidden fixed bottom-6 right-6 z-50">
        <Button asChild className="h-14 w-14 rounded-full shadow-xl" size="icon">
          <Link href="/ventas/nueva"><Plus className="h-6 w-6" /></Link>
        </Button>
      </div>
    </div>
  );
}

// ─── helpers de UI ─────────────────────────────────────────────���──────────────

const RESUMEN_ACCENTS: Record<string, { icon: string; value: string }> = {
  teal: { icon: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400", value: "text-teal-700 dark:text-teal-400" },
  rose: { icon: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400", value: "text-rose-600 dark:text-rose-400" },
  amber: { icon: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400", value: "text-amber-600 dark:text-amber-400" },
  violet: { icon: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400", value: "text-violet-600 dark:text-violet-400" },
};

function ResumenCard({ icon, label, value, sub, accent, netoLabel, netoValue, onVer }: { icon: React.ReactNode; label: string; value: string; sub?: string; accent: keyof typeof RESUMEN_ACCENTS | string; netoLabel?: string; netoValue?: string; onVer?: () => void }) {
  const a = RESUMEN_ACCENTS[accent] ?? RESUMEN_ACCENTS.teal;
  return (
    <Card className="border-border/60 shadow-sm rounded-2xl">
      <CardContent className="p-3 md:p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className={`h-8 w-8 rounded-xl flex items-center justify-center shrink-0 ${a.icon}`}>{icon}</div>
          <p className="text-xs font-medium text-muted-foreground truncate">{label}</p>
        </div>
        <p className={`text-xl md:text-2xl font-bold tabular-nums ${a.value}`}>{value}</p>
        {sub && <p className="text-[11px] text-muted-foreground truncate mt-0.5">{sub}</p>}
        {netoValue && (
          <div className="mt-1.5 pt-1.5 border-t border-border/50">
            <p className="text-[10px] text-emerald-600 font-medium leading-tight">{netoLabel}</p>
            <p className="text-sm md:text-base font-bold tabular-nums text-emerald-600 leading-tight">{netoValue}</p>
          </div>
        )}
        {onVer && (
          <button onClick={onVer} className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline">
            <Eye className="h-3 w-3" /> Ver
          </button>
        )}
      </CardContent>
    </Card>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <Badge variant="secondary" className="text-xs gap-1">
      {label}
      <button onClick={onRemove}><X className="h-3 w-3" /></button>
    </Badge>
  );
}

function FilterSection({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1.5">
        {icon}{label}
      </p>
      {children}
    </div>
  );
}

function OptionBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      className={`py-2 px-3 rounded-lg text-xs font-medium border transition-colors text-center ${active ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:border-primary/50"}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
