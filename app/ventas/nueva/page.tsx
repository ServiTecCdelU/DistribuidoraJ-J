// app/ventas/nueva/page.tsx
"use client";

import { useState, useMemo, memo, useEffect, useCallback, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MainLayout } from "@/components/layout/main-layout";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Plus,
  ShoppingCart,
  Loader2,
  CheckCircle,
  ArrowLeft,
  FileText,
  Receipt,
  Package,
  X,
  Eye,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Percent,
  Tag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCart } from "@/hooks/useCart";
import type { UserRole } from "@/hooks/useCart";
import { UnifiedCart } from "@/components/cart/UnifiedCart";
import { useAuth } from "@/hooks/use-auth";
import { searchProductosParaVenta, getRubrosHabilitados } from "@/services/mayorista-service";
import type { Product, CartItem } from "@/lib/types";

// ─── Wrapper: espera auth antes de montar el carrito ──────────────────────────
function NuevaVentaInner() {
  const { user, loading: authLoading } = useAuth();

  if (authLoading) {
    return (
      <MainLayout allowedRoles={['admin', 'seller']}>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  const cartRole: UserRole = user?.role === "seller" ? "seller" : "admin";
  return <NuevaVentaContent cartRole={cartRole} userEmail={user?.email} employeeType={user?.employeeType} />;
}

export default function NuevaVentaPage() {
  return (
    <Suspense fallback={
      <MainLayout allowedRoles={['admin', 'seller']}>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    }>
      <NuevaVentaInner />
    </Suspense>
  );
}

// ─── Contenido: role estable, nunca cambia después del mount ──────────────────
function NuevaVentaContent({
  cartRole,
  userEmail,
  employeeType,
}: {
  cartRole: UserRole;
  userEmail?: string;
  employeeType?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Búsqueda server-side de productos
  const [ventaProducts, setVentaProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [rubroFiltro, setRubroFiltro] = useState("");
  const [soloDescuento, setSoloDescuento] = useState(false);
  const [rubros, setRubros] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalProductos, setTotalProductos] = useState(0);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  // Vendedor que está vendiendo: define el cupo de oferta por producto
  const vendedorIdRef = useRef<string>("");

  const fetchProducts = useCallback(async (search: string, rubro: string, page: number, soloDto = false) => {
    setProductsLoading(true);
    try {
      const result = await searchProductosParaVenta({
        search: search || undefined,
        rubro: rubro || undefined,
        page,
        pageSize: 10,
        soloDescuento: soloDto,
        vendedorId: vendedorIdRef.current || undefined,
      });
      const mapped: Product[] = result.data.map((p) => {
        const precioLote =
          p.unidadesPorBulto && p.seDivideEn && p.unidadesPorBulto > 0
            ? Math.round(p.precioVenta * p.seDivideEn / p.unidadesPorBulto * 100) / 100
            : p.precioVenta;
        return {
          id: p.id,
          name: p.nombre,
          description: p.codigo,
          price: precioLote,
          stock: 9_999_999,
          stockLocal: p.stockLocal,
          unidadesPorBulto: p.unidadesPorBulto,
          seDivideEn: p.seDivideEn,
          codigo: p.codigo,
          imageUrl: "",
          category: p.rubro || p.categoria,
          descuento: p.descuento ?? 0,
          regaloMismo: p.regaloMismo ?? false,
          regaloMismoMax: p.regaloMismoMax ?? null,
          regaloOtroMax: p.regaloOtroMax ?? null,
          regaloProductoId: p.regaloProductoId ?? null,
          regaloProductoNombre: p.regaloProductoNombre ?? null,
          productoId: p.productoId,
          createdAt: new Date(),
        } as any;
      });
      setVentaProducts(mapped);
      setTotalPages(result.totalPages);
      setTotalProductos(result.total);
      setCurrentPage(result.page);
    } catch {
      // silently fail, products stay empty
    } finally {
      setProductsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts("", "", 1);
    getRubrosHabilitados().then(setRubros).catch(() => {});
  }, [fetchProducts]);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setCurrentPage(1);
      fetchProducts(value, rubroFiltro, 1, soloDescuento);
    }, 300);
  };

  const handleRubroChange = (value: string) => {
    const rubro = value === "todos" ? "" : value;
    setRubroFiltro(rubro);
    setCurrentPage(1);
    fetchProducts(searchQuery, rubro, 1, soloDescuento);
  };

  const handleToggleDescuento = () => {
    const next = !soloDescuento;
    setSoloDescuento(next);
    setCurrentPage(1);
    fetchProducts(searchQuery, rubroFiltro, 1, next);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    fetchProducts(searchQuery, rubroFiltro, page, soloDescuento);
  };

  const { state, actions } = useCart(cartRole, userEmail, ventaProducts);

  // Cuando se resuelve el vendedor (login del vendedor o selección del admin),
  // recargar productos para traer el cupo de oferta de ese vendedor.
  useEffect(() => {
    const id = state.selectedSeller && state.selectedSeller !== "none" ? state.selectedSeller : "";
    if (id === vendedorIdRef.current) return;
    vendedorIdRef.current = id;
    fetchProducts(searchQuery, rubroFiltro, currentPage, soloDescuento);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.selectedSeller]);

  const [cartDialogOpen, setCartDialogOpen] = useState(false);

  // Botón "ir abajo" del modal del carrito (cuando el scroll es largo)
  const cartScrollRef = useRef<HTMLDivElement>(null);
  const [showGoBottom, setShowGoBottom] = useState(false);

  const updateGoBottom = useCallback(() => {
    const el = cartScrollRef.current;
    if (!el) return;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowGoBottom(distanceToBottom > 120);
  }, []);

  const scrollCartToBottom = () => {
    const el = cartScrollRef.current;
    el?.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  };

  useEffect(() => {
    if (!cartDialogOpen) return;
    const el = cartScrollRef.current;
    if (!el) return;
    updateGoBottom();
    const ro = new ResizeObserver(() => updateGoBottom());
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, [cartDialogOpen, updateGoBottom, state.cart.length]);

  // Abrir carrito automáticamente si viene desde tienda (?openCart=true)
  useEffect(() => {
    if (searchParams.get("openCart") === "true" && state.cart.length > 0) {
      setCartDialogOpen(true);
    }
  }, [searchParams, state.cart.length]);

  const enabledProducts = ventaProducts;
  const filteredProducts = ventaProducts.length > 0;

  const handleConfirmSale = async () => {
    setCartDialogOpen(false);
    // Pickup siempre es venta directa (modo disponible)
    // Delivery con stock insuficiente crea pedido
    const isPickup = state.deliveryMethod === "pickup";
    const hayPendiente = !isPickup && state.cart.some(
      (item) => item.quantity > (item.product.stockLocal ?? 0)
    );
    const modo = hayPendiente ? "esperar" : "disponible";
    await actions.processSale(modo);
    // Refrescar productos: refleja ofertas agotadas (descuento de unidades) al instante
    fetchProducts(searchQuery, rubroFiltro, currentPage, soloDescuento);
  };

  if (state.processing) {
    return (
      <MainLayout allowedRoles={['admin', 'seller']}>
        <div className="flex flex-col items-center justify-center min-h-[80vh] gap-6">
          <div className="relative">
            <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping" />
            <div className="relative h-20 w-20 rounded-full bg-gradient-to-br from-primary/80 to-primary flex items-center justify-center shadow-lg">
              <Loader2 className="h-10 w-10 text-white animate-spin" />
            </div>
          </div>
          <div className="text-center space-y-2">
            <h2 className="text-xl font-bold text-foreground">Procesando venta...</h2>
            <p className="text-sm text-muted-foreground">Esto puede tardar unos segundos</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (state.saleComplete) {
    return (
      <MainLayout allowedRoles={['admin', 'seller']}>
        <div className="flex flex-col min-h-[80vh]">
          <div className="mb-4">
            <Button
              variant="ghost" size="sm"
              onClick={() => router.push("/ventas")}
              className="gap-2 text-sm h-9"
            >
              <ArrowLeft className="h-4 w-4" /> Volver
            </Button>
          </div>

          <div className="flex-1 flex items-center justify-center px-4">
            <Card className="w-full max-w-md border-2 shadow-xl">
              <CardContent className="pt-8 pb-6 px-6">
                <div className="flex justify-center mb-6">
                  <div className="relative">
                    <div className="absolute inset-0 bg-emerald-500/20 rounded-full animate-ping" />
                    <div className="relative h-20 w-20 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg">
                      <CheckCircle className="h-10 w-10 text-white" />
                    </div>
                  </div>
                </div>

                <h2 className="text-2xl font-bold text-center mb-2">Venta Exitosa!</h2>
                <p className="text-sm text-muted-foreground text-center mb-6">
                  La venta se proceso correctamente
                </p>

                <div className="rounded-xl bg-gradient-to-br from-muted/30 to-muted/10 p-4 mb-5 space-y-2.5">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground font-medium">Total</span>
                    <span className="text-2xl font-bold text-foreground">
                      {actions.formatCurrency(state.finalTotal)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Forma de pago</span>
                    <Badge
                      variant={state.paymentType === "cash" ? "default" : state.paymentType === "credit" ? "secondary" : "outline"}
                      className="text-xs font-medium"
                    >
                      {state.paymentType === "cash" ? "Contado" : state.paymentType === "credit" ? "A Cuenta" : "Mixto"}
                    </Badge>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-2.5">
                    {/* Boleta — deshabilitado temporalmente */}
                    <Button variant="outline" className="h-10 text-sm gap-2" onClick={() => router.push(`/ventas?saleId=${state.lastSaleId}`)}>
                      <Receipt className="h-4 w-4" /> Remito
                    </Button>
                  </div>
                  <Button variant="outline" className="w-full h-10 text-sm gap-2" onClick={() => router.push("/ventas")}>
                    <Eye className="h-4 w-4" /> Mis Ventas
                  </Button>
                  <Button className="w-full h-10 text-sm gap-2 shadow-md" onClick={actions.resetCart}>
                    <Plus className="h-4 w-4" /> Nueva Venta
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout allowedRoles={['admin', 'seller']} title="Nueva Venta" description="Registra una nueva venta">
      <div className="space-y-4 pb-24">
        <PageHeader
          description={
            state.deliveryMethod === "delivery"
              ? "Crear pedido para envio a domicilio"
              : "Registra una venta en mostrador"
          }
          stackOnMobile
        />

        <div className="flex flex-col gap-2 lg:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar productos..."
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-10 pr-10 h-11 text-sm rounded-xl border-2 focus-visible:ring-2"
            />
            {searchQuery && (
              <Button variant="ghost" size="icon" className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => { setSearchQuery(""); fetchProducts("", rubroFiltro, 1, soloDescuento); }}>
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {rubros.length > 0 && (
              <Select value={rubroFiltro || "todos"} onValueChange={handleRubroChange}>
                <SelectTrigger className="flex-1 lg:w-40 h-11 rounded-xl border-2">
                  <SelectValue placeholder="Rubro" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los rubros</SelectItem>
                  {rubros.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {/* Filtro: solo productos con descuento */}
            <Button
              type="button"
              variant={soloDescuento ? "default" : "outline"}
              onClick={handleToggleDescuento}
              className={cn(
                "h-11 rounded-xl shrink-0 gap-1.5 px-3 border-2",
                soloDescuento ? "bg-teal-600 hover:bg-teal-700 text-white border-teal-600" : "text-teal-700 border-teal-200 hover:bg-teal-50",
              )}
              title="Mostrar solo productos con promociones"
            >
              <Tag className="h-4 w-4" />
              <span className="text-sm">Promociones</span>
            </Button>
          </div>
        </div>

        {productsLoading ? (
          <div className="space-y-1">
            {[...Array(10)].map((_, i) => (
              <Skeleton key={i} className="h-10 rounded-lg" />
            ))}
          </div>
        ) : !filteredProducts ? (
          <div className="text-center py-16">
            <div className="h-20 w-20 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
              <Package className="h-10 w-10 text-muted-foreground/40" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">No se encontraron productos</h3>
            <p className="text-sm text-muted-foreground">
              {searchQuery ? `No hay productos que coincidan con "${searchQuery}"` : "No hay productos disponibles"}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <ProductGrid products={enabledProducts} cart={state.cart} addToCart={actions.addToCart} removeFromCart={actions.removeFromCart} updateQuantity={actions.updateQuantity} formatCurrency={actions.formatCurrency} />
            {/* Paginación */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-muted-foreground">
                  {totalProductos} productos
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="h-8 w-8 flex items-center justify-center rounded-lg border border-border hover:border-primary/50 disabled:opacity-40 transition-colors"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="text-xs font-medium px-2 tabular-nums">
                    {currentPage}/{totalPages}
                  </span>
                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage >= totalPages}
                    className="h-8 w-8 flex items-center justify-center rounded-lg border border-border hover:border-primary/50 disabled:opacity-40 transition-colors"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Cart Dialog */}
      <Dialog open={cartDialogOpen} onOpenChange={setCartDialogOpen}>
        <DialogContent
          className="flex flex-col left-auto translate-x-0 right-2 sm:right-4 w-full max-w-[calc(100%-1rem)] sm:max-w-2xl lg:max-w-3xl max-h-[96dvh] sm:max-h-[97dvh] overflow-x-hidden overflow-y-hidden p-0 gap-0"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader className="shrink-0 min-w-0 px-4 sm:px-5 py-3 sm:py-4 border-b border-border bg-muted/30">
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
              <ShoppingCart className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
              Carrito
              {state.cart.length > 0 && (
                <Badge variant="secondary" className="text-xs">{state.cartCount} items</Badge>
              )}
            </DialogTitle>
            <DialogDescription className="sr-only">Revisa y gestiona los productos en tu carrito</DialogDescription>
          </DialogHeader>
          <div
            ref={cartScrollRef}
            onScroll={updateGoBottom}
            className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden px-4 sm:px-5 py-3 sm:py-4"
          >
            <UnifiedCart
              role={cartRole}
              state={state}
              actions={actions}
              onConfirmSale={handleConfirmSale}
            />
          </div>
          {showGoBottom && (
            <button
              type="button"
              onClick={scrollCartToBottom}
              className="absolute bottom-3 right-3 sm:bottom-4 sm:right-4 z-10 h-10 px-3.5 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center gap-1.5 text-xs font-semibold hover:bg-primary/90 transition-colors"
            >
              <ChevronDown className="h-4 w-4" /> Ir abajo
            </button>
          )}
        </DialogContent>
      </Dialog>

      {/* Carrito flotante (todas las resoluciones) */}
      <Button
        type="button"
        size="icon"
        className={cn(
          "fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full shadow-xl transition-all",
          state.cart.length > 0 ? "bg-primary hover:bg-primary/90 shadow-primary/30" : "bg-muted-foreground/40 opacity-60",
        )}
        onClick={() => setCartDialogOpen(true)}
        disabled={state.cart.length === 0}
      >
        <ShoppingCart className="h-6 w-6 text-white" />
        {state.cart.length > 0 && (
          <span className="absolute -top-1 -right-1 h-6 min-w-6 px-1 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center text-xs font-bold ring-2 ring-background">
            {state.cartCount}
          </span>
        )}
      </Button>

    </MainLayout>
  );
}

// ─── Sub-componentes de productos ─────────────────────────────────────────────

const ProductListItem = memo(function ProductListItem({
  product, quantity, onAdd, onRemove, onDecrement, formatCurrency,
}: {
  product: Product;
  quantity: number;
  onAdd: (p: Product) => void;
  onRemove: (id: string) => void;
  onDecrement: (id: string, delta: number) => void;
  formatCurrency: (n: number) => string;
}) {
  const seDivideEn = (product as any).seDivideEn;
  const unidadesPorBulto = (product as any).unidadesPorBulto;
  const stockLocal = product.stockLocal;
  const descuento = (product as any).descuento ?? 0;
  const ofertaActiva = descuento > 0;
  const unidadesLote = unidadesPorBulto
    ? (seDivideEn && seDivideEn > 1 ? Math.floor(unidadesPorBulto / seDivideEn) : unidadesPorBulto)
    : null;

  return (
    <div className={cn(
      "px-3 py-3 rounded-xl border transition-colors space-y-1.5",
      quantity > 0
        ? "bg-teal-50/60 border-teal-200 dark:bg-teal-950/20 dark:border-teal-800"
        : "bg-card border-border",
    )}>
      {/* Nombre — línea completa */}
      <div className="flex items-center gap-2 min-w-0">
        <p className="font-medium text-sm leading-tight truncate flex-1">{product.name}</p>
        {ofertaActiva && (
          <Badge className="h-5 px-1.5 text-[10px] shrink-0 gap-0.5 bg-teal-100 text-teal-700 hover:bg-teal-100 border border-teal-200">
            <Percent className="h-2.5 w-2.5" />
            hasta {descuento}% dto.
          </Badge>
        )}
      </div>

      {/* Fila inferior: info + precio + controles */}
      <div className="flex items-center gap-2">
        {/* Stock y lote */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {stockLocal !== undefined && (
            <span className={cn(
              "text-[11px] font-medium shrink-0",
              stockLocal === 0 ? "text-rose-500" : "text-emerald-600"
            )}>
              {stockLocal === 0 ? "Sin stock" : `${stockLocal} en stock`}
            </span>
          )}
          {unidadesLote && (
            <>
              {stockLocal !== undefined && <span className="text-[11px] text-muted-foreground">·</span>}
              <span className="text-[11px] text-muted-foreground shrink-0">{unidadesLote} u./lote</span>
            </>
          )}
        </div>

        {/* Precio */}
        <div className="text-right shrink-0">
          {ofertaActiva ? (
            <>
              <p className="text-[11px] text-muted-foreground line-through leading-none">{formatCurrency(product.price)}</p>
              <p className="font-bold text-sm text-teal-600">{formatCurrency(product.price * (1 - descuento / 100))}</p>
            </>
          ) : (
            <p className="font-bold text-sm text-teal-600">{formatCurrency(product.price)}</p>
          )}
          {seDivideEn && seDivideEn > 1 && (
            <p className="text-[10px] text-muted-foreground leading-none">/ lote</p>
          )}
        </div>

        {/* Controles */}
        <div className="shrink-0">
          {quantity === 0 ? (
            <button
              onClick={() => onAdd(product)}
              className="h-9 w-9 rounded-xl bg-teal-600 active:bg-teal-700 text-white flex items-center justify-center transition-colors touch-manipulation"
            >
              <Plus className="h-5 w-5" />
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <button
                onClick={() => quantity === 1 ? onRemove(product.id) : onDecrement(product.id, -1)}
                className="h-8 w-8 rounded-xl border-2 border-border active:bg-muted flex items-center justify-center transition-colors touch-manipulation"
              >
                <span className="text-base font-bold leading-none">−</span>
              </button>
              <span className="w-6 text-center text-sm font-bold text-teal-600">{quantity}</span>
              <button
                onClick={() => onAdd(product)}
                className="h-8 w-8 rounded-xl border-2 border-teal-500 bg-teal-50 active:bg-teal-100 text-teal-700 flex items-center justify-center transition-colors touch-manipulation"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

function ProductGrid({
  products, cart, addToCart, removeFromCart, updateQuantity, formatCurrency,
}: {
  products: Product[];
  cart: CartItem[];
  addToCart: (p: Product) => void;
  removeFromCart: (id: string) => void;
  updateQuantity: (id: string, delta: number) => void;
  formatCurrency: (n: number) => string;
}) {
  const cartMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of cart) map.set(item.product.id, item.quantity);
    return map;
  }, [cart]);

  return (
    <div className="space-y-1.5">
      {products.map((product) => (
        <ProductListItem
          key={product.id}
          product={product}
          quantity={cartMap.get(product.id) || 0}
          onAdd={addToCart}
          onRemove={removeFromCart}
          onDecrement={updateQuantity}
          formatCurrency={formatCurrency}
        />
      ))}
    </div>
  );
}
