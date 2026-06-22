"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { MainLayout } from "@/components/layout/main-layout";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ProductModal, type StockAdjustment } from "@/components/productos/product-modal";
import { StockHistoryModal } from "@/components/productos/stock-history-modal";
import { InventoryValueHistory } from "@/components/productos/inventory-value-history";
import { RemitoImportModal } from "@/components/productos/remito-import-modal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { productsApi } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { generateReadableId } from "@/services/supabase-helpers";
import { getAuthToken } from "@/services/auth-service";
import { registrarMovimiento, getProductosARevisar, type ProductoARevisar } from "@/services/stock-service";
import type { Product, MayoristaProducto } from "@/lib/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatCurrency, formatCompactNumber } from "@/lib/utils/format";
import {
  getMayoristaProductos,
  applyGananciaToProducts,
  updateProductoPrecioVenta,
  sincronizarHabilitadoEnMayorista,
  importarListaPrecios,
  updatePrecioListaBatch,
  type ImportRow,
} from "@/services/mayorista-service";
import {
  Plus,
  Search,
  Pencil,
  Filter,
  X,
  Grid3x3,
  List,
  Package,
  Tag,
  DollarSign,
  AlertCircle,
  CheckCircle2,
  Copy,
  Check,
  History,
  TrendingUp,
  WheatOff,
  EyeOff,
  Eye,
  FileUp,
  FileDown,
  Upload,
  ChevronLeft,
  ChevronRight,
  Percent,
  RefreshCw,
  Pill,
  ChevronDown,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

// Tipos para los filtros
type PriceFilter = "all" | "0-5000" | "5001-10000" | "10001-20000" | "20001+";
type StockFilter = "all" | "available" | "low" | "out";
type CategoryFilter = string;
type ViewMode = "grid" | "list";

// Tipos para historiales
export interface StockMovement {
  id: string;
  productId: string;
  productName: string;
  type:
    | "sale"
    | "manual_add"
    | "manual_remove"
    | "deactivation"
    | "creation"
    | "bulk_operation";
  previousStock: number;
  newStock: number;
  change: number;
  date: Date;
  reason?: string;
  saleId?: string;
  saleTotal?: number;
  sellerId?: string;
  sellerName?: string;
  clientId?: string;
  clientName?: string;
  userId?: string;
  userName?: string;
  details?: string;
}

export interface InventorySnapshot {
  id: string;
  date: Date;
  totalValue: number;
  productCount: number;
  lowStockCount: number;
  outOfStockCount: number;
}

export default function ProductosPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearchQuery(value), 300);
  };

  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false);
  const [productToDeactivate, setProductToDeactivate] =
    useState<Product | null>(null);
  const [bulkDeactivateDialogOpen, setBulkDeactivateDialogOpen] =
    useState(false);

  // Estados para filtros
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [priceFilter, setPriceFilter] = useState<PriceFilter>("all");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [habilitadosIds, setHabilitadosIds] = useState<Set<string>>(new Set());
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  const [remitoImportOpen, setRemitoImportOpen] = useState(false);

  // Ganancia global
  const [gananciaInput, setGananciaInput] = useState("");
  const [applyingGlobal, setApplyingGlobal] = useState(false);
  // Ganancia solo rubro medicamentos
  const [gananciaMedInput, setGananciaMedInput] = useState("");
  const [applyingMed, setApplyingMed] = useState(false);
  const [progressGanancia, setProgressGanancia] = useState({ done: 0, total: 0 });

  // Exportar lista de precios a PDF
  const [exportandoPdf, setExportandoPdf] = useState(false);

  // Estados para historiales
  const [stockHistory, setStockHistory] = useState<StockMovement[]>([]);
  const [inventoryHistory, setInventoryHistory] = useState<InventorySnapshot[]>(
    [],
  );
  const [showStockHistory, setShowStockHistory] = useState(false);
  const [selectedProductHistory, setSelectedProductHistory] =
    useState<Product | null>(null);
  const [showInventoryHistory, setShowInventoryHistory] = useState(false);

  const [productosARevisar, setProductosARevisar] = useState<ProductoARevisar[]>([]);
  const [showRevisar, setShowRevisar] = useState(true);

  // Paginación server-side
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalProducts, setTotalProducts] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const fetchProducts = useCallback(async (page: number, search: string, category: string, stock: string) => {
    setLoading(true);
    try {
      const result = await productsApi.search({
        search: search || undefined,
        category: category !== 'all' ? category : undefined,
        stockFilter: stock as any,
        page,
        pageSize,
      });
      setProducts(result.data);
      setTotalProducts(result.total);
      setTotalPages(result.totalPages);
      const ids = new Set(result.data.filter((p) => !(p as any).disabled).map((p) => p.id));
      setHabilitadosIds(ids);
    } catch {
      toast.error("Error al cargar productos");
    } finally {
      setLoading(false);
    }
  }, [pageSize]);

  useEffect(() => {
    fetchProducts(currentPage, searchQuery, categoryFilter, stockFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, searchQuery, categoryFilter, stockFilter, pageSize]);

  useEffect(() => {
    loadStockHistory();
    loadInventoryHistory();
    getProductosARevisar().then(setProductosARevisar).catch(() => {});
  }, []);

  const loadProducts = async () => {
    fetchProducts(currentPage, searchQuery, categoryFilter, stockFilter);
  };

  // --- CSV: Descargar planilla ---
  const descargarPlanilla = () => {
    if (products.length === 0) { toast.error("No hay productos"); return; }
    const SEP = ";";
    const header = ["ID", "Nombre", "Precio", "Stock"].join(SEP);
    const rows = products
      .filter((p) => !(p as any).disabled)
      .map((p) => {
        const name = p.name.replace(/"/g, "'");
        return [p.id, `"${name}"`, p.price, p.stock].join(SEP);
      });
    const csv = "\uFEFF" + "sep=;\n" + [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `productos_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Planilla descargada con ${rows.length} productos`);
  };

  // --- PDF: Exportar lista de precios ---
  // El price guardado ya es el precio por unidad
  const precioMostrar = (p: Product): number => p.price;

  const printHtml = (html: string) => {
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
  };

  const exportarListaPdf = async () => {
    setExportandoPdf(true);
    const toastId = "export-pdf";
    toast.loading("Generando lista de precios...", { id: toastId });
    try {
      const PAGE = 1000;
      const baseParams = {
        search: searchQuery || undefined,
        category: categoryFilter !== "all" ? categoryFilter : undefined,
        stockFilter: stockFilter as any,
        pageSize: PAGE,
      };
      const first = await productsApi.search({ ...baseParams, page: 1 });
      const acumulado: Product[] = [...first.data];
      for (let page = 2; page <= first.totalPages; page++) {
        const r = await productsApi.search({ ...baseParams, page });
        acumulado.push(...r.data);
      }
      let lista = acumulado.filter((p) => !(p as any).disabled && p.price > 0);
      lista = lista.filter((p) => {
        switch (priceFilter) {
          case "0-5000": return p.price <= 5000;
          case "5001-10000": return p.price > 5000 && p.price <= 10000;
          case "10001-20000": return p.price > 10000 && p.price <= 20000;
          case "20001+": return p.price > 20000;
          default: return true;
        }
      });
      if (lista.length === 0) {
        toast.error("No hay productos para exportar", { id: toastId });
        return;
      }

      const grupos = new Map<string, Product[]>();
      lista.forEach((p) => {
        const cat = p.category || "Sin categoría";
        if (!grupos.has(cat)) grupos.set(cat, []);
        grupos.get(cat)!.push(p);
      });
      const cats = [...grupos.keys()].sort((a, b) => a.localeCompare(b, "es"));
      cats.forEach((c) => grupos.get(c)!.sort((a, b) => a.name.localeCompare(b.name, "es")));

      const fecha = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "long", year: "numeric" }).format(new Date());
      const fmt = (n: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(n);
      const esc = (s: string) => (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

      let body = "";
      for (const cat of cats) {
        const items = grupos.get(cat)!;
        body += `<tr class="cat"><td colspan="3">${esc(cat)} <span class="cat-count">(${items.length})</span></td></tr>`;
        for (const p of items) {
          body += `<tr><td class="cod">${esc(p.codigo || p.description || "")}</td><td class="nom">${esc(p.name)}</td><td class="precio">${fmt(precioMostrar(p))}<span class="unit"> /u</span></td></tr>`;
        }
      }

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Lista de Precios</title><style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;padding:28px;font-size:12px;color:#1f2937}
.header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #0d9488;padding-bottom:12px;margin-bottom:6px}
.header h1{font-size:20px;color:#0f172a}
.header .sub{font-size:13px;color:#0d9488;font-weight:600;margin-top:2px}
.header .meta{text-align:right;font-size:11px;color:#6b7280;line-height:1.5}
.legend{font-size:10px;color:#9ca3af;margin-bottom:14px}
table{width:100%;border-collapse:collapse}
th{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;text-align:left;padding:6px 10px;border-bottom:1px solid #e5e7eb;background:#f9fafb}
th.right,td.precio{text-align:right}
td{padding:5px 10px;border-bottom:1px solid #f3f4f6;vertical-align:top}
td.cod{font-family:ui-monospace,monospace;font-size:10px;color:#9ca3af;white-space:nowrap;width:90px}
td.nom{font-weight:500}
td.precio{font-weight:700;color:#0d9488;white-space:nowrap}
td.precio .unit{font-size:9px;font-weight:400;color:#9ca3af}
tr.cat td{background:#0f172a;color:#fff;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.04em;padding:7px 10px}
tr.cat .cat-count{font-weight:400;color:#94a3b8}
tr.cat td{border:none}
.footer{margin-top:18px;text-align:center;font-size:10px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:8px}
@page{margin:0}
@media print{body{padding:14mm}tr.cat{page-break-after:avoid}tr{page-break-inside:avoid}}
</style></head><body>
<div class="header"><div><h1>Distribuidora J&J</h1><div class="sub">Lista de Precios</div></div><div class="meta"><div>${fecha}</div><div>${lista.length} productos</div></div></div>
<div class="legend">Precios de venta vigentes por unidad.</div>
<table><thead><tr><th>Código</th><th>Producto</th><th class="right">Precio</th></tr></thead><tbody>${body}</tbody></table>
<div class="footer">Generado el ${fecha} · Distribuidora J&J</div>
</body></html>`;

      printHtml(html);
      toast.success(`Lista generada con ${lista.length} productos`, { id: toastId });
    } catch {
      toast.error("Error al generar la lista", { id: toastId });
    } finally {
      setExportandoPdf(false);
    }
  };

  // --- CSV: Subir planilla ---
  const [importando, setImportando] = useState(false);

  const subirPlanilla = async (file: File) => {
    setImportando(true);
    const toastId = "import-csv";
    toast.loading("Procesando planilla...", { id: toastId });
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("sep="));
      if (lines.length < 2) throw new Error("El archivo está vacío");

      // Detectar separador (;  o ,)
      const headerLine = lines[0];
      const sep = headerLine.includes(";") ? ";" : ",";

      // Saltar header
      const dataLines = lines.slice(1);
      let updated = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (const line of dataLines) {
        // Parsear CSV respetando comillas
        const parts: string[] = [];
        let current = "";
        let inQuotes = false;
        for (const ch of line) {
          if (ch === '"') { inQuotes = !inQuotes; continue; }
          if (ch === sep && !inQuotes) { parts.push(current.trim()); current = ""; continue; }
          current += ch;
        }
        parts.push(current.trim());

        const [id, , newPriceStr, newStockStr] = parts;
        if (!id) continue;

        const product = products.find((p) => p.id === id);
        if (!product) { errors.push(`ID "${id}" no encontrado`); continue; }

        const newPrice = newPriceStr ? parseFloat(newPriceStr.replace(",", ".")) : NaN;
        const newStock = newStockStr ? parseInt(newStockStr, 10) : NaN;

        if (isNaN(newPrice) && isNaN(newStock)) { skipped++; continue; }

        const updates: Partial<Product> = {};
        if (!isNaN(newPrice) && newPrice >= 0 && newPrice !== product.price) updates.price = newPrice;
        if (!isNaN(newStock) && newStock >= 0 && newStock !== product.stock) updates.stock = newStock;

        if (Object.keys(updates).length === 0) { skipped++; continue; }

        await productsApi.update(product.id, updates);
        updated++;
      }

      await loadProducts();

      let msg = `${updated} producto${updated !== 1 ? "s" : ""} actualizado${updated !== 1 ? "s" : ""}`;
      if (skipped > 0) msg += `, ${skipped} sin cambios`;
      if (errors.length > 0) msg += `. Errores: ${errors.slice(0, 3).join(", ")}`;

      toast.success(msg, { id: toastId, duration: 5000 });
    } catch (error: any) {
      toast.error(`Error: ${error.message}`, { id: toastId });
    } finally {
      setImportando(false);
    }
  };

  // --- Excel: Cargar lista de precios ---
  const [cargarListaOpen, setCargarListaOpen] = useState(false);

  const onListaImportada = async () => {
    fetchProducts(1, searchQuery, categoryFilter, stockFilter);
    setCurrentPage(1);
  };

  const loadStockHistory = () => {
    const saved = localStorage.getItem("stockHistory");
    if (saved) {
      const parsed = JSON.parse(saved);
      setStockHistory(
        parsed.map((h: any) => ({
          ...h,
          date: new Date(h.date),
        })),
      );
    }
  };

  const saveStockHistory = (history: StockMovement[]) => {
    localStorage.setItem("stockHistory", JSON.stringify(history));
    setStockHistory(history);
  };

  const loadInventoryHistory = () => {
    const saved = localStorage.getItem("inventoryHistory");
    if (saved) {
      const parsed = JSON.parse(saved);
      setInventoryHistory(
        parsed.map((h: any) => ({
          ...h,
          date: new Date(h.date),
        })),
      );
    }
  };

  const saveInventorySnapshot = () => {
    const totalValue = products.reduce((sum, p) => sum + p.price * p.stock, 0);
    const lowStockCount = products.filter(
      (p) => p.stock > 0 && p.stock < 10,
    ).length;
    const outOfStockCount = products.filter((p) => p.stock === 0).length;

    const newSnapshot: InventorySnapshot = {
      id: Date.now().toString(),
      date: new Date(),
      totalValue,
      productCount: products.length,
      lowStockCount,
      outOfStockCount,
    };

    const updated = [...inventoryHistory, newSnapshot].slice(-30);
    localStorage.setItem("inventoryHistory", JSON.stringify(updated));
    setInventoryHistory(updated);
  };

  const registrarEnSupabase = async (
    productId: string,
    tipo: 'venta' | 'apertura_bulto' | 'ajuste' | 'rotura',
    cantidad: number,
    stockAnterior: number,
    stockPosterior: number,
    motivo?: string
  ) => {
    try {
      await fetch(`/api/productos/${productId}/movimiento`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo, cantidad, stockAnterior, stockPosterior, motivo }),
      })
    } catch { /* no interrumpir el flujo */ }
  }

  const logStockMovement = (movement: Omit<StockMovement, "id" | "date">) => {
    const newMovement: StockMovement = {
      ...movement,
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      date: new Date(),
    };
    const updated = [newMovement, ...stockHistory].slice(0, 200);
    saveStockHistory(updated);
    return newMovement;
  };

  const logSaleMovement = (
    product: Product,
    quantity: number,
    saleId: string,
    saleTotal: number,
    sellerName?: string,
    clientName?: string,
  ) => {
    return logStockMovement({
      productId: product.id,
      productName: product.name,
      type: "sale",
      previousStock: product.stock + quantity,
      newStock: product.stock,
      change: -quantity,
      reason: `Venta realizada${sellerName ? ` por ${sellerName}` : ""}`,
      saleId,
      saleTotal,
      sellerName,
      clientName,
      details: `Se vendieron ${quantity} unidad(es) por ${formatCurrency(product.price * quantity)}`,
    });
  };

  // NUEVO: Deshabilitar (en lugar de eliminar)
  const logDisableMovement = (product: Product, reason?: string) => {
    return logStockMovement({
      productId: product.id,
      productName: product.name,
      type: "deactivation",
      previousStock: product.stock,
      newStock: product.stock,
      change: 0,
      reason: reason || "Producto deshabilitado",
      details: `Se deshabilitó "${product.name}". Stock conservado: ${product.stock}`,
    });
  };
  const logEnableMovement = (product: Product, reason?: string) => {
    return logStockMovement({
      productId: product.id,
      productName: product.name,
      type: "manual_add",
      previousStock: product.stock,
      newStock: product.stock,
      change: 0,
      reason: reason || "Producto habilitado",
      details: `Se volvió a habilitar "${product.name}"`,
    });
  };

  const logManualAdd = (
    product: Product,
    quantity: number,
    userName?: string,
    reason?: string,
  ) => {
    return logStockMovement({
      productId: product.id,
      productName: product.name,
      type: "manual_add",
      previousStock: product.stock - quantity,
      newStock: product.stock,
      change: quantity,
      reason: reason || "Suma de inventario",
      userName,
      details: `Se agregaron ${quantity} unidad(es) al stock`,
    });
  };

  const logManualRemove = (
    product: Product,
    quantity: number,
    userName?: string,
    reason?: string,
  ) => {
    return logStockMovement({
      productId: product.id,
      productName: product.name,
      type: "manual_remove",
      previousStock: product.stock + quantity,
      newStock: product.stock,
      change: -quantity,
      reason: reason || "Resta de inventario",
      userName,
      details: `Se quitaron ${quantity} unidad(es) del stock`,
    });
  };

  const handleAplicarGlobal = async () => {
    const porc = parseFloat(gananciaInput);
    if (isNaN(porc) || porc < 0) { toast.error("Ingresá un porcentaje válido"); return; }
    setApplyingGlobal(true);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error("No autenticado");
      const res = await fetch("/api/apply-ganancia", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ porcentaje: porc }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error del servidor");
      toast.success(`Ganancia del ${porc}% aplicada a ${data.updated} productos`);
      await fetchProducts(currentPage, searchQuery, categoryFilter, stockFilter);
    } catch (err: any) {
      toast.error(err.message || "Error al aplicar la ganancia");
    } finally {
      setApplyingGlobal(false);
    }
  };

  const handleAplicarMedicamentos = async () => {
    const porc = parseFloat(gananciaMedInput);
    if (isNaN(porc) || porc < 0) { toast.error("Ingresá un porcentaje válido"); return; }
    setApplyingMed(true);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error("No autenticado");
      const res = await fetch("/api/apply-ganancia", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ porcentaje: porc, scope: "medicamentos" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error del servidor");
      toast.success(`Ganancia del ${porc}% aplicada a ${data.updated} medicamentos`);
      await fetchProducts(currentPage, searchQuery, categoryFilter, stockFilter);
    } catch (err: any) {
      toast.error(err.message || "Error al aplicar la ganancia");
    } finally {
      setApplyingMed(false);
    }
  };

  const handleCreate = () => {
    setEditingProduct(null);
    setModalOpen(true);
  };

  const handleRemitoConfirm = async (
    updates: { productId: string; newStock: number; cantidad: number; productName: string; precioLista: number }[],
  ) => {
    for (const update of updates) {
      const product = products.find((p) => p.id === update.productId);
      const cantidad = update.cantidad ?? (update.newStock - (product?.stock ?? 0));
      if (cantidad <= 0) continue;

      // registrarMovimiento lee el stock real de la BD (no el cacheado), suma la cantidad,
      // sincroniza productos.stock y mayorista_productos.stock_local y nunca deja negativos.
      const mpId = update.productId.replace(/^prod_/, "");
      await registrarMovimiento({
        productoId: mpId,
        tipo: "apertura_bulto",
        cantidad,
        referencia: "Ingreso por remito proveedor",
      });

      logStockMovement({
        productId: update.productId,
        productName: update.productName,
        type: "manual_add",
        previousStock: product?.stock ?? 0,
        newStock: update.newStock,
        change: cantidad,
        reason: "Importación de remito proveedor",
        details: `Ingreso por remito: +${cantidad}`,
      });
    }

    // Actualizar precio_lista en mayorista_productos
    const precioUpdates = updates
      .filter((u) => u.precioLista > 0)
      .map((u) => ({ productoId: u.productId, precioLista: u.precioLista }));
    if (precioUpdates.length > 0) {
      await updatePrecioListaBatch(precioUpdates);
    }

    // Recalcular precio_venta usando ganancia_global para productos con cambio de precio
    for (const update of updates) {
      if (update.precioLista <= 0) continue;
      const product = products.find((p) => p.id === update.productId);
      if (!product || product.gananciaGlobal == null || product.gananciaGlobal <= 0) continue;
      const nuevoPrecioVenta = Math.round(update.precioLista * (1 + product.gananciaGlobal / 100) * 100) / 100;
      await productsApi.update(update.productId, {
        price: nuevoPrecioVenta,
        precioVenta: nuevoPrecioVenta,
      } as any);
    }

    // Recargar productos
    await fetchProducts(currentPage, searchQuery, categoryFilter, stockFilter);
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setModalOpen(true);
  };

  // NUEVO: Abrir diálogo de Deshabilitar
  const handleDeactivate = (product: Product) => {
    setProductToDeactivate(product);
    setDeactivateDialogOpen(true);
  };
  const handleEnable = async (product: Product) => {
    try {
      logEnableMovement(product, "Habilitado manualmente");

      await productsApi.update(product.id, {
        disabled: false,
      } as any);

      // Sincronizar con mayorista_productos
      await sincronizarHabilitadoEnMayorista(product.id, true);

      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, disabled: false } : p)),
      );
      setHabilitadosIds((prev) => new Set([...prev, product.id]));

      toast.success(`"${product.name}" habilitado`);
    } catch (error) {
      toast.error("Error al habilitar producto");
    }
  };

  // Confirmar deshabilitar producto
  const confirmDeactivate = async () => {
    if (!productToDeactivate) return;

    try {
      // Log del movimiento
      logDisableMovement(productToDeactivate, "Deshabilitado manualmente");

      // Actualizar en Firebase (solo lo necesario)
      await productsApi.update(productToDeactivate.id, {
        disabled: true,
      } as any);

      // Sincronizar con mayorista_productos
      await sincronizarHabilitadoEnMayorista(productToDeactivate.id, false);

      // Actualizar estado local
      setProducts((prev) =>
        prev.map((p) =>
          p.id === productToDeactivate.id ? { ...p, disabled: true } : p,
        ),
      );
      setHabilitadosIds((prev) => {
        const next = new Set(prev);
        next.delete(productToDeactivate.id);
        return next;
      });

      toast.success(`"${productToDeactivate.name}" deshabilitado`);
    } catch (error) {
      toast.error("Error al deshabilitar producto");
    } finally {
      setDeactivateDialogOpen(false);
      setProductToDeactivate(null);
    }
  };

  const handleBulkDeactivate = () => {
    setBulkDeactivateDialogOpen(true);
  };

  const confirmBulkDeactivate = async () => {
    try {
      const productsToDisable = products.filter((p) =>
        selectedProducts.includes(p.id),
      );

      productsToDisable.forEach((product) => {
        logDisableMovement(
          product,
          `Deshabilitado masivo (${selectedProducts.length} productos)`,
        );
      });

      await Promise.all(
        selectedProducts.map((id) =>
          productsApi.update(id, { disabled: true } as any),
        ),
      );

      // Sincronizar con mayorista_productos
      await Promise.all(
        selectedProducts.map((id) => sincronizarHabilitadoEnMayorista(id, false))
      );

      const updatedProducts = products.map((p) =>
        selectedProducts.includes(p.id) ? { ...p, disabled: true } : p,
      );

      setProducts(updatedProducts);
      setSelectedProducts([]);

      toast.success(`${productsToDisable.length} productos deshabilitados`);
    } catch (error) {
      toast.error("Error al deshabilitar productos");
    } finally {
      setBulkDeactivateDialogOpen(false);
    }
  };

  const handleSave = async (productData: Omit<Product, "id" | "createdAt">, stockAdjustment?: StockAdjustment) => {
    try {
      if (editingProduct) {
        const isMayorista = editingProduct.id.startsWith("prod_");

        // Detectar cambio de stock
        if (productData.stock !== editingProduct.stock) {
          const change = productData.stock - editingProduct.stock;
          const reason = stockAdjustment?.reason || "Edición desde modal";
          if (change > 0) {
            logManualAdd(editingProduct, change, undefined, reason);
          } else if (change < 0) {
            logManualRemove(editingProduct, Math.abs(change), undefined, reason);
          }
          // En BD el historial del mayorista lo registra registrarMovimiento; acá solo el resto
          if (!isMayorista) {
            registrarEnSupabase(
              editingProduct.id,
              change > 0 ? 'apertura_bulto' : 'ajuste',
              change,
              editingProduct.stock,
              productData.stock,
              reason
            );
          }
        }

        // Para mayorista con ajuste, no pasar stock a productsApi.update — registrarMovimiento lo maneja
        const updateData = (isMayorista && stockAdjustment && stockAdjustment.quantity > 0)
          ? { ...productData, stock: editingProduct.stock } // mantener stock original, registrarMovimiento lo cambia
          : productData;

        const updated = await productsApi.update(
          editingProduct.id,
          updateData,
        );

        // Si es mayorista, registrar movimiento en stock_movimientos (esto actualiza stock en ambas tablas)
        if (isMayorista && stockAdjustment && stockAdjustment.quantity > 0) {
          const mpId = editingProduct.id.replace("prod_", "");
          await registrarMovimiento({
            productoId: mpId,
            // remove + pérdida real => rotura; remove sin pérdida => ajuste; add => apertura_bulto
            tipo: stockAdjustment.type === "remove"
              ? (stockAdjustment.isLoss ? "rotura" : "ajuste")
              : "apertura_bulto",
            cantidad: stockAdjustment.type === "remove" ? -stockAdjustment.quantity : stockAdjustment.quantity,
            referencia: stockAdjustment.reason || undefined,
          });
          // Re-leer stock actualizado
          updated.stock = productData.stock;
        }

        setProducts(
          products.map((p) => (p.id === editingProduct.id ? updated : p)),
        );

        // Solo registrar pérdida en caja si el "quitar" es una pérdida real (rotura/vencido).
        // Un ajuste de stock común no debe figurar en caja.
        if (stockAdjustment?.type === "remove" && stockAdjustment.quantity > 0 && stockAdjustment.isLoss) {
          // Obtener precio mayorista (costo) para calcular la pérdida
          let precioCosto = 0;
          if (isMayorista) {
            const mpId = editingProduct.id.replace("prod_", "");
            const { data: mpData } = await supabase
              .from("mayorista_productos")
              .select("precio_lista")
              .eq("id", mpId)
              .single();
            precioCosto = Number(mpData?.precio_lista) || 0;
          } else {
            precioCosto = editingProduct.price;
          }

          const totalPerdida = precioCosto * stockAdjustment.quantity;
          const desc = `[ROTURA] ${stockAdjustment.quantity}x ${editingProduct.name} — ${stockAdjustment.reason}`;
          const docId = await generateReadableId("transacciones", "perdida", editingProduct.name.slice(0, 20));
          const { error: txError } = await supabase.from("transacciones").insert({
            id: docId,
            client_id: null,
            type: "payment",
            amount: -totalPerdida,
            description: desc,
            date: new Date().toISOString(),
          });
          if (txError) {
            console.error("Error registrando pérdida en caja:", txError.message, txError.code, txError.details, txError.hint);
            toast.error("Stock actualizado pero no se pudo registrar la pérdida en caja");
          }
        }
      } else {
        const newProduct = await productsApi.create(productData);
        setProducts([...products, newProduct]);

        logStockMovement({
          productId: newProduct.id,
          productName: newProduct.name,
          type: "creation",
          previousStock: 0,
          newStock: newProduct.stock,
          change: newProduct.stock,
          reason: "Creación de nuevo producto",
          details: `Stock inicial: ${newProduct.stock} unidades`,
        });
      }
      refreshCategories();
      setModalOpen(false);
    } catch (error) {
      toast.error("Error al guardar el producto");
    }
  };

  const handleViewHistory = (product: Product) => {
    setSelectedProductHistory(product);
    setShowStockHistory(true);
  };

  // Filtros client-side que no están en server (precio)
  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      let matchesPrice = true;
      switch (priceFilter) {
        case "0-5000":
          matchesPrice = product.price <= 5000;
          break;
        case "5001-10000":
          matchesPrice = product.price > 5000 && product.price <= 10000;
          break;
        case "10001-20000":
          matchesPrice = product.price > 10000 && product.price <= 20000;
          break;
        case "20001+":
          matchesPrice = product.price > 20000;
          break;
      }
      return matchesPrice;
    });
  }, [products, priceFilter]);

  const [stats, setStats] = useState({
    totalProducts: 0,
    totalInventoryValue: 0,
    lowStockCount: 0,
    outOfStockCount: 0,
    gananciaActual: null as number | null,
    gananciaMedicamentos: null as number | null,
  });

  const fetchStats = useCallback(async () => {
    try {
      const s = await productsApi.getStats();
      setStats(s);
    } catch { /* noop */ }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [products]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, categoryFilter, priceFilter, stockFilter]);

  const paginatedProducts = filteredProducts;

  // Categorías reales de la BD
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);

  const refreshCategories = useCallback(() => {
    productsApi.getCategories().then(setAvailableCategories).catch(() => {});
  }, []);

  useEffect(() => {
    refreshCategories();
  }, [refreshCategories]);

  const activeFilterCount = [
    categoryFilter !== "all",
    priceFilter !== "all",
    stockFilter !== "all",
  ].filter(Boolean).length;

  const clearFilters = () => {
    setCategoryFilter("all");
    setPriceFilter("all");
    setStockFilter("all");
    setSearchInput("");
    setSearchQuery("");
  };

  const toggleProductSelection = (productId: string) => {
    setSelectedProducts((prev) =>
      prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [...prev, productId],
    );
  };

  const toggleSelectAll = () => {
    if (selectedProducts.length === filteredProducts.length) {
      setSelectedProducts([]);
    } else {
      setSelectedProducts(filteredProducts.map((p) => p.id));
    }
  };

  const handleDuplicate = async (product: Product) => {
    try {
      const { id: _, createdAt: __, ...productData } = product;
      const newProduct = await productsApi.create({
        ...productData,
        name: `${product.name} (copia)`,
      });

      logStockMovement({
        productId: newProduct.id,
        productName: newProduct.name,
        type: "creation",
        previousStock: 0,
        newStock: newProduct.stock,
        change: newProduct.stock,
        reason: `Duplicación`,
        details: `Copia de "${product.name}"`,
      });

      setProducts([...products, newProduct]);
    } catch (error) {
      toast.error("Error al duplicar producto");
    }
  };

  const getStockColor = (stock: number) => {
    if (stock === 0) return "destructive";
    if (stock < 10) return "warning";
    return "success";
  };

  const getStockText = (stock: number) => {
    if (stock === 0) return "Sin stock";
    if (stock < 10) return "Bajo stock";
    return "Disponible";
  };

  const GridSkeleton = () => (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 xl:grid-cols-4 gap-2 sm:gap-4">
      {[...Array(8)].map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-border bg-card overflow-hidden"
        >
          <Skeleton className="h-32 sm:h-48 w-full" />
          <div className="p-2 sm:p-4 space-y-2 sm:space-y-3">
            <Skeleton className="h-3 sm:h-4 w-3/4" />
            <Skeleton className="h-2 sm:h-3 w-1/4" />
            <div className="flex justify-between">
              <Skeleton className="h-2 sm:h-4 w-1/3" />
              <Skeleton className="h-2 sm:h-4 w-1/4" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  const ListSkeleton = () => (
    <div className="space-y-3">
      {[...Array(5)].map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card"
        >
          <Skeleton className="h-16 w-16 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/4" />
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <MainLayout allowedRoles={['admin']} title="Productos" description="Gestiona tu catálogo de productos">
      <div>
      {/* Header */}
      <div className="mb-4 sm:mb-6">
        {/* Toolbar compacta */}
        <div className="flex flex-col items-center gap-2">
          {/* Ganancia solo medicamentos */}
          <div className="flex items-center gap-1.5 rounded-2xl border border-border bg-card px-3 py-1.5">
            <Pill className="h-3.5 w-3.5 text-teal-600" />
            <span className="text-xs font-medium text-muted-foreground">Medicamentos</span>
            {stats.gananciaMedicamentos != null && (
              <span className="text-xs font-semibold text-teal-600">{stats.gananciaMedicamentos}%</span>
            )}
            <Input
              type="number"
              min={0}
              placeholder="%"
              value={gananciaMedInput}
              onChange={(e) => setGananciaMedInput(e.target.value)}
              className="w-16 h-7 text-xs px-2"
            />
            <Button
              size="sm"
              disabled={applyingMed || !gananciaMedInput}
              onClick={handleAplicarMedicamentos}
              className="h-7 px-2 text-xs gap-1"
            >
              {applyingMed ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">Aplicar</span>
            </Button>
          </div>

          <div className="flex items-center justify-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 rounded-2xl border border-border bg-card px-3 py-1.5">
            <Percent className="h-3.5 w-3.5 text-teal-600" />
            <span className="text-xs font-medium text-muted-foreground hidden sm:inline">Ganancia</span>
            {stats.gananciaActual != null && (
              <span className="text-xs font-semibold text-teal-600">{stats.gananciaActual}%</span>
            )}
            <Input
              type="number"
              min={0}
              placeholder="%"
              value={gananciaInput}
              onChange={(e) => setGananciaInput(e.target.value)}
              className="w-16 h-7 text-xs px-2"
            />
            <Button
              size="sm"
              disabled={applyingGlobal || !gananciaInput}
              onClick={handleAplicarGlobal}
              className="h-7 px-2 text-xs gap-1"
            >
              {applyingGlobal ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">Aplicar</span>
            </Button>

            <div className="w-px h-5 bg-border mx-1" />

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRemitoImportOpen(true)}
              className="gap-1.5 h-7 px-2"
            >
              <FileUp className="h-3.5 w-3.5" />
              <span className="hidden sm:inline text-xs">Remito</span>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={exportarListaPdf}
              disabled={exportandoPdf}
              className="gap-1.5 h-7 px-2"
              title="Exportar lista de precios a PDF"
            >
              {exportandoPdf ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline text-xs">PDF</span>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="gap-1 h-7 px-2"
            >
              <Filter className="h-3.5 w-3.5" />
              {activeFilterCount > 0 && (
                <Badge
                  variant="secondary"
                  className="h-4 w-4 p-0 flex items-center justify-center text-[10px]"
                >
                  {activeFilterCount}
                </Badge>
              )}
            </Button>

          </div>

          {applyingGlobal && progressGanancia.total > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground tabular-nums">{progressGanancia.done}/{progressGanancia.total}</span>
              <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-teal-500 rounded-full transition-all" style={{ width: `${Math.round((progressGanancia.done / progressGanancia.total) * 100)}%` }} />
              </div>
            </div>
          )}
          </div>
        </div>

        {/* Barra de búsqueda */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar productos..."
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-10 pr-10 h-10 sm:h-11 text-sm"
          />
          {searchInput && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7"
              onClick={() => { setSearchInput(""); setSearchQuery(""); }}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Filtros */}
      {showFilters && (
        <div className="mb-4 sm:mb-6 p-3 sm:p-4 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-sm">Filtros</h3>
            <div className="flex items-center gap-2">
              {activeFilterCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="gap-1 h-7 text-xs"
                >
                  <X className="h-3 w-3" />
                  Limpiar
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setShowFilters(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
            {/* Rubro / Categoría */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Rubro
              </label>
              <Select
                value={categoryFilter}
                onValueChange={(v) => setCategoryFilter(v as CategoryFilter)}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {[...new Set(availableCategories)].sort().map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Precio */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Precio
              </label>
              <Select
                value={priceFilter}
                onValueChange={(v) => setPriceFilter(v as PriceFilter)}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="0-5000">Hasta $5.000</SelectItem>
                  <SelectItem value="5001-10000">$5.000 – $10.000</SelectItem>
                  <SelectItem value="10001-20000">$10.000 – $20.000</SelectItem>
                  <SelectItem value="20001+">Más de $20.000</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Stock */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Stock
              </label>
              <Select
                value={stockFilter}
                onValueChange={(v) => setStockFilter(v as StockFilter)}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="available">Disponible</SelectItem>
                  <SelectItem value="low">Bajo stock</SelectItem>
                  <SelectItem value="out">Sin stock</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}

      {/* Estadísticas - Responsive */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 mb-4 sm:mb-6">
        <div className="rounded-xl bg-primary/5 border border-primary/20 dark:bg-primary/10 dark:border-primary/30 p-3 sm:p-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-primary/10 dark:bg-primary/20 flex items-center justify-center">
              <Package className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
            </div>
            <div>
              <p className="text-[10px] sm:text-sm text-muted-foreground">
                Total
              </p>
              <p className="text-lg sm:text-2xl font-bold text-foreground">
                {stats.totalProducts}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-success/5 border border-success/20 dark:bg-success/10 dark:border-success/30 p-3 sm:p-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-success/10 dark:bg-success/20 flex items-center justify-center">
              <DollarSign className="h-4 w-4 sm:h-5 sm:w-5 text-success" />
            </div>
            <div>
              <p className="text-[10px] sm:text-sm text-muted-foreground">
                Valor
              </p>
              <p className="text-lg sm:text-2xl font-bold text-foreground truncate">
                {formatCompactNumber(stats.totalInventoryValue)}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-warning/5 border border-warning/20 dark:bg-warning/10 dark:border-warning/30 p-3 sm:p-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-warning/10 dark:bg-warning/20 flex items-center justify-center">
              <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5 text-warning" />
            </div>
            <div>
              <p className="text-[10px] sm:text-sm text-muted-foreground">
                Bajo
              </p>
              <p className="text-lg sm:text-2xl font-bold text-foreground">
                {stats.lowStockCount}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-destructive/5 border border-destructive/20 dark:bg-destructive/10 dark:border-destructive/30 p-3 sm:p-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-destructive/10 dark:bg-destructive/20 flex items-center justify-center">
              <X className="h-4 w-4 sm:h-5 sm:w-5 text-destructive" />
            </div>
            <div>
              <p className="text-[10px] sm:text-sm text-muted-foreground">
                Sin stock
              </p>
              <p className="text-lg sm:text-2xl font-bold text-foreground">
                {stats.outOfStockCount}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Productos a revisar - irregularidades de stock — oculto temporalmente */}
      {false && productosARevisar.length > 0 && (
        <div className="mb-4 sm:mb-6 rounded-2xl border border-amber-300 bg-amber-50 dark:border-amber-700/50 dark:bg-amber-950/30 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowRevisar((v) => !v)}
            className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <span className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                Stock a revisar
              </span>
              <Badge className="bg-amber-600 hover:bg-amber-600 text-white h-5 px-2 text-xs">
                {productosARevisar.length}
              </Badge>
            </div>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-amber-600 dark:text-amber-400 transition-transform",
                showRevisar && "rotate-180",
              )}
            />
          </button>
          {showRevisar && (
            <div className="px-2 pb-2 sm:px-3 sm:pb-3">
              <p className="px-2 pt-1 pb-1.5 text-[11px] text-amber-700/80 dark:text-amber-300/70">
                Se intentó descontar más stock del disponible (incluye descontar de 0). Ordenado por fecha. Revisá el conteo físico.
              </p>
              <div className="space-y-1.5 max-h-[60vh] overflow-y-auto pr-1">
              {productosARevisar.map((p) => (
                <div
                  key={p.productoId}
                  className="flex items-center justify-between gap-3 rounded-xl bg-card border border-amber-200/60 dark:border-amber-800/40 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{p.nombre}</p>
                    <p className="text-[11px] text-muted-foreground">
                      Cód. {p.codigo} · stock actual {p.stockActual} · {p.cantidadMovimientos}{" "}
                      {p.cantidadMovimientos === 1 ? "movimiento" : "movimientos"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <p className="text-sm font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                        -{p.unidadesFaltantes}
                      </p>
                      <p className="text-[10px] text-muted-foreground">faltante</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title="Ver historial de stock"
                      onClick={() => {
                        const prod = products.find((x) => x.id === p.productoId);
                        handleViewHistory(
                          prod ??
                            ({
                              id: p.productoId,
                              name: p.nombre,
                              price: 0,
                              stock: p.stockActual,
                            } as Product),
                        );
                      }}
                    >
                      <History className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
              </div>
            </div>
          )}
        </div>
      )}


      {/* Barra de selección masiva - AHORA CON "Deshabilitar" */}
      {selectedProducts.length > 0 && (
        <div className="mb-4 p-3 rounded-lg border border-border bg-card/80 backdrop-blur-sm flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            <span className="font-medium text-sm">
              {selectedProducts.length} seleccionados
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={handleBulkDeactivate}
            >
              <EyeOff className="h-4 w-4" />
              <span className="hidden sm:inline">Deshabilitar</span>
              <span className="sm:hidden">Sacar</span>
            </Button>
          </div>
        </div>
      )}

      {/* Contenido principal */}
      {loading ? (
        viewMode === "grid" ? (
          <GridSkeleton />
        ) : (
          <ListSkeleton />
        )
      ) : (
        <>
          {filteredProducts.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-border bg-card/50 p-8 sm:p-12 text-center">
              <div className="max-w-md mx-auto space-y-4">
                <div className="h-12 w-12 sm:h-16 sm:w-16 rounded-full bg-muted flex items-center justify-center mx-auto">
                  <Package className="h-6 w-6 sm:h-8 sm:w-8 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground mb-1">
                    No se encontraron productos
                  </h3>
                  <p className="text-muted-foreground text-sm mb-6">
                    {searchQuery || activeFilterCount > 0
                      ? "Prueba ajustando tus filtros"
                      : "No hay productos habilitados en el catálogo"}
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <Button onClick={handleCreate} className="gap-2">
                      <Plus className="h-4 w-4" />
                      Agregar
                    </Button>
                    {(searchQuery || activeFilterCount > 0) && (
                      <Button variant="outline" onClick={clearFilters}>
                        Limpiar
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Vista Grid - SIEMPRE 2 COLUMNAS EN MÓVIL */}
              {viewMode === "grid" ? (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
                  {paginatedProducts.map((product) => {
                    const isSelected = selectedProducts.includes(product.id);
                    const stockColor = getStockColor(product.stock);
                    const fallbackImg = "/logo.png";
                    const imageSrc =
                      product.imageUrl && typeof product.imageUrl === "string"
                        ? product.imageUrl.startsWith("blob:")
                          ? fallbackImg
                          : product.imageUrl
                        : fallbackImg;

                    return (
                      <div
                        key={product.id}
                        className={cn(
                          "group relative rounded-xl border-2 bg-card overflow-hidden transition-all duration-300 hover:shadow-lg",
                          isSelected
                            ? "border-primary ring-2 ring-primary/20"
                            : "border-border hover:border-primary/50",
                        )}
                      >
                        {/* Checkbox */}
                        <div className="absolute top-2 left-2 z-10">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleProductSelection(product.id);
                            }}
                            className={cn(
                              "h-4 w-4 sm:h-5 sm:w-5 rounded border flex items-center justify-center transition-colors bg-background/80 backdrop-blur",
                              isSelected
                                ? "bg-primary border-primary text-primary-foreground"
                                : "border-border hover:border-primary",
                            )}
                          >
                            {isSelected && (
                              <Check className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                            )}
                          </button>
                        </div>

                        {/* Badge Sin TACC */}
                        {(product as any).sinTacc && (
                          <div className="absolute top-2 right-2 z-10">
                            <Badge className="bg-green-100 text-green-800 border-green-200 text-[10px] sm:text-xs px-1.5 py-0">
                              <WheatOff className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-0.5" />
                              <span className="hidden sm:inline">Sin TACC</span>
                              <span className="sm:hidden">S/T</span>
                            </Badge>
                          </div>
                        )}
                        {(product as any).disabled && (
                          <div className="absolute top-8 left-2 z-10">
                            <Badge
                              variant="destructive"
                              className="text-[10px] sm:text-xs px-1.5 py-0 flex items-center gap-1"
                            >
                              <EyeOff className="h-3 w-3" />
                              Deshabilitado
                            </Badge>
                          </div>
                        )}

                        {/* Badge Base */}
                        {(product as any).marca && (
                          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10">
                            <Badge
                              variant="secondary"
                              className="text-[10px] sm:text-xs px-1.5 py-0 capitalize bg-background/80 backdrop-blur"
                            >
                              {(product as any).marca}
                            </Badge>
                          </div>
                        )}

                        {/* Imagen */}
                        <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                          <img
                            src={imageSrc}
                            alt={product.name}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                            onError={(e) => {
                              e.currentTarget.src = fallbackImg;
                            }}
                          />

                          {/* Stock badge */}
                          <div className="absolute bottom-2 right-2">
                            <Badge
                              variant={
                                stockColor === "destructive"
                                  ? "destructive"
                                  : stockColor === "warning"
                                    ? "secondary"
                                    : "outline"
                              }
                              className={cn(
                                "font-medium text-[10px] sm:text-xs px-1.5 py-0",
                                stockColor === "warning" &&
                                  "bg-amber-100 text-amber-800 border-amber-200",
                                stockColor === "success" &&
                                  "bg-green-100 text-green-800 border-green-200",
                              )}
                            >
                              {product.stock}
                            </Badge>
                          </div>
                        </div>

                        {/* Contenido */}
                        <div className="p-1.5 sm:p-4">
                          <div className="mb-1 sm:mb-2">
                            <h3 className="font-semibold text-foreground text-[11px] sm:text-base line-clamp-1">
                              {product.name}
                            </h3>
                            <p className="hidden sm:block text-sm text-muted-foreground line-clamp-2 min-h-[2.5rem]">
                              {product.description}
                            </p>
                          </div>

                          <div className="flex items-center justify-between mb-1.5 sm:mb-4">
                            <Badge
                              variant="outline"
                              className="hidden sm:inline-flex text-xs px-1.5 py-0"
                            >
                              <Tag className="h-3 w-3 mr-1" />
                              {product.category}
                            </Badge>
                            <span className="text-xs sm:text-lg font-bold text-primary">
                              {formatCurrency(product.price)}
                            </span>
                          </div>

                          {/* Acciones - Solo Editar y Ver Historial en móvil */}
                          <div className="flex items-center justify-end gap-2 min-w-[140px]">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleViewHistory(product)}
                              title="Historial"
                            >
                              <History className="h-3.5 w-3.5" />
                            </Button>

                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleDuplicate(product)}
                              title="Duplicar"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </Button>

                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleEdit(product)}
                              title="Editar"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>

                            {(product as any).disabled ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-green-600 hover:text-green-700"
                                onClick={() => handleEnable(product)}
                                title="Habilitar producto"
                              >
                                <CheckCircle2 className="h-4 w-4" />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-amber-600 hover:text-amber-700"
                                onClick={() => handleDeactivate(product)}
                                title="Deshabilitar"
                              >
                                <EyeOff className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Vista Lista — tabla compacta estilo mayorista */
                <div className="rounded-2xl border overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px] md:text-sm leading-tight [&_th]:px-1.5 [&_th]:py-1 [&_td]:px-1.5 [&_td]:py-1 md:[&_th]:px-3 md:[&_th]:py-3 md:[&_td]:px-3 md:[&_td]:py-2.5">
                      <thead className="bg-muted/50 border-b">
                        <tr>
                          <th className="text-left px-3 py-3 font-semibold text-muted-foreground">Código</th>
                          <th className="text-left px-3 py-3 font-semibold text-muted-foreground">Descripción</th>
                          <th className="hidden md:table-cell text-left px-3 py-3 font-semibold text-muted-foreground">Categoría</th>
                          <th className="text-right px-3 py-3 font-semibold text-muted-foreground whitespace-nowrap">Precio</th>
                          <th className="text-right px-3 py-3 font-semibold text-muted-foreground">Stock</th>
                          <th className="text-center px-3 py-3 font-semibold text-muted-foreground whitespace-nowrap">Lote</th>
                          <th className="text-center px-3 py-3 font-semibold text-muted-foreground">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {paginatedProducts.map((product) => {
                          const stockColor = getStockColor(product.stock);
                          const isDisabled = (product as any).disabled;
                          return (
                            <tr
                              key={product.id}
                              className={cn(
                                "hover:bg-muted/20 transition-colors",
                                isDisabled && "opacity-50",
                              )}
                            >
                              <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground whitespace-nowrap">
                                {product.description || "—"}
                              </td>
                              <td className="px-3 py-2.5 font-medium max-w-[260px] truncate">
                                <span>{product.name}</span>
                                {isDisabled && (
                                  <Badge variant="destructive" className="ml-2 text-[10px] px-1.5 py-0">Deshabilitado</Badge>
                                )}
                              </td>
                              <td className="hidden md:table-cell px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                                {product.category}
                              </td>
                              <td className="px-3 py-2.5 text-right font-semibold text-teal-600 whitespace-nowrap">
                                {product.unidadesPorBulto && product.seDivideEn && product.unidadesPorBulto > 0
                                  ? formatCurrency(Math.round(product.price * product.seDivideEn / product.unidadesPorBulto * 100) / 100)
                                  : formatCurrency(product.price)}
                                {product.unidadesPorBulto && product.seDivideEn && product.unidadesPorBulto > 0 && (
                                  <span className="block text-[10px] font-normal text-muted-foreground">/ lote</span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-right">
                                <Badge
                                  variant={stockColor === "destructive" ? "destructive" : stockColor === "warning" ? "secondary" : "outline"}
                                  className={cn(
                                    "text-xs font-medium",
                                    stockColor === "warning" && "bg-amber-100 text-amber-800 border-amber-200",
                                    stockColor === "success" && "bg-green-100 text-green-800 border-green-200",
                                  )}
                                >
                                  {product.stock}
                                </Badge>
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                {product.unidadesPorBulto ? (
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <button className="inline-flex items-center gap-1 text-xs font-medium text-teal-600 hover:text-teal-700 transition-colors">
                                        {product.seDivideEn && product.seDivideEn > 1
                                          ? `${Math.floor(product.unidadesPorBulto / product.seDivideEn)} lotes`
                                          : `${product.unidadesPorBulto}u`}
                                        <Eye className="h-3 w-3 text-muted-foreground" />
                                      </button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-52 p-3 text-xs space-y-1.5" side="left">
                                      <p className="font-semibold text-foreground mb-2">Detalle de lote</p>
                                      <div className="flex justify-between">
                                        <span className="text-muted-foreground">Cantidad de unidades por bulto</span>
                                        <span className="font-medium">{product.unidadesPorBulto}</span>
                                      </div>
                                      {product.seDivideEn && product.seDivideEn > 1 && (
                                        <>
                                          <div className="flex justify-between">
                                            <span className="text-muted-foreground">mini bultos</span>
                                            <span className="font-medium">{Math.floor(product.unidadesPorBulto / product.seDivideEn)}</span>
                                          </div>
                                          <div className="flex justify-between">
                                            <span className="text-muted-foreground">cantidad de unidades por mini bulto</span>
                                            <span className="font-medium">{product.seDivideEn}</span>
                                          </div>
                                          <div className="flex justify-between border-t pt-1.5 mt-1">
                                            <span className="text-muted-foreground">Precio de cada mini bulto</span>
                                            <span className="font-semibold text-teal-600">{formatCurrency(Math.round(product.price * product.seDivideEn / product.unidadesPorBulto! * 100) / 100)}</span>
                                          </div>
                                        </>
                                      )}
                                    </PopoverContent>
                                  </Popover>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                <div className="flex items-center justify-center gap-0.5">
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleViewHistory(product)} title="Historial">
                                    <History className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(product)} title="Editar">
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  {isDisabled ? (
                                    <Button variant="ghost" size="icon" className="hidden md:inline-flex h-7 w-7 text-green-600 hover:text-green-700" onClick={() => handleEnable(product)} title="Habilitar">
                                      <CheckCircle2 className="h-3.5 w-3.5" />
                                    </Button>
                                  ) : (
                                    <Button variant="ghost" size="icon" className="hidden md:inline-flex h-7 w-7 text-amber-600 hover:text-amber-700" onClick={() => handleDeactivate(product)} title="Deshabilitar">
                                      <EyeOff className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Paginación */}
          {filteredProducts.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 pt-4 border-t border-border">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Mostrar:</span>
                {[10, 20, 50, 100].map((size) => (
                  <button
                    key={size}
                    onClick={() => {
                      setPageSize(size);
                      setCurrentPage(1);
                    }}
                    className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                      pageSize === size
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border hover:border-primary/50 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {Math.min((currentPage - 1) * pageSize + 1, totalProducts)}–
                  {Math.min(currentPage * pageSize, totalProducts)} de{" "}
                  {totalProducts}
                </span>
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="h-8 w-8 flex items-center justify-center rounded-md border border-border hover:border-primary/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-xs font-medium min-w-[2rem] text-center">
                  {currentPage}/{totalPages || 1}
                </span>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="h-8 w-8 flex items-center justify-center rounded-md border border-border hover:border-primary/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      </div>

      {/* Modales */}
      <ProductModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        product={editingProduct}
        onSave={handleSave}
        availableCategories={availableCategories}
        isDisabled={!!(editingProduct as any)?.disabled}
        onToggleDisabled={editingProduct ? () => {
          const p = editingProduct;
          setModalOpen(false);
          if ((p as any).disabled) handleEnable(p);
          else handleDeactivate(p);
        } : undefined}
      />

      <StockHistoryModal
        open={showStockHistory}
        onOpenChange={setShowStockHistory}
        product={selectedProductHistory}
      />

      <InventoryValueHistory
        open={showInventoryHistory}
        onOpenChange={setShowInventoryHistory}
        history={inventoryHistory}
      />

      {/* Diálogo Deshabilitar Individual */}
      <ConfirmDialog
        open={deactivateDialogOpen}
        onOpenChange={setDeactivateDialogOpen}
        title="Deshabilitar"
        description={`¿Está seguro que desea deshabilitar "${productToDeactivate?.name}"? El producto dejará de mostrarse pero conservará su stock.`}
        confirmText="Deshabilitar"
        onConfirm={confirmDeactivate}
        variant="destructive"
      />

      {/* Diálogo Deshabilitar Masivo */}
      <ConfirmDialog
        open={bulkDeactivateDialogOpen}
        onOpenChange={setBulkDeactivateDialogOpen}
        title="Sacar Productos de Stock"
        description={`¿Está seguro que desea deshabilitar ${selectedProducts.length} productos? Dejarán de mostrarse pero conservarán su stock.`}
        confirmText="Deshabilitar"
        onConfirm={confirmBulkDeactivate}
        variant="destructive"
      />

      {/* Modal importar remito proveedor */}
      <RemitoImportModal
        open={remitoImportOpen}
        onClose={() => setRemitoImportOpen(false)}
        products={products.filter((p) => !(p as any).disabled)}
        onConfirm={handleRemitoConfirm}
      />

      <CargarListaDialog
        open={cargarListaOpen}
        onOpenChange={setCargarListaOpen}
        onImportado={onListaImportada}
      />
    </MainLayout>
  );
}

// ─── Helpers para Excel ──────────────────────────────────────────────────────
function colIndexToLetter(index: number): string {
  let letter = "";
  let n = index;
  while (n >= 0) {
    letter = String.fromCharCode(65 + (n % 26)) + letter;
    n = Math.floor(n / 26) - 1;
  }
  return letter;
}
function cellToString(val: unknown): string {
  if (val === null || val === undefined) return "";
  return String(val).trim();
}
function cellToNumber(val: unknown): number {
  if (val === null || val === undefined) return 0;
  const n = Number(val);
  return isNaN(n) ? 0 : n;
}

type ColumnLetter = string;
interface ListaColumnMapping {
  codigo: ColumnLetter;
  descripcion: ColumnLetter;
  precio: ColumnLetter;
  stockPacks: ColumnLetter;
  lote: ColumnLetter;
}
interface ListaExcelColumn {
  letter: string;
  header: string;
  preview: string[];
}
interface ListaParsedRow {
  codigo: string;
  descripcion: string;
  lista1: number;
  stockPacks: number;
  lote: number;
  stockUnidades: number;
}

// ─── Diálogo Cargar Lista (productos) ────────────────────────────────────────
function CargarListaDialog({
  open,
  onOpenChange,
  onImportado,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImportado: () => Promise<void>;
}) {
  const [step, setStep] = useState<"upload" | "mapping" | "preview">("upload");
  const [columns, setColumns] = useState<ListaExcelColumn[]>([]);
  const [rawRows, setRawRows] = useState<unknown[][]>([]);
  const [headerRowIndex, setHeaderRowIndex] = useState(0);
  const [mapping, setMapping] = useState<ListaColumnMapping>({
    codigo: "A",
    descripcion: "B",
    precio: "C",
    stockPacks: "D",
    lote: "E",
  });
  const [parsed, setParsed] = useState<ListaParsedRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep("upload");
    setColumns([]);
    setRawRows([]);
    setParsed([]);
    setSaving(false);
    setProgress({ done: 0, total: 0 });
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleClose = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const XLSX = await import("xlsx");
        const data = new Uint8Array(ev.target!.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
          header: 1,
          defval: "",
        }) as unknown[][];

        if (rows.length < 2) {
          toast.error("El archivo no tiene suficientes filas");
          return;
        }

        // Auto-detectar fila de encabezados
        let detectedHeader = 0;
        for (let ri = 0; ri < Math.min(rows.length, 10); ri++) {
          const row = rows[ri] as unknown[];
          const textCells = row.filter((cell) => {
            const s = cellToString(cell);
            return s.length > 0 && isNaN(Number(s));
          });
          if (textCells.length >= 3) {
            detectedHeader = ri;
            break;
          }
        }

        const maxCols = Math.max(...rows.slice(detectedHeader, detectedHeader + 3).map((r) => (r as unknown[]).length));
        const cols: ListaExcelColumn[] = [];
        for (let i = 0; i < maxCols; i++) {
          const letter = colIndexToLetter(i);
          const header = cellToString((rows[detectedHeader] as unknown[])[i]);
          const preview = rows
            .slice(detectedHeader + 1, detectedHeader + 4)
            .map((r) => cellToString((r as unknown[])[i]));
          cols.push({ letter, header, preview });
        }

        // Auto-detectar mapeo desde headers
        const autoMapping: Partial<ListaColumnMapping> = {};
        for (const col of cols) {
          const h = col.header.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          if (!autoMapping.codigo && (h.includes("codigo") || h.includes("code") || h.includes("cod") || h === "id")) autoMapping.codigo = col.letter;
          else if (!autoMapping.descripcion && (h.includes("descripcion") || h.includes("nombre") || h.includes("producto") || h.includes("articulo"))) autoMapping.descripcion = col.letter;
          else if (!autoMapping.precio && (h.includes("precio") || h.includes("lista") || h.includes("p.u") || h.includes("costo"))) autoMapping.precio = col.letter;
          else if (!autoMapping.stockPacks && (h.includes("stock") || h.includes("cant") || h.includes("bulto") || h.includes("pack"))) autoMapping.stockPacks = col.letter;
          else if (!autoMapping.lote && (h.includes("lote") || h.includes("unidad") || h.includes("un.") || h.includes("x pack") || h.includes("un pack"))) autoMapping.lote = col.letter;
        }

        setHeaderRowIndex(detectedHeader);
        setColumns(cols);
        setRawRows(rows);
        setMapping((prev) => ({
          codigo: autoMapping.codigo || prev.codigo,
          descripcion: autoMapping.descripcion || prev.descripcion,
          precio: autoMapping.precio || prev.precio,
          stockPacks: autoMapping.stockPacks || prev.stockPacks,
          lote: autoMapping.lote || prev.lote,
        }));
        setStep("mapping");
      } catch {
        toast.error("Error al leer el archivo Excel");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const letterToIndex = (letter: string) => {
    let index = 0;
    for (let i = 0; i < letter.length; i++) {
      index = index * 26 + (letter.charCodeAt(i) - 64);
    }
    return index - 1;
  };

  const previewMapping = () => {
    const rows = rawRows.slice(headerRowIndex + 1);
    const result: ListaParsedRow[] = rows
      .map((row) => {
        const r = row as unknown[];
        const codigo = cellToString(r[letterToIndex(mapping.codigo)]);
        const descripcion = cellToString(r[letterToIndex(mapping.descripcion)]);
        const lista1 = cellToNumber(r[letterToIndex(mapping.precio)]);
        const stockPacks = cellToNumber(r[letterToIndex(mapping.stockPacks)]);
        const lote = cellToNumber(r[letterToIndex(mapping.lote)]);
        return {
          codigo,
          descripcion,
          lista1,
          stockPacks,
          lote: lote || 1,
          stockUnidades: Math.round(stockPacks * (lote || 1)),
        };
      })
      .filter((r) => {
        if (!r.codigo && r.lista1 === 0) return false;
        if (!r.codigo) return false;
        return true;
      });

    if (result.length === 0) {
      toast.error("No se encontraron filas válidas con el mapeo actual");
      return;
    }
    console.log(`[Cargar Lista] ${rows.length} filas → ${result.length} válidas`);
    setParsed(result);
    setStep("preview");
  };

  const confirmar = async () => {
    setSaving(true);
    setProgress({ done: 0, total: parsed.length });
    try {
      const importRows: ImportRow[] = parsed.map((r) => ({
        codigo: r.codigo,
        descripcion: r.descripcion || undefined,
        lista1: r.lista1,
        stockUnidades: r.stockUnidades,
        unPack: r.lote,
      }));

      console.log(`[Cargar Lista] Enviando ${importRows.length} filas a importarListaPrecios`);

      const { procesados, sinMayorista } = await importarListaPrecios(importRows, (done, total) =>
        setProgress({ done, total })
      );

      console.log(`[Cargar Lista] Procesados: ${procesados}, Sin mayorista: ${sinMayorista}`);

      await onImportado();

      let msg = `${procesados} productos procesados`;
      if (sinMayorista > 0) msg += ` · ${sinMayorista} creados sin vínculo mayorista`;
      toast.success(msg, { duration: 10000 });
      handleClose(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al importar los productos");
    } finally {
      setSaving(false);
    }
  };

  const camposRequeridos: { key: keyof ListaColumnMapping; label: string; required?: boolean }[] = [
    { key: "codigo", label: "Código", required: true },
    { key: "descripcion", label: "Descripción (opcional)" },
    { key: "precio", label: "Precio", required: true },
    { key: "stockPacks", label: "Stock (bultos/packs)", required: true },
    { key: "lote", label: "Lote (unidades por bulto)", required: true },
  ];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-[95vw] max-w-xl sm:max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Cargar Lista de Precios</DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Subí un archivo Excel (.xls o .xlsx) con código, precio, stock y lote. La descripción y rubro se toman de mayorista.
            </p>
            <Input
              ref={fileRef}
              type="file"
              accept=".xls,.xlsx"
              onChange={handleFile}
              className="rounded-xl"
            />
          </div>
        )}

        {step === "mapping" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Verificá que las columnas estén bien asignadas.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {camposRequeridos.map((campo) => (
                <div key={campo.key} className="space-y-1">
                  <label className="text-xs font-medium">
                    {campo.label} {campo.required && <span className="text-red-500">*</span>}
                  </label>
                  <select
                    className="w-full border rounded-xl px-2 py-1.5 text-sm bg-background"
                    value={mapping[campo.key]}
                    onChange={(e) => setMapping((prev) => ({ ...prev, [campo.key]: e.target.value }))}
                  >
                    {columns.map((col) => (
                      <option key={col.letter} value={col.letter}>
                        {col.letter} — {col.header || "(sin header)"} {col.preview[0] ? `(${col.preview[0]})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="rounded-xl border overflow-hidden text-xs">
              <p className="bg-muted/50 px-3 py-1.5 font-medium text-muted-foreground border-b">
                Vista previa — fila encabezado + primeras 5 filas
              </p>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-teal-50/50 dark:bg-teal-950/20">
                      <th className="px-2 py-1.5 text-left border-r whitespace-nowrap font-mono text-muted-foreground">#</th>
                      {columns.slice(0, 8).map((col) => (
                        <th key={col.letter} className="px-2 py-1.5 text-left border-r last:border-r-0 whitespace-nowrap">
                          <span className="font-mono font-bold text-teal-600">{col.letter}</span>
                          {col.header && <span className="block text-muted-foreground font-normal truncate max-w-[80px]">{col.header}</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rawRows.slice(headerRowIndex + 1, headerRowIndex + 6).map((row, ri) => (
                      <tr key={ri} className="border-t hover:bg-muted/20">
                        <td className="px-2 py-1 text-muted-foreground font-mono border-r">{ri + 1}</td>
                        {(row as unknown[]).slice(0, 8).map((cell, ci) => (
                          <td key={ci} className="px-2 py-1 border-r last:border-r-0 max-w-[90px] truncate">
                            {cellToString(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-between gap-2">
              <Button variant="outline" size="sm" className="rounded-xl" onClick={reset}>Volver</Button>
              <Button size="sm" className="rounded-xl" onClick={previewMapping}>Ver preview →</Button>
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground bg-muted/30 rounded-xl p-3">
              Se van a procesar <strong>{parsed.length} productos</strong> contra mayorista.
            </div>

            <div className="rounded-xl border overflow-hidden">
              <div className="overflow-x-auto max-h-52">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-left px-2 py-2 font-semibold">#</th>
                      <th className="text-left px-2 py-2 font-semibold">Código</th>
                      <th className="text-left px-2 py-2 font-semibold">Descripción</th>
                      <th className="text-right px-2 py-2 font-semibold">Precio</th>
                      <th className="text-right px-2 py-2 font-semibold">Stock</th>
                      <th className="text-right px-2 py-2 font-semibold">Lote</th>
                      <th className="text-right px-2 py-2 font-semibold">Unidades</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {parsed.slice(0, 200).map((row, i) => (
                      <tr key={i} className="hover:bg-muted/20">
                        <td className="px-2 py-1 font-mono text-muted-foreground">{i + 1}</td>
                        <td className="px-2 py-1 font-mono text-muted-foreground whitespace-nowrap">{row.codigo}</td>
                        <td className="px-2 py-1 max-w-[140px] truncate">{row.descripcion || "—"}</td>
                        <td className="px-2 py-1 text-right text-teal-600 font-semibold whitespace-nowrap">
                          {formatCurrency(row.lista1)}
                        </td>
                        <td className="px-2 py-1 text-right">{row.stockPacks}</td>
                        <td className="px-2 py-1 text-right">{row.lote}</td>
                        <td className="px-2 py-1 text-right font-semibold">{row.stockUnidades}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {parsed.length > 200 && (
                <p className="text-xs text-muted-foreground px-3 py-1.5 border-t bg-muted/20">
                  Mostrando 200 de {parsed.length} filas en la vista previa
                </p>
              )}
            </div>

            {saving && (
              <div className="space-y-1">
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-teal-500 transition-all duration-300"
                    style={{ width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  {progress.done} / {progress.total}
                </p>
              </div>
            )}

            <div className="flex justify-between gap-2">
              <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setStep("mapping")} disabled={saving}>
                ← Volver
              </Button>
              <Button size="sm" className="rounded-xl" onClick={confirmar} disabled={saving}>
                {saving ? "Importando..." : `Confirmar importación (${parsed.length})`}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
