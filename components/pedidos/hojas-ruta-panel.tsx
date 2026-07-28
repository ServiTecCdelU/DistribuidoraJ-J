"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DataTableSkeleton } from "@/components/ui/data-table-skeleton";
import { hojaRutaApi } from "@/lib/api";
import type { HojaRuta } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import { Printer, Eye, Search, Route } from "lucide-react";
import { toast } from "sonner";

export function HojasRutaPanel() {
  const [hojas, setHojas] = useState<HojaRuta[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setHojas(await hojaRutaApi.getAll());
      } catch {
        toast.error("Error al cargar las hojas de ruta");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return hojas;
    return hojas.filter(
      (h) =>
        h.numero.toLowerCase().includes(q) ||
        h.vendedores.some((v) => v.toLowerCase().includes(q)) ||
        formatDate(new Date(h.fechaReparto + "T12:00:00")).includes(q),
    );
  }, [hojas, search]);

  // Storage sirve el archivo como text/plain y con CSP sandbox, así que no se puede
  // abrir la URL pública directamente: se descarga el HTML y se renderiza local.
  const openHoja = useCallback(async (hoja: HojaRuta) => {
    setBusyId(hoja.id);
    try {
      const html = await hojaRutaApi.getHtml(hoja.storagePath);
      const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
      const win = window.open(url, "_blank", "noopener");
      if (!win) toast.error("El navegador bloqueó la ventana emergente");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      toast.error("No se pudo abrir la hoja de ruta");
    } finally {
      setBusyId(null);
    }
  }, []);

  const printHoja = useCallback(async (hoja: HojaRuta) => {
    setBusyId(hoja.id);
    try {
      const html = await hojaRutaApi.getHtml(hoja.storagePath);
      const iframe = document.createElement("iframe");
      iframe.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;border:0;opacity:0;";
      document.body.appendChild(iframe);
      const doc = iframe.contentWindow?.document;
      if (!doc) {
        document.body.removeChild(iframe);
        return;
      }
      doc.open();
      doc.write(html);
      doc.close();
      iframe.onload = () => {
        iframe.contentWindow?.print();
        setTimeout(() => document.body.removeChild(iframe), 1000);
      };
    } catch {
      toast.error("No se pudo abrir la hoja de ruta");
    } finally {
      setBusyId(null);
    }
  }, []);

  if (loading) {
    return <DataTableSkeleton columns={6} rows={6} />;
  }

  return (
      <div className="space-y-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por N°, fecha o vendedor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 rounded-2xl"
          />
        </div>

        {filtered.length === 0 ? (
          <Card className="rounded-2xl">
            <CardContent className="py-12 text-center text-muted-foreground">
              <Route className="h-10 w-10 mx-auto mb-3 opacity-40" />
              {hojas.length === 0
                ? "Todavía no hay hojas de ruta archivadas. Se guardan automáticamente al generarlas desde Pedidos."
                : "No se encontraron hojas de ruta con ese criterio."}
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Desktop */}
            <Card className="rounded-2xl hidden lg:block overflow-hidden">
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-3">N°</th>
                      <th className="px-4 py-3">Fecha de reparto</th>
                      <th className="px-4 py-3">Vendedores</th>
                      <th className="px-4 py-3 text-center">Clientes</th>
                      <th className="px-4 py-3 text-center">Pedidos</th>
                      <th className="px-4 py-3 text-right">Total</th>
                      <th className="px-4 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((h) => (
                      <tr key={h.id} className="border-t border-border hover:bg-muted/30">
                        <td className="px-4 py-3 font-bold text-teal-600">N° {h.numero}</td>
                        <td className="px-4 py-3">{formatDate(new Date(h.fechaReparto + "T12:00:00"))}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {h.vendedores.map((v) => (
                              <Badge key={v} variant="secondary" className="rounded-xl font-normal">
                                {v}
                              </Badge>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">{h.cantidadClientes}</td>
                        <td className="px-4 py-3 text-center">{h.cantidadPedidos}</td>
                        <td className="px-4 py-3 text-right font-semibold">{formatCurrency(h.total)}</td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" size="sm" className="rounded-2xl" disabled={busyId === h.id} onClick={() => openHoja(h)}>
                              <Eye className="h-4 w-4 mr-1" /> Ver
                            </Button>
                            <Button
                              size="sm"
                              className="rounded-2xl"
                              disabled={busyId === h.id}
                              onClick={() => printHoja(h)}
                            >
                              <Printer className="h-4 w-4 mr-1" /> Imprimir
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            {/* Mobile */}
            <div className="lg:hidden space-y-3">
              {filtered.map((h) => (
                <Card key={h.id} className="rounded-2xl">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-teal-600">Hoja N° {h.numero}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(new Date(h.fechaReparto + "T12:00:00"))}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {h.vendedores.map((v) => (
                        <Badge key={v} variant="secondary" className="rounded-xl font-normal">
                          {v}
                        </Badge>
                      ))}
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {h.cantidadClientes} cliente(s) · {h.cantidadPedidos} pedido(s)
                      </span>
                      <span className="font-semibold text-foreground text-sm">{formatCurrency(h.total)}</span>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button variant="outline" size="sm" className="rounded-2xl flex-1" disabled={busyId === h.id} onClick={() => openHoja(h)}>
                        <Eye className="h-4 w-4 mr-1" /> Ver
                      </Button>
                      <Button
                        size="sm"
                        className="rounded-2xl flex-1"
                        disabled={busyId === h.id}
                        onClick={() => printHoja(h)}
                      >
                        <Printer className="h-4 w-4 mr-1" /> Imprimir
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
  );
}
