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
import { CATEGORIAS_GASTO_VARIABLE } from "@/lib/gastos-constants";
import { gastosApi, type GastoVariable } from "@/lib/api";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gasto: GastoVariable | null; // null = alta
  defaultFecha: string; // 'YYYY-MM-DD' sugerida (del mes seleccionado)
  onSaved: () => void;
}

export function GastoVariableModal({ open, onOpenChange, gasto, defaultFecha, onSaved }: Props) {
  const [nombre, setNombre] = useState("");
  const [categoria, setCategoria] = useState("");
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNombre(gasto?.nombre ?? "");
    setCategoria(gasto?.categoria ?? "");
    setMonto(gasto ? String(gasto.monto) : "");
    setFecha(gasto?.fecha ?? defaultFecha);
  }, [open, gasto, defaultFecha]);

  const handleSave = async () => {
    const montoNum = Number(monto);
    if (!nombre.trim()) return toast.error("Ingresá un nombre");
    if (!Number.isFinite(montoNum) || montoNum < 0) return toast.error("Monto inválido");
    if (!fecha) return toast.error("Elegí una fecha");

    setSaving(true);
    try {
      const payload = {
        nombre: nombre.trim(),
        categoria: categoria.trim() || undefined,
        monto: montoNum,
        fecha,
      };
      if (gasto) await gastosApi.updateVariable(gasto.id, payload);
      else await gastosApi.createVariable(payload);
      toast.success(gasto ? "Gasto actualizado" : "Gasto agregado");
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error("No se pudo guardar el gasto");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{gasto ? "Editar gasto" : "Nuevo gasto variable"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="gv-nombre">Nombre</Label>
            <Input
              id="gv-nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Carga de combustible, reparación…"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="gv-categoria">Categoría</Label>
              <Input
                id="gv-categoria"
                list="cat-var"
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                placeholder="combustible"
              />
              <datalist id="cat-var">
                {CATEGORIAS_GASTO_VARIABLE.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gv-monto">Monto</Label>
              <Input
                id="gv-monto"
                type="number"
                inputMode="decimal"
                min={0}
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="gv-fecha">Fecha</Label>
            <Input id="gv-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
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
