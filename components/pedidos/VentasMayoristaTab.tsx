"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Search, X, CheckCircle2, Clock, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { getSales } from "@/services/sales-service";
import type { Sale } from "@/lib/types";
import { formatCurrency } from "@/lib/utils/format";
import { toDate } from "@/services/firestore-helpers";
import { cn } from "@/lib/utils";

// Una venta es "mayorista" si tiene status pendiente o listo
function esMayorista(sale: Sale): boolean {
  return sale.status === "pendiente" || sale.status === "listo";
}

function esListaParaEntregar(sale: Sale): boolean {
  if (sale.status === "listo") return true;
  if (!sale.items) return false;
  return (sale.items as any[]).every(
    (i) => ((i.cantidadPendienteMayorista ?? 0) === 0)
  );
}

export function VentasMayoristaTab() {
  const [ventas, setVentas] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filtro, setFiltro] = useState<"todas" | "listo" | "pendiente">("todas");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const all = await getSales();
      setVentas(all.filter(esMayorista));
    } catch {
      toast.error("Error al cargar ventas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const filtradas = useMemo(() => {
    const q = search.toLowerCase();
    return ventas.filter((v) => {
      const matchSearch = !q
        || (v.clientName ?? "").toLowerCase().includes(q)
        || (v.saleNumber ?? "").toLowerCase().includes(q);
      const listo = esListaParaEntregar(v);
      const matchFiltro =
        filtro === "todas"
        || (filtro === "listo" && listo)
        || (filtro === "pendiente" && !listo);
      return matchSearch && matchFiltro;
    });
  }, [ventas, search, filtro]);

  const stats = useMemo(() => ({
    listo: ventas.filter(esListaParaEntregar).length,
    pendiente: ventas.filter((v) => !esListaParaEntregar(v)).length,
  }), [ventas]);

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => setFiltro(filtro === "listo" ? "todas" : "listo")}
          className={cn(
            "flex items-center gap-3 p-3 rounded-2xl border-2 text-left transition-colors",
            filtro === "listo" ? "border-emerald-500 bg-emerald-50/50" : "border-border hover:border-emerald-300"
          )}
        >
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <div>
            <p className="text-2xl font-bold text-emerald-700">{stats.listo}</p>
            <p className="text-xs text-muted-foreground">Listo para entregar</p>
          </div>
        </button>
        <button
          onClick={() => setFiltro(filtro === "pendiente" ? "todas" : "pendiente")}
          className={cn(
            "flex items-center gap-3 p-3 rounded-2xl border-2 text-left transition-colors",
            filtro === "pendiente" ? "border-amber-500 bg-amber-50/50" : "border-border hover:border-amber-300"
          )}
        >
          <Clock className="h-5 w-5 text-amber-600 shrink-0" />
          <div>
            <p className="text-2xl font-bold text-amber-700">{stats.pendiente}</p>
            <p className="text-xs text-muted-foreground">Faltan productos</p>
          </div>
        </button>
      </div>

      {/* Buscador */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por cliente o número..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 rounded-xl"
          />
          {search && (
            <Button variant="ghost" size="icon" className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6" onClick={() => setSearch("")}>
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        <Button variant="outline" size="icon" className="rounded-xl shrink-0" onClick={cargar}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : filtradas.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          {ventas.length === 0 ? "No hay ventas mayorista aún." : "No hay ventas que coincidan."}
        </div>
      ) : (
        <div className="space-y-2">
          {filtradas.map((venta) => {
            const listo = esListaParaEntregar(venta);
            const expanded = expandedId === venta.id;
            const items = (venta.items ?? []) as any[];
            return (
              <div key={venta.id} className="rounded-2xl border overflow-hidden">
                <button
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/20 transition-colors"
                  onClick={() => setExpandedId(expanded ? null : venta.id)}
                >
                  {listo ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  ) : (
                    <Clock className="h-4 w-4 text-amber-600 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm truncate">
                        {venta.clientName || "Sin cliente"}
                      </span>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] px-1.5 py-0 shrink-0",
                          listo
                            ? "border-emerald-400 text-emerald-700 bg-emerald-50"
                            : "border-amber-400 text-amber-700 bg-amber-50"
                        )}
                      >
                        {listo ? "Listo para entregar" : "Faltan productos"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {venta.saleNumber} · {formatCurrency(venta.total)} · {
                        toDate(venta.createdAt).toLocaleDateString("es-AR")
                      }
                    </p>
                  </div>
                  {expanded ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                </button>

                {expanded && (
                  <div className="border-t px-4 pb-3 pt-2 space-y-1 bg-muted/10">
                    {items.map((item: any, idx: number) => {
                      const pendiente = item.cantidadPendienteMayorista ?? 0;
                      const localCovered = item.cantidadStockLocal ?? item.quantity;
                      return (
                        <div key={idx} className="flex items-center justify-between text-xs py-1 border-b last:border-b-0">
                          <span className="truncate flex-1 font-medium">{item.name}</span>
                          <div className="flex items-center gap-3 ml-2 text-right">
                            <span className="text-emerald-600">local: {localCovered}</span>
                            {pendiente > 0 && (
                              <span className="text-amber-600">mayorista: {pendiente}</span>
                            )}
                            <span className="font-semibold text-foreground">{item.quantity} uds</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
