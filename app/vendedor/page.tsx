"use client";

import { useState, useMemo, useRef, useEffect, useCallback, Suspense } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useCart } from "@/hooks/useCart";
import type { UserRole } from "@/hooks/useCart";
import { UnifiedCart } from "@/components/cart/UnifiedCart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
  ShoppingCart,
  Plus,
  Minus,
  X,
  LogOut,
  Loader2,
  Package,
  Warehouse,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/format";
import { signOut } from "@/services/auth-service";
import { searchProductosParaVenta, getRubrosHabilitados } from "@/services/mayorista-service";
import type { Product, CartItem } from "@/lib/types";

// ─── Wrapper de auth ──────────────────────────────────────────────────────────
function VendedorInner() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push("/login"); return; }
    if (user.role === "admin") { router.push("/dashboard"); return; }
    if (user.employeeType === "transportista") { router.push("/pedidos"); return; }
  }, [authLoading, user, router]);

  if (authLoading || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
      </div>
    );
  }

  return (
    <VendedorDashboard
      userEmail={user.email}
      userName={user.name || user.email}
    />
  );
}

export default function VendedorPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
      </div>
    }>
      <VendedorInner />
    </Suspense>
  );
}

// ─── Dashboard principal ──────────────────────────────────────────────────────
function VendedorDashboard({ userEmail, userName }: { userEmail: string; userName: string }) {
  const router = useRouter();

  // Búsqueda server-side de productos
  const [ventaProducts, setVentaProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [rubroFiltro, setRubroFiltro] = useState("");
  const [rubros, setRubros] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalProductos, setTotalProductos] = useState(0);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const [cartOpen, setCartOpen] = useState(false);

  const fetchProducts = useCallback(async (search: string, rubro: string, page: number) => {
    setProductsLoading(true);
    try {
      const result = await searchProductosParaVenta({
        search: search || undefined,
        rubro: rubro || undefined,
        page,
        pageSize: 10,
      });
      const mapped: Product[] = result.data.map((p: any) => {
        const precioLote =
          p.unidadesPorBulto && p.seDivideEn && p.unidadesPorBulto > 0
            ? Math.round(p.precioVenta * p.seDivideEn / p.unidadesPorBulto * 100) / 100
            : p.precioVenta;
        return {
          id: p.id,
          name: p.nombre,
          description: p.codigo,
          price: precioLote,
          stock: 9999,
          stockLocal: p.stockLocal,
          unidadesPorBulto: p.unidadesPorBulto,
          seDivideEn: p.seDivideEn,
          codigo: p.codigo,
          imageUrl: "",
          category: p.rubro || p.categoria,
          createdAt: new Date(),
        } as any;
      });
      setVentaProducts(mapped);
      setTotalPages(result.totalPages);
      setTotalProductos(result.total);
      setCurrentPage(result.page);
    } catch {
      // silently fail
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
      fetchProducts(value, rubroFiltro, 1);
    }, 300);
  };

  const handleRubroChange = (value: string) => {
    const rubro = value === "todos" ? "" : value;
    setRubroFiltro(rubro);
    setCurrentPage(1);
    fetchProducts(searchQuery, rubro, 1);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    fetchProducts(searchQuery, rubroFiltro, page);
  };

  const { state, actions } = useCart("seller", userEmail, ventaProducts);

  // Mapa rápido de cantidades en carrito
  const cartMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const item of state.cart) m.set(item.product.id, item.quantity);
    return m;
  }, [state.cart]);

  const handleConfirm = async () => {
    setCartOpen(false);
    const hayPendiente = state.cart.some(
      (item) => item.quantity > ((item.product as any).stockLocal ?? 0)
    );
    const modo = hayPendiente ? "esperar" : "disponible";
    const result = await actions.processSale(modo);
    if (result === "order") router.push("/pedidos");
  };

  if (state.processing) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <Loader2 className="h-12 w-12 animate-spin text-teal-600" />
        <p className="text-sm text-muted-foreground">Procesando venta...</p>
      </div>
    );
  }

  if (state.saleComplete) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-6 px-4">
        <div className="relative">
          <div className="absolute inset-0 bg-emerald-500/20 rounded-full animate-ping" />
          <div className="relative h-20 w-20 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg">
            <Package className="h-10 w-10 text-white" />
          </div>
        </div>
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-1">¡Venta registrada!</h2>
          <p className="text-muted-foreground text-sm">
            Total: <strong className="text-teal-600">{actions.formatCurrency(state.finalTotal)}</strong>
          </p>
        </div>
        <Button onClick={actions.resetCart} className="gap-2 rounded-xl">
          <Plus className="h-4 w-4" /> Nueva venta
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b bg-card px-4 py-3 flex items-center justify-between gap-3 sticky top-0 z-20">
        <div className="flex items-center gap-2 min-w-0">
          <Warehouse className="h-5 w-5 text-teal-600 shrink-0" />
          <span className="font-semibold text-sm truncate">{userName}</span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2 rounded-xl relative"
            onClick={() => setCartOpen(true)}
          >
            <ShoppingCart className="h-4 w-4" />
            <span className="hidden sm:inline">Carrito</span>
            {state.cart.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-teal-600 text-white text-[11px] font-bold flex items-center justify-center ring-2 ring-background">
                {state.cartCount}
              </span>
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground"
            onClick={async () => { await signOut(); router.push("/login"); }}
            title="Cerrar sesión"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Buscador + filtro rubro */}
      <div className="px-3 pt-3 pb-2 space-y-2 sticky top-[57px] z-10 bg-background">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            ref={searchRef}
            placeholder="Buscar producto..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-10 pr-10 h-11 text-base rounded-2xl border-2 focus-visible:ring-2 focus-visible:ring-teal-500"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8"
              onClick={() => { handleSearchChange(""); searchRef.current?.focus(); }}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Select value={rubroFiltro || "todos"} onValueChange={handleRubroChange}>
            <SelectTrigger className="h-9 rounded-xl text-sm flex-1">
              <SelectValue placeholder="Todos los rubros" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los rubros</SelectItem>
              {rubros.map((r) => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {totalProductos} prod.
          </span>
        </div>
      </div>

      {/* Lista de productos (mobile-first) */}
      <div className="flex-1 px-3 pb-24">
        {productsLoading ? (
          <div className="space-y-2 mt-2">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : ventaProducts.length === 0 ? (
          <div className="text-center py-16">
            <Package className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              {searchQuery ? `Sin resultados para "${searchQuery}"` : "No hay productos disponibles"}
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-1.5 mt-2">
              {ventaProducts.map((product) => {
                const qty = cartMap.get(product.id) ?? 0;
                return (
                  <div
                    key={product.id}
                    className={cn(
                      "flex items-center gap-3 px-3 py-3 rounded-xl border transition-colors",
                      qty > 0 ? "bg-teal-50/60 border-teal-200 dark:bg-teal-950/20 dark:border-teal-800" : "bg-card border-border",
                    )}
                  >
                    {/* Info producto */}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm leading-tight truncate">{product.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="font-mono text-[11px] text-muted-foreground">{product.description || "—"}</span>
                        <span className="text-[11px] text-muted-foreground">·</span>
                        <span className="text-[11px] text-muted-foreground truncate">{product.category}</span>
                      </div>
                    </div>

                    {/* Precio */}
                    <div className="text-right shrink-0">
                      <p className="font-bold text-sm text-teal-600">{formatCurrency(product.price)}</p>
                      {(product as any).seDivideEn && (product as any).seDivideEn > 1 && (
                        <p className="text-[10px] text-muted-foreground">/ lote</p>
                      )}
                    </div>

                    {/* Controles cantidad */}
                    <div className="shrink-0">
                      {qty === 0 ? (
                        <button
                          onClick={() => actions.addToCart(product)}
                          className="h-10 w-10 rounded-xl bg-teal-600 active:bg-teal-700 text-white flex items-center justify-center transition-colors touch-manipulation"
                        >
                          <Plus className="h-5 w-5" />
                        </button>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => actions.removeFromCart(product.id)}
                            className="h-9 w-9 rounded-xl border-2 border-border active:bg-muted flex items-center justify-center transition-colors touch-manipulation"
                          >
                            <Minus className="h-4 w-4" />
                          </button>
                          <span className="w-7 text-center text-sm font-bold text-teal-600">
                            {qty}
                          </span>
                          <button
                            onClick={() => actions.addToCart(product)}
                            className="h-9 w-9 rounded-xl border-2 border-teal-500 bg-teal-50 active:bg-teal-100 text-teal-700 flex items-center justify-center transition-colors touch-manipulation"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Paginación */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl h-10 w-10 p-0 touch-manipulation"
                  disabled={currentPage <= 1}
                  onClick={() => handlePageChange(currentPage - 1)}
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <span className="text-sm text-muted-foreground font-medium">
                  {currentPage} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl h-10 w-10 p-0 touch-manipulation"
                  disabled={currentPage >= totalPages}
                  onClick={() => handlePageChange(currentPage + 1)}
                >
                  <ChevronRight className="h-5 w-5" />
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* FAB carrito (mobile) */}
      {state.cart.length > 0 && (
        <div className="fixed bottom-6 right-6 z-50 sm:hidden">
          <button
            onClick={() => setCartOpen(true)}
            className="h-16 w-16 rounded-full bg-teal-600 shadow-2xl text-white flex items-center justify-center relative"
          >
            <ShoppingCart className="h-7 w-7" />
            <span className="absolute -top-1 -right-1 h-6 w-6 rounded-full bg-white text-teal-700 text-[11px] font-bold flex items-center justify-center ring-2 ring-teal-600">
              {state.cartCount}
            </span>
          </button>
        </div>
      )}

      {/* Dialog carrito */}
      <Dialog open={cartOpen} onOpenChange={setCartOpen}>
        <DialogContent
          className="max-w-sm sm:max-w-md max-h-[90vh] overflow-y-auto p-0 gap-0"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader className="px-5 py-4 border-b bg-muted/30">
            <DialogTitle className="flex items-center gap-2 text-base">
              <ShoppingCart className="h-5 w-5 text-teal-600" />
              Carrito
              {state.cart.length > 0 && (
                <Badge variant="secondary" className="text-xs">{state.cartCount} items</Badge>
              )}
            </DialogTitle>
            <DialogDescription className="sr-only">Revisá y confirmá tu pedido</DialogDescription>
          </DialogHeader>
          <div className="px-5 py-4">
            <UnifiedCart
              role="seller"
              state={state}
              actions={actions}
              onConfirmSale={handleConfirm}
            />
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}

