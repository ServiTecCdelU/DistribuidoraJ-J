"use client";

import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { MainLayout } from "@/components/layout/main-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Shield,
  Loader2,
  ShoppingCart,
  Package,
  Users,
  FileText,
  Banknote,
  Truck,
  DollarSign,
} from "lucide-react";
import { auditApi } from "@/lib/api";
import type { AuditEntry, AuditAction, OrderStatus } from "@/lib/types";
import { statusConfig } from "@/lib/order-constants";
import type { AuditOrderInfo } from "@/services/audit-service";
import { agruparPorPedido, textoNovedad, numeroDePedido } from "@/lib/utils/audit-pedidos";
import { Button } from "@/components/ui/button";
import Link from "next/link";

const ACTION_META: Record<
  AuditAction,
  { label: string; color: string; icon: React.ElementType }
> = {
  sale_created: { label: "Venta", color: "bg-emerald-500", icon: ShoppingCart },
  sale_invoiced: { label: "Factura", color: "bg-blue-500", icon: FileText },
  product_created: { label: "Producto creado", color: "bg-violet-500", icon: Package },
  product_updated: { label: "Producto editado", color: "bg-amber-500", icon: Package },
  product_deleted: { label: "Producto eliminado", color: "bg-red-500", icon: Package },
  client_created: { label: "Cliente creado", color: "bg-cyan-500", icon: Users },
  client_updated: { label: "Cliente editado", color: "bg-amber-500", icon: Users },
  client_deleted: { label: "Cliente eliminado", color: "bg-red-500", icon: Users },
  order_created: { label: "Pedido creado", color: "bg-sky-500", icon: Truck },
  order_status_changed: { label: "Pedido actualizado", color: "bg-amber-500", icon: Truck },
  order_items_edited: { label: "Pedido editado", color: "bg-orange-500", icon: Truck },
  order_cancelled: { label: "Pedido anulado", color: "bg-slate-500", icon: Truck },
  cash_register_opened: { label: "Caja abierta", color: "bg-emerald-500", icon: Banknote },
  cash_register_closed: { label: "Caja cerrada", color: "bg-red-500", icon: Banknote },
  cash_register_verified: { label: "Caja verificada", color: "bg-teal-500", icon: Banknote },
  payment_registered: { label: "Pago registrado", color: "bg-green-500", icon: DollarSign },
  price_list_updated: { label: "Lista precios", color: "bg-purple-500", icon: DollarSign },
};

import { formatDateTime, formatTime, formatDateShort } from "@/lib/utils/format";

export default function AuditoriaPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [selectedDate, setSelectedDate] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [agrupar, setAgrupar] = useState(true);
  const [ordersInfo, setOrdersInfo] = useState<Record<string, AuditOrderInfo>>({});
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());

  // Sin fecha se puede buscar igual (por remito, cliente o texto): la consulta va al servidor.
  const busquedaGlobal = !selectedDate && search.trim().length >= 2;

  useEffect(() => {
    if (!selectedDate && !busquedaGlobal) {
      setEntries([]);
      return;
    }
    let mounted = true;
    const loadData = async () => {
      setLoading(true);
      try {
        const data = selectedDate
          ? await auditApi.getAll(selectedDate, dateTo || undefined)
          : await auditApi.search(search.trim());
        if (!mounted) return;
        setEntries(data);
      } catch (error) {
        if (!mounted) return;
        toast.error("Error al cargar auditoria");
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    };
    const t = setTimeout(loadData, selectedDate ? 0 : 400);
    return () => { mounted = false; clearTimeout(t); };
  }, [selectedDate, dateTo, busquedaGlobal, search]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (actionFilter !== "all" && e.action !== actionFilter) return false;
      // Con búsqueda global el filtrado ya lo hizo el servidor (el término puede ser
      // un remito, que no aparece en el texto del movimiento).
      if (s && !busquedaGlobal) {
        return (
          e.description.toLowerCase().includes(s) ||
          e.userName.toLowerCase().includes(s) ||
          (e.entityId && e.entityId.toLowerCase().includes(s))
        );
      }
      return true;
    });
  }, [entries, search, actionFilter, busquedaGlobal]);

  const { grupos, sueltas } = useMemo(() => agruparPorPedido(filtered), [filtered]);

  // Cliente y remito reales del pedido (la descripción puede no tenerlos).
  useEffect(() => {
    const ids = grupos.map((g) => g.orderId).filter((id) => !(id in ordersInfo));
    if (ids.length === 0) return;
    let mounted = true;
    auditApi
      .getOrdersInfo(ids)
      .then((info) => { if (mounted) setOrdersInfo((prev) => ({ ...prev, ...info })); })
      .catch(() => {});
    return () => { mounted = false; };
  }, [grupos, ordersInfo]);

  const toggleGrupo = (id: string) =>
    setExpandidos((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const uniqueActions = useMemo(
    () => Array.from(new Set(entries.map((e) => e.action))).sort(),
    [entries],
  );

  return (
    <MainLayout allowedRoles={['admin']} title="Auditoria" description="Registro de acciones del sistema">
      <div className="p-4 lg:p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6" />
            Auditoria
          </h1>
          <p className="text-muted-foreground text-sm">
            Registro de todas las acciones realizadas en el sistema
          </p>
        </div>

        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full sm:w-[160px]"
                  title="Desde"
                />
                <span className="text-muted-foreground text-sm">a</span>
                <Input
                  type="date"
                  value={dateTo}
                  min={selectedDate || undefined}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full sm:w-[160px]"
                  disabled={!selectedDate}
                  title="Hasta (opcional)"
                />
              </div>
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por remito, cliente, descripción o usuario..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Button
                type="button"
                variant={agrupar ? "default" : "outline"}
                onClick={() => setAgrupar((v) => !v)}
                className="rounded-2xl whitespace-nowrap"
              >
                <Truck className="h-4 w-4 mr-1" />
                {agrupar ? "Por pedido" : "Cronológico"}
              </Button>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue placeholder="Todas las acciones" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las acciones</SelectItem>
                  {uniqueActions.map((action) => (
                    <SelectItem key={action} value={action}>
                      {ACTION_META[action]?.label || action}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {!selectedDate && !busquedaGlobal ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Shield className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-1">Seleccioná una fecha o buscá</h3>
              <p className="text-muted-foreground text-sm">
                Elegí un día (o un rango "desde / hasta"), o buscá directamente por número de
                remito o cliente sin poner fecha
              </p>
            </CardContent>
          </Card>
        ) : loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Shield className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-1">Sin registros</h3>
              <p className="text-muted-foreground text-sm">
                {entries.length === 0
                  ? "No hay movimientos de auditoria para esa búsqueda"
                  : "No hay registros que coincidan con el filtro"}
              </p>
            </CardContent>
          </Card>
        ) : agrupar ? (
          <div className="space-y-4">
            {grupos.map((g) => {
              const info = ordersInfo[g.orderId];
              const cliente = info?.clientName || g.clientName || "Cliente sin nombre";
              const remito = info?.remitoNumber || g.remitoNumber;
              const saleId = info?.saleId || g.saleId;
              const abierto = expandidos.has(g.orderId) || grupos.length === 1;
              const estado = info?.status
                ? statusConfig[info.status as OrderStatus]
                : undefined;
              return (
                <Card key={g.orderId} className="rounded-2xl overflow-hidden">
                  <CardHeader
                    className="cursor-pointer py-4"
                    onClick={() => toggleGrupo(g.orderId)}
                  >
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <CardTitle className="text-sm font-semibold flex items-center gap-x-2 gap-y-1 flex-wrap">
                          <Truck className="h-4 w-4 text-teal-600 shrink-0" />
                          <span className="truncate">{cliente}</span>
                          <span className="text-muted-foreground font-normal">
                            Pedido {numeroDePedido(g.orderId)}
                          </span>
                          {remito && (
                            <Badge variant="secondary" className="text-[10px]">
                              {remito}
                            </Badge>
                          )}
                          {estado && (
                            <Badge
                              variant="outline"
                              className={`text-[10px] ${estado.color} ${estado.bgColor} ${estado.borderColor}`}
                            >
                              {estado.label}
                            </Badge>
                          )}
                          {info?.saleNumber ? (
                            <Badge className="text-[10px] bg-emerald-600 hover:bg-emerald-600">
                              Venta {info.saleNumber}
                            </Badge>
                          ) : saleId ? (
                            <Badge className="text-[10px] bg-emerald-600 hover:bg-emerald-600">
                              Pasó a ventas
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] text-muted-foreground">
                              Sin cobrar
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground font-normal">
                            {g.entries.length} mov · {formatDateTime(g.ultima)}
                          </span>
                        </CardTitle>
                      </div>
                      <div className="flex items-center gap-2">
                        {saleId && (
                          <Button asChild variant="outline" size="sm" className="rounded-2xl">
                            <Link href={`/ventas?saleId=${saleId}`} onClick={(e) => e.stopPropagation()}>
                              Ver venta
                            </Link>
                          </Button>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {abierto ? "▲" : "▼"}
                        </span>
                      </div>
                    </div>
                  </CardHeader>

                  {abierto && (
                    <CardContent className="pt-0 space-y-4">
                      <div className="space-y-2">
                        {g.entries.map((entry) => {
                          const meta = ACTION_META[entry.action] || {
                            label: entry.action,
                            color: "bg-gray-500",
                            icon: Shield,
                          };
                          return (
                            <div key={entry.id} className="flex gap-3 text-sm">
                              <span className="text-xs text-muted-foreground w-24 shrink-0 tabular-nums">
                                {formatDateShort(entry.createdAt)} {formatTime(entry.createdAt)}
                              </span>
                              <div className="min-w-0">
                                <Badge variant="secondary" className="text-[10px] mr-2">
                                  {meta.label}
                                </Badge>
                                <span>{entry.description}</span>
                                <span className="text-muted-foreground"> · por {entry.userName}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {g.novedades.length > 0 && (
                        <div className="rounded-2xl bg-muted/40 p-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                            Novedades de la carga
                          </p>
                          <ul className="space-y-1 text-sm">
                            {g.novedades.map((n, i) => (
                              <li key={`${n.name}-${i}`} className="flex gap-2">
                                <span className="text-xs text-muted-foreground shrink-0">
                                  {formatDateShort(n.fecha)}
                                </span>
                                <span>{textoNovedad(n)}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {(info?.hojasRuta?.length ?? 0) > 0 && (
                        <div className="rounded-2xl bg-muted/40 p-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                            Hojas de ruta
                          </p>
                          <ul className="space-y-1 text-sm">
                            {info!.hojasRuta!.map((h) => {
                              const distinto =
                                h.remitoEnHoja && remito && h.remitoEnHoja !== remito;
                              return (
                                <li key={`${h.numero}-${h.fechaReparto}`} className="flex flex-wrap gap-x-2">
                                  <span className="font-medium">HR {h.numero}</span>
                                  <span className="text-muted-foreground">
                                    reparto {h.fechaReparto}
                                    {h.createdAt ? ` · impresa ${formatDateTime(h.createdAt)}` : ""}
                                  </span>
                                  {h.remitoEnHoja && (
                                    <span className={distinto ? "text-red-600 font-medium" : "text-muted-foreground"}>
                                      {distinto
                                        ? `⚠ en el papel figura ${h.remitoEnHoja}, el pedido hoy tiene ${remito}`
                                        : `remito ${h.remitoEnHoja}`}
                                    </span>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )}

                      {info?.notes && (
                        <p className="text-xs text-muted-foreground">
                          Nota del pedido: {info.notes}
                        </p>
                      )}
                    </CardContent>
                  )}
                </Card>
              );
            })}

            {sueltas.length > 0 && (
              <Card className="rounded-2xl">
                <CardHeader className="py-4">
                  <CardTitle className="text-base">Otros movimientos</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {sueltas.map((entry) => {
                    const meta = ACTION_META[entry.action] || {
                      label: entry.action,
                      color: "bg-gray-500",
                      icon: Shield,
                    };
                    return (
                      <div key={entry.id} className="flex gap-3 text-sm">
                        <span className="text-xs text-muted-foreground w-24 shrink-0 tabular-nums">
                          {formatDateShort(entry.createdAt)} {formatTime(entry.createdAt)}
                        </span>
                        <div className="min-w-0">
                          <Badge variant="secondary" className="text-[10px] mr-2">
                            {meta.label}
                          </Badge>
                          <span>{entry.description}</span>
                          <span className="text-muted-foreground"> · por {entry.userName}</span>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}
          </div>
        ) : (
          <Card>
            <CardContent className="p-0">
              {/* Tabla — desktop */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground uppercase tracking-wide">
                      <th className="px-4 py-3 font-medium whitespace-nowrap">Fecha y hora</th>
                      <th className="px-4 py-3 font-medium whitespace-nowrap">Acción</th>
                      <th className="px-4 py-3 font-medium">Movimiento</th>
                      <th className="px-4 py-3 font-medium whitespace-nowrap">Responsable</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filtered.map((entry) => {
                      const meta = ACTION_META[entry.action] || {
                        label: entry.action,
                        color: "bg-gray-500",
                        icon: Shield,
                      };
                      const Icon = meta.icon;
                      return (
                        <tr key={entry.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3 whitespace-nowrap text-muted-foreground align-top">
                            {formatDateTime(entry.createdAt)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap align-top">
                            <Badge variant="secondary" className="text-[10px] gap-1">
                              <Icon className={`h-3 w-3 ${meta.color.replace("bg-", "text-")}`} />
                              {meta.label}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 align-top">{entry.description}</td>
                          <td className="px-4 py-3 whitespace-nowrap align-top">{entry.userName}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Lista — mobile */}
              <div className="md:hidden divide-y">
                {filtered.map((entry) => {
                  const meta = ACTION_META[entry.action] || {
                    label: entry.action,
                    color: "bg-gray-500",
                    icon: Shield,
                  };
                  const Icon = meta.icon;
                  return (
                    <div
                      key={entry.id}
                      className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
                    >
                      <div
                        className={`h-8 w-8 rounded-full ${meta.color}/10 flex items-center justify-center shrink-0 mt-0.5`}
                      >
                        <Icon className={`h-4 w-4 ${meta.color.replace("bg-", "text-")}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="secondary" className="text-[10px]">
                            {meta.label}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {formatDateTime(entry.createdAt)}
                          </span>
                        </div>
                        <p className="text-sm mt-0.5">{entry.description}</p>
                        <p className="text-xs text-muted-foreground">
                          por {entry.userName}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </MainLayout>
  );
}
