'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PackageX, Users, Loader2, ArrowLeft, ChevronRight } from 'lucide-react'
import { formatCurrency, formatDateShort } from '@/lib/utils/format'
import { faltantesApi, type FaltantesResumen, type FaltanteDetalle } from '@/lib/api'

interface FaltantesModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface ClienteGrupo {
  clienteId: string
  clienteNombre: string
  items: FaltanteDetalle[]
  totalConGanancia: number
  totalSinGanancia: number
}

export function FaltantesModal({ open, onOpenChange }: FaltantesModalProps) {
  const [loading, setLoading] = useState(false)
  const [resumen, setResumen] = useState<FaltantesResumen | null>(null)
  const [vista, setVista] = useState<'detalle' | 'clientes'>('detalle')
  const [clienteSeleccionado, setClienteSeleccionado] = useState<string | null>(null)

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

  useEffect(() => {
    if (!open) {
      setVista('detalle')
      setClienteSeleccionado(null)
    }
  }, [open])

  const clientesAgrupados = useMemo<ClienteGrupo[]>(() => {
    if (!resumen) return []
    const mapa = new Map<string, ClienteGrupo>()
    for (const it of resumen.items) {
      const grupo = mapa.get(it.clienteId) ?? {
        clienteId: it.clienteId,
        clienteNombre: it.clienteNombre,
        items: [],
        totalConGanancia: 0,
        totalSinGanancia: 0,
      }
      grupo.items.push(it)
      grupo.totalConGanancia += it.totalConGanancia
      grupo.totalSinGanancia += it.totalSinGanancia
      mapa.set(it.clienteId, grupo)
    }
    return [...mapa.values()].sort((a, b) => b.totalConGanancia - a.totalConGanancia)
  }, [resumen])

  const clienteActivo = clientesAgrupados.find((c) => c.clienteId === clienteSeleccionado) ?? null

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
              <div className="rounded-xl bg-muted/50 p-3 min-w-0 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Users className="h-3 w-3" /> Clientes afectados
                  </p>
                  <p className="text-base sm:text-lg font-bold truncate">{resumen.clientesAfectados}</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-[11px] flex-shrink-0"
                  onClick={() => { setVista('clientes'); setClienteSeleccionado(null); }}
                >
                  Ver
                </Button>
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

            {vista === 'detalle' && (
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
            )}

            {vista === 'clientes' && !clienteActivo && (
              <div className="flex-1 overflow-y-auto mt-2 -mx-1 px-1">
                <div className="flex items-center justify-between mb-2">
                  <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1" onClick={() => setVista('detalle')}>
                    <ArrowLeft className="h-3.5 w-3.5" /> Volver al detalle
                  </Button>
                </div>
                <div className="space-y-1.5">
                  {clientesAgrupados.map((c) => (
                    <button
                      key={c.clienteId}
                      type="button"
                      onClick={() => setClienteSeleccionado(c.clienteId)}
                      className="w-full flex items-center justify-between gap-2 rounded-xl border border-border bg-muted/30 hover:bg-muted/60 transition-colors p-3 text-left"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate">{c.clienteNombre}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {c.items.length} producto(s) · {c.items.reduce((s, it) => s + it.cantidad, 0)} unidad(es)
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-sm font-bold text-success whitespace-nowrap">{formatCurrency(c.totalConGanancia)}</span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {vista === 'clientes' && clienteActivo && (
              <div className="flex-1 overflow-y-auto mt-2 -mx-1 px-1">
                <div className="flex items-center justify-between mb-2">
                  <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1" onClick={() => setClienteSeleccionado(null)}>
                    <ArrowLeft className="h-3.5 w-3.5" /> {clienteActivo.clienteNombre}
                  </Button>
                </div>
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-background">
                    <tr className="text-left text-xs text-muted-foreground border-b border-border">
                      <th className="py-2 pr-2 font-medium">Producto</th>
                      <th className="py-2 pr-2 font-medium text-right">Cant.</th>
                      <th className="py-2 pr-2 font-medium text-right">Con gan.</th>
                      <th className="py-2 pr-2 font-medium text-right">Sin gan.</th>
                      <th className="py-2 pr-2 font-medium text-right">Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clienteActivo.items.map((it) => (
                      <tr key={it.id} className="border-b border-border/50 last:border-0">
                        <td className="py-1.5 pr-2 truncate max-w-[220px]">
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
                  <tfoot>
                    <tr className="border-t-2 border-border font-semibold">
                      <td className="py-1.5 pr-2">Total</td>
                      <td className="py-1.5 pr-2 text-right">{clienteActivo.items.reduce((s, it) => s + it.cantidad, 0)}</td>
                      <td className="py-1.5 pr-2 text-right whitespace-nowrap text-success">{formatCurrency(clienteActivo.totalConGanancia)}</td>
                      <td className="py-1.5 pr-2 text-right whitespace-nowrap text-muted-foreground">{formatCurrency(clienteActivo.totalSinGanancia)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
