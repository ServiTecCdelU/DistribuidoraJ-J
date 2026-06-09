"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { CATEGORIAS_GASTO_FIJO } from "@/lib/gastos-constants";
import { gastosApi, type GastoFijo } from "@/lib/api";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gasto: GastoFijo | null; // null = alta
  onSaved: () => void;
}

// 'YYYY-MM-DD' -> 'YYYY-MM' para input type=month
const toMonth = (d?: string | null) => (d ? d.slice(0, 7) : "");
// 'YYYY-MM' -> 'YYYY-MM-01'
const fromMonth = (m: string) => (m ? `${m}-01` : null);

export function GastoFijoModal({ open, onOpenChange, gasto, onSaved }: Props) {
  const [nombre, setNombre] = useState("");
  const [categoria, setCategoria] = useState("");
  const [monto, setMonto] = useState("");
  const [activo, setActivo] = useState(true);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNombre(gasto?.nombre ?? "");
    setCategoria(gasto?.categoria ?? "");
    setMonto(gasto ? String(gasto.monto) : "");
    setActivo(gasto?.activo ?? true);
    setDesde(toMonth(gasto?.desde));
    setHasta(toMonth(gasto?.hasta));
  }, [open, gasto]);

  const handleSave = async () => {
    const montoNum = Number(monto);
    if (!nombre.trim()) return toast.error("Ingresá un nombre");
    if (!Number.isFinite(montoNum) || montoNum < 0) return toast.error("Monto inválido");
    if (desde && hasta && hasta < desde) return toast.error("'Hasta' no puede ser anterior a 'Desde'");

    setSaving(true);
    try {
      const payload = {
        nombre: nombre.trim(),
        categoria: categoria.trim() || undefined,
        monto: montoNum,
        activo,
        desde: fromMonth(desde),
        hasta: fromMonth(hasta),
      };
      if (gasto) await gastosApi.updateFijo(gasto.id, payload);
      else await gastosApi.createFijo(payload);
      toast.success(gasto ? "Gasto fijo actualizado" : "Gasto fijo agregado");
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error("No se pudo guardar el gasto fijo");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{gasto ? "Editar gasto fijo" : "Nuevo gasto fijo"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="gf-nombre">Nombre</Label>
            <Input
              id="gf-nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Alquiler local, Sueldo Juan…"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="gf-categoria">Categoría</Label>
              <Input
                id="gf-categoria"
                list="cat-fijo"
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                placeholder="alquiler"
              />
              <datalist id="cat-fijo">
                {CATEGORIAS_GASTO_FIJO.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gf-monto">Monto mensual</Label>
              <Input
                id="gf-monto"
                type="number"
                inputMode="decimal"
                min={0}
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="gf-desde">Vigente desde</Label>
              <Input id="gf-desde" type="month" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gf-hasta">Hasta (opcional)</Label>
              <Input id="gf-hasta" type="month" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Dejá las fechas vacías para que aplique a todos los meses. Cuenta automáticamente cada mes vigente.
          </p>

          <div className="flex items-center justify-between rounded-xl border p-3">
            <div>
              <Label htmlFor="gf-activo">Activo</Label>
              <p className="text-xs text-muted-foreground">Si lo desactivás, deja de sumar.</p>
            </div>
            <Switch id="gf-activo" checked={activo} onCheckedChange={setActivo} />
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
