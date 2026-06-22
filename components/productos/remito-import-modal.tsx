"use client";

import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import type { Product } from "@/lib/types";
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertCircle,
  X,
  Package,
  ChevronDown,
  ChevronUp,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/format";
import { supabase } from "@/lib/supabase";
import { mayoristaCuentaApi } from "@/lib/api";
import { habilitarDesdeRemito } from "@/services/mayorista-service";
import { esItemProcesable, stockResultante } from "@/lib/utils/remito-import";

interface ParsedItem {
  codigo: string;
  rawName: string;
  bultos: number;
  cantidad: number;
  precio: number;
}

interface MatchedItem {
  parsedItem: ParsedItem;
  matchedProduct: Product | null;
  quantity: number;
  precioListaActual?: number;
  mpId?: string;
  needsEnable?: boolean;
}

interface RemitoImportModalProps {
  open: boolean;
  onClose: () => void;
  products: Product[];
  onConfirm: (updates: { productId: string; newStock: number; cantidad: number; productName: string; precioLista: number }[]) => Promise<void>;
}

// Parsea el texto del remito/factura del proveedor y extrae items
// Formato León Mayorista: "001 0113271. [E] CINTITAS TOSTEX X125G ASADO 21,0 26,000 819,38 21303,93"
// Formato remito clásico: "0101920 01 HARINA PIZZA X 1KG PUREZA 2.00 20.000 1243.5143 24876.28"
function parseRemitoText(text: string): ParsedItem[] {
  const items: ParsedItem[] = [];
  const lines = text.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Formato factura: "001 0113271. [E] DESCRIPCION ... 21,0 26,000 819,38 21303,93"
    // Nro item (3 dígitos) + código (5-8 dígitos con punto opcional) + [E] + nombre + números
    const matchFactura = line.match(/^\d{1,3}\s+(\d{5,8})\.?\s+/);
    // Formato remito clásico: "0101920 01 DESCRIPCION ... 2.00 20.000 1243.5143 24876.28"
    const matchRemito = line.match(/^(\d{5,8})\s+/);

    const match = matchFactura || matchRemito;
    if (!match) continue;

    const codigo = match[1];
    const rest = line.slice(match[0].length);

    // Limpiar prefijos: depósito "01 " o tag "[E] "
    const cleaned = rest.replace(/^0[1-9]\s+/, "").replace(/^\[E\]\s*/, "");

    // Separar tokens
    const tokens = cleaned.split(/\s+/);
    const numericTokens: { value: number; raw: string }[] = [];
    const nameTokens: string[] = [];

    for (const t of tokens) {
      // Tokens con letras mezcladas son parte del nombre (X125G, X1KG, X1LT, etc.)
      if (/[a-zA-Z]/.test(t) && /\d/.test(t)) {
        nameTokens.push(t);
        continue;
      }

      // Limpiar caracteres no numéricos
      const stripped = t.replace(/[^0-9.,]/g, "");
      if (!stripped) { nameTokens.push(t); continue; }

      // Detectar si es un número con coma decimal (formato argentino: 819,38)
      // o con punto decimal (formato clásico: 1243.5143)
      let numStr = stripped;
      if (numStr.includes(",")) {
        // "1.057,56" → "1057.56" | "21,0" → "21.0" | "26,000" → "26.000"
        numStr = numStr.replace(/\./g, "").replace(",", ".");
      }
      const num = parseFloat(numStr);

      if (!isNaN(num) && num >= 0) {
        numericTokens.push({ value: num, raw: t });
      } else {
        nameTokens.push(t);
      }
    }

    // Necesitamos al menos 3 números para extraer cantidad y precio
    if (numericTokens.length < 3) continue;

    const rawName = nameTokens.join(" ").trim();

    // Filtrar headers
    const nameLower = rawName.toLowerCase();
    if (
      nameLower.includes("descripci") ||
      nameLower.includes("articulo") ||
      nameLower.includes("cantidad") ||
      nameLower.includes("subtot") ||
      rawName.length < 3
    ) {
      continue;
    }

    // Determinar formato por la cantidad de números
    // Factura León: [IVA%, cantidad, precio_unit, subtotal] → 4 números
    // Remito clásico: [bultos, cantidad, precio_unit, subtotal] → 4 números
    let cantidad: number;
    let precio: number;
    let bultos = 0;

    if (matchFactura) {
      // Factura: últimos 4 números son [IVA%, cantidad, precio_unit, subtotal]
      // Se toman desde el final porque la descripción puede contener números (ej: "9 DE ORO")
      const len = numericTokens.length;
      cantidad = Math.floor(numericTokens[len - 3].value);
      precio = numericTokens[len - 2].value;
    } else {
      // Remito clásico: últimos 4 números son [bultos, cantidad, precio_unit, subtotal]
      const len = numericTokens.length;
      bultos = numericTokens[len - 4]?.value ?? 0;
      cantidad = Math.floor(numericTokens[len - 3].value);
      precio = numericTokens[len - 2].value;
    }

    if (cantidad <= 0 || cantidad > 100000 || precio <= 0) continue;

    items.push({ codigo, rawName, bultos, cantidad, precio });
  }

  return items;
}

// Parsea un string numérico argentino ("1.234.567,89" o "1234567.89") a number
function parseArgNum(raw: string): number {
  let s = raw.trim().replace(/\s/g, "");
  // Si tiene coma → formato argentino: puntos son miles, coma es decimal
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  }
  return parseFloat(s) || 0;
}

// Extrae metadatos del remito: "Señor" (destinatario) y total
function extractRemitoMeta(text: string): { senor: string; total: number; nroComprobante: string } {
  let senor = "";
  let total = 0;
  let nroComprobante = "";
  const lines = text.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const lineTrimmed = lines[i].trim();

    // Detectar nombre del destinatario:
    // Formato León Mayorista: línea previa a "Señor(es):" tiene el nombre
    //   "01011 J & J DISTRIBUCIONES 2 ("
    //   "Señor(es): Domicilio: MITRE 745 (3260)"
    // También busca "DISTRIBUC" en primeras líneas como fallback
    if (!senor) {
      // Si encontramos "Señor(es):", el nombre está en la línea anterior
      if (/se[ñn]or\(?e?s?\)?/i.test(lineTrimmed) && i > 0) {
        const prevLine = lines[i - 1]?.trim() || "";
        if (prevLine) {
          // "01011 J & J DISTRIBUCIONES 2 (" → "J & J DISTRIBUCIONES 2"
          const cleaned = prevLine
            .replace(/^\d+\s+/, "")       // quitar código cliente
            .replace(/\s*\(.*$/, "")      // quitar paréntesis final
            .trim();
          if (cleaned.length > 3) senor = cleaned;
        }
      }
      // Fallback: buscar "DISTRIBUC" en primeras 20 líneas
      if (!senor && i < 20 && /DISTRIBUC/i.test(lineTrimmed) && !/Raz[oó]n\s*Social/i.test(lineTrimmed)) {
        const cleaned = lineTrimmed
          .replace(/^\d+\s+/, "")
          .replace(/\s*\(.*$/, "")
          .replace(/\s{2,}.*$/, "")
          .trim();
        if (cleaned.length > 3) senor = cleaned;
      }
    }

    // Número de comprobante: "Compr. Nro: 2007-00091112", "Nro: 0001-00012345", "Comprobante: ..."
    if (!nroComprobante) {
      const matchNro = lineTrimmed.match(/(?:Compr\.?\s*Nro|Nro\.?\s*Compr|Comprobante|N[°ºo]\s*:?)\s*:?\s*([\d\-]+)/i);
      if (matchNro) nroComprobante = matchNro[1].trim();
    }

    // Total: busca "TOTAL" (no SUBTOTAL) con número en la misma línea o la siguiente
    // Acepta: "TOTAL $ 1.234,56", "TOTAL: 1234.56", "TOTAL GENERAL $1.057,56", "TOTAL    1.234.567,89"
    if (/(?:^|\s)TOTAL(?:\s+GENERAL)?\s*:?\s*/i.test(lineTrimmed) && !/SUB\s*TOTAL/i.test(lineTrimmed)) {
      // Buscar número en la misma línea
      const numMatch = lineTrimmed.match(/TOTAL(?:\s+GENERAL)?\s*:?\s*\$?\s*([\d.,]+)/i);
      let candidate = 0;
      if (numMatch) {
        candidate = parseArgNum(numMatch[1]);
      } else {
        // Número en la línea siguiente
        const nextLine = lines[i + 1]?.trim() || "";
        const nextNum = nextLine.match(/^\$?\s*([\d.,]+)/);
        if (nextNum) candidate = parseArgNum(nextNum[1]);
      }
      if (candidate > total) total = candidate;
    }
  }

  return { senor, total, nroComprobante };
}

// Busca producto por código (soporta código mayorista, sin ceros a la izquierda, por ID)
function findByCode(codigo: string, products: Product[]): Product | null {
  const codigoStripped = codigo.replace(/^0+/, "");
  for (const p of products) {
    if (p.codigo === codigo) return p;
    if (p.codigo && p.codigo.replace(/^0+/, "") === codigoStripped) return p;
    if (p.id === `prod_mp_${codigo}`) return p;
  }
  console.log(`[remito] No match para código: ${codigo} (stripped: ${codigoStripped}). Ejemplo productos:`, products.slice(0, 3).map(p => ({ id: p.id, codigo: p.codigo })));
  return null;
}

// Extrae texto directamente del PDF (sin OCR), reconstruyendo líneas por posición Y
async function extractPdfText(file: File): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.mjs",
    import.meta.url
  ).toString();

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const allLines: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();

    // Agrupar items por posición Y (misma línea)
    const lineMap = new Map<number, { x: number; str: string }[]>();
    for (const item of content.items as any[]) {
      if (!item.str || !item.str.trim()) continue;
      // Redondear Y para agrupar items de la misma línea (tolerancia 2px)
      const y = Math.round(item.transform[5] / 2) * 2;
      if (!lineMap.has(y)) lineMap.set(y, []);
      lineMap.get(y)!.push({ x: item.transform[4], str: item.str });
    }

    // Ordenar líneas de arriba a abajo (Y descendente en PDF)
    const sortedYs = [...lineMap.keys()].sort((a, b) => b - a);
    for (const y of sortedYs) {
      const items = lineMap.get(y)!.sort((a, b) => a.x - b.x);
      allLines.push(items.map((i) => i.str).join(" "));
    }
  }

  return allLines.join("\n");
}

export function RemitoImportModal({
  open,
  onClose,
  products,
  onConfirm,
}: RemitoImportModalProps) {
  const [step, setStep] = useState<"upload" | "review">("upload");
  const [dragging, setDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [progressMsg, setProgressMsg] = useState("");
  const [fileName, setFileName] = useState("");
  const [items, setItems] = useState<MatchedItem[]>([]);
  const [showUnmatched, setShowUnmatched] = useState(true);
  const [remitoSenor, setRemitoSenor] = useState("");
  const [remitoTotal, setRemitoTotal] = useState(0);
  const [remitoNro, setRemitoNro] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = () => {
    setStep("upload");
    setFileName("");
    setItems([]);
    setParsing(false);
    setConfirming(false);
    setProgressMsg("");
    setRemitoSenor("");
    setRemitoTotal(0);
    setRemitoNro("");
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const processFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Solo se aceptan archivos PDF");
      return;
    }

    setFileName(file.name);
    setParsing(true);
    setProgressMsg("Leyendo PDF...");

    try {
      // 1. Extraer texto directo del PDF (sin OCR)
      const text = await extractPdfText(file);

      setProgressMsg("Analizando texto...");
      console.log("[remito] Texto extraído del PDF:\n", text);

      // 3. Extraer metadatos y parsear items
      const meta = extractRemitoMeta(text);
      setRemitoSenor(meta.senor);
      setRemitoTotal(meta.total);
      setRemitoNro(meta.nroComprobante);
      console.log("[remito] Meta:", meta);

      const parsedItems = parseRemitoText(text);
      console.log("[remito] Items parseados:", parsedItems);

      if (parsedItems.length === 0) {
        toast.warning(
          "No se encontraron productos en el PDF. Verificá que sea un remito del proveedor."
        );
        setParsing(false);
        setProgressMsg("");
        return;
      }

      // 4. Buscar códigos en mayorista_productos para obtener producto_id y precio_lista
      const codigos = parsedItems.map((item) => item.codigo);
      const { data: mpRows } = await supabase
        .from("mayorista_productos")
        .select("id, codigo, producto_id, precio_lista, descripcion, habilitado")
        .in("codigo", codigos);

      // Mapa código → info de mayorista
      const mpByCodigo = new Map<string, { mpId: string; productoId: string | null; precioLista: number; descripcion: string; habilitado: boolean }>();
      if (mpRows) {
        for (const mp of mpRows) {
          mpByCodigo.set(mp.codigo, {
            mpId: mp.id,
            productoId: mp.producto_id,
            precioLista: Number(mp.precio_lista) || 0,
            descripcion: mp.descripcion ?? "",
            habilitado: mp.habilitado ?? false,
          });
        }
      }

      // Buscar productos asociados por producto_id
      const productoIds = [...mpByCodigo.values()]
        .map((v) => v.productoId)
        .filter(Boolean) as string[];
      const productosMap = new Map<string, Product>();
      if (productoIds.length > 0) {
        const { data: prodRows } = await supabase
          .from("productos")
          .select("*")
          .in("id", productoIds);
        if (prodRows) {
          for (const row of prodRows) {
            const p: Product = {
              id: row.id,
              name: row.name ?? "",
              description: row.description ?? "",
              price: Number(row.price) || 0,
              stock: row.stock ?? 0,
              imageUrl: row.image_url ?? "",
              category: row.category ?? "",
              createdAt: new Date(row.created_at),
              unidadesPorBulto: row.unidades_por_bulto ?? undefined,
              seDivideEn: row.se_divide_en ? Number(row.se_divide_en) : undefined,
              precioVenta: row.precio_venta != null ? Number(row.precio_venta) : undefined,
              gananciaGlobal: row.ganancia_global != null ? Number(row.ganancia_global) : undefined,
              gananciaIndividual: row.ganancia_individual ?? undefined,
              codigo: row.codigo ?? undefined,
            };
            productosMap.set(p.id, p);
          }
        }
      }

      // Matchear: primero por mayorista_productos, fallback a búsqueda local
      const matched: MatchedItem[] = parsedItems.map((item) => {
        const mpInfo = mpByCodigo.get(item.codigo);
        let matchedProduct: Product | null = null;
        let precioListaActual: number | undefined;

        if (mpInfo) {
          precioListaActual = mpInfo.precioLista;
          if (mpInfo.productoId) {
            matchedProduct = productosMap.get(mpInfo.productoId) ?? null;
          }
          // Si no tiene producto asociado, fallback a búsqueda local por código
          if (!matchedProduct) {
            matchedProduct = findByCode(item.codigo, products);
          }
        } else {
          // Código no existe en mayorista_productos, buscar en productos locales
          matchedProduct = findByCode(item.codigo, products);
        }

        return {
          parsedItem: item,
          matchedProduct,
          quantity: item.cantidad,
          precioListaActual,
          mpId: mpInfo?.mpId,
          // Está matcheado pero el registro mayorista figura deshabilitado → se habilitará al confirmar
          needsEnable: !!mpInfo && mpInfo.habilitado === false && matchedProduct !== null,
        };
      });

      setItems(matched);
      setStep("review");
    } catch (err) {
      console.error("Error procesando remito:", err);
      toast.error("Error al procesar el PDF. Intentá de nuevo.");
    } finally {
      setParsing(false);
      setProgressMsg("");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [products]
  );

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = () => setDragging(false);

  const updateQuantity = (index: number, value: string) => {
    const num = parseInt(value, 10);
    if (isNaN(num) || num < 0) return;
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, quantity: num } : item))
    );
  };

  const updateMatch = (index: number, productId: string) => {
    const product = products.find((p) => p.id === productId) || null;
    setItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, matchedProduct: product } : item
      )
    );
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleConfirm = async () => {
    // Procesables: tienen ficha matcheada o registro en mayorista (por mpId, aunque falte la ficha).
    const toUpdate = items.filter((item) => esItemProcesable({ tieneFicha: item.matchedProduct !== null, tieneMayorista: !!item.mpId }));

    if (toUpdate.length === 0) {
      toast.error("No hay productos para actualizar");
      return;
    }

    setConfirming(true);
    try {
      // Asegurar que cada producto exista y quede VISIBLE para todos (vendedores y tienda):
      // habilitarDesdeRemito crea la ficha si falta, la reactiva (disabled=false) y marca
      // habilitado=true en mayorista. Devuelve el productoId al que sumar stock.
      let habilitados = 0;
      const updates: { productId: string; newStock: number; cantidad: number; productName: string; precioLista: number }[] = [];
      for (const item of toUpdate) {
        let productId = item.matchedProduct?.id ?? null;
        if (item.mpId) {
          const pid = await habilitarDesdeRemito(item.mpId);
          if (pid) {
            productId = pid;
            if (item.needsEnable || !item.matchedProduct) habilitados++;
          }
        } else if (item.matchedProduct) {
          // Sin registro mayorista (match local por código): solo asegurar visibilidad en tienda.
          await supabase.from("productos").update({ disabled: false }).eq("id", item.matchedProduct.id);
        }
        if (!productId) continue;
        updates.push({
          productId,
          newStock: stockResultante(item.matchedProduct?.stock ?? 0, item.quantity),
          cantidad: item.quantity,
          productName: item.matchedProduct?.name ?? item.parsedItem.rawName,
          precioLista: item.parsedItem.precio,
        });
      }

      await onConfirm(updates);

      if (habilitados > 0) {
        toast.success(`${habilitados} producto(s) habilitado(s) para vendedores y tienda`);
      }

      // Registrar deuda en cuenta mayorista si hay total
      if (remitoTotal > 0) {
        try {
          const parts = [
            remitoNro ? `Boleta ${remitoNro}` : null,
            remitoSenor || null,
          ].filter(Boolean);
          const desc = parts.length > 0 ? parts.join(" — ") : `Remito ${fileName}`;
          // Detectar la distribución (1 o 2) del destinatario del remito; default 1
          const distribucion: 1 | 2 = /DISTRIBUC\w*\s*2/i.test(`${remitoSenor ?? ""} ${desc}`) ? 2 : 1;
          await mayoristaCuentaApi.addDeuda({ amount: remitoTotal, description: desc, distribucion });
          toast.success(`Deuda de ${formatCurrency(remitoTotal)} cargada en cuenta mayorista`);
        } catch {
          toast.error("Stock actualizado pero no se pudo registrar la deuda mayorista");
        }
      }

      toast.success(`Stock actualizado para ${updates.length} producto(s)`);
      handleClose();
    } catch (err) {
      toast.error("Error al actualizar el stock");
    } finally {
      setConfirming(false);
    }
  };

  const matchedCount = items.filter((i) => i.matchedProduct !== null).length;
  const processableCount = items.filter((i) => i.matchedProduct !== null || i.mpId).length;
  const willCreateCount = items.filter((i) => i.matchedProduct === null && !!i.mpId).length;
  const unmatchedCount = items.filter((i) => i.matchedProduct === null && !i.mpId).length;
  const toEnableCount = items.filter((i) => (i.matchedProduct !== null && i.needsEnable) || (i.matchedProduct === null && !!i.mpId)).length;
  const priceChangedCount = items.filter(
    (i) => i.matchedProduct && i.precioListaActual != null && i.precioListaActual > 0 && Math.abs(i.parsedItem.precio - i.precioListaActual) > 0.01
  ).length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Importar Remito Proveedor
          </DialogTitle>
        </DialogHeader>

        {/* STEP 1: Upload */}
        {step === "upload" && (
          <div className="flex-1 flex flex-col items-center justify-center py-6 gap-4">
            {parsing ? (
              <div className="flex flex-col items-center gap-3 text-muted-foreground">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="text-sm font-medium">{progressMsg || `Procesando ${fileName}...`}</p>
                <p className="text-xs text-muted-foreground">
                  El OCR puede tardar unos segundos por página
                </p>
              </div>
            ) : (
              <>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  className={cn(
                    "w-full border-2 border-dashed rounded-2xl p-10 flex flex-col items-center gap-3 cursor-pointer transition-colors",
                    dragging
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50 hover:bg-muted/30"
                  )}
                >
                  <div className="rounded-full bg-primary/10 p-4">
                    <Upload className="h-8 w-8 text-primary" />
                  </div>
                  <div className="text-center">
                    <p className="font-medium text-foreground">
                      Subí el remito del proveedor
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Arrastrá el PDF acá o hacé click para seleccionarlo
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    Solo archivos PDF
                  </Badge>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </>
            )}
          </div>
        )}

        {/* STEP 2: Review */}
        {step === "review" && (
          <div className="flex-1 flex flex-col gap-4 overflow-hidden">
            {/* Info remito — siempre visible, editable */}
            <div className="rounded-xl bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 p-3 space-y-2">
              <p className="text-[10px] font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wide">Datos para cuenta corriente mayorista</p>
              <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-2 items-center">
                <label className="text-xs font-semibold text-purple-700 dark:text-purple-300 whitespace-nowrap">Nro Boleta:</label>
                <Input
                  value={remitoNro}
                  onChange={(e) => setRemitoNro(e.target.value)}
                  placeholder="Ej: 2007-00091112"
                  className="h-7 text-xs bg-white dark:bg-background"
                />
                <label className="text-xs font-semibold text-purple-700 dark:text-purple-300 whitespace-nowrap">Nombre:</label>
                <Input
                  value={remitoSenor}
                  onChange={(e) => setRemitoSenor(e.target.value)}
                  placeholder="Ej: J & J DISTRIBUCIONES 2"
                  className="h-7 text-xs bg-white dark:bg-background"
                />
                <label className="text-xs font-semibold text-purple-700 dark:text-purple-300 whitespace-nowrap">Monto:</label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={remitoTotal || ""}
                      onChange={(e) => setRemitoTotal(parseFloat(e.target.value) || 0)}
                      placeholder="0"
                      className="h-7 text-xs pl-5 bg-white dark:bg-background"
                    />
                  </div>
                  <span className="text-[10px] text-purple-600 dark:text-purple-400 whitespace-nowrap">→ cta. mayorista</span>
                </div>
              </div>
            </div>

            {/* Resumen */}
            <div className="flex items-center gap-3 flex-wrap">
              <Badge variant="outline" className="gap-1.5 text-xs">
                <FileText className="h-3.5 w-3.5" />
                {fileName}
              </Badge>
              <Badge className="gap-1.5 text-xs bg-green-500/15 text-green-700 border-green-200">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {matchedCount} coincidencias
              </Badge>
              {toEnableCount > 0 && (
                <Badge className="gap-1.5 text-xs bg-teal-500/15 text-teal-700 border-teal-200">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {toEnableCount} se habilitarán
                </Badge>
              )}
              {priceChangedCount > 0 && (
                <Badge
                  variant="outline"
                  className="gap-1.5 text-xs text-amber-600 border-amber-200"
                >
                  ⚠ {priceChangedCount} con cambio de precio
                </Badge>
              )}
              {unmatchedCount > 0 && (
                <Badge
                  variant="outline"
                  className="gap-1.5 text-xs text-amber-600 border-amber-200"
                >
                  <AlertCircle className="h-3.5 w-3.5" />
                  {unmatchedCount} sin coincidencia
                </Badge>
              )}
            </div>

            {/* Lista scrolleable */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {/* Items con match */}
              {items
                .map((item, index) => ({ item, index }))
                .filter(({ item }) => item.matchedProduct !== null || item.mpId)
                .map(({ item, index }) => (
                  <div
                    key={index}
                    className="border border-border rounded-xl p-3 bg-card flex flex-col gap-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground truncate">
                          Remito: [{item.parsedItem.codigo}] {item.parsedItem.rawName}
                        </p>
                        <p className="font-medium text-sm truncate flex items-center gap-1.5">
                          {item.matchedProduct?.name ?? item.parsedItem.rawName}
                          {!item.matchedProduct ? (
                            <span className="shrink-0 text-[10px] font-semibold text-teal-700 bg-teal-100 border border-teal-200 rounded px-1.5 py-0.5">
                              Se creará y habilitará
                            </span>
                          ) : item.needsEnable ? (
                            <span className="shrink-0 text-[10px] font-semibold text-teal-700 bg-teal-100 border border-teal-200 rounded px-1.5 py-0.5">
                              Se habilitará
                            </span>
                          ) : null}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Stock actual: {item.matchedProduct?.stock ?? 0} · Cantidad: {item.parsedItem.cantidad}
                        </p>
                        {item.precioListaActual != null && item.precioListaActual > 0 && Math.abs(item.parsedItem.precio - item.precioListaActual) > 0.01 ? (
                          <p className="text-xs font-medium text-amber-600">
                            ⚠ Precio cambió: {formatCurrency(item.precioListaActual)} → {formatCurrency(item.parsedItem.precio)}
                            {" "}({item.parsedItem.precio > item.precioListaActual ? "+" : ""}{((item.parsedItem.precio - item.precioListaActual) / item.precioListaActual * 100).toFixed(1)}%)
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            Precio lista: {formatCurrency(item.parsedItem.precio)} ✓
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => removeItem(index)}
                        className="text-muted-foreground hover:text-destructive transition-colors mt-0.5"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Cantidad */}
                      <div className="flex items-center gap-1.5">
                        <label className="text-xs text-muted-foreground whitespace-nowrap">
                          Cantidad:
                        </label>
                        <Input
                          type="number"
                          min={0}
                          value={item.quantity}
                          onChange={(e) => updateQuantity(index, e.target.value)}
                          className="h-7 w-20 text-xs"
                        />
                      </div>

                      {/* Preview del resultado */}
                      <div className="ml-auto text-xs text-muted-foreground">
                        {" "}
                        <span className="font-semibold text-foreground">
                          {(item.matchedProduct?.stock ?? 0) + item.quantity}
                        </span>{" "}
                        unidades
                      </div>
                    </div>

                    {/* Cambiar producto manualmente (solo si ya tiene ficha) */}
                    {item.matchedProduct && (
                    <div className="flex items-center gap-1.5">
                      <label className="text-xs text-muted-foreground whitespace-nowrap">
                        Producto:
                      </label>
                      <select
                        value={item.matchedProduct.id}
                        onChange={(e) => updateMatch(index, e.target.value)}
                        className="flex-1 text-xs border border-border rounded-md px-2 py-1 bg-background"
                      >
                        {/* Incluir el producto matcheado si no está en la lista */}
                        {!products.some((p) => p.id === item.matchedProduct!.id) && (
                          <option value={item.matchedProduct.id}>
                            {item.matchedProduct.name}
                          </option>
                        )}
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    )}
                  </div>
                ))}

              {/* Items sin match */}
              {unmatchedCount > 0 && (
                <div className="border border-amber-200 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setShowUnmatched(!showUnmatched)}
                    className="w-full flex items-center justify-between px-3 py-2 bg-amber-50 text-amber-700 text-xs font-medium"
                  >
                    <span className="flex items-center gap-1.5">
                      <AlertCircle className="h-3.5 w-3.5" />
                      {unmatchedCount} item(s) del remito sin coincidencia
                    </span>
                    {showUnmatched ? (
                      <ChevronUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                  </button>

                  {showUnmatched && (
                    <div className="divide-y divide-border">
                      {items
                        .map((item, index) => ({ item, index }))
                        .filter(({ item }) => item.matchedProduct === null && !item.mpId)
                        .map(({ item, index }) => (
                          <div
                            key={index}
                            className="px-3 py-2.5 flex items-center gap-2 bg-card"
                          >
                            <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate">
                                [{item.parsedItem.codigo}] {item.parsedItem.rawName}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Cantidad: {item.parsedItem.cantidad} · Bultos: {item.parsedItem.bultos} · Precio lista: {formatCurrency(item.parsedItem.precio)}
                              </p>
                            </div>
                            {/* Asignar producto manualmente */}
                            <select
                              value=""
                              onChange={(e) => {
                                if (e.target.value) updateMatch(index, e.target.value);
                              }}
                              className="text-xs border border-border rounded-md px-2 py-1 bg-background max-w-[160px]"
                            >
                              <option value="">Asignar...</option>
                              {products.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={() => removeItem(index)}
                              className="text-muted-foreground hover:text-destructive transition-colors"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {step === "review" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setStep("upload");
                setItems([]);
                setFileName("");
              }}
              disabled={confirming}
            >
              Volver
            </Button>
          )}
          <Button variant="outline" onClick={handleClose} disabled={confirming}>
            Cancelar
          </Button>
          {step === "review" && (
            <Button
              onClick={handleConfirm}
              disabled={processableCount === 0 || confirming}
              className="bg-primary hover:bg-primary/90"
            >
              {confirming ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Actualizando...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Confirmar ({processableCount} producto
                  {processableCount !== 1 ? "s" : ""})
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
