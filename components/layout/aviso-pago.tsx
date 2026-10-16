"use client";

// Aviso de pago atrasado del servicio (lo informa ServiTec vía /api/aviso-pago):
// barra amarilla fija + ventana que se cierra y vuelve al día siguiente. Solo el admin.

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { getAuthToken } from "@/services/auth-service";
import { formatCurrency } from "@/lib/utils/format";
import { claveAvisoPago, mesesAdeudados, type DeudaServicio } from "@/lib/utils/aviso-pago";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// MainLayout se remonta en cada pantalla: se consulta como mucho cada 5 minutos.
const TTL_MS = 5 * 60_000;
let cache: { at: number; promise: Promise<DeudaServicio | null> } | null = null;

function leerAviso(): Promise<DeudaServicio | null> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.promise;
  const promise = (async () => {
    const token = await getAuthToken();
    if (!token) return null;
    const res = await fetch("/api/aviso-pago", { headers: { Authorization: `Bearer ${token}` } });
    const json = await res.json().catch(() => null);
    return (json?.data as DeudaServicio | null) ?? null;
  })();
  cache = { at: Date.now(), promise };
  promise.catch(() => {
    cache = null;
  });
  return promise;
}

export function AvisoPago() {
  const [deuda, setDeuda] = useState<DeudaServicio | null>(null);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    let cancelado = false;
    leerAviso()
      .then((d) => {
        if (cancelado || !d) return;
        setDeuda(d);
        try {
          if (!window.localStorage.getItem(claveAvisoPago(new Date()))) setAbierto(true);
        } catch {
          setAbierto(true);
        }
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, []);

  if (!deuda) return null;

  const cerrar = () => {
    setAbierto(false);
    try {
      window.localStorage.setItem(claveAvisoPago(new Date()), "1");
    } catch {}
  };

  return (
    <>
      <div className="sticky top-0 z-[80] flex items-center justify-center gap-2 bg-amber-400 px-4 py-2 text-sm font-medium text-amber-950">
        <AlertTriangle className="hidden h-4 w-4 shrink-0 sm:block" />
        <span className="text-center">
          Pago atrasado del sistema: {mesesAdeudados(deuda.periodos)} · {formatCurrency(deuda.total)}
        </span>
      </div>
      <Dialog open={abierto} onOpenChange={(o) => !o && cerrar()}>
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <DialogTitle className="text-center">Tenés un pago atrasado</DialogTitle>
            <DialogDescription className="text-center">
              Figura sin pagar el servicio del sistema de {mesesAdeudados(deuda.periodos)}, por{" "}
              {formatCurrency(deuda.total)}. Comunicate con ServiTec para regularizarlo. Si ya pagaste, ignorá este
              aviso: se va cuando se registre el pago.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-center">
            <Button variant="outline" className="rounded-2xl" onClick={cerrar}>
              Entendido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
