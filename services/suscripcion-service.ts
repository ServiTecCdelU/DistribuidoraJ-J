import { supabase } from '@/lib/supabase'
import type { EstadoSuscripcion, PagoSuscripcion } from '@/lib/utils/suscripcion'

export const SUSCRIPCION_ID = 'default'

export interface Suscripcion {
  id: string
  razonSocial: string
  nombreFantasia: string
  cuit: string
  direccion: string
  ciudad: string
  telefono: string
  email: string
  plan: string
  montoMensual: number
  moneda: string
  sucursales: number
  diaVencimiento: number
  fechaInicio: string | null // 'YYYY-MM-DD'
  estado: EstadoSuscripcion
  notas: string
}

export const suscripcionVacia = (): Suscripcion => ({
  id: SUSCRIPCION_ID,
  razonSocial: '',
  nombreFantasia: '',
  cuit: '',
  direccion: '',
  ciudad: '',
  telefono: '',
  email: '',
  plan: 'basico',
  montoMensual: 0,
  moneda: 'ARS',
  sucursales: 1,
  diaVencimiento: 10,
  fechaInicio: null,
  estado: 'activo',
  notas: '',
})

function mapSuscripcion(d: Record<string, any>): Suscripcion {
  return {
    id: d.id ?? SUSCRIPCION_ID,
    razonSocial: d.razon_social ?? '',
    nombreFantasia: d.nombre_fantasia ?? '',
    cuit: d.cuit ?? '',
    direccion: d.direccion ?? '',
    ciudad: d.ciudad ?? '',
    telefono: d.telefono ?? '',
    email: d.email ?? '',
    plan: d.plan ?? 'basico',
    montoMensual: Number(d.monto_mensual) || 0,
    moneda: d.moneda ?? 'ARS',
    sucursales: Number(d.sucursales) || 1,
    diaVencimiento: Number(d.dia_vencimiento) || 10,
    fechaInicio: d.fecha_inicio ?? null,
    estado: (d.estado ?? 'activo') as EstadoSuscripcion,
    notas: d.notas ?? '',
  }
}

function mapPago(d: Record<string, any>): PagoSuscripcion {
  return {
    id: d.id,
    periodo: d.periodo,
    monto: Number(d.monto) || 0,
    fechaPago: d.fecha_pago ?? null,
    metodo: d.metodo ?? null,
    comprobante: d.comprobante ?? null,
    estado: d.estado === 'pendiente' ? 'pendiente' : 'pagado',
    notas: d.notas ?? null,
  }
}

// ─── Perfil / suscripción ──────────────────────────────────────

export const getSuscripcion = async (): Promise<Suscripcion> => {
  const { data, error } = await supabase
    .from('suscripcion')
    .select('*')
    .eq('id', SUSCRIPCION_ID)
    .maybeSingle()
  if (error) throw error
  return data ? mapSuscripcion(data) : suscripcionVacia()
}

export const saveSuscripcion = async (s: Suscripcion): Promise<Suscripcion> => {
  const { data, error } = await supabase
    .from('suscripcion')
    .upsert(
      {
        id: SUSCRIPCION_ID,
        razon_social: s.razonSocial || null,
        nombre_fantasia: s.nombreFantasia || null,
        cuit: s.cuit || null,
        direccion: s.direccion || null,
        ciudad: s.ciudad || null,
        telefono: s.telefono || null,
        email: s.email || null,
        plan: s.plan,
        monto_mensual: s.montoMensual,
        moneda: s.moneda,
        sucursales: s.sucursales,
        dia_vencimiento: s.diaVencimiento,
        fecha_inicio: s.fechaInicio || null,
        estado: s.estado,
        notas: s.notas || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    )
    .select()
    .single()
  if (error) throw error
  return mapSuscripcion(data)
}

// ─── Pagos del abono ───────────────────────────────────────────

export const getPagosSuscripcion = async (): Promise<PagoSuscripcion[]> => {
  const { data, error } = await supabase
    .from('suscripcion_pagos')
    .select('*')
    .order('periodo', { ascending: false })
  if (error) throw error
  return (data ?? []).map(mapPago)
}

export const savePagoSuscripcion = async (
  pago: Omit<PagoSuscripcion, 'id'> & { id?: string },
): Promise<PagoSuscripcion> => {
  const { data, error } = await supabase
    .from('suscripcion_pagos')
    .upsert(
      {
        id: pago.id || `susc_pago_${pago.periodo}`,
        periodo: pago.periodo,
        monto: pago.monto,
        fecha_pago: pago.fechaPago || null,
        metodo: pago.metodo || null,
        comprobante: pago.comprobante || null,
        estado: pago.estado,
        notas: pago.notas || null,
      },
      { onConflict: 'periodo' },
    )
    .select()
    .single()
  if (error) throw error
  return mapPago(data)
}

export const deletePagoSuscripcion = async (id: string): Promise<void> => {
  const { error } = await supabase.from('suscripcion_pagos').delete().eq('id', id)
  if (error) throw error
}
