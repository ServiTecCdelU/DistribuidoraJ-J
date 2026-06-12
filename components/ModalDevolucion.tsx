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
import { RotateCcw, Loader2, Undo2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils/format";
import { clientsApi, devolucionesApi, type DevolucionItem } from "@/lib/api";
import type { Venta } from "../types";

interface ModalDevolucionProps {
  abierto: boolean;
  venta: Venta | null;
  onCerrar: () => void;
  onRegistrada?: () => void;
}

interface FilaDevolucion {
  productId: string;
  name: string;
  codigo?: string;
  vendida: number;
  precioUnit: number; // precio con dto. aplicado
  cantidad: number; // a devolver
  destino: "stock" | "perdida";
}

export function ModalDevolucion({ abierto, venta, onCerrar, onRegistrada }: ModalDevolucionProps) {
  const [filas, setFilas] = useState<FilaDevolucion[]>([]);
  const [procesando, setProcesando] = useState(false);
  const [inicializado, setInicializado] = useState<string | null>(null);

  // Inicializar filas cuando se abre con una venta nueva
  const ventaId = venta?.id ?? null;
  if (abierto && venta && inicializado !== ventaId) {
    const nuevas: FilaDevolucion[] = venta.items
      .filter((it) => it.productId && !(it as any).esRegalo)
      .map((it) => {
        const dto = (it as any).itemDiscount || 0;
        const precioUnit = it.price * (1 - dto / 100);
        return {
          productId: it.productId,
          name: it.name,
          codigo: (it as any).codigo,
          vendida: it.quantity,
          precioUnit,
          cantidad: 0,
          destino: "stock" as const,
        };
      });
    setFilas(nuevas);
    setInicializado(ventaId);
  }

  const total = useMemo(
    () => filas.reduce((acc, f) => acc + f.precioUnit * f.cantidad, 0),
    [filas],
  );
  const hayAlgo = filas.some((f) => f.cantidad > 0);

  const setCantidad = (idx: number, value: number) => {
    setFilas((prev) =>
      prev.map((f, i) =>
        i === idx ? { ...f, cantidad: Math.max(0, Math.min(f.vendida, Math.floor(value || 0))) } : f,
      ),
    );
  };

  const setDestino = (idx: number, destino: "stock" | "perdida") => {
    setFilas((prev) => prev.map((f, i) => (i === idx ? { ...f, destino } : f)));
  };

  const cerrar = () => {
    if (procesando) return;
    setInicializado(null);
    setFilas([]);
    onCerrar();
  };

  const confirmar = async () => {
    if (!venta || !hayAlgo) return;
    setProcesando(true);
    try {
      const items: DevolucionItem[] = filas
        .filter((f) => f.cantidad > 0)
        .map((f) => ({
          productId: f.productId,
          name: f.name,
          codigo: f.codigo,
          quantity: f.cantidad,
          price: f.precioUnit,
          destino: f.destino,
        }));

      // Saldo anterior del cliente (para el recibo)
      let saldoAnterior = 0;
      if (venta.clientId) {
        const cli = await clientsApi.getById(venta.clientId);
        saldoAnterior = Number(cli?.currentBalance) || 0;
      }

      const dev = await devolucionesApi.registrar({
        saleId: venta.id,
        saleNumber: venta.saleNumber ? String(venta.saleNumber) : undefined,
        clientId: venta.clientId,
        clientName: venta.clientName,
        sellerId: venta.sellerId,
        sellerName: venta.sellerName,
        items,
      });

      // Generar recibo de devolución
      try {
        const { generarReciboDevolucion } = await import("@/hooks/useGenerarPdf");
        const base64 = await generarReciboDevolucion({
          reciboNumero: dev.reciboNumero,
          fecha: dev.createdAt,
          clientName: venta.clientName,
          clientPhone: venta.clientPhone,
          saleNumber: venta.saleNumber ? String(venta.saleNumber) : undefined,
          items: items.map((i) => ({ name: i.name, quantity: i.quantity, price: i.price, destino: i.destino })),
          total: dev.total,
          saldoAnterior,
          saldoNuevo: saldoAnterior - dev.total,
        });
        await devolucionesApi.saveRecibo(dev.id, base64);
        const link = document.createElement("a");
        link.href = `data:application/pdf;base64,${base64}`;
        link.download = `recibo-devolucion-${dev.reciboNumero}.pdf`;
        link.click();
      } catch {
        toast.warning("Devolución registrada, pero falló la generación del recibo");
      }

      toast.success(`Devolución registrada: ${formatCurrency(dev.total)}`);
      cerrar();
      onRegistrada?.();
    } catch (e: any) {
      toast.error(e?.message || "Error al registrar la devolución");
    } finally {
      setProcesando(false);
    }
  };

  if (!venta) return null;

  return (
    <Dialog open={abierto} onOpenChange={cerrar}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="bg-gradient-to-br from-amber-500/5 to-amber-500/10 p-6 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-white dark:bg-background shadow-sm flex items-center justify-center">
              <RotateCcw className="h-6 w-6 text-amber-600" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold text-foreground">Registrar devolución</DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                {venta.clientName || "Cliente final"} · Venta {venta.saleNumber || "?"}
              </DialogDescription>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Productos a devolver
          </p>

          <div className="space-y-2">
            {filas.map((f, idx) => (
              <div key={f.productId + idx} className="rounded-2xl border border-border/60 p-3 bg-muted/30">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-foreground truncate">{f.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Vendidas: {f.vendida} · {formatCurrency(f.precioUnit)} c/u
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Input
                      type="number"
                      min={0}
                      max={f.vendida}
                      value={f.cantidad || ""}
                      placeholder="0"
                      onChange={(e) => setCantidad(idx, Number(e.target.value))}
                      className="w-16 h-9 text-center rounded-xl"
                    />
                  </div>
                </div>

                {f.cantidad > 0 && (
                  <div className="flex items-center gap-2 mt-3">
                    <button
                      type="button"
                      onClick={() => setDestino(idx, "stock")}
                      className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-xl border transition-colors ${
                        f.destino === "stock"
                          ? "bg-teal-50 border-teal-300 text-teal-700"
                          : "border-border text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      <Undo2 className="h-3.5 w-3.5" />
                      Vuelve a stock
                    </button>
                    <button
                      type="button"
                      onClick={() => setDestino(idx, "perdida")}
                      className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-xl border transition-colors ${
                        f.destino === "perdida"
                          ? "bg-rose-50 border-rose-300 text-rose-700"
                          : "border-border text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Pérdida
                    </button>
                  </div>
                )}
              </div>
            ))}
            {filas.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Esta venta no tiene productos devolvibles.
              </p>
            )}
          </div>

          <div className="flex items-center justify-between p-4 rounded-2xl bg-foreground text-background mt-2">
            <span className="font-medium">Total a devolver</span>
            <span className="text-2xl font-bold">{formatCurrency(total)}</span>
          </div>
          <p className="text-[11px] text-muted-foreground px-1">
            Baja el saldo del cliente, descuenta la comisión del vendedor y genera el recibo.
            Los productos "vuelve a stock" se reponen al depósito.
          </p>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={cerrar} disabled={procesando}>
              Cancelar
            </Button>
            <Button
              className="flex-1 rounded-xl bg-amber-600 hover:bg-amber-700 text-white"
              onClick={confirmar}
              disabled={!hayAlgo || procesando}
            >
              {procesando ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                  Procesando...
                </>
              ) : (
                "Confirmar devolución"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
