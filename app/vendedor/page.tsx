"use client";

import { useState, useMemo, useRef, useEffect, Suspense } from "react";
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
  Search,
  ShoppingCart,
  Plus,
  Minus,
  X,
  LogOut,
  Loader2,
  Package,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/format";
import { signOut } from "@/services/auth-service";
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
  const { state, actions } = useCart("seller", userEmail);

  const [search, setSearch] = useState("");
  const [cartOpen, setCartOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Auto-focus al montar
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Filtro de productos
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return state.products;
    return state.products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
    );
  }, [state.products, search]);

  // Mapa rápido de cantidades en carrito
  const cartMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const item of state.cart) m.set(item.product.id, item.quantity);
    return m;
  }, [state.cart]);

  const handleConfirm = async () => {
    setCartOpen(false);
    const hayPendiente = state.cart.some(
      (item) => item.quantity > (item.product.stockLocal ?? 0)
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
            <CheckCircle2 className="h-10 w-10 text-white" />
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

      {/* Buscador */}
      <div className="px-4 pt-4 pb-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            ref={searchRef}
            placeholder="Buscar producto... (nombre, código, categoría)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 pr-10 h-12 text-base rounded-2xl border-2 focus-visible:ring-2 focus-visible:ring-teal-500"
          />
          {search && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8"
              onClick={() => { setSearch(""); searchRef.current?.focus(); }}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        {search && (
          <p className="text-xs text-muted-foreground mt-1.5 px-1">
            {filtered.length} resultado{filtered.length !== 1 ? "s" : ""}
          </p>
        )}
      </div>

      {/* Tabla de productos */}
      <div className="flex-1 px-4 pb-6">
        {state.loading ? (
          <div className="space-y-2 mt-2">
            {[...Array(8)].map((_, i) => (
              <Skeleton key={i} className="h-11 rounded-xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Package className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              {search ? `Sin resultados para "${search}"` : "No hay productos disponibles"}
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border overflow-hidden mt-2">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">Código</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">Descripción</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground hidden sm:table-cell">Categoría</th>
                    <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">Precio</th>
                    <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground hidden sm:table-cell">Stock</th>
                    <th className="text-center px-3 py-2.5 font-semibold text-muted-foreground">Cant.</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((product) => {
                    const qty = cartMap.get(product.id) ?? 0;
                    const stock = product.stockLocal ?? product.stock;
                    return (
                      <tr
                        key={product.id}
                        className={cn(
                          "hover:bg-muted/20 transition-colors",
                          qty > 0 && "bg-teal-50/40 dark:bg-teal-950/20",
                        )}
                      >
                        <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground whitespace-nowrap">
                          {product.description || "—"}
                        </td>
                        <td className="px-3 py-2.5 font-medium max-w-[200px] truncate">
                          {product.name}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground hidden sm:table-cell whitespace-nowrap">
                          {product.category}
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold text-teal-600 whitespace-nowrap">
                          <span>{formatCurrency(product.price)}</span>
                          {product.seDivideEn && product.seDivideEn > 1 && (
                            <span className="block text-[10px] font-normal text-muted-foreground">/ lote</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right hidden sm:table-cell">
                          <span className={cn(
                            "text-xs font-medium",
                            stock === 0 ? "text-amber-600" : "text-muted-foreground"
                          )}>
                            {stock}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          {qty === 0 ? (
                            <div className="flex justify-center">
                              <button
                                onClick={() => actions.addToCart(product)}
                                className="h-8 w-8 rounded-lg bg-teal-600 hover:bg-teal-700 text-white flex items-center justify-center transition-colors"
                              >
                                <Plus className="h-4 w-4" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => actions.removeFromCart(product.id)}
                                className="h-7 w-7 rounded-lg border border-border hover:bg-muted flex items-center justify-center transition-colors"
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </button>
                              <span className="w-6 text-center text-sm font-bold text-teal-600">
                                {qty}
                              </span>
                              <button
                                onClick={() => actions.addToCart(product)}
                                className="h-7 w-7 rounded-lg border border-teal-500 bg-teal-50 hover:bg-teal-100 text-teal-700 flex items-center justify-center transition-colors"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
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

