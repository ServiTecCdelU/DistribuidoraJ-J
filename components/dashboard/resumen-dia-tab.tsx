'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Banknote, ArrowLeftRight, Users, Receipt, FileWarning, CalendarDays } from 'lucide-react'
import { adminInsightsApi } from '@/lib/api'
import type { ResumenDiaData } from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/utils/format'
import { toast } from 'sonner'

const DIA_MS = 24 * 60 * 60 * 1000

export function ResumenDiaTab() {
  const [data, setData] = useState<ResumenDiaData | null>(null)
  const [loading, setLoading] = useState(true)
  const [offsetDias, setOffsetDias] = useState(0) // 0 = hoy, 1 = ayer...

  useEffect(() => {
    let mounted = true
    setLoading(true)
    const fecha = new Date(Date.now() - offsetDias * DIA_MS)
    adminInsightsApi
      .getResumenDia(fecha)
      .then((d) => mounted && setData(d))
      .catch(() => mounted && toast.error('Error al cargar el resumen del día'))
      .finally(() => mounted && setLoading(false))
    return () => {
      mounted = false
    }
  }, [offsetDias])

  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
    )
  }
  if (!data) return null

  const tarjetas = [
    {
      label: 'Total vendido',
      valor: formatCurrency(data.totalVendido),
      detalle: `${data.cantidadVentas} ventas`,
      icon: Receipt,
      clase: 'bg-teal-50 text-teal-700 border-teal-100',
    },
    {
      label: 'Efectivo',
      valor: formatCurrency(data.efectivo),
      detalle: 'cobrado en el día',
      icon: Banknote,
      clase: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    },
    {
      label: 'Transferencias',
      valor: formatCurrency(data.transferencia),
      detalle: 'cobrado en el día',
      icon: ArrowLeftRight,
      clase: 'bg-sky-50 text-sky-700 border-sky-100',
    },
    {
      label: 'A cuenta corriente',
      valor: formatCurrency(data.cuentaCorriente),
      detalle: 'fiado del día',
      icon: Users,
      clase: 'bg-amber-50 text-amber-700 border-amber-100',
    },
    {
      label: 'Cobranzas',
      valor: formatCurrency(data.cobranzasDia),
      detalle: `${data.cobranzasCantidad} pagos de deuda`,
      icon: Banknote,
      clase: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    },
    {
      label: 'Deuda nueva',
      valor: formatCurrency(data.deudaNueva),
      detalle: 'cargada a clientes',
      icon: Users,
      clase: 'bg-orange-50 text-orange-700 border-orange-100',
    },
    {
      label: 'Balance de deuda',
      valor: formatCurrency(data.cobranzasDia - data.deudaNueva),
      detalle: data.cobranzasDia >= data.deudaNueva ? 'se cobró más de lo fiado' : 'se fió más de lo cobrado',
      icon: ArrowLeftRight,
      clase:
        data.cobranzasDia >= data.deudaNueva
          ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
          : 'bg-rose-50 text-rose-700 border-rose-100',
    },
    {
      label: 'Comprobantes pendientes',
      valor: String(data.comprobantesPendientes),
      detalle: 'esperan aprobación',
      icon: FileWarning,
      clase:
        data.comprobantesPendientes > 0
          ? 'bg-amber-50 text-amber-700 border-amber-100'
          : 'bg-slate-50 text-slate-600 border-slate-100',
    },
  ]

  return (
    <Card className="border-border/40 bg-white rounded-2xl shadow-sm">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 sm:p-4 pb-2">
        <div>
          <CardTitle className="text-sm sm:text-base font-semibold flex items-center gap-1.5">
            <CalendarDays className="h-4 w-4 text-teal-600" />
            Resumen del día — {formatDate(data.fecha)}
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Cómo cerró el día: ventas, cobros y deuda en una sola vista
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {[
            { offset: 0, label: 'Hoy' },
            { offset: 1, label: 'Ayer' },
            { offset: 2, label: 'Anteayer' },
          ].map((o) => (
            <Button
              key={o.offset}
              size="sm"
              variant={offsetDias === o.offset ? 'default' : 'outline'}
              className={`h-7 rounded-xl text-xs ${offsetDias === o.offset ? 'bg-teal-600 hover:bg-teal-700' : ''}`}
              onClick={() => setOffsetDias(o.offset)}
            >
              {o.label}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="p-3 sm:p-4 pt-1">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
          {tarjetas.map((t) => {
            const Icon = t.icon
            return (
              <div key={t.label} className="rounded-2xl border border-slate-100 p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">{t.label}</p>
                  <div className={`h-6 w-6 rounded-lg border flex items-center justify-center ${t.clase}`}>
                    <Icon className="h-3 w-3" />
                  </div>
                </div>
                <p className="text-base sm:text-lg font-bold tracking-tight">{t.valor}</p>
                <p className="text-[10px] text-muted-foreground">{t.detalle}</p>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
