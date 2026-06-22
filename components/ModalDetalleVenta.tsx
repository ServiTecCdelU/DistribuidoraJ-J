"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Package,
  FileText,
  Truck,
  Banknote,
  CreditCard,
  Clock,
  Download,
  Send,
  Loader2,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { descargarDocumento, enviarWhatsapp } from "@/lib/utils/doc-actions";
import type { Venta } from "../types";
import { Scissors, RotateCcw, Tag, ArrowLeftRight } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { ModalDevolucion } from "@/components/ModalDevolucion";
import { ModalDescuentoVenta } from "@/components/ModalDescuentoVenta";
import { ModalConvertirPago } from "@/components/ModalConvertirPago";
import { devolucionesApi, ajustesVentaApi, type Devolucion, type DescuentoVenta } from "@/lib/api";
import { parseDescuentoDescripcion } from "@/lib/utils/ajuste-venta";

interface ModalDetalleVentaProps {
  abierto: boolean;
  venta: Venta | null;
  onCerrar: () => void;
  onGenerarDoc: (venta: Venta, tipo: "boleta" | "remito") => Promise<void>;
  formatearMoneda: (monto: number) => string;
  formatearFechaHora: (fecha: any) => string;
  etiquetaPago: (tipo: string, metodo?: string) => string;
  claseBadgePago: (tipo: string, metodo?: string) => string;
  resolverTelefono?: (venta: Venta) => Promise<string>;
  isAdmin?: boolean;
  onActualizado?: () => void;
}

export function ModalDetalleVenta({
  abierto,
  venta,
  onCerrar,
  onGenerarDoc,
  formatearMoneda,
  formatearFechaHora,
  etiquetaPago,
  claseBadgePago,
  resolverTelefono,
  isAdmin = true,
  onActualizado,
}: ModalDetalleVentaProps) {
  const [generando, setGenerando] = useState<"boleta" | "remito" | null>(null);
  const [downloading, setDownloading] = useState<"invoice" | "remito" | null>(null);
  const [generandoDoble, setGenerandoDoble] = useState(false);
  const [incidencias, setIncidencias] = useState<{ roturas: string[]; faltantes: string[]; noQuiere: string[] }>({ roturas: [], faltantes: [], noQuiere: [] });
  const [verTodosIncidencias, setVerTodosIncidencias] = useState(false);
  const [modalDevAbierto, setModalDevAbierto] = useState(false);
  const [modalDescAbierto, setModalDescAbierto] = useState(false);
  const [modalConvAbierto, setModalConvAbierto] = useState(false);
  const [devoluciones, setDevoluciones] = useState<Devolucion[]>([]);
  const [descuentos, setDescuentos] = useState<DescuentoVenta[]>([]);

  const cargarDevoluciones = () => {
    if (!venta?.id) return;
    devolucionesApi.getBySale(venta.id).then(setDevoluciones).catch(() => {});
  };

  const cargarDescuentos = () => {
    if (!venta?.id) return;
    ajustesVentaApi.getDescuentosBySale(venta.id).then(setDescuentos).catch(() => {});
  };

  useEffect(() => {
    if (!venta?.id || !abierto) {
      setDevoluciones([]);
      setDescuentos([]);
      return;
    }
    devolucionesApi.getBySale(venta.id).then(setDevoluciones).catch(() => {});
    ajustesVentaApi.getDescuentosBySale(venta.id).then(setDescuentos).catch(() => {});
  }, [venta?.id, abierto]);

  useEffect(() => {
    if (!venta?.id || !abierto) return;
    setIncidencias({ roturas: [], faltantes: [], noQuiere: [] });
    supabase
      .from("transacciones")
      .select("description")
      .eq("sale_id", venta.id)
      .or("description.like.[ROTURA]%,description.like.[FALTANTE]%,description.like.[NO_QUIERE]%")
      .then(({ data }) => {
        const roturas: string[] = [];
        const faltantes: string[] = [];
        const noQuiere: string[] = [];
        for (const row of data ?? []) {
          const desc = row.description || "";
          if (desc.startsWith("[ROTURA]")) {
            roturas.push(desc.replace(/^\[ROTURA\]\s*#[\w-]+\s*—\s*/, "").replace(/^\[ROTURA\]\s*/, ""));
          } else if (desc.startsWith("[FALTANTE]")) {
            faltantes.push(desc.replace(/^\[FALTANTE\]\s*#[\w-]+\s*—\s*/, "").replace(/^\[FALTANTE\]\s*/, ""));
          } else if (desc.startsWith("[NO_QUIERE]")) {
            noQuiere.push(desc.replace(/^\[NO_QUIERE\]\s*#[\w-]+\s*—\s*/, "").replace(/^\[NO_QUIERE\]\s*/, ""));
          }
        }
        setIncidencias({ roturas, faltantes, noQuiere });
      });
  }, [venta?.id, abierto]);

  const handleBoletaDoble = async () => {
    if (!venta) return;
    setGenerandoDoble(true);
    try {
      const { generarBoletaDoble } = await import("@/hooks/useGenerarPdf");
      const base64 = await generarBoletaDoble(venta as any, (venta as any).afipData);
      const link = document.createElement("a");
      link.href = `data:application/pdf;base64,${base64}`;
      link.download = `boleta-media-hoja-${venta.invoiceNumber || venta.id}.pdf`;
      link.click();
    } catch (e: any) {
      toast.error("Error generando media hoja");
    } finally {
      setGenerandoDoble(false);
    }
  };

  if (!venta) return null;

  const handleDescargar = (type: "invoice" | "remito") => {
    setDownloading(type);
    const base64 = type === "invoice" ? (venta as any).invoicePdfBase64 : (venta as any).remitoPdfBase64;
    const tipo = type === "invoice" ? "boleta" as const : "remito" as const;
    const numero = type === "invoice" ? venta.invoiceNumber : venta.remitoNumber;
    descargarDocumento(base64, tipo, numero, venta.clientName);
    setDownloading(null);
  };

  const handleWhatsapp = async (type: "invoice" | "remito") => {
    const base64 = type === "invoice" ? (venta as any).invoicePdfBase64 : (venta as any).remitoPdfBase64;
    const tipo = type === "invoice" ? "boleta" as const : "remito" as const;
    const numero = type === "invoice" ? venta.invoiceNumber : venta.remitoNumber;
    await enviarWhatsapp(
      base64,
      tipo,
      numero,
      venta.clientName,
      venta.clientPhone,
      resolverTelefono ? () => resolverTelefono(venta) : undefined,
    );
  };

  const handleGenerar = async (tipo: "boleta" | "remito") => {
    setGenerando(tipo);
    try {
      await onGenerarDoc(venta, tipo);
    } finally {
      setGenerando(null);
    }
  };

  const descargarRecibo = (dev: Devolucion) => {
    if (!dev.reciboPdfBase64) {
      toast.error("Esta devolución no tiene recibo guardado");
      return;
    }
    const link = document.createElement("a");
    link.href = `data:application/pdf;base64,${dev.reciboPdfBase64}`;
    link.download = `recibo-devolucion-${dev.reciboNumero}.pdf`;
    link.click();
  };

  const descargarReciboDescuento = (desc: DescuentoVenta) => {
    if (!desc.reciboPdfBase64) {
      toast.error("Este descuento no tiene recibo guardado");
      return;
    }
    const link = document.createElement("a");
    link.href = `data:application/pdf;base64,${desc.reciboPdfBase64}`;
    link.download = `recibo-descuento-${desc.reciboNumero}.pdf`;
    link.click();
  };

  const tieneCredito =
    venta?.paymentType === "credit" ||
    (venta?.paymentType === "mixed" && (venta?.creditAmount ?? 0) > 0);

  const handleActualizado = () => {
    cargarDescuentos();
    cargarDevoluciones();
    onActualizado?.();
  };

  return (
    <>
    <Dialog open={abierto} onOpenChange={onCerrar}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-br from-primary/5 to-primary/10 p-6 border-b border-border/50">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-white dark:bg-background shadow-sm flex items-center justify-center">
                <FileText className="h-6 w-6 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold text-foreground">
                  {venta.rechazado ? "Pedido rechazado" : `Venta ${venta.saleNumber || "?"}`}
                </DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Clock className="h-3.5 w-3.5" />
                  {formatearFechaHora(venta.createdAt)}
                </DialogDescription>
                {venta.hojaRutaNumber && (
                  <p className="text-xs text-teal-600 font-medium mt-0.5">Hoja de ruta N° {venta.hojaRutaNumber}</p>
                )}
              </div>
            </div>
            <Badge
              variant="outline"
              className={venta.rechazado
                ? "bg-red-100 text-red-700 border-red-200 px-3 py-1"
                : `${claseBadgePago(venta.paymentType, venta.paymentMethod)} px-3 py-1`}
            >
              {venta.rechazado ? "Rechazado" : etiquetaPago(venta.paymentType, venta.paymentMethod)}
            </Badge>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Cliente y Vendedor */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Cliente</p>
              <div className="flex items-center gap-2">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-primary/10 text-primary text-xs">
                    {(venta.clientName || "C").charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <p className="font-medium text-foreground">{venta.clientName || "Cliente final"}</p>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Vendedor</p>
              <p className={`font-medium ${venta.sellerName ? "text-foreground" : "text-muted-foreground italic"}`}>
                {venta.sellerName || "Sin vendedor"}
              </p>
            </div>
          </div>

          {/* Documentos */}
          <div className="grid grid-cols-1 gap-3">
            {/* Boleta — deshabilitado temporalmente */}
            {/* {isAdmin && (
            <div className={`p-4 rounded-xl border ${venta.invoiceEmitted ? "bg-emerald-50/50 border-emerald-200" : "bg-amber-50/50 border-amber-200"}`}>
              <div className="flex items-center gap-2 mb-2">
                <FileText className={`h-4 w-4 ${venta.invoiceEmitted ? "text-emerald-600" : "text-amber-600"}`} />
                <span className="text-xs font-medium text-muted-foreground">Boleta</span>
                {venta.invoiceEmitted && <CheckCircle className="h-3.5 w-3.5 text-emerald-500 ml-auto" />}
              </div>
              <p className={`font-semibold text-sm ${venta.invoiceEmitted ? "text-emerald-700" : "text-amber-700"}`}>
                {venta.invoiceEmitted ? (venta.invoiceNumber || "Emitida") : "Pendiente"}
              </p>

              {venta.invoiceEmitted ? (
                <div className="flex flex-col gap-1.5 mt-3">
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1 gap-1 text-xs"
                      disabled={downloading === "invoice"} onClick={() => handleDescargar("invoice")}>
                      {downloading === "invoice" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                      PDF
                    </Button>
                    <Button size="sm" className="flex-1 gap-1 text-xs bg-green-500 hover:bg-green-600 text-white"
                      onClick={() => handleWhatsapp("invoice")}>
                      <Send className="h-3 w-3" />
                      WhatsApp
                    </Button>
                  </div>
                  <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs"
                    onClick={handleBoletaDoble} disabled={generandoDoble}>
                    {generandoDoble ? <Loader2 className="h-3 w-3 animate-spin" /> : <Scissors className="h-3 w-3" />}
                    Media hoja (2 copias)
                  </Button>
                </div>
              ) : (
                <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs mt-3 border-amber-300 text-amber-700 hover:bg-amber-50"
                  onClick={() => handleGenerar("boleta")} disabled={generando !== null}>
                  {generando === "boleta" ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Generando...
                    </>
                  ) : (
                    <>
                      <FileText className="h-3.5 w-3.5" />
                      Generar Boleta
                    </>
                  )}
                </Button>
              )}
            </div>
            )} */}

            {/* Remito */}
            {(isAdmin || venta.remitoNumber) && (
            <div className={`p-4 rounded-xl border ${venta.rechazado && venta.remitoNumber ? "bg-red-50/60 border-red-200" : venta.remitoNumber ? "bg-blue-50/50 border-blue-200" : "bg-muted/50 border-border"}`}>
              <div className="flex items-center gap-2 mb-2">
                <Truck className={`h-4 w-4 ${venta.rechazado && venta.remitoNumber ? "text-red-600" : venta.remitoNumber ? "text-blue-600" : "text-muted-foreground"}`} />
                <span className="text-xs font-medium text-muted-foreground">Remito</span>
                {venta.rechazado && venta.remitoNumber ? (
                  <span className="ml-auto text-[10px] font-bold uppercase tracking-wide text-red-600 bg-red-100 px-2 py-0.5 rounded-full">Cancelado</span>
                ) : venta.remitoNumber ? (
                  <CheckCircle className="h-3.5 w-3.5 text-blue-500 ml-auto" />
                ) : null}
              </div>
              <p className={`font-semibold text-sm ${venta.rechazado && venta.remitoNumber ? "text-red-700 line-through" : venta.remitoNumber ? "text-blue-700" : "text-muted-foreground"}`}>
                {venta.remitoNumber || "Sin remito"}
              </p>
              {venta.rechazado && venta.remitoNumber && (
                <p className="text-[11px] text-red-600 mt-0.5">El cliente no recibió el pedido — remito anulado</p>
              )}

              {venta.remitoNumber ? (
                <div className="flex gap-2 mt-3">
                  <Button variant="outline" size="sm" className="flex-1 gap-1 text-xs"
                    disabled={downloading === "remito"} onClick={() => handleDescargar("remito")}>
                    {downloading === "remito" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                    PDF
                  </Button>
                  <Button size="sm" className="flex-1 gap-1 text-xs bg-green-500 hover:bg-green-600 text-white"
                    onClick={() => handleWhatsapp("remito")}>
                    <Send className="h-3 w-3" />
                    WhatsApp
                  </Button>
                </div>
              ) : isAdmin ? (
                <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs mt-3"
                  onClick={() => handleGenerar("remito")} disabled={generando !== null}>
                  {generando === "remito" ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Generando...
                    </>
                  ) : (
                    <>
                      <Truck className="h-3.5 w-3.5" />
                      Generar Remito
                    </>
                  )}
                </Button>
              ) : null}
            </div>
            )}
          </div>

          {/* Productos */}
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Package className="h-3.5 w-3.5" />
              Productos ({venta.items.length})
            </p>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {venta.items.map((item, i) => {
                const dto = (item as any).itemDiscount || 0;
                const precioConDto = item.price * (1 - dto / 100);
                const subtotalItem = precioConDto * item.quantity;
                return (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/40">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-background border border-border/50 flex items-center justify-center text-xs font-medium text-muted-foreground">
                        x{item.quantity}
                      </div>
                      <div>
                        <p className="font-medium text-sm text-foreground">{item.name}</p>
                        <div className="flex items-center gap-1.5">
                          <p className={`text-xs ${dto > 0 ? "line-through text-muted-foreground/60" : "text-muted-foreground"}`}>{formatearMoneda(item.price)} c/u</p>
                          {dto > 0 && (
                            <>
                              <p className="text-xs text-emerald-600">{formatearMoneda(precioConDto)} c/u</p>
                              <span className="text-xs bg-emerald-100 text-emerald-700 px-1 rounded font-medium">-{dto}%</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <p className="font-semibold text-foreground">{formatearMoneda(subtotalItem)}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Devoluciones registradas */}
          {devoluciones.length > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/40 overflow-hidden">
              <p className="text-xs font-medium text-amber-700 uppercase tracking-wider px-4 pt-3 pb-2">
                Devoluciones
              </p>
              <div className="divide-y divide-amber-100">
                {devoluciones.map((dev) => (
                  <div key={dev.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-amber-800">{dev.reciboNumero}</p>
                      <p className="text-xs text-amber-700/80">
                        {dev.items.reduce((a, i) => a + i.quantity, 0)} u. · {formatearMoneda(dev.total)}
                        {dev.commissionAmount > 0 ? ` · comisión -${formatearMoneda(dev.commissionAmount)}` : ""}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1 text-xs shrink-0"
                      onClick={() => descargarRecibo(dev)}
                    >
                      <Download className="h-3 w-3" />
                      Recibo
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Descuentos registrados */}
          {descuentos.length > 0 && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 overflow-hidden">
              <p className="text-xs font-medium text-emerald-700 uppercase tracking-wider px-4 pt-3 pb-2">
                Descuentos
              </p>
              <div className="divide-y divide-emerald-100">
                {descuentos.map((desc) => {
                  const parsed = parseDescuentoDescripcion(desc.description);
                  return (
                    <div key={desc.id} className="px-4 py-2.5 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-emerald-800">-{formatearMoneda(desc.monto)}</p>
                        {desc.reciboPdfBase64 && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1 text-xs shrink-0"
                            onClick={() => descargarReciboDescuento(desc)}
                          >
                            <Download className="h-3 w-3" />
                            Recibo
                          </Button>
                        )}
                      </div>

                      {parsed.items.length > 0 ? (
                        <div className="space-y-0.5">
                          {parsed.items.map((it, i) => {
                            const prod = venta.items.find((p) => p.name === it.name);
                            const dtoPrevio = (prod as any)?.itemDiscount || 0;
                            const precioUnit = prod ? prod.price * (1 - dtoPrevio / 100) : 0;
                            const lineDto = precioUnit * (prod?.quantity || 0) * (it.pct / 100);
                            return (
                              <div key={i} className="flex items-center justify-between gap-2 text-xs">
                                <span className="text-emerald-700/90 truncate">
                                  {prod ? `${prod.quantity}x ` : ""}
                                  {it.name}
                                </span>
                                <span className="text-emerald-700 font-medium shrink-0 tabular-nums">
                                  -{it.pct}%
                                  {prod ? ` · -${formatearMoneda(lineDto)}` : ""}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      ) : parsed.final ? (
                        <p className="text-xs text-emerald-700/90">Descuento final sobre el total</p>
                      ) : null}

                      {parsed.motivo && (
                        <p className="text-[11px] text-muted-foreground">Motivo: {parsed.motivo}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Acciones admin */}
          {isAdmin && !venta.rechazado && (
            <div className="grid grid-cols-1 gap-2">
              {venta.items.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-1.5 text-xs border-amber-300 text-amber-700 hover:bg-amber-50"
                  onClick={() => setModalDevAbierto(true)}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Registrar devolución
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-1.5 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                onClick={() => setModalDescAbierto(true)}
              >
                <Tag className="h-3.5 w-3.5" />
                Registrar descuento
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-1.5 text-xs border-sky-300 text-sky-700 hover:bg-sky-50"
                onClick={() => setModalConvAbierto(true)}
              >
                <ArrowLeftRight className="h-3.5 w-3.5" />
                {tieneCredito ? "Marcar como pagada" : "Pasar a cuenta corriente"}
              </Button>
            </div>
          )}

          {/* Pago mixto */}
          {venta.paymentType === "mixed" && (
            <div className="p-4 rounded-xl bg-amber-50/50 border border-amber-200 space-y-2">
              <p className="text-xs font-medium text-amber-800 uppercase tracking-wider">Detalle de Pago Mixto</p>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2 text-sm text-amber-700">
                  <Banknote className="h-4 w-4" />
                  {venta.paymentMethod === "transferencia" ? "Transferencia" : "Efectivo"}
                </div>
                <span className="font-semibold text-amber-800">{formatearMoneda(venta.cashAmount || 0)}</span>
              </div>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2 text-sm text-amber-700">
                  <CreditCard className="h-4 w-4" />
                  Cuenta Corriente
                </div>
                <span className="font-semibold text-amber-800">{formatearMoneda(venta.creditAmount || 0)}</span>
              </div>
            </div>
          )}

          {/* Descuentos */}
          {(() => {
            const hayItemDtos = venta.items.some((i) => (i as any).itemDiscount > 0);
            const saleDiscount = (venta as any).discount || 0;
            const subtotalBruto = venta.items.reduce((acc, i) => acc + i.price * i.quantity, 0);
            const subtotalConItemDtos = venta.items.reduce((acc, i) => {
              const dto = (i as any).itemDiscount || 0;
              return acc + i.price * (1 - dto / 100) * i.quantity;
            }, 0);
            if (!hayItemDtos && saleDiscount <= 0) return null;
            return (
              <div className="space-y-1.5 px-1">
                {(hayItemDtos || saleDiscount > 0) && (
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>Subtotal bruto</span>
                    <span>{formatearMoneda(subtotalBruto)}</span>
                  </div>
                )}
                {hayItemDtos && (
                  <div className="flex items-center justify-between text-sm text-emerald-600">
                    <span>Dto. por producto</span>
                    <span>-{formatearMoneda(subtotalBruto - subtotalConItemDtos)}</span>
                  </div>
                )}
                {saleDiscount > 0 && (
                  <div className="flex items-center justify-between text-sm text-emerald-600">
                    <span>Dto. venta{(venta as any).discountType === "percent" ? ` (${saleDiscount}%)` : ""}</span>
                    <span>-{formatearMoneda(
                      (venta as any).discountType === "percent"
                        ? (subtotalConItemDtos * saleDiscount) / 100
                        : saleDiscount,
                    )}</span>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Total */}
          {venta.rechazado ? (
            <div className="flex items-center justify-between p-4 rounded-xl bg-red-50 border border-red-200 text-red-700">
              <span className="font-medium">Estado</span>
              <span className="text-xl font-bold">Rechazado por el cliente</span>
            </div>
          ) : (
            <div className="flex items-center justify-between p-4 rounded-xl bg-foreground text-background">
              <span className="font-medium">Total</span>
              <span className="text-2xl font-bold">{formatearMoneda(venta.total)}</span>
            </div>
          )}

          {/* Incidencias del pedido */}
          {(() => {
            const rows = [
              ...incidencias.roturas.map(r => ({ label: "Se rompió", text: r, color: "text-rose-700", dot: "bg-rose-400" })),
              ...incidencias.faltantes.map(f => ({ label: "Faltó", text: f, color: "text-amber-700", dot: "bg-amber-400" })),
              ...incidencias.noQuiere.map(n => ({ label: "No quiso", text: n, color: "text-muted-foreground", dot: "bg-muted-foreground/40" })),
            ];
            if (rows.length === 0) return null;
            const visibles = verTodosIncidencias ? rows : rows.slice(0, 3);
            return (
              <div className="rounded-xl border border-rose-200 bg-rose-50/50 overflow-hidden">
                <p className="text-xs font-medium text-rose-700 uppercase tracking-wider px-4 pt-3 pb-2">Incidencias del pedido</p>
                <table className="w-full text-xs">
                  <tbody>
                    {visibles.map((row, i) => (
                      <tr key={i} className="border-t border-rose-100 first:border-0">
                        <td className="px-4 py-1.5 w-24">
                          <span className={`inline-flex items-center gap-1.5 font-medium ${row.color}`}>
                            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${row.dot}`} />
                            {row.label}
                          </span>
                        </td>
                        <td className={`px-4 py-1.5 ${row.color}`}>{row.text}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 3 && (
                  <button
                    type="button"
                    className="w-full text-xs text-rose-600 hover:text-rose-800 py-2 border-t border-rose-100 font-medium transition-colors"
                    onClick={() => setVerTodosIncidencias(v => !v)}
                  >
                    {verTodosIncidencias ? "Mostrar menos" : `Ver todos (${rows.length})`}
                  </button>
                )}
              </div>
            );
          })()}
        </div>
      </DialogContent>
    </Dialog>

    <ModalDevolucion
      abierto={modalDevAbierto}
      venta={venta}
      onCerrar={() => setModalDevAbierto(false)}
      onRegistrada={handleActualizado}
    />

    <ModalDescuentoVenta
      abierto={modalDescAbierto}
      venta={venta}
      onCerrar={() => setModalDescAbierto(false)}
      onRegistrada={handleActualizado}
    />

    <ModalConvertirPago
      abierto={modalConvAbierto}
      venta={venta}
      onCerrar={() => setModalConvAbierto(false)}
      onActualizado={handleActualizado}
    />
    </>
  );
}
