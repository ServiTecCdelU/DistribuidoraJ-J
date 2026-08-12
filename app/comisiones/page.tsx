'use client'

import { useEffect, useMemo, useState } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DataTableSkeleton } from '@/components/ui/data-table-skeleton'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getCommissionsBySeller } from '@/services/commissions-service'
import { useAuth } from '@/hooks/use-auth'
import type { SellerCommission } from '@/lib/types'
import { formatCurrency as formatPrice, formatDate } from '@/lib/utils/format'
import { resumenComisiones } from '@/lib/utils/comisiones'
import {
  monthRange,
  dayRange,
  customRange,
  shiftMonth,
  filterByRange,
  monthLabel,
  toInputDate,
  type ComisionPeriodMode,
  type DateRange,
} from '@/lib/utils/comisiones-period'
import { TrendingUp, Clock, CheckCircle2, DollarSign, ChevronLeft, ChevronRight } from 'lucide-react'

export default function ComisionesPage() {
  const { user } = useAuth()
  const [commissions, setCommissions] = useState<SellerCommission[]>([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<ComisionPeriodMode>('month')
  const [anchor, setAnchor] = useState<Date>(() => new Date())
  const [day, setDay] = useState<string>(() => toInputDate(new Date()))
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  useEffect(() => {
    let mounted = true
    const loadCommissions = async () => {
      if (!user?.sellerId) {
        if (mounted) setLoading(false)
        return
      }
      try {
        const data = await getCommissionsBySeller(user.sellerId)
        if (!mounted) return
        setCommissions(data)
      } catch {
        // silenciado
      } finally {
        if (mounted) setLoading(false)
      }
    }
    loadCommissions()
    return () => { mounted = false }
  }, [user?.sellerId])

  const range: DateRange | null = useMemo(() => {
    if (mode === 'month') return monthRange(anchor)
    if (mode === 'day') return day ? dayRange(new Date(`${day}T12:00:00`)) : null
    return customRange(dateFrom, dateTo)
  }, [mode, anchor, day, dateFrom, dateTo])

  const filtered = useMemo(() => filterByRange(commissions, range), [commissions, range])

  // Mismos números que ve el admin en Empleados (misma fuente: resumenComisiones).
  const resumen = resumenComisiones(filtered)
  const total = resumen.finales // neto = comisiones finales
  const pendingTotal = resumen.pendiente
  const paidTotal = resumen.cobrado
  const pendingCount = resumen.pendienteCount
  const devolucionesTotal = resumen.devoluciones // magnitud positiva
  const devolucionesCount = resumen.devolucionesCount

  return (
    <MainLayout allowedRoles={['admin', 'seller']} title="Mis Comisiones" description="Resumen y detalle de tus comisiones">
      {loading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardHeader className="pb-2"><Skeleton className="h-4 w-24" /></CardHeader>
                <CardContent><Skeleton className="h-7 w-20" /></CardContent>
              </Card>
            ))}
          </div>
          <DataTableSkeleton columns={6} rows={6} />
        </div>
      ) : (
        <>
          {/* ── Filtro de período ── */}
          <Card className="mb-3">
            <CardContent className="p-2 flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5">
                <div className="flex gap-1 w-full sm:w-auto justify-center">
                  {([
                    ['month', 'Mes'],
                    ['day', 'Por día'],
                    ['custom', 'Personalizado'],
                  ] as const).map(([m, label]) => (
                    <Button
                      key={m}
                      size="sm"
                      variant={mode === m ? 'default' : 'outline'}
                      className={mode === m ? 'rounded-2xl h-7 px-3 text-xs bg-teal-600 hover:bg-teal-700' : 'rounded-2xl h-7 px-3 text-xs'}
                      onClick={() => setMode(m)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>

                {mode === 'month' && (
                  <div className="flex items-center gap-1 w-full sm:w-auto justify-center sm:ml-auto">
                    <Button size="icon" variant="outline" className="rounded-2xl h-7 w-7" onClick={() => setAnchor(shiftMonth(anchor, -1))} aria-label="Mes anterior">
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-xs font-semibold capitalize min-w-[110px] text-center">{monthLabel(anchor)}</span>
                    <Button size="icon" variant="outline" className="rounded-2xl h-7 w-7" onClick={() => setAnchor(shiftMonth(anchor, 1))} aria-label="Mes siguiente">
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}

                {mode === 'day' && (
                  <div className="flex items-center gap-2 w-full sm:w-auto justify-center sm:ml-auto">
                    <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="rounded-2xl h-7 text-xs w-[150px]" />
                  </div>
                )}

                {mode === 'custom' && (
                  <div className="flex items-center gap-2 w-full sm:w-auto justify-center sm:ml-auto flex-wrap">
                    <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="rounded-2xl h-7 text-xs w-[140px]" />
                    <span className="text-xs text-muted-foreground">a</span>
                    <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="rounded-2xl h-7 text-xs w-[140px]" />
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground text-center sm:text-left">
                {range
                  ? `${formatDate(range.from)} — ${formatDate(range.to)} · ${filtered.length} registros`
                  : `Todas las comisiones · ${filtered.length} registros`}
              </p>
            </CardContent>
          </Card>

          {/* ── Tarjetas resumen ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 mb-3">
            {[
              {
                label: 'Comisiones finales',
                icon: <TrendingUp className="h-3 w-3 text-teal-600 shrink-0" />,
                value: formatPrice(total),
                valueClass: 'text-teal-600 dark:text-teal-400',
                hint: 'comisiones − devoluciones',
                cardClass: 'border-teal-200 dark:border-teal-800 bg-teal-50/50 dark:bg-teal-900/10',
              },
              {
                label: 'Pendiente',
                icon: <Clock className="h-3 w-3 text-orange-500 shrink-0" />,
                value: formatPrice(pendingTotal),
                valueClass: 'text-orange-500',
                hint: `${pendingCount} pendientes`,
                cardClass: '',
              },
              {
                label: 'Ya cobrado',
                icon: <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />,
                value: formatPrice(paidTotal),
                valueClass: 'text-green-600',
                hint: `${filtered.length - pendingCount} cobradas`,
                cardClass: '',
              },
              {
                label: 'Devoluciones',
                icon: <DollarSign className="h-3 w-3 text-rose-500 shrink-0" />,
                value: formatPrice(Math.abs(devolucionesTotal)),
                valueClass: 'text-rose-600 dark:text-rose-400',
                hint: `${devolucionesCount} ${devolucionesCount === 1 ? 'devolución' : 'devoluciones'}`,
                cardClass: '',
              },
            ].map((k) => (
              <Card key={k.label} className={`${k.cardClass} rounded-2xl`}>
                <CardContent className="p-2 flex flex-col gap-1">
                  <div className="flex items-center gap-1 min-w-0">
                    {k.icon}
                    <span className="text-[10px] text-muted-foreground leading-none truncate">{k.label}</span>
                  </div>
                  <div className={`text-sm md:text-base font-bold whitespace-nowrap leading-none ${k.valueClass}`}>
                    {k.value}
                  </div>
                  <span className="text-[9px] text-muted-foreground leading-none truncate">{k.hint}</span>
                </CardContent>
              </Card>
            ))}
          </div>

          {filtered.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No hay comisiones en el período seleccionado
              </CardContent>
            </Card>
          ) : (
            <>
              {/* ── Vista mobile: cards ── */}
              <div className="flex flex-col gap-2 md:hidden">
                {filtered.map((c) => (
                  <Card key={c.id} className="overflow-hidden">
                    <CardContent className="p-0">
                      {/* Cabecera de la card */}
                      <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b">
                        <div>
                          <p className="text-xs text-muted-foreground">{formatDate(c.createdAt)}</p>
                          <p className="font-semibold text-sm mt-0.5 truncate max-w-[180px]">
                            {c.clientName || 'Sin cliente'}
                          </p>
                        </div>
                        {c.isPaid ? (
                          <Badge className="bg-green-500 hover:bg-green-600 text-white text-xs shrink-0">Cobrada</Badge>
                        ) : c.estadoPago === 'devolucion' ? (
                          <Badge variant="secondary" className="text-rose-700 bg-rose-50 text-xs shrink-0">Devolución</Badge>
                        ) : c.estadoPago === 'parcial' ? (
                          <Badge variant="secondary" className="text-sky-700 bg-sky-50 text-xs shrink-0">Parcial</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-orange-600 bg-orange-50 text-xs shrink-0">Pendiente</Badge>
                        )}
                      </div>
                      {/* Detalle */}
                      <div className="grid grid-cols-3 divide-x px-0">
                        <div className="px-2 py-2 text-center">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Venta</p>
                          <p className="text-sm font-medium">{formatPrice(c.saleTotal)}</p>
                          {c.saleNumber && (
                            <p className="text-[10px] text-muted-foreground font-mono mt-0.5">#{c.saleNumber}</p>
                          )}
                        </div>
                        <div className="px-2 py-2 text-center">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Tasa</p>
                          <Badge variant="outline" className="text-xs">{c.commissionRate}%</Badge>
                        </div>
                        <div className="px-2 py-2 text-center">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Comisión</p>
                          <p className="text-sm font-bold text-green-600">{formatPrice(c.commissionAmount)}</p>
                          {c.estadoPago === 'parcial' && (
                            <p className="text-[10px] text-sky-700 mt-0.5">cobrado {formatPrice(c.montoImputado ?? 0)}</p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* ── Vista desktop: tabla ── */}
              <Card className="hidden md:block">
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fecha</TableHead>
                        <TableHead>N° Venta</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead className="text-right">Total Venta</TableHead>
                        <TableHead className="text-center">Tasa</TableHead>
                        <TableHead className="text-right">Comisión</TableHead>
                        <TableHead className="text-center">Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="text-sm whitespace-nowrap">{formatDate(c.createdAt)}</TableCell>
                          <TableCell className="text-sm">
                            {c.saleNumber ? (
                              <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">#{c.saleNumber}</span>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm max-w-[160px] truncate">
                            {c.clientName || <span className="text-muted-foreground text-xs">—</span>}
                          </TableCell>
                          <TableCell className="text-right text-sm">{formatPrice(c.saleTotal)}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline">{c.commissionRate}%</Badge>
                          </TableCell>
                          <TableCell className="text-right font-semibold text-green-600">
                            {formatPrice(c.commissionAmount)}
                          </TableCell>
                          <TableCell className="text-center">
                            {c.isPaid ? (
                              <Badge className="bg-green-500 hover:bg-green-600 text-white">Cobrada</Badge>
                            ) : c.estadoPago === 'devolucion' ? (
                              <Badge variant="secondary" className="text-rose-700 bg-rose-50">Devolución</Badge>
                            ) : c.estadoPago === 'parcial' ? (
                              <Badge variant="secondary" className="text-sky-700 bg-sky-50">Parcial</Badge>
                            ) : (
                              <Badge variant="secondary" className="text-orange-600 bg-orange-50">Pendiente</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}
    </MainLayout>
  )
}
