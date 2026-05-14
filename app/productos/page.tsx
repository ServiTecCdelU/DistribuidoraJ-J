"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { MainLayout } from "@/components/layout/main-layout";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ProductModal } from "@/components/productos/product-modal";
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
import type { Product, MayoristaProducto } from "@/lib/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatCurrency, formatCompactNumber } from "@/lib/utils/format";
import {
  getMayoristaProductos,
  applyGananciaToProducts,
  updateProductoPrecioVenta,
  sincronizarHabilitadoEnMayorista,
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RecepcionMercaderia } from "@/components/productos/RecepcionMercaderia";

// Tipos para los filtros
type PriceFilter = "all" | "0-2800" | "2801-3000" | "3001-3200" | "3201+";
type MarcaFilter =
  | "all"
  | "MIO"
  | "YO HELADERIAS"
  | "TARGET"
  | "CARCARAÑA"
  | "FRIAR"
  | "MC CAIN"
  | "RESTAURANT"
  | "SIMPLOT"
  | "Sin identificar";
type StockFilter = "all" | "available" | "low" | "out";
type CategoryFilter =
  | "all"
  | "Congelado embutido"
  | "Congelado cárnico"
  | "Congelado papa"
  | "Congelado verdura"
  | "Congelado rebozado"
  | "Bebida"
  | "Lácteo"
  | "Conserva"
  | "Snack";
type SinTaccFilter = "all" | "sin-tacc" | "con-tacc";
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
  const [marcaFilter, setMarcaFilter] = useState<MarcaFilter>("all");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [sinTaccFilter, setSinTaccFilter] = useState<SinTaccFilter>("all");
  const [habilitadosIds, setHabilitadosIds] = useState<Set<string>>(new Set());
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  const [remitoImportOpen, setRemitoImportOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("catalogo");

  // Estados para historiales
  const [stockHistory, setStockHistory] = useState<StockMovement[]>([]);
  const [inventoryHistory, setInventoryHistory] = useState<InventorySnapshot[]>(
    [],
  );
  const [showStockHistory, setShowStockHistory] = useState(false);
  const [selectedProductHistory, setSelectedProductHistory] =
    useState<Product | null>(null);
  const [showInventoryHistory, setShowInventoryHistory] = useState(false);

  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    let mounted = true;
    const doLoad = async () => {
      try {
        const [data, mayoristaData] = await Promise.all([
          productsApi.getAll(),
          getMayoristaProductos(),
        ]);
        if (!mounted) return;
        setProducts(data);
        const ids = new Set(
          mayoristaData
            .filter((p) => p.habilitado && p.productoId)
            .map((p) => p.productoId!)
        );
        setHabilitadosIds(ids);
      } catch (error) {
        if (!mounted) return;
        toast.error("Error al cargar productos");
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    };
    doLoad();
    loadStockHistory();
    loadInventoryHistory();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (products.length > 0 && !loading) {
      saveInventorySnapshot();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products.length, loading]);

  const loadProducts = async () => {
    try {
      const data = await productsApi.getAll();
      setProducts(data);
    } catch (error) {
      toast.error("Error al recargar productos");
    } finally {
      setLoading(false);
    }
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

  const handleCreate = () => {
    setEditingProduct(null);
    setModalOpen(true);
  };

  const handleRemitoConfirm = async (
    updates: { productId: string; newStock: number; productName: string }[],
  ) => {
    for (const update of updates) {
      const product = products.find((p) => p.id === update.productId);
      if (!product) continue;

      await productsApi.update(update.productId, { stock: update.newStock } as any);

      const change = update.newStock - product.stock;
      logStockMovement({
        productId: product.id,
        productName: product.name,
        type: "manual_add",
        previousStock: product.stock,
        newStock: update.newStock,
        change,
        reason: "Importación de remito proveedor",
        details: `Stock actualizado via remito: ${product.stock} → ${update.newStock}`,
      });
    }

    // Recargar productos
    const refreshed = await productsApi.getAll();
    setProducts(refreshed);
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

  const handleSave = async (productData: Omit<Product, "id" | "createdAt">) => {
    try {
      if (editingProduct) {
        // Detectar cambio de stock
        if (productData.stock !== editingProduct.stock) {
          const change = productData.stock - editingProduct.stock;
          if (change > 0) {
            logManualAdd(
              editingProduct,
              change,
              undefined,
              "Edición desde modal",
            );
          } else if (change < 0) {
            logManualRemove(
              editingProduct,
              Math.abs(change),
              undefined,
              "Edición desde modal",
            );
          }
        }

        const updated = await productsApi.update(
          editingProduct.id,
          productData,
        );
        setProducts(
          products.map((p) => (p.id === editingProduct.id ? updated : p)),
        );

        // unidadesPorBulto y seDivideEn ya se guardan directamente en productos vía productsApi.update
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
      setModalOpen(false);
    } catch (error) {
      toast.error("Error al guardar el producto");
    }
  };

  const handleViewHistory = (product: Product) => {
    setSelectedProductHistory(product);
    setShowStockHistory(true);
  };

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      if (!habilitadosIds.has(product.id)) return false;
      const matchesSearch =
        (product.name ?? "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (product.category ?? "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (product.description ?? "").toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCategory =
        categoryFilter === "all" || product.category === categoryFilter;

      let matchesPrice = true;
      switch (priceFilter) {
        case "0-2800":
          matchesPrice = product.price <= 2800;
          break;
        case "2801-3000":
          matchesPrice = product.price > 2800 && product.price <= 3000;
          break;
        case "3001-3200":
          matchesPrice = product.price > 3000 && product.price <= 3200;
          break;
        case "3201+":
          matchesPrice = product.price > 3200;
          break;
      }

      const matchesBase =
        marcaFilter === "all" || (product as any).marca === marcaFilter;

      const matchesSinTacc =
        sinTaccFilter === "all" ||
        (sinTaccFilter === "sin-tacc" && (product as any).sinTacc === true) ||
        (sinTaccFilter === "con-tacc" && (product as any).sinTacc !== true);

      let matchesStock = true;
      switch (stockFilter) {
        case "available":
          matchesStock = product.stock > 0;
          break;
        case "low":
          matchesStock = product.stock > 0 && product.stock < 10;
          break;
        case "out":
          matchesStock = product.stock === 0;
          break;
      }

      return (
        matchesSearch &&
        matchesCategory &&
        matchesPrice &&
        matchesBase &&
        matchesSinTacc &&
        matchesStock
      );
    });
  }, [
    products,
    searchQuery,
    categoryFilter,
    priceFilter,
    marcaFilter,
    sinTaccFilter,
    stockFilter,
    habilitadosIds,
  ]);

  const stats = useMemo(() => {
    const totalProducts = filteredProducts.length;
    const totalInventoryValue = filteredProducts.reduce(
      (sum, p) => sum + p.price * p.stock,
      0,
    );
    const lowStockCount = filteredProducts.filter(
      (p) => p.stock > 0 && p.stock < 10,
    ).length;
    const outOfStockCount = filteredProducts.filter(
      (p) => p.stock === 0,
    ).length;

    return {
      totalProducts,
      totalInventoryValue,
      lowStockCount,
      outOfStockCount,
    };
  }, [filteredProducts]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, categoryFilter, priceFilter, marcaFilter, stockFilter, sinTaccFilter, habilitadosIds]);

  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredProducts.slice(start, start + pageSize);
  }, [filteredProducts, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredProducts.length / pageSize);

  // Listas dinámicas para el modal (unión de defaults + valores reales en productos)
  const availableCategories = useMemo(() => {
    return products.map((p) => p.category).filter(Boolean);
  }, [products]);

  const availableMarcas = useMemo(() => {
    return products.map((p) => (p as any).marca).filter(Boolean);
  }, [products]);

  const activeFilterCount = [
    categoryFilter !== "all",
    priceFilter !== "all",
    marcaFilter !== "all",
    stockFilter !== "all",
    sinTaccFilter !== "all",
  ].filter(Boolean).length;

  const clearFilters = () => {
    setCategoryFilter("all");
    setPriceFilter("all");
    setMarcaFilter("all");
    setStockFilter("all");
    setSinTaccFilter("all");
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
    <MainLayout title="Productos" description="Gestiona tu catálogo de productos">
      <Tabs defaultValue="catalogo" onValueChange={(v) => setActiveTab(v)}>
        <TabsList className="mb-4 rounded-xl">
          <TabsTrigger value="catalogo" className="rounded-lg">Catálogo</TabsTrigger>
          <TabsTrigger value="recepcion" className="rounded-lg">Recepción de mercadería</TabsTrigger>
          <TabsTrigger value="precios" className="rounded-lg">Precios de venta</TabsTrigger>
        </TabsList>
        <TabsContent value="catalogo">
      {/* Header */}
      <div className="mb-4 sm:mb-6">
        <PageHeader
          actions={
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={descargarPlanilla}
                className="gap-1 sm:gap-2 h-8 sm:h-9 px-2 sm:px-3"
              >
                <FileDown className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Descargar Planilla</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                disabled={importando}
                className="gap-1 sm:gap-2 h-8 sm:h-9 px-2 sm:px-3 relative"
                onClick={() => document.getElementById("csv-upload")?.click()}
              >
                <Upload className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Subir Planilla</span>
                <input
                  id="csv-upload"
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) subirPlanilla(file);
                    e.target.value = "";
                  }}
                />
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setRemitoImportOpen(true)}
                className="gap-1 sm:gap-2 h-8 sm:h-9 px-2 sm:px-3"
              >
                <FileUp className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Importar Remito</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowInventoryHistory(true)}
                className="gap-1 sm:gap-2 h-8 sm:h-9 px-2 sm:px-3"
              >
                <TrendingUp className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Valor Inventario</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
                className="gap-1 sm:gap-2 h-8 sm:h-9 px-2 sm:px-3"
              >
                <Filter className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Filtros</span>
                {activeFilterCount > 0 && (
                  <Badge
                    variant="secondary"
                    className="ml-0.5 h-4 w-4 sm:h-5 sm:w-5 p-0 flex items-center justify-center text-[10px] sm:text-xs"
                  >
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>

              <div className="flex border border-border rounded-lg">
                <Button
                  variant={viewMode === "grid" ? "secondary" : "ghost"}
                  size="sm"
                  className="rounded-r-none border-0 h-9"
                  onClick={() => setViewMode("grid")}
                >
                  <Grid3x3 className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === "list" ? "secondary" : "ghost"}
                  size="sm"
                  className="rounded-l-none border-0 h-9"
                  onClick={() => setViewMode("list")}
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>

              <Button
                onClick={handleCreate}
                className="gap-1 sm:gap-2 bg-primary hover:bg-primary/90 h-8 sm:h-9 px-2 sm:px-3"
              >
                <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Nuevo</span>
                <span className="sm:hidden text-xs">Nuevo</span>
              </Button>
            </>
          }
        />

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

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
            {/* Categoría */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Categoría
              </label>
              <Select
                value={categoryFilter}
                onValueChange={(v) => setCategoryFilter(v as CategoryFilter)}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {[...new Set(availableCategories)].sort().map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Marca */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Marca
              </label>
              <Select
                value={marcaFilter}
                onValueChange={(v) => setMarcaFilter(v as MarcaFilter)}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {[...new Set(availableMarcas)].sort().map((marca) => (
                    <SelectItem key={marca} value={marca}>
                      {marca}
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
                  <SelectItem value="0-2800">Hasta $2.800</SelectItem>
                  <SelectItem value="2801-3000">$2.800 – $3.000</SelectItem>
                  <SelectItem value="3001-3200">$3.000 – $3.200</SelectItem>
                  <SelectItem value="3201+">Más de $3.200</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Sin TACC */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Contenido
              </label>
              <Select
                value={sinTaccFilter}
                onValueChange={(v) => setSinTaccFilter(v as SinTaccFilter)}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="sin-tacc">Sin TACC</SelectItem>
                  <SelectItem value="con-tacc">Con TACC</SelectItem>
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
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 border-b">
                        <tr>
                          <th className="text-left px-3 py-3 font-semibold text-muted-foreground">Código</th>
                          <th className="text-left px-3 py-3 font-semibold text-muted-foreground">Descripción</th>
                          <th className="text-left px-3 py-3 font-semibold text-muted-foreground">Categoría</th>
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
                              <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
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
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600 hover:text-green-700" onClick={() => handleEnable(product)} title="Habilitar">
                                      <CheckCircle2 className="h-3.5 w-3.5" />
                                    </Button>
                                  ) : (
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-amber-600 hover:text-amber-700" onClick={() => handleDeactivate(product)} title="Deshabilitar">
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
                  {Math.min((currentPage - 1) * pageSize + 1, filteredProducts.length)}–
                  {Math.min(currentPage * pageSize, filteredProducts.length)} de{" "}
                  {filteredProducts.length}
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

        </TabsContent>
        <TabsContent value="recepcion" className="mt-2">
          {activeTab === "recepcion" && <RecepcionMercaderia />}
        </TabsContent>
        <TabsContent value="precios" className="mt-2">
          {activeTab === "precios" && <PreciosVentaHabilitados />}
        </TabsContent>
      </Tabs>

      {/* Modales */}
      <ProductModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        product={editingProduct}
        onSave={handleSave}
        availableCategories={availableCategories}
        availableMarcas={availableMarcas}
      />

      <StockHistoryModal
        open={showStockHistory}
        onOpenChange={setShowStockHistory}
        product={selectedProductHistory}
        history={stockHistory.filter(
          (h) => h.productId === selectedProductHistory?.id,
        )}
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
    </MainLayout>
  );
}

// ─── Tab: Precios de venta (mayorista habilitados) ────────────────────────────
function PreciosVentaHabilitados() {
  const [productos, setProductos] = useState<MayoristaProducto[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [gananciaInput, setGananciaInput] = useState("");
  const [applyingGlobal, setApplyingGlobal] = useState(false);
  const [progressGanancia, setProgressGanancia] = useState({ done: 0, total: 0 });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingMode, setEditingMode] = useState<"precio" | "ganancia">("precio");
  const [precioInput, setPrecioInput] = useState("");
  const [gananciaIndInput, setGananciaIndInput] = useState("");

  useEffect(() => {
    getMayoristaProductos()
      .then((data) => setProductos(data.filter((p) => p.habilitado)))
      .catch(() => toast.error("Error al cargar precios"))
      .finally(() => setLoading(false));
  }, []);

  const filtrados = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return productos;
    return productos.filter(
      (p) => p.nombre.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q)
    );
  }, [productos, search]);

  const gananciaActual = useMemo(
    () => productos.find((p) => p.gananciaGlobal != null)?.gananciaGlobal,
    [productos]
  );

  const handleAplicarGlobal = async () => {
    const porc = parseFloat(gananciaInput);
    if (isNaN(porc) || porc < 0) { toast.error("Ingresá un porcentaje válido"); return; }
    // Saltear productos con precio individual — solo actualizar los "globales"
    const necesitan = productos.filter((p) => !p.gananciaIndividual && p.gananciaGlobal !== porc);
    const individuales = productos.filter((p) => p.gananciaIndividual).length;
    if (necesitan.length === 0) {
      toast.info(individuales > 0
        ? `Todos ya tienen ese porcentaje (${individuales} con precio individual sin modificar)`
        : "Todos ya tienen ese porcentaje");
      return;
    }
    setApplyingGlobal(true);
    setProgressGanancia({ done: 0, total: necesitan.length });
    try {
      await applyGananciaToProducts(
        porc,
        necesitan
          .filter((p) => !!p.productoId)
          .map((p) => ({ id: p.id, productoId: p.productoId!, precioUnitarioMayorista: p.precioUnitarioMayorista })),
        (done, total) => setProgressGanancia({ done, total })
      );
      setProductos((prev) =>
        prev.map((p) =>
          necesitan.some((n) => n.id === p.id)
            ? { ...p, gananciaGlobal: porc, gananciaIndividual: false, precioVenta: Math.round(p.precioUnitarioMayorista * (1 + porc / 100) * 100) / 100 }
            : p
        )
      );
      toast.success(
        individuales > 0
          ? `${porc}% aplicado a ${necesitan.length} productos · ${individuales} con precio individual sin modificar`
          : `Ganancia del ${porc}% aplicada a ${necesitan.length} productos`
      );
    } catch {
      toast.error("Error al aplicar la ganancia");
    } finally {
      setApplyingGlobal(false);
      setProgressGanancia({ done: 0, total: 0 });
    }
  };

  const guardarPrecio = async (p: MayoristaProducto) => {
    const precio = parseFloat(precioInput.replace(",", "."));
    if (isNaN(precio) || precio < 0) { toast.error("Precio inválido"); return; }
    if (!p.productoId) { toast.error("Este producto no tiene ID en catálogo"); return; }
    try {
      await updateProductoPrecioVenta(p.productoId, precio, true);
      setProductos((prev) => prev.map((x) => x.id === p.id ? { ...x, precioVenta: precio, gananciaIndividual: true } : x));
      setEditingId(null);
      toast.success("Precio individual guardado");
    } catch {
      toast.error("Error al guardar el precio");
    }
  };

  const guardarGananciaInd = async (p: MayoristaProducto) => {
    const pct = parseFloat(gananciaIndInput.replace(",", "."));
    if (isNaN(pct) || pct < 0) { toast.error("Porcentaje inválido"); return; }
    if (!p.productoId) { toast.error("Este producto no tiene ID en catálogo"); return; }
    const precio = Math.round(p.precioUnitarioMayorista * (1 + pct / 100) * 100) / 100;
    try {
      await updateProductoPrecioVenta(p.productoId, precio, true);
      setProductos((prev) => prev.map((x) => x.id === p.id ? { ...x, precioVenta: precio, gananciaIndividual: true } : x));
      setEditingId(null);
      toast.success("Ganancia individual guardada");
    } catch {
      toast.error("Error al guardar la ganancia");
    }
  };

  if (loading) {
    return (
      <div className="space-y-2 mt-4">
        {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}
      </div>
    );
  }

  if (productos.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Percent className="h-12 w-12 mx-auto mb-3 opacity-20" />
        <p className="text-sm">No hay productos habilitados desde Mayorista.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 mt-2">
      {/* Ganancia global */}
      <div className="rounded-2xl border p-4 bg-card space-y-3">
        <p className="text-sm font-semibold flex items-center gap-2">
          <Percent className="h-4 w-4 text-teal-600" />
          Ganancia global
        </p>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min="0"
              max="500"
              step="0.5"
              value={gananciaInput}
              onChange={(e) => setGananciaInput(e.target.value)}
              placeholder={gananciaActual != null ? `Actual: ${gananciaActual}%` : "Ej: 30"}
              className="rounded-xl w-40"
              onKeyDown={(e) => { if (e.key === "Enter") handleAplicarGlobal(); }}
            />
            <span className="text-sm text-muted-foreground">%</span>
          </div>
          <Button
            onClick={handleAplicarGlobal}
            disabled={applyingGlobal || !gananciaInput}
            className="rounded-xl gap-2"
          >
            {applyingGlobal ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Aplicar a todos
          </Button>
        </div>
        {applyingGlobal && progressGanancia.total > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Aplicando...</span>
              <span className="tabular-nums">{progressGanancia.done} / {progressGanancia.total}</span>
            </div>
            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-teal-500 rounded-full transition-all duration-200"
                style={{ width: `${Math.round((progressGanancia.done / progressGanancia.total) * 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Buscador */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar producto..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 rounded-xl"
        />
        {search && (
          <Button variant="ghost" size="icon" className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6" onClick={() => setSearch("")}>
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Tabla */}
      <div className="rounded-2xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Nombre</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground whitespace-nowrap">Precio mayorista</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Ganancia</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground whitespace-nowrap">Precio de venta</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtrados.map((p) => {
                const ganancia =
                  p.precioUnitarioMayorista > 0
                    ? ((p.precioVenta - p.precioUnitarioMayorista) / p.precioUnitarioMayorista) * 100
                    : 0;
                return (
                  <tr key={p.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-medium max-w-xs truncate">{p.nombre}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {formatCurrency(p.precioUnitarioMayorista)}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                      {editingId === p.id && editingMode === "ganancia" ? (
                        <div className="flex items-center justify-end gap-1">
                          <Input
                            type="number"
                            min="0"
                            step="0.1"
                            value={gananciaIndInput}
                            onChange={(e) => setGananciaIndInput(e.target.value)}
                            className="h-7 text-xs rounded-lg w-20 text-right"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") guardarGananciaInd(p);
                              if (e.key === "Escape") setEditingId(null);
                            }}
                          />
                          <span className="text-muted-foreground">%</span>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => guardarGananciaInd(p)}>
                            <Check className="h-3.5 w-3.5 text-green-600" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)}>
                            <X className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      ) : (
                        <button
                          className="flex items-center gap-1.5 justify-end group w-full"
                          onClick={() => {
                            setEditingId(p.id);
                            setEditingMode("ganancia");
                            setGananciaIndInput(p.precioVenta > 0 ? ganancia.toFixed(1) : "");
                          }}
                        >
                          {p.precioVenta > 0 ? (
                            <span className="flex items-center gap-1.5">
                              {`${ganancia.toFixed(1)}%`}
                              {p.gananciaIndividual && (
                                <span className="text-[10px] bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded font-medium">ind</span>
                              )}
                            </span>
                          ) : <span>—</span>}
                          <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {editingId === p.id && editingMode === "precio" ? (
                        <div className="flex items-center justify-end gap-1">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={precioInput}
                            onChange={(e) => setPrecioInput(e.target.value)}
                            className="h-7 text-xs rounded-lg w-28 text-right"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") guardarPrecio(p);
                              if (e.key === "Escape") setEditingId(null);
                            }}
                          />
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => guardarPrecio(p)}>
                            <Check className="h-3.5 w-3.5 text-green-600" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)}>
                            <X className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      ) : (
                        <button
                          className="flex items-center gap-1.5 justify-end group w-full"
                          onClick={() => {
                            setEditingId(p.id);
                            setEditingMode("precio");
                            setPrecioInput(p.precioVenta > 0 ? String(p.precioVenta) : "");
                          }}
                        >
                          <span className="font-bold text-teal-600">
                            {p.precioVenta > 0 ? formatCurrency(p.precioVenta) : (
                              <span className="text-muted-foreground font-normal text-xs">Sin precio</span>
                            )}
                          </span>
                          <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 bg-muted/30 border-t text-xs text-muted-foreground">
          {search ? `${filtrados.length} resultados` : `${productos.length} productos habilitados`}
        </div>
      </div>
    </div>
  );
}
