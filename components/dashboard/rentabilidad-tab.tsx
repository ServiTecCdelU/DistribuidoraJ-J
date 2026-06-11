'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TrendingUp, AlertCircle } from 'lucide-react'
import { adminInsightsApi } from '@/lib/api'
import type { ResultadoRentabilidad, FilaRentabilidad } from '@/lib/utils/admin-insights'
import { formatCurrency } from '@/lib/utils/format'
import { toast } from 'sonner'

const RANGOS = [
  { dias: 7, label: 'Últimos 7 días' },
  { dias: 30, label: 'Últimos 30 días' },
  { dias: 90, label: 'Últimos 90 días' },
]

function colorMargen(pct: number): string {
  if (pct < 0) return 'text-rose-700'
  if (pct < 15) return 'text-amber-700'
  return 'text-emerald-700'
}

function TablaRentabilidad({ filas, labelColumna }: { filas: FilaRentabilidad[]; labelColumna: string }) {
  if (filas.length === 0) {
    return <p className="text-sm text-muted-foreground py-6 text-center">Sin ventas en el período.</p>
  }
  return (
    <div className="overflow-x-auto max-h-[min(560px,60vh)] overflow-y-auto">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-white">
          <tr className="text-left text-muted-foreground border-b border-slate-100">
            <th className="py-2 pr-2 font-medium">{labelColumna}</th>
            <th className="py-2 px-2 font-medium text-right">Unidades</th>
            <th className="py-2 px-2 font-medium text-right">Facturado</th>
            <th className="py-2 px-2 font-medium text-right">Costo</th>
            <th className="py-2 px-2 font-medium text-right">Ganancia</th>
            <th className="py-2 pl-2 font-medium text-right">Margen</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.id} className="border-b border-slate-50 hover:bg-slate-50/50">
              <td className="py-2 pr-2">
                <span className="font-medium text-foreground">{f.nombre}</span>
                {f.costoIncompleto && (
                  <span title="Costo desconocido en parte de las ventas">
                    <AlertCircle className="inline h-3 w-3 text-amber-500 ml-1" />
                  </span>
                )}
              </td>
              <td className="py-2 px-2 text-right text-muted-foreground">{f.unidades}</td>
              <td className="py-2 px-2 text-right">{formatCurrency(f.facturado)}</td>
              <td className="py-2 px-2 text-right text-muted-foreground">{formatCurrency(f.costo)}</td>
              <td className={`py-2 px-2 text-right font-bold ${colorMargen(f.margenPct)}`}>
                {formatCurrency(f.margen)}
              </td>
              <td className={`py-2 pl-2 text-right font-medium ${colorMargen(f.margenPct)}`}>
                {f.margenPct.toFixed(1)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function RentabilidadTab() {
  const [data, setData] = useState<ResultadoRentabilidad | null>(null)
  const [loading, setLoading] = useState(true)
  const [dias, setDias] = useState(30)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    const hasta = new Date()
    const desde = new Date(hasta.getTime() - dias * 24 * 60 * 60 * 1000)
    adminInsightsApi
      .getRentabilidad(desde, hasta)
      .then((d) => mounted && setData(d))
      .catch(() => mounted && toast.error('Error al calcular rentabilidad'))
      .finally(() => mounted && setLoading(false))
    return () => {
      mounted = false
    }
  }, [dias])

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    )
  }
  if (!data) return null

  const kpis = [
    { label: 'Facturado', valor: formatCurrency(data.totales.facturado), clase: 'text-foreground' },
    { label: 'Costo mercadería', valor: formatCurrency(data.totales.costo), clase: 'text-muted-foreground' },
    { label: 'Ganancia bruta', valor: formatCurrency(data.totales.margen), clase: colorMargen(data.totales.margenPct) },
    { label: 'Margen', valor: `${data.totales.margenPct.toFixed(1)}%`, clase: colorMargen(data.totales.margenPct) },
  ]

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        {kpis.map((k) => (
          <Card key={k.label} className="border-border/40 bg-white rounded-2xl shadow-sm">
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <p className={`text-base sm:text-lg font-bold tracking-tight ${k.clase}`}>{k.valor}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-border/40 bg-white rounded-2xl shadow-sm">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 sm:p-4 pb-2">
          <div>
            <CardTitle className="text-sm sm:text-base font-semibold flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-teal-600" />
              Rentabilidad
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Ganancia bruta estimada (precio de venta − costo de lista)
              {data.totales.costoIncompleto && ' · ⚠ algunos productos sin costo conocido'}
            </p>
          </div>
          <Select value={String(dias)} onValueChange={(v) => setDias(Number(v))}>
            <SelectTrigger className="h-8 w-40 rounded-xl text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGOS.map((r) => (
                <SelectItem key={r.dias} value={String(r.dias)} className="text-xs">
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="p-3 sm:p-4 pt-0">
          <Tabs defaultValue="producto">
            <TabsList className="rounded-xl h-8">
              <TabsTrigger value="producto" className="rounded-lg text-xs">Por producto</TabsTrigger>
              <TabsTrigger value="rubro" className="rounded-lg text-xs">Por rubro</TabsTrigger>
              <TabsTrigger value="cliente" className="rounded-lg text-xs">Por cliente</TabsTrigger>
            </TabsList>
            <TabsContent value="producto" className="mt-2">
              <TablaRentabilidad filas={data.porProducto} labelColumna="Producto" />
            </TabsContent>
            <TabsContent value="rubro" className="mt-2">
              <TablaRentabilidad filas={data.porCategoria} labelColumna="Rubro" />
            </TabsContent>
            <TabsContent value="cliente" className="mt-2">
              <TablaRentabilidad filas={data.porCliente} labelColumna="Cliente" />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
