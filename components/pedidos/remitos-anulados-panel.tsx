"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { DataTableSkeleton } from "@/components/ui/data-table-skeleton";
import { FileX, User, Calendar } from "lucide-react";
import { remitosAnuladosApi } from "@/lib/api";
import type { RemitoAnulado } from "@/lib/api";

const fechaHora = (d?: Date) =>
  d
    ? d.toLocaleString("es-AR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

/**
 * Remitos eliminados (no anulación de pedido: esto es "se borró el número de remito
 * para regenerarlo"). Queda registrado con quién, cuándo y por qué, porque eliminar
 * un remito libera el número — la hoja de ruta ya impresa puede quedar con un N°
 * de remito que ya no existe en el pedido.
 */
export function RemitosAnuladosPanel() {
  const [remitos, setRemitos] = useState<RemitoAnulado[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let activo = true;
    remitosAnuladosApi
      .getAll()
      .then((data) => {
        if (activo) setRemitos(data);
      })
      .catch(() => {
        if (activo) setRemitos([]);
      })
      .finally(() => {
        if (activo) setLoading(false);
      });
    return () => {
      activo = false;
    };
  }, []);

  if (loading) return <DataTableSkeleton columns={4} rows={4} />;

  if (remitos.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <FileX className="h-12 w-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-500">No hay remitos eliminados</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {remitos.map((r) => (
        <Card key={r.id} className="rounded-2xl border-slate-200">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-slate-800 truncate">
                    {r.clientName || "Sin cliente"}
                  </span>
                  {r.remitoNumber && (
                    <span className="text-[11px] font-medium text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">
                      {r.remitoNumber}
                    </span>
                  )}
                  {r.stockRepuesto && (
                    <span className="text-[11px] font-medium text-emerald-600 bg-emerald-50 rounded-full px-2 py-0.5">
                      stock repuesto
                    </span>
                  )}
                </div>

                <p className="mt-1.5 text-sm text-slate-700">
                  <span className="text-slate-500">Nota: </span>
                  {r.nota || "—"}
                </p>

                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {r.userName || "—"}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {fechaHora(r.createdAt)}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
