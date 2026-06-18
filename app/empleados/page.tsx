'use client'

import React from "react"

import { useEffect, useState } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DataTableSkeleton } from '@/components/ui/data-table-skeleton'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { sellersApi, ordersApi } from '@/lib/api'
import type { Seller, SellerCommission, EmployeeType, Order } from '@/lib/types'
import { formatCurrency, formatDate } from '@/lib/utils/format'
import { statusConfig } from '@/lib/order-constants'
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Eye,
  MoreVertical,
  Phone,
  Mail,
  Users,
  TrendingUp,
  DollarSign,
  Percent,
  X,
  CheckCircle,
  Clock,
  Banknote,
  Loader2,
  Truck,
  ShoppingCart,
  MapPin,
  Package,
  Calendar,
  ChevronDown,
} from 'lucide-react'
import { toast } from 'sonner'

const EMPLOYEE_TYPE_LABELS: Record<EmployeeType, string> = {
  vendedor: 'Vendedor',
  transportista: 'Transportista',
  ambos: 'Vendedor + Transportista',
}

const EMPLOYEE_TYPE_BADGE: Record<EmployeeType, string> = {
  vendedor: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800',
  transportista: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 border border-violet-200 dark:border-violet-800',
  ambos: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400 border border-teal-200 dark:border-teal-800',
}

export default function EmpleadosPage() {
  const [sellers, setSellers] = useState<Seller[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingSeller, setEditingSeller] = useState<Seller | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [sellerToDelete, setSellerToDelete] = useState<Seller | null>(null)

  // Detail modal state
  const [detailModalOpen, setDetailModalOpen] = useState(false)
  const [selectedSeller, setSelectedSeller] = useState<Seller | null>(null)
  const [commissions, setCommissions] = useState<SellerCommission[]>([])
  const [loadingCommissions, setLoadingCommissions] = useState(false)
  const [pagos, setPagos] = useState<any[]>([])
  const [resetting, setResetting] = useState(false)

  // Pedidos activos del empleado
  const [activeOrders, setActiveOrders] = useState<Order[]>([])
  const [loadingOrders, setLoadingOrders] = useState(false)
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null)

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    codigoVendedor: '',
    isVendedor: true,
    isTransportista: false,
    commissionRate: 10,
    transportistaCommissionRate: 10,
    isActive: true,
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let mounted = true
    const doLoad = async () => {
      try {
        const data = await sellersApi.getAll()
        if (!mounted) return
        setSellers(data)
      } catch (error) {
        if (!mounted) return

        toast.error('Error al cargar empleados')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    doLoad()
    return () => { mounted = false }
  }, [])

  const loadSellers = async () => {
    try {
      const data = await sellersApi.getAll()
      setSellers(data)
    } catch (error) {
      toast.error('Error al cargar empleados')
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = () => {
    setEditingSeller(null)
    setFormData({
      name: '',
      email: '',
      phone: '',
      codigoVendedor: '',
      isVendedor: true,
      isTransportista: false,
      commissionRate: 10,
      transportistaCommissionRate: 10,
      isActive: true,
    })
    setModalOpen(true)
  }

  const handleEdit = (seller: Seller) => {
    setEditingSeller(seller)
    setFormData({
      name: seller.name,
      email: seller.email,
      phone: seller.phone,
      codigoVendedor: seller.codigoVendedor ?? '',
      isVendedor: seller.employeeType === 'vendedor' || seller.employeeType === 'ambos',
      isTransportista: seller.employeeType === 'transportista' || seller.employeeType === 'ambos',
      commissionRate: seller.commissionRate,
      transportistaCommissionRate: seller.transportistaCommissionRate ?? 10,
      isActive: seller.isActive,
    })
    setModalOpen(true)
  }

  const handleDelete = (seller: Seller) => {
    setSellerToDelete(seller)
    setDeleteDialogOpen(true)
  }

  const handleViewDetail = async (seller: Seller) => {
    setSelectedSeller(seller)
    setDetailModalOpen(true)
    setExpandedOrderId(null)
    setActiveOrders([])
    setLoadingCommissions(true)
    setLoadingOrders(true)
    try {
      const [data, pagosData] = await Promise.all([
        sellersApi.getCommissions(seller.id),
        sellersApi.getPagosComisiones(seller.id),
      ])
      setCommissions(data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()))
      setPagos(pagosData)
    } catch (error) {
      toast.error('Error al cargar comisiones')
    } finally {
      setLoadingCommissions(false)
    }
    try {
      const esVendedor = seller.employeeType === 'vendedor' || seller.employeeType === 'ambos'
      const esTransportista = seller.employeeType === 'transportista' || seller.employeeType === 'ambos'
      const [porVendedor, porTransportista] = await Promise.all([
        esVendedor ? ordersApi.getBySeller(seller.id) : Promise.resolve([] as Order[]),
        esTransportista ? ordersApi.getByTransportista(seller.id) : Promise.resolve([] as Order[]),
      ])
      const dedup = new Map<string, Order>()
      for (const o of [...porVendedor, ...porTransportista]) dedup.set(o.id, o)
      const activos = Array.from(dedup.values())
        .filter((o) => o.status !== 'completed')
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      setActiveOrders(activos)
    } catch (error) {
      toast.error('Error al cargar pedidos del empleado')
    } finally {
      setLoadingOrders(false)
    }
  }

  const confirmDelete = async () => {
    if (!sellerToDelete) return
    try {
      await sellersApi.delete(sellerToDelete.id)
      setSellers(sellers.filter(s => s.id !== sellerToDelete.id))
      toast.success('Empleado eliminado correctamente')
    } catch (error: any) {
      toast.error(error.message || 'Error al eliminar empleado')
    } finally {
      setDeleteDialogOpen(false)
      setSellerToDelete(null)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.isVendedor && !formData.isTransportista) {
      toast.error('Seleccioná al menos un rol (Vendedor o Transportista)')
      return
    }
    setSaving(true)
    const employeeType: EmployeeType =
      formData.isVendedor && formData.isTransportista ? 'ambos'
      : formData.isTransportista ? 'transportista'
      : 'vendedor'
    const payload: Record<string, any> = {
      name: formData.name,
      email: formData.email,
      phone: formData.phone,
      codigoVendedor: formData.codigoVendedor.trim() || undefined,
      employeeType,
      commissionRate: formData.isVendedor ? formData.commissionRate : 0,
      isActive: formData.isActive,
    }
    if (formData.isTransportista) {
      payload.transportistaCommissionRate = formData.transportistaCommissionRate
    }
    try {
      if (editingSeller) {
        const updated = await sellersApi.update(editingSeller.id, payload)
        setSellers(sellers.map(s => s.id === editingSeller.id ? updated : s))
        toast.success('Empleado actualizado correctamente')
      } else {
        const newSeller = await sellersApi.create(payload)
        setSellers([newSeller, ...sellers])
        toast.success('Empleado creado correctamente')
      }
      setModalOpen(false)
    } catch (error) {
      toast.error('Error al guardar empleado')
    } finally {
      setSaving(false)
    }
  }

  const handleResetCommissions = async () => {
    if (!selectedSeller) return
    setResetting(true)
    try {
      await sellersApi.resetCommissions(selectedSeller.id, selectedSeller.name)
      const [updatedCommissions, pagosData] = await Promise.all([
        sellersApi.getCommissions(selectedSeller.id),
        sellersApi.getPagosComisiones(selectedSeller.id),
      ])
      setCommissions(updatedCommissions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()))
      setPagos(pagosData)
      await loadSellers()
      toast.success('Comisiones reseteadas y pago registrado')
    } catch (error: any) {
      toast.error(error?.message || 'Error al resetear comisiones')
    } finally {
      setResetting(false)
    }
  }

  const filteredSellers = sellers.filter(seller => {
    const query = searchQuery.toLowerCase()
    const matchesSearch =
      seller.name.toLowerCase().includes(query) ||
      (seller.email?.toLowerCase().includes(query) ?? false) ||
      (seller.phone?.toLowerCase().includes(query) ?? false)
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && seller.isActive) ||
      (statusFilter === 'inactive' && !seller.isActive)
    const matchesType =
      typeFilter === 'all' ||
      (typeFilter === 'vendedor' && (seller.employeeType === 'vendedor' || seller.employeeType === 'ambos')) ||
      (typeFilter === 'transportista' && (seller.employeeType === 'transportista' || seller.employeeType === 'ambos'))
    return matchesSearch && matchesStatus && matchesType
  })

  const getCommissionColor = (rate: number) => {
    if (rate >= 15) return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800'
    if (rate >= 10) return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
    return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
  }

  const getStatusBadge = (isActive: boolean) => {
    if (isActive) {
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
    }
    return 'bg-slate-100 text-slate-700 dark:bg-slate-800/50 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
  }

  const getEmployeeTypeIcon = (type: EmployeeType) => {
    if (type === 'vendedor') return <ShoppingCart className="h-3 w-3 mr-1" />
    if (type === 'transportista') return <Truck className="h-3 w-3 mr-1" />
    return <Users className="h-3 w-3 mr-1" />
  }

  // Stats
  const activeSellers = sellers.filter(s => s.isActive).length
  const totalSales = sellers.reduce((sum, s) => sum + (s.totalSales || 0), 0)
  const totalCommissions = sellers.reduce((sum, s) => sum + (s.totalCommission || 0), 0)
  const avgCommissionRate = sellers.length > 0
    ? sellers.reduce((sum, s) => sum + s.commissionRate, 0) / sellers.length
    : 0

  // Commissions for detail modal
  const pendingCommissions = commissions.filter(c => !c.isPaid)
  const pendingTotal = pendingCommissions.reduce((sum, c) => sum + c.commissionAmount, 0)
  const allSalesTotal = commissions.reduce((sum, c) => sum + c.saleTotal, 0)
  const allCommissionsTotal = commissions.reduce((sum, c) => sum + c.commissionAmount, 0)

  // Pedidos activos agrupados por día y luego por cliente (más reciente primero)
  const ordersByDay = activeOrders.reduce<Record<string, { label: string; clients: Record<string, Order[]> }>>((acc, order) => {
    const d = new Date(order.createdAt)
    const key = d.toISOString().slice(0, 10)
    if (!acc[key]) acc[key] = { label: formatDate(order.createdAt), clients: {} }
    const cliente = order.clientName || 'Sin cliente'
    if (!acc[key].clients[cliente]) acc[key].clients[cliente] = []
    acc[key].clients[cliente].push(order)
    return acc
  }, {})
  const orderDays = Object.keys(ordersByDay).sort((a, b) => b.localeCompare(a))
  // Contador de pedidos por cliente (clientes distintos con pedidos activos)
  const totalClientes = new Set(activeOrders.map((o) => o.clientName || 'Sin cliente')).size

  return (
    <MainLayout allowedRoles={['admin']} title="Empleados" description="Gestiona tu equipo de vendedores y transportistas">
      {/* Stats Cards - Solo visible en desktop */}
      <div className="hidden lg:grid grid-cols-4 gap-4 mb-6">
        <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Empleados Activos</p>
                <p className="text-2xl font-bold text-foreground">{activeSellers}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-amber-500/5 to-amber-500/10 border-amber-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <TrendingUp className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Ventas Totales</p>
                <p className="text-2xl font-bold text-foreground">{formatCurrency(totalSales)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-rose-500/5 to-rose-500/10 border-rose-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-rose-500/10">
                <DollarSign className="h-5 w-5 text-rose-600 dark:text-rose-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Comisiones Totales</p>
                <p className="text-2xl font-bold text-foreground">{formatCurrency(totalCommissions)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-emerald-500/5 to-emerald-500/10 border-emerald-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10">
                <Percent className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Comision Promedio</p>
                <p className="text-2xl font-bold text-foreground">{avgCommissionRate.toFixed(1)}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Header Actions - Desktop */}
      <div className="hidden md:flex flex-row gap-4 justify-between mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, email o telefono..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-background"
          />
        </div>
        <div className="flex flex-row gap-3">
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="all">Todos los tipos</option>
            <option value="vendedor">Vendedor</option>
            <option value="transportista">Transportista</option>
          </select>
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">Todos los estados</option>
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
          </select>
          <Button onClick={handleCreate} className="gap-2 shadow-sm">
            <Plus className="h-4 w-4" />
            Nuevo Empleado
          </Button>
        </div>
      </div>

      {/* Header Actions - Mobile */}
      <div className="flex md:hidden flex-col gap-3 mb-4">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar empleado..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-background"
          />
        </div>
        <div className="flex gap-2">
          <select
            className="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="all">Todos los tipos</option>
            <option value="vendedor">Vendedor</option>
            <option value="transportista">Transportista</option>
          </select>
          <select
            className="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">Todos</option>
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
          </select>
        </div>
      </div>

      {/* Loading State */}
      {loading ? (
        <>
          <div className="hidden md:block">
            <DataTableSkeleton columns={8} rows={5} />
          </div>
          <div className="md:hidden space-y-3 pb-20">
            {[1, 2, 3, 4, 5].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-4">
                  <div className="h-5 bg-muted rounded w-2/3 mb-2" />
                  <div className="h-4 bg-muted rounded w-1/3 mb-3" />
                  <div className="h-4 bg-muted rounded w-1/2" />
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      ) : (
        <>
          {/* Empty State */}
          {filteredSellers.length === 0 ? (
            <Card className="border-dashed border-2">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <div className="rounded-full bg-primary/10 p-4 mb-4">
                  <Users className="h-10 w-10 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-1">No se encontraron empleados</h3>
                <p className="text-muted-foreground text-sm text-center mb-6 max-w-sm">
                  {searchQuery || statusFilter !== 'all' || typeFilter !== 'all'
                    ? 'Intenta ajustar los filtros de busqueda para encontrar lo que buscas'
                    : 'Comienza agregando tu primer empleado para gestionar tu equipo'}
                </p>
                {!searchQuery && statusFilter === 'all' && typeFilter === 'all' && (
                  <Button onClick={handleCreate} className="gap-2" size="lg">
                    <Plus className="h-5 w-5" />
                    Agregar Primer Empleado
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block rounded-xl border border-border bg-card overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="text-left p-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Empleado</th>
                        <th className="text-center p-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Tipo</th>
                        <th className="text-left p-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Contacto</th>
                        <th className="text-center p-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Comision</th>
                        <th className="text-right p-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Ventas</th>
                        <th className="text-right p-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Comisiones</th>
                        <th className="text-center p-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Estado</th>
                        <th className="text-center p-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredSellers.map((seller) => (
                        <tr key={seller.id} className="hover:bg-muted/40 transition-colors group">
                          <td className="p-4">
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                <span className="text-sm font-semibold text-primary">
                                  {seller.name.charAt(0).toUpperCase()}
                                </span>
                              </div>
                              <div className="min-w-0">
                                <p className="font-medium text-foreground truncate">{seller.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  Desde {formatDate(seller.createdAt)}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="p-4 text-center">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${EMPLOYEE_TYPE_BADGE[seller.employeeType]}`}>
                              {getEmployeeTypeIcon(seller.employeeType)}
                              {EMPLOYEE_TYPE_LABELS[seller.employeeType]}
                            </span>
                          </td>
                          <td className="p-4">
                            <div className="space-y-1">
                              {seller.email && (
                                <p className="text-sm text-foreground flex items-center gap-1.5">
                                  <Mail className="h-3 w-3 text-muted-foreground shrink-0" />
                                  <span className="truncate max-w-[180px]">{seller.email}</span>
                                </p>
                              )}
                              {seller.phone && (
                                <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                                  <Phone className="h-3 w-3 shrink-0" />
                                  {seller.phone}
                                </p>
                              )}
                              {!seller.email && !seller.phone && (
                                <span className="text-sm text-muted-foreground">-</span>
                              )}
                            </div>
                          </td>
                          <td className="p-4 text-center">
                            <div className="flex flex-col items-center gap-1">
                              {(seller.employeeType === 'vendedor' || seller.employeeType === 'ambos') && (
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getCommissionColor(seller.commissionRate)}`}>
                                  <ShoppingCart className="h-2.5 w-2.5 mr-1" />{seller.commissionRate}%
                                </span>
                              )}
                              {(seller.employeeType === 'transportista' || seller.employeeType === 'ambos') && (
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getCommissionColor(seller.transportistaCommissionRate ?? 0)}`}>
                                  <Truck className="h-2.5 w-2.5 mr-1" />{seller.transportistaCommissionRate ?? 0}%
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-4 text-right">
                            <span className="font-medium text-foreground">
                              {formatCurrency(seller.totalSales || 0)}
                            </span>
                          </td>
                          <td className="p-4 text-right">
                            <span className="font-medium text-emerald-600 dark:text-emerald-400">
                              {formatCurrency(seller.totalCommission || 0)}
                            </span>
                          </td>
                          <td className="p-4 text-center">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${getStatusBadge(seller.isActive)}`}>
                              {seller.isActive ? 'Activo' : 'Inactivo'}
                            </span>
                          </td>
                          <td className="p-4">
                            <div className="flex justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 hover:bg-primary/10 hover:text-primary"
                                onClick={() => handleViewDetail(seller)}
                              >
                                <Eye className="h-4 w-4" />
                                <span className="sr-only">Ver detalle</span>
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 hover:bg-blue-500/10 hover:text-blue-600"
                                onClick={() => handleEdit(seller)}
                              >
                                <Pencil className="h-4 w-4" />
                                <span className="sr-only">Editar</span>
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 hover:bg-red-500/10 text-red-500 hover:text-red-600"
                                onClick={() => handleDelete(seller)}
                              >
                                <Trash2 className="h-4 w-4" />
                                <span className="sr-only">Eliminar</span>
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden space-y-2 pb-24">
                {filteredSellers.map((seller) => (
                  <Card key={seller.id} className="overflow-hidden border-border/60 shadow-sm active:scale-[0.99] transition-transform">
                    <CardContent className="p-0" style={{ fontSize: '11px' }}>
                      {/* Card Header */}
                      <div className="p-1.5 border-b border-border/50 bg-muted/30">
                        <div className="flex items-start justify-between gap-1.5">
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                              <span className="text-[10px] font-semibold text-primary">
                                {seller.name.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <h3 className="font-semibold text-foreground truncate text-[13px] leading-tight">{seller.name}</h3>
                              <p className="text-[10px] text-muted-foreground leading-tight">Desde {formatDate(seller.createdAt)}</p>
                            </div>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 -mr-0.5">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem onClick={() => handleViewDetail(seller)} className="flex items-center gap-2">
                                <Eye className="h-4 w-4" />
                                Ver detalle
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleEdit(seller)} className="flex items-center gap-2">
                                <Pencil className="h-4 w-4" />
                                Editar empleado
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleDelete(seller)}
                                className="flex items-center gap-2 text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-900/20"
                              >
                                <Trash2 className="h-4 w-4" />
                                Eliminar
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        <div className="flex items-center gap-1 mt-1 flex-wrap">
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${EMPLOYEE_TYPE_BADGE[seller.employeeType]}`}>
                            {getEmployeeTypeIcon(seller.employeeType)}
                            {EMPLOYEE_TYPE_LABELS[seller.employeeType]}
                          </span>
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${getStatusBadge(seller.isActive)}`}>
                            {seller.isActive ? 'Activo' : 'Inactivo'}
                          </span>
                          {(seller.employeeType === 'vendedor' || seller.employeeType === 'ambos') && (
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${getCommissionColor(seller.commissionRate)}`}>
                              <ShoppingCart className="h-2.5 w-2.5 mr-0.5" />{seller.commissionRate}%
                            </span>
                          )}
                          {(seller.employeeType === 'transportista' || seller.employeeType === 'ambos') && (
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${getCommissionColor(seller.transportistaCommissionRate ?? 0)}`}>
                              <Truck className="h-2.5 w-2.5 mr-0.5" />{seller.transportistaCommissionRate ?? 0}%
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Card Body */}
                      <div className="p-1.5 space-y-1.5">
                        {/* Contact Info */}
                        {(seller.phone || seller.email) && (
                          <div className="flex items-center gap-3 text-[11px] min-w-0">
                            {seller.phone && (
                              <a
                                href={`tel:${seller.phone}`}
                                className="flex items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors shrink-0"
                              >
                                <Phone className="h-3 w-3 shrink-0" />
                                {seller.phone}
                              </a>
                            )}
                            {seller.email && (
                              <a
                                href={`mailto:${seller.email}`}
                                className="flex items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors min-w-0"
                              >
                                <Mail className="h-3 w-3 shrink-0" />
                                <span className="truncate">{seller.email}</span>
                              </a>
                            )}
                          </div>
                        )}

                        {/* Stats */}
                        <div className="grid grid-cols-2 gap-1.5">
                          <div className="rounded-md px-2 py-1 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 flex items-baseline justify-between gap-1">
                            <p className="text-[10px] text-muted-foreground font-medium uppercase">Ventas</p>
                            <p className="font-bold text-[12px] text-foreground tabular-nums">
                              {formatCurrency(seller.totalSales || 0)}
                            </p>
                          </div>
                          <div className="rounded-md px-2 py-1 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 flex items-baseline justify-between gap-1">
                            <p className="text-[10px] text-muted-foreground font-medium uppercase">Comis.</p>
                            <p className="font-bold text-[12px] text-emerald-600 dark:text-emerald-400 tabular-nums">
                              {formatCurrency(seller.totalCommission || 0)}
                            </p>
                          </div>
                        </div>

                        {/* Quick Actions */}
                        <div className="flex gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 h-6 bg-transparent text-[11px] px-2"
                            onClick={() => handleEdit(seller)}
                          >
                            <Pencil className="h-3 w-3 mr-1" />
                            Editar
                          </Button>
                          <Button
                            size="sm"
                            className="flex-1 h-6 text-[11px] px-2"
                            onClick={() => handleViewDetail(seller)}
                          >
                            <Eye className="h-3 w-3 mr-1" />
                            Ver Detalle
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* FAB for Mobile */}
      <div className="md:hidden fixed bottom-6 right-6 z-50">
        <Button
          onClick={handleCreate}
          className="h-14 w-14 rounded-full shadow-lg shadow-primary/25"
          size="icon"
        >
          <Plus className="h-6 w-6" />
          <span className="sr-only">Nuevo Empleado</span>
        </Button>
      </div>

      {/* Create/Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingSeller ? 'Editar Empleado' : 'Nuevo Empleado'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Nombre Completo</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ej: Juan Perez"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="codigoVendedor">Código de vendedor</Label>
                <Input
                  id="codigoVendedor"
                  value={formData.codigoVendedor}
                  onChange={(e) => setFormData({ ...formData, codigoVendedor: e.target.value })}
                  placeholder="Ej: 3"
                />
              </div>
              <div className="grid gap-2">
                <Label>Roles del Empleado</Label>
                <div className="rounded-lg border border-border/60 divide-y divide-border/40">
                  <div className="flex items-center gap-3 p-3">
                    <Checkbox
                      id="isVendedor"
                      checked={formData.isVendedor}
                      onCheckedChange={(checked) => setFormData({ ...formData, isVendedor: !!checked })}
                    />
                    <label htmlFor="isVendedor" className="flex items-center gap-2 cursor-pointer flex-1">
                      <ShoppingCart className="h-4 w-4 text-blue-500" />
                      <span className="text-sm font-medium">Vendedor</span>
                    </label>
                    {formData.isVendedor && (
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.5"
                          value={formData.commissionRate}
                          onChange={(e) => setFormData({ ...formData, commissionRate: Number(e.target.value) })}
                          className="h-8 w-20 text-sm text-center"
                        />
                        <span className="text-sm text-muted-foreground">%</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3 p-3">
                    <Checkbox
                      id="isTransportista"
                      checked={formData.isTransportista}
                      onCheckedChange={(checked) => setFormData({ ...formData, isTransportista: !!checked })}
                    />
                    <label htmlFor="isTransportista" className="flex items-center gap-2 cursor-pointer flex-1">
                      <Truck className="h-4 w-4 text-violet-500" />
                      <span className="text-sm font-medium">Transportista</span>
                    </label>
                    {formData.isTransportista && (
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.5"
                          value={formData.transportistaCommissionRate}
                          onChange={(e) => setFormData({ ...formData, transportistaCommissionRate: Number(e.target.value) })}
                          className="h-8 w-20 text-sm text-center"
                        />
                        <span className="text-sm text-muted-foreground">%</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="Ej: juan@email.com"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="phone">Telefono</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="Ej: 11 1234-5678"
                  required
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="isActive">Empleado Activo</Label>
                <Switch
                  id="isActive"
                  checked={formData.isActive}
                  onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingSeller ? 'Guardar Cambios' : 'Crear Empleado'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Detail Modal with Commissions */}
      <Dialog open={detailModalOpen} onOpenChange={setDetailModalOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {selectedSeller && (
                <>
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-lg font-semibold text-primary">
                      {selectedSeller.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="font-semibold">{selectedSeller.name}</p>
                    <p className="text-sm font-normal text-muted-foreground">{selectedSeller.email}</p>
                  </div>
                </>
              )}
            </DialogTitle>
          </DialogHeader>

          {selectedSeller && (
            <div className="space-y-6 pt-2">
              {/* Employee Info Badges */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${EMPLOYEE_TYPE_BADGE[selectedSeller.employeeType]}`}>
                  {getEmployeeTypeIcon(selectedSeller.employeeType)}
                  {EMPLOYEE_TYPE_LABELS[selectedSeller.employeeType]}
                </span>
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${getStatusBadge(selectedSeller.isActive)}`}>
                  {selectedSeller.isActive ? 'Activo' : 'Inactivo'}
                </span>
                {(selectedSeller.employeeType === 'vendedor' || selectedSeller.employeeType === 'ambos') && (
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${getCommissionColor(selectedSeller.commissionRate)}`}>
                    <ShoppingCart className="h-3 w-3 mr-1" />
                    {selectedSeller.commissionRate}% vendedor
                  </span>
                )}
                {(selectedSeller.employeeType === 'transportista' || selectedSeller.employeeType === 'ambos') && (
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${getCommissionColor(selectedSeller.transportistaCommissionRate ?? 0)}`}>
                    <Truck className="h-3 w-3 mr-1" />
                    {selectedSeller.transportistaCommissionRate ?? 0}% transportista
                  </span>
                )}
                {selectedSeller.phone && (
                  <a
                    href={`tel:${selectedSeller.phone}`}
                    className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-muted hover:bg-muted/80 transition-colors"
                  >
                    <Phone className="h-3 w-3 mr-1" />
                    {selectedSeller.phone}
                  </a>
                )}
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="rounded-xl p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">Ventas Totales</p>
                  <p className="font-bold text-xl text-foreground">
                    {formatCurrency(allSalesTotal)}
                  </p>
                </div>
                <div className="rounded-xl p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">Comisiones Totales</p>
                  <p className="font-bold text-xl text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(allCommissionsTotal)}
                  </p>
                </div>
                <div className="rounded-xl p-4 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 col-span-2 sm:col-span-1">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">Pendientes de Pago</p>
                  <p className="font-bold text-xl text-rose-600 dark:text-rose-400">
                    {formatCurrency(pendingTotal)}
                  </p>
                  <p className="text-xs text-muted-foreground">{pendingCommissions.length} comisiones</p>
                </div>
              </div>

              {/* Pedidos activos del empleado */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold text-foreground flex items-center gap-2">
                    <Package className="h-4 w-4 text-primary" />
                    Pedidos Activos
                  </h4>
                  {!loadingOrders && (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                      {totalClientes} {totalClientes === 1 ? 'cliente' : 'clientes'}
                    </span>
                  )}
                </div>

                {loadingOrders ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="animate-pulse rounded-lg border p-4">
                        <div className="h-4 bg-muted rounded w-1/3 mb-2" />
                        <div className="h-3 bg-muted rounded w-1/2" />
                      </div>
                    ))}
                  </div>
                ) : activeOrders.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground border rounded-lg border-dashed">
                    <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No tiene pedidos activos</p>
                  </div>
                ) : (
                  <div className="space-y-4 max-h-[min(360px,45vh)] overflow-y-auto">
                    {orderDays.map((dayKey) => {
                      const day = ordersByDay[dayKey]
                      const clientNames = Object.keys(day.clients)
                      return (
                        <div key={dayKey}>
                          <div className="flex items-center gap-2 mb-2 sticky top-0 bg-background py-1">
                            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-sm font-medium text-foreground">{day.label}</span>
                            <span className="text-xs text-muted-foreground">
                              · {clientNames.length} {clientNames.length === 1 ? 'cliente' : 'clientes'}
                            </span>
                          </div>
                          <div className="space-y-2">
                            {clientNames.map((cliente) => {
                              const clientOrders = day.clients[cliente]
                              const groupKey = `${dayKey}-${cliente}`
                              const isExpanded = expandedOrderId === groupKey
                              const itemsCount = clientOrders.reduce((n, o) => n + o.items.reduce((m, it) => m + it.quantity, 0), 0)
                              const productsCount = clientOrders.reduce((n, o) => n + o.items.length, 0)
                              const firstStatus = statusConfig[clientOrders[0].status]
                              return (
                                <div key={groupKey} className="rounded-lg border bg-card overflow-hidden">
                                  <button
                                    type="button"
                                    onClick={() => setExpandedOrderId(isExpanded ? null : groupKey)}
                                    className="w-full text-left p-3 flex items-start justify-between gap-3 hover:bg-muted/40 transition-colors"
                                  >
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                                        {clientOrders.length > 1 ? (
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                                            {clientOrders.length} pedidos
                                          </span>
                                        ) : (
                                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${firstStatus.bgColor} ${firstStatus.color} ${firstStatus.borderColor} border`}>
                                            <span className={`h-1.5 w-1.5 rounded-full ${firstStatus.dotColor}`} />
                                            {firstStatus.label}
                                          </span>
                                        )}
                                        <span className="text-xs text-muted-foreground">
                                          {productsCount} {productsCount === 1 ? 'producto' : 'productos'} · {itemsCount} u.
                                        </span>
                                      </div>
                                      <p className="font-medium text-foreground truncate">{cliente}</p>
                                      <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                                        <MapPin className="h-3 w-3 shrink-0" />
                                        {clientOrders[0].address}
                                      </p>
                                    </div>
                                    <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                  </button>
                                  {isExpanded && (
                                    <div className="border-t bg-muted/20 divide-y divide-border/60">
                                      {clientOrders.map((order, oIdx) => {
                                        const cfg = statusConfig[order.status]
                                        return (
                                          <div key={order.id} className="p-3 space-y-1.5">
                                            {clientOrders.length > 1 && (
                                              <div className="flex items-center gap-2 text-xs">
                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium ${cfg.bgColor} ${cfg.color} ${cfg.borderColor} border`}>
                                                  <span className={`h-1.5 w-1.5 rounded-full ${cfg.dotColor}`} />
                                                  {cfg.label}
                                                </span>
                                                <span className="text-muted-foreground truncate">Pedido {oIdx + 1} · {order.address}</span>
                                              </div>
                                            )}
                                            {order.items.map((it, idx) => (
                                              <div key={`${order.id}-${idx}`} className="flex items-center justify-between text-sm">
                                                <span className="text-foreground truncate pr-2">
                                                  <span className="text-muted-foreground">{it.quantity}×</span> {it.name}
                                                </span>
                                                <span className="text-muted-foreground shrink-0">
                                                  {formatCurrency(it.price * it.quantity)}
                                                </span>
                                              </div>
                                            ))}
                                          </div>
                                        )
                                      })}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Historial de pagos realizados */}
              {pagos.length > 0 && (
                <div>
                  <h4 className="font-semibold text-foreground mb-3">Historial de Pagos</h4>
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {pagos.map((pago: any) => (
                      <div key={pago.id} className="rounded-lg border p-3 bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Banknote className="h-4 w-4 text-emerald-600" />
                            <span className="font-semibold text-foreground">{formatCurrency(pago.monto)}</span>
                          </div>
                          <span className="text-xs text-muted-foreground">{formatDate(pago.createdAt)}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {pago.cantidadComisiones} comisiones pagadas
                          {pago.nota && <> — {pago.nota}</>}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Commissions List */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold text-foreground">Comisiones Pendientes</h4>
                  {pendingCommissions.length > 0 && (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={handleResetCommissions}
                      disabled={resetting}
                      className="gap-2"
                    >
                      {resetting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Banknote className="h-4 w-4" />
                      )}
                      Pagar y Resetear ({formatCurrency(pendingTotal)})
                    </Button>
                  )}
                </div>

                {loadingCommissions ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="animate-pulse rounded-lg border p-4">
                        <div className="h-4 bg-muted rounded w-1/3 mb-2" />
                        <div className="h-3 bg-muted rounded w-1/2" />
                      </div>
                    ))}
                  </div>
                ) : commissions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground border rounded-lg border-dashed">
                    <DollarSign className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No hay comisiones registradas</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[min(300px,40vh)] overflow-y-auto">
                    {commissions.map((commission) => (
                      <div
                        key={commission.id}
                        className={`rounded-lg border p-4 flex items-center justify-between gap-4 ${
                          commission.isPaid
                            ? 'bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800'
                            : 'bg-amber-50/50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            {commission.isPaid ? (
                              <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                            ) : (
                              <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                            )}
                            <span className="font-semibold text-foreground">
                              {formatCurrency(commission.commissionAmount)}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              commission.isPaid
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                            }`}>
                              {commission.isPaid ? 'Pagada' : 'Pendiente'}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Venta: {formatCurrency(commission.saleTotal)} - {commission.commissionRate}% comision
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(commission.createdAt)}
                            {commission.isPaid && commission.paidAt && (
                              <> - Pagada el {formatDate(commission.paidAt)}</>
                            )}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  className="flex-1 bg-transparent"
                  onClick={() => {
                    setDetailModalOpen(false)
                    handleEdit(selectedSeller)
                  }}
                >
                  <Pencil className="h-4 w-4 mr-2" />
                  Editar
                </Button>
                <Button
                  variant="outline"
                  className="bg-transparent"
                  onClick={() => setDetailModalOpen(false)}
                >
                  <X className="h-4 w-4 mr-2" />
                  Cerrar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Eliminar Empleado"
        description={`¿Estas seguro de eliminar a "${sellerToDelete?.name}"? Esta accion no se puede deshacer.`}
        confirmText="Eliminar"
        onConfirm={confirmDelete}
        variant="destructive"
      />
    </MainLayout>
  )
}
