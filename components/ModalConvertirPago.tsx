"use client";

import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Banknote, CreditCard, ArrowLeftRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils/format";
import { clientsApi, ajustesVentaApi, paymentsApi } from "@/lib/api";
import type { Venta } from "../app/ventas/types";

interface ModalConvertirPagoProps {
  abierto: boolean;
  venta: Venta | null;
  onCerrar: () => void;
  onActualizado?: () => void;
}

export function ModalConvertirPago({ abierto, venta, onCerrar, onActualizado }: ModalConvertirPagoProps) {
  const [metodo, setMetodo] = useState<"efectivo" | "transferencia">("efectivo");
  const [procesando, setProcesando] = useState(false);

  // Estado actual de la venta → dirección disponible
  const { esCredito, monto } = useMemo(() => {
    if (!venta) return { esCredito: false, monto: 0 };
    const credito =
      venta.paymentType === "mixed" ? venta.creditAmount ?? 0 : venta.paymentType === "credit" ? venta.total : 0;
    return { esCredito: credito > 0, monto: credito > 0 ? credito : venta.total };
  }, [venta]);

  const direccion: "aPagado" | "aCuentaCorriente" = esCredito ? "aPagado" : "aCuentaCorriente";

  const cerrar = () => {
    if (procesando) return;
    setMetodo("efectivo");
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

      const res = await ajustesVentaApi.convertirPago({
        saleId: venta.id,
        saleNumber: venta.saleNumber ? String(venta.saleNumber) : undefined,
        clientId: venta.clientId,
        clientName: venta.clientName,
        monto,
        direccion,
        metodo: direccion === "aPagado" ? metodo : undefined,
      });

      // Recibo solo cuando hay cobro (cuenta corriente → pagado)
      if (direccion === "aPagado" && res.txId) {
        try {
          const { generarReciboPago } = await import("@/hooks/useGenerarPdf");
          const base64 = await generarReciboPago({
            reciboNumero: res.reciboNumero || "",
            fecha: res.createdAt,
            clientName: venta.clientName,
            clientPhone: venta.clientPhone,
            monto: res.monto,
            metodo: metodo === "transferencia" ? "Transferencia" : "Efectivo",
            saldoAnterior,
            saldoNuevo: saldoAnterior - res.monto,
          });
          await paymentsApi.saveReciboPdf(res.txId, base64);
          const link = document.createElement("a");
          link.href = `data:application/pdf;base64,${base64}`;
          link.download = `recibo-pago-${res.reciboNumero}.pdf`;
          link.click();
        } catch {
          toast.warning("Conversión realizada, pero falló la generación del recibo");
        }
      }

      toast.success(
        direccion === "aPagado"
          ? `Venta marcada como pagada (${metodo})`
          : "Venta pasada a cuenta corriente",
      );
      cerrar();
      onActualizado?.();
    } catch (e: any) {
      toast.error(e?.message || "Error al convertir la forma de pago");
    } finally {
      setProcesando(false);
    }
  };

  if (!venta) return null;

  return (
    <Dialog open={abierto} onOpenChange={cerrar}>
      <DialogContent className="max-w-md p-0 gap-0 overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="bg-gradient-to-br from-sky-500/5 to-sky-500/10 p-6 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-white dark:bg-background shadow-sm flex items-center justify-center">
              <ArrowLeftRight className="h-6 w-6 text-sky-600" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold text-foreground">Cambiar forma de pago</DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                {venta.clientName || "Cliente final"} · Venta {venta.saleNumber || "?"}
              </DialogDescription>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div className="rounded-2xl bg-muted/40 p-4 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {esCredito ? "En cuenta corriente" : "Pago de contado"}
            </span>
            <span className="font-bold text-foreground">{formatCurrency(monto)}</span>
          </div>

          {esCredito ? (
            <>
              <p className="text-sm text-foreground">
                Marcar como <span className="font-semibold">pagada</span> y bajar la deuda del cliente.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMetodo("efectivo")}
                  className={`flex-1 flex items-center justify-center gap-1.5 text-sm font-medium py-2.5 rounded-2xl border transition-colors ${
                    metodo === "efectivo"
                      ? "bg-teal-50 border-teal-300 text-teal-700"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <Banknote className="h-4 w-4" />
                  Efectivo
                </button>
                <button
                  type="button"
                  onClick={() => setMetodo("transferencia")}
                  className={`flex-1 flex items-center justify-center gap-1.5 text-sm font-medium py-2.5 rounded-2xl border transition-colors ${
                    metodo === "transferencia"
                      ? "bg-teal-50 border-teal-300 text-teal-700"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <CreditCard className="h-4 w-4" />
                  Transferencia
                </button>
              </div>
            </>
          ) : (
            <p className="text-sm text-foreground">
              Pasar a <span className="font-semibold">cuenta corriente</span>: suma{" "}
              {formatCurrency(monto)} a la deuda del cliente.
            </p>
          )}

          <p className="text-[11px] text-muted-foreground px-1">
            {esCredito
              ? "Registra el cobro, lo imputa a la deuda de esta venta y genera un recibo."
              : "Genera la deuda en la cuenta corriente del cliente."}
          </p>

          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1 rounded-2xl" onClick={cerrar} disabled={procesando}>
              Cancelar
            </Button>
            <Button
              className="flex-1 rounded-2xl bg-sky-600 hover:bg-sky-700 text-white"
              onClick={confirmar}
              disabled={monto <= 0 || procesando}
            >
              {procesando ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                  Procesando...
                </>
              ) : esCredito ? (
                "Marcar como pagada"
              ) : (
                "Pasar a cuenta corriente"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
