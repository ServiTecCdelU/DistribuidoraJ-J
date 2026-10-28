// services/sales-service.ts
import { supabase } from '@/lib/supabase'
import { paginarTodo } from '@/lib/utils/paginar'
import type { CartItem, Sale } from '@/lib/types'
import { generateReadableId, slugify, moverSaldoCliente, moverTotalesVendedor } from '@/services/supabase-helpers'
import { formatCurrencyDecimals } from '@/lib/utils/format'
import { tasaComision } from '@/lib/utils/comisiones'


// Cache: ¿existe la columna payment_method en ventas?
let _paymentMethodColumnExists: boolean | null = null
async function ensurePaymentMethodColumn(): Promise<boolean> {
  if (_paymentMethodColumnExists === true) return true
  // Intentar leer una venta con payment_method — si funciona, la columna existe
  const { error } = await supabase.from('ventas').select('payment_method').limit(1)
  if (!error) {
    _paymentMethodColumnExists = true
    return true
  }
  _paymentMethodColumnExists = false
  return false
}

// Movimiento de cuenta corriente de una venta (deuda o saldo a favor) + saldo del cliente.
// Primero el movimiento y después el saldo, verificando cada paso: si algo falla el cobro
// corta con error. Antes el saldo se tocaba primero y el insert podía fallar en silencio,
// dejando el saldo del cliente distinto a sus movimientos.
async function registrarMovimientoVenta(params: {
  clientId: string
  clientName: string
  type: 'debt' | 'payment'
  amount: number
  description: string
  saleId: string
}): Promise<void> {
  const txId = await generateReadableId('transacciones', 'transaccion', params.clientName)
  const { error: txErr } = await supabase.from('transacciones').insert({
    id: txId,
    client_id: params.clientId,
    type: params.type,
    amount: params.amount,
    description: params.description,
    date: new Date().toISOString(),
    sale_id: params.saleId,
  })
  if (txErr) throw new Error(`Error al registrar el movimiento del cliente: ${txErr.message}`)

  const delta = params.type === 'debt' ? params.amount : -params.amount
  try {
    await moverSaldoCliente(params.clientId, delta, 'minorista')
  } catch (balErr: any) {
    throw new Error(`Error al actualizar el saldo del cliente: ${balErr.message}`)
  }

  // Si el cliente tenía saldo a favor, se imputa a la deuda nueva (boletas al día).
  const { recomputarSaldosDeudas } = await import('@/services/payments-service')
  await recomputarSaldosDeudas(params.clientId, 'minorista').catch(() => {})
}

function mapSale(d: Record<string, any>): Sale {
  return {
    id: d.id,
    saleNumber: d.sale_number ?? undefined,
    clientId: d.client_id ?? undefined,
    clientName: d.client_name ?? undefined,
    clientPhone: d.client_phone ?? undefined,
    clientCuit: d.client_cuit ?? undefined,
    clientDni: d.client_dni ?? undefined,
    clientEmail: d.client_email ?? undefined,
    clientAddress: d.client_address ?? undefined,
    clientTaxCategory: d.client_tax_category ?? undefined,
    sellerId: d.seller_id ?? undefined,
    sellerName: d.seller_name ?? undefined,
    source: d.source ?? 'direct',
    items: d.items ?? [],
    total: Number(d.total) || 0,
    paymentType: d.payment_type ?? 'cash',
    paymentMethod: d.payment_method ?? 'efectivo',
    cashAmount: d.cash_amount ? Number(d.cash_amount) : undefined,
    creditAmount: d.credit_amount ? Number(d.credit_amount) : undefined,
    // Cero es un monto válido: solo se descarta el campo ausente o nulo.
    efectivoAmount: d.efectivo_amount != null ? Number(d.efectivo_amount) : undefined,
    transferenciaAmount: d.transferencia_amount != null ? Number(d.transferencia_amount) : undefined,
    comprobanteTransferencia: d.comprobante_transferencia ?? undefined,
    status: d.status ?? 'completed',
    invoiceEmitted: d.invoice_emitted ?? false,
    invoiceNumber: d.invoice_number ?? undefined,
    invoiceStatus: d.invoice_status ?? undefined,
    invoicePdfUrl: d.invoice_pdf_url ?? undefined,
    invoiceWhatsappUrl: d.invoice_whatsapp_url ?? undefined,
    remitoPdfUrl: d.remito_pdf_url ?? undefined,
    remitoPdfBase64: d.remito_pdf_base64 ?? undefined,
    remitoNumber: d.remito_number ?? undefined,
    hojaRutaNumber: d.hoja_ruta_number ?? undefined,
    discount: d.discount ? Number(d.discount) : undefined,
    discountType: d.discount_type ?? undefined,
    orderId: d.order_id ?? undefined,
    deliveryMethod: d.delivery_method ?? 'pickup',
    deliveryAddress: d.delivery_address ?? undefined,
    createdAt: new Date(d.created_at),
    invoiceDriveUrl: d.invoice_drive_url ?? undefined,
    invoiceDriveFileId: d.invoice_drive_file_id ?? undefined,
    remitoDriveUrl: d.remito_drive_url ?? undefined,
    remitoDriveFileId: d.remito_drive_file_id ?? undefined,
    itemsNoEntregados: d.items_no_entregados ?? [],
  }
}

export const getSales = async (): Promise<Sale[]> => {
  // Paginado: sin esto devolvía 1000 ventas de 1685 y las páginas de Clientes y Reportes
  // calculaban sobre datos incompletos sin ningún aviso.
  const data = await paginarTodo<Record<string, any>>((desde, hasta) =>
    supabase
      .from('ventas')
      .select('*')
      .order('created_at', { ascending: false })
      .order('id', { ascending: true }) // desempate: sin orden único la paginación repite filas
      .range(desde, hasta),
  )

  return data.map(mapSale)
}

export const getSalesBySeller = async (sellerId: string): Promise<Sale[]> => {
  const { data } = await supabase
    .from('ventas')
    .select('*')
    .eq('seller_id', sellerId)
    .order('created_at', { ascending: false })

  return (data ?? []).map(mapSale)
}

export const getSalesByClient = async (clientId: string): Promise<Sale[]> => {
  const { data } = await supabase
    .from('ventas')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })

  return (data ?? []).map(mapSale)
}

export const getSaleById = async (id: string): Promise<Sale | null> => {
  const { data } = await supabase
    .from('ventas')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  return data ? mapSale(data) : null
}

export const generateSaleNumber = (date: Date, index: number) => {
  const d = new Date(date)
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  return `N${index + 1}-${day}-${month}-${year}`
}

// Reserva el próximo N° de venta (secuencia en Postgres, `next_venta_number`) y devuelve
// el anterior, como espera generateSaleNumber. Antes se leía el último + 1 en el navegador
// y dos ventas simultáneas (vendedores en campo) salían con el mismo número.
async function ultimoNumeroVenta(): Promise<number> {
  const { data, error } = await supabase.rpc('next_venta_number')
  if (error || data == null) throw new Error(`No se pudo generar el número de venta: ${error?.message ?? 'sin número'}`)
  return Number(data) - 1
}

export const processSale = async (data: {
  clientId?: string
  clientName?: string
  clientPhone?: string
  sellerId?: string
  sellerName?: string
  items: CartItem[]
  paymentType: 'cash' | 'credit' | 'mixed'
  paymentMethod?: 'efectivo' | 'transferencia'
  cashAmount?: number
  creditAmount?: number
  overpayment?: number
  discount?: number
  discountType?: 'percent' | 'fixed'
  source: 'direct' | 'order'
  createOrder: boolean
  orderId?: string
  deliveryMethod: 'pickup' | 'delivery'
  deliveryAddress: string
  // Si el stock ya se descontó antes (ej: al generar el remito del pedido), no volver a descontarlo acá.
  skipStock?: boolean
  // N° del remito del pedido: va en el mismo insert para que la venta nunca quede sin remito
  // (Ventas y Caja solo muestran ventas con remito). El PDF se copia después, tal cual.
  remitoNumber?: string
}): Promise<Sale> => {
  const subtotal = data.items.reduce((acc, item) => {
    const base = item.product.price * item.quantity
    const disc = item.itemDiscount ? (base * item.itemDiscount) / 100 : 0
    return acc + base - disc
  }, 0)
  const discountAmount =
    data.discount && data.discount > 0
      ? data.discountType === 'percent'
        ? (subtotal * data.discount) / 100
        : data.discount
      : 0
  const total = Math.max(0, subtotal - discountAmount)

  // 1 pedido = 1 venta. Si un cobro anterior de este pedido se cortó a mitad de camino
  // (la venta quedó grabada pero el pedido no llegó a completarse), se retoma esa venta
  // en vez de crear otra: un reintento no duplica la venta ni la deuda del cliente.
  let ventaPrevia: { id: string; sale_number: string } | null = null
  if (data.orderId) {
    const { data: previa, error: previaErr } = await supabase
      .from('ventas')
      .select('id, sale_number')
      .eq('order_id', data.orderId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (previaErr) throw new Error(`Error al verificar el pedido: ${previaErr.message}`)
    ventaPrevia = previa
  }

  let saleNumber = ventaPrevia?.sale_number ?? ''
  if (!ventaPrevia) saleNumber = generateSaleNumber(new Date(), await ultimoNumeroVenta())

  let resolvedClientName = data.clientName ?? 'Venta directa'
  let resolvedTaxCategory: any
  let resolvedClientPhone = data.clientPhone ?? null
  let resolvedClientCuit: string | null = null
  let resolvedClientAddress: string | null = null
  let resolvedClientEmail: string | null = null
  let resolvedClientDni: string | null = null
  let clientAddress = data.deliveryAddress

  if (data.clientId) {
    const { data: clientData } = await supabase
      .from('clientes')
      .select('*')
      .eq('id', data.clientId)
      .single()
    if (clientData) {
      resolvedClientName = clientData.name ?? resolvedClientName
      resolvedTaxCategory = clientData.tax_category ?? null
      resolvedClientPhone = clientData.phone ?? resolvedClientPhone ?? null
      resolvedClientCuit = clientData.cuit ?? null
      resolvedClientAddress = clientData.address ?? null
      resolvedClientEmail = clientData.email ?? null
      resolvedClientDni = clientData.dni ?? null
      if (data.deliveryMethod === 'delivery' && !data.deliveryAddress) {
        clientAddress = clientData.address ?? data.deliveryAddress
      }
    }
  }

  const saleId = ventaPrevia?.id ?? await generateReadableId('ventas', 'venta', resolvedClientName)

  // Heredar el N° de hoja de ruta del pedido de origen (si la venta viene de un pedido).
  let hojaRutaNumber: string | null = null
  if (data.orderId) {
    const { data: pedidoHr } = await supabase
      .from('pedidos')
      .select('hoja_ruta_number')
      .eq('id', data.orderId)
      .maybeSingle()
    hojaRutaNumber = pedidoHr?.hoja_ruta_number ?? null
  }

  const regalosCruzados = data.items
    .filter((it) => (it.regaloOtroCantidad ?? 0) > 0 && it.product.regaloProductoId)
    .map((it) => ({ productoId: it.product.regaloProductoId as string, nombre: it.product.regaloProductoNombre ?? 'Regalo', cantidad: it.regaloOtroCantidad as number }))
  const saleItems: Record<string, any>[] = data.items.map((item) => {
    const regalo = item.regalo ?? 0
    return {
      productId: item.product.id ?? null,
      quantity: item.quantity,
      price: item.product.price ?? null,
      name: item.product.name ?? null,
      ...(item.product.codigo ? { codigo: item.product.codigo } : {}),
      ...(item.itemDiscount ? { itemDiscount: item.itemDiscount } : {}),
      ...(regalo > 0 ? { regalo } : {}),
    }
  })
  // Items de regalo de OTRO producto (gratis, no se cobran)
  for (const r of regalosCruzados) {
    saleItems.push({ productId: r.productoId, quantity: r.cantidad, price: 0, name: r.nombre, esRegalo: true })
  }

  const saleRow2: Record<string, any> = {
    id: saleId,
    sale_number: saleNumber,
    client_id: data.clientId ?? null,
    client_name: resolvedClientName ?? null,
    client_phone: resolvedClientPhone ?? null,
    seller_id: data.sellerId ?? null,
    seller_name: data.sellerName ?? null,
    source: data.source ?? 'direct',
    items: saleItems,
    subtotal,
    total,
    payment_type: data.paymentType,
    payment_method: data.paymentMethod ?? 'efectivo',
    cash_amount: data.cashAmount ?? null,
    credit_amount: data.creditAmount ?? null,
    status: 'completed',
    invoice_emitted: false,
    delivery_method: data.deliveryMethod ?? 'pickup',
    delivery_address: clientAddress ?? null,
    order_id: data.orderId ?? null,
    hoja_ruta_number: hojaRutaNumber,
    ...(data.remitoNumber ? { remito_number: data.remitoNumber } : {}),
    // El total ya viene con el descuento aplicado; se guarda para mostrarlo en el detalle.
    discount: data.discount && data.discount > 0 ? data.discount : null,
    discount_type: data.discount && data.discount > 0 ? (data.discountType ?? null) : null,
  }
  const hasPayCol = await ensurePaymentMethodColumn()
  if (!hasPayCol) delete saleRow2.payment_method
  // Al retomar, la venta se actualiza con los datos de este cobro (pudo cambiar el pago).
  const { error: insertErr } = ventaPrevia
    ? await supabase.from('ventas').update(saleRow2).eq('id', saleId)
    : await supabase.from('ventas').insert(saleRow2)
  if (insertErr) throw new Error(`Error al crear venta: ${insertErr.message}`)

  // Descontar stock con registrarMovimiento (RPC mover_stock: atómico, con lock de fila).
  // Si skipStock, el stock ya se descontó al generar el remito del pedido: no tocar acá.
  // Cada línea lleva una clave única: al retomar un cobro cortado a mitad se descuentan
  // solo las líneas que faltaban (antes, con un movimiento ya hecho se salteaban todas).
  const { registrarMovimiento } = await import('@/services/stock-service')
  // Venta retomada de antes de las claves: si ya tiene movimientos sin clave, no repetir.
  let stockYaMovido = false
  if (ventaPrevia && !data.skipStock) {
    const { count: movs } = await supabase
      .from('stock_movimientos')
      .select('id', { count: 'exact', head: true })
      .eq('motivo', saleId)
      .is('clave', null)
    stockYaMovido = (movs ?? 0) > 0
  }
  if (!data.skipStock && !stockYaMovido) {
    // Venta (lo pagado) y regalo del mismo producto (promo "cada X +N").
    for (const [i, item] of data.items.entries()) {
      if (!item.product.id) continue
      const regaloMismo = item.regalo ?? 0
      await registrarMovimiento({
        productoId: item.product.id, tipo: 'venta', cantidad: -item.quantity, referencia: saleId,
        clave: `venta:${saleId}:${i}:${item.product.id}`,
      })
      if (regaloMismo > 0) {
        await registrarMovimiento({
          productoId: item.product.id, tipo: 'regalo', cantidad: -regaloMismo, referencia: saleId,
          clave: `regalo:${saleId}:${i}:${item.product.id}`,
        })
      }
    }

    // Regalos de OTRO producto (promo cruzada) — tipo regalo.
    for (const [i, r] of regalosCruzados.entries()) {
      await registrarMovimiento({
        productoId: r.productoId, tipo: 'regalo', cantidad: -r.cantidad, referencia: saleId,
        clave: `regalo-cruzado:${saleId}:${i}:${r.productoId}`,
      })
    }
  }

  // Procesar credito
  const amountToCredit =
    data.paymentType === 'credit'
      ? total
      : data.paymentType === 'mixed'
        ? (data.creditAmount ?? 0)
        : 0

  // Si el intento anterior ya registró la deuda de esta venta, no se vuelve a sumar.
  let deudaYaRegistrada = false
  if (ventaPrevia) {
    const { data: deudaPrevia } = await supabase
      .from('transacciones')
      .select('id, amount')
      .eq('sale_id', saleId)
      .eq('type', 'debt')
      .limit(1)
      .maybeSingle()
    // Si la deuda registrada no coincide con este cobro (ej. antes fue a cuenta corriente y
    // ahora se paga en efectivo), no se puede retomar sin dejar el saldo mal: frenar.
    if (deudaPrevia && Math.abs(Number(deudaPrevia.amount) - amountToCredit) > 0.01) {
      throw new Error(`Este pedido ya tiene la venta #${saleNumber} con ${formatCurrencyDecimals(Number(deudaPrevia.amount))} a cuenta corriente. Revisá la cuenta corriente del cliente antes de cobrarlo distinto.`)
    }
    deudaYaRegistrada = !!deudaPrevia
  }

  if (amountToCredit > 0 && data.clientId && !deudaYaRegistrada) {
    await registrarMovimientoVenta({
      clientId: data.clientId,
      clientName: resolvedClientName,
      type: 'debt',
      amount: amountToCredit,
      description: `Venta #${saleNumber}`,
      saleId,
    })
  }

  // Saldo a favor
  const overpaymentAmount = data.overpayment ?? 0
  if (overpaymentAmount > 0 && data.clientId) {
    await registrarMovimientoVenta({
      clientId: data.clientId,
      clientName: resolvedClientName,
      type: 'payment',
      amount: overpaymentAmount,
      description: `Saldo a favor (Venta #${saleNumber})`,
      saleId,
    })
  }

  // Actualizar totales del vendedor (comisiones se derivan de ventas). La clave por venta
  // hace que al retomar un cobro cortado se sume si faltaba y nunca dos veces.
  if (data.sellerId) {
    const { data: sellerRow } = await supabase
      .from('vendedores')
      .select('commission_rate')
      .eq('id', data.sellerId)
      .single()
    if (sellerRow) {
      const rate = tasaComision(sellerRow.commission_rate) / 100
      await moverTotalesVendedor(data.sellerId, total, total * rate, `vendedor-venta:${saleId}`)
    }
  }

  return {
    id: saleId,
    saleNumber,
    clientId: data.clientId,
    clientName: resolvedClientName,
    clientPhone: resolvedClientPhone ?? undefined,
    clientCuit: resolvedClientCuit ?? undefined,
    clientDni: resolvedClientDni ?? undefined,
    clientEmail: resolvedClientEmail ?? undefined,
    clientAddress: resolvedClientAddress ?? undefined,
    clientTaxCategory: resolvedTaxCategory,
    sellerId: data.sellerId,
    sellerName: data.sellerName,
    source: data.source,
    items: saleItems as Sale['items'],
    total,
    paymentType: data.paymentType,
    paymentMethod: data.paymentMethod ?? 'efectivo',
    cashAmount: data.cashAmount,
    creditAmount: data.creditAmount,
    discount: data.discount,
    discountType: data.discountType,
    orderId: data.orderId,
    status: 'completed',
    invoiceEmitted: false,
    invoiceStatus: 'pending',
    deliveryMethod: data.deliveryMethod,
    deliveryAddress: clientAddress,
    createdAt: new Date(),
  }
}

export const saveBoletaToSale = async (
  saleId: string,
  invoiceNumber: string,
  invoicePdfBase64: string,
  extra?: { afipData?: any },
): Promise<void> => {
  await supabase.from('ventas').update({
    invoice_number: invoiceNumber,
    invoice_pdf_base64: invoicePdfBase64,
    invoice_emitted: true,
    invoice_status: 'emitted',
    ...(extra?.afipData ? { afip_data: extra.afipData } : {}),
  }).eq('id', saleId)
}

export const saveRemitoToSale = async (
  saleId: string,
  remitoNumber: string,
  remitoPdfBase64: string,
): Promise<void> => {
  const { error } = await supabase.from('ventas').update({
    remito_number: remitoNumber,
    remito_pdf_base64: remitoPdfBase64,
  }).eq('id', saleId)
  if (error) throw new Error(`No se pudo copiar el remito a la venta: ${error.message}`)
}

export const updateSaleInvoice = async (
  saleId: string,
  invoiceData: {
    invoiceNumber: string
    invoicePdfUrl: string
    invoiceWhatsappUrl?: string
    afipData?: any
  },
) => {
  await supabase.from('ventas').update({
    invoice_emitted: true,
    invoice_number: invoiceData.invoiceNumber,
    invoice_pdf_url: invoiceData.invoicePdfUrl,
    invoice_whatsapp_url: invoiceData.invoiceWhatsappUrl || null,
    invoice_status: 'emitted',
    afip_data: invoiceData.afipData || null,
  }).eq('id', saleId)
}

export const updateSaleRemito = async (
  saleId: string,
  remitoData: {
    remitoNumber: string
    remitoPdfUrl: string
  },
) => {
  await supabase.from('ventas').update({
    remito_number: remitoData.remitoNumber,
    remito_pdf_url: remitoData.remitoPdfUrl,
  }).eq('id', saleId)
}

export const emitInvoice = async (saleId: string, clientData: any) => {
  const response = await fetch('/api/facturacion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ saleId, client: clientData }),
  })
  if (!response.ok) throw new Error('Error emitiendo factura')
  return response.json()
}

export const getSalesPaginated = async (
  pageSize: number = 50,
  lastDoc?: any,
): Promise<{ data: Sale[]; lastDoc: any; hasMore: boolean }> => {
  const offset = lastDoc ?? 0
  const { data } = await supabase
    .from('ventas')
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1)

  const sales = (data ?? []).map(mapSale)
  return {
    data: sales,
    lastDoc: sales.length === pageSize ? offset + pageSize : null,
    hasMore: sales.length === pageSize,
  }
}

export const processSaleMayorista = async (data: {
  clientId?: string
  clientName?: string
  clientPhone?: string
  sellerId?: string
  sellerName?: string
  items: CartItem[]
  paymentType: 'cash' | 'credit' | 'mixed'
  paymentMethod?: 'efectivo' | 'transferencia'
  cashAmount?: number
  creditAmount?: number
  overpayment?: number
  discount?: number
  discountType?: 'percent' | 'fixed'
  deliveryMethod: 'pickup' | 'delivery'
  deliveryAddress: string
  modo: 'esperar' | 'disponible'
}): Promise<Sale> => {
  const { modo } = data

  const subtotal = data.items.reduce((acc, item) => {
    const base = item.product.price * item.quantity
    const disc = item.itemDiscount ? (base * item.itemDiscount) / 100 : 0
    return acc + base - disc
  }, 0)
  const discountAmount =
    data.discount && data.discount > 0
      ? data.discountType === 'percent'
        ? (subtotal * data.discount) / 100
        : data.discount
      : 0
  const total = Math.max(0, subtotal - discountAmount)

  // Paralelizar queries iniciales
  const clientPromise = data.clientId
    ? supabase.from('clientes').select('*').eq('id', data.clientId).single()
    : Promise.resolve({ data: null })

  const [ultimoNumero, { data: cd }] = await Promise.all([ultimoNumeroVenta(), clientPromise])
  const saleNumber = generateSaleNumber(new Date(), ultimoNumero)

  let resolvedClientName = data.clientName ?? 'Venta directa'
  let resolvedTaxCategory: any
  let resolvedClientPhone = data.clientPhone ?? null
  let resolvedClientCuit: string | null = null
  let resolvedClientAddress: string | null = null
  let resolvedClientEmail: string | null = null
  let resolvedClientDni: string | null = null
  let clientAddress = data.deliveryAddress

  if (cd) {
    resolvedClientName = cd.name ?? resolvedClientName
    resolvedTaxCategory = cd.tax_category ?? null
    resolvedClientPhone = cd.phone ?? resolvedClientPhone ?? null
    resolvedClientCuit = cd.cuit ?? null
    resolvedClientAddress = cd.address ?? null
    resolvedClientEmail = cd.email ?? null
    resolvedClientDni = cd.dni ?? null
    if (data.deliveryMethod === 'delivery' && !data.deliveryAddress) {
      clientAddress = cd.address ?? data.deliveryAddress
    }
  }

  const saleId = await generateReadableId('ventas', 'venta', resolvedClientName)

  const itemsConStock = data.items.map((item) => {
    const stockLocal = (item.product as any).stockLocal ?? 0
    const cantidadPedida = item.quantity
    const cantidadStockLocal = Math.min(cantidadPedida, stockLocal)
    const cantidadPendienteMayorista =
      modo === 'disponible' ? 0 : Math.max(0, cantidadPedida - stockLocal)
    const regalo = item.regalo ?? 0
    return {
      productId: item.product.id,
      name: item.product.name,
      price: item.product.price,
      quantity: cantidadPedida,
      cantidadPedida,
      cantidadStockLocal,
      cantidadPendienteMayorista,
      regalo,
      ...(item.itemDiscount ? { itemDiscount: item.itemDiscount } : {}),
      ...(item.product.codigo ? { codigo: item.product.codigo } : {}),
    }
  })

  // Regalos de OTRO producto (promo cruzada) — gratis, se agregan al registro
  const regalosCruzados = data.items
    .filter((it) => (it.regaloOtroCantidad ?? 0) > 0 && it.product.regaloProductoId)
    .map((it) => ({ productoId: it.product.regaloProductoId as string, nombre: it.product.regaloProductoNombre ?? 'Regalo', cantidad: it.regaloOtroCantidad as number }))
  const itemsParaGuardar = [
    ...itemsConStock,
    ...regalosCruzados.map((r) => ({ productId: r.productoId, name: r.nombre, price: 0, quantity: r.cantidad, esRegalo: true })),
  ]

  const saleStatus: Sale['status'] = modo === 'esperar' ? 'pendiente' : 'listo'

  const saleRow: Record<string, any> = {
    id: saleId,
    sale_number: saleNumber,
    client_id: data.clientId ?? null,
    client_name: resolvedClientName ?? null,
    client_phone: resolvedClientPhone ?? null,
    seller_id: data.sellerId ?? null,
    seller_name: data.sellerName ?? null,
    source: 'direct',
    items: itemsParaGuardar,
    total,
    payment_type: data.paymentType,
    payment_method: data.paymentMethod ?? 'efectivo',
    cash_amount: data.cashAmount ?? null,
    credit_amount: data.creditAmount ?? null,
    status: saleStatus,
    invoice_emitted: false,
    delivery_method: data.deliveryMethod ?? 'pickup',
    delivery_address: clientAddress ?? null,
    discount: data.discount && data.discount > 0 ? data.discount : null,
    discount_type: data.discount && data.discount > 0 ? (data.discountType ?? null) : null,
  }
  const hasPayCol2 = await ensurePaymentMethodColumn()
  if (!hasPayCol2) delete saleRow.payment_method
  const { error: insertError } = await supabase.from('ventas').insert(saleRow)
  if (insertError) throw new Error(`Error al crear venta: ${insertError.message}`)

  // Desde acá la venta ya está grabada: si algo falla, el error lo dice con el N° para que
  // no se vuelva a cargar (antes el reintento duplicaba la venta y el descuento de stock).
  const yaGrabada = (err: unknown) =>
    new Error(`La venta ${saleNumber} quedó registrada, pero falló un paso posterior: ${err instanceof Error ? err.message : String(err)}. No la vuelvas a cargar; avisá para revisarla.`)

  // Descontar stock solo en modo "disponible" — venta y regalo por separado
  if (modo === 'disponible') {
    try {
      const { descontarStockVenta, descontarStockRegalo } = await import('@/services/stock-service')
      const itemsVenta = itemsConStock
        .filter((i) => i.cantidadStockLocal > 0)
        .map((i) => ({ productoId: i.productId, cantidad: i.cantidadStockLocal }))
      // Regalo del mismo producto + regalos de otro producto (promo cruzada)
      const itemsRegaloMismo = itemsConStock
        .filter((i) => i.regalo > 0)
        .map((i) => ({ productoId: i.productId, cantidad: i.regalo }))
      const itemsRegaloCruzado = regalosCruzados.map((r) => ({ productoId: r.productoId, cantidad: r.cantidad }))
      if (itemsVenta.length > 0) await descontarStockVenta(itemsVenta, saleId)
      const regalos = [...itemsRegaloMismo, ...itemsRegaloCruzado]
      if (regalos.length > 0) await descontarStockRegalo(regalos, saleId)
    } catch (err) {
      throw yaGrabada(err)
    }
  }

  // Credito, saldo a favor y comisión en paralelo
  const postSaleOps: Promise<void>[] = []

  const amountToCredit =
    data.paymentType === 'credit'
      ? total
      : data.paymentType === 'mixed'
        ? (data.creditAmount ?? 0)
        : 0
  const overpaymentAmount = data.overpayment ?? 0

  // Crédito + saldo a favor (secuencial entre sí porque tocan current_balance)
  if ((amountToCredit > 0 || overpaymentAmount > 0) && data.clientId) {
    postSaleOps.push((async () => {
      if (amountToCredit > 0) {
        await registrarMovimientoVenta({
          clientId: data.clientId!, clientName: resolvedClientName, type: 'debt',
          amount: amountToCredit, description: `Venta #${saleNumber}`, saleId,
        })
      }
      if (overpaymentAmount > 0) {
        await registrarMovimientoVenta({
          clientId: data.clientId!, clientName: resolvedClientName, type: 'payment',
          amount: overpaymentAmount, description: `Saldo a favor (Venta #${saleNumber})`, saleId,
        })
      }
    })())
  }

  // Actualizar totales del vendedor (comisiones se derivan de ventas)
  if (data.sellerId) {
    postSaleOps.push((async () => {
      const { data: sr } = await supabase.from('vendedores').select('commission_rate').eq('id', data.sellerId!).single()
      if (sr) {
        const rate = tasaComision(sr.commission_rate) / 100
        await moverTotalesVendedor(data.sellerId!, total, total * rate, `vendedor-venta:${saleId}`)
      }
    })())
  }

  // Todas corren hasta el final aunque una falle (deuda y comisión no dependen entre sí).
  const fallos = (await Promise.allSettled(postSaleOps)).filter((r): r is PromiseRejectedResult => r.status === 'rejected')
  if (fallos.length > 0) throw yaGrabada(fallos[0].reason)

  return {
    id: saleId, saleNumber, clientId: data.clientId, clientName: resolvedClientName,
    clientPhone: resolvedClientPhone ?? undefined, clientCuit: resolvedClientCuit ?? undefined,
    clientAddress: resolvedClientAddress ?? undefined, sellerId: data.sellerId,
    sellerName: data.sellerName, source: 'direct', items: itemsParaGuardar, total,
    paymentType: data.paymentType, paymentMethod: data.paymentMethod ?? 'efectivo',
    cashAmount: data.cashAmount, creditAmount: data.creditAmount, discount: data.discount,
    discountType: data.discountType, status: saleStatus, invoiceEmitted: false,
    invoiceStatus: 'pending', deliveryMethod: data.deliveryMethod, deliveryAddress: clientAddress,
    createdAt: new Date(),
  }
}

export const updateSaleMayoristaStatus = async (
  saleId: string,
  status: 'listo' | 'pendiente'
): Promise<void> => {
  await supabase.from('ventas').update({ status }).eq('id', saleId)
}

export const getSalesPendientesMayorista = async (): Promise<Sale[]> => {
  const { data } = await supabase
    .from('ventas')
    .select('*')
    .eq('status', 'pendiente')
    .order('created_at', { ascending: true })

  return (data ?? []).map(mapSale)
}

// Todas las columnas que usa mapSale menos los PDFs base64 (remito/factura) y `busqueda`:
// Caja carga las ventas del día en cada apertura y no muestra los PDFs.
const SALE_COLS_SIN_PDF =
  'id, sale_number, client_id, client_name, client_phone, client_cuit, client_dni, client_email, ' +
  'client_address, client_tax_category, seller_id, seller_name, source, items, subtotal, tax, total, ' +
  'payment_type, payment_method, cash_amount, credit_amount, efectivo_amount, transferencia_amount, ' +
  'comprobante_transferencia, status, invoice_emitted, invoice_number, invoice_status, invoice_pdf_url, ' +
  'invoice_whatsapp_url, remito_pdf_url, remito_number, hoja_ruta_number, discount, discount_type, ' +
  'order_id, delivery_method, delivery_address, created_at, updated_at, invoice_drive_url, ' +
  'invoice_drive_file_id, remito_drive_url, remito_drive_file_id, items_no_entregados, afip_data, client_data'

export const getSalesByDateRange = async (
  startDate: Date,
  endDate: Date,
): Promise<Sale[]> => {
  const { data } = await supabase
    .from('ventas')
    .select(SALE_COLS_SIN_PDF)
    .gte('created_at', startDate.toISOString())
    .lte('created_at', endDate.toISOString())
    .order('created_at', { ascending: false })

  return (data ?? []).map(mapSale)
}

// Igual que getSalesByDateRange pero sin columnas pesadas (PDFs base64).
// Para cálculos que solo necesitan total/items/vendedor (rentabilidad, dashboard).
export const getSalesByDateRangeLite = async (
  startDate: Date,
  endDate: Date,
): Promise<Sale[]> => {
  const { data } = await supabase
    .from('ventas')
    .select('id, total, items, seller_id, seller_name, client_id, created_at')
    .gte('created_at', startDate.toISOString())
    .lte('created_at', endDate.toISOString())
    .order('created_at', { ascending: false })

  return (data ?? []).map(mapSale)
}
