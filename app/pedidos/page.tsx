//app\pedidos\page.tsx
"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { MainLayout } from "@/components/layout/main-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DataTableSkeleton } from "@/components/ui/data-table-skeleton";
import { Input } from "@/components/ui/input";
import { ClientModal } from "@/components/clientes/client-modal";
import { ordersApi, salesApi, clientsApi, sellersApi, productsApi } from "@/lib/api";
import type { Order, OrderStatus, Client, Seller } from "@/lib/types";
import { Package, Search, User, Filter, X, Loader2, Navigation, ClipboardList, ShoppingCart, FileSpreadsheet, Eye } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { OrdersFilters } from "@/components/pedidos/orders-filters";
import { OrderCard } from "@/components/pedidos/order-card";
import { OrderDetailModal } from "@/components/pedidos/order-detail-modal";
import { PaymentModal, type ItemAdjustment } from "@/components/pedidos/payment-modal";
import { SuccessModal } from "@/components/pedidos/success-modal";
import { RouteMapModal } from "@/components/pedidos/route-map-modal";
import { StockCheckModal, type StockCheckItem } from "@/components/pedidos/stock-check-modal";
import { statusConfig, statusFlow } from "@/lib/order-constants";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { formatCurrency as formatPrice, formatDateShort as formatDate, formatDateFull } from "@/lib/utils/format";

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
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [generatingDoc, setGeneratingDoc] = useState(false);

  // Filtros
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterDateFrom, setFilterDateFrom] = useState<string>("");
  const [filterDateTo, setFilterDateTo] = useState<string>("");
  const [filterClient, setFilterClient] = useState<string>("");
  const [filterSeller, setFilterSeller] = useState<string>("");
  const [filterTransportista, setFilterTransportista] = useState<string>("");
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

  const [routeModalOpen, setRouteModalOpen] = useState(false);
  const [generandoExcel, setGenerandoExcel] = useState(false);

  // Stock check modal
  const [stockCheckOpen, setStockCheckOpen] = useState(false);
  const [stockCheckItems, setStockCheckItems] = useState<StockCheckItem[]>([]);
  const [stockCheckOrder, setStockCheckOrder] = useState<Order | null>(null);

  // Selección masiva
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [bulkTransportistaId, setBulkTransportistaId] = useState<string>("");

  // Autoseleccionar transportista si hay uno solo
  useEffect(() => {
    const t = sellers.filter(s => s.employeeType === "transportista" || s.employeeType === "ambos");
    if (t.length === 1 && !bulkTransportistaId) {
      setBulkTransportistaId(t[0].id);
    }
  }, [sellers, bulkTransportistaId]);
  const [bulkAssigning, setBulkAssigning] = useState(false);

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
      const [ordersData, clientsData, sellersData] = await Promise.all([
        ordersApi.getAll(),
        clientsApi.getAll(),
        sellersApi.getAll(),
      ]);
      if (isMounted && !isMounted()) return;
      const sortedOrders = ordersData.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      setOrders(sortedOrders);
      setClients(clientsData);
      setSellers(sellersData);
    } catch (error) {
      if (isMounted && !isMounted()) return;
      toast.error("Error al cargar pedidos");
    } finally {
      if (isMounted && !isMounted()) return;
      setLoading(false);
    }
  }, []);

  const generateRemitoForOrder = useCallback(async (order: Order, excludeProductIds: string[] = []) => {
    setGeneratingDoc(true);
    try {
      const filteredItems = excludeProductIds.length > 0
        ? order.items.filter((i) => !excludeProductIds.includes(i.productId))
        : order.items;

      if (filteredItems.length === 0) {
        toast.error("No quedan productos para generar el remito");
        return;
      }

      // Si se excluyeron productos, actualizar el pedido en BD
      if (excludeProductIds.length > 0) {
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

      // Generate sequential remito number (query ventas for last number)
      const { data: lastRemitos } = await supabase
        .from("ventas")
        .select("remito_number")
        .not("remito_number", "is", null)
        .order("remito_number", { ascending: false })
        .limit(1);
      let ultimoNumero = 0;
      if (lastRemitos && lastRemitos.length > 0) {
        const lastRemito = lastRemitos[0].remito_number;
        const match = lastRemito?.match(/R-\d+-(\d+)/);
        if (match) ultimoNumero = parseInt(match[1], 10);
      }
      const remitoNumber = `R-${new Date().getFullYear()}-${String(ultimoNumero + 1).padStart(5, "0")}`;

      const total = calculateOrderTotal(order);
      const ventaData = {
        id: order.id,
        clientName: order.clientName,
        items: order.items.map((i) => ({ name: i.name, quantity: i.quantity, price: i.price, ...(i.itemDiscount ? { itemDiscount: i.itemDiscount } : {}) })),
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

  const handleStockCheckConfirm = useCallback(async (excludeProductIds: string[]) => {
    setStockCheckOpen(false);
    if (stockCheckOrder) {
      await generateRemitoForOrder(stockCheckOrder, excludeProductIds);
    }
    setStockCheckOrder(null);
    setStockCheckItems([]);
  }, [stockCheckOrder, generateRemitoForOrder]);

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
        setActiveModal(null);
        setDetailOrder(null);
        setSelectedOrder(order);
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

      // Registrar roturas: descontar stock + registrar pérdida en transacciones
      const roturasAdj = adjustments.filter(a => a.type === "rotura");
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
        const totalPerdida = roturasAdj.reduce((acc, r) => acc + r.unitPrice * r.quantity, 0);
        const productosRotos = roturasAdj.map(r => `${r.productName} x${r.quantity}`).join(", ");
        await supabase.from("transacciones").insert({
          id: `perdida_${selectedOrder.id}_${Date.now()}`,
          type: "payment",
          amount: -totalPerdida,
          description: `[ROTURA] Pedido #${selectedOrder.id}: ${productosRotos}`,
          date: new Date().toISOString(),
        });
      }

      // Si no quedan items para vender (todo rotura), solo completar el pedido sin venta
      if (adjustedItems.length === 0) {
        const updated = await ordersApi.completeOrder(selectedOrder.id, "");
        setOrders((prev) =>
          prev.map((o) => (o.id === selectedOrder.id ? updated : o)),
        );

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

      // Guardar montos individuales (best-effort)
      supabase.from("ventas").update({
        efectivo_amount: efectivo > 0 ? efectivo : null,
        transferencia_amount: transferencia > 0 ? transferencia : null,
      }).eq("id", sale.id).then(() => {}).catch(() => {});

      const updated = await ordersApi.completeOrder(selectedOrder.id, sale.id);
      setOrders((prev) =>
        prev.map((o) => (o.id === selectedOrder.id ? updated : o)),
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
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Error al completar el pedido",
      );
    } finally {
      setProcessingPayment(false);
    }
  }, [selectedOrder, selectedClientId, clients]);

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
      const XLSX = await import("xlsx");

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

      // Fila 1: encabezados
      wsData.push(["Código", "Descripción", "Unidades pedidas", "Stock disponible", "Faltante (unid.)"]);

      // Filas de datos
      for (const f of filas) {
        wsData.push([f.codigo, f.nombre, f.cantidad, f.stockDisponible, f.faltante]);
      }

      // 2 filas vacías de separación
      wsData.push([]);
      wsData.push([]);

      // Fila de totales
      wsData.push([`TOTAL  items: ${filas.length}`, "", totalUnidades, "", ""]);

      const ws = XLSX.utils.aoa_to_sheet(wsData);

      // Anchos de columna — total ~80 caracteres, entra en A4 portrait
      ws["!cols"] = [
        { wch: 10 },  // Código
        { wch: 32 },  // Descripción
        { wch: 10 },  // Unidades pedidas
        { wch: 10 },  // Stock disponible
        { wch: 10 },  // Faltante
      ];

      const cols = ["A", "B", "C", "D", "E"];

      // Estilos encabezado (fila 1)
      for (const col of cols) {
        const cellRef = `${col}1`;
        if (ws[cellRef]) {
          ws[cellRef].s = {
            font: { bold: true, sz: 9, color: { rgb: "FFFFFF" } },
            fill: { fgColor: { rgb: "0F766E" } },
            alignment: { horizontal: "center", vertical: "center" },
          };
        }
      }

      // Fuente base sz 9 para todas las filas de datos
      const dataStartRow = 2;
      filas.forEach((_, i) => {
        for (const col of cols) {
          const cellRef = `${col}${dataStartRow + i}`;
          if (ws[cellRef] && !ws[cellRef].s) {
            ws[cellRef].s = { font: { sz: 9 }, alignment: { vertical: "center" } };
          } else if (ws[cellRef]) {
            ws[cellRef].s = { ...ws[cellRef].s, font: { ...ws[cellRef].s?.font, sz: 9 } };
          }
        }
      });

      // Estilo fila de totales
      const totalRowIdx = wsData.length;
      for (const col of cols) {
        const cellRef = `${col}${totalRowIdx}`;
        if (ws[cellRef]) {
          ws[cellRef].s = {
            font: { bold: true, sz: 9 },
            fill: { fgColor: { rgb: "F0FDFA" } },
            border: { top: { style: "thin", color: { rgb: "0F766E" } } },
          };
        }
      }

      // Resaltar faltante > 0 en columna E
      filas.forEach((f, i) => {
        if (f.faltante > 0) {
          const cellRef = `E${dataStartRow + i}`;
          if (ws[cellRef]) {
            ws[cellRef].s = {
              font: { bold: true, sz: 9, color: { rgb: "DC2626" } },
              fill: { fgColor: { rgb: "FEF2F2" } },
              alignment: { horizontal: "center" },
            };
          }
        }
      });

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
    setFilterDateFrom("");
    setFilterDateTo("");
    setFilterClient("");
    setFilterSeller("");
    setFilterTransportista("");
    setSearchQuery("");
  }, []);

  const hasActiveFilters = useMemo(() => {
    return (
      filterStatus !== "all" ||
      filterDateFrom ||
      filterDateTo ||
      filterClient ||
      filterSeller ||
      filterTransportista ||
      searchQuery
    );
  }, [
    filterStatus,
    filterDateFrom,
    filterDateTo,
    filterClient,
    filterSeller,
    filterTransportista,
    searchQuery,
  ]);

  const filteredOrders = useMemo(() => {
    // Completados van a Ventas — no aparecen en Pedidos
    let filtered = orders.filter((o) => o.status !== "completed");

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

    if (filterDateFrom) {
      const fromDate = new Date(filterDateFrom);
      fromDate.setHours(0, 0, 0, 0);
      filtered = filtered.filter((o) => new Date(o.createdAt) >= fromDate);
    }

    if (filterDateTo) {
      const toDate = new Date(filterDateTo);
      toDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter((o) => new Date(o.createdAt) <= toDate);
    }

    return filtered;
  }, [
    orders,
    clients,
    filterStatus,
    searchQuery,
    filterClient,
    filterSeller,
    filterDateFrom,
    filterDateTo,
    filterTransportista,
    user,
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

    // Sort clients alphabetically, "Sin cliente" last
    const sortedClients = Object.keys(groups).sort((a, b) => {
      if (a === "Sin cliente") return 1;
      if (b === "Sin cliente") return -1;
      return a.localeCompare(b);
    });

    return sortedClients.map((client) => ({ client, orders: groups[client] }));
  }, [filteredOrders]);

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

  const toggleGroup = useCallback((groupOrders: Order[]) => {
    setSelectedOrderIds(prev => {
      const allSelected = groupOrders.every(o => prev.has(o.id));
      const next = new Set(prev);
      if (allSelected) groupOrders.forEach(o => next.delete(o.id));
      else groupOrders.forEach(o => next.add(o.id));
      return next;
    });
  }, []);

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
    // cargoList y ordersGroupedByClient se leen del closure
    let html = `<!DOCTYPE html><html><head><title>Listado de Carga</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:sans-serif;padding:24px;font-size:13px}table{width:100%;border-collapse:collapse}th,td{padding:7px 12px;border-bottom:1px solid #f3f4f6}th{font-size:11px;font-weight:600;color:#4b5563;background:#f9fafb;border-bottom:1px solid #e5e7eb}td.right{text-align:right}th.right{text-align:right}th.center,td.center{text-align:center}.checkbox{display:inline-block;width:14px;height:14px;border:2px solid #9ca3af;border-radius:2px}.client-header{background:#1f2937;color:white;padding:6px 12px;font-size:11px;font-weight:700;text-transform:uppercase}.section{border:1px solid #d1d5db;border-radius:8px;overflow:hidden;margin-bottom:16px}.section-title{background:#f3f4f6;padding:8px 12px;border-bottom:1px solid #d1d5db;font-size:10px;font-weight:700;text-transform:uppercase;color:#374151}.tfoot td{border-top:2px solid #d1d5db;background:#f3f4f6;font-weight:700}.stop{display:flex;align-items:flex-start;gap:12px;padding:10px 12px;border-bottom:1px solid #e5e7eb}.stop-num{flex-shrink:0;width:26px;height:26px;border-radius:50%;background:#1f2937;color:white;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700}.footer{margin-top:16px;text-align:center;font-size:10px;color:#9ca3af}@media print{body{padding:16px}}</style></head><body>`;
    html += `<h2 style="margin-bottom:16px;font-size:18px">Listado de Carga — ${dateStr} | N° ${remitoNum}</h2>`;
    html += `<div class="section"><div class="section-title">Mercadería</div><table><thead><tr><th style="width:40px">N°</th><th>Producto</th><th class="right" style="width:70px">Cant.</th><th class="center" style="width:50px">OK</th></tr></thead><tbody>`;
    cargoList.forEach((item, i) => {
      html += `<tr style="${i%2?"background:#f9fafb":""}"><td style="color:#9ca3af;font-size:11px">${i+1}</td><td style="font-weight:500">${item.name}</td><td class="right" style="font-weight:700;font-size:15px">${item.quantity}</td><td class="center"><span class="checkbox"></span></td></tr>`;
    });
    html += `</tbody><tr class="tfoot"><td></td><td>${cargoList.length} productos</td><td class="right">${cargoList.reduce((a,i)=>a+i.quantity,0)}</td><td></td></tr></table></div>`;
    html += `<div class="section"><div class="section-title">Entregas por Cliente</div>`;
    ordersGroupedByClient.forEach(({ client, orders: clientOrders }) => {
      html += `<div class="client-header">${client} — ${clientOrders.length} ${clientOrders.length === 1 ? "pedido" : "pedidos"}</div>`;
      clientOrders.forEach((order, idx) => {
        html += `<div class="stop"><div class="stop-num">${idx+1}</div><div style="flex:1"><div style="display:flex;justify-content:space-between"><strong>${order.address||"Sin dirección"}</strong><span class="checkbox"></span></div><div style="margin-top:4px;font-size:11px">${order.items.map(it=>`<strong>${it.quantity}</strong>×${it.name}`).join(" | ")}</div></div></div>`;
      });
    });
    html += `</div><div class="footer">Generado el ${stampStr}</div></body></html>`;
    printHtml(html);
  }, [cargoList, ordersGroupedByClient, printHtml]);

  const handleBulkAssign = useCallback(async () => {
    if (!bulkTransportistaId || selectedOrderIds.size === 0) return;
    const transportista = sellers.find(s => s.id === bulkTransportistaId);
    if (!transportista) return;
    setBulkAssigning(true);
    try {
      await Promise.all(
        Array.from(selectedOrderIds).map(id =>
          ordersApi.assignTransportista(id, transportista.id, transportista.name)
        )
      );
      await loadData();
      setSelectedOrderIds(new Set());
      setBulkTransportistaId("");
    } catch (e) {
      toast.error("Error al asignar transportistas en lote");
    } finally {
      setBulkAssigning(false);
    }
  }, [bulkTransportistaId, selectedOrderIds, sellers, loadData]);

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

  return (
    <MainLayout allowedRoles={['admin', 'seller']} title="Pedidos" description="Seguimiento de pedidos y entregas">
      <div className="space-y-4">
      <div className="mb-6 space-y-4">
        <div className="flex flex-col lg:flex-row gap-3 justify-between items-start lg:items-center">
          <div className="flex items-center gap-2 w-full lg:w-auto">
            <div className="relative flex-1 lg:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por cliente, vendedor o ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                >
                  <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="text-muted-foreground"
              >
                <Filter className="h-4 w-4 mr-2" />
                Limpiar filtros
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRouteModalOpen(true)}
              disabled={filteredOrders.filter(o => o.address && o.city && o.status !== "completed").length === 0}
              className="gap-2"
            >
              <Navigation className="h-4 w-4" />
              <span className="hidden sm:inline">Iniciar Recorrido</span>
              <span className="sm:hidden">Ruta</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrintCargo}
              disabled={filteredOrders.length === 0}
              className="gap-2"
            >
              <ClipboardList className="h-4 w-4" />
              <span className="hidden sm:inline">Listado de Carga</span>
              <span className="sm:hidden">Carga</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDescargarExcel}
              disabled={generandoExcel}
              className="gap-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
            >
              {generandoExcel ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
              <span className="hidden sm:inline">Descargar Pedido</span>
              <span className="sm:hidden">Excel</span>
            </Button>
          </div>
        </div>

        <OrdersFilters
          filterStatus={filterStatus}
          setFilterStatus={setFilterStatus}
          filterDateFrom={filterDateFrom}
          setFilterDateFrom={setFilterDateFrom}
          filterDateTo={filterDateTo}
          setFilterDateTo={setFilterDateTo}
          filterClient={filterClient}
          setFilterClient={setFilterClient}
          filterSeller={filterSeller}
          setFilterSeller={setFilterSeller}
          filterTransportista={filterTransportista}
          setFilterTransportista={setFilterTransportista}
          clients={clients}
          sellers={uniqueSellers}
          transportistas={transportistas}
          orders={orders}
        />
      </div>

      {/* Barra de asignación masiva (admin) */}
      {user?.role === "admin" && selectedOrderIds.size > 0 && (
        <div className="mb-4 p-4 rounded-2xl border-2 border-teal-200 bg-teal-50 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex items-center gap-3 flex-1">
            <div className="h-10 w-10 rounded-full bg-teal-600 text-white flex items-center justify-center font-bold text-lg shrink-0">
              {selectedOrderIds.size}
            </div>
            <div>
              <p className="font-semibold text-teal-900 text-base">
                {selectedOrderIds.size === 1 ? "1 pedido seleccionado" : `${selectedOrderIds.size} pedidos seleccionados`}
              </p>
              <button
                onClick={() => setSelectedOrderIds(new Set())}
                className="text-xs text-teal-600 hover:text-teal-800 underline"
              >
                Limpiar selección
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Select value={bulkTransportistaId} onValueChange={setBulkTransportistaId}>
              <SelectTrigger className="bg-white border-teal-300 h-10 w-full sm:w-56">
                <SelectValue placeholder="Elegir transportista..." />
              </SelectTrigger>
              <SelectContent>
                {transportistas.map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              disabled={!bulkTransportistaId || bulkAssigning}
              onClick={handleBulkAssign}
              className="gap-2 whitespace-nowrap h-10 bg-teal-600 hover:bg-teal-700"
            >
              {bulkAssigning ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Asignar
            </Button>
          </div>
        </div>
      )}

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
        <div className="space-y-4">
          {/* Select all */}
          {user?.role === "admin" && (
            <div className="flex items-center gap-2 px-1">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 accent-teal-600 cursor-pointer"
                checked={filteredOrders.length > 0 && filteredOrders.every(o => selectedOrderIds.has(o.id))}
                onChange={() => {
                  const allSelected = filteredOrders.every(o => selectedOrderIds.has(o.id));
                  if (allSelected) {
                    setSelectedOrderIds(new Set());
                  } else {
                    setSelectedOrderIds(new Set(filteredOrders.map(o => o.id)));
                  }
                }}
              />
              <span className="text-xs text-muted-foreground">Seleccionar todos ({filteredOrders.length})</span>
            </div>
          )}

          {ordersGroupedByClient.map(({ client, orders: clientOrders }) => {
            // Merge all items across orders (sum quantities for same product)
            const itemMap = new Map<string, Order["items"][0]>();
            clientOrders.forEach((order) => {
              order.items.forEach((item) => {
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
            const productosResumen = mergedItems.map((i) => `${i.quantity}× ${i.name}`).join(" · ");
            const firstOrder = clientOrders[0];
            const isGroupSelected = clientOrders.length > 0 && clientOrders.every((o) => selectedOrderIds.has(o.id));
            // Status: most "pending" (first non-completed, else first)
            const displayOrder = clientOrders.find((o) => o.status !== "completed") ?? firstOrder;
            const config = statusConfig[displayOrder.status] || {
              label: displayOrder.status,
              color: "text-gray-700",
              dotColor: "bg-gray-500",
              bgColor: "bg-gray-50",
              borderColor: "border-gray-200",
            };
            const mergedOrder: Order = { ...firstOrder, items: mergedItems };

            const onView = () => {
              setDetailOrder(mergedOrder);
              setActiveModal("detail");
            };

            const StatusBadge = () => (
              <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-semibold shrink-0 ${config.bgColor} border ${config.borderColor}`}>
                <div className={`w-1.5 h-1.5 rounded-full ${config.dotColor}`} />
                <span className={config.color}>{config.label}</span>
              </div>
            );

            return (
              <div key={client}>
                {/* Desktop: una fila por cliente */}
                <div className="hidden lg:block border rounded-xl overflow-hidden shadow-sm mb-2">
                  <table className="w-full table-fixed">
                    <thead className="bg-muted/50 border-b">
                      <tr className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {user?.role === "admin" && <th className="pl-3 pr-1 py-2 w-8"></th>}
                        <th className="px-3 py-2 text-left w-36">Cliente</th>
                        <th className="px-3 py-2 text-left">Productos</th>
                        <th className="px-3 py-2 text-left w-40 hidden md:table-cell">Dirección</th>
                        <th className="px-3 py-2 text-left w-44">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr
                        className="hover:bg-muted/30 transition-colors text-sm cursor-pointer"
                        onClick={onView}
                      >
                        {user?.role === "admin" && (
                          <td className="pl-3 pr-1 py-2.5 w-8">
                            <input
                              type="checkbox"
                              checked={isGroupSelected}
                              onChange={() => toggleGroup(clientOrders)}
                              onClick={(e) => e.stopPropagation()}
                              className="h-4 w-4 rounded border-gray-300 accent-teal-600 cursor-pointer"
                            />
                          </td>
                        )}
                        <td className="px-3 py-2.5">
                          <p className="text-xs font-semibold text-foreground truncate">{client}</p>
                          {clientOrders.length > 1 && (
                            <p className="text-[10px] text-muted-foreground">{clientOrders.length} pedidos</p>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <p className="text-xs text-foreground truncate" title={productosResumen}>{productosResumen}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {mergedItems.length} {mergedItems.length === 1 ? "producto" : "productos"}
                          </p>
                        </td>
                        <td className="px-3 py-2.5 hidden md:table-cell">
                          <p className="text-xs text-muted-foreground truncate max-w-[160px]">
                            {displayOrder.address && displayOrder.address !== "Retiro en local"
                              ? displayOrder.address
                              : <span className="italic">Retiro en local</span>}
                          </p>
                          {displayOrder.city && <p className="text-[10px] text-muted-foreground/70">{displayOrder.city}</p>}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <StatusBadge />
                            <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onView(); }} className="h-7 text-xs gap-1 text-primary hover:bg-primary/5 ml-auto">
                              <Eye className="h-3.5 w-3.5" />
                              Ver
                            </Button>
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Mobile: una card por cliente */}
                <div className="lg:hidden mb-1.5">
                  <Card className="overflow-hidden">
                    <div
                      className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/20 transition-colors"
                      onClick={onView}
                    >
                      {user?.role === "admin" && (
                        <input
                          type="checkbox"
                          checked={isGroupSelected}
                          onChange={() => toggleGroup(clientOrders)}
                          onClick={(e) => e.stopPropagation()}
                          className="h-4 w-4 rounded border-gray-300 accent-teal-600 cursor-pointer shrink-0"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 mb-0.5">
                          <p className="text-xs font-semibold text-foreground truncate">{client}</p>
                          {clientOrders.length > 1 && (
                            <span className="text-[10px] text-muted-foreground shrink-0">({clientOrders.length})</span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground truncate">{productosResumen}</p>
                        {displayOrder.address && displayOrder.address !== "Retiro en local" && (
                          <p className="text-[10px] text-muted-foreground/70 truncate">{displayOrder.address}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <StatusBadge />
                        <Button
                          variant="ghost" size="icon"
                          onClick={(e) => { e.stopPropagation(); onView(); }}
                          className="h-6 w-6 text-primary hover:bg-primary/5"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                </div>
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



      <RouteMapModal
        open={routeModalOpen}
        onOpenChange={setRouteModalOpen}
        orders={filteredOrders}
      />

      </div>

    </MainLayout>
  );
}
