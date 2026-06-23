//app\pedidos\page.tsx
"use client";

import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { MainLayout } from "@/components/layout/main-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DataTableSkeleton } from "@/components/ui/data-table-skeleton";
import { ClientModal } from "@/components/clientes/client-modal";
import { ordersApi, salesApi, clientsApi, sellersApi, productsApi, faltantesApi, hojaRutaApi } from "@/lib/api";
import type { Order, OrderStatus, Client, Seller } from "@/lib/types";
import { Package, Filter, Loader2, ClipboardList, FileText, Eye, ArrowRightCircle, ArrowLeftCircle, Ban, TrendingUp, ChevronDown, ChevronRight, MapPin, Phone, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { OrdersFilters } from "@/components/pedidos/orders-filters";

import { OrderDetailModal } from "@/components/pedidos/order-detail-modal";
import { PaymentModal, type ItemAdjustment } from "@/components/pedidos/payment-modal";
import { SuccessModal } from "@/components/pedidos/success-modal";
import { StockCheckModal, type StockCheckItem, type ReplacementOption } from "@/components/pedidos/stock-check-modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { statusConfig } from "@/lib/order-constants";
import { formatCurrency as formatPrice } from "@/lib/utils/format";
import { salidasRemito, reconciliarCobro, reposicionEliminarRemito } from "@/lib/utils/stock-remito";
import { ordersToMoveAll, ordersToMoveSelected } from "@/lib/utils/order-move";

export const generateOrderNumber = (date: Date, index: number) => {
  const d = new Date(date);
  const year = d.getFullYear().toString().slice(-2);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}${month}${day}-${String(index + 1).padStart(4, "0")}`;
};

export const calculateOrderTotal = (order: Order) => {
  const itemsTotal = order.items.reduce((acc, item) => {
    const base = item.quantity * item.price;
    const dto = item.itemDiscount ? (base * item.itemDiscount) / 100 : 0;
    return acc + base - dto;
  }, 0);
  if (order.discount && order.discount > 0) {
    const discountAmt = order.discountType === "percent"
      ? (itemsTotal * order.discount) / 100
      : order.discount;
    return Math.max(0, itemsTotal - discountAmt);
  }
  return itemsTotal;
};

export default function PedidosPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  // Precio de venta actual por id de producto (para detectar pedidos con precios viejos)
  const [priceMap, setPriceMap] = useState<Map<string, number>>(new Map());
  const [syncingPrices, setSyncingPrices] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [generatingDoc, setGeneratingDoc] = useState(false);

  // Filtros
  const [filterStatus, setFilterStatus] = useState<string>("pending");
  const [filterClient, setFilterClient] = useState<string>("");
  const [filterSeller, setFilterSeller] = useState<string>("");
  const [filterTransportista, setFilterTransportista] = useState<string>("");
  const [filterDate, setFilterDate] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Modales
  const [activeModal, setActiveModal] = useState<
    "detail" | "payment" | "success" | null
  >(null);
  const [detailOrder, setDetailOrder] = useState<Order | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // Payment state
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [clientSearch, setClientSearch] = useState("");
  const [showClientModal, setShowClientModal] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false);
  // Guarda sincrónica contra doble ejecución del cobro (evita ventas duplicadas)
  const completingRef = useRef(false);
  // Trazabilidad 1 pedido = 1 remito = 1 venta: el cobro es SIEMPRE de un solo pedido
  const [selectedClientOrders, setSelectedClientOrders] = useState<Order[]>([]);

  const [generandoExcel, setGenerandoExcel] = useState(false);

  // Pedidos retenidos (no avanzan con "Todos a...") — por id de pedido
  const [heldOrderIds, setHeldOrderIds] = useState<Set<string>>(new Set());
  // Confirmación de eliminación de pedido(s)
  const [pendingDelete, setPendingDelete] = useState<{ ids: string[]; label: string } | null>(null);

  const toggleHeldOrder = useCallback((orderId: string, clientName: string) => {
    let willHold = false;
    setHeldOrderIds(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) { next.delete(orderId); willHold = false; }
      else { next.add(orderId); willHold = true; }
      return next;
    });
    // Persistir en BD para que otros admins lo vean y no avance aunque pase el tiempo
    ordersApi.setOrderHeld(orderId, willHold).catch(() => {
      toast.error("No se pudo guardar el estado retenido");
    });
    // Al retener, ofrecer eliminar ese pedido (modal del sistema)
    if (willHold) {
      setPendingDelete({ ids: [orderId], label: clientName });
    }
  }, []);

  // Selección de pedidos para acciones en lote — por id de pedido
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  // Días tildados con el checkbox de día (para exportar/listar solo esos días)
  const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set());

  const toggleSelectedOrder = useCallback((orderId: string) => {
    setSelectedOrderIds(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId); else next.add(orderId);
      return next;
    });
  }, []);

  // Stock check modal
  const [stockCheckOpen, setStockCheckOpen] = useState(false);
  const [stockCheckItems, setStockCheckItems] = useState<StockCheckItem[]>([]);
  const [stockCheckOrder, setStockCheckOrder] = useState<Order | null>(null);


  // Success state
  const [lastSaleResult, setLastSaleResult] = useState<{
    paymentType: string;
    paymentMethod?: string;
    total: number;
    originalTotal?: number;
    discountLabel?: string;
    saleId: string;
    client?: Client;
    paymentLabel?: string;
  } | null>(null);

  // Solo pedidos activos (liviano: sin completados ni PDFs base64). Es lo único que se
  // refresca: clientes/vendedores/productos se cargan una sola vez en loadStaticData.
  const loadData = useCallback(async (isMounted?: () => boolean) => {
    try {
      const ordersData = await ordersApi.getActive();
      if (isMounted && !isMounted()) return;
      const sortedOrders = ordersData.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      setOrders(sortedOrders);
      // Reconstruir retenidos desde la BD (held) para que persistan entre admins y recargas
      const heldFromDb = new Set(
        sortedOrders.filter((o) => o.held && o.status !== "completed").map((o) => o.id)
      );
      setHeldOrderIds(heldFromDb);
    } catch (error) {
      if (isMounted && !isMounted()) return;
      toast.error("Error al cargar pedidos");
    } finally {
      if (isMounted && !isMounted()) return;
      setLoading(false);
    }
  }, []);

  // Datos que casi no cambian: una sola carga al montar la página
  const loadStaticData = useCallback(async (isMounted?: () => boolean) => {
    try {
      const [clientsData, sellersData, productsData] = await Promise.all([
        clientsApi.getAll(),
        sellersApi.getAll(),
        productsApi.getAll(),
      ]);
      if (isMounted && !isMounted()) return;
      setClients(clientsData);
      setSellers(sellersData);
      // Mapa de precio actual: indexado por id de producto (prod_mp_XXX) y su alias mayorista (mp_XXX)
      const pm = new Map<string, number>();
      productsData.forEach((p) => {
        const precio = Number(p.price) || 0;
        if (precio <= 0) return;
        pm.set(p.id, precio);
        if (p.id.startsWith("prod_")) pm.set(p.id.slice(5), precio);
      });
      setPriceMap(pm);
    } catch {
      // Si falla, la página sigue con los pedidos; los datos estáticos se reintentan al recargar
    }
  }, []);

  const generateRemitoForOrder = useCallback(async (order: Order, excludeProductIds: string[] = [], replacements: Record<string, ReplacementOption> = {}, quantities: Record<string, number> = {}) => {
    setGeneratingDoc(true);
    // El stock se descuenta al generar el remito (la mercadería sale del depósito). Si este pedido
    // ya lo descontó antes (regenerar remito / reimprimir PDF), no volver a descontar.
    const yaDescontado = order.stockDescontado === true;
    try {
      // Aplicar cantidades editadas y reemplazos por otra marca (mantiene descuento %, cambia producto/precio).
      // El descuento es un porcentaje: se preserva y se aplica sobre el nuevo precio.
      let huboCambioCantidad = false;
      const replacedItems = order.items.map((i: any) => {
        const nuevaCant = quantities[i.productId];
        const cant = nuevaCant != null && nuevaCant !== i.quantity ? (huboCambioCantidad = true, nuevaCant) : i.quantity;
        const r = replacements[i.productId];
        if (!r) return cant !== i.quantity ? { ...i, quantity: cant } : i;
        return { ...i, productId: r.productId, name: r.name, price: r.price, codigo: r.codigo, quantity: cant };
      });

      const filteredItems = excludeProductIds.length > 0
        ? replacedItems.filter((i: any) => !excludeProductIds.includes(i.productId))
        : replacedItems;

      if (filteredItems.length === 0) {
        toast.error("No quedan productos para generar el remito");
        return;
      }

      // Historial de faltantes del cliente: registrar lo que NO se le envía (excluido)
      // y quitar del historial lo que sí se le envía en este remito.
      const clienteId = order.clientId;
      if (clienteId) {
        const faltantesParaRegistrar = order.items
          .filter((i: any) => excludeProductIds.includes(i.productId))
          .map((i: any) => ({ productId: i.productId, name: i.name, quantity: quantities[i.productId] ?? i.quantity }));
        // Incluir tanto los IDs post-reemplazo como los IDs originales para limpiar faltantes
        // aunque el producto A haya sido reemplazado por B (A faltante sigue en la tabla si solo se quita B).
        const originalIdsNoExcluidos = order.items
          .filter((i: any) => !excludeProductIds.includes(i.productId))
          .map((i: any) => i.productId)
          .filter(Boolean);
        const enviados = [...new Set([
          ...filteredItems.map((i: any) => i.productId),
          ...originalIdsNoExcluidos,
        ])].filter(Boolean);
        try {
          if (faltantesParaRegistrar.length > 0) await faltantesApi.registrar(clienteId, faltantesParaRegistrar, order.id);
          if (enviados.length > 0) await faltantesApi.quitar(clienteId, enviados);
        } catch { /* tabla cliente_faltantes aún no creada — no bloquear el remito */ }
      }

      // Trazabilidad 1 pedido = 1 remito = 1 venta: el remito se genera SOLO sobre este pedido.
      // No se consolidan ni se borran otros pedidos del cliente.
      await supabase.from("pedidos").update({ items: filteredItems }).eq("id", order.id);
      order = { ...order, items: filteredItems };
      setOrders((prev) => prev.map((o) => (o.id === order.id ? order : o)));
      if (detailOrder?.id === order.id) setDetailOrder(order);

      // Si el pedido ya tiene remito, regenerar conservando el MISMO número (no quemar uno nuevo).
      // Si no, pedir un número único y consecutivo (función atómica en Postgres).
      let remitoNumber = order.remitoNumber;
      if (!remitoNumber) {
        const { data, error: remitoErr } = await supabase.rpc("next_remito_number");
        if (remitoErr || !data) {
          toast.error("Error al generar el número de remito");
          return;
        }
        remitoNumber = data;
      }

      const total = calculateOrderTotal(order);
      const ventaData = {
        id: order.id,
        clientName: order.clientName,
        sellerName: order.sellerName,
        items: order.items.map((i: any) => ({ name: i.name, quantity: i.quantity, price: i.price, ...(i.codigo ? { codigo: i.codigo } : {}), ...(i.itemDiscount ? { itemDiscount: i.itemDiscount } : {}) })),
        total,
        paymentType: "cash" as const,
        createdAt: order.createdAt,
        deliveryAddress: order.address,
        remitoNumber,
      };

      const { generarPdfCliente } = await import("@/hooks/useGenerarPdf");
      const pdfBase64 = await generarPdfCliente(ventaData, "remito");
      let updatedOrder = await ordersApi.saveRemitoToOrder(order.id, remitoNumber, pdfBase64);

      // Descontar stock de lo que va en el remito (sale del depósito). Una sola vez por pedido.
      if (!yaDescontado) {
        const { registrarMovimiento } = await import("@/services/stock-service");
        for (const mov of salidasRemito(filteredItems as any[])) {
          await registrarMovimiento({
            productoId: mov.productId,
            tipo: "venta",
            cantidad: mov.cantidad,
            referencia: `Remito ${remitoNumber}`,
          });
        }
        await ordersApi.markStockDescontado(order.id);
        updatedOrder = { ...updatedOrder, stockDescontado: true };
      }

      setOrders((prev) => prev.map((o) => (o.id === order.id ? updatedOrder : o)));
      if (detailOrder?.id === order.id) setDetailOrder(updatedOrder);

      const link = document.createElement("a");
      link.href = `data:application/pdf;base64,${pdfBase64}`;
      link.download = `remito-${remitoNumber}.pdf`;
      link.click();
    } catch (error) {
      toast.error("Error al generar el remito");
    } finally {
      setGeneratingDoc(false);
    }
  }, [detailOrder, orders]);

  const handleGenerateRemito = useCallback(async (order: Order) => {
    // Si el remito ya existe, bajar su PDF on-demand (la lista no trae los base64)
    if (order.remitoNumber) {
      const pdf = order.remitoPdfBase64 || (await ordersApi.getRemitoPdf(order.id));
      if (pdf) {
        const link = document.createElement("a");
        link.href = `data:application/pdf;base64,${pdf}`;
        link.download = `remito-${order.remitoNumber}.pdf`;
        link.click();
        return;
      }
    }

    // Verificar stock de cada producto
    // Los items de pedidos usan IDs de mayorista_productos (mp_XXXXX)
    // pero el stock está en productos con ID prod_mp_XXXXX
    const productIds = order.items.map((i) => i.productId).filter(Boolean);
    const prodIds = productIds.map((id) => id.startsWith("mp_") ? `prod_${id}` : id);
    const stockMap = new Map<string, number>();
    if (prodIds.length > 0) {
      for (let i = 0; i < prodIds.length; i += 500) {
        const chunk = prodIds.slice(i, i + 500);
        const { data } = await supabase.from("productos").select("id, stock").in("id", chunk);
        (data ?? []).forEach((p: any) => stockMap.set(p.id, p.stock ?? 0));
      }
    }

    const checkItems: StockCheckItem[] = order.items.map((item) => {
      const prodId = item.productId.startsWith("mp_") ? `prod_${item.productId}` : item.productId;
      return {
        productId: item.productId,
        name: item.name,
        quantity: item.quantity,
        stock: stockMap.get(prodId) ?? 0,
      };
    });

    // Siempre mostrar el modal para poder ajustar cantidades, reemplazar o excluir antes de generar
    setStockCheckItems(checkItems);
    setStockCheckOrder(order);
    setStockCheckOpen(true);
  }, [detailOrder, generateRemitoForOrder]);

  const handleStockCheckConfirm = useCallback(async (excludeProductIds: string[], replacements: Record<string, ReplacementOption>, quantities: Record<string, number>) => {
    setStockCheckOpen(false);
    if (stockCheckOrder) {
      await generateRemitoForOrder(stockCheckOrder, excludeProductIds, replacements, quantities);
    }
    setStockCheckOrder(null);
    setStockCheckItems([]);
  }, [stockCheckOrder, generateRemitoForOrder]);

  // Busca productos del mismo tipo (otra marca) con stock para reemplazar un faltante
  const findReplacements = useCallback(async (item: StockCheckItem): Promise<ReplacementOption[]> => {
    const firstWord = (item.name || "").trim().split(/\s+/).find((w) => w.length >= 3) || item.name;
    const origProd = item.productId.startsWith("mp_") ? `prod_${item.productId}` : item.productId;
    const { data } = await supabase
      .from("productos")
      .select("id, name, price, stock, codigo")
      .ilike("name", `${firstWord}%`)
      .gt("stock", 0)
      .limit(20);
    return (data ?? [])
      .filter((p: any) => p.id !== origProd && (p.stock ?? 0) >= item.quantity && Number(p.price) > 0)
      .map((p: any) => ({
        productId: p.id,
        name: p.name,
        price: Number(p.price) || 0,
        stock: p.stock ?? 0,
        codigo: p.codigo ?? undefined,
      }));
  }, []);

  // Búsqueda libre de productos con stock para reemplazar un faltante
  const searchReplacementProducts = useCallback(async (query: string, item: StockCheckItem): Promise<ReplacementOption[]> => {
    const q = query.trim();
    if (q.length < 2) return [];
    const origProd = item.productId.startsWith("mp_") ? `prod_${item.productId}` : item.productId;
    const { data } = await supabase
      .from("productos")
      .select("id, name, price, stock, codigo")
      .or(`name.ilike.%${q}%,codigo.ilike.%${q}%`)
      .gt("stock", 0)
      .limit(20);
    return (data ?? [])
      .filter((p: any) => p.id !== origProd && Number(p.price) > 0)
      .map((p: any) => ({
        productId: p.id,
        name: p.name,
        price: Number(p.price) || 0,
        stock: p.stock ?? 0,
        codigo: p.codigo ?? undefined,
      }));
  }, []);

  const handleDeleteOrder = useCallback((order: Order) => {
    setPendingDelete({ ids: [order.id], label: order.clientName || "este cliente" });
  }, []);

  const handleDeleteRemito = useCallback(async (order: Order) => {
    try {
      // Si el stock ya se había descontado al generar el remito, reponerlo: eliminar el remito
      // revierte la salida. Al regenerar se vuelve a descontar con las cantidades correctas.
      const reposiciones = reposicionEliminarRemito(order.stockDescontado === true, order.items as any[]);
      if (reposiciones.length > 0) {
        const { registrarMovimiento } = await import("@/services/stock-service");
        for (const mov of reposiciones) {
          await registrarMovimiento({
            productoId: mov.productId,
            tipo: "ajuste",
            cantidad: mov.cantidad, // entrada: vuelve al stock
            referencia: `Eliminación remito ${order.remitoNumber ?? ""} pedido #${order.id}`.trim(),
          });
        }
      }
      const updated = await ordersApi.deleteRemito(order.id);
      setOrders((prev) => prev.map((o) => (o.id === order.id ? updated : o)));
      if (detailOrder?.id === order.id) setDetailOrder(updated);
      toast.success("Remito eliminado — stock repuesto, podés generarlo de nuevo");
      // Confirmar contra la BD para que no quede mostrándose en el listado de carga
      loadData();
    } catch {
      toast.error("Error al eliminar el remito");
    }
  }, [detailOrder, loadData]);

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    const { ids, label } = pendingDelete;
    try {
      await Promise.all(ids.map((id) => ordersApi.deleteOrder(id)));
      setOrders((prev) => prev.filter((o) => !ids.includes(o.id)));
      setHeldOrderIds((prev) => { const n = new Set(prev); ids.forEach((id) => n.delete(id)); return n; });
      setActiveModal(null);
      setDetailOrder(null);
      toast.success(ids.length > 1 ? "Pedidos eliminados" : "Pedido eliminado");
    } catch {
      toast.error("No se pudo eliminar el pedido");
    } finally {
      setPendingDelete(null);
    }
  }, [pendingDelete]);

  // handleGenerateInvoice — deshabilitado temporalmente
  const handleGenerateInvoice = useCallback(async (_order: Order) => {}, []);

  const handleAssignTransportista = useCallback(async (orderId: string, transportistaId: string, transportistaName: string) => {
    try {
      const updated = await ordersApi.assignTransportista(orderId, transportistaId, transportistaName);
      setOrders((prev) => prev.map((o) => (o.id === orderId ? updated : o)));
      if (detailOrder?.id === orderId) setDetailOrder(updated);
    } catch (error) {
      toast.error("Error al asignar transportista");
    }
  }, [detailOrder]);

  const handleRemoveTransportista = useCallback(async (orderId: string) => {
    try {
      const updated = await ordersApi.removeTransportista(orderId);
      setOrders((prev) => prev.map((o) => (o.id === orderId ? updated : o)));
      if (detailOrder?.id === orderId) setDetailOrder(updated);
    } catch (error) {
      toast.error("Error al desasignar transportista");
    }
  }, [detailOrder]);

  const handleUpdateItems = useCallback(async (orderId: string, items: Order["items"]) => {
    try {
      const updated = await ordersApi.updateItems(orderId, items);
      setOrders((prev) => prev.map((o) => (o.id === orderId ? updated : o)));
      if (detailOrder?.id === orderId) setDetailOrder(updated);
      toast.success("Descuentos actualizados");
    } catch (error) {
      toast.error("Error al actualizar los descuentos");
    }
  }, [detailOrder]);

  useEffect(() => {
    let active = true;
    setMounted(true);
    loadData(() => active);
    loadStaticData(() => active);
    return () => { active = false; };
  }, [loadData, loadStaticData]);

  // Realtime: cambios en `pedidos` llegan por websocket — solo baja datos cuando algo cambia.
  // Requiere la tabla agregada a la publicación supabase_realtime.
  useEffect(() => {
    const channel = supabase
      .channel("pedidos-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "pedidos" }, async (payload) => {
        const { mapOrder } = await import("@/services/orders-service");
        if (payload.eventType === "DELETE") {
          const oldId = (payload.old as any)?.id;
          if (oldId) setOrders((prev) => prev.filter((o) => o.id !== oldId));
          return;
        }
        const row = payload.new as Record<string, any>;
        if (!row?.id) return;
        const order = mapOrder(row);
        // No mantener PDFs base64 en memoria (vienen en el payload del UPDATE)
        order.remitoPdfBase64 = undefined;
        order.invoicePdfBase64 = undefined;
        setOrders((prev) => {
          if (order.status === "completed" || order.status === "rechazado") {
            return prev.filter((o) => o.id !== order.id);
          }
          const exists = prev.some((o) => o.id === order.id);
          return exists ? prev.map((o) => (o.id === order.id ? order : o)) : [order, ...prev];
        });
        setHeldOrderIds((prev) => {
          const isHeld = order.held && order.status !== "completed";
          if (isHeld === prev.has(order.id)) return prev;
          const next = new Set(prev);
          if (isHeld) next.add(order.id); else next.delete(order.id);
          return next;
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // El transportista entra directo a la solapa de reparto
  const [appliedTransportistaTab, setAppliedTransportistaTab] = useState(false);
  useEffect(() => {
    if (appliedTransportistaTab || !user) return;
    if (user.employeeType === "transportista") {
      setFilterStatus("delivery");
    }
    setAppliedTransportistaTab(true);
  }, [user, appliedTransportistaTab]);

  // Fallback del realtime: refresco cada 10 min y al volver a la pestaña, por si el
  // websocket se cayó. Solo recarga si la pestaña está visible (egress).
  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") loadData();
    };
    const interval = setInterval(refreshIfVisible, 600000);
    document.addEventListener("visibilitychange", refreshIfVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [loadData]);

  useEffect(() => {
    if (selectedOrder?.clientId) {
      setSelectedClientId(selectedOrder.clientId);
    } else if (selectedOrder) {
      setSelectedClientId("");
    }
  }, [selectedOrder]);

  const handleStatusChange = useCallback(async (
    orderId: string,
    newStatus: OrderStatus,
  ) => {
    if (newStatus === "completed") {
      const order = orders.find((o) => o.id === orderId);
      if (order) {
        // Trazabilidad 1 pedido = 1 remito = 1 venta: se cobra SOLO este pedido,
        // sin juntar otros pedidos del mismo cliente.
        if (order.status === "delivery" && !order.remitoNumber) {
          toast.error("Este pedido no tiene remito. En reparto solo se cobra lo del remito: generá el remito o eliminá el pedido.");
          return;
        }

        setSelectedClientOrders([order]);
        setActiveModal(null);
        setDetailOrder(null);
        setSelectedOrder(order);
        setActiveModal("payment");
      }
      return;
    }

    // Remito obligatorio antes de pasar a reparto
    if (newStatus === "delivery") {
      const order = orders.find((o) => o.id === orderId);
      if (order && !order.remitoNumber) {
        toast.error("El remito es obligatorio antes de pasar a reparto. Generá el remito primero.");
        return;
      }
    }

    try {
      const updated = await ordersApi.updateStatus(orderId, newStatus);
      setOrders((prev) => prev.map((o) => (o.id === orderId ? updated : o)));
      if (detailOrder?.id === orderId) {
        setDetailOrder(updated);
      }
    } catch (error) {
      toast.error("Error al actualizar estado del pedido");
    }
  }, [orders, detailOrder]);

  const handleCompleteOrder = useCallback(async (
    adjustments: ItemAdjustment[] = [],
    payments: { efectivo: number; transferencia: number; cuentaCorriente: number } = { efectivo: 0, transferencia: 0, cuentaCorriente: 0 },
    comprobanteFile?: File
  ) => {
    if (!selectedOrder) return;
    // Guarda sincrónica: si ya hay un cobro en curso, ignorar el segundo disparo (doble click).
    if (completingRef.current) return;
    completingRef.current = true;
    setProcessingPayment(true);

    try {
      // Idempotencia: releer el estado real de los pedidos a cobrar. Sin realtime, la lista en
      // memoria puede estar stale y permitir cobrar dos veces el mismo pedido (venta duplicada).
      const ordersToCheck = selectedClientOrders.length > 0 ? selectedClientOrders : [selectedOrder];
      const { data: estadoActual } = await supabase
        .from("pedidos")
        .select("id, status")
        .in("id", ordersToCheck.map((o) => o.id));
      if ((estadoActual || []).some((p: any) => p.status === "completed")) {
        toast.error("Este pedido ya fue cobrado. Recargá la lista (F5).");
        setActiveModal(null);
        setSelectedOrder(null);
        loadData();
        return;
      }

      // Aplicar ajustes a los items
      // - rotura: se rompió → descontar stock + registrar pérdida
      // - faltante: error humano, está en stock → solo quitar del pedido
      // - no_quiere: cliente no lo quiere → quitar del pedido (stock no se tocó)
      const adjByProduct = new Map<string, { rotura: number; faltante: number; no_quiere: number }>();
      for (const a of adjustments) {
        const current = adjByProduct.get(a.productId) || { rotura: 0, faltante: 0, no_quiere: 0 };
        current[a.type === "rotura" ? "rotura" : a.type === "faltante" ? "faltante" : "no_quiere"] += a.quantity;
        adjByProduct.set(a.productId, current);
      }

      const adjustedItems = selectedOrder.items
        .map(item => {
          const adj = adjByProduct.get(item.productId);
          if (!adj) return item;
          const totalDeduccion = adj.rotura + adj.faltante + adj.no_quiere;
          return { ...item, quantity: item.quantity - totalDeduccion };
        })
        .filter(item => item.quantity > 0);

      const roturasAdj = adjustments.filter(a => a.type === "rotura");
      const faltantesAdj = adjustments.filter(a => a.type === "faltante");
      const noQuiereAdj = adjustments.filter(a => a.type === "no_quiere");

      // ¿El stock ya se descontó al generar el remito? Entonces no se vuelve a descontar al cobrar.
      const stockYaDescontado = selectedOrder.stockDescontado === true;

      // Reconciliar stock al cobrar: si ya se descontó en el remito, repone faltante/no_quiere
      // (rotura queda como pérdida); si no, descuenta la rotura. Lógica pura en stock-remito.ts.
      const movsCobro = reconciliarCobro(
        stockYaDescontado,
        adjustments.map((a) => ({ productId: a.productId, type: a.type as any, quantity: a.quantity })),
      );
      if (movsCobro.length > 0) {
        const { registrarMovimiento } = await import("@/services/stock-service");
        const nombreDe = new Map(adjustments.map((a) => [a.productId, a.productName]));
        for (const mov of movsCobro) {
          const esReposicion = mov.cantidad > 0;
          await registrarMovimiento({
            productoId: mov.productId,
            tipo: esReposicion ? "ajuste" : "rotura",
            cantidad: mov.cantidad,
            referencia: `${esReposicion ? "Devolución/faltante" : "Rotura"} cobro pedido #${selectedOrder.id} — ${nombreDe.get(mov.productId) ?? ""}`.trim(),
          });
        }
      }

      // Si no quedan items para vender (todo rotura), solo completar el pedido sin venta
      if (adjustedItems.length === 0) {
        const updated = await ordersApi.completeOrder(selectedOrder.id, "");
        setOrders((prev) =>
          prev.map((o) => (o.id === selectedOrder.id ? updated : o)),
        );

        // Registrar pérdida en caja usando ID de pedido (sin número de venta)
        if (roturasAdj.length > 0) {
          const { supabase: sb } = await import("@/lib/supabase");
          const totalPerdida = roturasAdj.reduce((acc, r) => acc + r.unitPrice * r.quantity, 0);
          const productosRotos = roturasAdj.map(r => `${r.productName} x${r.quantity}`).join(", ");
          sb.from("transacciones").insert({
            id: `perdida_${selectedOrder.id}_${Date.now()}`,
            client_id: null,
            type: "payment",
            amount: -totalPerdida,
            description: `[ROTURA] Pedido #${selectedOrder.id} — ${productosRotos}`,
            date: new Date().toISOString(),
          }).then(() => {}).catch(() => {});
        }

        toast.success("Pedido cerrado — roturas registradas como pérdida");
        setActiveModal(null);
        setSelectedOrder(null);
        setSelectedClientId("");
        setProcessingPayment(false);
        return;
      }

      // Calcular total con items ajustados
      const itemsTotal = adjustedItems.reduce((acc, item) => {
        const base = item.price * item.quantity;
        const dto = item.itemDiscount ? (base * item.itemDiscount) / 100 : 0;
        return acc + base - dto;
      }, 0);
      const disc = (selectedOrder as any).discount ?? 0;
      const total = disc > 0
        ? Math.max(0, itemsTotal - ((selectedOrder as any).discountType === "percent" ? (itemsTotal * disc) / 100 : disc))
        : itemsTotal;

      const { efectivo, transferencia, cuentaCorriente } = payments;
      const cashTotal = efectivo + transferencia;
      const hasCuentaCorriente = cuentaCorriente > 0;

      const salePaymentType: "cash" | "credit" | "mixed" =
        hasCuentaCorriente && cashTotal > 0 ? "mixed" :
        hasCuentaCorriente ? "credit" : "cash";

      const primaryMethod: "efectivo" | "transferencia" =
        transferencia > 0 && efectivo === 0 ? "transferencia" : "efectivo";

      const resolvedClientId = selectedClientId || selectedOrder.clientId;
      const client = clients.find((c) => c.id === resolvedClientId);

      if (hasCuentaCorriente && !resolvedClientId) {
        throw new Error("Debe seleccionar un cliente para cuenta corriente");
      }

      // Traer la config de oferta VIGENTE de cada producto para aplicarla al cobrar.
      // El item del pedido usa el id de mayorista (mp_XXX); la config vive en productos (prod_mp_XXX).
      const normId = (pid: string) => (pid?.startsWith("mp_") ? `prod_${pid}` : pid);
      const ofertaProductos = await productsApi.getByIds(adjustedItems.map((i) => normId(i.productId)));
      const ofertaMap = new Map(ofertaProductos.map((p) => [p.id, p]));

      const sale = await salesApi.processSale({
        clientId: resolvedClientId,
        clientName: client?.name || selectedOrder.clientName,
        clientPhone: client?.phone,
        sellerId: selectedOrder.sellerId,
        sellerName: selectedOrder.sellerName,
        items: adjustedItems.map((item) => {
          const cfg = ofertaMap.get(normId(item.productId));
          return {
          product: {
            id: item.productId,
            name: item.name,
            price: item.price,
            stock: 100,
            description: "",
            imageUrl: "",
            category: "",
            createdAt: new Date(),
            descuento: cfg?.descuento ?? 0,
            regaloMismo: cfg?.regaloMismo ?? false,
            regaloMismoMax: cfg?.regaloMismoMax ?? null,
            regaloOtroMax: cfg?.regaloOtroMax ?? null,
            regaloProductoId: cfg?.regaloProductoId ?? null,
            regaloProductoNombre: cfg?.regaloProductoNombre ?? null,
          },
          quantity: item.quantity,
          itemDiscount: item.itemDiscount ?? undefined,
          };
        }),
        discount: (selectedOrder as any).discount ?? undefined,
        discountType: (selectedOrder as any).discountType ?? undefined,
        paymentType: salePaymentType,
        paymentMethod: primaryMethod,
        cashAmount: cashTotal > 0 ? cashTotal : undefined,
        creditAmount: hasCuentaCorriente ? cuentaCorriente : undefined,
        source: "order",
        createOrder: false,
        orderId: selectedOrder.id,
        skipStock: stockYaDescontado, // el stock ya salió al generar el remito
        deliveryMethod:
          selectedOrder.address === "Retiro en local" ? "pickup" : "delivery",
        deliveryAddress: selectedOrder.address,
      });

      // Guardar desglose efectivo/transferencia
      supabase.from("ventas").update({
        efectivo_amount: efectivo > 0 ? efectivo : null,
        transferencia_amount: transferencia > 0 ? transferencia : null,
      }).eq("id", sale.id).then(() => {}).catch(() => {});

      // Limpiar del historial de faltantes los productos que sí se entregaron.
      // Esto complementa el quitar en generateRemito para cubrir ventas directas y ajustes de cobro.
      if (resolvedClientId && adjustedItems.length > 0) {
        const entregadosIds = adjustedItems.map((i: any) => i.productId).filter(Boolean);
        faltantesApi.quitar(resolvedClientId, entregadosIds).catch(() => {});
      }

      // Guardar items no entregados (con precio completo) en la venta
      if (adjustments.length > 0) {
        const noEntregados = adjustments.map(adj => {
          const orderItem = selectedOrder.items.find((i: any) => i.productId === adj.productId);
          return {
            name: adj.productName,
            price: orderItem?.price ?? adj.unitPrice,
            quantity: adj.quantity,
            itemDiscount: orderItem?.itemDiscount ?? 0,
            codigo: (orderItem as any)?.codigo ?? undefined,
            motivo: adj.type === 'no_quiere' ? 'no_quiso' : adj.type,
          };
        });
        supabase.from("ventas").update({ items_no_entregados: noEntregados }).eq("id", sale.id).then(() => {}).catch(() => {});
      }

      // Registrar roturas y faltantes en transacciones usando el saleNumber
      if (roturasAdj.length > 0) {
        const totalPerdida = roturasAdj.reduce((acc, r) => acc + r.unitPrice * r.quantity, 0);
        const productosRotos = roturasAdj.map(r => `${r.productName} x${r.quantity}`).join(", ");
        supabase.from("transacciones").insert({
          id: `perdida_${sale.id}_${Date.now()}`,
          client_id: null,
          type: "payment",
          amount: -totalPerdida,
          description: `[ROTURA] #${sale.saleNumber} — ${productosRotos}`,
          sale_id: sale.id,
          date: new Date().toISOString(),
        }).then(() => {}).catch(() => {});
      }
      if (faltantesAdj.length > 0) {
        const productosFaltantes = faltantesAdj.map(r => `${r.productName} x${r.quantity}`).join(", ");
        supabase.from("transacciones").insert({
          id: `faltante_${sale.id}_${Date.now()}`,
          client_id: null,
          type: "payment",
          amount: 0,
          description: `[FALTANTE] #${sale.saleNumber} — ${productosFaltantes}`,
          sale_id: sale.id,
          date: new Date().toISOString(),
        }).then(() => {}).catch(() => {});
      }
      if (noQuiereAdj.length > 0) {
        const productosNoQuiere = noQuiereAdj.map(r => `${r.productName} x${r.quantity}`).join(", ");
        supabase.from("transacciones").insert({
          id: `no_quiere_${sale.id}_${Date.now()}`,
          client_id: null,
          type: "payment",
          amount: 0,
          description: `[NO_QUIERE] #${sale.saleNumber} — ${productosNoQuiere}`,
          sale_id: sale.id,
          date: new Date().toISOString(),
        }).then(() => {}).catch(() => {});
      }

      // Completar SOLO el pedido cobrado (1 pedido = 1 venta)
      const ordersToComplete = selectedClientOrders.length > 0 ? selectedClientOrders : [selectedOrder];
      const completedOrders = await Promise.all(
        ordersToComplete.map((o) => ordersApi.completeOrder(o.id, sale.id))
      );
      setOrders((prev) =>
        prev.map((o) => {
          const completedVersion = completedOrders.find((c) => c.id === o.id);
          return completedVersion ?? o;
        }),
      );

      // Boleta — deshabilitado temporalmente
      // if (selectedOrder.invoiceNumber && selectedOrder.invoicePdfBase64) {
      //   const orderAny = selectedOrder as any;
      //   await salesApi.saveBoletaToSale(
      //     sale.id,
      //     selectedOrder.invoiceNumber,
      //     selectedOrder.invoicePdfBase64,
      //     orderAny.afipData ? { afipData: orderAny.afipData } : undefined,
      //   );
      // }

      // Regenerar el remito con los ítems y total FINALES de la venta (después de roturas/ajustes).
      // Esto garantiza que el PDF descargable coincide con lo que se cobró.
      if (selectedOrder.remitoNumber) {
        try {
          const { generarPdfCliente } = await import("@/hooks/useGenerarPdf");
          const remitoData = {
            id: sale.id,
            clientName: sale.clientName || selectedOrder.clientName,
            sellerName: sale.sellerName || selectedOrder.sellerName,
            items: adjustedItems.map((i: any) => ({
              name: i.name,
              quantity: i.quantity,
              price: i.price,
              ...(i.codigo ? { codigo: i.codigo } : {}),
              ...(i.itemDiscount ? { itemDiscount: i.itemDiscount } : {}),
            })),
            total: sale.total,
            discount: (selectedOrder as any).discount ?? undefined,
            discountType: (selectedOrder as any).discountType ?? undefined,
            paymentType: "cash" as const,
            createdAt: sale.createdAt,
            deliveryAddress: selectedOrder.address,
            remitoNumber: selectedOrder.remitoNumber,
          };
          const newRemitoPdf = await generarPdfCliente(remitoData, "remito");
          await salesApi.saveRemitoToSale(sale.id, selectedOrder.remitoNumber, newRemitoPdf);
          await ordersApi.saveRemitoToOrder(selectedOrder.id, selectedOrder.remitoNumber, newRemitoPdf);
        } catch {
          // Si falla la regeneración, copiar el PDF anterior como fallback
          const remitoPdf = selectedOrder.remitoPdfBase64 || (await ordersApi.getRemitoPdf(selectedOrder.id));
          if (remitoPdf) await salesApi.saveRemitoToSale(sale.id, selectedOrder.remitoNumber, remitoPdf);
        }
      }

      // Subir comprobante de transferencia si se adjuntó
      if (comprobanteFile && transferencia > 0) {
        try {
          const ext = comprobanteFile.name.split(".").pop() || "jpg";
          const fileName = `comprobante_${sale.id}_${Date.now()}.${ext}`;
          const { data: uploadData } = await supabase.storage
            .from("facturas")
            .upload(fileName, comprobanteFile, { contentType: comprobanteFile.type, upsert: true });
          if (uploadData) {
            const { data: { publicUrl } } = supabase.storage.from("facturas").getPublicUrl(uploadData.path);
            await supabase.from("ventas").update({ comprobante_transferencia: publicUrl }).eq("id", sale.id);
          }
        } catch {
          // No bloquea el flujo si falla
          toast.info("Venta completada — comprobante no pudo guardarse");
        }
      }

      // Calcular info de descuento para mostrar en el modal
      const rawTotal = selectedOrder.items.reduce((acc, item) => {
        const base = item.price * item.quantity;
        const dto = item.itemDiscount ? (base * item.itemDiscount) / 100 : 0;
        return acc + base - dto;
      }, 0);
      let discountLabel: string | undefined;
      const orderDisc = (selectedOrder as any).discount ?? 0;
      if (orderDisc > 0) {
        const discAmt = (selectedOrder as any).discountType === "percent"
          ? (rawTotal * orderDisc) / 100
          : orderDisc;
        discountLabel = (selectedOrder as any).discountType === "percent"
          ? `Descuento ${orderDisc}% (-${formatPrice(discAmt)})`
          : `Descuento -${formatPrice(discAmt)}`;
      }

      const paymentParts = [
        efectivo > 0 ? "Efectivo" : "",
        transferencia > 0 ? "Transferencia" : "",
        cuentaCorriente > 0 ? "Cta.Cte." : "",
      ].filter(Boolean).join(" + ");

      setLastSaleResult({
        paymentType: salePaymentType,
        paymentMethod: primaryMethod,
        total,
        originalTotal: orderDisc > 0 ? rawTotal : undefined,
        discountLabel,
        saleId: sale.id,
        client,
        paymentLabel: paymentParts,
      });

      setActiveModal("success");
      setSelectedOrder(null);
      setSelectedClientId("");
      setSelectedClientOrders([]);
      // Recargar desde servidor para asegurar que la lista quede limpia
      loadData();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Error al completar el pedido",
      );
    } finally {
      setProcessingPayment(false);
      completingRef.current = false;
    }
  }, [selectedOrder, selectedClientId, clients, selectedClientOrders, loadData]);

  // Rechazo del pedido por el repartidor: el cliente no lo quiso.
  // No descuenta stock, no genera venta, no suma a caja ni a comisiones.
  // Queda como "rechazado" para que el vendedor lo vea y aparece en Ventas con su remito.
  const handleRejectOrder = useCallback(async () => {
    if (!selectedOrder) return;
    setProcessingPayment(true);
    try {
      const ordersToReject = selectedClientOrders.length > 0 ? selectedClientOrders : [selectedOrder];
      const rejected = await Promise.all(ordersToReject.map((o) => ordersApi.rejectOrder(o.id)));

      // Reponer el stock de los pedidos que ya lo tenían descontado (remito generado): al
      // rechazarse, la mercadería vuelve al depósito. Queda registrado en el historial del producto.
      const { registrarMovimiento } = await import("@/services/stock-service");
      for (const o of ordersToReject) {
        const reposiciones = reposicionEliminarRemito(o.stockDescontado === true, o.items as any[]);
        for (const mov of reposiciones) {
          await registrarMovimiento({
            productoId: mov.productId,
            tipo: "ajuste",
            cantidad: mov.cantidad, // entrada: vuelve al stock
            referencia: `Rechazo pedido ${o.remitoNumber ?? ""} — ${o.clientName ?? ""}`.trim(),
          });
        }
      }

      setOrders((prev) =>
        prev.map((o) => rejected.find((r) => r.id === o.id) ?? o),
      );
      toast.success(ordersToReject.length > 1 ? "Pedidos rechazados — stock repuesto" : "Pedido rechazado — stock repuesto");
      setActiveModal(null);
      setSelectedOrder(null);
      setSelectedClientId("");
      setSelectedClientOrders([]);
      loadData();
    } catch {
      toast.error("Error al rechazar el pedido");
    } finally {
      setProcessingPayment(false);
    }
  }, [selectedOrder, selectedClientOrders, loadData]);

  const handleGoToSale = useCallback(() => {
    if (lastSaleResult?.saleId) {
      router.push(`/ventas?saleId=${lastSaleResult.saleId}`);
    }
    setActiveModal(null);
  }, [lastSaleResult, router]);

  const handleSaveClient = useCallback(async (
    clientData: Omit<Client, "id" | "createdAt" | "currentBalance">,
  ) => {
    const newClient = await clientsApi.create(clientData);
    setClients((prev) => [...prev, newClient]);
    setSelectedClientId(newClient.id);
    setShowClientModal(false);
  }, []);

  const closeAllModals = useCallback(() => {
    setActiveModal(null);
    setDetailOrder(null);
    setSelectedOrder(null);
  }, []);

  const handleDescargarExcel = useCallback(async () => {
    setGenerandoExcel(true);
    try {
      // Exportar lo mismo que se ve en pantalla: respeta la solapa (estado) y el día/fecha,
      // y si hay selección de clientes (ej: tildar un día) limita a esos clientes.
      const toLocalDay = (value: unknown) => {
        const d = new Date(value as any);
        if (isNaN(d.getTime())) return "";
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      };
      const activos = orders.filter((o) => {
        if (o.status === "completed" || o.status === "rechazado") return false;
        if (filterStatus !== "all" && o.status !== filterStatus) return false;
        if (filterClient && o.clientId !== filterClient) return false;
        if (filterSeller && o.sellerId !== filterSeller) return false;
        if (filterDate && toLocalDay(o.createdAt) !== filterDate) return false;
        // Si se seleccionaron clientes (tildar día o cliente), exportar TODOS sus pedidos del estado
        // actual, sin importar el día de cada pedido. La UI agrupa los pedidos de un cliente del
        // mismo estado en una sola fila bajo un único día; filtrar por createdAt acá dejaría afuera
        // pedidos de otros días que la fila sí muestra (ej: fernet de un pedido de otro día).
        if (selectedOrderIds.size > 0) {
          if (!selectedOrderIds.has(o.id)) return false;
        } else if (selectedDays.size > 0 && !selectedDays.has(toLocalDay(o.createdAt))) {
          return false;
        }
        return true;
      });

      // Consolidar items por nombre
      type AcumItem = {
        productId: string;
        codigo: string;
        nombre: string;
        cantidad: number;
        unidadesPorBulto?: number;
        precioUnitarioMayorista?: number;
      };
      const acum = new Map<string, AcumItem>();
      for (const orden of activos) {
        for (const item of orden.items) {
          const key = item.name;
          const existing = acum.get(key);
          if (existing) {
            existing.cantidad += item.quantity;
            if (!existing.codigo && (item as any).codigo) existing.codigo = (item as any).codigo;
            if (!existing.productId && item.productId) existing.productId = item.productId;
          } else {
            acum.set(key, {
              productId: item.productId || "",
              codigo: (item as any).codigo || "",
              nombre: item.name,
              cantidad: item.quantity,
              unidadesPorBulto: item.unidadesPorBulto,
              precioUnitarioMayorista: item.precioUnitarioMayorista,
            });
          }
        }
      }

      if (acum.size === 0) {
        toast.info(selectedOrderIds.size > 0 ? "No hay pedidos en la selección" : "No hay pedidos activos para descargar");
        return;
      }

      const { supabase } = await import("@/lib/supabase");
      const allItems = Array.from(acum.values());

      // Buscar código y stock desde mayorista_productos → productos
      // Paso 1: obtener códigos que faltan buscando por nombre en mayorista_productos
      const sinCodigo = allItems.filter((f) => !f.codigo);
      if (sinCodigo.length > 0) {
        for (let i = 0; i < sinCodigo.length; i += 50) {
          const chunk = sinCodigo.slice(i, i + 50);
          const orFilter = chunk.map((f) => `descripcion.eq.${f.nombre}`).join(",");
          const { data } = await supabase.from("mayorista_productos").select("codigo, descripcion").or(orFilter);
          if (data) {
            const descMap = new Map(data.map((r: any) => [r.descripcion, r.codigo]));
            for (const f of chunk) {
              const cod = descMap.get(f.nombre);
              if (cod) f.codigo = cod;
            }
          }
        }
      }

      // Paso 2: con los códigos, buscar producto_id, rubro y subrubro en mayorista_productos
      const codigos = allItems.map((f) => f.codigo).filter(Boolean);
      const codigoToProductoId = new Map<string, string>();
      const codigoToRubro = new Map<string, string>();
      const codigoToSubrubro = new Map<string, string>();
      if (codigos.length > 0) {
        for (let i = 0; i < codigos.length; i += 500) {
          const chunk = codigos.slice(i, i + 500);
          const { data } = await supabase.from("mayorista_productos").select("codigo, producto_id, rubro, subrubro").in("codigo", chunk);
          (data ?? []).forEach((r: any) => {
            if (r.producto_id) codigoToProductoId.set(r.codigo, r.producto_id);
            if (r.rubro) codigoToRubro.set(r.codigo, r.rubro);
            if (r.subrubro) codigoToSubrubro.set(r.codigo, r.subrubro);
          });
        }
      }

      // Clasificación en secciones (subtítulos) según rubro/subrubro.
      // Todo lo no comestible/bebible cae en LIMPIEZA (perfumería, bazar, ferretería, etc.).
      const SECCIONES = ["LIMPIEZA", "GALLETITAS", "ALFAJORES", "SNACKS", "CARAMELOS", "COMESTIBLES", "BEBIDAS", "ALIMENTOS BALANCEADOS"];
      const sectionFor = (codigo: string): string => {
        const r = (codigoToRubro.get(codigo) || "").toUpperCase();
        const s = (codigoToSubrubro.get(codigo) || "").toUpperCase();
        if (r.includes("BEBIDA") || r.includes("VINO") || s.includes("CERVEZA") || s.includes("GASEOSA") || s.includes("JUGO") || s.includes("AGUA") || s.includes("VINO")) return "BEBIDAS";
        if (r.includes("BALANCEAD")) return "ALIMENTOS BALANCEADOS";
        if (r.includes("GALLETITA")) return "GALLETITAS";
        if (r.includes("GOLOSINA") || r.includes("ALFAJOR")) return s.includes("ALFAJOR") ? "ALFAJORES" : "CARAMELOS";
        if (r.includes("SNACK") || r.includes("PANIFICAD")) return "SNACKS";
        if (r.includes("ALMACEN") || r.includes("CEREAL") || r.includes("FRESCO")) return "COMESTIBLES";
        // Resto (perfumería, bazar, ferretería, iluminación, librería, navidad, juguetes, polirubros, medicamento, sin rubro)
        return "LIMPIEZA";
      };

      // Paso 3: buscar stock en productos por producto_id
      const productoIds = [...new Set(codigoToProductoId.values())];
      const stockMap = new Map<string, number>();
      if (productoIds.length > 0) {
        for (let i = 0; i < productoIds.length; i += 500) {
          const chunk = productoIds.slice(i, i + 500);
          const { data } = await supabase.from("productos").select("id, stock").in("id", chunk);
          (data ?? []).forEach((p: any) => stockMap.set(p.id, p.stock ?? 0));
        }
      }

      const filas = allItems
        .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
        .map((f) => {
          const productoId = codigoToProductoId.get(f.codigo);
          const stockDisponible = productoId ? (stockMap.get(productoId) ?? 0) : 0;
          const faltante = Math.max(0, f.cantidad - stockDisponible);
          return { codigo: f.codigo, nombre: f.nombre, cantidad: f.cantidad, stockDisponible, faltante, seccion: sectionFor(f.codigo) };
        });

      const totalUnidades = filas.reduce((s, r) => s + r.cantidad, 0);
      const totalStock = filas.reduce((s, r) => s + r.stockDisponible, 0);
      const totalFaltante = filas.reduce((s, r) => s + r.faltante, 0);

      const fechaStr = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "long", year: "numeric" }).format(new Date());
      const esc = (s: string) =>
        (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

      // Agrupar por sección en el orden definido; cada sección con su subtítulo visible.
      const rowsHtml = SECCIONES
        .map((sec) => {
          const items = filas.filter((f) => f.seccion === sec).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
          if (items.length === 0) return "";
          const subtitulo = `<tr class="seccion"><td colspan="5">${esc(sec)}</td></tr>`;
          const body = items
            .map((f) => {
              const cls = f.faltante > 0 ? ' class="faltante"' : "";
              return `<tr${cls}><td class="cod">${esc(f.codigo || "—")}</td><td>${esc(f.nombre)}</td><td class="num">${f.cantidad}</td><td class="num">${f.stockDisponible}</td><td class="num">${f.faltante}</td></tr>`;
            })
            .join("");
          return subtitulo + body;
        })
        .join("");

      const html = `<!DOCTYPE html><html><head><title>Pedido Mayorista</title><style>
@page{size:A4 portrait;margin:12mm}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,Arial,sans-serif;color:#1f2937;font-size:11px}
.header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #1f2937;padding-bottom:8px;margin-bottom:12px}
.header h2{font-size:18px}
.header .meta{text-align:right;font-size:11px;color:#6b7280}
table{width:100%;border-collapse:collapse;table-layout:fixed}
th,td{border:1px solid #d1d5db;padding:4px 6px;font-size:10px;overflow:hidden;text-overflow:ellipsis}
thead th{background:#1f4e78;color:#fff;font-weight:700;text-align:center}
th.cod,td.cod{width:13%}
th:nth-child(2),td:nth-child(2){width:43%}
th.num,td.num{width:14.66%;text-align:center}
td td:nth-child(2){text-align:left}
tbody tr:nth-child(even){background:#f9fafb}
tr.faltante td{background:#f8cbad}
tr.seccion td{background:#0f766e;color:#fff;font-weight:800;font-size:11px;text-align:left;letter-spacing:.6px;text-transform:uppercase;padding:5px 6px}
tfoot td{border-top:2px solid #1f4e78;background:#f2f2f2;font-weight:700;font-size:11px}
*{-webkit-print-color-adjust:exact;print-color-adjust:exact}
</style></head><body>
<div class="header"><div><h2>Pedido Mayorista</h2></div><div class="meta"><div style="font-weight:600;color:#1f2937;font-size:13px">${fechaStr}</div><div>${filas.length} items · ${totalUnidades} u.</div></div></div>
<table>
<thead><tr><th class="cod">Código</th><th>Descripción</th><th class="num">Pedido</th><th class="num">Stock</th><th class="num">Faltante</th></tr></thead>
<tbody>${rowsHtml}</tbody>
<tfoot><tr><td colspan="2">TOTAL — ${filas.length} items</td><td class="num">${totalUnidades}</td><td class="num">${totalStock}</td><td class="num">${totalFaltante}</td></tr></tfoot>
</table>
</body></html>`;

      printHtml(html);
      toast.success(`Generado — ${filas.length} productos`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al descargar");
    } finally {
      setGenerandoExcel(false);
    }
  }, [orders, selectedOrderIds, selectedDays, filterStatus, filterClient, filterSeller, filterDate]);


  const clearFilters = useCallback(() => {
    setFilterStatus("all");
    setFilterClient("");
    setFilterSeller("");
    setFilterTransportista("");
    setFilterDate("");
    setSearchQuery("");
  }, []);

  const hasActiveFilters = useMemo(() => {
    return (
      filterStatus !== "all" ||
      filterClient ||
      filterSeller ||
      filterTransportista ||
      filterDate ||
      searchQuery
    );
  }, [
    filterStatus,
    filterClient,
    filterSeller,
    filterTransportista,
    filterDate,
    searchQuery,
  ]);

  const activeOrders = useMemo(() => orders.filter((o) => o.status !== "completed" && o.status !== "rechazado"), [orders]);

  const filteredOrders = useMemo(() => {
    // Completados van a Ventas — no aparecen en Pedidos
    let filtered = activeOrders;

    if (filterStatus !== "all") {
      filtered = filtered.filter((o) => o.status === filterStatus);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((o) => {
        if (o.clientName?.toLowerCase().includes(query)) return true;
        if (o.sellerName?.toLowerCase().includes(query)) return true;
        if (o.id.toLowerCase().includes(query)) return true;
        // buscar por nombre en la lista de clientes si el pedido tiene clientId
        if (o.clientId) {
          const client = clients.find((c) => c.id === o.clientId);
          if (client?.name?.toLowerCase().includes(query)) return true;
        }
        return false;
      });
    }

    if (filterClient) {
      filtered = filtered.filter((o) => o.clientId === filterClient);
    }

    if (filterSeller) {
      filtered = filtered.filter((o) => o.sellerId === filterSeller);
    }

    if (filterTransportista) {
      if (filterTransportista === "unassigned") {
        filtered = filtered.filter((o) => !o.transportistaId);
      } else {
        filtered = filtered.filter((o) => o.transportistaId === filterTransportista);
      }
    }

    if (filterDate) {
      const toLocalDay = (value: unknown) => {
        const d = new Date(value as any);
        if (isNaN(d.getTime())) return "";
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
      };
      filtered = filtered.filter((o) => toLocalDay(o.createdAt) === filterDate);
    }

    return filtered;
  }, [
    activeOrders,
    clients,
    filterStatus,
    searchQuery,
    filterClient,
    filterSeller,
    filterTransportista,
    filterDate,
  ]);


  // Trazabilidad 1 pedido = 1 remito = 1 venta: cada pedido es su propia fila.
  // NO se fusionan pedidos del mismo cliente en ningún lado.
  const ordersGroupedByClient = useMemo(() => {
    const groups: Record<string, Order[]> = {};
    const SEP = "|#|";

    filteredOrders.forEach((order) => {
      const client = order.clientName || "Sin cliente";
      const key = `${client}${SEP}${order.status}${SEP}${order.id}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(order);
    });

    // Orden interno de cada grupo por dirección
    Object.keys(groups).forEach((key) => {
      groups[key].sort((a, b) => (a.address || "").localeCompare(b.address || ""));
    });

    // Ordenar por día del pedido (más antiguo primero). "Sin cliente" último.
    const fechaGrupo = (key: string) => {
      const o = groups[key][0];
      const t = o ? new Date(o.createdAt).getTime() : 0;
      return isNaN(t) ? 0 : t;
    };
    const sortedKeys = Object.keys(groups).sort((a, b) => {
      const aSin = a.startsWith(`Sin cliente${SEP}`);
      const bSin = b.startsWith(`Sin cliente${SEP}`);
      if (aSin && !bSin) return 1;
      if (bSin && !aSin) return -1;
      return fechaGrupo(a) - fechaGrupo(b);
    });

    return sortedKeys.map((key) => ({
      client: groups[key][0]?.clientName || "Sin cliente",
      groupKey: key,
      orders: groups[key],
    }));
  }, [filteredOrders]);

  // Agrupar los grupos de cliente por día del pedido (para secciones colapsables)
  const ordersGroupedByDate = useMemo(() => {
    const dayLabelFmt = new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long" });
    const dayMap = new Map<string, { key: string; label: string; time: number; groups: { client: string; orders: Order[] }[] }>();
    for (const g of ordersGroupedByClient) {
      const o = g.orders[0];
      const d = new Date(o?.createdAt as any);
      const valid = !isNaN(d.getTime());
      const key = valid
        ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
        : "sin-fecha";
      if (!dayMap.has(key)) {
        dayMap.set(key, {
          key,
          label: valid ? dayLabelFmt.format(d) : "Sin fecha",
          time: valid ? new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() : Number.MAX_SAFE_INTEGER,
          groups: [],
        });
      }
      dayMap.get(key)!.groups.push(g);
    }
    return Array.from(dayMap.values()).sort((a, b) => a.time - b.time);
  }, [ordersGroupedByClient]);

  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const toggleDay = useCallback((key: string) => {
    setExpandedDays(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const cargoList = useMemo(() => {
    const productMap = new Map<string, { name: string; quantity: number }>();
    filteredOrders.forEach((order) => {
      order.items.forEach((item) => {
        const existing = productMap.get(item.name);
        if (existing) existing.quantity += item.quantity;
        else productMap.set(item.name, { name: item.name, quantity: item.quantity });
      });
    });
    return Array.from(productMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredOrders]);

  const uniqueSellers = useMemo(() => {
    const sellersMap = new Map();
    orders.forEach((o) => {
      if (o.sellerId && o.sellerName) {
        sellersMap.set(o.sellerId, { id: o.sellerId, name: o.sellerName });
      }
    });
    return Array.from(sellersMap.values());
  }, [orders]);

  const transportistas = useMemo(
    () => sellers.filter(s => s.employeeType === "transportista" || s.employeeType === "ambos"),
    [sellers]
  );

  const [movingAll, setMovingAll] = useState(false);

  // Precio actual de un item segun el mapa (soporta ids mayorista mp_ y prod_mp_)
  const getCurrentPrice = useCallback((productId?: string): number | null => {
    if (!productId) return null;
    const p = priceMap.get(productId) ?? priceMap.get(`prod_${productId}`);
    return p != null && p > 0 ? p : null;
  }, [priceMap]);

  // Pedidos no completados con items por debajo del precio de venta actual.
  // Los pedidos con remito ya generado se excluyen: el precio del remito es el precio comprometido con el cliente.
  const outdatedPriceOrders = useMemo(() => {
    if (priceMap.size === 0) return [] as Order[];
    return orders.filter((o) =>
      o.status !== "completed" &&
      !o.remitoNumber &&
      o.items.some((it) => {
        // No tocar items vendidos por unidad fraccionada (precio distinto al de bulto)
        if (it.precioUnitarioMayorista != null) return false;
        const current = getCurrentPrice(it.productId);
        return current != null && current - (Number(it.price) || 0) > 0.5;
      })
    );
  }, [orders, priceMap, getCurrentPrice]);

  const handleSyncPrices = useCallback(async () => {
    if (outdatedPriceOrders.length === 0) return;
    setSyncingPrices(true);
    try {
      let itemsActualizados = 0;
      const updatedOrders: Order[] = [];
      for (const order of outdatedPriceOrders) {
        // Seguridad extra: nunca pisar precios de pedidos con remito
        if (order.remitoNumber) continue;
        const newItems = order.items.map((it) => {
          if (it.precioUnitarioMayorista != null) return it;
          const current = getCurrentPrice(it.productId);
          if (current != null && current - (Number(it.price) || 0) > 0.5) {
            itemsActualizados++;
            return { ...it, price: current };
          }
          return it;
        });
        const { error } = await supabase.from("pedidos").update({ items: newItems }).eq("id", order.id);
        if (error) throw error;
        updatedOrders.push({ ...order, items: newItems });
      }
      setOrders((prev) => prev.map((o) => updatedOrders.find((u) => u.id === o.id) ?? o));
      toast.success(`${itemsActualizados} producto(s) actualizados al precio actual en ${updatedOrders.length} pedido(s)`);
    } catch {
      toast.error("Error al actualizar precios");
    } finally {
      setSyncingPrices(false);
    }
  }, [outdatedPriceOrders, getCurrentPrice]);

  const handleMoveAll = useCallback(async (from: OrderStatus, to: OrderStatus) => {
    const { toMove, sinRemito } = ordersToMoveAll(orders, from, to, heldOrderIds);
    if (sinRemito > 0) {
      toast.warning(`${sinRemito} pedido(s) sin remito no pasan a reparto. El remito es obligatorio.`);
    }
    if (toMove.length === 0) {
      toast.info("No hay pedidos para mover (retenidos o sin remito)");
      return;
    }
    setMovingAll(true);
    try {
      await Promise.all(toMove.map((o) => ordersApi.updateStatus(o.id, to)));
      await loadData();
      const label = to === "preparation" ? "preparación" : to === "delivery" ? "reparto" : "pendiente";
      const heldCount = orders.filter((o) => o.status === from && heldOrderIds.has(o.id)).length;
      const msg = heldCount > 0
        ? `${toMove.length} pedidos pasados a ${label} (${heldCount} retenidos)`
        : `${toMove.length} pedidos pasados a ${label}`;
      toast.success(msg);
    } catch {
      toast.error("Error al mover pedidos");
    } finally {
      setMovingAll(false);
    }
  }, [orders, heldOrderIds, loadData]);

  const handleMoveSelected = useCallback(async (from: OrderStatus, to: OrderStatus) => {
    const { toMove, sinRemito } = ordersToMoveSelected(orders, from, to, selectedOrderIds);
    if (sinRemito > 0) {
      toast.warning(`${sinRemito} pedido(s) sin remito no pasan a reparto. El remito es obligatorio.`);
    }
    if (toMove.length === 0) {
      toast.info("No hay pedidos seleccionados para mover");
      return;
    }
    setMovingAll(true);
    try {
      await Promise.all(toMove.map((o) => ordersApi.updateStatus(o.id, to)));
      await loadData();
      const label = to === "preparation" ? "preparación" : to === "delivery" ? "reparto" : to;
      toast.success(`${toMove.length} pedido(s) pasados a ${label}`);
      setSelectedOrderIds(new Set());
      setSelectedDays(new Set());
    } catch {
      toast.error("Error al mover pedidos");
    } finally {
      setMovingAll(false);
    }
  }, [orders, selectedOrderIds, loadData]);

  const printHtml = useCallback((html: string) => {
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;border:0;opacity:0;";
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (!doc) { document.body.removeChild(iframe); return; }
    doc.open(); doc.write(html); doc.close();
    iframe.onload = () => {
      iframe.contentWindow?.print();
      setTimeout(() => document.body.removeChild(iframe), 1000);
    };
  }, []);

  const handlePrintCargo = useCallback(async () => {
    const now = new Date();
    const dateStr = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "long", year: "numeric" }).format(now);
    const fmtMoney = (n: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0 }).format(n);
    const escapeHtml = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    // Solo pedidos con remito vigente (excluye retenidos y respeta la selección).
    const cargoGroups = ordersGroupedByClient
      .map(({ client, orders }) => ({
        client,
        orders: orders.filter(
          (o) => o.remitoNumber && !heldOrderIds.has(o.id) && (selectedOrderIds.size === 0 || selectedOrderIds.has(o.id)),
        ),
      }))
      .filter(({ orders }) => orders.length > 0);

    // Huella del contenido: el N° solo cambia si cambia el conjunto de pedidos
    // (otro cliente, otro remito u otro importe). Reimprimir lo mismo = mismo N°.
    const fingerprint = cargoGroups
      .flatMap(({ orders }) => orders.map((o) => `${o.id}:${o.remitoNumber}:${Math.round(calculateOrderTotal(o))}`))
      .sort()
      .join("|");
    let hojaRutaNro = "";
    try {
      hojaRutaNro = await hojaRutaApi.assign(fingerprint);
    } catch {
      toast.error("No se pudo asignar el N° de hoja de ruta");
    }

    // Guardar el N° de hoja de ruta en cada pedido del grupo para que quede asociado
    // (y se herede a la venta al cobrar). Reimprimir la misma hoja reescribe el mismo N°.
    if (hojaRutaNro) {
      const idsHoja = cargoGroups.flatMap(({ orders }) => orders.map((o) => o.id));
      if (idsHoja.length > 0) {
        supabase.from("pedidos").update({ hoja_ruta_number: hojaRutaNro }).in("id", idsHoja).then(() => {});
      }
    }

    let html = `<!DOCTYPE html><html><head><title></title><style>
@page{margin:0}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,sans-serif;padding:24px;font-size:12px;color:#1f2937}
.header{display:flex;align-items:baseline;gap:18px;flex-wrap:wrap;margin-bottom:16px;padding-bottom:10px;border-bottom:2px solid #1f2937}
.header h2{font-size:16px;font-weight:800;letter-spacing:0.02em}
.header .ruta-line{font-size:13px;font-weight:700;color:#111827}
.header .ruta-line .blank{display:inline-block;min-width:120px;border-bottom:1px solid #9ca3af}
.header .fecha{font-size:12px;font-weight:600;color:#374151}
.seller-block{margin-bottom:18px;page-break-inside:avoid}
.seller-title{font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:0.04em;color:#0f766e;background:#ccfbf1;padding:5px 10px;border-radius:6px;margin-bottom:4px}
table{width:100%;border-collapse:collapse}
th,td{padding:5px 8px;border-bottom:1px solid #e5e7eb;text-align:left;vertical-align:middle}
th{font-size:9px;font-weight:700;color:#6b7280;background:#f9fafb;border-bottom:1px solid #d1d5db;text-transform:uppercase;letter-spacing:0.04em}
td{font-size:12px}
td.right,th.right{text-align:right}
td.center,th.center{text-align:center}
tbody tr:nth-child(even){background:#fafafa}
.cod{font-weight:600;color:#374151;white-space:nowrap}
.comp{font-weight:600;color:#111827;white-space:nowrap}
.cliente{font-weight:600}
.importe{font-weight:700;white-space:nowrap}
.deuda{color:#dc2626;font-weight:700;white-space:nowrap}
.cond{display:inline-flex;gap:10px;font-size:10px;color:#6b7280;white-space:nowrap}
.cond .box{display:inline-flex;align-items:center;gap:3px}
.checkbox{display:inline-block;width:11px;height:11px;border:1.5px solid #9ca3af;border-radius:2px}
.total-final{display:flex;justify-content:space-between;align-items:center;margin-top:10px;padding:9px 14px;background:#0f766e;color:#fff;border-radius:6px;font-weight:800;font-size:15px;page-break-inside:avoid}
*{-webkit-print-color-adjust:exact;print-color-adjust:exact}
@media print{body{padding:10mm}}
</style></head><body>`;

    html += `<div class="header"><h2>HOJA DE RUTA</h2>`;
    html += `<div class="ruta-line">HOJA RUTA N° ${hojaRutaNro || `<span class="blank">&nbsp;</span>`}</div>`;
    html += `<div class="fecha">FECHA DE REPARTO: ${dateStr}</div></div>`;

    // Agrupar por vendedor.
    const bySeller = new Map<string, typeof cargoGroups>();
    cargoGroups.forEach((g) => {
      const seller = g.orders[0].sellerName || "Sin vendedor";
      if (!bySeller.has(seller)) bySeller.set(seller, []);
      bySeller.get(seller)!.push(g);
    });

    Array.from(bySeller.entries())
      .sort((a, b) => a[0].localeCompare(b[0], "es"))
      .forEach(([seller, groups]) => {
        html += `<div class="seller-block"><div class="seller-title">Vendedor: ${escapeHtml(seller)}</div>`;
        html += `<table><thead><tr>`;
        html += `<th>N° Comprobante</th><th>Código</th><th>Cliente</th><th class="right">Importe</th><th class="right">Cta. Cte. / Deuda Ant.</th><th class="center">Condición</th>`;
        html += `</tr></thead><tbody>`;
        groups.forEach(({ client, orders: clientOrders }) => {
          const firstOrder = clientOrders[0];
          const clientData = clients.find((c) => c.id === firstOrder.clientId);
          const cod = clientData?.codigo || "—";
          const comprobante = clientOrders.map((o) => o.remitoNumber).filter(Boolean).join(", ") || "—";
          const importe = clientOrders.reduce((a, o) => a + calculateOrderTotal(o), 0);
          const deuda = clientData?.currentBalance || 0;
          const deudaCell = deuda > 0 ? `<span class="deuda">${fmtMoney(deuda)}</span>` : "";
          const cond = `<span class="cond"><span class="box"><span class="checkbox"></span>EFEC.</span><span class="box"><span class="checkbox"></span>TRANS.</span><span class="box"><span class="checkbox"></span>C.C.</span></span>`;
          html += `<tr>`;
          html += `<td class="comp">${escapeHtml(comprobante)}</td>`;
          html += `<td class="cod">${escapeHtml(cod)}</td>`;
          html += `<td class="cliente">${escapeHtml(client)}</td>`;
          html += `<td class="right importe">${fmtMoney(importe)}</td>`;
          html += `<td class="right">${deudaCell}</td>`;
          html += `<td class="center">${cond}</td>`;
          html += `</tr>`;
        });
        html += `</tbody></table></div>`;
      });

    // Total general de la hoja de ruta (suma de todos los importes)
    const totalGeneral = cargoGroups.reduce(
      (acc, { orders }) => acc + orders.reduce((a, o) => a + calculateOrderTotal(o), 0),
      0,
    );
    html += `<div class="total-final"><span>TOTAL GENERAL</span><span>${fmtMoney(totalGeneral)}</span></div>`;

    html += `</body></html>`;
    printHtml(html);
  }, [ordersGroupedByClient, clients, heldOrderIds, selectedOrderIds, printHtml]);


  if (!mounted) {
    return (
      <MainLayout
        title="Pedidos"
        description="Seguimiento de pedidos y entregas"
      >
        <DataTableSkeleton columns={5} rows={5} />
      </MainLayout>
    );
  }

  // Selección en lote: transición según el estado filtrado
  const selMove = filterStatus === "preparation"
    ? { from: "preparation" as OrderStatus, to: "delivery" as OrderStatus, label: "reparto" }
    : { from: "pending" as OrderStatus, to: "preparation" as OrderStatus, label: "preparación" };

  // Retroceso al estado anterior (solo en preparación y reparto)
  const selBack = filterStatus === "preparation"
    ? { from: "preparation" as OrderStatus, to: "pending" as OrderStatus, label: "pendiente" }
    : filterStatus === "delivery"
    ? { from: "delivery" as OrderStatus, to: "preparation" as OrderStatus, label: "preparación" }
    : null;

  const toggleDaySelection = (dayGroups: { orders: Order[] }[], dayKey: string) => {
    const idsOfDay = dayGroups.flatMap((g) => g.orders.map((o) => o.id));
    const allSel = idsOfDay.length > 0 && idsOfDay.every((id) => selectedOrderIds.has(id));
    setSelectedOrderIds((prev) => {
      const next = new Set(prev);
      if (allSel) idsOfDay.forEach((id) => next.delete(id));
      else idsOfDay.forEach((id) => next.add(id));
      return next;
    });
    setSelectedDays((prev) => {
      const next = new Set(prev);
      if (allSel) next.delete(dayKey);
      else next.add(dayKey);
      return next;
    });
  };

  // Calcula los datos derivados de un grupo de cliente (para fila desktop/mobile)
  const computeRow = (clientOrders: Order[]) => {
    const itemMap = new Map<string, Order["items"][0]>();
    clientOrders.forEach((order) => {
      order.items.forEach((item) => {
        const key = item.productId || item.name;
        const existing = itemMap.get(key);
        if (existing) itemMap.set(key, { ...existing, quantity: existing.quantity + item.quantity });
        else itemMap.set(key, { ...item });
      });
    });
    const mergedItems = Array.from(itemMap.values());
    const firstOrder = clientOrders[0];
    const displayOrder = clientOrders.find((o) => o.status !== "completed") ?? firstOrder;
    const config = statusConfig[displayOrder.status] || {
      label: displayOrder.status, color: "text-gray-700", dotColor: "bg-gray-500", bgColor: "bg-gray-50", borderColor: "border-gray-200",
    };
    // Base del merge: el pedido que YA tiene remito (para conservar su número al consolidar);
    // si ninguno tiene, el primero.
    const baseForMerge = clientOrders.find((o) => o.remitoNumber) ?? firstOrder;
    const mergedOrder: Order = { ...baseForMerge, items: mergedItems };
    const onView = () => { setDetailOrder(mergedOrder); setActiveModal("detail"); };
    const clientData = clients.find((c) => c.id === firstOrder.clientId);
    const deuda = clientData?.currentBalance || 0;
    const clasificacion = clientData?.debtClassification;
    const codigo = clientData?.codigo;
    const clientPhone = clientData?.phone || displayOrder.clientPhone || firstOrder.clientPhone;
    return { mergedItems, firstOrder, displayOrder, config, onView, deuda, clasificacion, codigo, clientPhone };
  };

  return (
    <MainLayout allowedRoles={['admin', 'seller']} title="Pedidos">
      <div className="space-y-4">
      <OrdersFilters
        filterStatus={filterStatus}
        setFilterStatus={setFilterStatus}
        filterClient={filterClient}
        setFilterClient={setFilterClient}
        filterSeller={filterSeller}
        setFilterSeller={setFilterSeller}
        filterTransportista={filterTransportista}
        setFilterTransportista={setFilterTransportista}
        filterDate={filterDate}
        setFilterDate={setFilterDate}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        clients={clients}
        sellers={uniqueSellers}
        transportistas={transportistas}
        orders={activeOrders}
      >
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="text-muted-foreground hidden sm:flex"
          >
            <Filter className="h-4 w-4 mr-2" />
            Limpiar filtros
          </Button>
        )}
        {outdatedPriceOrders.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleSyncPrices}
            disabled={syncingPrices}
            className="gap-2 border-2 border-red-600 bg-red-600 text-white font-bold shadow-lg shadow-red-300 hover:bg-red-700 animate-pulse ring-2 ring-red-400 ring-offset-1"
            title="Hay pedidos con precios por debajo del precio de venta actual"
          >
            {syncingPrices ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
            <span>¡Actualizar precios! ({outdatedPriceOrders.length})</span>
          </Button>
        )}
        {filterStatus !== "pending" && (
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrintCargo}
            disabled={filteredOrders.length === 0}
            className="gap-2"
          >
            <ClipboardList className="h-4 w-4" />
            <span className="hidden sm:inline">Hoja de Ruta</span>
          </Button>
        )}
        {filterStatus !== "preparation" && filterStatus !== "delivery" && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleDescargarExcel}
            disabled={generandoExcel}
            className="gap-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
          >
            {generandoExcel ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            <span className="hidden sm:inline">Descargar Pedido</span>
          </Button>
        )}
        {selectedOrderIds.size > 0 && selBack && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleMoveSelected(selBack.from, selBack.to)}
            disabled={movingAll}
            className="gap-2 border-slate-300 text-slate-700 hover:bg-slate-50"
          >
            {movingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowLeftCircle className="h-4 w-4" />}
            <span>Volver {selectedOrderIds.size} a {selBack.label}</span>
          </Button>
        )}
        {selectedOrderIds.size > 0 && filterStatus !== "delivery" && (
          <Button
            size="sm"
            onClick={() => handleMoveSelected(selMove.from, selMove.to)}
            disabled={movingAll}
            className="gap-2 bg-teal-600 hover:bg-teal-700 text-white"
          >
            {movingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightCircle className="h-4 w-4" />}
            <span>Pasar {selectedOrderIds.size} a {selMove.label}</span>
          </Button>
        )}
        {filterStatus === "pending" && filteredOrders.length > 0 && selectedOrderIds.size === 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleMoveAll("pending", "preparation")}
            disabled={movingAll}
            className="gap-2 border-amber-300 text-amber-700 hover:bg-amber-50"
          >
            {movingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightCircle className="h-4 w-4" />}
            <span className="hidden sm:inline">Todos a preparación</span>
          </Button>
        )}
        {filterStatus === "preparation" && filteredOrders.length > 0 && selectedOrderIds.size === 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleMoveAll("preparation", "delivery")}
            disabled={movingAll}
            className="gap-2 border-blue-300 text-blue-700 hover:bg-blue-50"
          >
            {movingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightCircle className="h-4 w-4" />}
            <span className="hidden sm:inline">Todos a reparto</span>
          </Button>
        )}
        {selBack && filteredOrders.length > 0 && selectedOrderIds.size === 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleMoveAll(selBack.from, selBack.to)}
            disabled={movingAll}
            className="gap-2 border-slate-300 text-slate-700 hover:bg-slate-50"
          >
            {movingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowLeftCircle className="h-4 w-4" />}
            <span className="hidden sm:inline">Todos a {selBack.label}</span>
          </Button>
        )}
      </OrdersFilters>


      {loading ? (
        <DataTableSkeleton columns={5} rows={5} />
      ) : filteredOrders.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="h-12 w-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-500 mb-2">No hay pedidos</p>
            {hasActiveFilters && (
              <Button variant="outline" onClick={clearFilters}>
                Limpiar filtros
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {ordersGroupedByDate.map((day) => {
            const isExpanded = expandedDays.has(day.key) || ordersGroupedByDate.length === 1;
            const dayOrderIds = day.groups.flatMap((g) => g.orders.map((o) => o.id));
            const daySelectedCount = dayOrderIds.filter((id) => selectedOrderIds.has(id)).length;
            const dayAllSelected = dayOrderIds.length > 0 && daySelectedCount === dayOrderIds.length;

            return (
              <div key={day.key} className="border rounded-2xl overflow-hidden shadow-sm">
                {/* Header del día (colapsable) */}
                <div
                  className="flex items-center gap-3 px-4 py-3 bg-muted/40 hover:bg-muted/60 cursor-pointer select-none"
                  onClick={() => toggleDay(day.key)}
                >
                  <input
                    type="checkbox"
                    checked={dayAllSelected}
                    onChange={() => toggleDaySelection(day.groups, day.key)}
                    onClick={(e) => e.stopPropagation()}
                    className="h-4 w-4 accent-teal-600 cursor-pointer"
                    title="Seleccionar todo el día"
                  />
                  {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  <span className="text-sm font-semibold capitalize">{day.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {day.groups.length} {day.groups.length === 1 ? "cliente" : "clientes"}
                  </span>
                  {daySelectedCount > 0 && (
                    <span className="ml-auto text-xs font-medium text-teal-600">{daySelectedCount} seleccionado(s)</span>
                  )}
                </div>

                {isExpanded && (
                  <>
                    {/* Desktop/tablet: tabla (en reparto se prioriza la tarjeta grande hasta lg) */}
                    <div className={`hidden ${filterStatus === "delivery" ? "lg:block" : "md:block"} border-t`}>
                      <table className="w-full">
                        <thead className="bg-muted/30 border-b">
                          <tr className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            <th className="px-2 py-2 text-center w-10"></th>
                            <th className="px-2 py-2 text-center w-10"></th>
                            <th className="px-4 py-2 text-left">Cliente</th>
                            <th className="px-4 py-2 text-left w-36">Vendedor</th>
                            <th className="px-4 py-2 text-left">Dirección</th>
                            <th className="px-4 py-2 text-center w-32">Deuda</th>
                            <th className="px-4 py-2 text-center w-36">Estado</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {day.groups.map(({ client, groupKey, orders: clientOrders }) => {
                            const { mergedItems, displayOrder, config, onView, deuda, clasificacion, codigo } = computeRow(clientOrders);
                            const orderId = clientOrders[0].id;
                            const isHeld = heldOrderIds.has(orderId);
                            const isSelected = selectedOrderIds.has(orderId);

                            return (
                              <tr key={groupKey} className={`transition-colors text-sm cursor-pointer ${isHeld ? "bg-red-50/60 opacity-60" : isSelected ? "bg-teal-50/60" : "hover:bg-muted/30"}`} onClick={onView}>
                                <td className="px-2 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggleSelectedOrder(orderId)}
                                    className="h-4 w-4 accent-teal-600 cursor-pointer align-middle"
                                    title="Seleccionar"
                                  />
                                </td>
                                <td className="px-2 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                                  <button
                                    onClick={() => toggleHeldOrder(orderId, client)}
                                    className={`p-1 rounded-full transition-colors ${isHeld ? "text-red-500 bg-red-100 hover:bg-red-200" : "text-muted-foreground/40 hover:text-red-400 hover:bg-red-50"}`}
                                    title={isHeld ? "Quitar retención" : "Retener pedido"}
                                  >
                                    <Ban className="h-4 w-4" />
                                  </button>
                                </td>
                                <td className="px-4 py-2.5">
                                  <p className={`text-xs font-semibold truncate ${isHeld ? "text-red-400 line-through" : "text-foreground"}`}>
                                    {client}{codigo && <span className="ml-1 font-normal text-muted-foreground">({codigo})</span>}
                                  </p>
                                  {clientOrders.length > 1 && (
                                    <p className="text-[10px] text-muted-foreground">{clientOrders.length} pedidos</p>
                                  )}
                                </td>
                                <td className="px-4 py-2.5">
                                  <span className="text-xs text-foreground truncate">{displayOrder.sellerName || "—"}</span>
                                  {(() => {
                                    const notas = clientOrders.map((o) => o.notes?.trim()).filter(Boolean);
                                    return notas.length > 0 ? (
                                      <p className="text-[10px] text-amber-700 italic mt-0.5 line-clamp-2" title={notas.join(" · ")}>
                                        📝 {notas.join(" · ")}
                                      </p>
                                    ) : null;
                                  })()}
                                </td>
                                <td className="px-4 py-2.5">
                                  <p className="text-xs text-muted-foreground truncate">
                                    {displayOrder.address && displayOrder.address !== "Retiro en local"
                                      ? displayOrder.address
                                      : <span className="italic">Retiro en local</span>}
                                  </p>
                                  {displayOrder.city && <p className="text-[10px] text-muted-foreground/70">{displayOrder.city}</p>}
                                </td>
                                <td className="px-4 py-2.5 text-center">
                                  {deuda > 0 ? (
                                    <div>
                                      <p className={`text-xs font-semibold ${clasificacion === "moroso" ? "text-red-600" : clasificacion === "incobrable" ? "text-red-800" : "text-amber-600"}`}>
                                        {formatPrice(deuda)}
                                      </p>
                                      {clasificacion && clasificacion !== "normal" && (
                                        <span className={`text-[10px] font-medium ${clasificacion === "moroso" ? "text-red-500" : "text-red-700"}`}>
                                          {clasificacion === "moroso" ? "Moroso" : "Incobrable"}
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-[10px] text-green-600">Al día</span>
                                  )}
                                </td>
                                <td className="px-4 py-2.5">
                                  <div className="flex items-center justify-center gap-2">
                                    <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-semibold shrink-0 ${config.bgColor} border ${config.borderColor}`}>
                                      <div className={`w-1.5 h-1.5 rounded-full ${config.dotColor}`} />
                                      <span className={config.color}>{config.label}</span>
                                    </div>
                                    <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onView(); }} className="h-7 text-xs gap-1 text-primary hover:bg-primary/5">
                                      <Eye className="h-3.5 w-3.5" />
                                      Ver
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile: lista (en reparto la tarjeta grande se mantiene hasta lg) */}
                    <div className={`${filterStatus === "delivery" ? "lg:hidden" : "md:hidden"} divide-y border-t`}>
                      {filterStatus === "delivery" && (
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 px-2.5 py-1.5 bg-muted/50 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          <span>Cliente</span>
                          <span className="text-right">Deuda</span>
                        </div>
                      )}
                      {filterStatus !== "delivery" && (
                        <div className="grid grid-cols-[1.25rem_1.5rem_minmax(0,1fr)] gap-2 px-3 py-1.5 bg-muted/50 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          <span />
                          <span />
                          <div className="flex items-center justify-between">
                            <span>Cliente</span>
                            <span>Deuda</span>
                          </div>
                        </div>
                      )}
                      {day.groups.map(({ client, groupKey, orders: clientOrders }) => {
                        const { mergedItems, displayOrder, config, onView, deuda, clasificacion, codigo, clientPhone } = computeRow(clientOrders);
                        const orderId = clientOrders[0].id;
                        const isHeld = heldOrderIds.has(orderId);
                        const isSelected = selectedOrderIds.has(orderId);
                        const notas = clientOrders.map((o) => o.notes?.trim()).filter(Boolean);
                        const deudaColor = clasificacion === "moroso" ? "text-red-600" : clasificacion === "incobrable" ? "text-red-800" : "text-amber-600";

                        // ── Vista REPARTO: tarjeta grande para el repartidor ──
                        if (filterStatus === "delivery") {
                          const tieneDir = displayOrder.address && displayOrder.address !== "Retiro en local";
                          const totalUnidades = mergedItems.reduce((n, it) => n + it.quantity, 0);
                          return (
                            <div
                              key={groupKey}
                              className={`px-2.5 py-1.5 transition-colors ${isHeld ? "bg-red-50/60 opacity-60" : "active:bg-muted/40"}`}
                              onClick={onView}
                              style={{ fontSize: '12px' }}
                            >
                              {/* Fila 1: cliente | debe / al día */}
                              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 items-center leading-none">
                                <p className={`font-semibold text-xs truncate min-w-0 ${isHeld ? "text-red-400 line-through" : "text-foreground"}`}>{client}</p>
                                <span className="text-right shrink-0">
                                  {deuda > 0 ? (
                                    <span className={`text-xs font-bold ${deudaColor}`}>Debe {formatPrice(deuda)}</span>
                                  ) : (
                                    <span className="text-xs text-green-600">Al día</span>
                                  )}
                                </span>
                              </div>

                              {/* Fila 2: código · cantidad de productos + notas */}
                              <p className="text-[11px] text-muted-foreground truncate mt-0.5 leading-none">
                                {codigo && <span>({codigo}) · </span>}
                                {mergedItems.length} {mergedItems.length === 1 ? "producto" : "productos"} · {totalUnidades} u.
                                {clientOrders.length > 1 && ` · ${clientOrders.length} pedidos`}
                                {notas.length > 0 && <span className="text-amber-700 italic"> · 📝 {notas.join(" · ")}</span>}
                              </p>
                            </div>
                          );
                        }

                        // ── Otros estados: fila compacta (workflow admin) ──
                        return (
                          <div key={groupKey} className={`grid grid-cols-[1.25rem_1.5rem_minmax(0,1fr)] gap-2 px-3 py-2 cursor-pointer transition-colors items-center ${isHeld ? "bg-red-50/60 opacity-60" : isSelected ? "bg-teal-50/60" : "hover:bg-muted/20"}`} onClick={onView}>
                            <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelectedOrder(orderId)}
                                className="h-4 w-4 accent-teal-600 cursor-pointer align-middle"
                                title="Seleccionar"
                              />
                            </div>
                            <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => toggleHeldOrder(orderId, client)}
                                className={`p-1 rounded-full transition-colors ${isHeld ? "text-red-500 bg-red-100" : "text-muted-foreground/40 hover:text-red-400"}`}
                              >
                                <Ban className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-baseline justify-between gap-2">
                                <p className={`text-xs font-semibold truncate ${isHeld ? "text-red-400 line-through" : "text-foreground"}`}>{client}</p>
                                {deuda > 0 ? (
                                  <span className={`text-xs font-semibold shrink-0 ${deudaColor}`}>{formatPrice(deuda)}</span>
                                ) : (
                                  <span className="text-[10px] text-green-600 shrink-0">Al día</span>
                                )}
                              </div>
                              <p className="text-[11px] text-muted-foreground truncate">
                                {codigo && <span className="font-medium text-foreground/70">({codigo}) </span>}
                                {displayOrder.sellerName || "Sin vendedor"}
                                {clientOrders.length > 1 && ` (${clientOrders.length})`}
                              </p>
                              {notas.length > 0 && (
                                <p className="text-[10px] text-amber-700 italic truncate" title={notas.join(" · ")}>
                                  📝 {notas.join(" · ")}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}


      <OrderDetailModal
        isOpen={activeModal === "detail"}
        onClose={closeAllModals}
        order={detailOrder}
        onStatusChange={handleStatusChange}
        onGenerateRemito={handleGenerateRemito}
        onDeleteRemito={handleDeleteRemito}
        onGenerateInvoice={handleGenerateInvoice}
        onAssignTransportista={handleAssignTransportista}
        onRemoveTransportista={handleRemoveTransportista}
        sellers={sellers}
        userRole={user?.role}
        onHacerPedido={undefined}
        onDelete={handleDeleteOrder}
        onUpdateItems={handleUpdateItems}
      />

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        title="Eliminar pedido"
        description={`¿Eliminar el pedido de ${pendingDelete?.label ?? ""}? Se borra de la base de datos y no se puede deshacer.`}
        confirmText="Eliminar"
        cancelText="Cancelar"
        variant="destructive"
        onConfirm={confirmDelete}
      />

      <StockCheckModal
        open={stockCheckOpen}
        onClose={() => { setStockCheckOpen(false); setStockCheckOrder(null); setStockCheckItems([]); }}
        items={stockCheckItems}
        onConfirm={handleStockCheckConfirm}
        findReplacements={findReplacements}
        searchReplacements={searchReplacementProducts}
      />

      <PaymentModal
        isOpen={activeModal === "payment"}
        onClose={() => {
          setActiveModal(null);
          setSelectedOrder(null);
        }}
        order={selectedOrder}
        clients={clients}
        clientSearch={clientSearch}
        setClientSearch={setClientSearch}
        selectedClientId={selectedClientId}
        setSelectedClientId={setSelectedClientId}
        onComplete={handleCompleteOrder}
        onReject={handleRejectOrder}
        processing={processingPayment}
        onNewClient={() => setShowClientModal(true)}
      />

      <SuccessModal
        isOpen={activeModal === "success"}
        onClose={() => setActiveModal(null)}
        saleResult={lastSaleResult}
        onGoToSale={handleGoToSale}
      />

      <ClientModal
        open={showClientModal}
        onOpenChange={setShowClientModal}
        client={null}
        onSave={handleSaveClient}
      />




      </div>

    </MainLayout>
  );
}
