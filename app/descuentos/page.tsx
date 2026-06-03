"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { MainLayout } from "@/components/layout/main-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { productsApi } from "@/lib/api";
import type { Product } from "@/lib/types";
import { formatCurrency } from "@/lib/utils/format";
import { Search, X, Percent, Check, Tag, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

export default function DescuentosPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalProducts, setTotalProducts] = useState(0);
  const pageSize = 15;

  // Valores editados localmente { [id]: "4" }
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const fetchProducts = useCallback(async (page: number, search: string) => {
    setLoading(true);
    try {
      const result = await productsApi.search({
        search: search || undefined,
        page,
        pageSize,
      });
      setProducts(result.data.filter((p) => !(p as any).disabled));
      setTotalProducts(result.total);
      setTotalPages(result.totalPages);
      setEdited({});
    } catch {
      toast.error("Error al cargar productos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts(currentPage, searchQuery);
  }, [currentPage, searchQuery, fetchProducts]);

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setCurrentPage(1);
      setSearchQuery(value);
    }, 300);
  };

  const getValue = (p: Product): string =>
    edited[p.id] !== undefined ? edited[p.id] : String(p.descuento ?? 0);

  const isDirty = (p: Product): boolean => {
    if (edited[p.id] === undefined) return false;
    return Number(edited[p.id] || 0) !== (p.descuento ?? 0);
  };

  const handleSave = async (p: Product) => {
    const raw = Number(edited[p.id] ?? p.descuento ?? 0);
    const descuento = Math.max(0, Math.min(100, isNaN(raw) ? 0 : raw));
    setSavingId(p.id);
    try {
      await productsApi.update(p.id, { descuento });
      setProducts((prev) => prev.map((x) => (x.id === p.id ? { ...x, descuento } : x)));
      setEdited((prev) => {
        const next = { ...prev };
        delete next[p.id];
        return next;
      });
      toast.success(
        descuento > 0
          ? `Descuento del ${descuento}% aplicado a "${p.name}"`
          : `Descuento quitado de "${p.name}"`,
      );
    } catch {
      toast.error("Error al guardar el descuento");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <MainLayout allowedRoles={["admin"]} title="Descuentos" description="Asigná un descuento por producto">
      <div className="space-y-4">
        {/* Info */}
        <div className="rounded-2xl border border-teal-200 bg-teal-50/60 dark:bg-teal-950/20 dark:border-teal-800 p-3 flex items-start gap-2">
          <Tag className="h-4 w-4 text-teal-600 shrink-0 mt-0.5" />
          <p className="text-xs text-teal-800 dark:text-teal-200">
            El descuento del producto se aplica automáticamente en cada venta y se{" "}
            <strong>suma</strong> al que pueda agregar el vendedor, topeado al máximo autorizado del vendedor.
          </p>
        </div>

        {/* Búsqueda */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar producto por nombre o código..."
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-10 pr-10 h-11 text-sm"
          />
          {searchInput && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7"
              onClick={() => { setSearchInput(""); setSearchQuery(""); setCurrentPage(1); }}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>

        {/* Lista */}
        {loading ? (
          <div className="space-y-2">
            {[...Array(8)].map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-border bg-card/50 p-10 text-center">
            <Percent className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              {searchQuery ? "No se encontraron productos" : "No hay productos"}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {products.map((p) => {
              const dto = p.descuento ?? 0;
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border bg-card"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm leading-tight truncate">{p.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {p.codigo && (
                        <span className="text-[10px] font-mono text-muted-foreground">{p.codigo}</span>
                      )}
                      <span className="text-[11px] font-semibold text-teal-600">
                        {formatCurrency(p.price)}
                      </span>
                      {dto > 0 && (
                        <Badge variant="secondary" className="h-4 px-1.5 text-[10px] bg-teal-100 text-teal-700 hover:bg-teal-100">
                          {dto}% dto.
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={getValue(p)}
                      onChange={(e) =>
                        setEdited((prev) => ({ ...prev, [p.id]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && isDirty(p)) handleSave(p);
                      }}
                      className="h-8 w-16 text-center text-sm px-1"
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                    <Button
                      size="sm"
                      disabled={!isDirty(p) || savingId === p.id}
                      onClick={() => handleSave(p)}
                      className="h-8 px-2.5 gap-1"
                    >
                      <Check className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline text-xs">Guardar</span>
                    </Button>
                  </div>
                </div>
              );
            })}

            {/* Paginación */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-muted-foreground">{totalProducts} productos</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="h-8 w-8 flex items-center justify-center rounded-lg border border-border hover:border-primary/50 disabled:opacity-40 transition-colors"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="text-xs font-medium px-2 tabular-nums">
                    {currentPage}/{totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
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
    </MainLayout>
  );
}
