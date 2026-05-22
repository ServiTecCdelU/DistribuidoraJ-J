'use client'

import { useEffect, useState, useRef } from 'react'
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
import { cobranzasApi } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import type { Client, ComprobantePago } from '@/lib/types'
import { formatCurrency, formatDate } from '@/lib/utils/format'
import { Users, FileCheck, Upload, Clock, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export default function CobranzasPage() {
  const { user } = useAuth()
  const [clients, setClients] = useState<Client[]>([])
  const [comprobantes, setComprobantes] = useState<ComprobantePago[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [uploading, setUploading] = useState(false)

  // Form state
  const [selectedClientId, setSelectedClientId] = useState('')
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let mounted = true
    const load = async () => {
      if (!user?.sellerId) {
        if (mounted) setLoading(false)
        return
      }
      try {
        const [clientsData, compData] = await Promise.all([
          cobranzasApi.getClientsBySeller(user.sellerId),
          cobranzasApi.getComprobantesBySeller(user.sellerId),
        ])
        if (!mounted) return
        setClients(clientsData)
        setComprobantes(compData)
      } catch {
        // silenciado
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => { mounted = false }
  }, [user?.sellerId])

  const totalDeuda = clients.reduce((acc, c) => acc + c.currentBalance, 0)
  const pendingCount = comprobantes.filter((c) => c.status === 'pending').length
  const approvedThisMonth = comprobantes.filter((c) => {
    if (c.status !== 'approved') return false
    const now = new Date()
    return c.createdAt.getMonth() === now.getMonth() && c.createdAt.getFullYear() === now.getFullYear()
  }).length

  const handleSubmit = async () => {
    if (!selectedClientId || !amount || !file || !user?.sellerId) return
    setUploading(true)
    try {
      const newComp = await cobranzasApi.uploadComprobante({
        clientId: selectedClientId,
        sellerId: user.sellerId,
        amount: Number(amount),
        notes: notes || undefined,
        file,
      })
      setComprobantes([newComp, ...comprobantes])
      setDialogOpen(false)
      setSelectedClientId('')
      setAmount('')
      setNotes('')
      setFile(null)
      toast.success('Comprobante enviado para revisión')
    } catch (err: any) {
      toast.error(err.message || 'Error al subir comprobante')
    } finally {
      setUploading(false)
    }
  }

  const statusBadge = (status: string) => {
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

  return (
    <MainLayout allowedRoles={['admin', 'seller']} title="Cobranzas" description="Deudas de tus clientes y comprobantes de pago">
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
          <DataTableSkeleton columns={4} rows={5} />
        </div>
      ) : (
        <>
          {/* Cards resumen */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
            <Card>
              <CardHeader className="pb-1 pt-4 px-4 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-xs font-medium text-muted-foreground">Deuda total asignada</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="pb-4 px-4">
                <div className="text-xl font-bold text-red-600 truncate">{formatCurrency(totalDeuda)}</div>
                <p className="text-xs text-muted-foreground mt-0.5">{clients.length} clientes</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1 pt-4 px-4 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-xs font-medium text-muted-foreground">Comprobantes pendientes</CardTitle>
                <Clock className="h-4 w-4 text-orange-500" />
              </CardHeader>
              <CardContent className="pb-4 px-4">
                <div className="text-xl font-bold text-orange-500">{pendingCount}</div>
                <p className="text-xs text-muted-foreground mt-0.5">esperando revisión</p>
              </CardContent>
            </Card>
            <Card className="col-span-1">
              <CardHeader className="pb-1 pt-4 px-4 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-xs font-medium text-muted-foreground">Aprobados este mes</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent className="pb-4 px-4">
                <div className="text-xl font-bold text-green-600">{approvedThisMonth}</div>
                <p className="text-xs text-muted-foreground mt-0.5">comprobantes</p>
              </CardContent>
            </Card>
          </div>

          {/* Botón subir comprobante */}
          <div className="flex justify-end mb-4">
            <Button onClick={() => setDialogOpen(true)} disabled={clients.length === 0}>
              <Upload className="h-4 w-4 mr-2" />
              Cargar comprobante
            </Button>
          </div>

          {/* Tabla de clientes con deuda */}
          {clients.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No tenés clientes con deuda asignados
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Mobile */}
              <div className="flex flex-col gap-3 md:hidden mb-6">
                {clients.map((c) => (
                  <Card key={c.id}>
                    <CardContent className="p-4">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="font-semibold text-sm">{c.name}</p>
                          <p className="text-xs text-muted-foreground">{c.phone || c.email || '—'}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-red-600">{formatCurrency(c.currentBalance)}</p>
                          <p className="text-xs text-muted-foreground">Límite: {formatCurrency(c.creditLimit)}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Desktop */}
              <Card className="hidden md:block mb-6">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Clientes con deuda</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Contacto</TableHead>
                        <TableHead className="text-right">Deuda</TableHead>
                        <TableHead className="text-right">Límite</TableHead>
                        <TableHead className="text-center">% Usado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {clients.map((c) => {
                        const pct = c.creditLimit > 0 ? Math.round((c.currentBalance / c.creditLimit) * 100) : 100
                        return (
                          <TableRow key={c.id}>
                            <TableCell className="font-medium">{c.name}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{c.phone || c.email || '—'}</TableCell>
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

          {/* Mis comprobantes */}
          {comprobantes.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileCheck className="h-4 w-4" />
                  Mis comprobantes
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {/* Mobile */}
                <div className="flex flex-col gap-3 p-4 md:hidden">
                  {comprobantes.map((c) => (
                    <div key={c.id} className="flex justify-between items-center border-b pb-3 last:border-0">
                      <div>
                        <p className="text-sm font-medium">{c.clientName || '—'}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(c.createdAt)}</p>
                        {c.status === 'rejected' && c.rejectionReason && (
                          <p className="text-xs text-red-600 mt-1">Motivo: {c.rejectionReason}</p>
                        )}
                      </div>
                      <div className="text-right flex flex-col items-end gap-1">
                        <p className="font-semibold text-sm">{formatCurrency(c.amount)}</p>
                        {statusBadge(c.status)}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop */}
                <Table className="hidden md:table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead>Notas</TableHead>
                      <TableHead className="text-center">Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {comprobantes.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="text-sm">{formatDate(c.createdAt)}</TableCell>
                        <TableCell className="text-sm">{c.clientName || '—'}</TableCell>
                        <TableCell className="text-right font-semibold">{formatCurrency(c.amount)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                          {c.notes || '—'}
                          {c.status === 'rejected' && c.rejectionReason && (
                            <span className="block text-red-600 text-xs">Rechazado: {c.rejectionReason}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">{statusBadge(c.status)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Dialog subir comprobante */}
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Cargar comprobante de pago</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Cliente</Label>
                  <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar cliente" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name} — {formatCurrency(c.currentBalance)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Monto cobrado</Label>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Comprobante (foto o PDF)</Label>
                  <Input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                  />
                </div>
                <div>
                  <Label>Notas (opcional)</Label>
                  <Textarea
                    placeholder="Detalle del pago..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={handleSubmit}
                  disabled={!selectedClientId || !amount || !file || uploading}
                >
                  {uploading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Enviar comprobante
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </MainLayout>
  )
}
