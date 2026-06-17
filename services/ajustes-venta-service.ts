// services/ajustes-venta-service.ts
// Ajustes posteriores a una venta ya emitida (solo admin):
//   1. Descuento: baja el saldo del cliente, registra una transacción [DESCUENTO]
//      imputada a la deuda de la venta y descuenta la comisión del vendedor.
//   2. Conversión de forma de pago: pasa una venta entre Cuenta Corriente y
//      efectivo/transferencia (y viceversa), impactando la cuenta corriente.
// No toca stock ni emite documentos AFIP. Reutiliza la lógica de imputación de pagos.
import { supabase } from '@/lib/supabase'
import { generateReadableId } from '@/services/supabase-helpers'
import { aplicarPagoADeudas } from '@/services/payments-service'
import { calcularComisionDescuento } from '@/lib/utils/ajuste-venta'

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100

async function getCommissionRate(sellerId?: string): Promise<number> {
  if (!sellerId) return 0
  const { data } = await supabase
    .from('vendedores')
    .select('commission_rate')
    .eq('id', sellerId)
    .single()
  return Number(data?.commission_rate) || 10
}

async function bajarComision(sellerId: string, monto: number, comision: number): Promise<void> {
  const { data: sr } = await supabase
    .from('vendedores')
    .select('total_sales, total_commission')
    .eq('id', sellerId)
    .single()
  if (!sr) return
  await supabase
    .from('vendedores')
    .update({
      total_sales: Math.max(0, (Number(sr.total_sales) || 0) - monto),
      total_commission: Math.max(0, (Number(sr.total_commission) || 0) - comision),
    })
    .eq('id', sellerId)
}

async function nextReciboNumero(): Promise<string> {
  const { data, error } = await supabase.rpc('next_recibo_number')
  return !error && data ? String(data) : `RC-${Date.now()}`
}

async function debtTxIdForSale(saleId?: string): Promise<string | undefined> {
  if (!saleId) return undefined
  const { data } = await supabase
    .from('transacciones')
    .select('id')
    .eq('sale_id', saleId)
    .eq('type', 'debt')
    .limit(1)
    .maybeSingle()
  return data?.id
}

async function bajarSaldoCliente(clientId: string, monto: number): Promise<void> {
  const { data: cr } = await supabase
    .from('clientes')
    .select('current_balance')
    .eq('id', clientId)
    .single()
  if (cr) {
    await supabase
      .from('clientes')
      .update({ current_balance: (Number(cr.current_balance) || 0) - monto })
      .eq('id', clientId)
  }
}

async function subirSaldoCliente(clientId: string, monto: number): Promise<void> {
  const { data: cr } = await supabase
    .from('clientes')
    .select('current_balance')
    .eq('id', clientId)
    .single()
  if (cr) {
    await supabase
      .from('clientes')
      .update({ current_balance: (Number(cr.current_balance) || 0) + monto })
      .eq('id', clientId)
  }
}

// Actualiza la forma de pago de la venta; reintenta sin payment_method si la columna no existe.
async function actualizarPagoVenta(saleId: string, fields: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.from('ventas').update(fields).eq('id', saleId)
  if (error && 'payment_method' in fields) {
    const { payment_method, ...rest } = fields
    await supabase.from('ventas').update(rest).eq('id', saleId)
  }
}

// ===================== DESCUENTO =====================

export interface DescuentoVenta {
  id: string
  reciboNumero: string
  saleId?: string
  saleNumber?: string
  clientId?: string
  monto: number
  motivo?: string
  description: string
  commissionAmount: number
  reciboPdfBase64?: string
  createdAt: Date
}

export async function registrarDescuentoVenta(data: {
  saleId?: string
  saleNumber?: string
  clientId?: string
  clientName?: string
  sellerId?: string
  sellerName?: string
  monto: number
  motivo?: string
}): Promise<DescuentoVenta> {
  const monto = round2(data.monto)
  if (!(monto > 0)) throw new Error('El descuento debe ser mayor a 0')

  const commissionRate = await getCommissionRate(data.sellerId)
  const commissionAmount = calcularComisionDescuento(monto, commissionRate)
  const reciboNumero = await nextReciboNumero()
  const id = await generateReadableId('transacciones', 'transaccion', data.clientName || 'descuento')
  const motivoTxt = data.motivo ? ` — ${data.motivo}` : ''
  const description = `[DESCUENTO] ${data.saleNumber ? `#${data.saleNumber}` : ''}${motivoTxt}`.trim()

  if (data.clientId) await bajarSaldoCliente(data.clientId, monto)

  await supabase.from('transacciones').insert({
    id,
    client_id: data.clientId ?? null,
    type: 'payment',
    amount: monto,
    description,
    date: new Date().toISOString(),
    cuenta: 'minorista',
    sale_id: data.saleId ?? null,
    recibo_numero: reciboNumero,
  })

  if (data.clientId) {
    const debtTxId = await debtTxIdForSale(data.saleId)
    await aplicarPagoADeudas(data.clientId, 'minorista', monto, debtTxId)
  }

  if (data.sellerId) await bajarComision(data.sellerId, monto, commissionAmount)

  return {
    id,
    reciboNumero,
    saleId: data.saleId,
    saleNumber: data.saleNumber,
    clientId: data.clientId,
    monto,
    motivo: data.motivo,
    description,
    commissionAmount,
    createdAt: new Date(),
  }
}

function mapDescuento(d: Record<string, any>): DescuentoVenta {
  return {
    id: d.id,
    reciboNumero: d.recibo_numero ?? '',
    saleId: d.sale_id ?? undefined,
    clientId: d.client_id ?? undefined,
    monto: Number(d.amount) || 0,
    description: d.description ?? '',
    commissionAmount: 0,
    reciboPdfBase64: d.recibo_pdf_base64 ?? undefined,
    createdAt: new Date(d.date ?? d.created_at),
  }
}

export async function getDescuentosBySale(saleId: string): Promise<DescuentoVenta[]> {
  if (!saleId) return []
  const { data } = await supabase
    .from('transacciones')
    .select('*')
    .eq('sale_id', saleId)
    .like('description', '[DESCUENTO]%')
    .order('date', { ascending: false })
  return (data ?? []).map(mapDescuento)
}

// ===================== CONVERSIÓN DE FORMA DE PAGO =====================

export type DireccionConversion = 'aPagado' | 'aCuentaCorriente'

export interface ConversionPago {
  txId?: string
  reciboNumero?: string
  monto: number
  direccion: DireccionConversion
  metodo?: 'efectivo' | 'transferencia'
  createdAt: Date
}

export async function convertirPagoVenta(data: {
  saleId: string
  saleNumber?: string
  clientId?: string
  clientName?: string
  monto: number
  direccion: DireccionConversion
  metodo?: 'efectivo' | 'transferencia'
}): Promise<ConversionPago> {
  const monto = round2(data.monto)
  if (!(monto > 0)) throw new Error('Monto inválido para la conversión')

  if (data.direccion === 'aPagado') {
    const metodo = data.metodo ?? 'efectivo'
    const reciboNumero = await nextReciboNumero()

    if (data.clientId) await bajarSaldoCliente(data.clientId, monto)

    const txId = await generateReadableId('transacciones', 'transaccion', data.clientName || 'pago')
    await supabase.from('transacciones').insert({
      id: txId,
      client_id: data.clientId ?? null,
      type: 'payment',
      amount: monto,
      description: `[PAGO VENTA] ${data.saleNumber ? `#${data.saleNumber} ` : ''}(${metodo})`.trim(),
      date: new Date().toISOString(),
      cuenta: 'minorista',
      sale_id: data.saleId,
      recibo_numero: reciboNumero,
    })

    if (data.clientId) {
      const debtTxId = await debtTxIdForSale(data.saleId)
      await aplicarPagoADeudas(data.clientId, 'minorista', monto, debtTxId)
    }

    await actualizarPagoVenta(data.saleId, {
      payment_type: 'cash',
      payment_method: metodo,
      cash_amount: null,
      credit_amount: null,
    })

    return { txId, reciboNumero, monto, direccion: 'aPagado', metodo, createdAt: new Date() }
  }

  // aCuentaCorriente: sube la deuda y genera la transacción de deuda imputable
  if (data.clientId) {
    await subirSaldoCliente(data.clientId, monto)
    const txId = await generateReadableId('transacciones', 'transaccion', data.clientName || 'deuda')
    await supabase.from('transacciones').insert({
      id: txId,
      client_id: data.clientId,
      type: 'debt',
      amount: monto,
      saldo: monto,
      description: `Venta ${data.saleNumber ? `#${data.saleNumber} ` : ''}pasada a cuenta corriente`.trim(),
      date: new Date().toISOString(),
      cuenta: 'minorista',
      sale_id: data.saleId,
    })
  }

  await actualizarPagoVenta(data.saleId, {
    payment_type: 'credit',
    credit_amount: monto,
    cash_amount: null,
  })

  return { monto, direccion: 'aCuentaCorriente', createdAt: new Date() }
}
