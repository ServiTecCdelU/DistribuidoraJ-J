"use client";

import React, { useEffect, useState, useRef } from "react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import type { Product } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Loader2, Upload, ImageIcon, X, Plus, PackagePlus, PackageMinus, Pencil } from "lucide-react";

const DEFAULT_IMAGE = "/logo.png";

const DEFAULT_CATEGORIES: string[] = [];

const DEFAULT_MARCAS = [
  "MIO",
  "YO HELADERIAS",
  "TARGET",
  "CARCARAÑA",
  "FRIAR",
  "MC CAIN",
  "RESTAURANT",
  "SIMPLOT",
  "Sin identificar",
];

export interface StockAdjustment {
  type: "add" | "remove";
  quantity: number;
  reason: string;
  // Solo true si el "quitar" es una pérdida real (rotura/vencido) que debe ir a caja.
  isLoss?: boolean;
}

interface ProductModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product | null;
  onSave: (product: Omit<Product, "id" | "createdAt">, stockAdjustment?: StockAdjustment) => Promise<void>;
  /** Renombra un rubro existente en todos los productos que lo usan */
  onRenameCategory?: (oldName: string, newName: string) => Promise<void>;
  availableCategories?: string[];
  availableMarcas?: string[];
  /** Mobile: acción de habilitar/deshabilitar dentro del modal de edición */
  onToggleDisabled?: () => void;
  isDisabled?: boolean;
  /** Sugiere un código único para un producto nuevo */
  onSuggestCodigo?: () => Promise<string>;
}

export function ProductModal({
  open,
  onOpenChange,
  product,
  onSave,
  onRenameCategory,
  availableCategories,
  availableMarcas,
  onToggleDisabled,
  isDisabled,
  onSuggestCodigo,
}: ProductModalProps) {
  const [loading, setLoading] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [marcas, setMarcas] = useState<string[]>(DEFAULT_MARCAS);

  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const [newCategoryInput, setNewCategoryInput] = useState("");
  const [showEditCategories, setShowEditCategories] = useState(false);
  const [editingCatOld, setEditingCatOld] = useState<string | null>(null);
  const [editingCatValue, setEditingCatValue] = useState("");
  const [renamingCat, setRenamingCat] = useState(false);
  const [showNewMarcaInput, setShowNewMarcaInput] = useState(false);
  const [newMarcaInput, setNewMarcaInput] = useState("");

  // Ajuste de stock (solo en edición)
  const [stockAdjustType, setStockAdjustType] = useState<"add" | "remove">("add");
  const [stockAdjustQty, setStockAdjustQty] = useState(0);
  const [stockAdjustReason, setStockAdjustReason] = useState("");
  // Por defecto quitar stock es solo un ajuste de inventario (NO va a caja).
  // Si es una pérdida real (rotura/vencido), se activa este toggle para registrarla en caja.
  const [stockAdjustIsLoss, setStockAdjustIsLoss] = useState(false);

  // Lote (solo para productos de mayorista: id empieza con "prod_")
  const [lote, setLote] = useState<string>("");

  // Precio base (costo) + % ganancia (productos manuales, no mayorista)
  const [precioBase, setPrecioBase] = useState<string>("");
  const [ganancia, setGanancia] = useState<string>("");

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    price: 0,
    stock: 0,
    imageUrl: "",
    category: "",
    marca: "Sin identificar" as string,
    sinTacc: false,
    codigo: "",
  });
  const [suggestingCodigo, setSuggestingCodigo] = useState(false);

  useEffect(() => {
    const cats = availableCategories
      ? [...new Set([...DEFAULT_CATEGORIES, ...availableCategories])]
      : DEFAULT_CATEGORIES;
    const mrs = availableMarcas
      ? [...new Set([...DEFAULT_MARCAS, ...availableMarcas])]
      : DEFAULT_MARCAS;
    setCategories(cats);
    setMarcas(mrs);
  }, [availableCategories, availableMarcas]);

  useEffect(() => {
    if (!open) {
      setImagePreview(null);
      setShowNewCategoryInput(false);
      setShowNewMarcaInput(false);
      setNewCategoryInput("");
      setNewMarcaInput("");
      setShowEditCategories(false);
      setEditingCatOld(null);
      setEditingCatValue("");
      setStockAdjustType("add");
      setStockAdjustQty(0);
      setStockAdjustReason("");
      setLote("");
      setPrecioBase("");
      setGanancia("");
    }
  }, [open]);

  useEffect(() => {
    if (product) {
      setFormData({
        name: product.name || "",
        description: product.description || "",
        price: product.price,
        stock: product.stock,
        imageUrl: product.imageUrl || "",
        category: product.category,
        marca: (product as any).marca || "Sin identificar",
        sinTacc: (product as any).sinTacc || false,
        codigo: (product as any).codigo || "",
      });
      setImagePreview(product.imageUrl || null);
      setStockAdjustType("add");
      setStockAdjustQty(0);
      setStockAdjustReason("");
      setLote((product as any).unidadesPorBulto ? String((product as any).unidadesPorBulto) : "");

      // Precio base + % a aplicar
      if (product.precioBase != null) {
        setPrecioBase(String(product.precioBase));
        setGanancia(product.gananciaGlobal != null ? String(product.gananciaGlobal) : "0");
      } else if (product.gananciaGlobal != null && product.gananciaGlobal > 0 && product.price > 0) {
        const baseDerivado = Math.round((product.price / (1 + product.gananciaGlobal / 100)) * 100) / 100;
        setPrecioBase(String(baseDerivado));
        setGanancia(String(product.gananciaGlobal));
      } else if (product.price > 0) {
        setPrecioBase(String(product.price));
        setGanancia("0");
      } else {
        setPrecioBase("");
        setGanancia("");
      }
    } else {
      setFormData({
        name: "",
        description: "",
        price: 0,
        stock: 0,
        imageUrl: "",
        category: "",
        marca: "Sin identificar",
        sinTacc: false,
        codigo: "",
      });
      setImagePreview(null);
      setStockAdjustType("add");
      setStockAdjustQty(0);
      setStockAdjustReason("");
      setLote("");
      setPrecioBase("");
      setGanancia("");
    }
  }, [product, open]);

  // Al abrir para crear un producto nuevo, sugerir un código único libre.
  useEffect(() => {
    if (open && !product && onSuggestCodigo) {
      let cancelled = false;
      setSuggestingCodigo(true);
      onSuggestCodigo()
        .then((codigo) => {
          if (!cancelled) setFormData((prev) => ({ ...prev, codigo }));
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setSuggestingCodigo(false);
        });
      return () => { cancelled = true; };
    }
  }, [open, product, onSuggestCodigo]);

  const addNewCategory = () => {
    const trimmed = newCategoryInput.trim();
    if (!trimmed) return;
    setCategories((prev) => [...new Set([...prev, trimmed])]);
    setFormData((prev) => ({ ...prev, category: trimmed }));
    setNewCategoryInput("");
    setShowNewCategoryInput(false);
  };

  const saveRenameCategory = async () => {
    const trimmed = editingCatValue.trim();
    if (!trimmed || !editingCatOld || trimmed === editingCatOld) {
      setEditingCatOld(null);
      setEditingCatValue("");
      return;
    }
    if (!onRenameCategory) return;
    setRenamingCat(true);
    try {
      const oldName = editingCatOld;
      await onRenameCategory(oldName, trimmed);
      setCategories((prev) => [...new Set(prev.map((c) => (c === oldName ? trimmed : c)))]);
      setFormData((prev) =>
        prev.category === oldName ? { ...prev, category: trimmed } : prev,
      );
      setEditingCatOld(null);
      setEditingCatValue("");
    } finally {
      setRenamingCat(false);
    }
  };

  const renderCategoryEditor = () =>
    showEditCategories ? (
      <div className="space-y-1.5 rounded-lg border border-border bg-muted/20 p-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">Editar rubros existentes</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => {
              setShowEditCategories(false);
              setEditingCatOld(null);
              setEditingCatValue("");
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="max-h-44 overflow-y-auto space-y-1">
          {categories.length === 0 && (
            <p className="px-2 py-1 text-xs text-muted-foreground">No hay rubros para editar.</p>
          )}
          {categories.map((cat) =>
            editingCatOld === cat ? (
              <div key={cat} className="flex gap-1.5">
                <Input
                  value={editingCatValue}
                  onChange={(e) => setEditingCatValue(e.target.value)}
                  className="h-9 text-sm"
                  autoFocus
                  disabled={renamingCat}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); saveRenameCategory(); }
                    if (e.key === "Escape") { setEditingCatOld(null); setEditingCatValue(""); }
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  className="h-9 px-2.5"
                  onClick={saveRenameCategory}
                  disabled={renamingCat || !editingCatValue.trim()}
                >
                  {renamingCat ? <Loader2 className="h-4 w-4 animate-spin" /> : "OK"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => { setEditingCatOld(null); setEditingCatValue(""); }}
                  disabled={renamingCat}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div
                key={cat}
                className="flex items-center justify-between gap-2 rounded-md px-2 py-1 hover:bg-muted/50"
              >
                <span className="text-sm truncate">{cat}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 flex-shrink-0"
                  onClick={() => { setEditingCatOld(cat); setEditingCatValue(cat); }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </div>
            ),
          )}
        </div>
      </div>
    ) : null;

  const addNewMarca = () => {
    const trimmed = newMarcaInput.trim();
    if (!trimmed) return;
    setMarcas((prev) => [...new Set([...prev, trimmed])]);
    setFormData((prev) => ({ ...prev, marca: trimmed }));
    setNewMarcaInput("");
    setShowNewMarcaInput(false);
  };

  const calcPrecioVenta = (base: number, pct: number): number =>
    base > 0 ? Math.round(base * (1 + pct / 100) * 100) / 100 : 0;

  const handleBaseChange = (val: string) => {
    setPrecioBase(val);
    const b = parseFloat(val) || 0;
    const g = parseFloat(ganancia) || 0;
    setFormData((prev) => ({ ...prev, price: calcPrecioVenta(b, g) }));
  };

  const handleGananciaChange = (val: string) => {
    setGanancia(val);
    const b = parseFloat(precioBase) || 0;
    const g = parseFloat(val) || 0;
    setFormData((prev) => ({ ...prev, price: b > 0 ? calcPrecioVenta(b, g) : prev.price }));
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const base64 = await fileToBase64(file);
    setImagePreview(base64);
    setFormData((prev) => ({ ...prev, imageUrl: base64 }));
  };

  const clearImage = () => {
    setImagePreview(null);
    setFormData((prev) => ({ ...prev, imageUrl: "" }));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Volcar rubro/marca tipeados que no se confirmaron con OK/Enter
    const pendingCategory = showNewCategoryInput ? newCategoryInput.trim() : "";
    const pendingMarca = showNewMarcaInput ? newMarcaInput.trim() : "";
    const effectiveData = {
      ...formData,
      category: pendingCategory || formData.category,
      marca: pendingMarca || formData.marca,
    };
    setLoading(true);
    try {
      const loteNum = parseInt(lote) || 0;
      const isMayorista = !!product?.id?.startsWith("prod_");
      const adjustDelta = stockAdjustQty > 0
        ? (stockAdjustType === "add" ? stockAdjustQty : -stockAdjustQty)
        : 0;
      const finalStock = isEditing ? effectiveData.stock + adjustDelta : effectiveData.stock;

      const adjustment: StockAdjustment | undefined =
        isEditing && stockAdjustQty > 0
          ? { type: stockAdjustType, quantity: stockAdjustQty, reason: stockAdjustReason, isLoss: stockAdjustType === "remove" ? stockAdjustIsLoss : false }
          : undefined;

      // Productos manuales (no mayorista): guardar precio base + % ganancia
      const baseNum = parseFloat(precioBase) || 0;
      const gananciaNum = parseFloat(ganancia) || 0;
      const usaPrecioBase = !isMayorista || isMedicamento;
      const precioFields =
        usaPrecioBase && baseNum > 0
          ? {
              precioBase: baseNum,
              gananciaGlobal: gananciaNum,
              precioVenta: effectiveData.price,
              // Marca individual: evita que "aplicar % a todos" lo pise
              gananciaIndividual: 1,
            }
          : {};

      await onSave({
        ...effectiveData,
        description: effectiveData.description || "",
        imageUrl: effectiveData.imageUrl || "",
        stock: finalStock,
        codigo: effectiveData.codigo?.trim() || undefined,
        ...precioFields,
        ...(isMayorista && loteNum > 0
          ? { unidadesPorBulto: loteNum }
          : {}),
      } as any, adjustment);
    } finally {
      setLoading(false);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const isEditing = !!product;
  const isMayorista = !!product?.id?.startsWith("prod_");
  const loteNum = parseInt(lote) || 0;
  const needsReason = stockAdjustType === "remove" && stockAdjustQty > 0 && !stockAdjustReason.trim();
  const exceedsStock = stockAdjustType === "remove" && stockAdjustQty > formData.stock;
  const effectiveCategory = (showNewCategoryInput && newCategoryInput.trim()) || formData.category;
  const isMedicamento = (effectiveCategory || "").trim().toLowerCase().includes("medicamento");
  const isValid = (isMayorista && isEditing
    ? formData.name.trim() && formData.price > 0
    : formData.name.trim() && effectiveCategory && formData.price > 0) && !needsReason && !exceedsStock;

  const displayImage = imagePreview || DEFAULT_IMAGE;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto p-0 gap-0">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/50">
          <DialogTitle className="text-xl font-semibold">
            {isEditing ? "Editar Producto" : "Nuevo Producto"}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {isEditing && isMayorista
              ? product?.name
              : isEditing
              ? "Actualizá la información del producto"
              : "Completá la información básica para crear el producto"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-5">
          {/* Mayorista: solo descripción, rubro, precio y lote */}
          {isEditing && isMayorista ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-sm font-medium">Descripción</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="h-10"
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Rubro</Label>
                <Select
                  value={formData.category}
                  onValueChange={(val) => {
                    if (val === "__new_category__") {
                      setShowNewCategoryInput(true);
                    } else if (val === "__edit_categories__") {
                      setShowEditCategories(true);
                    } else {
                      setFormData({ ...formData, category: val });
                      setShowNewCategoryInput(false);
                    }
                  }}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Seleccioná..." />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                    <SelectItem value="__new_category__" className="text-primary font-medium">
                      <span className="flex items-center gap-1.5">
                        <Plus className="h-3.5 w-3.5" />
                        Nuevo rubro
                      </span>
                    </SelectItem>
                    {onRenameCategory && categories.length > 0 && (
                      <SelectItem value="__edit_categories__" className="font-medium">
                        <span className="flex items-center gap-1.5">
                          <Pencil className="h-3.5 w-3.5" />
                          Editar rubros
                        </span>
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
                {renderCategoryEditor()}
                {showNewCategoryInput && (
                  <div className="flex gap-1.5">
                    <Input
                      value={newCategoryInput}
                      onChange={(e) => setNewCategoryInput(e.target.value)}
                      placeholder="Nuevo rubro..."
                      className="h-9 text-sm"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); addNewCategory(); }
                        if (e.key === "Escape") { setShowNewCategoryInput(false); setNewCategoryInput(""); }
                      }}
                    />
                    <Button type="button" size="sm" className="h-9 px-2.5" onClick={addNewCategory} disabled={!newCategoryInput.trim()}>OK</Button>
                    <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={() => { setShowNewCategoryInput(false); setNewCategoryInput(""); }}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>

              {isMedicamento ? (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="precio-base-may" className="text-sm font-medium">Precio base</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">$</span>
                        <Input
                          id="precio-base-may"
                          type="number"
                          min="0"
                          step="0.01"
                          value={precioBase}
                          onChange={(e) => handleBaseChange(e.target.value)}
                          className="pl-7 h-10"
                          placeholder="0"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ganancia-may" className="text-sm font-medium">% a aplicar</Label>
                      <div className="relative">
                        <Input
                          id="ganancia-may"
                          type="number"
                          min="0"
                          step="0.01"
                          value={ganancia}
                          onChange={(e) => handleGananciaChange(e.target.value)}
                          className="pr-7 h-10"
                          placeholder="0"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">%</span>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="precio-final-may" className="text-sm font-medium">Precio final</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-teal-600 font-medium">$</span>
                        <Input
                          id="precio-final-may"
                          type="number"
                          min="0"
                          step="0.01"
                          value={formData.price || ""}
                          onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })}
                          className="pl-7 h-11 text-base font-bold text-teal-700 border-teal-200 bg-teal-50/60 focus-visible:ring-teal-400"
                          placeholder="0"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lote-may" className="text-sm font-medium">Unidades por bulto</Label>
                      <Input
                        id="lote-may"
                        type="number"
                        min="1"
                        placeholder="Ej: 12"
                        value={lote}
                        onChange={(e) => setLote(e.target.value)}
                        className="h-10"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="price-may" className="text-sm font-medium">Precio (ARS)</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">$</span>
                      <Input
                        id="price-may"
                        type="number"
                        min="0"
                        step="0.01"
                        value={formData.price || ""}
                        onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })}
                        className="pl-7 h-10"
                        placeholder="0"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lote-may" className="text-sm font-medium">Unidades por bulto</Label>
                    <Input
                      id="lote-may"
                      type="number"
                      min="1"
                      placeholder="Ej: 12"
                      value={lote}
                      onChange={(e) => setLote(e.target.value)}
                      className="h-10"
                    />
                  </div>
                </div>
              )}

              {/* Stock actual + Ajuste */}
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Label className="text-sm font-medium">Stock actual:</Label>
                  <span className="text-sm font-semibold">{formData.stock} uds</span>
                </div>
                <div className={cn(
                  "p-3 rounded-lg border space-y-3",
                  stockAdjustType === "remove" ? "border-red-300 bg-red-50/50" : "border-border bg-muted/20"
                )}>
                  <div className="flex items-center gap-2">
                    <div className="flex rounded-lg border border-border overflow-hidden">
                      <button
                        type="button"
                        className={cn(
                          "px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 transition-colors",
                          stockAdjustType === "add"
                            ? "bg-emerald-500 text-white"
                            : "bg-muted/50 text-muted-foreground hover:bg-muted"
                        )}
                        onClick={() => { setStockAdjustType("add"); setStockAdjustQty(0); setStockAdjustReason(""); }}
                      >
                        <PackagePlus className="h-3.5 w-3.5" />
                        Agregar
                      </button>
                      <button
                        type="button"
                        className={cn(
                          "px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 transition-colors",
                          stockAdjustType === "remove"
                            ? "bg-red-500 text-white"
                            : "bg-muted/50 text-muted-foreground hover:bg-muted"
                        )}
                        onClick={() => { setStockAdjustType("remove"); setStockAdjustQty(0); setStockAdjustReason(""); }}
                      >
                        <PackageMinus className="h-3.5 w-3.5" />
                        Quitar
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Input
                      type="number"
                      min="0"
                      max={stockAdjustType === "remove" ? formData.stock : undefined}
                      value={stockAdjustQty || ""}
                      onChange={(e) => setStockAdjustQty(Math.max(0, Number(e.target.value)))}
                      className="h-9 w-28"
                      placeholder="0"
                    />
                    {stockAdjustQty > 0 && (
                      <span className="text-sm text-muted-foreground">
                        → Nuevo total:{" "}
                        <span className={cn("font-semibold", stockAdjustType === "remove" ? "text-red-600" : "text-foreground")}>
                          {stockAdjustType === "add" ? formData.stock + stockAdjustQty : formData.stock - stockAdjustQty} uds
                        </span>
                      </span>
                    )}
                  </div>
                  {stockAdjustType === "remove" && stockAdjustQty > 0 && (
                    <div className="space-y-1.5">
                      <Label className="text-xs text-red-600 font-medium">
                        Motivo (obligatorio) — se registra como pérdida en caja
                      </Label>
                      <Input
                        value={stockAdjustReason}
                        onChange={(e) => setStockAdjustReason(e.target.value)}
                        placeholder='Ej: "Se rompieron al traerlos"'
                        className="h-9 text-sm border-red-300 focus-visible:ring-red-400"
                      />
                    </div>
                  )}
                  {stockAdjustType === "add" && stockAdjustQty > 0 && (
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground font-medium">
                        Motivo (opcional)
                      </Label>
                      <Input
                        value={stockAdjustReason}
                        onChange={(e) => setStockAdjustReason(e.target.value)}
                        placeholder='Ej: "Reposición de mercadería"'
                        className="h-9 text-sm"
                      />
                    </div>
                  )}
                  {exceedsStock && (
                    <p className="text-xs text-red-600 font-medium">
                      No podés quitar más de {formData.stock} unidades
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Nombre + Descripción */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-sm font-medium">
                    Nombre <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder="Ej: Milanesa de Pollo"
                    className="h-10"
                    autoFocus
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description" className="text-sm font-medium">
                    Descripción
                  </Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    placeholder="Breve descripción del sabor y características..."
                    rows={2}
                    className="resize-none"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="codigo" className="text-sm font-medium">
                    Código
                  </Label>
                  <div className="relative">
                    <Input
                      id="codigo"
                      value={formData.codigo}
                      onChange={(e) =>
                        setFormData({ ...formData, codigo: e.target.value })
                      }
                      placeholder={suggestingCodigo ? "Generando código..." : "Ej: P00001"}
                      className="h-10 font-mono"
                    />
                    {suggestingCodigo && (
                      <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                  </div>
                  {!isEditing && (
                    <p className="text-xs text-muted-foreground">
                      Sugerido automáticamente. Podés cambiarlo si querés.
                    </p>
                  )}
                </div>
              </div>

              <Separator />

              {/* Clasificación: Categoría + Marca lado a lado en desktop */}
              <div className="space-y-4">
                <div>
                  {/* Categoría */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">
                      Categoría <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={formData.category}
                      onValueChange={(val) => {
                        if (val === "__new_category__") {
                          setShowNewCategoryInput(true);
                        } else if (val === "__edit_categories__") {
                          setShowEditCategories(true);
                        } else {
                          setFormData({ ...formData, category: val });
                          setShowNewCategoryInput(false);
                        }
                      }}
                    >
                      <SelectTrigger className="h-10">
                        <SelectValue placeholder="Seleccioná..." />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((cat) => (
                          <SelectItem key={cat} value={cat}>
                            {cat}
                          </SelectItem>
                        ))}
                        <SelectItem
                          value="__new_category__"
                          className="text-primary font-medium"
                        >
                          <span className="flex items-center gap-1.5">
                            <Plus className="h-3.5 w-3.5" />
                            Nueva categoría
                          </span>
                        </SelectItem>
                        {onRenameCategory && categories.length > 0 && (
                          <SelectItem
                            value="__edit_categories__"
                            className="font-medium"
                          >
                            <span className="flex items-center gap-1.5">
                              <Pencil className="h-3.5 w-3.5" />
                              Editar rubros
                            </span>
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>

                    {renderCategoryEditor()}

                    {showNewCategoryInput && (
                      <div className="flex gap-1.5">
                        <Input
                          value={newCategoryInput}
                          onChange={(e) => setNewCategoryInput(e.target.value)}
                          placeholder="Nueva categoría..."
                          className="h-9 text-sm"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addNewCategory();
                            }
                            if (e.key === "Escape") {
                              setShowNewCategoryInput(false);
                              setNewCategoryInput("");
                            }
                          }}
                        />
                        <Button
                          type="button"
                          size="sm"
                          className="h-9 px-2.5"
                          onClick={addNewCategory}
                          disabled={!newCategoryInput.trim()}
                        >
                          OK
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9"
                          onClick={() => {
                            setShowNewCategoryInput(false);
                            setNewCategoryInput("");
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <Separator />

              {/* Precio y Stock */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Precio y Stock</Label>
                <div className="grid grid-cols-2 gap-4">
                  {/* Precio base (costo) */}
                  <div className="space-y-2">
                    <Label htmlFor="precio-base" className="text-xs text-muted-foreground">
                      Precio base
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">
                        $
                      </span>
                      <Input
                        id="precio-base"
                        type="number"
                        min="0"
                        step="0.01"
                        value={precioBase}
                        onChange={(e) => handleBaseChange(e.target.value)}
                        className="pl-7 h-10"
                        placeholder="0"
                      />
                    </div>
                  </div>

                  {/* % Ganancia */}
                  <div className="space-y-2">
                    <Label htmlFor="ganancia" className="text-xs text-muted-foreground">
                      % a aplicar
                    </Label>
                    <div className="relative">
                      <Input
                        id="ganancia"
                        type="number"
                        min="0"
                        step="0.01"
                        value={ganancia}
                        onChange={(e) => handleGananciaChange(e.target.value)}
                        className="pr-7 h-10"
                        placeholder="0"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">
                        %
                      </span>
                    </div>
                  </div>
                </div>

                {/* Precio final (calculado, editable) */}
                <div className="space-y-2">
                  <Label htmlFor="precio-final" className="text-xs text-muted-foreground">
                    Precio final
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-teal-600 font-medium">
                      $
                    </span>
                    <Input
                      id="precio-final"
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.price || ""}
                      onChange={(e) =>
                        setFormData({ ...formData, price: Number(e.target.value) })
                      }
                      className="pl-7 h-11 text-base font-bold text-teal-700 border-teal-200 bg-teal-50/60 focus-visible:ring-teal-400"
                      placeholder="0"
                    />
                  </div>
                </div>

                {/* Stock */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    {isEditing ? (
                      <>
                        <Label className="text-xs text-muted-foreground">
                          Stock actual
                        </Label>
                        <div className="h-10 px-3 flex items-center rounded-md border border-border bg-muted/50 text-sm font-medium">
                          {formData.stock} uds
                        </div>
                      </>
                    ) : (
                      <>
                        <Label htmlFor="stock" className="text-xs text-muted-foreground">
                          Stock inicial
                        </Label>
                        <Input
                          id="stock"
                          type="number"
                          min="0"
                          value={formData.stock || ""}
                          onChange={(e) =>
                            setFormData({ ...formData, stock: Number(e.target.value) })
                          }
                          className="h-10"
                          placeholder="0"
                        />
                      </>
                    )}
                  </div>
                </div>

                {/* Ajuste de stock (solo en edición) */}
                {isEditing && (
                  <div className={cn(
                    "p-3 rounded-lg border space-y-3",
                    stockAdjustType === "remove" ? "border-red-300 bg-red-50/50" : "border-border bg-muted/20"
                  )}>
                    <div className="flex items-center gap-2">
                      <div className="flex rounded-lg border border-border overflow-hidden">
                        <button
                          type="button"
                          className={cn(
                            "px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 transition-colors",
                            stockAdjustType === "add"
                              ? "bg-emerald-500 text-white"
                              : "bg-muted/50 text-muted-foreground hover:bg-muted"
                          )}
                          onClick={() => { setStockAdjustType("add"); setStockAdjustQty(0); setStockAdjustReason(""); setStockAdjustIsLoss(false); }}
                        >
                          <PackagePlus className="h-3.5 w-3.5" />
                          Agregar
                        </button>
                        <button
                          type="button"
                          className={cn(
                            "px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 transition-colors",
                            stockAdjustType === "remove"
                              ? "bg-red-500 text-white"
                              : "bg-muted/50 text-muted-foreground hover:bg-muted"
                          )}
                          onClick={() => { setStockAdjustType("remove"); setStockAdjustQty(0); setStockAdjustReason(""); setStockAdjustIsLoss(false); }}
                        >
                          <PackageMinus className="h-3.5 w-3.5" />
                          Quitar
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Input
                        type="number"
                        min="0"
                        max={stockAdjustType === "remove" ? formData.stock : undefined}
                        value={stockAdjustQty || ""}
                        onChange={(e) =>
                          setStockAdjustQty(Math.max(0, Number(e.target.value)))
                        }
                        className="h-9 w-28"
                        placeholder="0"
                      />
                      {stockAdjustQty > 0 && (
                        <span className="text-sm text-muted-foreground">
                          → Nuevo total:{" "}
                          <span className={cn(
                            "font-semibold",
                            stockAdjustType === "remove" ? "text-red-600" : "text-foreground"
                          )}>
                            {stockAdjustType === "add"
                              ? formData.stock + stockAdjustQty
                              : formData.stock - stockAdjustQty} uds
                          </span>
                        </span>
                      )}
                    </div>
                    {stockAdjustType === "remove" && stockAdjustQty > 0 && (
                      <div className="space-y-2.5">
                        <div className="space-y-1.5">
                          <Label className="text-xs text-red-600 font-medium">
                            Motivo (obligatorio)
                          </Label>
                          <Input
                            value={stockAdjustReason}
                            onChange={(e) => setStockAdjustReason(e.target.value)}
                            placeholder={stockAdjustIsLoss ? 'Ej: "Se rompieron al traerlos"' : 'Ej: "Ajuste de inventario"'}
                            className="h-9 text-sm border-red-300 focus-visible:ring-red-400"
                          />
                        </div>
                        <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2">
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-foreground">Registrar como pérdida en caja</p>
                            <p className="text-[11px] text-muted-foreground">
                              {stockAdjustIsLoss
                                ? "Se descuenta el stock y se registra la pérdida en caja (rotura/vencido)."
                                : "Solo ajuste de stock — no afecta la caja."}
                            </p>
                          </div>
                          <Switch checked={stockAdjustIsLoss} onCheckedChange={setStockAdjustIsLoss} />
                        </div>
                      </div>
                    )}
                    {stockAdjustType === "add" && stockAdjustQty > 0 && (
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground font-medium">
                          Motivo (opcional)
                        </Label>
                        <Input
                          value={stockAdjustReason}
                          onChange={(e) => setStockAdjustReason(e.target.value)}
                          placeholder='Ej: "Reposición de mercadería"'
                          className="h-9 text-sm"
                        />
                      </div>
                    )}
                    {exceedsStock && (
                      <p className="text-xs text-red-600 font-medium">
                        No podés quitar más de {formData.stock} unidades
                      </p>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Footer */}
          <div className="flex justify-end gap-3 pt-2 border-t border-border/50">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={loading || !isValid}
              className="min-w-[120px]"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? "Guardar Cambios" : "Crear Producto"}
            </Button>
          </div>

          {/* Mobile: habilitar/deshabilitar abajo de todo */}
          {isEditing && onToggleDisabled && (
            <div className="md:hidden pt-2">
              <Button
                type="button"
                variant="outline"
                disabled={loading}
                onClick={() => onToggleDisabled()}
                className={cn(
                  "w-full gap-2",
                  isDisabled
                    ? "text-green-600 border-green-600/30 hover:bg-green-50"
                    : "text-amber-600 border-amber-600/30 hover:bg-amber-50",
                )}
              >
                {isDisabled ? <PackagePlus className="h-4 w-4" /> : <PackageMinus className="h-4 w-4" />}
                {isDisabled ? "Habilitar producto" : "Deshabilitar producto"}
              </Button>
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
