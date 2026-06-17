"use client";

import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Percent, DollarSign, Loader2, Tag, Package } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils/format";
import { calcularMontoDescuento } from "@/lib/utils/ajuste-venta";
import { clientsApi, ajustesVentaApi, paymentsApi } from "@/lib/api";
import type { Venta } from "../app/ventas/types";

interface ModalDescuentoVentaProps {
  abierto: boolean;
  venta: Venta | null;
  onCerrar: () => void;
  onRegistrada?: () => void;
}

interface FilaProducto {
  name: string;
  codigo?: string;
  precioUnit: number; // precio con dto. previo aplicado
  cantidad: number;
  subtotal: number;
  pct: number; // % de descuento a aplicar a esta línea
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function ModalDescuentoVenta({ abierto, venta, onCerrar, onRegistrada }: ModalDescuentoVentaProps) {
  const [modo, setModo] = useState<"porProducto" | "final">("porProducto");
  const [filas, setFilas] = useState<FilaProducto[]>([]);
  const [tipoFinal, setTipoFinal] = useState<"percent" | "amount">("percent");
  const [valorFinal, setValorFinal] = useState<string>("");
  const [motivo, setMotivo] = useState<string>("");
  const [procesando, setProcesando] = useState(false);
  const [inicializado, setInicializado] = useState<string | null>(null);

  const total = venta?.total || 0;

  // Inicializar filas al abrir con una venta nueva
  const ventaId = venta?.id ?? null;
  if (abierto && venta && inicializado !== ventaId) {
    const nuevas: FilaProducto[] = venta.items
      .filter((it) => it.productId && !(it as any).esRegalo)
      .map((it) => {
        const dto = (it as any).itemDiscount || 0;
        const precioUnit = it.price * (1 - dto / 100);
        return {
          name: it.name,
          codigo: (it as any).codigo,
          precioUnit,
          cantidad: it.quantity,
          subtotal: round2(precioUnit * it.quantity),
          pct: 0,
        };
      });
    setFilas(nuevas);
    setInicializado(ventaId);
  }

  const montoPorProducto = useMemo(
    () => round2(filas.reduce((acc, f) => acc + (f.subtotal * (f.pct || 0)) / 100, 0)),
    [filas],
  );

  const montoFinal = useMemo(
    () => calcularMontoDescuento(total, tipoFinal, Number(valorFinal)),
    [total, tipoFinal, valorFinal],
  );

  const monto = modo === "porProducto" ? montoPorProducto : montoFinal;
  const nuevoTotal = Math.max(0, total - monto);

  const setPct = (idx: number, value: number) => {
    setFilas((prev) =>
      prev.map((f, i) => (i === idx ? { ...f, pct: Math.max(0, Math.min(100, value || 0)) } : f)),
    );
  };

  const cerrar = () => {
    if (procesando) return;
    setInicializado(null);
    setFilas([]);
    setModo("porProducto");
    setTipoFinal("percent");
    setValorFinal("");
    setMotivo("");
    onCerrar();
  };

  const confirmar = async () => {
    if (!venta || monto <= 0) return;
    setProcesando(true);
    try {
      let saldoAnterior = 0;
      if (venta.clientId) {
        const cli = await clientsApi.getById(venta.clientId);
        saldoAnterior = Number(cli?.currentBalance) || 0;
      }

      // Detalle del descuento para la descripción / recibo
      const detalle =
        modo === "porProducto"
          ? filas.filter((f) => f.pct > 0).map((f) => `${f.name} -${f.pct}%`).join(", ")
          : tipoFinal === "percent"
            ? `Final -${Number(valorFinal)}%`
            : `Final -${formatCurrency(monto)}`;
      const motivoFinal = `${detalle}${motivo.trim() ? ` (${motivo.trim()})` : ""}`.trim() || undefined;

      const desc = await ajustesVentaApi.registrarDescuento({
        saleId: venta.id,
        saleNumber: venta.saleNumber ? String(venta.saleNumber) : undefined,
        clientId: venta.clientId,
        clientName: venta.clientName,
        sellerId: venta.sellerId,
        sellerName: venta.sellerName,
        monto,
        motivo: motivoFinal,
      });

      try {
        const { generarReciboDescuento } = await import("@/hooks/useGenerarPdf");
        const itemsRecibo =
          modo === "porProducto"
            ? filas
                .filter((f) => f.pct > 0)
                .map((f) => ({
                  name: f.name,
                  quantity: f.cantidad,
                  precioUnit: f.precioUnit,
                  pct: f.pct,
                  descuento: round2((f.subtotal * f.pct) / 100),
                }))
            : [];
        const base64 = await generarReciboDescuento({
          reciboNumero: desc.reciboNumero,
          fecha: desc.createdAt,
          clientName: venta.clientName,
          clientPhone: venta.clientPhone,
          saleNumber: venta.saleNumber ? String(venta.saleNumber) : undefined,
          items: itemsRecibo,
          motivo: motivo.trim() || undefined,
          total: desc.monto,
          saldoAnterior,
          saldoNuevo: saldoAnterior - desc.monto,
        });
        await paymentsApi.saveReciboPdf(desc.id, base64);
        const link = document.createElement("a");
        link.href = `data:application/pdf;base64,${base64}`;
        link.download = `recibo-descuento-${desc.reciboNumero}.pdf`;
        link.click();
      } catch {
        toast.warning("Descuento registrado, pero falló la generación del recibo");
      }

      toast.success(`Descuento aplicado: ${formatCurrency(desc.monto)}`);
      cerrar();
      onRegistrada?.();
    } catch (e: any) {
      toast.error(e?.message || "Error al registrar el descuento");
    } finally {
      setProcesando(false);
    }
  };

  if (!venta) return null;

  return (
    <Dialog open={abierto} onOpenChange={cerrar}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="bg-gradient-to-br from-emerald-500/5 to-emerald-500/10 p-6 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-white dark:bg-background shadow-sm flex items-center justify-center">
              <Tag className="h-6 w-6 text-emerald-600" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold text-foreground">Registrar descuento</DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                {venta.clientName || "Cliente final"} · Venta {venta.saleNumber || "?"}
              </DialogDescription>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {/* Modo de descuento */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setModo("porProducto")}
              className={`flex-1 flex items-center justify-center gap-1.5 text-sm font-medium py-2.5 rounded-2xl border transition-colors ${
                modo === "porProducto"
                  ? "bg-teal-50 border-teal-300 text-teal-700"
                  : "border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              <Package className="h-4 w-4" />
              Por producto
            </button>
            <button
              type="button"
              onClick={() => setModo("final")}
              className={`flex-1 flex items-center justify-center gap-1.5 text-sm font-medium py-2.5 rounded-2xl border transition-colors ${
                modo === "final"
                  ? "bg-teal-50 border-teal-300 text-teal-700"
                  : "border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              <Percent className="h-4 w-4" />
              Descuento final
            </button>
          </div>

          {/* Lista de productos */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Productos ({filas.length})
            </p>
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {filas.map((f, idx) => {
                const lineDto = round2((f.subtotal * (f.pct || 0)) / 100);
                return (
                  <div key={f.name + idx} className="rounded-2xl border border-border/60 p-3 bg-muted/30">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-sm text-foreground truncate">{f.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {f.cantidad} u. · {formatCurrency(f.subtotal)}
                          {modo === "porProducto" && f.pct > 0 && (
                            <span className="text-emerald-600"> · -{formatCurrency(lineDto)}</span>
                          )}
                        </p>
                      </div>
                      {modo === "porProducto" && (
                        <div className="relative shrink-0">
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            value={f.pct || ""}
                            placeholder="0"
                            onChange={(e) => setPct(idx, Number(e.target.value))}
                            className="w-20 h-9 text-center rounded-xl pr-6"
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">%</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {filas.length === 0 && (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  Esta venta no tiene productos.
                </p>
              )}
            </div>
          </div>

          {/* Descuento final */}
          {modo === "final" && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setTipoFinal("percent")}
                  className={`flex-1 flex items-center justify-center gap-1.5 text-sm font-medium py-2 rounded-2xl border transition-colors ${
                    tipoFinal === "percent"
                      ? "bg-teal-50 border-teal-300 text-teal-700"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <Percent className="h-4 w-4" />
                  Porcentaje
                </button>
                <button
                  type="button"
                  onClick={() => setTipoFinal("amount")}
                  className={`flex-1 flex items-center justify-center gap-1.5 text-sm font-medium py-2 rounded-2xl border transition-colors ${
                    tipoFinal === "amount"
                      ? "bg-teal-50 border-teal-300 text-teal-700"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <DollarSign className="h-4 w-4" />
                  Monto fijo
                </button>
              </div>
              <div className="relative">
                <Input
                  type="number"
                  min={0}
                  max={tipoFinal === "percent" ? 100 : total}
                  value={valorFinal}
                  placeholder={tipoFinal === "percent" ? "% sobre el total (hasta 100)" : "Monto a descontar"}
                  onChange={(e) => setValorFinal(e.target.value)}
                  className="h-11 rounded-2xl pr-9"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                  {tipoFinal === "percent" ? "%" : "$"}
                </span>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Motivo (opcional)
            </label>
            <Input
              value={motivo}
              placeholder="Ej: producto en mal estado"
              onChange={(e) => setMotivo(e.target.value)}
              className="h-11 rounded-2xl"
            />
          </div>

          <div className="rounded-2xl bg-muted/40 p-4 space-y-1.5">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Total de la venta</span>
              <span>{formatCurrency(total)}</span>
            </div>
            <div className="flex items-center justify-between text-sm text-emerald-600">
              <span>Descuento</span>
              <span className="font-semibold">-{formatCurrency(monto)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total tras descuento</span>
              <span className="font-bold text-foreground">{formatCurrency(nuevoTotal)}</span>
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground px-1">
            Baja el saldo del cliente, descuenta la comisión del vendedor y genera un recibo.
          </p>

          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1 rounded-2xl" onClick={cerrar} disabled={procesando}>
              Cancelar
            </Button>
            <Button
              className="flex-1 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={confirmar}
              disabled={monto <= 0 || procesando}
            >
              {procesando ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                  Procesando...
                </>
              ) : (
                "Aplicar descuento"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
