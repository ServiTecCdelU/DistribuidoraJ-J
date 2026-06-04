"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { MainLayout } from "@/components/layout/main-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { productsApi, sellersApi } from "@/lib/api";
import type { Product, Seller } from "@/lib/types";
import { formatCurrency } from "@/lib/utils/format";
import { getAsignacionesProducto, setAsignacion } from "@/services/descuento-vendedor-service";
import { Search, X, Percent, Check, Tag, ChevronLeft, ChevronRight, ChevronDown, Users, Loader2 } from "lucide-react";
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

  // % de descuento editado { [id]: "4" }
  const [edited, setEdited] = useState<Record<string, string>>({});
  // promo "regalo cada X" editada { [id]: "10" }
  const [editedRegalo, setEditedRegalo] = useState<Record<string, string>>({});
  // cantidad gratis por bloque editada { [id]: "2" }
  const [editedRegaloCant, setEditedRegaloCant] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  // Vendedores y asignación de cupos por producto
  const [vendedores, setVendedores] = useState<Seller[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // cupos { [productId]: { [vendedorId]: "5" } }
  const [cupos, setCupos] = useState<Record<string, Record<string, string>>>({});
  const [loadingCupos, setLoadingCupos] = useState(false);
  const [savingCuposId, setSavingCuposId] = useState<string | null>(null);

  const fetchProducts = useCallback(async (page: number, search: string) => {
    setLoading(true);
    try {
      const result = await productsApi.search({ search: search || undefined, page, pageSize });
      setProducts(result.data.filter((p) => !(p as any).disabled));
      setTotalProducts(result.total);
      setTotalPages(result.totalPages);
      setEdited({});
      setEditedRegalo({});
      setEditedRegaloCant({});
    } catch {
      toast.error("Error al cargar productos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts(currentPage, searchQuery);
  }, [currentPage, searchQuery, fetchProducts]);

  useEffect(() => {
    sellersApi.getAll()
      .then((all) => setVendedores(all.filter((s) => s.employeeType === "vendedor" || s.employeeType === "ambos")))
      .catch(() => {});
  }, []);

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

  const getValueRegalo = (p: Product): string =>
    editedRegalo[p.id] !== undefined ? editedRegalo[p.id] : String(p.regaloCada ?? 0);

  const getValueRegaloCant = (p: Product): string =>
    editedRegaloCant[p.id] !== undefined ? editedRegaloCant[p.id] : String(p.regaloCantidad ?? 1);

  const isDirty = (p: Product): boolean => {
    const dtoDirty = edited[p.id] !== undefined && Number(edited[p.id] || 0) !== (p.descuento ?? 0);
    const regaloDirty = editedRegalo[p.id] !== undefined && Number(editedRegalo[p.id] || 0) !== (p.regaloCada ?? 0);
    const regaloCantDirty = editedRegaloCant[p.id] !== undefined && Number(editedRegaloCant[p.id] || 1) !== (p.regaloCantidad ?? 1);
    return dtoDirty || regaloDirty || regaloCantDirty;
  };

  const handleSave = async (p: Product) => {
    const raw = Number(edited[p.id] ?? p.descuento ?? 0);
    const descuento = Math.max(0, Math.min(100, isNaN(raw) ? 0 : raw));
    const rawRegalo = Number(editedRegalo[p.id] ?? p.regaloCada ?? 0);
    const regaloCada = Math.max(0, isNaN(rawRegalo) ? 0 : Math.floor(rawRegalo)) || null;
    const rawRegaloCant = Number(editedRegaloCant[p.id] ?? p.regaloCantidad ?? 1);
    // Solo tiene sentido si hay promo; sin promo lo dejamos en null.
    const regaloCantidad = regaloCada ? Math.max(1, isNaN(rawRegaloCant) ? 1 : Math.floor(rawRegaloCant)) : null;
    setSavingId(p.id);
    try {
      await productsApi.update(p.id, { descuento, regaloCada, regaloCantidad });
      setProducts((prev) => prev.map((x) => (x.id === p.id ? { ...x, descuento, regaloCada, regaloCantidad } : x)));
      setEdited((prev) => { const next = { ...prev }; delete next[p.id]; return next; });
      setEditedRegalo((prev) => { const next = { ...prev }; delete next[p.id]; return next; });
      setEditedRegaloCant((prev) => { const next = { ...prev }; delete next[p.id]; return next; });
      toast.success("Cambios guardados en \"" + p.name + "\"");
    } catch {
      toast.error("Error al guardar");
    } finally {
      setSavingId(null);
    }
  };

  const toggleExpand = async (p: Product) => {
    if (expandedId === p.id) { setExpandedId(null); return; }
    setExpandedId(p.id);
    if (cupos[p.id]) return; // ya cargado
    setLoadingCupos(true);
    try {
      const map = await getAsignacionesProducto(p.id);
      const row: Record<string, string> = {};
      vendedores.forEach((v) => { row[v.id] = map[v.id] != null ? String(map[v.id]) : ""; });
      setCupos((prev) => ({ ...prev, [p.id]: row }));
    } catch {
      toast.error("Error al cargar los cupos");
    } finally {
      setLoadingCupos(false);
    }
  };

  const setCupo = (productId: string, vendedorId: string, value: string) => {
    setCupos((prev) => ({ ...prev, [productId]: { ...(prev[productId] || {}), [vendedorId]: value } }));
  };

  const aplicarATodos = (productId: string, value: string) => {
    setCupos((prev) => {
      const row: Record<string, string> = {};
      vendedores.forEach((v) => { row[v.id] = value; });
      return { ...prev, [productId]: row };
    });
  };

  const handleSaveCupos = async (p: Product) => {
    const row = cupos[p.id] || {};
    setSavingCuposId(p.id);
    try {
      await Promise.all(
        vendedores.map((v) => {
          const n = Math.max(0, Math.floor(Number(row[v.id] || 0)));
          return setAsignacion(p.id, v.id, n);
        }),
      );
      toast.success(`Cupos guardados para "${p.name}"`);
    } catch {
      toast.error("Error al guardar los cupos");
    } finally {
      setSavingCuposId(null);
    }
  };

  return (
    <MainLayout allowedRoles={["admin"]} title="Descuentos" description="Asigná un descuento por producto y repartí las unidades por vendedor">
      <div className="space-y-4">
        {/* Info */}
        <div className="rounded-2xl border border-teal-200 bg-teal-50/60 dark:bg-teal-950/20 dark:border-teal-800 p-3 flex items-start gap-2">
          <Tag className="h-4 w-4 text-teal-600 shrink-0 mt-0.5" />
          <p className="text-xs text-teal-800 dark:text-teal-200">
            El <strong>%</strong> es el descuento del producto (se suma al del vendedor, topeado a su máximo). <strong>cada X / gratis</strong> es la promo de regalo: cada X unidades compradas se suman N gratis (paga X, lleva X+N; el stock descuenta el total). Poné 0 en "cada X" para sin promo. En <strong>Cupos</strong> repartís cuántas unidades en oferta tiene cada vendedor: se descuentan a medida que vende y al llegar a <strong>0 se le corta la oferta a ese vendedor</strong> (los demás siguen).
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
            <Button variant="ghost" size="icon" className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => { setSearchInput(""); setSearchQuery(""); setCurrentPage(1); }}>
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>

        {/* Lista */}
        {loading ? (
          <div className="space-y-2">
            {[...Array(8)].map((_, i) => (<Skeleton key={i} className="h-16 rounded-xl" />))}
          </div>
        ) : products.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-border bg-card/50 p-10 text-center">
            <Percent className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">{searchQuery ? "No se encontraron productos" : "No hay productos"}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {products.map((p) => {
              const dto = p.descuento ?? 0;
              const isExpanded = expandedId === p.id;
              return (
                <div key={p.id} className="rounded-xl border border-border bg-card overflow-hidden">
                  <div className="flex items-center gap-3 px-3 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm leading-tight truncate">{p.name}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {p.codigo && (<span className="text-[10px] font-mono text-muted-foreground">{p.codigo}</span>)}
                        <span className="text-[11px] font-semibold text-teal-600">{formatCurrency(p.price)}</span>
                        <span className={`text-[10px] font-medium ${p.stock > 0 ? "text-emerald-600" : "text-rose-500"}`}>
                          {p.stock > 0 ? `${p.stock} en stock` : "Sin stock"}
                        </span>
                        {dto > 0 && (
                          <Badge variant="secondary" className="h-4 px-1.5 text-[10px] bg-teal-100 text-teal-700 hover:bg-teal-100">{dto}% dto.</Badge>
                        )}
                        {(p.regaloCada ?? 0) > 0 && (
                          <Badge variant="secondary" className="h-4 px-1.5 text-[10px] bg-fuchsia-100 text-fuchsia-700 hover:bg-fuchsia-100">cada {p.regaloCada} +{p.regaloCantidad ?? 1}</Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <div className="flex flex-col items-center">
                        <Input
                          type="number" min={0} max={100}
                          value={getValue(p)}
                          onChange={(e) => setEdited((prev) => ({ ...prev, [p.id]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === "Enter" && isDirty(p)) handleSave(p); }}
                          className="h-8 w-14 text-center text-sm px-1"
                          title="% de descuento"
                        />
                        <span className="text-[9px] text-muted-foreground mt-0.5">% dto.</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <Input
                          type="number" min={0}
                          value={getValueRegalo(p)}
                          onChange={(e) => setEditedRegalo((prev) => ({ ...prev, [p.id]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === "Enter" && isDirty(p)) handleSave(p); }}
                          className="h-8 w-14 text-center text-sm px-1"
                          title="Cada cuántas unidades compradas se activa la promo (0 = sin promo)"
                        />
                        <span className="text-[9px] text-muted-foreground mt-0.5">cada X</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <Input
                          type="number" min={1}
                          value={getValueRegaloCant(p)}
                          onChange={(e) => setEditedRegaloCant((prev) => ({ ...prev, [p.id]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === "Enter" && isDirty(p)) handleSave(p); }}
                          disabled={Number(getValueRegalo(p) || 0) <= 0}
                          className="h-8 w-14 text-center text-sm px-1"
                          title="Cuántas unidades gratis por cada bloque"
                        />
                        <span className="text-[9px] text-muted-foreground mt-0.5">gratis</span>
                      </div>
                      <Button size="sm" disabled={!isDirty(p) || savingId === p.id} onClick={() => handleSave(p)} className="h-8 px-2.5 gap-1 self-start">
                        <Check className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline text-xs">Guardar</span>
                      </Button>
                      <Button
                        size="sm" variant={isExpanded ? "default" : "outline"}
                        onClick={() => toggleExpand(p)}
                        className="h-8 px-2.5 gap-1 self-start"
                        title="Repartir unidades por vendedor"
                      >
                        <Users className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline text-xs">Cupos</span>
                        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                      </Button>
                    </div>
                  </div>

                  {/* Panel de cupos por vendedor */}
                  {isExpanded && (
                    <div className="border-t border-border bg-muted/20 px-3 py-3">
                      {loadingCupos && !cupos[p.id] ? (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando cupos...
                        </div>
                      ) : vendedores.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-2">No hay vendedores cargados.</p>
                      ) : (
                        <>
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-[11px] font-medium text-muted-foreground">Asignar a todos:</span>
                            <Input
                              type="number" min={0} placeholder="0"
                              onChange={(e) => aplicarATodos(p.id, e.target.value)}
                              className="h-7 w-16 text-center text-xs px-1"
                            />
                            <span className="text-[10px] text-muted-foreground">unidades</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {vendedores.map((v) => (
                              <div key={v.id} className="flex items-center gap-2 bg-card rounded-lg border border-border px-2 py-1.5">
                                <span className="text-xs flex-1 truncate">{v.name}</span>
                                <Input
                                  type="number" min={0} placeholder="0"
                                  value={cupos[p.id]?.[v.id] ?? ""}
                                  onChange={(e) => setCupo(p.id, v.id, e.target.value)}
                                  className="h-7 w-16 text-center text-xs px-1"
                                />
                              </div>
                            ))}
                          </div>
                          <div className="flex justify-end mt-3">
                            <Button size="sm" onClick={() => handleSaveCupos(p)} disabled={savingCuposId === p.id} className="h-8 gap-1">
                              {savingCuposId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                              Guardar cupos
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Paginación */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-muted-foreground">{totalProducts} productos</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} className="h-8 w-8 flex items-center justify-center rounded-lg border border-border hover:border-primary/50 disabled:opacity-40 transition-colors">
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="text-xs font-medium px-2 tabular-nums">{currentPage}/{totalPages}</span>
                  <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages} className="h-8 w-8 flex items-center justify-center rounded-lg border border-border hover:border-primary/50 disabled:opacity-40 transition-colors">
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
