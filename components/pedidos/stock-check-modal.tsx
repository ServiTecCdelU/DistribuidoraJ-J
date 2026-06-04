"use client";

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, CheckCircle, Package, Repeat, Loader2, X, Minus, Plus, Search } from "lucide-react";

export interface StockCheckItem {
  productId: string;
  name: string;
  quantity: number;
  stock: number;
}

export interface ReplacementOption {
  productId: string;
  name: string;
  price: number;
  stock: number;
  codigo?: string;
}

interface StockCheckModalProps {
  open: boolean;
  onClose: () => void;
  items: StockCheckItem[];
  onConfirm: (
    excludeProductIds: string[],
    replacements: Record<string, ReplacementOption>,
    quantities: Record<string, number>,
  ) => void;
  // Busca productos del mismo tipo (otra marca) con stock para reemplazar el faltante
  findReplacements?: (item: StockCheckItem) => Promise<ReplacementOption[]>;
  // Búsqueda libre por nombre/código para reemplazar el faltante
  searchReplacements?: (query: string, item: StockCheckItem) => Promise<ReplacementOption[]>;
}

function QtyStepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, value - 1))}
        className="h-6 w-6 flex items-center justify-center rounded-md border bg-white text-gray-600 hover:bg-gray-50"
      >
        <Minus className="h-3 w-3" />
      </button>
      <input
        type="number"
        min={1}
        value={value}
        onChange={(e) => {
          const v = parseInt(e.target.value, 10);
          onChange(Number.isNaN(v) || v < 1 ? 1 : v);
        }}
        className="h-6 w-11 text-center text-xs font-semibold border rounded-md bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        className="h-6 w-6 flex items-center justify-center rounded-md border bg-white text-gray-600 hover:bg-gray-50"
      >
        <Plus className="h-3 w-3" />
      </button>
    </div>
  );
}

export function StockCheckModal({ open, onClose, items, onConfirm, findReplacements, searchReplacements }: StockCheckModalProps) {
  // Faltantes que el usuario marca para incluir igual (sabe que físicamente sí están)
  const [incluirIgual, setIncluirIgual] = React.useState<Set<string>>(new Set());
  // Reemplazos elegidos: productId original -> opción de otra marca
  const [replacements, setReplacements] = React.useState<Record<string, ReplacementOption>>({});
  // Cantidades editables: productId -> cantidad
  const [quantities, setQuantities] = React.useState<Record<string, number>>({});
  // Panel de opciones abierto para un faltante + sus opciones cargadas
  const [openFor, setOpenFor] = React.useState<string | null>(null);
  const [options, setOptions] = React.useState<ReplacementOption[]>([]);
  const [loadingOpts, setLoadingOpts] = React.useState(false);
  // Búsqueda libre dentro del panel de reemplazo
  const [searchText, setSearchText] = React.useState("");
  const [searchResults, setSearchResults] = React.useState<ReplacementOption[]>([]);
  const [searching, setSearching] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setIncluirIgual(new Set());
      setReplacements({});
      setQuantities(Object.fromEntries(items.map((i) => [i.productId, i.quantity])));
      setOpenFor(null);
      setOptions([]);
      setSearchText("");
      setSearchResults([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Debounce de la búsqueda libre para el faltante abierto
  React.useEffect(() => {
    if (!openFor || !searchReplacements) return;
    const item = items.find((i) => i.productId === openFor);
    if (!item) return;
    if (searchText.trim().length < 2) { setSearchResults([]); setSearching(false); return; }
    setSearching(true);
    const handler = setTimeout(async () => {
      try {
        const res = await searchReplacements(searchText, { ...item, quantity: qtyOf(item.productId) });
        setSearchResults(res);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText, openFor]);

  const qtyOf = (id: string) => quantities[id] ?? items.find((i) => i.productId === id)?.quantity ?? 1;
  const setQty = (id: string, v: number) => setQuantities((prev) => ({ ...prev, [id]: Math.max(1, v) }));

  // Categorías recalculadas según la cantidad editada (bajar la cantidad puede cubrir el faltante)
  const sinStock = items.filter((i) => i.stock < qtyOf(i.productId));
  const conStock = items.filter((i) => i.stock >= qtyOf(i.productId));

  const toggleIncluir = (id: string) => {
    setIncluirIgual((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const abrirReemplazo = async (item: StockCheckItem) => {
    if (openFor === item.productId) {
      setOpenFor(null);
      return;
    }
    setOpenFor(item.productId);
    setOptions([]);
    setSearchText("");
    setSearchResults([]);
    if (!findReplacements) return;
    setLoadingOpts(true);
    try {
      const opts = await findReplacements({ ...item, quantity: qtyOf(item.productId) });
      setOptions(opts);
    } catch {
      setOptions([]);
    } finally {
      setLoadingOpts(false);
    }
  };

  const elegirReemplazo = (originalId: string, opt: ReplacementOption) => {
    setReplacements((prev) => ({ ...prev, [originalId]: opt }));
    // al reemplazar, desmarcar "incluir igual" si lo tenía
    setIncluirIgual((prev) => {
      if (!prev.has(originalId)) return prev;
      const next = new Set(prev);
      next.delete(originalId);
      return next;
    });
    setOpenFor(null);
  };

  const quitarReemplazo = (originalId: string) => {
    setReplacements((prev) => {
      const next = { ...prev };
      delete next[originalId];
      return next;
    });
  };

  // Se excluyen los faltantes que NO se incluyen ni se reemplazan
  const excluidos = sinStock
    .filter((i) => !incluirIgual.has(i.productId) && !replacements[i.productId])
    .map((i) => i.productId);
  const incluidosManual = incluirIgual.size;
  const reemplazados = Object.keys(replacements).length;
  const hayAlgoParaGenerar = conStock.length > 0 || incluidosManual > 0 || reemplazados > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl w-[calc(100vw-1rem)] max-h-[80vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="p-4 pb-3 border-b shrink-0">
          <DialogTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Verificar remito
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* Sin stock */}
          {sinStock.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Package className="h-3.5 w-3.5" />
                Sin stock suficiente ({sinStock.length})
              </p>
              <div className="space-y-1.5">
                {sinStock.map((item) => {
                  const marcado = incluirIgual.has(item.productId);
                  const reemplazo = replacements[item.productId];
                  const abierto = openFor === item.productId;
                  const verde = marcado || !!reemplazo;
                  return (
                    <div
                      key={item.productId}
                      className={`border rounded-xl text-sm transition-colors ${
                        verde ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 px-3 py-2">
                        <label className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer">
                          <Checkbox
                            checked={marcado}
                            onCheckedChange={() => toggleIncluir(item.productId)}
                            disabled={!!reemplazo}
                          />
                          <span className={`font-medium truncate ${verde ? "text-emerald-800" : "text-red-800"}`}>
                            {item.name}
                          </span>
                        </label>
                        <div className="flex items-center gap-2">
                          <QtyStepper value={qtyOf(item.productId)} onChange={(v) => setQty(item.productId, v)} />
                          <span className={`text-[11px] whitespace-nowrap ${verde ? "text-emerald-600" : "text-red-600"}`}>
                            stock {item.stock}
                          </span>
                        </div>
                      </div>

                      {/* Reemplazo elegido */}
                      {reemplazo ? (
                        <div className="flex items-center gap-2 px-3 pb-2">
                          <Repeat className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                          <span className="text-xs text-emerald-700 truncate flex-1">
                            Reemplazado por: <span className="font-semibold">{reemplazo.name}</span>
                          </span>
                          <button
                            onClick={() => quitarReemplazo(item.productId)}
                            className="text-emerald-600 hover:text-emerald-800"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        findReplacements && (
                          <div className="px-3 pb-2">
                            <button
                              onClick={() => abrirReemplazo(item)}
                              className="text-xs text-cyan-700 hover:text-cyan-900 font-medium flex items-center gap-1"
                            >
                              <Repeat className="h-3.5 w-3.5" />
                              {abierto ? "Cerrar" : "Reemplazar por otra marca"}
                            </button>

                            {abierto && (
                              <div className="mt-1.5 border border-cyan-200 rounded-lg bg-white overflow-hidden">
                                {/* Búsqueda libre */}
                                {searchReplacements && (
                                  <div className="p-2 border-b border-cyan-100">
                                    <div className="relative">
                                      <Search className="h-3.5 w-3.5 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2" />
                                      <input
                                        type="text"
                                        autoFocus
                                        value={searchText}
                                        onChange={(e) => setSearchText(e.target.value)}
                                        placeholder="Buscar otro producto por nombre o código…"
                                        className="w-full h-7 pl-7 pr-2 text-xs border rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-cyan-400"
                                      />
                                    </div>
                                  </div>
                                )}

                                {searchText.trim().length >= 2 ? (
                                  searching ? (
                                    <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      Buscando…
                                    </div>
                                  ) : searchResults.length === 0 ? (
                                    <div className="py-3 text-center text-xs text-muted-foreground">
                                      Sin resultados con stock
                                    </div>
                                  ) : (
                                    <div className="max-h-40 overflow-y-auto divide-y divide-gray-100">
                                      {searchResults.map((opt) => (
                                        <button
                                          key={opt.productId}
                                          onClick={() => elegirReemplazo(item.productId, opt)}
                                          className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-cyan-50"
                                        >
                                          <span className="text-xs font-medium text-gray-800 truncate">{opt.name}</span>
                                          <span className="text-[11px] text-green-600 whitespace-nowrap">
                                            stock {opt.stock}
                                          </span>
                                        </button>
                                      ))}
                                    </div>
                                  )
                                ) : loadingOpts ? (
                                  <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    Buscando alternativas…
                                  </div>
                                ) : options.length === 0 ? (
                                  <div className="py-3 text-center text-xs text-muted-foreground">
                                    Sin alternativas con stock — buscá arriba
                                  </div>
                                ) : (
                                  <div className="max-h-40 overflow-y-auto divide-y divide-gray-100">
                                    {options.map((opt) => (
                                      <button
                                        key={opt.productId}
                                        onClick={() => elegirReemplazo(item.productId, opt)}
                                        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-cyan-50"
                                      >
                                        <span className="text-xs font-medium text-gray-800 truncate">{opt.name}</span>
                                        <span className="text-[11px] text-green-600 whitespace-nowrap">
                                          stock {opt.stock}
                                        </span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5">
                Ajustá la cantidad, tildá si tenés stock físico aunque el sistema no lo registre, o reemplazá por otra marca con stock.
              </p>
            </div>
          )}

          {/* Con stock */}
          {conStock.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <CheckCircle className="h-3.5 w-3.5" />
                Con stock ({conStock.length})
              </p>
              <div className="space-y-1.5">
                {conStock.map((item) => (
                  <div key={item.productId} className="flex items-center justify-between gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-xl text-sm">
                    <span className="font-medium text-green-800 truncate flex-1">{item.name}</span>
                    <div className="flex items-center gap-2">
                      <QtyStepper value={qtyOf(item.productId)} onChange={(v) => setQty(item.productId, v)} />
                      <span className="text-[11px] text-green-600 whitespace-nowrap">stock {item.stock}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="p-4 pt-3 border-t space-y-2 shrink-0">
          {hayAlgoParaGenerar ? (
            <Button className="w-full" onClick={() => onConfirm(excluidos, replacements, quantities)}>
              {excluidos.length > 0 ? "Generar remito sin los faltantes" : "Generar remito"}
            </Button>
          ) : (
            <p className="text-sm text-center text-red-600 font-medium">No hay productos con stock disponible</p>
          )}
          <Button variant="outline" className="w-full" onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
