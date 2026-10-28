import { supabase } from '@/lib/supabase'

/**
 * Convierte cualquier valor de fecha (string ISO, Date, o Firestore Timestamp legacy) a Date.
 */
export const toDate = (value: any): Date => {
  if (!value) return new Date()
  if (value instanceof Date) return value
  if (typeof value === 'string') return new Date(value)
  if (typeof value?.toDate === 'function') return value.toDate()
  if (value.seconds != null) return new Date(value.seconds * 1000)
  return new Date(value)
}

export const slugify = (text: string): string => {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

export const generateReadableId = async (
  table: string,
  prefix: string,
  identifier: string,
): Promise<string> => {
  const slug = slugify(identifier)
  const base = `${prefix}_${slug}`
  let num = 1
  while (num < 1000) {
    const candidateId = `${base}_${num}`
    const { data, error } = await supabase
      .from(table)
      .select('id')
      .eq('id', candidateId)
      .maybeSingle()
    // Si la consulta falla no se sabe si el id está libre: devolverlo igual daba un id ya
    // usado y el insert posterior fallaba (pagos/deudas que no quedaban grabados).
    if (error) throw new Error(`No se pudo generar el id en ${table}: ${error.message}`)
    if (!data) return candidateId
    num++
  }
  return `${base}_${Date.now()}`
}

/**
 * Suma `delta` al saldo del cliente dentro de Postgres (RPC `mover_saldo_cliente`).
 * Antes se leía el saldo, se sumaba en JS y se escribía: dos movimientos simultáneos
 * se pisaban y uno se perdía. Devuelve el saldo nuevo.
 */
export const moverSaldoCliente = async (
  clientId: string,
  delta: number,
  cuenta: 'minorista' | 'mayorista' = 'minorista',
): Promise<number> => {
  const { data, error } = await supabase.rpc('mover_saldo_cliente', {
    p_client_id: clientId,
    p_delta: delta,
    p_cuenta: cuenta,
  })
  if (error) throw new Error(error.message)
  return Number(data) || 0
}

/** Suma a los totales del vendedor en Postgres. `clave` evita aplicarlo dos veces (reintentos). */
export const moverTotalesVendedor = async (
  sellerId: string,
  deltaVentas: number,
  deltaComision: number,
  clave?: string,
): Promise<void> => {
  const { error } = await supabase.rpc('mover_totales_vendedor', {
    p_seller_id: sellerId,
    p_delta_ventas: deltaVentas,
    p_delta_comision: deltaComision,
    p_clave: clave ?? null,
  })
  if (error) throw new Error(error.message)
}
