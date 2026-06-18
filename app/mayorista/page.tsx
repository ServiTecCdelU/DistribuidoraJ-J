"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { MainLayout } from "@/components/layout/main-layout";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Upload,
  Search,
  X,
  FileSpreadsheet,
  Check,
  ArrowRight,
  RefreshCw,
  AlertCircle,
  PackagePlus,
  PackageX,
  Settings2,
  Pencil,
  Save,
  SlidersHorizontal,
} from "lucide-react";
import * as XLSX from "xlsx";
import type { MayoristaProducto, MayoristaPrefs } from "@/lib/types";
import {
  upsertMayoristaProductos,
  habilitarProducto,
  deshabilitarProducto,
  getMayoristaPrefs,
  saveMayoristaPrefs,
  invalidateMayoristaCache,
  searchMayoristaProductos,
  getMayoristaRubros,
  actualizarPreciosMayorista,
  editarProductoMayorista,
} from "@/services/mayorista-service";
import type { MayoristaSearchParams, PriceUpdateRow, EditarProductoData, PriceUpdateResult } from "@/services/mayorista-service";
import { formatCurrency } from "@/lib/utils/format";
import { useAuth } from "@/hooks/use-auth";

// ─── Tipos internos ───────────────────────────────────────────────────────────
type ColumnLetter = string;

interface ExcelColumn {
  letter: ColumnLetter;
  header: string;
  preview: string[];
}

interface ColumnMapping {
  codigoBarras: ColumnLetter;
  codigo: ColumnLetter;
  nombre: ColumnLetter;
  precioUnitario: ColumnLetter;
  rubro: ColumnLetter;
  subrubro: ColumnLetter;
}

interface ParsedRow {
  codigoBarras: string;
  codigo: string;
  nombre: string;
  precioUnitarioMayorista: number;
  rubro: string;
  subrubro: string;
  unidadesPorBulto: number;
  categoria: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
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

function getSubrubros(subrubro: string): [string, string, string] {
  const parts = subrubro.split("/").map((s) => s.trim());
  return [parts[0] ?? "", parts[1] ?? "", parts[2] ?? ""];
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function MayoristaPage() {
  const { user } = useAuth();
  const [productos, setProductos] = useState<MayoristaProducto[]>([]);
  const [totalProductos, setTotalProductos] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [searchParams, setSearchParams] = useState<MayoristaSearchParams>({ page: 1, pageSize: 10 });
  const [prefs, setPrefs] = useState<MayoristaPrefs>({
    showCodigoBarras: true,
    showRubro: true,
    showSubrubro: true,
  });
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [rubros, setRubros] = useState<string[]>([]);

  const cargar = useCallback(async (params: MayoristaSearchParams) => {
    setLoading(true);
    try {
      const result = await searchMayoristaProductos(params);
      setProductos(result.data);
      setTotalProductos(result.total);
      setTotalPages(result.totalPages);
      setCurrentPage(result.page);
    } catch {
      toast.error("Error al cargar productos del mayorista");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar(searchParams);
  }, [searchParams, cargar]);

  useEffect(() => {
    getMayoristaRubros().then(setRubros).catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return;
    getMayoristaPrefs(user.id)
      .then((p) => {
        setPrefs(p);
        setPrefsLoaded(true);
      })
      .catch(() => setPrefsLoaded(true));
  }, [user]);

  const handlePrefsChange = async (newPrefs: MayoristaPrefs) => {
    setPrefs(newPrefs);
    if (!user) return;
    try {
      await saveMayoristaPrefs(user.id, newPrefs);
    } catch {
      toast.error("Error al guardar preferencias");
    }
  };

  return (
    <MainLayout allowedRoles={['admin']} title="Mayorista" description="Gestión de productos y precios del mayorista">
      <div className="space-y-4">
        <PageHeader description="Productos y precios del mayorista" />

        {/* Panel de preferencias de columnas (solo desktop) */}
        {prefsLoaded && (
          <Card className="hidden md:block rounded-2xl border-dashed">
            <CardContent className="py-3 px-4">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Settings2 className="h-3.5 w-3.5" />
                  <span className="font-medium">Columnas visibles:</span>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="show-rubro"
                    checked={prefs.showRubro}
                    onCheckedChange={(v) =>
                      handlePrefsChange({ ...prefs, showRubro: !!v })
                    }
                  />
                  <Label htmlFor="show-rubro" className="text-xs cursor-pointer">
                    Rubro
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="show-subrubro"
                    checked={prefs.showSubrubro}
                    onCheckedChange={(v) =>
                      handlePrefsChange({ ...prefs, showSubrubro: !!v })
                    }
                  />
                  <Label htmlFor="show-subrubro" className="text-xs cursor-pointer">
                    Subrubros
                  </Label>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <ListaPrecios
          productos={productos}
          totalProductos={totalProductos}
          totalPages={totalPages}
          currentPage={currentPage}
          loading={loading}
          prefs={prefs}
          rubros={rubros}
          onSearchChange={(params) => setSearchParams(params)}
          onReload={() => { invalidateMayoristaCache(); cargar(searchParams); }}
          onProductosImportados={() => cargar(searchParams)}
          onHabilitarChange={(id, changes) =>
            setProductos((prev) =>
              prev.map((p) => (p.id === id ? { ...p, ...changes } : p))
            )
          }
        />
      </div>
    </MainLayout>
  );
}

// ─── Tab 1: Lista de precios ──────────────────────────────────────────────────
function ListaPrecios({
  productos,
  totalProductos,
  totalPages,
  currentPage,
  loading,
  prefs,
  rubros: rubrosFromParent,
  onSearchChange,
  onReload,
  onProductosImportados,
  onHabilitarChange,
}: {
  productos: MayoristaProducto[];
  totalProductos: number;
  totalPages: number;
  currentPage: number;
  loading: boolean;
  prefs: MayoristaPrefs;
  rubros: string[];
  onSearchChange: (params: MayoristaSearchParams) => void;
  onReload: () => void;
  onProductosImportados: () => void;
  onHabilitarChange: (id: string, changes: Partial<MayoristaProducto>) => void;
}) {
  const [search, setSearch] = useState("");
  const [rubroFiltro, setRubroFiltro] = useState("todos");
  const [subrubroFiltro, setSubrubroFiltro] = useState("todos");
  const [estadoFiltro, setEstadoFiltro] = useState<"todos" | "habilitados" | "deshabilitados">("todos");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [priceUpdateOpen, setPriceUpdateOpen] = useState(false);
  const [priceUpdateSuccess, setPriceUpdateSuccess] = useState<PriceUpdateResult | null>(null);
  const [habilitarTarget, setHabilitarTarget] = useState<MayoristaProducto | null>(null);
  const [editarTarget, setEditarTarget] = useState<MayoristaProducto | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const rubros = useMemo(() => ["todos", ...rubrosFromParent], [rubrosFromParent]);

  // Emitir cambios de búsqueda con debounce
  const emitSearch = useCallback((s: string, rubro: string, subrubro: string, estado: string, page: number) => {
    onSearchChange({
      search: s || undefined,
      rubro: rubro !== "todos" ? rubro : undefined,
      subrubro: subrubro !== "todos" ? subrubro : undefined,
      estado: estado as any,
      page,
      pageSize: 10,
    });
  }, [onSearchChange]);

  const handleSearchInput = (value: string) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      emitSearch(value, rubroFiltro, subrubroFiltro, estadoFiltro, 1);
    }, 300);
  };

  const handleRubroChange = (v: string) => {
    setRubroFiltro(v);
    setSubrubroFiltro("todos");
    emitSearch(search, v, "todos", estadoFiltro, 1);
  };

  const handleSubrubroChange = (v: string) => {
    setSubrubroFiltro(v);
    emitSearch(search, rubroFiltro, v, estadoFiltro, 1);
  };

  const handleEstadoChange = (v: string) => {
    setEstadoFiltro(v as typeof estadoFiltro);
    emitSearch(search, rubroFiltro, subrubroFiltro, v, 1);
  };

  const handlePageChange = (page: number) => {
    emitSearch(search, rubroFiltro, subrubroFiltro, estadoFiltro, page);
  };

  const filasPagina = productos;

  const activeFilterCount =
    (rubroFiltro !== "todos" ? 1 : 0) +
    (subrubroFiltro !== "todos" ? 1 : 0) +
    (estadoFiltro !== "todos" ? 1 : 0);

  return (
    <div className="space-y-4">
      {/* Controles */}
      <div className="space-y-3">
        {/* Buscador + botón de filtros (el botón solo en mobile) */}
        <div className="flex gap-2 items-center">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre o código..."
              value={search}
              onChange={(e) => handleSearchInput(e.target.value)}
              className="pl-10 rounded-xl"
            />
            {search && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6"
                onClick={() => { setSearch(""); emitSearch("", rubroFiltro, subrubroFiltro, estadoFiltro, 1); }}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <Button
            variant={filtersOpen ? "default" : "outline"}
            size="icon"
            className={`sm:hidden shrink-0 h-10 w-10 relative rounded-xl ${filtersOpen ? "bg-teal-600 hover:bg-teal-700 text-white" : ""}`}
            onClick={() => setFiltersOpen(!filtersOpen)}
          >
            <SlidersHorizontal className="h-4 w-4" />
            {activeFilterCount > 0 && !filtersOpen && (
              <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white leading-none">
                {activeFilterCount}
              </span>
            )}
          </Button>
        </div>

        {/* Actualizar precios — botón principal, debajo del buscador */}
        <Button
          className="rounded-xl gap-2 w-full sm:w-auto"
          onClick={() => setPriceUpdateOpen(true)}
        >
          <Upload className="h-4 w-4" />
          Actualizar Precios
        </Button>

        {/* Filtros + acciones: panel colapsable en mobile, fila en desktop */}
        <div className={`${filtersOpen ? "grid grid-cols-1" : "hidden"} sm:flex sm:flex-row sm:flex-wrap gap-3 sm:items-center`}>
          <Select value={rubroFiltro} onValueChange={handleRubroChange}>
            <SelectTrigger className="w-full sm:w-48 rounded-xl">
              <SelectValue placeholder="Rubro" />
            </SelectTrigger>
            <SelectContent>
              {rubros.map((r) => (
                <SelectItem key={r} value={r}>
                  {r === "todos" ? "Todos los rubros" : r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={subrubroFiltro} onValueChange={handleSubrubroChange}>
            <SelectTrigger className="w-full sm:w-48 rounded-xl">
              <SelectValue placeholder="Subrubro" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los subrubros</SelectItem>
            </SelectContent>
          </Select>
          <Select value={estadoFiltro} onValueChange={handleEstadoChange}>
            <SelectTrigger className="w-full sm:w-44 rounded-xl">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="habilitados">Habilitados</SelectItem>
              <SelectItem value="deshabilitados">Deshabilitados</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            className="rounded-xl shrink-0"
            onClick={onReload}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="rounded-xl gap-2 shrink-0"
            onClick={() => setImportOpen(true)}
          >
            <FileSpreadsheet className="h-4 w-4" />
            Importar Productos
          </Button>
        </div>
      </div>

      {/* Tabla */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-xl" />
          ))}
        </div>
      ) : filasPagina.length === 0 ? (
        <div className="text-center py-16">
          <FileSpreadsheet className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            {productos.length === 0
              ? "No hay productos importados. Usá el botón \"Importar Excel\" para comenzar."
              : "No hay productos que coincidan con los filtros."}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border overflow-hidden">
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left px-3 py-3 font-semibold text-muted-foreground">Código</th>
                  <th className="text-left px-3 py-3 font-semibold text-muted-foreground">Descripción</th>
                  <th className="text-right px-3 py-3 font-semibold text-muted-foreground whitespace-nowrap">
                    Cons. Final
                  </th>
                  {prefs.showRubro && (
                    <th className="text-left px-3 py-3 font-semibold text-muted-foreground">Rubro</th>
                  )}
                  {prefs.showSubrubro && (
                    <>
                      <th className="text-left px-3 py-3 font-semibold text-muted-foreground">Subrubro 1</th>
                      <th className="text-left px-3 py-3 font-semibold text-muted-foreground">Subrubro 2</th>
                      <th className="text-left px-3 py-3 font-semibold text-muted-foreground">Subrubro 3</th>
                    </>
                  )}
                  <th className="text-center px-3 py-3 font-semibold text-muted-foreground">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filasPagina.map((p) => {
                  const [s1, s2, s3] = getSubrubros(p.subrubro ?? "");
                  return (
                    <tr
                      key={p.id}
                      className={`hover:bg-muted/20 transition-colors ${p.habilitado ? "bg-teal-50/30 dark:bg-teal-950/10" : ""}`}
                    >
                      <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                        {p.codigo}
                      </td>
                      <td className="px-3 py-2.5 font-medium max-w-[220px] truncate">{p.nombre}</td>
                      <td className="px-3 py-2.5 text-right font-semibold text-teal-600 whitespace-nowrap">
                        {formatCurrency(p.precioUnitarioMayorista)}
                      </td>
                      {prefs.showRubro && (
                        <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                          {p.rubro || "—"}
                        </td>
                      )}
                      {prefs.showSubrubro && (
                        <>
                          <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                            {s1 || "—"}
                          </td>
                          <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                            {s2 || "—"}
                          </td>
                          <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                            {s3 || "—"}
                          </td>
                        </>
                      )}
                      <td className="px-3 py-2.5 text-center">
                        {p.habilitado ? (
                          <div className="flex items-center justify-center gap-1">
                            {/* Editar deshabilitado en mayorista: esta vista es solo para actualizar precios
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs rounded-lg text-teal-600 border-teal-600/30 hover:bg-teal-50 dark:hover:bg-teal-950/30 gap-1"
                              onClick={() => setEditarTarget(p)}
                            >
                              <Pencil className="h-3 w-3" />
                              Editar
                            </Button>
                            */}
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs rounded-lg text-destructive border-destructive/30 hover:bg-destructive/10 gap-1"
                              onClick={async () => {
                                try {
                                  await deshabilitarProducto(p);
                                  onHabilitarChange(p.id, { habilitado: false });
                                  toast.success("Producto deshabilitado");
                                } catch {
                                  toast.error("Error al deshabilitar");
                                }
                              }}
                            >
                              <PackageX className="h-3 w-3" />
                              Deshabilitar
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs rounded-lg text-teal-600 border-teal-600/30 hover:bg-teal-50 dark:hover:bg-teal-950/30 gap-1"
                            onClick={() => setHabilitarTarget(p)}
                          >
                            <PackagePlus className="h-3 w-3" />
                            Habilitar
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Tabla mobile (compacta, alineada) */}
          <div className="md:hidden divide-y" style={{ fontSize: '12px' }}>
            {/* Encabezado */}
            <div className="grid grid-cols-[4rem_minmax(0,1fr)_4.5rem_1.75rem] gap-x-1.5 px-2.5 py-1.5 bg-muted/50 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span>Código</span>
              <span>Descripción</span>
              <span className="text-right">C.Final</span>
              <span />
            </div>
            {filasPagina.map((p) => (
              <div
                key={p.id}
                className={`grid grid-cols-[4rem_minmax(0,1fr)_4.5rem_1.75rem] gap-x-1.5 px-2.5 py-1.5 items-center ${p.habilitado ? "bg-teal-50/40 dark:bg-teal-950/10" : ""}`}
              >
                <span className="font-mono text-[11px] text-muted-foreground truncate">{p.codigo}</span>
                <span className="text-xs font-medium truncate">{p.nombre}</span>
                <span className="text-right text-xs font-semibold text-teal-600 whitespace-nowrap">{formatCurrency(p.precioUnitarioMayorista)}</span>
                {p.habilitado ? (
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-6 w-6 rounded-md text-destructive border-destructive/30 hover:bg-destructive/10 justify-self-end"
                    title="Deshabilitar"
                    onClick={async () => {
                      try {
                        await deshabilitarProducto(p);
                        onHabilitarChange(p.id, { habilitado: false });
                        toast.success("Producto deshabilitado");
                      } catch {
                        toast.error("Error al deshabilitar");
                      }
                    }}
                  >
                    <PackageX className="h-3.5 w-3.5" />
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-6 w-6 rounded-md text-teal-600 border-teal-600/30 hover:bg-teal-50 dark:hover:bg-teal-950/30 justify-self-end"
                    title="Habilitar"
                    onClick={() => setHabilitarTarget(p)}
                  >
                    <PackagePlus className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          <div className="px-4 py-2 bg-muted/30 border-t flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {totalProductos} productos · página {currentPage} de {totalPages}
            </span>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 rounded-lg text-xs"
                  disabled={currentPage === 1}
                  onClick={() => handlePageChange(currentPage - 1)}
                >
                  ← Anterior
                </Button>
                <span className="text-xs text-muted-foreground px-2 tabular-nums">
                  {currentPage} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 rounded-lg text-xs"
                  disabled={currentPage === totalPages}
                  onClick={() => handlePageChange(currentPage + 1)}
                >
                  Siguiente →
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal actualización de precios */}
      <PriceUpdateDialog
        open={priceUpdateOpen}
        onOpenChange={setPriceUpdateOpen}
        onActualizado={async () => {
          onProductosImportados();
        }}
        onSuccess={(res) => setPriceUpdateSuccess(res)}
      />

      {/* Modal de confirmación: resultado de actualizar precios */}
      <Dialog open={!!priceUpdateSuccess} onOpenChange={(v) => { if (!v) setPriceUpdateSuccess(null); }}>
        <DialogContent className="w-[95vw] max-w-sm p-6 text-center">
          {(() => {
            const ok = (priceUpdateSuccess?.discrepancias.length ?? 0) === 0;
            return (
              <>
                <DialogHeader className="items-center">
                  <div className={`flex items-center justify-center h-14 w-14 rounded-full mb-2 ${ok ? "bg-emerald-100" : "bg-amber-100"}`}>
                    {ok ? <Check className="h-7 w-7 text-emerald-600" /> : <AlertCircle className="h-7 w-7 text-amber-600" />}
                  </div>
                  <DialogTitle>{ok ? "Precios actualizados" : "Actualizado con diferencias"}</DialogTitle>
                  <DialogDescription>
                    {ok ? (
                      <>
                        Se verificó contra la base de datos que los{" "}
                        <strong>{priceUpdateSuccess?.verificados}</strong> precios quedaron guardados
                        correctamente. Está todo bien.
                      </>
                    ) : (
                      <>
                        {priceUpdateSuccess?.verificados} precios se guardaron OK, pero{" "}
                        <strong>{priceUpdateSuccess?.discrepancias.length}</strong> no coincidieron al
                        verificar. Revisalos y volvé a intentar con esos códigos.
                      </>
                    )}
                  </DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-3 gap-3 mt-2">
                  <div className="p-3 rounded-xl bg-teal-50 border border-teal-200">
                    <p className="text-xl font-bold text-teal-700">{priceUpdateSuccess?.actualizados}</p>
                    <p className="text-[10px] text-teal-600 font-medium">Mayorista</p>
                  </div>
                  <div className="p-3 rounded-xl bg-blue-50 border border-blue-200">
                    <p className="text-xl font-bold text-blue-700">{priceUpdateSuccess?.preciosVentaActualizados}</p>
                    <p className="text-[10px] text-blue-600 font-medium">Precio venta</p>
                  </div>
                  <div className="p-3 rounded-xl bg-fuchsia-50 border border-fuchsia-200">
                    <p className="text-xl font-bold text-fuchsia-700">{priceUpdateSuccess?.agregados}</p>
                    <p className="text-[10px] text-fuchsia-600 font-medium">Nuevos</p>
                  </div>
                </div>

                {!ok && priceUpdateSuccess && (
                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/60 max-h-32 overflow-y-auto text-[11px] text-left">
                    {priceUpdateSuccess.discrepancias.slice(0, 10).map((d, i) => (
                      <div key={i} className="flex items-center justify-between px-2 py-1 border-b border-amber-100 last:border-0">
                        <span className="font-mono">{d.codigo}</span>
                        <span className="text-muted-foreground">
                          esperado {formatCurrency(d.esperado)} · real {d.real != null ? formatCurrency(d.real) : "—"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {!!priceUpdateSuccess && priceUpdateSuccess.agregados > 0 && (
                  <div className="mt-3 text-left">
                    <p className="text-[11px] font-semibold text-fuchsia-700 mb-1">
                      {priceUpdateSuccess.agregados} productos nuevos agregados (deshabilitados):
                    </p>
                    <div className="rounded-lg border border-fuchsia-200 bg-fuchsia-50/60 max-h-32 overflow-y-auto text-[11px]">
                      {priceUpdateSuccess.agregadosDetalle.slice(0, 30).map((a, i) => (
                        <div key={i} className="flex items-center gap-2 px-2 py-1 border-b border-fuchsia-100 last:border-0">
                          <span className="font-mono text-[10px] shrink-0">{a.codigo}</span>
                          <span className="truncate">{a.descripcion}</span>
                        </div>
                      ))}
                      {priceUpdateSuccess.agregados > priceUpdateSuccess.agregadosDetalle.length && (
                        <div className="px-2 py-1 text-[10px] text-muted-foreground">
                          +{priceUpdateSuccess.agregados - priceUpdateSuccess.agregadosDetalle.length} más
                        </div>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Quedaron cargados con su precio. Habilitálos desde la lista para venderlos.
                    </p>
                  </div>
                )}

                <DialogFooter className="mt-3">
                  <Button className="w-full" onClick={() => setPriceUpdateSuccess(null)}>Cerrar</Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Modal de importación de productos nuevos */}
      <ExcelImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImportado={async () => {
          onProductosImportados();
          setImportOpen(false);
          toast.success("Productos importados correctamente");
        }}
      />

      {/* Modal habilitar producto */}
      {habilitarTarget && (
        <HabilitarModal
          producto={habilitarTarget}
          onClose={() => setHabilitarTarget(null)}
          onConfirm={(changes) => {
            onHabilitarChange(habilitarTarget.id, changes);
            setHabilitarTarget(null);
          }}
        />
      )}

      {/* Modal editar producto */}
      {editarTarget && (
        <EditarProductoModal
          producto={editarTarget}
          onClose={() => setEditarTarget(null)}
          onSave={(changes) => {
            onHabilitarChange(editarTarget.id, changes);
            setEditarTarget(null);
            onReload();
          }}
        />
      )}
    </div>
  );
}

// ─── Modal para editar un producto ───────────────────────────────────────────
function EditarProductoModal({
  producto,
  onClose,
  onSave,
}: {
  producto: MayoristaProducto;
  onClose: () => void;
  onSave: (changes: Partial<MayoristaProducto>) => void;
}) {
  const [nombre, setNombre] = useState(producto.nombre);
  const [precioLista, setPrecioLista] = useState(String(producto.precioUnitarioMayorista));
  const [gananciaPorc, setGananciaPorc] = useState(
    producto.gananciaGlobal != null ? String(producto.gananciaGlobal) : "30"
  );
  const [stock, setStock] = useState(String(producto.stockLocal ?? 0));
  const [unidadesPorBulto, setUnidadesPorBulto] = useState(
    producto.unidadesPorBulto ? String(producto.unidadesPorBulto) : ""
  );
  const [seDivideEn, setSeDivideEn] = useState(
    producto.seDivideEn ? String(producto.seDivideEn) : ""
  );
  const [rubro, setRubro] = useState(producto.rubro || "");
  const [saving, setSaving] = useState(false);

  const precioListaNum = parseFloat(precioLista) || 0;
  const gananciaNum = parseFloat(gananciaPorc);
  const precioVentaCalc =
    !isNaN(gananciaNum) && gananciaNum >= 0 && precioListaNum > 0
      ? Math.round(precioListaNum * (1 + gananciaNum / 100) * 100) / 100
      : producto.precioVenta;

  const handleGuardar = async () => {
    setSaving(true);
    try {
      const data: EditarProductoData = {};
      if (nombre !== producto.nombre) data.nombre = nombre;
      if (precioListaNum !== producto.precioUnitarioMayorista) data.precioLista = precioListaNum;
      if (!isNaN(gananciaNum) && gananciaNum !== producto.gananciaGlobal) data.gananciaGlobal = gananciaNum;
      if (precioVentaCalc !== producto.precioVenta) data.precioVenta = precioVentaCalc;
      const stockNum = parseInt(stock);
      if (!isNaN(stockNum) && stockNum !== producto.stockLocal) data.stock = stockNum;
      const loteNum = parseInt(unidadesPorBulto);
      if (!isNaN(loteNum) && loteNum > 0 && loteNum !== producto.unidadesPorBulto) data.unidadesPorBulto = loteNum;
      const divNum = parseInt(seDivideEn);
      if (!isNaN(divNum) && divNum > 0 && divNum !== producto.seDivideEn) data.seDivideEn = divNum;
      if (rubro !== (producto.rubro || "")) {
        data.rubro = rubro;
        data.categoria = rubro;
      }

      if (Object.keys(data).length === 0) {
        toast.info("No hay cambios para guardar");
        onClose();
        return;
      }

      await editarProductoMayorista(producto, data);
      toast.success("Producto actualizado");
      onSave({
        nombre: data.nombre ?? producto.nombre,
        precioUnitarioMayorista: data.precioLista ?? producto.precioUnitarioMayorista,
        precioVenta: data.precioVenta ?? producto.precioVenta,
        gananciaGlobal: data.gananciaGlobal ?? producto.gananciaGlobal,
        stockLocal: data.stock ?? producto.stockLocal,
        unidadesPorBulto: data.unidadesPorBulto ?? producto.unidadesPorBulto,
        seDivideEn: data.seDivideEn ?? producto.seDivideEn,
        rubro: data.rubro ?? producto.rubro,
      });
    } catch {
      toast.error("Error al guardar los cambios");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5 text-teal-600" />
            Editar producto
          </DialogTitle>
          <DialogDescription className="font-mono text-xs">
            {producto.codigo}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Descripción */}
          <div className="space-y-1.5">
            <Label htmlFor="edit-nombre" className="text-sm">Descripción</Label>
            <Input
              id="edit-nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="rounded-xl"
            />
          </div>

          {/* Precios */}
          <div className="rounded-xl border bg-muted/20 p-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-precio-lista" className="text-xs text-muted-foreground">Precio lista (mayorista)</Label>
                <Input
                  id="edit-precio-lista"
                  type="number"
                  min="0"
                  step="0.01"
                  value={precioLista}
                  onChange={(e) => setPrecioLista(e.target.value)}
                  className="rounded-lg h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-ganancia" className="text-xs text-muted-foreground">% Ganancia</Label>
                <Input
                  id="edit-ganancia"
                  type="number"
                  min="0"
                  step="0.5"
                  value={gananciaPorc}
                  onChange={(e) => setGananciaPorc(e.target.value)}
                  className="rounded-lg h-9 text-sm"
                />
              </div>
            </div>
            <div className="flex items-center justify-between text-sm border-t pt-2">
              <span className="text-muted-foreground">Precio de venta:</span>
              <span className={`font-bold tabular-nums text-base ${precioVentaCalc > 0 ? "text-teal-600" : "text-muted-foreground"}`}>
                {precioVentaCalc > 0 ? formatCurrency(precioVentaCalc) : "—"}
              </span>
            </div>
          </div>

          {/* Stock y lote */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-stock" className="text-xs text-muted-foreground">Stock (unidades)</Label>
              <Input
                id="edit-stock"
                type="number"
                min="0"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                className="rounded-xl h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-lote" className="text-xs text-muted-foreground">Uds. por bulto</Label>
              <Input
                id="edit-lote"
                type="number"
                min="1"
                value={unidadesPorBulto}
                onChange={(e) => setUnidadesPorBulto(e.target.value)}
                className="rounded-xl h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-divide" className="text-xs text-muted-foreground">Se divide en</Label>
              <Input
                id="edit-divide"
                type="number"
                min="1"
                value={seDivideEn}
                onChange={(e) => setSeDivideEn(e.target.value)}
                className="rounded-xl h-9 text-sm"
              />
            </div>
          </div>

          {/* Rubro */}
          <div className="space-y-1.5">
            <Label htmlFor="edit-rubro" className="text-xs text-muted-foreground">Rubro / Categoría</Label>
            <Input
              id="edit-rubro"
              value={rubro}
              onChange={(e) => setRubro(e.target.value)}
              className="rounded-xl"
              placeholder="Ej: BEBIDAS"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleGuardar} disabled={saving} className="gap-2">
            {saving ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Modal para habilitar un producto ────────────────────────────────────────
function HabilitarModal({
  producto,
  onClose,
  onConfirm,
}: {
  producto: MayoristaProducto;
  onClose: () => void;
  onConfirm: (changes: Partial<MayoristaProducto>) => void;
}) {
  const [lote, setLote] = useState(producto.unidadesPorBulto ? String(producto.unidadesPorBulto) : "");
  const [saving, setSaving] = useState(false);

  const loteNum = parseInt(lote) || 0;

  const handleConfirmar = async () => {
    if (loteNum <= 0) {
      toast.error("Ingresá un valor válido para el lote");
      return;
    }
    setSaving(true);
    try {
      await habilitarProducto(producto, loteNum);
      toast.success(`"${producto.nombre}" habilitado`);
      onConfirm({
        habilitado: true,
        unidadesPorBulto: loteNum,
      });
    } catch {
      toast.error("Error al habilitar el producto");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackagePlus className="h-5 w-5 text-teal-600" />
            Habilitar producto
          </DialogTitle>
          <DialogDescription className="font-medium text-foreground/80 line-clamp-2">
            {producto.nombre}
          </DialogDescription>
        </DialogHeader>

        {producto.productoId && producto.unidadesPorBulto && (
          <div className="rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            Valores anteriores precargados — modificalos si cambió el lote
          </div>
        )}

        <div className="space-y-4">
          {/* Precio mayorista (la ganancia se aplica global desde Productos) */}
          <div className="rounded-xl border bg-muted/20 p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Precio mayorista:</span>
              <span className="font-semibold tabular-nums">
                {formatCurrency(producto.precioUnitarioMayorista)}
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lote" className="text-sm">
              Unidades por bulto
            </Label>
            <Input
              id="lote"
              type="number"
              min="1"
              placeholder="Ej: 12"
              value={lote}
              onChange={(e) => setLote(e.target.value)}
              className="rounded-xl"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">Cuántas unidades entran en el bulto</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirmar}
            disabled={saving || loteNum <= 0}
            className="gap-2"
          >
            {saving ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            Habilitar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Dialog de actualización de precios ──────────────────────────────────────

type PriceMapping = { codigo: string; precio: string; descripcion: string };

function PriceUpdateDialog({
  open,
  onOpenChange,
  onActualizado,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onActualizado: () => Promise<void>;
  onSuccess: (res: PriceUpdateResult) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"upload" | "mapping" | "preview">("upload");
  const [columns, setColumns] = useState<ExcelColumn[]>([]);
  const [rawRows, setRawRows] = useState<unknown[][]>([]);
  const [mapping, setMapping] = useState<PriceMapping>({ codigo: "A", precio: "B", descripcion: "C" });
  const [headerRowIndex, setHeaderRowIndex] = useState(0);
  const [parsed, setParsed] = useState<PriceUpdateRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<PriceUpdateResult | null>(null);

  const reset = () => {
    setStep("upload");
    setColumns([]);
    setRawRows([]);
    setHeaderRowIndex(0);
    setParsed([]);
    setSaving(false);
    setProgress({ done: 0, total: 0 });
    setResult(null);
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
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target!.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];

        if (rows.length < 2) { toast.error("El archivo no tiene suficientes filas"); return; }

        let detectedHeader = 0;
        for (let ri = 0; ri < Math.min(rows.length, 6); ri++) {
          const row = rows[ri] as unknown[];
          const textCells = row.filter((cell) => {
            const s = cellToString(cell);
            return s.length > 0 && isNaN(Number(s));
          });
          if (textCells.length >= 2) { detectedHeader = ri; break; }
        }

        const maxCols = Math.max(...rows.slice(detectedHeader, detectedHeader + 3).map((r) => (r as unknown[]).length));
        const cols: ExcelColumn[] = [];
        for (let i = 0; i < maxCols; i++) {
          const letter = colIndexToLetter(i);
          const header = cellToString((rows[detectedHeader] as unknown[])[i]);
          const preview = rows.slice(detectedHeader + 1, detectedHeader + 4).map((r) => cellToString((r as unknown[])[i]));
          cols.push({ letter, header, preview });
        }

        // Auto-detectar mapeo
        const autoMapping: Partial<PriceMapping> = {};
        for (const col of cols) {
          const h = col.header.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          if (!autoMapping.codigo && (h.includes("codigo") || h.includes("code") || h.includes("cod") || h === "id")) autoMapping.codigo = col.letter;
          else if (!autoMapping.precio && (h.includes("precio") || h.includes("lista") || h.includes("p.u") || h.includes("costo"))) autoMapping.precio = col.letter;
          else if (!autoMapping.descripcion && (h.includes("descrip") || h.includes("nombre") || h.includes("detalle") || h.includes("articulo") || h.includes("producto"))) autoMapping.descripcion = col.letter;
        }

        setHeaderRowIndex(detectedHeader);
        setColumns(cols);
        setRawRows(rows);
        setMapping({ codigo: autoMapping.codigo || "A", precio: autoMapping.precio || "D", descripcion: autoMapping.descripcion || "C" });
        setStep("mapping");
      } catch {
        toast.error("Error al leer el archivo Excel");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const letterToIndex = (letter: string) => {
    let index = 0;
    for (let i = 0; i < letter.length; i++) index = index * 26 + (letter.charCodeAt(i) - 64);
    return index - 1;
  };

  const previewMapping = () => {
    const rows = rawRows.slice(headerRowIndex + 1);
    const result: PriceUpdateRow[] = rows
      .map((row) => {
        const r = row as unknown[];
        return {
          codigo: cellToString(r[letterToIndex(mapping.codigo)]),
          precio: cellToNumber(r[letterToIndex(mapping.precio)]),
          descripcion: cellToString(r[letterToIndex(mapping.descripcion)]),
        };
      })
      .filter((r) => r.codigo && r.precio > 0);

    if (result.length === 0) { toast.error("No se encontraron filas válidas con código y precio"); return; }
    setParsed(result);
    setStep("preview");
  };

  const confirmar = async () => {
    setSaving(true);
    setProgress({ done: 0, total: parsed.length });
    try {
      const res = await actualizarPreciosMayorista(parsed, (done, total) => setProgress({ done, total }));
      // La recarga de datos no debe bloquear el cierre del modal.
      try { await onActualizado(); } catch { /* recarga falló, no importa para el cierre */ }
      // Siempre: cerrar este modal y mostrar el modal de confirmación con el resultado.
      onSuccess(res);
      handleClose(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al actualizar precios");
    } finally {
      setSaving(false);
    }
  };

  const campos: { key: keyof PriceMapping; label: string }[] = [
    { key: "codigo", label: "Código del producto" },
    { key: "precio", label: "Precio mayorista" },
    { key: "descripcion", label: "Descripción (para productos nuevos)" },
  ];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-[95vw] max-w-xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-teal-600" />
            Actualizar precios
          </DialogTitle>
          <DialogDescription>
            {step === "upload" && "Subí el Excel del mayorista para actualizar los precios."}
            {step === "mapping" && "Indicá qué columna tiene el código y cuál el precio."}
            {step === "preview" && (result ? "Actualización completada." : "Revisá los datos antes de confirmar.")}
          </DialogDescription>
        </DialogHeader>

        {/* Steps indicator */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className={step === "upload" ? "font-bold text-foreground" : ""}>1. Archivo</span>
          <ArrowRight className="h-3 w-3" />
          <span className={step === "mapping" ? "font-bold text-foreground" : ""}>2. Columnas</span>
          <ArrowRight className="h-3 w-3" />
          <span className={step === "preview" ? "font-bold text-foreground" : ""}>3. Confirmar</span>
        </div>

        {step === "upload" && (
          <label className="flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-2xl cursor-pointer hover:border-teal-400 hover:bg-teal-50/30 transition-all">
            <Upload className="h-10 w-10 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">
              Hacé clic para seleccionar un archivo .xlsx
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1">Solo necesita código y precio</p>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              accept=".xlsx,.xls"
              onChange={handleFile}
            />
          </label>
        )}

        {step === "mapping" && (
          <div className="space-y-4">
            {campos.map(({ key, label }) => (
              <div key={key} className="space-y-1">
                <Label className="text-xs font-medium">{label}</Label>
                <Select value={mapping[key]} onValueChange={(v) => setMapping((p) => ({ ...p, [key]: v }))}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {columns.map((col) => (
                      <SelectItem key={col.letter} value={col.letter}>
                        <span className="font-mono text-xs mr-2">{col.letter}</span>
                        {col.header || "(sin encabezado)"}{" "}
                        <span className="text-muted-foreground text-xs">— {col.preview[0]}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("upload")}>Volver</Button>
              <Button onClick={previewMapping} className="gap-2"><ArrowRight className="h-4 w-4" /> Vista previa</Button>
            </DialogFooter>
          </div>
        )}

        {step === "preview" && !result && (
          <div className="space-y-4">
            <div className="rounded-xl border overflow-hidden max-h-60 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Código</th>
                    <th className="text-right px-3 py-2 font-medium">Precio</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {parsed.slice(0, 50).map((row, i) => (
                    <tr key={i}>
                      <td className="px-3 py-1.5 font-mono">{row.codigo}</td>
                      <td className="px-3 py-1.5 text-right">{formatCurrency(row.precio)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {parsed.length > 50 && (
              <p className="text-xs text-muted-foreground text-center">Mostrando 50 de {parsed.length} filas</p>
            )}
            <p className="text-sm">
              Se van a buscar <strong>{parsed.length}</strong> códigos y actualizar sus precios.
              Los que no estén en el sistema se <strong>agregan como productos nuevos</strong> (deshabilitados).
            </p>
            {saving && (
              <div className="space-y-1">
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-teal-500 transition-all" style={{ width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%` }} />
                </div>
                <p className="text-xs text-muted-foreground text-center">{progress.done} / {progress.total}</p>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("mapping")} disabled={saving}>Volver</Button>
              <Button onClick={confirmar} disabled={saving} className="gap-2">
                {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {saving ? "Actualizando..." : "Actualizar precios"}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "preview" && result && (
          <div className="space-y-4">
            {/* Confirmación verificada contra la base de datos */}
            {result.discrepancias.length === 0 ? (
              <div className="flex items-start gap-3 p-4 rounded-2xl bg-emerald-50 border border-emerald-200">
                <div className="flex items-center justify-center h-9 w-9 shrink-0 rounded-full bg-emerald-100">
                  <Check className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-emerald-800">Precios actualizados y verificados</p>
                  <p className="text-xs text-emerald-700 mt-0.5">
                    Se confirmó leyendo la base de datos que los <strong>{result.verificados}</strong> precios
                    quedaron guardados correctamente. Está todo bien.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-300">
                <div className="flex items-center justify-center h-9 w-9 shrink-0 rounded-full bg-amber-100">
                  <AlertCircle className="h-5 w-5 text-amber-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-amber-800">Verificación con diferencias</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    {result.verificados} precios quedaron correctos, pero <strong>{result.discrepancias.length}</strong> no
                    coincidieron tras guardar. Revisalos abajo y volvé a intentar.
                  </p>
                  <div className="mt-2 rounded-lg border border-amber-200 bg-white/60 max-h-32 overflow-y-auto text-[11px]">
                    {result.discrepancias.slice(0, 10).map((d, i) => (
                      <div key={i} className="flex items-center justify-between px-2 py-1 border-b border-amber-100 last:border-0">
                        <span className="font-mono">{d.codigo}</span>
                        <span className="text-muted-foreground">
                          esperado {formatCurrency(d.esperado)} · real {d.real != null ? formatCurrency(d.real) : "—"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-xl bg-teal-50 border border-teal-200 text-center">
                <p className="text-2xl font-bold text-teal-700">{result.actualizados}</p>
                <p className="text-[10px] text-teal-600 font-medium">Precios mayorista</p>
              </div>
              <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-center">
                <p className="text-2xl font-bold text-blue-700">{result.preciosVentaActualizados}</p>
                <p className="text-[10px] text-blue-600 font-medium">Precios venta</p>
              </div>
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-center">
                <p className="text-2xl font-bold text-amber-700">{result.sinMatch}</p>
                <p className="text-[10px] text-amber-600 font-medium">Sin match</p>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => handleClose(false)}>Cerrar</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Dialog de importación Excel ─────────────────────────────────────────────
function ExcelImportDialog({
  open,
  onOpenChange,
  onImportado,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImportado: () => Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"upload" | "mapping" | "preview">("upload");
  const [columns, setColumns] = useState<ExcelColumn[]>([]);
  const [rawRows, setRawRows] = useState<unknown[][]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({
    codigoBarras: "A",
    codigo: "B",
    nombre: "C",
    precioUnitario: "D",
    rubro: "E",
    subrubro: "F",
  });
  const [headerRowIndex, setHeaderRowIndex] = useState(0);
  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const reset = () => {
    setStep("upload");
    setColumns([]);
    setRawRows([]);
    setHeaderRowIndex(0);
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
    reader.onload = (ev) => {
      try {
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

        // Auto-detectar fila de encabezados: primera fila con 4+ celdas de texto no numérico
        let detectedHeader = 0;
        for (let ri = 0; ri < Math.min(rows.length, 6); ri++) {
          const row = rows[ri] as unknown[];
          const textCells = row.filter((cell) => {
            const s = cellToString(cell);
            return s.length > 0 && isNaN(Number(s));
          });
          if (textCells.length >= 4) {
            detectedHeader = ri;
            break;
          }
        }

        const maxCols = Math.max(...rows.slice(detectedHeader, detectedHeader + 3).map((r) => (r as unknown[]).length));
        const cols: ExcelColumn[] = [];
        for (let i = 0; i < maxCols; i++) {
          const letter = colIndexToLetter(i);
          const header = cellToString((rows[detectedHeader] as unknown[])[i]);
          const preview = rows
            .slice(detectedHeader + 1, detectedHeader + 4)
            .map((r) => cellToString((r as unknown[])[i]));
          cols.push({ letter, header, preview });
        }

        // Auto-detectar mapeo desde headers
        const autoMapping: Partial<ColumnMapping> = {};
        for (const col of cols) {
          const h = col.header.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          if (!autoMapping.codigoBarras && (h.includes("barra") || h.includes("ean") || h.includes("upc"))) autoMapping.codigoBarras = col.letter as ColumnLetter;
          else if (!autoMapping.codigo && (h.includes("codigo") || h.includes("code") || h.includes("cod") || h === "id")) autoMapping.codigo = col.letter as ColumnLetter;
          else if (!autoMapping.nombre && (h.includes("descripcion") || h.includes("nombre") || h.includes("producto") || h.includes("articulo"))) autoMapping.nombre = col.letter as ColumnLetter;
          else if (!autoMapping.precioUnitario && (h.includes("precio") || h.includes("lista") || h.includes("p.u") || h.includes("costo"))) autoMapping.precioUnitario = col.letter as ColumnLetter;
          else if (!autoMapping.rubro && h.includes("rubro")) autoMapping.rubro = col.letter as ColumnLetter;
          else if (!autoMapping.subrubro && h.includes("subrubro")) autoMapping.subrubro = col.letter as ColumnLetter;
        }

        setHeaderRowIndex(detectedHeader);
        setColumns(cols);
        setRawRows(rows);
        setMapping((prev) => ({
          codigoBarras: autoMapping.codigoBarras || autoMapping.codigo || prev.codigoBarras,
          codigo: autoMapping.codigo || prev.codigo,
          nombre: autoMapping.nombre || prev.nombre,
          precioUnitario: autoMapping.precioUnitario || prev.precioUnitario,
          rubro: autoMapping.rubro || prev.rubro,
          subrubro: autoMapping.subrubro || prev.subrubro,
        }));
        setStep("mapping");
      } catch {
        toast.error("Error al leer el archivo Excel");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const previewMapping = () => {
    const letterToIndex = (letter: string) => {
      let index = 0;
      for (let i = 0; i < letter.length; i++) {
        index = index * 26 + (letter.charCodeAt(i) - 64);
      }
      return index - 1;
    };

    const rows = rawRows.slice(headerRowIndex + 1);
    const result: ParsedRow[] = rows
      .map((row) => {
        const r = row as unknown[];
        const rubro = cellToString(r[letterToIndex(mapping.rubro)]);
        return {
          codigoBarras: cellToString(r[letterToIndex(mapping.codigoBarras)]),
          codigo: cellToString(r[letterToIndex(mapping.codigo)]),
          nombre: cellToString(r[letterToIndex(mapping.nombre)]),
          precioUnitarioMayorista: cellToNumber(r[letterToIndex(mapping.precioUnitario)]),
          rubro,
          subrubro: cellToString(r[letterToIndex(mapping.subrubro)]),
          unidadesPorBulto: 1,
          // Categoría = rubro (son lo mismo)
          categoria: rubro || "Sin categoría",
        };
      })
      // Excluir filas vacías Y filas de encabezado (precio = 0 y sin código numérico real)
      .filter((r) => {
        if (!r.codigo && !r.nombre && r.precioUnitarioMayorista === 0) return false; // fila vacía
        if (!r.codigo) { console.log('[Mayorista] Fila descartada sin código:', r.nombre); return false; }
        if (!r.nombre) { console.log('[Mayorista] Fila descartada sin nombre:', r.codigo); return false; }
        if (r.precioUnitarioMayorista < 0) { console.log('[Mayorista] Fila descartada precio negativo:', r.codigo, r.nombre); return false; }
        return true;
      });

    console.log(`[Mayorista] ${rows.length} filas en Excel → ${result.length} válidas después del filtro`);

    if (result.length === 0) {
      toast.error("No se encontraron filas válidas con el mapeo actual");
      return;
    }
    setParsed(result);
    setStep("preview");
  };

  const confirmar = async () => {
    setSaving(true);
    setProgress({ done: 0, total: parsed.length });
    try {
      await upsertMayoristaProductos(parsed, (done, total) =>
        setProgress({ done, total })
      );
      await onImportado();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al importar los productos");
    } finally {
      setSaving(false);
    }
  };

  const camposRequeridos: { key: keyof ColumnMapping; label: string; required?: boolean }[] = [
    { key: "codigo", label: "Código", required: true },
    { key: "nombre", label: "Descripción / Nombre", required: true },
    { key: "precioUnitario", label: "Precio", required: true },
    { key: "codigoBarras", label: "Código de barras (opcional)" },
    { key: "rubro", label: "Rubro (opcional)" },
    { key: "subrubro", label: "Subrubro (opcional)" },
  ];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-[95vw] max-w-xl sm:max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-teal-600" />
            Importar lista de precios
          </DialogTitle>
          <DialogDescription>
            {step === "upload" && "Seleccioná el archivo Excel con la lista del mayorista."}
            {step === "mapping" && "Indicá qué columna del Excel corresponde a cada campo."}
            {step === "preview" && "Revisá los datos antes de confirmar la importación."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className={step === "upload" ? "font-bold text-foreground" : ""}>1. Archivo</span>
          <ArrowRight className="h-3 w-3" />
          <span className={step === "mapping" ? "font-bold text-foreground" : ""}>2. Mapeo</span>
          <ArrowRight className="h-3 w-3" />
          <span className={step === "preview" ? "font-bold text-foreground" : ""}>3. Confirmar</span>
        </div>

        {step === "upload" && (
          <div className="space-y-4">
            <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed rounded-2xl cursor-pointer hover:border-teal-500 hover:bg-teal-50/5 transition-colors">
              <Upload className="h-10 w-10 text-muted-foreground/40 mb-2" />
              <span className="text-sm font-medium text-muted-foreground">
                Hacé clic para seleccionar un archivo .xlsx
              </span>
              <span className="text-xs text-muted-foreground/60 mt-1">
                Columnas esperadas: A=Cód.barras, B=Código, C=Nombre, D=Precio, E=Rubro, F=Subrubro
              </span>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={handleFile}
              />
            </label>
            <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/30 rounded-xl p-3">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-500" />
              <span>
                Los datos existentes (precio de venta, stock, habilitados) se conservarán.
                El código del producto se usa para identificar si ya existe.
              </span>
            </div>
          </div>
        )}

        {step === "mapping" && (
          <div className="space-y-4">
            <div className="text-xs text-muted-foreground bg-muted/30 rounded-xl p-3">
              Se detectaron <strong>{columns.length} columnas</strong>. Asigná cada campo a su columna.
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {camposRequeridos.map(({ key, label }) => (
                <div key={key} className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{label}</Label>
                  <Select
                    value={mapping[key]}
                    onValueChange={(v) =>
                      setMapping((prev) => ({ ...prev, [key]: v }))
                    }
                  >
                    <SelectTrigger className="rounded-xl h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-64">
                      {columns.map((col) => (
                        <SelectItem key={col.letter} value={col.letter}>
                          <span className="font-mono font-bold text-teal-600 mr-1.5">{col.letter}</span>
                          <span className="text-xs text-muted-foreground truncate max-w-[180px]">
                            {col.header || col.preview.filter(Boolean)[0] || "—"}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            {/* Preview del archivo */}
            <div className="rounded-xl border overflow-hidden text-xs">
              <p className="bg-muted/50 px-3 py-1.5 font-medium text-muted-foreground border-b">
                Vista previa — fila encabezado + primeras 5 filas de datos
              </p>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-teal-50/50 dark:bg-teal-950/20">
                      <th className="px-2 py-1.5 text-left border-r whitespace-nowrap font-mono text-muted-foreground">#</th>
                      {columns.slice(0, 8).map((col) => (
                        <th key={col.letter} className="px-2 py-1.5 text-left border-r last:border-r-0 whitespace-nowrap">
                          <span className="font-mono font-bold text-teal-600">{col.letter}</span>
                          {col.header && (
                            <span className="block text-muted-foreground font-normal truncate max-w-[80px]">{col.header}</span>
                          )}
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
              Se van a importar <strong>{parsed.length} productos</strong>.
              Los precios de venta, stock y productos habilitados se conservarán.
            </div>

            <div className="rounded-xl border overflow-hidden">
              <div className="overflow-x-auto max-h-64 sm:max-h-52">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-left px-2 py-2 font-semibold whitespace-nowrap">#</th>
                      <th className="text-left px-2 py-2 font-semibold whitespace-nowrap">Cód.barras</th>
                      <th className="text-left px-2 py-2 font-semibold">Código</th>
                      <th className="text-left px-2 py-2 font-semibold">Nombre</th>
                      <th className="text-right px-2 py-2 font-semibold whitespace-nowrap">Precio</th>
                      <th className="text-left px-2 py-2 font-semibold hidden sm:table-cell">Rubro</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {parsed.slice(0, 200).map((row, i) => (
                      <tr key={i} className="hover:bg-muted/20">
                        <td className="px-2 py-1 font-mono text-muted-foreground whitespace-nowrap">{i + 1}</td>
                        <td className="px-2 py-1 font-mono text-muted-foreground whitespace-nowrap">{row.codigoBarras || "—"}</td>
                        <td className="px-2 py-1 font-mono text-muted-foreground whitespace-nowrap">{row.codigo}</td>
                        <td className="px-2 py-1 max-w-[140px] truncate">{row.nombre}</td>
                        <td className="px-2 py-1 text-right text-teal-600 font-semibold whitespace-nowrap">
                          {formatCurrency(row.precioUnitarioMayorista)}
                        </td>
                        <td className="px-2 py-1 whitespace-nowrap hidden sm:table-cell">{row.rubro || "—"}</td>
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

            {saving && progress.total > 0 && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Guardando en Firestore...</span>
                  <span className="font-medium tabular-nums">
                    {progress.done} / {progress.total}
                  </span>
                </div>
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-teal-500 rounded-full transition-all duration-300"
                    style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex justify-between gap-2">
              <Button
                variant="outline"
                className="rounded-xl"
                onClick={() => setStep("mapping")}
                disabled={saving}
              >
                Volver
              </Button>
              <Button
                className="rounded-xl gap-2"
                onClick={confirmar}
                disabled={saving}
              >
                {saving ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    {progress.total > 0
                      ? `${Math.round((progress.done / progress.total) * 100)}%`
                      : "Preparando..."}
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    Confirmar importación
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
