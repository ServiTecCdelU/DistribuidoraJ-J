//app\pedidos\page.tsx
"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { MainLayout } from "@/components/layout/main-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DataTableSkeleton } from "@/components/ui/data-table-skeleton";
import { Input } from "@/components/ui/input";
import { ClientModal } from "@/components/clientes/client-modal";
import { ordersApi, salesApi, clientsApi, paymentsApi, sellersApi } from "@/lib/api";
import type { Order, OrderStatus, Client, Seller } from "@/lib/types";
import { Package, Search, User, Filter, X, Loader2, Navigation, ClipboardList, ShoppingCart, Warehouse, Clock, CheckCircle2, FileSpreadsheet } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useRouter } from "next/navigation";
import { collection, getDocs, query, where, orderBy, limit } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { OrdersFilters } from "@/components/pedidos/orders-filters";
import { OrderCard } from "@/components/pedidos/order-card";
import { OrderDetailModal } from "@/components/pedidos/order-detail-modal";
import { PaymentModal } from "@/components/pedidos/payment-modal";
import { SuccessModal } from "@/components/pedidos/success-modal";
import { RouteMapModal } from "@/components/pedidos/route-map-modal";
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
  const [paymentType, setPaymentType] = useState<"cash" | "credit" | "split">(
    "cash",
  );
  const [paymentMethod, setPaymentMethod] = useState<"efectivo" | "transferencia">("efectivo");
  const [cashAmount, setCashAmount] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [clientSearch, setClientSearch] = useState("");
  const [showClientModal, setShowClientModal] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false);

  const [routeModalOpen, setRouteModalOpen] = useState(false);
  const [stockOptionsOpen, setStockOptionsOpen] = useState(false);
  const [generandoExcel, setGenerandoExcel] = useState(false);

  // Selección masiva
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [bulkTransportistaId, setBulkTransportistaId] = useState<string>("");
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

  const handleGenerateRemito = useCallback(async (order: Order) => {
    // If remito already exists, just download it
    if (order.remitoNumber && order.remitoPdfBase64) {
      const link = document.createElement("a");
      link.href = `data:application/pdf;base64,${order.remitoPdfBase64}`;
      link.download = `remito-${order.remitoNumber}.pdf`;
      link.click();
      return;
    }

    setGeneratingDoc(true);
    try {
      // Generate sequential remito number (query ventas for last number)
      const remitosQuery = query(
        collection(firestore, "ventas"),
        where("remitoNumber", "!=", null),
        orderBy("remitoNumber", "desc"),
        limit(1),
      );
      const snap = await getDocs(remitosQuery);
      let ultimoNumero = 0;
      if (!snap.empty) {
        const lastRemito = snap.docs[0].data().remitoNumber;
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

  const handleGenerateInvoice = useCallback(async (order: Order) => {
    // Si ya tiene PDF guardado, solo descargar
    if (order.invoicePdfBase64 && order.invoiceNumber) {
      const link = document.createElement("a");
      link.href = `data:application/pdf;base64,${order.invoicePdfBase64}`;
      link.download = `boleta-${order.invoiceNumber}.pdf`;
      link.click();
      return;
    }

    setGeneratingDoc(true);
    try {
      // Si el pedido ya fue procesado como venta, emitir sobre la venta (tiene
      // total, paymentMethod, etc.). Si no, emitir directo sobre el pedido —
      // el helper calcula el total desde los items.
      const { getAuth } = await import("firebase/auth");
      const auth = getAuth();
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("Usuario no autenticado");
      const token = await currentUser.getIdToken();

      // Resolver datos del cliente
      let clientData: any = {
        name: order.clientName || "Consumidor Final",
        taxCategory: "consumidor_final",
      };
      if (order.clientId) {
        try {
          const clientDoc = clients.find((c) => c.id === order.clientId);
          if (clientDoc) {
            clientData = {
              name: clientDoc.name || order.clientName,
              phone: clientDoc.phone || "",
              cuit: clientDoc.cuit || "",
              address: clientDoc.address || "",
              taxCategory: clientDoc.taxCategory || "consumidor_final",
            };
          }
        } catch {}
      }

      // 1. Emitir en AFIP sobre la VENTA asociada (no sobre el pedido) —
      // la venta ya tiene total, paymentMethod y todo lo necesario.
      const afipResponse = await fetch("/api/ventas/emitir", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          saleId: order.saleId || order.id,
          client: clientData,
          emitirAfip: true,
          collection: order.saleId ? "ventas" : "pedidos",
        }),
      });

      if (!afipResponse.ok) {
        const errorText = await afipResponse.text().catch(() => "Error desconocido");
        throw new Error(`Error en AFIP (${afipResponse.status}): ${errorText.substring(0, 200)}`);
      }

      const { invoiceNumber, afipData } = await afipResponse.json();

      // 2. Generar PDF con datos AFIP — misma función que ventas
      const total = calculateOrderTotal(order);
      const ventaData = {
        id: order.id,
        clientName: clientData.name,
        clientCuit: clientData.cuit,
        clientAddress: clientData.address,
        clientTaxCategory: clientData.taxCategory,
        items: order.items.map((i) => ({ name: i.name, quantity: i.quantity, price: i.price, ...(i.itemDiscount ? { itemDiscount: i.itemDiscount } : {}) })),
        total,
        paymentType: "cash" as const,
        createdAt: order.createdAt,
        deliveryAddress: order.address,
        invoiceNumber,
      };
      const { generarPdfCliente } = await import("@/hooks/useGenerarPdf");
      const pdfBase64 = await generarPdfCliente(ventaData, "boleta", afipData);

      // 3. Guardar PDF y datos AFIP en el pedido
      const updatedOrder = await ordersApi.saveBoletaToOrder(order.id, invoiceNumber, pdfBase64, {
        invoiceEmitted: true,
        afipData,
        invoiceStatus: "emitted",
      });
      setOrders((prev) => prev.map((o) => (o.id === order.id ? updatedOrder : o)));
      if (detailOrder?.id === order.id) setDetailOrder(updatedOrder);

      // 4. Descargar automáticamente
      const link = document.createElement("a");
      link.href = `data:application/pdf;base64,${pdfBase64}`;
      link.download = `boleta-${invoiceNumber}.pdf`;
      link.click();
    } catch (error: any) {
      toast.error(`Error al generar la boleta: ${error.message}`);
    } finally {
      setGeneratingDoc(false);
    }
  }, [detailOrder, clients]);

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
      setPaymentType("cash");
    } else if (selectedOrder) {
      setSelectedClientId("");
      setPaymentType("cash");
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
        setStockOptionsOpen(true);
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

  const handleCompleteOrder = useCallback(async () => {
    if (!selectedOrder) return;
    setProcessingPayment(true);

    try {
      const total = calculateOrderTotal(selectedOrder);

      // ✅ Siempre usar el clientId del pedido, sin importar el método de pago
      const resolvedClientId = selectedClientId || selectedOrder.clientId;
      const client = clients.find((c) => c.id === resolvedClientId);

      if (
        (paymentType === "credit" || paymentType === "split") &&
        !resolvedClientId
      ) {
        throw new Error("Debe seleccionar un cliente para cuenta corriente");
      }

      const normalizedCashAmount =
        paymentType === "split" ? Number(cashAmount || 0) : 0;
      if (
        paymentType === "split" &&
        (normalizedCashAmount <= 0 || normalizedCashAmount >= total)
      ) {
        throw new Error(
          "El pago en efectivo debe ser mayor a 0 y menor al total",
        );
      }

      const sale = await salesApi.processSale({
        // ✅ clientId y clientName siempre se pasan, sin importar el método de pago
        clientId: resolvedClientId,
        clientName: client?.name || selectedOrder.clientName,
        clientPhone: client?.phone,
        sellerId: selectedOrder.sellerId, // ✅ agregar esta línea
        sellerName: selectedOrder.sellerName, // ✅ agregar esta línea
        items: selectedOrder.items.map((item) => ({
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
        paymentType: paymentType === "split" ? "credit" : paymentType,
        paymentMethod,
        source: "order",
        createOrder: false,
        orderId: selectedOrder.id,
        deliveryMethod:
          selectedOrder.address === "Retiro en local" ? "pickup" : "delivery",
        deliveryAddress: selectedOrder.address,
      });

      if (paymentType === "split" && client && normalizedCashAmount > 0) {
        await paymentsApi.registerCashPayment({
          clientId: client.id,
          amount: normalizedCashAmount,
          description: `Pago parcial pedido #${selectedOrder.id}`,
        });
      }

      const updated = await ordersApi.completeOrder(selectedOrder.id, sale.id);
      setOrders((prev) =>
        prev.map((o) => (o.id === selectedOrder.id ? updated : o)),
      );

      // Si el pedido ya tenía boleta generada, transferirla a la venta nueva
      if (selectedOrder.invoiceNumber && selectedOrder.invoicePdfBase64) {
        const orderAny = selectedOrder as any;
        await salesApi.saveBoletaToSale(
          sale.id,
          selectedOrder.invoiceNumber,
          selectedOrder.invoicePdfBase64,
          orderAny.afipData ? { afipData: orderAny.afipData } : undefined,
        );
      }

      // Si el pedido ya tenía remito generado, transferirlo a la venta nueva
      if (selectedOrder.remitoNumber && selectedOrder.remitoPdfBase64) {
        await salesApi.saveRemitoToSale(
          sale.id,
          selectedOrder.remitoNumber,
          selectedOrder.remitoPdfBase64,
        );
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

      setLastSaleResult({
        paymentType,
        paymentMethod,
        total,
        originalTotal: orderDisc > 0 ? rawTotal : undefined,
        discountLabel,
        saleId: sale.id,
        client,
      });

      // React 18 batchea múltiples setState — no hace falta setTimeout
      setActiveModal("success");
      setSelectedOrder(null);
      setPaymentType("cash");
      setPaymentMethod("efectivo");
      setCashAmount("");
      setSelectedClientId("");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Error al completar el pedido",
      );
    } finally {
      setProcessingPayment(false);
    }
  }, [selectedOrder, selectedClientId, clients, paymentType, cashAmount]);

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

  const handleDescargarExcel = useCallback(() => {
    setGenerandoExcel(true);
    try {
      // Usar orders ya cargados en estado — sin fetches adicionales
      const activos = orders.filter((o) => o.status !== "completed");

      // Consolidar items por nombre de producto, conservando datos de lote
      type AcumItem = { nombre: string; cantidad: number; unidadesPorBulto?: number; precioUnitarioMayorista?: number };
      const acum = new Map<string, AcumItem>();
      for (const orden of activos) {
        for (const item of orden.items) {
          const existing = acum.get(item.name);
          if (existing) {
            existing.cantidad += item.quantity;
            // Si antes no teníamos datos de lote y ahora sí, los tomamos
            if (!existing.unidadesPorBulto && item.unidadesPorBulto) existing.unidadesPorBulto = item.unidadesPorBulto;
            if (!existing.precioUnitarioMayorista && item.precioUnitarioMayorista) existing.precioUnitarioMayorista = item.precioUnitarioMayorista;
          } else {
            acum.set(item.name, {
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

      const filas = Array.from(acum.values())
        .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
        .map((f) => {
          const bultos = f.unidadesPorBulto && f.unidadesPorBulto > 0
            ? Math.ceil(f.cantidad / f.unidadesPorBulto)
            : "";
          const precioTotal = (bultos !== "" && f.unidadesPorBulto && f.precioUnitarioMayorista)
            ? Math.round((bultos as number) * f.unidadesPorBulto * f.precioUnitarioMayorista * 100) / 100
            : "";
          return { ...f, bultos, precioTotal };
        });

      // CSV con BOM para Excel en español (separador ;)
      const sep = ";";
      const esc = (v: string | number) =>
        typeof v === "string" ? `"${v.replace(/"/g, '""')}"` : String(v);

      const cabecera = ["Producto", "Unidades pedidas", "Bultos", "Precio x bulto", "Total estimado"].map(esc).join(sep);
      const cuerpo = filas.map((f) => [
        f.nombre,
        f.cantidad,
        f.bultos !== "" ? f.bultos : "—",
        f.precioUnitarioMayorista ? f.precioUnitarioMayorista : "—",
        f.precioTotal !== "" ? f.precioTotal : "—",
      ].map(esc).join(sep));
      const totalUnidades = filas.reduce((s, r) => s + r.cantidad, 0);
      const totalPrecio = filas.reduce((s, r) => s + (typeof r.precioTotal === "number" ? r.precioTotal : 0), 0);
      const pie = ["TOTAL", totalUnidades, "", "", totalPrecio > 0 ? totalPrecio : "—"].map(esc).join(sep);

      const csv = "\uFEFF" + [cabecera, ...cuerpo, pie].join("\r\n");

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const fecha = new Date().toLocaleDateString("es-AR").replace(/\//g, "-");
      a.href = url;
      a.download = `pedido-mayorista-${fecha}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Descargado — ${filas.length} productos`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al descargar");
    } finally {
      setGenerandoExcel(false);
    }
  }, [orders]);

  const handleStockChoice = useCallback((modo: "esperar" | "disponible") => {
    setStockOptionsOpen(false);
    if (modo === "disponible") {
      setActiveModal("payment");
    } else {
      // "esperar" — cerrar sin completar, el pedido queda en su estado actual
      setSelectedOrder(null);
    }
  }, []);

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
    <MainLayout title="Pedidos" description="Seguimiento de pedidos y entregas">
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
        <div className="space-y-6">
          {ordersGroupedByClient.map(({ client, orders: clientOrders }) => (
            <div key={client}>
              {/* Client header */}
              <div className="flex items-center gap-2 mb-3 px-1">
                {user?.role === "admin" && (
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 accent-teal-600 cursor-pointer"
                    checked={clientOrders.length > 0 && clientOrders.every(o => selectedOrderIds.has(o.id))}
                    onChange={() => toggleGroup(clientOrders)}
                  />
                )}
                <User className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-bold text-foreground">{client}</h2>
                <span className="text-sm text-muted-foreground">({clientOrders.length} {clientOrders.length === 1 ? "pedido" : "pedidos"})</span>
                {user?.role === "admin" && clientOrders.some(o => selectedOrderIds.has(o.id)) && (
                  <Badge variant="secondary" className="ml-auto text-xs">{clientOrders.filter(o => selectedOrderIds.has(o.id)).length} sel.</Badge>
                )}
              </div>

              {/* Desktop table */}
              <div className="hidden lg:block border rounded-xl overflow-hidden shadow-sm mb-3">
                <table className="w-full table-fixed">
                  <thead className="bg-muted/50 border-b">
                    <tr className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {user?.role === "admin" && (
                        <th className="pl-3 pr-1 py-2.5 w-8"></th>
                      )}
                      <th className="px-3 py-2.5 text-left w-28">Pedido</th>
                      <th className="px-3 py-2.5 text-left w-36">Cliente</th>
                      <th className="px-3 py-2.5 text-left">Productos</th>
                      <th className="px-3 py-2.5 text-left w-44 hidden md:table-cell">Dirección</th>
                      <th className="px-3 py-2.5 text-left w-32">Estado</th>
                      <th className="px-3 py-2.5 text-right w-16"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {clientOrders.map((order, index) => (
                      <OrderCard
                        key={order.id}
                        order={order}
                        index={index}
                        totalOrders={filteredOrders.length}
                        variant="table"
                        onViewDetails={() => {
                          setDetailOrder(order);
                          setActiveModal("detail");
                        }}
                        isSelected={selectedOrderIds.has(order.id)}
                        onToggleSelect={user?.role === "admin" ? () => toggleOrder(order.id) : undefined}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="lg:hidden space-y-3 mb-3">
                {clientOrders.map((order, index) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    index={index}
                    totalOrders={filteredOrders.length}
                    variant="card"
                    onViewDetails={() => {
                      setDetailOrder(order);
                      setActiveModal("detail");
                    }}
                    isSelected={selectedOrderIds.has(order.id)}
                    onToggleSelect={user?.role === "admin" ? () => toggleOrder(order.id) : undefined}
                  />
                ))}
              </div>
            </div>
          ))}
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
        paymentType={paymentType}
        setPaymentType={setPaymentType}
        paymentMethod={paymentMethod}
        setPaymentMethod={setPaymentMethod}
        cashAmount={cashAmount}
        setCashAmount={setCashAmount}
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

      {/* Dialog: Esperar todo / Vender con lo que hay */}
      <Dialog open={stockOptionsOpen} onOpenChange={(v) => {
        if (!v) { setStockOptionsOpen(false); setSelectedOrder(null); }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Warehouse className="h-5 w-5 text-teal-600" />
              Completar pedido
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {selectedOrder && (
              <div className="rounded-xl border divide-y text-sm">
                {selectedOrder.items.map((item) => (
                  <div key={item.productId} className="flex items-center justify-between px-3 py-2 gap-2">
                    <span className="flex-1 truncate font-medium text-xs">{item.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">x{item.quantity}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                onClick={() => handleStockChoice("esperar")}
                className="flex flex-col items-center gap-2 p-4 rounded-2xl border-2 border-amber-300 bg-amber-50/50 hover:bg-amber-50 transition-colors text-left"
              >
                <Clock className="h-6 w-6 text-amber-600" />
                <div>
                  <p className="font-semibold text-sm text-amber-800">Esperar todo</p>
                  <p className="text-xs text-amber-700/70 mt-0.5">Queda pendiente hasta que llegue el stock</p>
                </div>
              </button>
              <button
                onClick={() => handleStockChoice("disponible")}
                className="flex flex-col items-center gap-2 p-4 rounded-2xl border-2 border-teal-300 bg-teal-50/50 hover:bg-teal-50 transition-colors text-left"
              >
                <CheckCircle2 className="h-6 w-6 text-teal-600" />
                <div>
                  <p className="font-semibold text-sm text-teal-800">Vender con lo que hay</p>
                  <p className="text-xs text-teal-700/70 mt-0.5">Confirma con stock local, el resto se cancela</p>
                </div>
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
