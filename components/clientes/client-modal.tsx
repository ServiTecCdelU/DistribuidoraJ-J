'use client'

import React from "react"

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Client } from '@/lib/types'
import { formatCurrency, formatCuit, normalizeCuit } from '@/lib/utils/format'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, User, FileText, Phone, Mail, MapPin, CreditCard, Building, StickyNote } from 'lucide-react'

interface ClientModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  client: Client | null
  onSave: (client: Omit<Client, 'id' | 'createdAt' | 'currentBalance'>) => Promise<void>
  showCreditLimit?: boolean
  showNotes?: boolean
  defaultValues?: Partial<{
    name: string; dni: string; cuit: string; email: string;
    phone: string; address: string; taxCategory: string; creditLimit: number; notes: string;
  }>
  sellers?: { id: string; name: string }[]
}

export function ClientModal({ open, onOpenChange, client, onSave, showCreditLimit = true, showNotes = true, defaultValues, sellers }: ClientModalProps) {
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formData, setFormData] = useState({
    name: '',
    dni: '',
    cuit: '',
    email: '',
    phone: '',
    address: '',
    taxCategory: 'consumidor_final' as const,
    creditLimit: 0,
    notes: '',
    codigoExterno: '',
    sellerId: '',
    diaCobro: '',
  })

  useEffect(() => {
    if (client) {
      setFormData({
        name: client.name || '',
        dni: client.dni || '',
        cuit: client.cuit || '',
        email: client.email || '',
        phone: client.phone || '',
        address: client.address || '',
        taxCategory: client.taxCategory || 'consumidor_final',
        creditLimit: typeof client.creditLimit === 'number' ? client.creditLimit : 50000,
        notes: client.notes || '',
        codigoExterno: client.codigoExterno || '',
        sellerId: client.sellerId || '',
        diaCobro: client.diaCobro || '',
      })
    } else {
      setFormData({
        name: defaultValues?.name || '',
        dni: defaultValues?.dni || '',
        cuit: defaultValues?.cuit || '',
        email: defaultValues?.email || '',
        phone: defaultValues?.phone || '',
        address: defaultValues?.address || '',
        taxCategory: (defaultValues?.taxCategory as typeof formData.taxCategory) || 'consumidor_final',
        creditLimit: defaultValues?.creditLimit ?? 50000,
        notes: defaultValues?.notes || '',
        codigoExterno: '',
        sellerId: '',
        diaCobro: '',
      })
    }
    setErrors({})
  }, [client, open])

  const validateForm = () => {
    const newErrors: Record<string, string> = {}
    const isEditing = !!client

    if (!formData.name.trim()) {
      newErrors.name = 'El nombre es requerido'
    }
    if (!formData.address.trim()) {
      newErrors.address = 'El domicilio es requerido'
    }
    if (formData.cuit.trim() && normalizeCuit(formData.cuit).length !== 11) {
      newErrors.cuit = 'El CUIT debe tener 11 digitos'
    }
    if (formData.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Email invalido'
    }
    if (formData.creditLimit < 0) {
      newErrors.creditLimit = 'El limite debe ser mayor o igual a 0'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) return
    
    setLoading(true)
    try {
      await onSave({
        ...formData,
        cuit: formatCuit(formData.cuit),
        sellerId: formData.sellerId || undefined,
        codigoExterno: formData.codigoExterno.trim() || undefined,
        diaCobro: formData.diaCobro || undefined,
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="h-4 w-4 text-primary" />
            </div>
            {client ? 'Editar Cliente' : 'Nuevo Cliente'}
          </DialogTitle>
          <DialogDescription>
            {client 
              ? 'Modifica los datos del cliente' 
              : 'Completa los datos para registrar un nuevo cliente'}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-5 pt-2">
          {/* Datos Principales */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Datos Principales
            </h3>
            
            <div className="space-y-2">
              <Label htmlFor="name" className="text-foreground">
                Nombre / Razon Social <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ej: Distribuidora Patricia S.A."
                className={errors.name ? 'border-destructive' : ''}
              />
              {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="dni" className="text-foreground">DNI</Label>
                <Input
                  id="dni"
                  value={formData.dni}
                  onChange={(e) => setFormData({ ...formData, dni: e.target.value })}
                  placeholder="12345678"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cuit" className="text-foreground">
                  CUIL / CUIT
                </Label>
                <Input
                  id="cuit"
                  value={formData.cuit}
                  onChange={(e) => setFormData({ ...formData, cuit: e.target.value })}
                  placeholder="20-12345678-9"
                  className={errors.cuit ? 'border-destructive' : ''}
                />
                {errors.cuit && <p className="text-xs text-destructive">{errors.cuit}</p>}
              </div>
            </div>

              <div className="grid gap-2">
                <Label htmlFor="codigoExterno" className="text-foreground">Código externo</Label>
                <Input
                  id="codigoExterno"
                  value={formData.codigoExterno}
                  onChange={(e) => setFormData({ ...formData, codigoExterno: e.target.value })}
                  placeholder="Ej: 106"
                />
              </div>
              {sellers && sellers.length > 0 && (
                <div className="grid gap-2">
                  <Label htmlFor="sellerId" className="text-foreground">Vendedor</Label>
                  <select
                    id="sellerId"
                    className="flex h-10 w-full rounded-2xl border border-input bg-background px-3 py-2 text-sm"
                    value={formData.sellerId}
                    onChange={(e) => setFormData({ ...formData, sellerId: e.target.value })}
                  >
                    <option value="">Sin asignar</option>
                    {sellers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="grid gap-2">
                <Label htmlFor="diaCobro" className="text-foreground">Día de visita/cobro</Label>
                <select
                  id="diaCobro"
                  className="flex h-10 w-full rounded-2xl border border-input bg-background px-3 py-2 text-sm"
                  value={formData.diaCobro}
                  onChange={(e) => setFormData({ ...formData, diaCobro: e.target.value })}
                >
                  <option value="">Sin asignar</option>
                  <option value="lunes">Lunes</option>
                  <option value="martes">Martes</option>
                  <option value="miercoles">Miércoles</option>
                  <option value="jueves">Jueves</option>
                  <option value="viernes">Viernes</option>
                  <option value="sabado">Sábado</option>
                  <option value="domingo">Domingo</option>
                </select>
              </div>
            <div className="space-y-2">
              <Label htmlFor="taxCategory" className="text-foreground flex items-center gap-2">
                <Building className="h-3.5 w-3.5" />
                Categoria Fiscal
              </Label>
              <select
                id="taxCategory"
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors"
                value={formData.taxCategory}
                onChange={(e) => setFormData({ ...formData, taxCategory: e.target.value as typeof formData.taxCategory })}
              >
                <option value="consumidor_final">Consumidor Final</option>
                <option value="monotributo">Monotributista</option>
                <option value="responsable_inscripto">Responsable Inscripto</option>
                <option value="exento">Exento</option>
                <option value="no_responsable">No Responsable</option>
              </select>
            </div>
          </div>

          {/* Datos de Contacto */}
          <div className="space-y-4 pt-2 border-t border-border">
            <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2 pt-2">
              <Phone className="h-4 w-4" />
              Datos de Contacto
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-foreground flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5" />
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="email@ejemplo.com"
                  className={errors.email ? 'border-destructive' : ''}
                />
                {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone" className="text-foreground flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5" />
                  Telefono
                </Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="011-4555-1234"
                  className={errors.phone ? 'border-destructive' : ''}
                />
                {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address" className="text-foreground flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5" />
                Direccion <span className="text-destructive">*</span>
              </Label>
              <Input
                id="address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="Av. Corrientes 1234, CABA"
                className={errors.address ? 'border-destructive' : ''}
              />
              {errors.address && <p className="text-xs text-destructive">{errors.address}</p>}
            </div>
          </div>

          {/* Datos de Crédito - solo admin */}
          {showCreditLimit && (
            <div className="space-y-4 pt-2 border-t border-border">
              <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2 pt-2">
                <CreditCard className="h-4 w-4" />
                Configuracion de Credito
              </h3>

              <div className="space-y-2">
                <Label htmlFor="creditLimit" className="text-foreground">
                  Limite de Credito
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                  <Input
                    id="creditLimit"
                    type="number"
                    min="0"
                    step="1000"
                    value={formData.creditLimit ?? 0}
                    onChange={(e) => setFormData({ ...formData, creditLimit: Number(e.target.value) || 0 })}
                    className={`pl-7 ${errors.creditLimit ? 'border-destructive' : ''}`}
                  />
                </div>
                {errors.creditLimit && <p className="text-xs text-destructive">{errors.creditLimit}</p>}
                <p className="text-xs text-muted-foreground">
                  Monto maximo que el cliente puede deber: {formatCurrency(formData.creditLimit)}
                </p>
              </div>

              {client && (
                <div className="rounded-lg bg-muted/50 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Saldo actual</span>
                    <span className={`font-semibold ${client.currentBalance > 0 ? 'text-destructive' : 'text-success'}`}>
                      {formatCurrency(client.currentBalance)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Observaciones Privadas - solo admin */}
          {showNotes && (
            <div className="space-y-4 pt-2 border-t border-border">
              <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2 pt-2">
                <StickyNote className="h-4 w-4" />
                Observaciones Privadas
              </h3>

              <div className="space-y-2">
                <Label htmlFor="notes" className="text-foreground">
                  Notas internas
                </Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Ej: Cliente puntual, prefiere entregas los martes..."
                  rows={3}
                  className="resize-none"
                />
                <p className="text-xs text-muted-foreground">
                  Solo visible para administradores
                </p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-4 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
              className="w-full sm:w-auto"
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading} className="w-full sm:w-auto">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {client ? 'Guardar Cambios' : 'Crear Cliente'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
