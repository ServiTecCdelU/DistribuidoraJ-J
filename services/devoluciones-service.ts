// services/devoluciones-service.ts
// Notas de crédito por devolución (internas, no AFIP).
// Cuando un cliente/vendedor devuelve mercadería desde una venta:
//   1. Stock: cada ítem marcado "stock" se repone (ajuste +); los "perdida" no vuelven.
//   2. Cta cte cliente: baja current_balance por el monto devuelto + transacción `payment`.
//   3. Comisión vendedor: baja el running total; la lista de comisiones la descuenta
//      derivando las devoluciones como entradas negativas (ver commissions-service).
//   4. Recibo: se genera un PDF "RECIBO DE DEVOLUCIÓN" y se guarda en recibo_pdf_base64.
import { supabase } from '@/lib/supabase'
import { generateReadableId } from '@/services/supabase-helpers'
import { registrarMovimiento } from '@/services/stock-service'
import { aplicarPagoADeudas } from '@/services/payments-service'

export interface DevolucionItem {
  productId: string
  name: string
  codigo?: string
  quantity: number
  price: number // precio unitario efectivamente cobrado (con dto. aplicado)
  destino: 'stock' | 'perdida'
}

export interface Devolucion {
  id: string
  reciboNumero: string
  saleId?: string
  saleNumber?: string
  clientId?: string
  clientName?: string
  sellerId?: string
  sellerName?: string
  items: DevolucionItem[]
  total: number
  commissionRate: number
  commissionAmount: number
  reciboPdfBase64?: string
  createdAt: Date
}

function mapDevolucion(d: Record<string, any>): Devolucion {
  return {
    id: d.id,
    reciboNumero: d.recibo_numero ?? '',
    saleId: d.sale_id ?? undefined,
    saleNumber: d.sale_number ?? undefined,
    clientId: d.client_id ?? undefined,
    clientName: d.client_name ?? undefined,
    sellerId: d.seller_id ?? undefined,
    sellerName: d.seller_name ?? undefined,
    items: (d.items ?? []) as DevolucionItem[],
    total: Number(d.total) || 0,
    commissionRate: Number(d.commission_rate) || 0,
    commissionAmount: Number(d.commission_amount) || 0,
    reciboPdfBase64: d.recibo_pdf_base64 ?? undefined,
    createdAt: new Date(d.created_at),
  }
}

export async function registrarDevolucion(data: {
  saleId?: string
  saleNumber?: string
  clientId?: string
  clientName?: string
  sellerId?: string
  sellerName?: string
  items: DevolucionItem[]
}): Promise<Devolucion> {
  const items = data.items.filter((i) => i.productId && i.quantity > 0)
  if (items.length === 0) throw new Error('No hay productos para devolver')

  const total = items.reduce((acc, i) => acc + i.price * i.quantity, 0)

  // Tasa de comisión del vendedor (para descontar lo que se le había generado)
  let commissionRate = 0
  if (data.sellerId) {
    const { data: seller } = await supabase
      .from('vendedores')
      .select('commission_rate')
      .eq('id', data.sellerId)
      .single()
    commissionRate = Number(seller?.commission_rate) || 10
  }
  const commissionAmount = total * (commissionRate / 100)

  // Número de recibo correlativo
  const { count } = await supabase
    .from('devoluciones')
    .select('id', { count: 'exact', head: true })
  const reciboNumero = `DEV-${String((count ?? 0) + 1).padStart(5, '0')}`

  const id = await generateReadableId('devoluciones', 'devolucion', data.clientName || 'cliente')

  const row: Record<string, any> = {
    id,
    recibo_numero: reciboNumero,
    sale_id: data.saleId ?? null,
    sale_number: data.saleNumber ?? null,
    client_id: data.clientId ?? null,
    client_name: data.clientName ?? null,
    seller_id: data.sellerId ?? null,
    seller_name: data.sellerName ?? null,
    items,
    total,
    commission_rate: commissionRate,
    commission_amount: commissionAmount,
  }
  const { error: insertErr } = await supabase.from('devoluciones').insert(row)
  if (insertErr) throw new Error(`Error al registrar devolución: ${insertErr.message}`)

  // 1. Stock: reponer solo los ítems que vuelven al depósito
  for (const it of items) {
    if (it.destino === 'stock') {
      await registrarMovimiento({
        productoId: it.productId,
        tipo: 'ajuste',
        cantidad: it.quantity,
        referencia: `Devolución ${reciboNumero}`,
      })
    }
  }

  // 2. Cuenta corriente del cliente: baja el saldo (devolución = crédito a favor)
  if (data.clientId && total > 0) {
    const { data: cr } = await supabase
      .from('clientes')
      .select('current_balance')
      .eq('id', data.clientId)
      .single()
    if (cr) {
      await supabase
        .from('clientes')
        .update({ current_balance: (Number(cr.current_balance) || 0) - total })
        .eq('id', data.clientId)
    }
    const detalle = items.map((i) => `${i.quantity}x ${i.name}`).join(', ')
    const txId = await generateReadableId('transacciones', 'transaccion', data.clientName || 'cliente')
    await supabase.from('transacciones').insert({
      id: txId,
      client_id: data.clientId,
      type: 'payment',
      amount: total,
      description: `[DEVOLUCION] ${data.saleNumber ? `#${data.saleNumber} — ` : ''}${detalle}`,
      date: new Date().toISOString(),
      cuenta: 'minorista',
      sale_id: data.saleId ?? null,
    })

    // Bajar el saldo del remito de esta venta (igual que un pago), para que
    // el detalle (Σ saldos) coincida con current_balance arriba y en el listado.
    // Imputa a la deuda de esta venta; si no la encuentra, FIFO.
    let debtTxId: string | undefined
    if (data.saleId) {
      const { data: deudaVenta } = await supabase
        .from('transacciones')
        .select('id')
        .eq('sale_id', data.saleId)
        .eq('type', 'debt')
        .limit(1)
        .maybeSingle()
      debtTxId = deudaVenta?.id
    }
    await aplicarPagoADeudas(data.clientId, 'minorista', total, debtTxId)
  }

  // 3. Comisión del vendedor: bajar running totals (la lista se deriva con devoluciones negativas)
  if (data.sellerId && (total > 0 || commissionAmount > 0)) {
    const { data: sr } = await supabase
      .from('vendedores')
      .select('total_sales, total_commission')
      .eq('id', data.sellerId)
      .single()
    if (sr) {
      await supabase
        .from('vendedores')
        .update({
          total_sales: Math.max(0, (Number(sr.total_sales) || 0) - total),
          total_commission: Math.max(0, (Number(sr.total_commission) || 0) - commissionAmount),
        })
        .eq('id', data.sellerId)
    }
  }

  return mapDevolucion(row)
}

export async function saveReciboToDevolucion(id: string, reciboPdfBase64: string): Promise<void> {
  await supabase.from('devoluciones').update({ recibo_pdf_base64: reciboPdfBase64 }).eq('id', id)
}

export async function getDevolucionesBySale(saleId: string): Promise<Devolucion[]> {
  if (!saleId) return []
  const { data } = await supabase
    .from('devoluciones')
    .select('*')
    .eq('sale_id', saleId)
    .order('created_at', { ascending: false })
  return (data ?? []).map(mapDevolucion)
}

export async function getDevolucionesByClient(clientId: string): Promise<Devolucion[]> {
  if (!clientId) return []
  const { data } = await supabase
    .from('devoluciones')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
  return (data ?? []).map(mapDevolucion)
}

export async function getDevolucionesBySeller(sellerId: string): Promise<Devolucion[]> {
  if (!sellerId) return []
  const { data } = await supabase
    .from('devoluciones')
    .select('*')
    .eq('seller_id', sellerId)
    .order('created_at', { ascending: false })
  return (data ?? []).map(mapDevolucion)
}
