'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Package, FileSpreadsheet, Loader2 } from 'lucide-react'
import { adminInsightsApi } from '@/lib/api'
import type { ReposicionData } from '@/lib/api'
import { toast } from 'sonner'

const OPCIONES_COBERTURA = [7, 14, 21, 30]

function badgeCobertura(dias: number): string {
  if (dias < 4) return 'bg-rose-50 text-rose-700 border-rose-200'
  if (dias < 8) return 'bg-amber-50 text-amber-700 border-amber-200'
  return 'bg-emerald-50 text-emerald-700 border-emerald-200'
}

export function ReposicionTab() {
  const [data, setData] = useState<ReposicionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [diasCobertura, setDiasCobertura] = useState(14)
  const [exportando, setExportando] = useState(false)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    adminInsightsApi
      .getReposicion(diasCobertura)
      .then((d) => mounted && setData(d))
      .catch(() => mounted && toast.error('Error al calcular reposición'))
      .finally(() => mounted && setLoading(false))
    return () => {
      mounted = false
    }
  }, [diasCobertura])

  const handleExportar = async () => {
    if (!data || data.productos.length === 0) return
    setExportando(true)
    try {
      const XLSX = await import('xlsx-js-style')
      const filas = data.productos.map((p) => ({
        Código: p.codigo,
        Producto: p.nombre,
        Rubro: p.categoria,
        'Stock actual': p.stock,
        'Ventas/semana': p.ventasPorSemana,
        'Cobertura (días)': p.coberturaDias,
        'Sugerido (unid.)': p.sugerido,
        'Unid. por bulto': p.unidadesPorBulto ?? '',
        'Sugerido (bultos)': p.sugeridoBultos ?? '',
      }))
      const ws = XLSX.utils.json_to_sheet(filas)
      ws['!cols'] = [
        { wch: 10 }, { wch: 40 }, { wch: 18 }, { wch: 12 },
        { wch: 14 }, { wch: 15 }, { wch: 15 }, { wch: 14 }, { wch: 16 },
      ]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Pedido sugerido')
      const fecha = new Date().toISOString().slice(0, 10)
      XLSX.writeFile(wb, `pedido-sugerido-${fecha}.xlsx`)
      toast.success('Pedido sugerido exportado')
    } catch {
      toast.error('Error al exportar el Excel')
    } finally {
      setExportando(false)
    }
  }

  if (loading) {
    return <Skeleton className="h-80 rounded-2xl" />
  }
  if (!data) return null

  return (
    <Card className="border-border/40 bg-white rounded-2xl shadow-sm">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 sm:p-4 pb-2">
        <div>
          <CardTitle className="text-sm sm:text-base font-semibold flex items-center gap-1.5">
            <Package className="h-4 w-4 text-teal-600" />
            Reposición sugerida
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Según ventas de los últimos {data.diasVentana} días — {data.productos.length} productos por reponer
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(diasCobertura)} onValueChange={(v) => setDiasCobertura(Number(v))}>
            <SelectTrigger className="h-8 w-36 rounded-xl text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OPCIONES_COBERTURA.map((d) => (
                <SelectItem key={d} value={String(d)} className="text-xs">
                  Cubrir {d} días
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="h-8 rounded-xl text-xs gap-1.5 bg-teal-600 hover:bg-teal-700"
            onClick={handleExportar}
            disabled={exportando || data.productos.length === 0}
          >
            {exportando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
            Exportar pedido
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-3 sm:p-4 pt-0">
        {data.productos.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            El stock cubre los próximos {diasCobertura} días. Nada para reponer.
          </p>
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-slate-100">
                    <th className="py-2 pr-2 font-medium">Producto</th>
                    <th className="py-2 px-2 font-medium">Rubro</th>
                    <th className="py-2 px-2 font-medium text-right">Stock</th>
                    <th className="py-2 px-2 font-medium text-right">Ventas/sem</th>
                    <th className="py-2 px-2 font-medium text-center">Cobertura</th>
                    <th className="py-2 px-2 font-medium text-right">Sugerido</th>
                    <th className="py-2 pl-2 font-medium text-right">Bultos</th>
                  </tr>
                </thead>
                <tbody>
                  {data.productos.map((p) => (
                    <tr key={p.productId} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="py-2 pr-2">
                        <p className="font-medium text-foreground">{p.nombre}</p>
                        {p.codigo && <p className="text-[10px] text-muted-foreground font-mono">{p.codigo}</p>}
                      </td>
                      <td className="py-2 px-2 text-muted-foreground">{p.categoria || '—'}</td>
                      <td className="py-2 px-2 text-right font-medium">{p.stock}</td>
                      <td className="py-2 px-2 text-right">{p.ventasPorSemana}</td>
                      <td className="py-2 px-2 text-center">
                        <Badge className={`${badgeCobertura(p.coberturaDias)} border text-[10px]`}>
                          {p.coberturaDias} días
                        </Badge>
                      </td>
                      <td className="py-2 px-2 text-right font-bold text-teal-700">{p.sugerido} u</td>
                      <td className="py-2 pl-2 text-right text-muted-foreground">
                        {p.sugeridoBultos != null ? `${p.sugeridoBultos} (×${p.unidadesPorBulto})` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile */}
            <div className="lg:hidden space-y-2 max-h-[min(560px,60vh)] overflow-y-auto">
              {data.productos.map((p) => (
                <div key={p.productId} className="rounded-2xl border border-slate-100 p-3 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold truncate">{p.nombre}</p>
                    <Badge className={`${badgeCobertura(p.coberturaDias)} border text-[10px] shrink-0`}>
                      {p.coberturaDias} d
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>Stock: {p.stock} · Vende {p.ventasPorSemana}/sem</span>
                    <span className="font-bold text-teal-700 text-xs">
                      Pedir {p.sugerido} u{p.sugeridoBultos != null ? ` (${p.sugeridoBultos} bultos)` : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
