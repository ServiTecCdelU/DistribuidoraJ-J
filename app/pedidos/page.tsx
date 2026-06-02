//app\pedidos\page.tsx
"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { MainLayout } from "@/components/layout/main-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DataTableSkeleton } from "@/components/ui/data-table-skeleton";
import { ClientModal } from "@/components/clientes/client-modal";
import { ordersApi, salesApi, clientsApi, sellersApi, productsApi } from "@/lib/api";
import type { Order, OrderStatus, Client, Seller } from "@/lib/types";
import { Package, Filter, Loader2, ClipboardList, FileSpreadsheet, Eye, ArrowRightCircle, Ban, TrendingUp, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { OrdersFilters } from "@/components/pedidos/orders-filters";

import { OrderDetailModal } from "@/components/pedidos/order-detail-modal";
import { PaymentModal, type ItemAdjustment } from "@/components/pedidos/payment-modal";
import { SuccessModal } from "@/components/pedidos/success-modal";
import { StockCheckModal, type StockCheckItem, type ReplacementOption } from "@/components/pedidos/stock-check-modal";
import { statusConfig } from "@/lib/order-constants";
import { formatCurrency as formatPrice } from "@/lib/utils/format";

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
  // Todos los pedidos del cliente seleccionado para completar juntos
  const [selectedClientOrders, setSelectedClientOrders] = useState<Order[]>([]);

  const [generandoExcel, setGenerandoExcel] = useState(false);

  // Pedidos retenidos (no avanzan con "Todos a...")
  const [heldClients, setHeldClients] = useState<Set<string>>(new Set());

  const toggleHeldClient = useCallback((clientName: string) => {
    setHeldClients(prev => {
      const next = new Set(prev);
      if (next.has(clientName)) next.delete(clientName); else next.add(clientName);
      return next;
    });
  }, []);

  // Selección de clientes para acciones en lote
  const [selectedClients, setSelectedClients] = useState<Set<string>>(new Set());

  const toggleSelectedClient = useCallback((clientName: string) => {
    setSelectedClients(prev => {
      const next = new Set(prev);
      if (next.has(clientName)) next.delete(clientName); else next.add(clientName);
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

  const loadData = useCallback(async (isMounted?: () => boolean) => {
    try {
      const [ordersData, clientsData, sellersData, productsData] = await Promise.all([
        ordersApi.getAll(),
        clientsApi.getAll(),
        sellersApi.getAll(),
        productsApi.getAll(),
      ]);
      if (isMounted && !isMounted()) return;
      const sortedOrders = ordersData.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      setOrders(sortedOrders);
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
    } catch (error) {
      if (isMounted && !isMounted()) return;
      toast.error("Error al cargar pedidos");
    } finally {
      if (isMounted && !isMounted()) return;
      setLoading(false);
    }
  }, []);

  const generateRemitoForOrder = useCallback(async (order: Order, excludeProductIds: string[] = [], replacements: Record<string, ReplacementOption> = {}) => {
    setGeneratingDoc(true);
    try {
      // Aplicar reemplazos por otra marca (mantiene cantidad, cambia producto/precio)
      const replacedItems = order.items.map((i: any) => {
        const r = replacements[i.productId];
        if (!r) return i;
        return { ...i, productId: r.productId, name: r.name, price: r.price, codigo: r.codigo, itemDiscount: undefined };
      });

      const filteredItems = excludeProductIds.length > 0
        ? replacedItems.filter((i: any) => !excludeProductIds.includes(i.productId))
        : replacedItems;

      if (filteredItems.length === 0) {
        toast.error("No quedan productos para generar el remito");
        return;
      }

      // Si se excluyeron o reemplazaron productos, actualizar el pedido en BD
      const huboReemplazos = Object.keys(replacements).length > 0;
      if (excludeProductIds.length > 0 || huboReemplazos) {
        const { data: updData } = await supabase
          .from("pedidos")
          .update({ items: filteredItems })
          .eq("id", order.id)
          .select()
          .single();
        if (updData) {
          const mapped = { ...order, items: filteredItems };
          setOrders((prev) => prev.map((o) => (o.id === order.id ? mapped : o)));
          if (detailOrder?.id === order.id) setDetailOrder(mapped);
          order = mapped;
        }
      }

      // Número de remito único y consecutivo (función atómica en Postgres)
      const { data: remitoNumber, error: remitoErr } = await supabase.rpc("next_remito_number");
      if (remitoErr || !remitoNumber) {
        toast.error("Error al generar el número de remito");
        return;
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

      // Stock se descuenta al completar el pedido (no al generar remito)

      const { generarPdfCliente } = await import("@/hooks/useGenerarPdf");
      const pdfBase64 = await generarPdfCliente(ventaData, "remito");
      const updatedOrder = await ordersApi.saveRemitoToOrder(order.id, remitoNumber, pdfBase64);
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
  }, [detailOrder]);

  const handleGenerateRemito = useCallback(async (order: Order) => {
    // If remito already exists, just download it
    if (order.remitoNumber && order.remitoPdfBase64) {
      const link = document.createElement("a");
      link.href = `data:application/pdf;base64,${order.remitoPdfBase64}`;
      link.download = `remito-${order.remitoNumber}.pdf`;
      link.click();
      return;
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

    const sinStock = checkItems.filter((i) => i.stock < i.quantity);

    if (sinStock.length > 0) {
      // Mostrar modal de verificación
      setStockCheckItems(checkItems);
      setStockCheckOrder(order);
      setStockCheckOpen(true);
    } else {
      // Todo OK, generar directo
      await generateRemitoForOrder(order);
    }
  }, [detailOrder, generateRemitoForOrder]);

  const handleStockCheckConfirm = useCallback(async (excludeProductIds: string[], replacements: Record<string, ReplacementOption>) => {
    setStockCheckOpen(false);
    if (stockCheckOrder) {
      await generateRemitoForOrder(stockCheckOrder, excludeProductIds, replacements);
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

  useEffect(() => {
    let active = true;
    setMounted(true);
    loadData(() => active);
    return () => { active = false; };
  }, [loadData]);

  // Polling cada 30 segundos para detectar pedidos nuevos
  useEffect(() => {
    const interval = setInterval(() => { loadData(); }, 30000);
    return () => clearInterval(interval);
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
        // Todos los pedidos no completados del mismo cliente
        const clientOrders = orders.filter(
          (o) => o.status !== "completed" && (o.clientName === order.clientName || (o.clientId && o.clientId === order.clientId))
        );
        const ordersForClient = clientOrders.length > 0 ? clientOrders : [order];
        setSelectedClientOrders(ordersForClient);

        // Construir merged order con items combinados (igual que en la lista)
        const itemMap = new Map<string, Order["items"][0]>();
        ordersForClient.forEach((o) => {
          o.items.forEach((item) => {
            const key = item.productId || item.name;
            const existing = itemMap.get(key);
            if (existing) {
              itemMap.set(key, { ...existing, quantity: existing.quantity + item.quantity });
            } else {
              itemMap.set(key, { ...item });
            }
          });
        });
        const mergedItems = Array.from(itemMap.values());
        const mergedOrder: Order = { ...order, items: mergedItems };

        setActiveModal(null);
        setDetailOrder(null);
        setSelectedOrder(mergedOrder);
        setActiveModal("payment");
      }
      return;
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
    setProcessingPayment(true);

    try {
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

      // Registrar roturas: descontar stock (el insert en transacciones se hace después de crear la venta para tener el saleNumber)
      const roturasAdj = adjustments.filter(a => a.type === "rotura");
      const faltantesAdj = adjustments.filter(a => a.type === "faltante");
      const noQuiereAdj = adjustments.filter(a => a.type === "no_quiere");
      if (roturasAdj.length > 0) {
        const { registrarMovimiento } = await import("@/services/stock-service");
        const { supabase } = await import("@/lib/supabase");
        for (const r of roturasAdj) {
          await registrarMovimiento({
            productoId: r.productId,
            tipo: "rotura",
            cantidad: -r.quantity,
            referencia: `Rotura pedido #${selectedOrder.id} — ${r.productName}`,
          });
          // También descontar de productos.stock (tabla principal)
          const prodId = r.productId.startsWith("mp_") ? `prod_${r.productId}` : r.productId;
          const { data: prod } = await supabase.from('productos').select('stock').eq('id', prodId).single();
          if (prod) {
            await supabase.from('productos').update({ stock: Math.max(0, (prod.stock || 0) - r.quantity) }).eq('id', prodId);
          }
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

      const sale = await salesApi.processSale({
        clientId: resolvedClientId,
        clientName: client?.name || selectedOrder.clientName,
        clientPhone: client?.phone,
        sellerId: selectedOrder.sellerId,
        sellerName: selectedOrder.sellerName,
        items: adjustedItems.map((item) => ({
          product: {
            id: item.productId,
            name: item.name,
            price: item.price,
            stock: 100,
            description: "",
            imageUrl: "",
            category: "",
            createdAt: new Date(),
          },
          quantity: item.quantity,
          itemDiscount: item.itemDiscount ?? undefined,
        })),
        discount: (selectedOrder as any).discount ?? undefined,
        discountType: (selectedOrder as any).discountType ?? undefined,
        paymentType: salePaymentType,
        paymentMethod: primaryMethod,
        cashAmount: cashTotal > 0 ? cashTotal : undefined,
        creditAmount: hasCuentaCorriente ? cuentaCorriente : undefined,
        source: "order",
        createOrder: false,
        orderId: selectedOrder.id,
        deliveryMethod:
          selectedOrder.address === "Retiro en local" ? "pickup" : "delivery",
        deliveryAddress: selectedOrder.address,
      });

      // Guardar desglose efectivo/transferencia
      supabase.from("ventas").update({
        efectivo_amount: efectivo > 0 ? efectivo : null,
        transferencia_amount: transferencia > 0 ? transferencia : null,
      }).eq("id", sale.id).then(() => {}).catch(() => {});

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

      // Completar TODOS los pedidos del cliente (incluido el principal y los adicionales)
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

      // Si el pedido ya tenía remito generado, transferirlo a la venta nueva
      if (selectedOrder.remitoNumber && selectedOrder.remitoPdfBase64) {
        await salesApi.saveRemitoToSale(
          sale.id,
          selectedOrder.remitoNumber,
          selectedOrder.remitoPdfBase64,
        );
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
    }
  }, [selectedOrder, selectedClientId, clients, selectedClientOrders, loadData]);

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
      const XLSX = await import("xlsx-js-style");

      const activos = orders.filter((o) => o.status !== "completed");

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
        toast.info("No hay pedidos activos para descargar");
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

      // Paso 2: con los códigos, buscar producto_id en mayorista_productos
      const codigos = allItems.map((f) => f.codigo).filter(Boolean);
      const codigoToProductoId = new Map<string, string>();
      if (codigos.length > 0) {
        for (let i = 0; i < codigos.length; i += 500) {
          const chunk = codigos.slice(i, i + 500);
          const { data } = await supabase.from("mayorista_productos").select("codigo, producto_id").in("codigo", chunk);
          (data ?? []).forEach((r: any) => { if (r.producto_id) codigoToProductoId.set(r.codigo, r.producto_id); });
        }
      }

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
          return { codigo: f.codigo, nombre: f.nombre, cantidad: f.cantidad, stockDisponible, faltante };
        });

      const totalUnidades = filas.reduce((s, r) => s + r.cantidad, 0);

      // Construir datos de la hoja — arranca directo desde fila 1
      const wsData: (string | number)[][] = [];
      const lastDataRow = filas.length + 1; // header is row 1, data starts row 2
      const totalRow = lastDataRow + 2; // 1 fila vacía de separación

      // Fila 1: encabezados
      wsData.push(["Código", "Descripción", "Pedido", "Stock", "Faltante"]);

      // Filas de datos
      for (const f of filas) {
        wsData.push([f.codigo || "", f.nombre, f.cantidad, f.stockDisponible, f.faltante]);
      }

      // 2 filas vacías de separación
      wsData.push([]);
      wsData.push([]);

      // Fila de totales
      wsData.push([`TOTAL  items: ${filas.length}`, "", null, null, null]);

      const ws = XLSX.utils.aoa_to_sheet(wsData);

      // Anchos de columna
      ws["!cols"] = [
        { wch: 12 },
        { wch: 46 },
        { wch: 18 },
        { wch: 18 },
        { wch: 18 },
      ];

      const cols = ["A", "B", "C", "D", "E"];
      const headerStyle = {
        font: { bold: true, sz: 11, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: "1F4E78" } },
        alignment: { horizontal: "center" as const, vertical: "center" as const },
        border: {
          top: { style: "thin" as const, color: { rgb: "D9D9D9" } },
          bottom: { style: "thin" as const, color: { rgb: "D9D9D9" } },
          left: { style: "thin" as const, color: { rgb: "D9D9D9" } },
          right: { style: "thin" as const, color: { rgb: "D9D9D9" } },
        },
      };
      const cellBorder = {
        top: { style: "thin" as const, color: { rgb: "D9D9D9" } },
        bottom: { style: "thin" as const, color: { rgb: "D9D9D9" } },
        left: { style: "thin" as const, color: { rgb: "D9D9D9" } },
        right: { style: "thin" as const, color: { rgb: "D9D9D9" } },
      };

      // Estilos encabezado
      for (const col of cols) {
        const ref = `${col}1`;
        if (ws[ref]) ws[ref].s = headerStyle;
      }

      // Estilos filas de datos
      for (let r = 2; r <= lastDataRow; r++) {
        const fila = filas[r - 2];
        const isFaltante = fila && fila.faltante > 0;

        for (const col of cols) {
          const ref = `${col}${r}`;
          if (!ws[ref]) continue;

          if (col === "A") ws[ref].t = "s"; // código como texto

          ws[ref].s = {
            font: { sz: 10 },
            fill: isFaltante ? { fgColor: { rgb: "F8CBAD" } } : { fgColor: { rgb: "FFFFFF" } },
            alignment: col === "B" ? { vertical: "center" as const } : { horizontal: "center" as const, vertical: "center" as const },
            border: cellBorder,
          };
        }
      }

      // Fórmulas SUM en fila de totales
      const totalRowIdx = wsData.length;
      ws[`C${totalRowIdx}`] = { t: "n", f: `SUM(C2:C${lastDataRow})` };
      ws[`D${totalRowIdx}`] = { t: "n", f: `SUM(D2:D${lastDataRow})` };
      ws[`E${totalRowIdx}`] = { t: "n", f: `SUM(E2:E${lastDataRow})` };

      // Estilo fila de totales
      const totalStyle = {
        font: { bold: true, sz: 11 },
        fill: { fgColor: { rgb: "F2F2F2" } },
        border: {
          top: { style: "medium" as const, color: { rgb: "1F4E78" } },
          bottom: { style: "thin" as const, color: { rgb: "D9D9D9" } },
          left: { style: "thin" as const, color: { rgb: "D9D9D9" } },
          right: { style: "thin" as const, color: { rgb: "D9D9D9" } },
        },
      };
      for (const col of cols) {
        const ref = `${col}${totalRowIdx}`;
        if (ws[ref]) {
          ws[ref].s = {
            ...totalStyle,
            alignment: col === "B" ? {} : { horizontal: "center" as const },
          };
        }
      }

      // Altura fila encabezado
      ws["!rows"] = [{ hpt: 28 }];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Pedido");

      const fechaArchivo = new Date().toLocaleDateString("es-AR").replace(/\//g, "-");
      XLSX.writeFile(wb, `pedido-mayorista-${fechaArchivo}.xlsx`);

      toast.success(`Descargado — ${filas.length} productos`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al descargar");
    } finally {
      setGenerandoExcel(false);
    }
  }, [orders]);


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

  const activeOrders = useMemo(() => orders.filter((o) => o.status !== "completed"), [orders]);

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


  // Group orders by client name
  const ordersGroupedByClient = useMemo(() => {
    const groups: Record<string, Order[]> = {};

    filteredOrders.forEach((order) => {
      const client = order.clientName || "Sin cliente";
      if (!groups[client]) groups[client] = [];
      groups[client].push(order);
    });

    // Sort: non-completed first, then completed; within each group sort by date
    Object.keys(groups).forEach((client) => {
      groups[client].sort((a, b) => {
        const aComplete = a.status === "completed" ? 1 : 0;
        const bComplete = b.status === "completed" ? 1 : 0;
        if (aComplete !== bComplete) return aComplete - bComplete;
        return (a.address || "").localeCompare(b.address || "");
      });
    });

    // Ordenar por día del pedido (más antiguo primero): todos los del 29, luego del 30, etc.
    // "Sin cliente" último.
    const fechaGrupo = (client: string) => {
      const o = groups[client][0]; // ya viene con el pedido activo primero
      const t = o ? new Date(o.createdAt).getTime() : 0;
      return isNaN(t) ? 0 : t;
    };
    const sortedClients = Object.keys(groups).sort((a, b) => {
      if (a === "Sin cliente") return 1;
      if (b === "Sin cliente") return -1;
      return fechaGrupo(a) - fechaGrupo(b);
    });

    return sortedClients.map((client) => ({ client, orders: groups[client] }));
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

  const toggleOrder = useCallback((id: string) => {
    setSelectedOrderIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const [movingAll, setMovingAll] = useState(false);

  // Precio actual de un item segun el mapa (soporta ids mayorista mp_ y prod_mp_)
  const getCurrentPrice = useCallback((productId?: string): number | null => {
    if (!productId) return null;
    const p = priceMap.get(productId) ?? priceMap.get(`prod_${productId}`);
    return p != null && p > 0 ? p : null;
  }, [priceMap]);

  // Pedidos no completados con items por debajo del precio de venta actual
  const outdatedPriceOrders = useMemo(() => {
    if (priceMap.size === 0) return [] as Order[];
    return orders.filter((o) =>
      o.status !== "completed" &&
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
    const toMove = orders.filter((o) => o.status === from && !heldClients.has(o.clientName || "Sin cliente"));
    if (toMove.length === 0) {
      toast.info("No hay pedidos para mover (algunos pueden estar retenidos)");
      return;
    }
    setMovingAll(true);
    try {
      await Promise.all(toMove.map((o) => ordersApi.updateStatus(o.id, to)));
      await loadData();
      const label = to === "preparation" ? "preparación" : "reparto";
      const heldCount = orders.filter((o) => o.status === from && heldClients.has(o.clientName || "Sin cliente")).length;
      const msg = heldCount > 0
        ? `${toMove.length} pedidos pasados a ${label} (${heldCount} retenidos)`
        : `${toMove.length} pedidos pasados a ${label}`;
      toast.success(msg);
    } catch {
      toast.error("Error al mover pedidos");
    } finally {
      setMovingAll(false);
    }
  }, [orders, heldClients, loadData]);

  const handleMoveSelected = useCallback(async (from: OrderStatus, to: OrderStatus) => {
    const toMove = orders.filter(
      (o) => o.status === from && selectedClients.has(o.clientName || "Sin cliente")
    );
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
      setSelectedClients(new Set());
    } catch {
      toast.error("Error al mover pedidos");
    } finally {
      setMovingAll(false);
    }
  }, [orders, selectedClients, loadData]);

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

  const handlePrintCargo = useCallback(() => {
    const now = new Date();
    const dateStr = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "long", year: "numeric" }).format(now);
    const remitoNum = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}${String(now.getDate()).padStart(2,"0")}-${String(Math.floor(Math.random()*9000)+1000)}`;
    const stampStr = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(now);
    const fmtMoney = (n: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0 }).format(n);

    let html = `<!DOCTYPE html><html><head><title>Listado de Carga</title><style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,sans-serif;padding:24px;font-size:13px;color:#1f2937}
table{width:100%;border-collapse:collapse}
th,td{padding:7px 12px;border-bottom:1px solid #f3f4f6}
th{font-size:10px;font-weight:700;color:#6b7280;background:#f9fafb;border-bottom:1px solid #e5e7eb;text-transform:uppercase;letter-spacing:0.05em}
td.right,th.right{text-align:right}
th.center,td.center{text-align:center}
.checkbox{display:inline-block;width:14px;height:14px;border:2px solid #9ca3af;border-radius:3px}
.section{border:1px solid #d1d5db;border-radius:8px;overflow:hidden;margin-bottom:20px}
.section-title{background:#f3f4f6;padding:8px 12px;border-bottom:1px solid #d1d5db;font-size:10px;font-weight:700;text-transform:uppercase;color:#374151;letter-spacing:0.05em}
.tfoot td{border-top:2px solid #d1d5db;background:#f3f4f6;font-weight:700}
.client-row{display:flex;align-items:center;justify-content:space-between;background:#1f2937;color:white;padding:8px 12px;font-size:12px;font-weight:700}
.client-row .debt{font-size:11px;font-weight:600;padding:2px 8px;border-radius:4px}
.debt-moroso{background:#fca5a5;color:#991b1b}
.debt-incobrable{background:#f87171;color:#7f1d1d}
.debt-normal{background:#fde68a;color:#92400e}
.debt-ok{background:#bbf7d0;color:#166534}
.stop{display:flex;align-items:flex-start;gap:12px;padding:10px 12px;border-bottom:1px solid #e5e7eb}
.stop:last-child{border-bottom:none}
.stop-num{flex-shrink:0;width:24px;height:24px;border-radius:50%;background:#e5e7eb;color:#374151;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700}
.header{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:20px;padding-bottom:12px;border-bottom:2px solid #1f2937}
.header h2{font-size:18px;line-height:1.2}
.header .meta{text-align:right;font-size:11px;color:#6b7280}
.summary{display:flex;gap:16px;margin-bottom:20px}
.summary-card{flex:1;border:1px solid #d1d5db;border-radius:8px;padding:12px;text-align:center}
.summary-card .num{font-size:22px;font-weight:800;color:#1f2937}
.summary-card .label{font-size:10px;color:#6b7280;text-transform:uppercase;font-weight:600;margin-top:2px}
.footer{margin-top:20px;text-align:center;font-size:10px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:8px}
@media print{body{padding:16px}.section{page-break-inside:avoid}}
</style></head><body>`;

    // Header
    html += `<div class="header"><div><h2>Listado de Carga</h2><div style="font-size:12px;color:#6b7280;margin-top:2px">Distribuidora Patricia</div></div><div class="meta"><div style="font-weight:600;color:#1f2937;font-size:13px">N° ${remitoNum}</div><div>${dateStr}</div></div></div>`;

    // Summary cards
    const totalProductos = cargoList.reduce((a, i) => a + i.quantity, 0);
    const totalClientes = ordersGroupedByClient.length;
    html += `<div class="summary"><div class="summary-card"><div class="num">${totalClientes}</div><div class="label">Clientes</div></div><div class="summary-card"><div class="num">${cargoList.length}</div><div class="label">Productos</div></div><div class="summary-card"><div class="num">${totalProductos}</div><div class="label">Unidades</div></div></div>`;

    // Entregas por cliente con deuda
    html += `<div class="section"><div class="section-title">Entregas por Cliente</div>`;
    ordersGroupedByClient.forEach(({ client, orders: clientOrders }) => {
      const firstOrder = clientOrders[0];
      const clientData = clients.find((c) => c.id === firstOrder.clientId);
      const deuda = clientData?.currentBalance || 0;
      const clasificacion = clientData?.debtClassification;
      let debtHtml = "";
      if (deuda > 0) {
        const cls = clasificacion === "moroso" ? "debt-moroso" : clasificacion === "incobrable" ? "debt-incobrable" : "debt-normal";
        const label = clasificacion === "moroso" ? "MOROSO" : clasificacion === "incobrable" ? "INCOBRABLE" : "";
        debtHtml = `<span class="debt ${cls}">Deuda: ${fmtMoney(deuda)}${label ? ` — ${label}` : ""}</span>`;
      } else {
        debtHtml = `<span class="debt debt-ok">Al día</span>`;
      }
      const codCli = clientData?.codigo ? ` (${clientData.codigo})` : "";
      html += `<div class="client-row"><span>${client}${codCli} — ${clientOrders.length} ${clientOrders.length === 1 ? "pedido" : "pedidos"}</span>${debtHtml}</div>`;
      clientOrders.forEach((order, idx) => {
        const addr = order.address || "Sin dirección";
        const city = order.city ? ` · ${order.city}` : "";
        html += `<div class="stop"><div class="stop-num">${idx+1}</div><div style="flex:1"><div style="display:flex;justify-content:space-between;align-items:center"><strong style="font-size:12px">${addr}${city}</strong><span class="checkbox"></span></div><div style="margin-top:4px;font-size:11px;color:#6b7280">${order.items.map(it=>`<strong>${it.quantity}</strong>× ${it.name}`).join(" &middot; ")}</div></div></div>`;
      });
    });
    html += `</div><div class="footer">Generado el ${stampStr}</div></body></html>`;
    printHtml(html);
  }, [cargoList, ordersGroupedByClient, clients, printHtml]);


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

  const toggleDaySelection = (dayGroups: { client: string }[]) => {
    const clientsOfDay = dayGroups.map((g) => g.client);
    const allSel = clientsOfDay.every((c) => selectedClients.has(c));
    setSelectedClients((prev) => {
      const next = new Set(prev);
      if (allSel) clientsOfDay.forEach((c) => next.delete(c));
      else clientsOfDay.forEach((c) => next.add(c));
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
    const mergedOrder: Order = { ...firstOrder, items: mergedItems };
    const onView = () => { setDetailOrder(mergedOrder); setActiveModal("detail"); };
    const clientData = clients.find((c) => c.id === firstOrder.clientId);
    const deuda = clientData?.currentBalance || 0;
    const clasificacion = clientData?.debtClassification;
    const codigo = clientData?.codigo;
    return { mergedItems, firstOrder, displayOrder, config, onView, deuda, clasificacion, codigo };
  };

  return (
    <MainLayout allowedRoles={['admin', 'seller']} title="Pedidos" description="Seguimiento de pedidos y entregas">
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
            className="gap-2 border-red-300 bg-red-50 text-red-700 hover:bg-red-100 animate-pulse"
            title="Hay pedidos con precios por debajo del precio de venta actual"
          >
            {syncingPrices ? <Loader2 className="h-4 w-4 animate-spin" /> : <TrendingUp className="h-4 w-4" />}
            <span>Actualizar precios ({outdatedPriceOrders.length})</span>
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
            <span className="hidden sm:inline">Listado de Carga</span>
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
            {generandoExcel ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
            <span className="hidden sm:inline">Descargar Pedido</span>
          </Button>
        )}
        {selectedClients.size > 0 && (
          <Button
            size="sm"
            onClick={() => handleMoveSelected(selMove.from, selMove.to)}
            disabled={movingAll}
            className="gap-2 bg-teal-600 hover:bg-teal-700 text-white"
          >
            {movingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightCircle className="h-4 w-4" />}
            <span>Pasar {selectedClients.size} a {selMove.label}</span>
          </Button>
        )}
        {filterStatus === "pending" && filteredOrders.length > 0 && selectedClients.size === 0 && (
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
        {filterStatus === "preparation" && filteredOrders.length > 0 && selectedClients.size === 0 && (
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
            const dayClients = day.groups.map((g) => g.client);
            const daySelectedCount = dayClients.filter((c) => selectedClients.has(c)).length;
            const dayAllSelected = dayClients.length > 0 && daySelectedCount === dayClients.length;
            const totalPedidos = day.groups.reduce((s, g) => s + g.orders.length, 0);

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
                    onChange={() => toggleDaySelection(day.groups)}
                    onClick={(e) => e.stopPropagation()}
                    className="h-4 w-4 accent-teal-600 cursor-pointer"
                    title="Seleccionar todo el día"
                  />
                  {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  <span className="text-sm font-semibold capitalize">{day.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {day.groups.length} {day.groups.length === 1 ? "cliente" : "clientes"} · {totalPedidos} {totalPedidos === 1 ? "pedido" : "pedidos"}
                  </span>
                  {daySelectedCount > 0 && (
                    <span className="ml-auto text-xs font-medium text-teal-600">{daySelectedCount} seleccionado(s)</span>
                  )}
                </div>

                {isExpanded && (
                  <>
                    {/* Desktop: tabla */}
                    <div className="hidden lg:block border-t">
                      <table className="w-full">
                        <thead className="bg-muted/30 border-b">
                          <tr className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            <th className="px-2 py-2 text-center w-10"></th>
                            <th className="px-2 py-2 text-center w-10"></th>
                            <th className="px-4 py-2 text-left">Cliente</th>
                            <th className="px-4 py-2 text-center w-24">Productos</th>
                            <th className="px-4 py-2 text-left">Dirección</th>
                            <th className="px-4 py-2 text-center w-32">Deuda</th>
                            <th className="px-4 py-2 text-center w-36">Estado</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {day.groups.map(({ client, orders: clientOrders }) => {
                            const { mergedItems, displayOrder, config, onView, deuda, clasificacion, codigo } = computeRow(clientOrders);
                            const isHeld = heldClients.has(client);
                            const isSelected = selectedClients.has(client);

                            return (
                              <tr key={client} className={`transition-colors text-sm cursor-pointer ${isHeld ? "bg-red-50/60 opacity-60" : isSelected ? "bg-teal-50/60" : "hover:bg-muted/30"}`} onClick={onView}>
                                <td className="px-2 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggleSelectedClient(client)}
                                    className="h-4 w-4 accent-teal-600 cursor-pointer align-middle"
                                    title="Seleccionar"
                                  />
                                </td>
                                <td className="px-2 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                                  <button
                                    onClick={() => toggleHeldClient(client)}
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
                                <td className="px-4 py-2.5 text-center">
                                  <span className="text-xs text-foreground">{mergedItems.length}</span>
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

                    {/* Mobile: lista */}
                    <div className="lg:hidden divide-y border-t">
                      {day.groups.map(({ client, orders: clientOrders }) => {
                        const { mergedItems, displayOrder, config, onView, deuda, clasificacion, codigo } = computeRow(clientOrders);
                        const isHeld = heldClients.has(client);
                        const isSelected = selectedClients.has(client);

                        return (
                          <div key={client} className={`grid grid-cols-[auto_auto_1fr_auto_auto] gap-2 px-3 py-2.5 cursor-pointer transition-colors items-center ${isHeld ? "bg-red-50/60 opacity-60" : isSelected ? "bg-teal-50/60" : "hover:bg-muted/20"}`} onClick={onView}>
                            <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelectedClient(client)}
                                className="h-4 w-4 accent-teal-600 cursor-pointer align-middle"
                                title="Seleccionar"
                              />
                            </div>
                            <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => toggleHeldClient(client)}
                                className={`p-1 rounded-full transition-colors ${isHeld ? "text-red-500 bg-red-100" : "text-muted-foreground/40 hover:text-red-400"}`}
                              >
                                <Ban className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1">
                                <p className={`text-xs font-semibold truncate ${isHeld ? "text-red-400 line-through" : "text-foreground"}`}>{client}</p>
                                {codigo && <span className="text-[10px] font-normal text-muted-foreground shrink-0">({codigo})</span>}
                                {clientOrders.length > 1 && (
                                  <span className="text-[10px] text-muted-foreground shrink-0">·{clientOrders.length}</span>
                                )}
                              </div>
                              <p className="text-[11px] text-muted-foreground">
                                {mergedItems.length} {mergedItems.length === 1 ? "producto" : "productos"}
                              </p>
                            </div>
                            <div className="shrink-0 text-center">
                              {deuda > 0 ? (
                                <p className={`text-[10px] font-semibold ${clasificacion === "moroso" ? "text-red-600" : clasificacion === "incobrable" ? "text-red-800" : "text-amber-600"}`}>
                                  {formatPrice(deuda)}
                                </p>
                              ) : (
                                <span className="text-[10px] text-green-600">—</span>
                              )}
                            </div>
                            <div className="flex items-center shrink-0">
                              <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${config.bgColor} border ${config.borderColor}`}>
                                <div className={`w-1.5 h-1.5 rounded-full ${config.dotColor}`} />
                                <span className={config.color}>{config.label}</span>
                              </div>
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
        onGenerateInvoice={handleGenerateInvoice}
        onAssignTransportista={handleAssignTransportista}
        onRemoveTransportista={handleRemoveTransportista}
        sellers={sellers}
        userRole={user?.role}
        onHacerPedido={undefined}
      />

      <StockCheckModal
        open={stockCheckOpen}
        onClose={() => { setStockCheckOpen(false); setStockCheckOrder(null); setStockCheckItems([]); }}
        items={stockCheckItems}
        onConfirm={handleStockCheckConfirm}
        findReplacements={findReplacements}
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
