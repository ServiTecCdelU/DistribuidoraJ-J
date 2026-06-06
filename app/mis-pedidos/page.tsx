"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { MainLayout } from "@/components/layout/main-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DataTableSkeleton } from "@/components/ui/data-table-skeleton";
import { ordersApi } from "@/lib/api";
import type { Order } from "@/lib/types";
import { useAuth } from "@/hooks/use-auth";
import { statusConfig } from "@/lib/order-constants";
import { formatCurrency } from "@/lib/utils/format";
import { Package, ChevronDown, ChevronRight, MapPin } from "lucide-react";

type StatusFilter = "all" | "pending" | "preparation" | "delivery" | "completed" | "rechazado";

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "pending", label: "Pendientes" },
  { key: "preparation", label: "Preparación" },
  { key: "delivery", label: "En Reparto" },
  { key: "completed", label: "Completados" },
  { key: "rechazado", label: "Rechazados" },
];

const orderTotal = (order: Order): number =>
  order.items.reduce((acc, it) => {
    const base = (it.quantity || 0) * (it.price || 0);
    const dto = it.itemDiscount ? (base * it.itemDiscount) / 100 : 0;
    return acc + base - dto;
  }, 0);

const orderDateTime = (date: Date): string =>
  new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));

export default function MisPedidosPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const loadData = useCallback(async () => {
    if (!user?.sellerId) {
      setOrders([]);
      setLoading(false);
      return;
    }
    try {
      const data = await ordersApi.getBySeller(user.sellerId);
      setOrders(
        data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
      );
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [user?.sellerId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Refresco automatico cada 3 min y al volver a la pestaña.
  // Solo recarga si la pestaña esta visible para no consumir egress en segundo plano.
  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") loadData();
    };
    const interval = setInterval(refreshIfVisible, 180000);
    document.addEventListener("visibilitychange", refreshIfVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [loadData]);

  // Contadores por cliente (clientes distintos, no pedidos sueltos)
  const counts = useMemo(() => {
    const distinct = (list: Order[]) =>
      new Set(list.map((o) => o.clientName || "Sin cliente")).size;
    const c: Record<string, number> = { all: distinct(orders) };
    FILTERS.forEach((f) => {
      if (f.key !== "all") c[f.key] = distinct(orders.filter((o) => o.status === f.key));
    });
    return c;
  }, [orders]);

  const filteredOrders = useMemo(
    () => (filter === "all" ? orders : orders.filter((o) => o.status === filter)),
    [orders, filter],
  );

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  if (loading) {
    return (
      <MainLayout allowedRoles={["seller", "admin"]} title="Mis Pedidos" description="Pedidos que registraste">
        <DataTableSkeleton columns={4} rows={5} />
      </MainLayout>
    );
  }

  return (
    <MainLayout allowedRoles={["seller", "admin"]} title="Mis Pedidos" description="Pedidos que registraste">
      <div className="space-y-4">
        {/* Filtros por estado */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`flex items-center gap-2 whitespace-nowrap rounded-2xl border px-4 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "border-teal-500 bg-teal-50 text-teal-700"
                    : "border-border bg-background text-muted-foreground hover:bg-muted/50"
                }`}
              >
                {f.label}
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    active ? "bg-teal-600 text-white" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {counts[f.key] || 0}
                </span>
              </button>
            );
          })}
        </div>

        {filteredOrders.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Package className="mx-auto mb-3 h-12 w-12 text-gray-400" />
              <p className="text-gray-500">No tenés pedidos en este estado</p>
            </CardContent>
          </Card>
        ) : (
          <div className="divide-y rounded-2xl border overflow-hidden">
            {filteredOrders.map((order) => {
              const cfg = statusConfig[order.status];
              const Icon = cfg?.icon;
              const isOpen = expanded.has(order.id);
              const total = orderTotal(order);
              const itemCount = order.items.reduce((a, it) => a + (it.quantity || 0), 0);
              return (
                <div key={order.id}>
                  <button
                    onClick={() => toggleExpand(order.id)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/30"
                  >
                    <span className={`h-2 w-2 shrink-0 rounded-full ${cfg?.dotColor}`} title={cfg?.label} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {order.clientName || "Sin cliente"}
                    </span>
                    <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                      {order.items.length} prod · {itemCount} u.
                    </span>
                    <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                      {orderDateTime(order.createdAt)}
                    </span>
                    <span className={`shrink-0 text-xs font-medium ${cfg?.color}`}>{cfg?.label}</span>
                    <span className="w-24 shrink-0 text-right text-sm font-bold text-teal-700 tabular-nums">
                      {formatCurrency(total)}
                    </span>
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                  </button>

                  {isOpen && (
                    <div className="border-t bg-muted/20 px-4 py-3">
                      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
                          {cfg?.label}
                        </span>
                        <span>{orderDateTime(order.createdAt)}</span>
                        {order.address && order.address !== "Retiro en local" && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" />
                            {order.address}
                          </span>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        {order.items.map((it, idx) => {
                          const base = (it.quantity || 0) * (it.price || 0);
                          const dto = it.itemDiscount ? (base * it.itemDiscount) / 100 : 0;
                          return (
                            <div key={`${it.productId || it.name}-${idx}`} className="flex items-center justify-between gap-2 text-sm">
                              <span className="min-w-0 flex-1 truncate">
                                <span className="font-medium text-muted-foreground">{it.quantity}×</span> {it.name}
                                {it.itemDiscount ? (
                                  <span className="ml-1 text-xs text-emerald-600">(-{it.itemDiscount}%)</span>
                                ) : null}
                              </span>
                              <span className="shrink-0 tabular-nums">{formatCurrency(base - dto)}</span>
                            </div>
                          );
                        })}
                      </div>
                      <div className="mt-2 flex items-center justify-between border-t pt-2 text-sm font-semibold">
                        <span>Total</span>
                        <span className="text-teal-700">{formatCurrency(total)}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
