'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { PackageX, Users, Loader2 } from 'lucide-react'
import { formatCurrency, formatDateShort } from '@/lib/utils/format'
import { faltantesApi, type FaltantesResumen } from '@/lib/api'

interface FaltantesModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function FaltantesModal({ open, onOpenChange }: FaltantesModalProps) {
  const [loading, setLoading] = useState(false)
  const [resumen, setResumen] = useState<FaltantesResumen | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelado = false
    setLoading(true)
    faltantesApi
      .getResumen()
      .then((r) => { if (!cancelado) setResumen(r) })
      .finally(() => { if (!cancelado) setLoading(false) })
    return () => { cancelado = true }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl lg:max-w-5xl xl:max-w-6xl max-h-[85vh] flex flex-col rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageX className="h-5 w-5 text-destructive" />
            Productos faltantes — Historial en Cuenta Corriente
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !resumen || resumen.items.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No hay productos faltantes registrados.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
              <div className="rounded-xl bg-muted/50 p-3 min-w-0">
                <p className="text-[11px] text-muted-foreground">Ítems pendientes</p>
                <p className="text-base sm:text-lg font-bold truncate">{resumen.items.length}</p>
              </div>
              <div className="rounded-xl bg-muted/50 p-3 min-w-0">
                <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Users className="h-3 w-3" /> Clientes afectados
                </p>
                <p className="text-base sm:text-lg font-bold truncate">{resumen.clientesAfectados}</p>
              </div>
              <div className="rounded-xl bg-success/10 p-3 min-w-0">
                <p className="text-[11px] text-muted-foreground">Total con % ganancia</p>
                <p className="text-sm sm:text-base font-bold text-success truncate">{formatCurrency(resumen.totalConGanancia)}</p>
              </div>
              <div className="rounded-xl bg-muted/50 p-3 min-w-0">
                <p className="text-[11px] text-muted-foreground">Total sin % ganancia</p>
                <p className="text-sm sm:text-base font-bold truncate">{formatCurrency(resumen.totalSinGanancia)}</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto mt-2 -mx-1 px-1">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background">
                  <tr className="text-left text-xs text-muted-foreground border-b border-border">
                    <th className="py-2 pr-2 font-medium">Cliente</th>
                    <th className="py-2 pr-2 font-medium">Producto</th>
                    <th className="py-2 pr-2 font-medium text-right">Cant.</th>
                    <th className="py-2 pr-2 font-medium text-right">Con gan.</th>
                    <th className="py-2 pr-2 font-medium text-right">Sin gan.</th>
                    <th className="py-2 pr-2 font-medium text-right">Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {resumen.items.map((it) => (
                    <tr key={it.id} className="border-b border-border/50 last:border-0">
                      <td className="py-1.5 pr-2 truncate max-w-[140px]">{it.clienteNombre}</td>
                      <td className="py-1.5 pr-2 truncate max-w-[180px]">
                        {it.productoNombre}
                        {it.motivo === 'no_quiso' && (
                          <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px]">Rechazo</Badge>
                        )}
                      </td>
                      <td className="py-1.5 pr-2 text-right">{it.cantidad}</td>
                      <td className="py-1.5 pr-2 text-right whitespace-nowrap">{formatCurrency(it.totalConGanancia)}</td>
                      <td className="py-1.5 pr-2 text-right whitespace-nowrap text-muted-foreground">{formatCurrency(it.totalSinGanancia)}</td>
                      <td className="py-1.5 pr-2 text-right whitespace-nowrap text-muted-foreground">{formatDateShort(it.fecha)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
