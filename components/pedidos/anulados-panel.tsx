"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { DataTableSkeleton } from "@/components/ui/data-table-skeleton";
import { XCircle, User, Calendar } from "lucide-react";
import { ordersApi } from "@/lib/api";
import type { Order } from "@/lib/types";
import { formatCurrency } from "@/lib/utils/format";
import { subtotalConDescuentos } from "@/lib/utils/order-discount";

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
 * Pedidos anulados. Los pedidos ya no se borran: quedan acá con quién los anuló,
 * cuándo y por qué. Solo consulta, no hay acciones.
 */
export function AnuladosPanel() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let activo = true;
    ordersApi
      .getCancelled()
      .then((data) => {
        if (activo) setOrders(data);
      })
      .catch(() => {
        if (activo) setOrders([]);
      })
      .finally(() => {
        if (activo) setLoading(false);
      });
    return () => {
      activo = false;
    };
  }, []);

  if (loading) return <DataTableSkeleton columns={5} rows={4} />;

  if (orders.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <XCircle className="h-12 w-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-500">No hay pedidos anulados</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {orders.map((order) => (
        <Card key={order.id} className="rounded-2xl border-slate-200">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-slate-800 truncate">
                    {order.clientName || "Sin cliente"}
                  </span>
                  {order.remitoNumber && (
                    <span className="text-[11px] font-medium text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">
                      {order.remitoNumber}
                    </span>
                  )}
                  <span className="text-[11px] text-slate-500">
                    {order.items?.length ?? 0} producto{(order.items?.length ?? 0) === 1 ? "" : "s"}
                  </span>
                </div>

                <p className="mt-1.5 text-sm text-slate-700">
                  <span className="text-slate-500">Motivo: </span>
                  {order.anuladoMotivo || "—"}
                </p>

                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {order.anuladoPor || "—"}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {fechaHora(order.anuladoAt)}
                  </span>
                  {order.sellerName && <span>Vendedor: {order.sellerName}</span>}
                </div>
              </div>

              <div className="text-right shrink-0">
                <p className="text-sm font-semibold text-slate-600 line-through">
                  {formatCurrency(subtotalConDescuentos((order.items ?? []) as any[]))}
                </p>
                <p className="text-[11px] text-slate-400">anulado</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
