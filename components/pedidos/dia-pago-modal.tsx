"use client"

import { useEffect, useState } from "react"
import { CalendarClock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

export const DIAS_COBRO = [
  { value: "lunes", label: "Lunes" },
  { value: "martes", label: "Martes" },
  { value: "miercoles", label: "Miércoles" },
  { value: "jueves", label: "Jueves" },
  { value: "viernes", label: "Viernes" },
  { value: "sabado", label: "Sábado" },
  { value: "domingo", label: "Domingo" },
] as const

interface DiaPagoModalProps {
  open: boolean
  clientName?: string
  /** Guarda el día en el cliente y continúa con el remito. */
  onSave: (diaCobro: string) => Promise<void> | void
  /** Continúa con el remito sin día de pago. */
  onLater: () => void
}

export function DiaPagoModal({ open, clientName, onSave, onLater }: DiaPagoModalProps) {
  const [dia, setDia] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setDia("")
      setSaving(false)
    }
  }, [open])

  const handleSave = async () => {
    if (!dia) return
    setSaving(true)
    try {
      await onSave(dia)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !saving) onLater() }}>
      <DialogContent className="sm:max-w-lg rounded-2xl p-6">
        <DialogHeader className="space-y-2">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <CalendarClock className="h-5 w-5 text-teal-600" />
            Falta el día de pago
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            {clientName ? <span className="font-medium text-foreground">{clientName}</span> : "Este cliente"} tiene
            cuenta corriente y no tiene un día de pago asignado. ¿Lo agregás antes de generar el remito?
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 py-2">
          <Label htmlFor="diaPago" className="text-foreground">Día de pago</Label>
          <select
            id="diaPago"
            className="flex h-11 w-full rounded-2xl border border-input bg-background px-3 py-2 text-sm"
            value={dia}
            onChange={(e) => setDia(e.target.value)}
            disabled={saving}
          >
            <option value="">Seleccionar día</option>
            {DIAS_COBRO.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-3">
          <Button variant="outline" className="rounded-2xl h-11 w-full sm:w-auto" onClick={onLater} disabled={saving}>
            Lo agrego después
          </Button>
          <Button className="rounded-2xl h-11 w-full sm:w-auto" onClick={handleSave} disabled={!dia || saving}>
            {saving ? "Guardando..." : "Guardar y generar remito"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
