"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { MainLayout } from "@/components/layout/main-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { productsApi } from "@/lib/api";
import type { Product } from "@/lib/types";
import { formatCurrency } from "@/lib/utils/format";
import {
  Search, X, Percent, Check, Tag, ChevronLeft, ChevronRight, ChevronDown,
  Loader2, Gift, Plus, Pencil, Trash2, AlertTriangle, CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";

type OfertaTipo = "descuento" | "regalo_mismo" | "regalo_otro";

const TIPO_LABEL: Record<OfertaTipo, string> = {
  descuento: "Descuento %",
  regalo_mismo: "Regala el mismo producto",
  regalo_otro: "Regala otro producto",
};

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

  // Stock de los productos regalados (para el estado "sin stock" de la oferta cruzada)
  const [stockB, setStockB] = useState<Record<string, number>>({});

  // Resumen de ofertas activas (todos los productos con oferta)
  const [ofertasActivas, setOfertasActivas] = useState<Product[]>([]);
  const [ofertasOpen, setOfertasOpen] = useState(true);

  // Edición de ofertas
  const [editing, setEditing] = useState<{ id: string; tipo: OfertaTipo } | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  // Drafts por tipo
  const [dtoDraft, setDtoDraft] = useState<Record<string, string>>({});
  const [mismoDraft, setMismoDraft] = useState<Record<string, { max: string }>>({});
  const [comboDraft, setComboDraft] = useState<Record<string, { productoId: string | null; nombre: string; max: string }>>({});

  // Buscador del producto a regalar (oferta cruzada)
  const [comboSearch, setComboSearch] = useState("");
  const [comboResults, setComboResults] = useState<Product[]>([]);
  const [comboSearching, setComboSearching] = useState(false);
  const comboDebounce = useRef<NodeJS.Timeout | null>(null);

  const fetchProducts = useCallback(async (page: number, search: string) => {
    setLoading(true);
    try {
      const result = await productsApi.search({ search: search || undefined, page, pageSize });
      const visibles = result.data.filter((p) => !(p as any).disabled);
      setProducts(visibles);
      setTotalProducts(result.total);
      setTotalPages(result.totalPages);
      // Cargar stock de los productos regalados para calcular el estado
      const idsB = visibles.map((p) => p.regaloProductoId).filter((x): x is string => !!x);
      if (idsB.length) {
        const bs = await productsApi.getByIds(idsB);
        setStockB((prev) => ({ ...prev, ...Object.fromEntries(bs.map((b) => [b.id, b.stock])) }));
      }
    } catch {
      toast.error("Error al cargar productos");
    } finally {
      setLoading(false);
    }
  }, []);

  const cargarOfertasActivas = useCallback(async () => {
    try {
      const ofs = await productsApi.getConOfertas();
      setOfertasActivas(ofs);
      const idsB = ofs.map((p) => p.regaloProductoId).filter((x): x is string => !!x);
      if (idsB.length) {
        const bs = await productsApi.getByIds(idsB);
        setStockB((prev) => ({ ...prev, ...Object.fromEntries(bs.map((b) => [b.id, b.stock])) }));
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchProducts(currentPage, searchQuery);
  }, [currentPage, searchQuery, fetchProducts]);

  useEffect(() => {
    cargarOfertasActivas();
  }, [cargarOfertasActivas]);

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setCurrentPage(1);
      setSearchQuery(value);
    }, 300);
  };

  // --- Qué ofertas tiene un producto ---
  const tieneDescuento = (p: Product) => (p.descuento ?? 0) > 0;
  const tieneRegaloMismo = (p: Product) => !!p.regaloMismo;
  const tieneRegaloOtro = (p: Product) => !!p.regaloProductoId;

  const tiposDisponibles = (p: Product): OfertaTipo[] => {
    const t: OfertaTipo[] = [];
    if (!tieneDescuento(p)) t.push("descuento");
    if (!tieneRegaloMismo(p)) t.push("regalo_mismo");
    if (!tieneRegaloOtro(p)) t.push("regalo_otro");
    return t;
  };

  // --- Estado de cada oferta (activa / sin stock) ---
  const estadoRegaloOtro = (p: Product): "activa" | "sin_stock" | "desconocido" => {
    if (!p.regaloProductoId) return "activa";
    const s = stockB[p.regaloProductoId];
    if (s === undefined) return "desconocido";
    return s > 0 ? "activa" : "sin_stock";
  };

  // Lista descriptiva de las ofertas activas de un producto
  const ofertasDe = (p: Product): { tipo: OfertaTipo; text: string; estado: "activa" | "sin_stock" | "desconocido" }[] => {
    const arr: { tipo: OfertaTipo; text: string; estado: "activa" | "sin_stock" | "desconocido" }[] = [];
    if (tieneDescuento(p)) arr.push({ tipo: "descuento", text: `Descuento máx ${p.descuento}%`, estado: p.stock > 0 ? "activa" : "sin_stock" });
    if (tieneRegaloMismo(p)) arr.push({ tipo: "regalo_mismo", text: p.regaloMismoMax != null ? `Regala mismo (máx ${p.regaloMismoMax})` : `Regala mismo (libre)`, estado: p.stock > 0 ? "activa" : "sin_stock" });
    if (tieneRegaloOtro(p)) arr.push({ tipo: "regalo_otro", text: p.regaloOtroMax != null ? `Regala ${p.regaloProductoNombre} (máx ${p.regaloOtroMax})` : `Regala ${p.regaloProductoNombre} (libre)`, estado: estadoRegaloOtro(p) });
    return arr;
  };

  // --- Abrir edición / agregar ---
  const abrirEdicion = (p: Product, tipo: OfertaTipo) => {
    setEditing({ id: p.id, tipo });
    if (tipo === "descuento") {
      setDtoDraft((prev) => ({ ...prev, [p.id]: String(p.descuento ?? "") }));
    } else if (tipo === "regalo_mismo") {
      setMismoDraft((prev) => ({ ...prev, [p.id]: { max: p.regaloMismoMax != null ? String(p.regaloMismoMax) : "" } }));
    } else {
      setComboSearch("");
      setComboResults([]);
      setComboDraft((prev) => ({ ...prev, [p.id]: {
        productoId: p.regaloProductoId ?? null,
        nombre: p.regaloProductoNombre ?? "",
        max: p.regaloOtroMax != null ? String(p.regaloOtroMax) : "",
      } }));
    }
  };

  const cerrarEdicion = () => setEditing(null);

  const patchLocal = (id: string, patch: Partial<Product>) => {
    setProducts((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  };

  // --- Guardar / quitar por tipo ---
  const guardarDescuento = async (p: Product) => {
    const raw = Number(dtoDraft[p.id] ?? p.descuento ?? 0);
    const descuento = Math.max(0, Math.min(100, isNaN(raw) ? 0 : raw));
    setSavingId(p.id);
    try {
      await productsApi.update(p.id, { descuento });
      patchLocal(p.id, { descuento });
      toast.success(descuento > 0 ? `Descuento del ${descuento}% en "${p.name}"` : `Descuento quitado`);
      cerrarEdicion();
      cargarOfertasActivas();
    } catch { toast.error("Error al guardar"); } finally { setSavingId(null); }
  };

  const guardarRegaloMismo = async (p: Product) => {
    const d = mismoDraft[p.id] ?? { max: "" };
    const max = d.max.trim() === "" ? null : Math.max(1, Math.floor(Number(d.max) || 0));
    setSavingId(p.id);
    try {
      await productsApi.update(p.id, { regaloMismo: true, regaloMismoMax: max });
      patchLocal(p.id, { regaloMismo: true, regaloMismoMax: max });
      toast.success(`Regalo del mismo habilitado en "${p.name}"`);
      cerrarEdicion();
      cargarOfertasActivas();
    } catch { toast.error("Error al guardar"); } finally { setSavingId(null); }
  };

  const guardarRegaloOtro = async (p: Product) => {
    const d = comboDraft[p.id];
    if (!d) return;
    if (!d.productoId) { toast.error("Elegí el producto a regalar"); return; }
    const max = d.max.trim() === "" ? null : Math.max(1, Math.floor(Number(d.max) || 0));
    setSavingId(p.id);
    try {
      await productsApi.update(p.id, { regaloProductoId: d.productoId, regaloProductoNombre: d.nombre, regaloOtroMax: max });
      patchLocal(p.id, { regaloProductoId: d.productoId, regaloProductoNombre: d.nombre, regaloOtroMax: max });
      const b = await productsApi.getByIds([d.productoId]);
      if (b[0]) setStockB((prev) => ({ ...prev, [d.productoId!]: b[0].stock }));
      toast.success(`Combo guardado en "${p.name}"`);
      cerrarEdicion();
      cargarOfertasActivas();
    } catch { toast.error("Error al guardar"); } finally { setSavingId(null); }
  };

  const quitarOferta = async (p: Product, tipo: OfertaTipo) => {
    setSavingId(p.id);
    try {
      if (tipo === "descuento") {
        await productsApi.update(p.id, { descuento: 0 });
        patchLocal(p.id, { descuento: 0 });
      } else if (tipo === "regalo_mismo") {
        await productsApi.update(p.id, { regaloMismo: false, regaloMismoMax: null });
        patchLocal(p.id, { regaloMismo: false, regaloMismoMax: null });
      } else {
        await productsApi.update(p.id, { regaloProductoId: null, regaloProductoNombre: null, regaloOtroMax: null });
        patchLocal(p.id, { regaloProductoId: null, regaloProductoNombre: null, regaloOtroMax: null });
      }
      if (editing?.id === p.id && editing.tipo === tipo) cerrarEdicion();
      toast.success("Oferta quitada");
      cargarOfertasActivas();
    } catch { toast.error("Error al quitar la oferta"); } finally { setSavingId(null); }
  };

  // --- Buscador del producto a regalar ---
  const buscarComboProducto = (text: string) => {
    setComboSearch(text);
    if (comboDebounce.current) clearTimeout(comboDebounce.current);
    if (text.trim().length < 2) { setComboResults([]); return; }
    comboDebounce.current = setTimeout(async () => {
      setComboSearching(true);
      try {
        const res = await productsApi.search({ search: text, page: 1, pageSize: 8 });
        setComboResults(res.data.filter((x) => !(x as any).disabled));
      } catch { /* ignore */ } finally { setComboSearching(false); }
    }, 300);
  };

  const elegirComboProducto = (pId: string, prod: Product) => {
    setComboDraft((prev) => ({ ...prev, [pId]: { ...(prev[pId] || { max: "" }), productoId: prod.id, nombre: prod.name } }));
    setStockB((prev) => ({ ...prev, [prod.id]: prod.stock }));
    setComboSearch("");
    setComboResults([]);
  };

  return (
    <MainLayout allowedRoles={["admin"]} title="Ofertas" description="Elegí el tipo de oferta por producto y controlá su estado">
      <div className="space-y-4">
        {/* Info */}
        <div className="rounded-2xl border border-teal-200 bg-teal-50/60 dark:bg-teal-950/20 dark:border-teal-800 p-3 flex items-start gap-2">
          <Tag className="h-4 w-4 text-teal-600 shrink-0 mt-0.5" />
          <p className="text-xs text-teal-800 dark:text-teal-200">
            Cada producto puede tener hasta 3 ofertas: <strong>Descuento %</strong> (máximo que el vendedor puede aplicar),
            <strong> Regala el mismo producto</strong> (cantidad libre o con tope) y <strong>Regala otro producto</strong>.
            El badge muestra si está <strong>Activa</strong> o <strong>Sin stock</strong>.
          </p>
        </div>

        {/* Ofertas activas (resumen) */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <button
            onClick={() => setOfertasOpen((v) => !v)}
            className="flex items-center justify-between w-full px-4 py-3 hover:bg-muted/30 transition-colors"
          >
            <span className="flex items-center gap-2 text-sm font-semibold">
              <Gift className="h-4 w-4 text-fuchsia-600" />
              Ofertas activas
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px] bg-fuchsia-100 text-fuchsia-700 hover:bg-fuchsia-100">
                {ofertasActivas.reduce((acc, p) => acc + ofertasDe(p).length, 0)}
              </Badge>
            </span>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${ofertasOpen ? "rotate-180" : ""}`} />
          </button>
          {ofertasOpen && (
            <div className="border-t border-border divide-y divide-border/60">
              {ofertasActivas.length === 0 ? (
                <p className="px-4 py-3 text-xs text-muted-foreground">No hay ofertas configuradas.</p>
              ) : (
                ofertasActivas.map((p) => (
                  <div key={p.id} className="px-4 py-2.5">
                    <p className="text-xs font-medium truncate mb-1">{p.name}</p>
                    <div className="flex flex-col gap-1">
                      {ofertasDe(p).map((o) => (
                        <div key={o.tipo} className="flex items-center gap-2">
                          {o.tipo === "descuento"
                            ? <Tag className="h-3.5 w-3.5 text-teal-600 shrink-0" />
                            : <Gift className={`h-3.5 w-3.5 shrink-0 ${o.tipo === "regalo_otro" ? "text-purple-600" : "text-fuchsia-600"}`} />}
                          <span className="text-[11px] text-muted-foreground flex-1 min-w-0 truncate">{o.text}</span>
                          <EstadoBadge estado={o.estado} />
                          <Button
                            variant="ghost" size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0"
                            title="Quitar oferta"
                            disabled={savingId === p.id}
                            onClick={() => quitarOferta(p, o.tipo)}
                          >
                            {savingId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
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
            {[...Array(8)].map((_, i) => (<Skeleton key={i} className="h-20 rounded-xl" />))}
          </div>
        ) : products.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-border bg-card/50 p-10 text-center">
            <Percent className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">{searchQuery ? "No se encontraron productos" : "No hay productos"}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {products.map((p) => {
              const disponibles = tiposDisponibles(p);
              const sinOfertas = !tieneDescuento(p) && !tieneRegaloMismo(p) && !tieneRegaloOtro(p);
              return (
                <div key={p.id} className="rounded-xl border border-border bg-card overflow-hidden">
                  {/* Encabezado */}
                  <div className="flex items-center gap-3 px-3 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm leading-tight truncate">{p.name}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {p.codigo && (<span className="text-[10px] font-mono text-muted-foreground">{p.codigo}</span>)}
                        <span className="text-[11px] font-semibold text-teal-600">{formatCurrency(p.price)}</span>
                        <span className={`text-[10px] font-medium ${p.stock > 0 ? "text-emerald-600" : "text-rose-500"}`}>
                          {p.stock > 0 ? `${p.stock} en stock` : "Sin stock"}
                        </span>
                      </div>
                    </div>
                    {/* Agregar oferta */}
                    <div className="shrink-0">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="outline" disabled={disponibles.length === 0} className="h-8 px-2.5 gap-1">
                            <Plus className="h-3.5 w-3.5" />
                            <span className="text-xs">Agregar oferta</span>
                            <ChevronDown className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          {disponibles.map((t) => (
                            <DropdownMenuItem key={t} onSelect={() => abrirEdicion(p, t)} className="gap-2 text-xs">
                              {t === "descuento" ? <Percent className="h-3.5 w-3.5 text-teal-600" /> : <Gift className="h-3.5 w-3.5 text-fuchsia-600" />}
                              {TIPO_LABEL[t]}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  {/* Ofertas activas */}
                  <div className="px-3 pb-2.5 space-y-1.5">
                    {sinOfertas && (
                      <p className="text-[11px] text-muted-foreground italic">Sin ofertas. Usá "Agregar oferta".</p>
                    )}

                    {tieneDescuento(p) && (
                      <OfferRow
                        icon={<Tag className="h-3.5 w-3.5 text-teal-600" />}
                        text={`Descuento máx ${p.descuento}%`}
                        estado={p.stock > 0 ? "activa" : "sin_stock"}
                        onEdit={() => abrirEdicion(p, "descuento")}
                        onRemove={() => quitarOferta(p, "descuento")}
                      />
                    )}
                    {tieneRegaloMismo(p) && (
                      <OfferRow
                        icon={<Gift className="h-3.5 w-3.5 text-fuchsia-600" />}
                        text={p.regaloMismoMax != null ? `Regala mismo (máx ${p.regaloMismoMax})` : `Regala mismo (libre)`}
                        estado={p.stock > 0 ? "activa" : "sin_stock"}
                        onEdit={() => abrirEdicion(p, "regalo_mismo")}
                        onRemove={() => quitarOferta(p, "regalo_mismo")}
                      />
                    )}
                    {tieneRegaloOtro(p) && (
                      <OfferRow
                        icon={<Gift className="h-3.5 w-3.5 text-purple-600" />}
                        text={p.regaloOtroMax != null ? `Regala ${p.regaloProductoNombre} (máx ${p.regaloOtroMax})` : `Regala ${p.regaloProductoNombre} (libre)`}
                        estado={estadoRegaloOtro(p)}
                        onEdit={() => abrirEdicion(p, "regalo_otro")}
                        onRemove={() => quitarOferta(p, "regalo_otro")}
                      />
                    )}
                  </div>

                  {/* Panel de edición */}
                  {editing?.id === p.id && (
                    <div className="border-t border-border bg-muted/20 px-3 py-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold">{TIPO_LABEL[editing.tipo]}</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={cerrarEdicion}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>

                      {editing.tipo === "descuento" && (
                        <div className="flex items-end gap-2">
                          <div className="flex flex-col">
                            <span className="text-[9px] text-muted-foreground mb-0.5">% máximo de descuento</span>
                            <Input
                              type="number" min={0} max={100}
                              value={dtoDraft[p.id] ?? ""}
                              onChange={(e) => setDtoDraft((prev) => ({ ...prev, [p.id]: e.target.value }))}
                              className="h-8 w-24 text-center text-sm"
                            />
                          </div>
                          <Button size="sm" disabled={savingId === p.id} onClick={() => guardarDescuento(p)} className="h-8 gap-1 ml-auto">
                            {savingId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Guardar
                          </Button>
                        </div>
                      )}

                      {editing.tipo === "regalo_mismo" && (
                        <div className="flex items-end gap-3 flex-wrap">
                          <div className="flex flex-col">
                            <span className="text-[9px] text-muted-foreground mb-0.5">máx a regalar (vacío = libre)</span>
                            <Input type="number" min={1}
                              value={mismoDraft[p.id]?.max ?? ""}
                              onChange={(e) => setMismoDraft((prev) => ({ ...prev, [p.id]: { max: e.target.value } }))}
                              className="h-8 w-28 text-center text-sm" placeholder="libre" />
                          </div>
                          <Button size="sm" disabled={savingId === p.id} onClick={() => guardarRegaloMismo(p)} className="h-8 gap-1 ml-auto">
                            {savingId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Guardar
                          </Button>
                        </div>
                      )}

                      {editing.tipo === "regalo_otro" && (
                        <div className="space-y-2">
                          {comboDraft[p.id]?.productoId ? (
                            <div className="flex items-center gap-2 bg-card rounded-lg border border-purple-200 px-2 py-1.5">
                              <Gift className="h-3.5 w-3.5 text-purple-600 shrink-0" />
                              <span className="text-xs flex-1 truncate font-medium">{comboDraft[p.id]?.nombre}</span>
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setComboDraft((prev) => ({ ...prev, [p.id]: { ...(prev[p.id]!), productoId: null, nombre: "" } }))}>
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            <div className="relative">
                              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                              <Input
                                placeholder="Buscar producto a regalar..."
                                value={comboSearch}
                                onChange={(e) => buscarComboProducto(e.target.value)}
                                className="pl-8 h-8 text-xs"
                              />
                              {(comboSearching || comboResults.length > 0) && (
                                <div className="absolute z-10 mt-1 w-full bg-card border border-border rounded-lg shadow-lg max-h-52 overflow-auto">
                                  {comboSearching ? (
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground px-3 py-2">
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando...
                                    </div>
                                  ) : (
                                    comboResults.filter((r) => r.id !== p.id).map((r) => (
                                      <button key={r.id} onClick={() => elegirComboProducto(p.id, r)} className="flex items-center justify-between w-full px-3 py-1.5 text-left hover:bg-muted/40 transition-colors">
                                        <span className="text-xs truncate flex-1">{r.name}</span>
                                        <span className={`text-[10px] ml-2 ${r.stock > 0 ? "text-muted-foreground" : "text-rose-500"}`}>{r.stock > 0 ? `${r.stock} u.` : "sin stock"}</span>
                                      </button>
                                    ))
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                          <div className="flex items-end gap-3 flex-wrap">
                            <div className="flex flex-col">
                              <span className="text-[9px] text-muted-foreground mb-0.5">máx a regalar (vacío = libre)</span>
                              <Input type="number" min={1}
                                value={comboDraft[p.id]?.max ?? ""}
                                onChange={(e) => setComboDraft((prev) => ({ ...prev, [p.id]: { ...(prev[p.id] || { productoId: null, nombre: "" }), max: e.target.value } }))}
                                className="h-8 w-28 text-center text-sm" placeholder="libre" />
                            </div>
                            <Button size="sm" disabled={savingId === p.id} onClick={() => guardarRegaloOtro(p)} className="h-8 gap-1 ml-auto">
                              {savingId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Guardar
                            </Button>
                          </div>
                        </div>
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

// ─── Sub-componentes ───────────────────────────────────────────────

function EstadoBadge({ estado }: { estado: "activa" | "sin_stock" | "desconocido" }) {
  if (estado === "sin_stock") {
    return (
      <Badge variant="secondary" className="h-5 px-1.5 text-[10px] gap-1 bg-rose-100 text-rose-700 hover:bg-rose-100">
        <AlertTriangle className="h-3 w-3" /> Sin stock
      </Badge>
    );
  }
  if (estado === "desconocido") {
    return <Badge variant="secondary" className="h-5 px-1.5 text-[10px] bg-gray-100 text-gray-600 hover:bg-gray-100">—</Badge>;
  }
  return (
    <Badge variant="secondary" className="h-5 px-1.5 text-[10px] gap-1 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
      <CheckCircle2 className="h-3 w-3" /> Activa
    </Badge>
  );
}

function OfferRow({
  icon, text, estado, onEdit, onRemove,
}: {
  icon: React.ReactNode;
  text: string;
  estado: "activa" | "sin_stock" | "desconocido";
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-background/60 px-2.5 py-1.5">
      {icon}
      <span className="text-xs flex-1 min-w-0 truncate">{text}</span>
      <EstadoBadge estado={estado} />
      <Button variant="ghost" size="icon" className="h-6 w-6" title="Editar" onClick={onEdit}>
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" title="Quitar" onClick={onRemove}>
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
