'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Search, MessageCircle, AlertTriangle } from 'lucide-react'
import { adminInsightsApi } from '@/lib/api'
import type { MorosidadData, DeudorAging } from '@/lib/api'
import { formatCurrency } from '@/lib/utils/format'
import { toast } from 'sonner'

const CLASIFICACION_BADGE: Record<DeudorAging['clasificacion'], string> = {
  normal: 'bg-amber-50 text-amber-700 border-amber-200',
  moroso: 'bg-rose-50 text-rose-700 border-rose-200',
  incobrable: 'bg-rose-100 text-rose-900 border-rose-300',
}

const CLASIFICACION_LABEL: Record<DeudorAging['clasificacion'], string> = {
  normal: 'Con deuda',
  moroso: 'Moroso',
  incobrable: 'Incobrable',
}

function whatsappUrl(telefono: string, nombre: string, saldo: number): string {
  const numero = telefono.replace(/\D/g, '')
  const msg = encodeURIComponent(
    `Hola ${nombre}, te escribimos de Distribuidora Patricia. Te recordamos que tenés un saldo pendiente de ${formatCurrency(saldo)}. ¿Coordinamos el pago?`,
  )
  return `https://wa.me/54${numero}?text=${msg}`
}

export function MorosidadTab() {
  const [data, setData] = useState<MorosidadData | null>(null)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let mounted = true
    adminInsightsApi
      .getMorosidad()
      .then((d) => mounted && setData(d))
      .catch(() => mounted && toast.error('Error al cargar morosidad'))
      .finally(() => mounted && setLoading(false))
    return () => {
      mounted = false
    }
  }, [])

  const filtrados = useMemo(() => {
    if (!data) return []
    const q = query.toLowerCase()
    return data.deudores.filter(
      (d) => d.nombre.toLowerCase().includes(q) || d.vendedorNombre.toLowerCase().includes(q),
    )
  }, [data, query])

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    )
  }
  if (!data) return null

  const buckets = [
    { label: 'Deuda total', valor: data.totales.deudaTotal, clase: 'text-foreground' },
    { label: '0-30 días', valor: data.totales.d0_30, clase: 'text-emerald-700' },
    { label: '31-60 días', valor: data.totales.d31_60, clase: 'text-amber-700' },
    { label: '61-90 días', valor: data.totales.d61_90, clase: 'text-orange-700' },
    { label: '+90 días', valor: data.totales.d90plus, clase: 'text-rose-700' },
  ]

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Totales por antigüedad */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3">
        {buckets.map((b) => (
          <Card key={b.label} className="border-border/40 bg-white rounded-2xl shadow-sm">
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">{b.label}</p>
              <p className={`text-base sm:text-lg font-bold tracking-tight ${b.clase}`}>
                {formatCurrency(b.valor)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-border/40 bg-white rounded-2xl shadow-sm">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 sm:p-4 pb-2">
          <div>
            <CardTitle className="text-sm sm:text-base font-semibold flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 text-rose-500" />
              Deudores por antigüedad
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Ordenado por deuda más vieja — a quién cobrarle primero
            </p>
          </div>
          <div className="relative w-full sm:w-56">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar cliente o vendedor..."
              className="pl-8 h-8 rounded-xl text-xs"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="p-3 sm:p-4 pt-0">
          {filtrados.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Sin deudores para mostrar.</p>
          ) : (
            <>
              {/* Desktop */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b border-slate-100">
                      <th className="py-2 pr-2 font-medium">Cliente</th>
                      <th className="py-2 px-2 font-medium">Vendedor</th>
                      <th className="py-2 px-2 font-medium text-right">0-30</th>
                      <th className="py-2 px-2 font-medium text-right">31-60</th>
                      <th className="py-2 px-2 font-medium text-right">61-90</th>
                      <th className="py-2 px-2 font-medium text-right">+90</th>
                      <th className="py-2 px-2 font-medium text-right">Total</th>
                      <th className="py-2 px-2 font-medium text-center">Últ. pago</th>
                      <th className="py-2 pl-2 font-medium text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtrados.map((d) => (
                      <tr key={d.clientId} className="border-b border-slate-50 hover:bg-slate-50/50">
                        <td className="py-2 pr-2">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-foreground">{d.nombre}</span>
                            <Badge className={`${CLASIFICACION_BADGE[d.clasificacion]} border text-[10px] px-1.5`}>
                              {CLASIFICACION_LABEL[d.clasificacion]}
                            </Badge>
                          </div>
                        </td>
                        <td className="py-2 px-2 text-muted-foreground">{d.vendedorNombre || '—'}</td>
                        <td className="py-2 px-2 text-right text-emerald-700">
                          {d.aging.d0_30 > 0 ? formatCurrency(d.aging.d0_30) : '—'}
                        </td>
                        <td className="py-2 px-2 text-right text-amber-700">
                          {d.aging.d31_60 > 0 ? formatCurrency(d.aging.d31_60) : '—'}
                        </td>
                        <td className="py-2 px-2 text-right text-orange-700">
                          {d.aging.d61_90 > 0 ? formatCurrency(d.aging.d61_90) : '—'}
                        </td>
                        <td className="py-2 px-2 text-right font-medium text-rose-700">
                          {d.aging.d90plus > 0 ? formatCurrency(d.aging.d90plus) : '—'}
                        </td>
                        <td className="py-2 px-2 text-right font-bold">{formatCurrency(d.saldo)}</td>
                        <td className="py-2 px-2 text-center text-muted-foreground">
                          {d.diasUltimoPago != null ? `hace ${d.diasUltimoPago} d` : 'nunca'}
                        </td>
                        <td className="py-2 pl-2 text-right">
                          {d.telefono && (
                            <Button
                              asChild
                              size="sm"
                              variant="outline"
                              className="h-6 rounded-xl text-[10px] gap-1 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                            >
                              <a href={whatsappUrl(d.telefono, d.nombre, d.saldo)} target="_blank" rel="noopener noreferrer">
                                <MessageCircle className="h-3 w-3" />
                                Reclamar
                              </a>
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile */}
              <div className="lg:hidden space-y-2 max-h-[min(560px,60vh)] overflow-y-auto">
                {filtrados.map((d) => (
                  <div key={d.clientId} className="rounded-2xl border border-slate-100 p-3 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold truncate">{d.nombre}</p>
                        <p className="text-[10px] text-muted-foreground">{d.vendedorNombre || 'Sin vendedor'}</p>
                      </div>
                      <span className="text-sm font-bold shrink-0">{formatCurrency(d.saldo)}</span>
                    </div>
                    <div className="flex flex-wrap gap-1 text-[10px]">
                      {d.aging.d0_30 > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                          0-30: {formatCurrency(d.aging.d0_30)}
                        </span>
                      )}
                      {d.aging.d31_60 > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700">
                          31-60: {formatCurrency(d.aging.d31_60)}
                        </span>
                      )}
                      {d.aging.d61_90 > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-700">
                          61-90: {formatCurrency(d.aging.d61_90)}
                        </span>
                      )}
                      {d.aging.d90plus > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-700">
                          +90: {formatCurrency(d.aging.d90plus)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground">
                        Últ. pago: {d.diasUltimoPago != null ? `hace ${d.diasUltimoPago} d` : 'nunca'}
                      </span>
                      {d.telefono && (
                        <a
                          href={whatsappUrl(d.telefono, d.nombre, d.saldo)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] font-medium text-emerald-700 flex items-center gap-1"
                        >
                          <MessageCircle className="h-3 w-3" /> Reclamar
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
