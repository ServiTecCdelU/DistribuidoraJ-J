"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { suscripcionApi } from "@/lib/api";
import type { PagoSuscripcion } from "@/lib/utils/suscripcion";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pago: PagoSuscripcion | null; // null = alta
  defaultPeriodo: string; // 'YYYY-MM'
  defaultMonto: number;
  onSaved: () => void;
}

const METODOS = ["transferencia", "efectivo", "mercadopago", "otro"];

export function PagoSuscripcionModal({
  open,
  onOpenChange,
  pago,
  defaultPeriodo,
  defaultMonto,
  onSaved,
}: Props) {
  const [periodo, setPeriodo] = useState("");
  const [monto, setMonto] = useState("");
  const [fechaPago, setFechaPago] = useState("");
  const [metodo, setMetodo] = useState("");
  const [comprobante, setComprobante] = useState("");
  const [estado, setEstado] = useState<"pagado" | "pendiente">("pagado");
  const [notas, setNotas] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPeriodo(pago?.periodo ?? defaultPeriodo);
    setMonto(String(pago?.monto ?? defaultMonto ?? 0));
    setFechaPago(pago?.fechaPago ?? new Date().toISOString().slice(0, 10));
    setMetodo(pago?.metodo ?? "transferencia");
    setComprobante(pago?.comprobante ?? "");
    setEstado(pago?.estado ?? "pagado");
    setNotas(pago?.notas ?? "");
  }, [open, pago, defaultPeriodo, defaultMonto]);

  const handleSave = async () => {
    const montoNum = Number(monto);
    if (!/^\d{4}-\d{2}$/.test(periodo)) return toast.error("Período inválido");
    if (!Number.isFinite(montoNum) || montoNum < 0) return toast.error("Monto inválido");

    setSaving(true);
    try {
      await suscripcionApi.savePago({
        id: pago?.id,
        periodo,
        monto: montoNum,
        fechaPago: estado === "pagado" ? fechaPago || null : null,
        metodo: metodo.trim() || null,
        comprobante: comprobante.trim() || null,
        estado,
        notas: notas.trim() || null,
      });
      toast.success(pago ? "Pago actualizado" : "Pago registrado");
      onSaved();
      onOpenChange(false);
    } catch {
      toast.error("No se pudo guardar el pago");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{pago ? "Editar pago" : "Registrar pago del abono"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ps-periodo">Período</Label>
              <Input
                id="ps-periodo"
                type="month"
                value={periodo}
                onChange={(e) => setPeriodo(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ps-monto">Monto</Label>
              <Input
                id="ps-monto"
                type="number"
                inputMode="decimal"
                min={0}
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ps-estado">Estado</Label>
              <select
                id="ps-estado"
                value={estado}
                onChange={(e) => setEstado(e.target.value as "pagado" | "pendiente")}
                className="h-9 w-full rounded-2xl border border-input bg-transparent px-3 text-sm"
              >
                <option value="pagado">Pagado</option>
                <option value="pendiente">Pendiente</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ps-fecha">Fecha de pago</Label>
              <Input
                id="ps-fecha"
                type="date"
                value={fechaPago}
                disabled={estado !== "pagado"}
                onChange={(e) => setFechaPago(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ps-metodo">Método</Label>
              <Input
                id="ps-metodo"
                list="metodos-abono"
                value={metodo}
                onChange={(e) => setMetodo(e.target.value)}
                placeholder="transferencia"
              />
              <datalist id="metodos-abono">
                {METODOS.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ps-comprobante">Comprobante</Label>
              <Input
                id="ps-comprobante"
                value={comprobante}
                onChange={(e) => setComprobante(e.target.value)}
                placeholder="N° operación"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ps-notas">Notas</Label>
            <Input
              id="ps-notas"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Opcional"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
