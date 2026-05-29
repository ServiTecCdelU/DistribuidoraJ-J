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

type StatusFilter = "all" | "pending" | "preparation" | "delivery" | "completed";

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "pending", label: "Pendientes" },
  { key: "preparation", label: "Preparación" },
  { key: "delivery", label: "En Reparto" },
  { key: "completed", label: "Completados" },
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

  // Refresco automático cada 30s
  useEffect(() => {
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: orders.length };
    orders.forEach((o) => {
      c[o.status] = (c[o.status] || 0) + 1;
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
          <div className="space-y-3">
            {filteredOrders.map((order) => {
              const cfg = statusConfig[order.status];
              const Icon = cfg?.icon;
              const isOpen = expanded.has(order.id);
              const total = orderTotal(order);
              const itemCount = order.items.reduce((a, it) => a + (it.quantity || 0), 0);
              return (
                <Card key={order.id} className="overflow-hidden">
                  <button
                    onClick={() => toggleExpand(order.id)}
                    className="flex w-full items-center gap-3 p-4 text-left hover:bg-muted/30"
                  >
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-semibold">{order.clientName || "Sin cliente"}</span>
                        <span
                          className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${cfg?.bgColor} ${cfg?.color} ${cfg?.borderColor}`}
                        >
                          {Icon ? <Icon className="h-3 w-3" /> : null}
                          {cfg?.label}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{orderDateTime(order.createdAt)}</span>
                        <span>·</span>
                        <span>{order.items.length} productos ({itemCount} u.)</span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-bold text-teal-700">{formatCurrency(total)}</div>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t bg-muted/20 px-4 py-3">
                      {order.address && order.address !== "Retiro en local" && (
                        <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5" />
                          <span>{order.address}</span>
                        </div>
                      )}
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
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
