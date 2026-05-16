'use client'

import { useEffect, useState } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { DataTableSkeleton } from '@/components/ui/data-table-skeleton'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { cobranzasApi, sellersApi } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import type { Client, ComprobantePago, Seller } from '@/lib/types'
import { formatCurrency, formatDate } from '@/lib/utils/format'
import { Users, FileCheck, CheckCircle2, XCircle, Clock, Loader2, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'

export default function CuentaCorrientePage() {
  const { user } = useAuth()
  const [debtClients, setDebtClients] = useState<(Client & { sellerName?: string })[]>([])
  const [comprobantes, setComprobantes] = useState<ComprobantePago[]>([])
  const [sellers, setSellers] = useState<Seller[]>([])
  const [loading, setLoading] = useState(true)
  const [filterSeller, setFilterSeller] = useState<string>('all')

  // Dialog states
  const [approveDialog, setApproveDialog] = useState<ComprobantePago | null>(null)
  const [rejectDialog, setRejectDialog] = useState<ComprobantePago | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [processing, setProcessing] = useState(false)

  useEffect(() => {
    let mounted = true
    const load = async () => {
      try {
        const [clientsData, compData, sellersData] = await Promise.all([
          cobranzasApi.getDebtClients(),
          cobranzasApi.getComprobantes(),
          sellersApi.getAll(),
        ])
        if (!mounted) return
        setDebtClients(clientsData)
        setComprobantes(compData)
        setSellers(sellersData.filter((s) => s.isActive))
      } catch {
        // silenciado
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => { mounted = false }
  }, [])

  const totalDeuda = debtClients.reduce((acc, c) => acc + c.currentBalance, 0)
  const pendingComprobantes = comprobantes.filter((c) => c.status === 'pending')
  const filteredClients = filterSeller === 'all'
    ? debtClients
    : debtClients.filter((c) => c.sellerId === filterSeller)

  const handleApprove = async () => {
    if (!approveDialog || !user) return
    setProcessing(true)
    try {
      const updated = await cobranzasApi.approveComprobante(approveDialog.id, user.name || user.email)
      setComprobantes(comprobantes.map((c) => c.id === updated.id ? updated : c))
      // Actualizar deuda del cliente
      setDebtClients(debtClients.map((c) =>
        c.id === approveDialog.clientId
          ? { ...c, currentBalance: c.currentBalance - approveDialog.amount }
          : c
      ).filter((c) => c.currentBalance > 0))
      setApproveDialog(null)
      toast.success('Comprobante aprobado — pago registrado')
    } catch (err: any) {
      toast.error(err.message || 'Error al aprobar')
    } finally {
      setProcessing(false)
    }
  }

  const handleReject = async () => {
    if (!rejectDialog || !rejectReason || !user) return
    setProcessing(true)
    try {
      const updated = await cobranzasApi.rejectComprobante(rejectDialog.id, rejectReason, user.name || user.email)
      setComprobantes(comprobantes.map((c) => c.id === updated.id ? updated : c))
      setRejectDialog(null)
      setRejectReason('')
      toast.success('Comprobante rechazado')
    } catch (err: any) {
      toast.error(err.message || 'Error al rechazar')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <MainLayout title="Cuenta Corriente" description="Gestión de deudas y comprobantes de pago">
      {loading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i}>
                <CardHeader className="pb-2"><Skeleton className="h-4 w-24" /></CardHeader>
                <CardContent><Skeleton className="h-7 w-20" /></CardContent>
              </Card>
            ))}
          </div>
          <DataTableSkeleton columns={5} rows={6} />
        </div>
      ) : (
        <>
          {/* Cards resumen */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
            <Card>
              <CardHeader className="pb-1 pt-4 px-4 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-xs font-medium text-muted-foreground">Deuda total</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="pb-4 px-4">
                <div className="text-xl font-bold text-red-600 truncate">{formatCurrency(totalDeuda)}</div>
                <p className="text-xs text-muted-foreground mt-0.5">{debtClients.length} clientes</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1 pt-4 px-4 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-xs font-medium text-muted-foreground">Comprobantes pendientes</CardTitle>
                <Clock className="h-4 w-4 text-orange-500" />
              </CardHeader>
              <CardContent className="pb-4 px-4">
                <div className="text-xl font-bold text-orange-500">{pendingComprobantes.length}</div>
                <p className="text-xs text-muted-foreground mt-0.5">por revisar</p>
              </CardContent>
            </Card>
            <Card className="col-span-2 md:col-span-1">
              <CardHeader className="pb-1 pt-4 px-4 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-xs font-medium text-muted-foreground">Vendedores activos</CardTitle>
                <FileCheck className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="pb-4 px-4">
                <div className="text-xl font-bold">{sellers.length}</div>
                <p className="text-xs text-muted-foreground mt-0.5">con clientes asignados</p>
              </CardContent>
            </Card>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="deudores">
            <TabsList className="mb-4">
              <TabsTrigger value="deudores">Deudores</TabsTrigger>
              <TabsTrigger value="comprobantes" className="relative">
                Comprobantes
                {pendingComprobantes.length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-[10px] rounded-full h-4 w-4 flex items-center justify-center">
                    {pendingComprobantes.length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            {/* Tab Deudores */}
            <TabsContent value="deudores">
              <div className="flex items-center gap-3 mb-4">
                <Label className="text-sm whitespace-nowrap">Filtrar por vendedor:</Label>
                <Select value={filterSeller} onValueChange={setFilterSeller}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {sellers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {filteredClients.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground">
                    No hay clientes con deuda
                  </CardContent>
                </Card>
              ) : (
                <>
                  {/* Mobile */}
                  <div className="flex flex-col gap-3 md:hidden">
                    {filteredClients.map((c) => (
                      <Card key={c.id}>
                        <CardContent className="p-4">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-semibold text-sm">{c.name}</p>
                              <p className="text-xs text-muted-foreground">{c.sellerName || 'Sin vendedor'}</p>
                            </div>
                            <div className="text-right">
                              <p className="font-bold text-red-600">{formatCurrency(c.currentBalance)}</p>
                              <p className="text-xs text-muted-foreground">/{formatCurrency(c.creditLimit)}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  {/* Desktop */}
                  <Card className="hidden md:block">
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Cliente</TableHead>
                            <TableHead>Vendedor</TableHead>
                            <TableHead className="text-right">Deuda</TableHead>
                            <TableHead className="text-right">Límite</TableHead>
                            <TableHead className="text-center">% Usado</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredClients.map((c) => {
                            const pct = c.creditLimit > 0 ? Math.round((c.currentBalance / c.creditLimit) * 100) : 100
                            return (
                              <TableRow key={c.id}>
                                <TableCell className="font-medium">{c.name}</TableCell>
                                <TableCell className="text-sm text-muted-foreground">{c.sellerName || 'Sin asignar'}</TableCell>
                                <TableCell className="text-right font-bold text-red-600">{formatCurrency(c.currentBalance)}</TableCell>
                                <TableCell className="text-right text-sm">{formatCurrency(c.creditLimit)}</TableCell>
                                <TableCell className="text-center">
                                  <Badge variant={pct >= 90 ? 'destructive' : pct >= 70 ? 'secondary' : 'outline'}>
                                    {pct}%
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </>
              )}
            </TabsContent>

            {/* Tab Comprobantes */}
            <TabsContent value="comprobantes">
              {comprobantes.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground">
                    No hay comprobantes registrados
                  </CardContent>
                </Card>
              ) : (
                <>
                  {/* Mobile */}
                  <div className="flex flex-col gap-3 md:hidden">
                    {comprobantes.map((c) => (
                      <Card key={c.id}>
                        <CardContent className="p-4">
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <p className="font-semibold text-sm">{c.clientName || '—'}</p>
                              <p className="text-xs text-muted-foreground">{c.sellerName} · {formatDate(c.createdAt)}</p>
                            </div>
                            <div className="text-right">
                              <p className="font-bold">{formatCurrency(c.amount)}</p>
                              {statusBadge(c.status)}
                            </div>
                          </div>
                          {c.status === 'pending' && (
                            <div className="flex gap-2 mt-3">
                              <Button size="sm" className="flex-1 bg-green-600 hover:bg-green-700" onClick={() => setApproveDialog(c)}>
                                <CheckCircle2 className="h-3 w-3 mr-1" />Aprobar
                              </Button>
                              <Button size="sm" variant="destructive" className="flex-1" onClick={() => setRejectDialog(c)}>
                                <XCircle className="h-3 w-3 mr-1" />Rechazar
                              </Button>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  {/* Desktop */}
                  <Card className="hidden md:block">
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Fecha</TableHead>
                            <TableHead>Cliente</TableHead>
                            <TableHead>Vendedor</TableHead>
                            <TableHead className="text-right">Monto</TableHead>
                            <TableHead>Archivo</TableHead>
                            <TableHead className="text-center">Estado</TableHead>
                            <TableHead className="text-center">Acciones</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {comprobantes.map((c) => (
                            <TableRow key={c.id}>
                              <TableCell className="text-sm">{formatDate(c.createdAt)}</TableCell>
                              <TableCell className="text-sm font-medium">{c.clientName || '—'}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">{c.sellerName || '—'}</TableCell>
                              <TableCell className="text-right font-semibold">{formatCurrency(c.amount)}</TableCell>
                              <TableCell>
                                <a href={c.fileUrl} target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:underline text-sm inline-flex items-center gap-1">
                                  {c.fileName || 'Ver'} <ExternalLink className="h-3 w-3" />
                                </a>
                              </TableCell>
                              <TableCell className="text-center">{statusBadge(c.status)}</TableCell>
                              <TableCell className="text-center">
                                {c.status === 'pending' ? (
                                  <div className="flex gap-1 justify-center">
                                    <Button size="sm" variant="outline" className="text-green-600 border-green-300 hover:bg-green-50" onClick={() => setApproveDialog(c)}>
                                      <CheckCircle2 className="h-3 w-3" />
                                    </Button>
                                    <Button size="sm" variant="outline" className="text-red-600 border-red-300 hover:bg-red-50" onClick={() => setRejectDialog(c)}>
                                      <XCircle className="h-3 w-3" />
                                    </Button>
                                  </div>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
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
            </TabsContent>
          </Tabs>

          {/* Dialog Aprobar */}
          <Dialog open={!!approveDialog} onOpenChange={(open) => !open && setApproveDialog(null)}>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>Aprobar comprobante</DialogTitle>
              </DialogHeader>
              {approveDialog && (
                <div className="space-y-2 text-sm">
                  <p><strong>Cliente:</strong> {approveDialog.clientName}</p>
                  <p><strong>Monto:</strong> {formatCurrency(approveDialog.amount)}</p>
                  <p><strong>Vendedor:</strong> {approveDialog.sellerName}</p>
                  <p className="text-muted-foreground">Al aprobar, se registrará el pago y se descontará del saldo del cliente.</p>
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setApproveDialog(null)}>Cancelar</Button>
                <Button className="bg-green-600 hover:bg-green-700" onClick={handleApprove} disabled={processing}>
                  {processing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Confirmar aprobación
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Dialog Rechazar */}
          <Dialog open={!!rejectDialog} onOpenChange={(open) => !open && setRejectDialog(null)}>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>Rechazar comprobante</DialogTitle>
              </DialogHeader>
              {rejectDialog && (
                <div className="space-y-3">
                  <div className="text-sm">
                    <p><strong>Cliente:</strong> {rejectDialog.clientName}</p>
                    <p><strong>Monto:</strong> {formatCurrency(rejectDialog.amount)}</p>
                  </div>
                  <div>
                    <Label>Motivo del rechazo</Label>
                    <Textarea
                      placeholder="Indicar por qué se rechaza..."
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      rows={3}
                    />
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => { setRejectDialog(null); setRejectReason('') }}>Cancelar</Button>
                <Button variant="destructive" onClick={handleReject} disabled={!rejectReason || processing}>
                  {processing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Rechazar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </MainLayout>
  )
}

function statusBadge(status: string) {
  switch (status) {
    case 'pending':
      return <Badge variant="secondary" className="text-orange-600 bg-orange-50"><Clock className="h-3 w-3 mr-1" />Pendiente</Badge>
    case 'approved':
      return <Badge className="bg-green-500 hover:bg-green-600 text-white"><CheckCircle2 className="h-3 w-3 mr-1" />Aprobado</Badge>
    case 'rejected':
      return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Rechazado</Badge>
    default:
      return null
  }
}
