import { supabase } from '@/lib/supabase'
import type { Order, OrderStatus, CartItem, City } from '@/lib/types'
import { generateReadableId } from '@/services/supabase-helpers'

function mapOrder(d: Record<string, any>): Order {
  return {
    id: d.id,
    saleId: d.sale_id ?? undefined,
    clientId: d.client_id ?? undefined,
    clientName: d.client_name ?? undefined,
    clientPhone: d.client_phone ?? undefined,
    clientEmail: d.client_email ?? undefined,
    sellerId: d.seller_id ?? undefined,
    sellerName: d.seller_name ?? undefined,
    transportistaId: d.transportista_id ?? undefined,
    transportistaName: d.transportista_name ?? undefined,
    items: d.items ?? [],
    status: d.status ?? 'pending',
    city: d.city ?? undefined,
    address: d.address ?? 'Retiro en local',
    lat: d.lat ? Number(d.lat) : undefined,
    lng: d.lng ? Number(d.lng) : undefined,
    deliveryMethod: d.delivery_method ?? undefined,
    remitoNumber: d.remito_number ?? undefined,
    remitoPdfBase64: d.remito_pdf_base64 ?? undefined,
    invoiceNumber: d.invoice_number ?? undefined,
    invoicePdfBase64: d.invoice_pdf_base64 ?? undefined,
    checkedItems: d.checked_items ?? [],
    held: d.held ?? false,
    notes: d.notes ?? undefined,
    createdAt: new Date(d.created_at),
    updatedAt: new Date(d.updated_at ?? d.created_at),
  }
}

export const getOrders = async (): Promise<Order[]> => {
  const { data } = await supabase
    .from('pedidos')
    .select('*')
    .order('created_at', { ascending: false })

  return (data ?? []).map(mapOrder)
}

export const getOrdersByTransportista = async (transportistaId: string): Promise<Order[]> => {
  const { data } = await supabase
    .from('pedidos')
    .select('*')
    .eq('transportista_id', transportistaId)
    .order('created_at', { ascending: false })

  return (data ?? []).map(mapOrder)
}

export const getOrdersBySeller = async (sellerId: string): Promise<Order[]> => {
  const { data } = await supabase
    .from('pedidos')
    .select('*')
    .eq('seller_id', sellerId)
    .order('created_at', { ascending: false })

  return (data ?? []).map(mapOrder)
}

export const updateOrderStatus = async (id: string, status: OrderStatus): Promise<Order> => {
  const { data } = await supabase
    .from('pedidos')
    .update({ status })
    .eq('id', id)
    .select()
    .single()

  if (!data) throw new Error('Order not found')
  return mapOrder(data)
}

export const completeOrder = async (id: string, saleId: string): Promise<Order> => {
  const { data } = await supabase
    .from('pedidos')
    .update({ status: 'completed', sale_id: saleId })
    .eq('id', id)
    .select()
    .single()

  if (!data) throw new Error('Order not found')
  return mapOrder(data)
}

// Rechaza un pedido: el cliente no lo quiso. No descuenta stock, no genera venta,
// no suma a caja ni a comisiones. Solo cambia el estado a 'rechazado' para que el
// vendedor lo vea como rechazado en Mis Pedidos.
export const rejectOrder = async (id: string): Promise<Order> => {
  const { data } = await supabase
    .from('pedidos')
    .update({ status: 'rechazado', held: false })
    .eq('id', id)
    .select()
    .single()

  if (!data) throw new Error('Order not found')
  return mapOrder(data)
}

export const assignTransportista = async (id: string, transportistaId: string, transportistaName: string): Promise<Order> => {
  const { data } = await supabase
    .from('pedidos')
    .update({
      transportista_id: transportistaId,
      transportista_name: transportistaName,
      status: 'delivery',
    })
    .eq('id', id)
    .select()
    .single()

  if (!data) throw new Error('Order not found')
  return mapOrder(data)
}

export const removeTransportista = async (id: string): Promise<Order> => {
  const { data } = await supabase
    .from('pedidos')
    .update({
      transportista_id: null,
      transportista_name: null,
    })
    .eq('id', id)
    .select()
    .single()

  if (!data) throw new Error('Order not found')
  return mapOrder(data)
}

export const deleteOrder = async (id: string): Promise<void> => {
  const { error } = await supabase.from('pedidos').delete().eq('id', id)
  if (error) throw error
}

// Borra el remito de un pedido (numero + PDF) para poder regenerarlo
export const deleteRemitoFromOrder = async (id: string): Promise<Order> => {
  const { data } = await supabase
    .from('pedidos')
    .update({ remito_number: null, remito_pdf_base64: null })
    .eq('id', id)
    .select()
    .single()

  if (!data) throw new Error('Order not found')
  return mapOrder(data)
}

// Marca/desmarca como retenidos todos los pedidos activos de un cliente (persistente en BD)
export const setClientOrdersHeld = async (clientName: string, held: boolean): Promise<void> => {
  const { error } = await supabase
    .from('pedidos')
    .update({ held })
    .eq('client_name', clientName)
    .neq('status', 'completed')
  if (error) throw error
}

export const saveRemitoToOrder = async (id: string, remitoNumber: string, remitoPdfBase64: string): Promise<Order> => {
  const { data } = await supabase
    .from('pedidos')
    .update({ remito_number: remitoNumber, remito_pdf_base64: remitoPdfBase64 })
    .eq('id', id)
    .select()
    .single()

  if (!data) throw new Error('Order not found')
  return mapOrder(data)
}

export const saveBoletaToOrder = async (
  id: string,
  invoiceNumber: string,
  invoicePdfBase64: string,
  extra?: { invoiceEmitted?: boolean; afipData?: any; invoiceStatus?: string },
): Promise<Order> => {
  const updates: Record<string, any> = {
    invoice_number: invoiceNumber,
    invoice_pdf_base64: invoicePdfBase64,
  }
  // Extra fields stored in pedidos if schema supports them
  const { data } = await supabase
    .from('pedidos')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (!data) throw new Error('Order not found')
  return mapOrder(data)
}

export const updateCheckedItems = async (id: string, checkedItems: string[]): Promise<void> => {
  await supabase
    .from('pedidos')
    .update({ checked_items: checkedItems })
    .eq('id', id)
}

export const createOrder = async (data: {
  clientId?: string
  clientName: string
  clientPhone?: string
  clientEmail?: string
  sellerId?: string
  sellerName?: string
  items: CartItem[]
  city?: City
  address: string
  lat?: number
  lng?: number
  status: OrderStatus
  source?: string
  discount?: number
  discountType?: 'percent' | 'fixed'
  notes?: string
}): Promise<Order> => {
  const docId = await generateReadableId('pedidos', 'pedido', data.clientName)

  await supabase.from('pedidos').insert({
    id: docId,
    client_id: data.clientId ?? null,
    client_name: data.clientName,
    seller_id: data.sellerId ?? null,
    seller_name: data.sellerName ?? null,
    transportista_id: null,
    transportista_name: null,
    items: data.items.map((item) => ({
      productId: item.product.id,
      name: item.product.name,
      quantity: item.quantity,
      price: item.product.price,
      itemDiscount: item.itemDiscount ?? null,
      unidadesPorBulto: item.product.unidadesPorBulto ?? null,
      seDivideEn: item.product.seDivideEn ?? null,
      precioUnitarioMayorista: (item.product as any).precioUnitarioMayorista ?? null,
      ...(item.product.codigo ? { codigo: item.product.codigo } : {}),
    })),
    address: data.address,
    lat: data.lat ?? null,
    lng: data.lng ?? null,
    status: data.status ?? 'pending',
    source: data.source ?? 'direct',
    notes: data.notes?.trim() || null,
    sale_id: null,
  })

  // Guardar la direccion en la libreta del cliente (por ciudad) si no existe
  if (data.clientId && data.address && data.city) {
    try {
      const { data: clientRow } = await supabase
        .from('clientes')
        .select('address, addresses')
        .eq('id', data.clientId)
        .single()

      if (clientRow) {
        const existing: Array<{ city: string; address: string; lat?: number; lng?: number }> =
          Array.isArray(clientRow.addresses)
            ? clientRow.addresses.filter((a: any) => a && typeof a.address === 'string')
            : []
        const normalized = data.address.trim().toLowerCase()
        const cityKey = data.city.trim()
        const alreadySaved =
          existing.some((a) => a.address.trim().toLowerCase() === normalized && a.city === cityKey) ||
          (clientRow.address && clientRow.address.trim().toLowerCase() === normalized)
        if (!alreadySaved) {
          const newEntry: Record<string, any> = { city: cityKey, address: data.address.trim() }
          if (data.lat != null) newEntry.lat = data.lat
          if (data.lng != null) newEntry.lng = data.lng
          const updates: Record<string, any> = { addresses: [...existing, newEntry] }
          if (!clientRow.address) updates.address = data.address.trim()
          await supabase.from('clientes').update(updates).eq('id', data.clientId)
        }
      }
    } catch {
      // no bloquear la creacion del pedido si falla guardar la direccion
    }
  }

  const { data: created } = await supabase
    .from('pedidos')
    .select('*')
    .eq('id', docId)
    .single()

  if (!created) throw new Error('Failed to create order')
  return mapOrder(created)
}

export const getOrdersPaginated = async (
  pageSize: number = 50,
  lastDoc?: any,
): Promise<{ data: Order[]; lastDoc: any; hasMore: boolean }> => {
  const offset = lastDoc ?? 0
  const { data } = await supabase
    .from('pedidos')
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1)

  const orders = (data ?? []).map(mapOrder)
  return {
    data: orders,
    lastDoc: orders.length === pageSize ? offset + pageSize : null,
    hasMore: orders.length === pageSize,
  }
}
