import { supabase } from '@/lib/supabase'
import { generateReadableId } from '@/services/supabase-helpers'

export interface GastoFijo {
  id: string
  nombre: string
  categoria?: string
  monto: number
  activo: boolean
  desde?: string | null // YYYY-MM-DD: mes desde el que aplica
  hasta?: string | null // YYYY-MM-DD: mes hasta el que aplica (null = vigente)
  createdAt: Date
}

export interface GastoVariable {
  id: string
  nombre: string
  categoria?: string
  monto: number
  fecha: string // YYYY-MM-DD
  createdAt: Date
}

function mapFijo(d: Record<string, any>): GastoFijo {
  return {
    id: d.id,
    nombre: d.nombre ?? '',
    categoria: d.categoria ?? undefined,
    monto: Number(d.monto) || 0,
    activo: d.activo ?? true,
    desde: d.desde ?? null,
    hasta: d.hasta ?? null,
    createdAt: new Date(d.created_at),
  }
}

function mapVariable(d: Record<string, any>): GastoVariable {
  return {
    id: d.id,
    nombre: d.nombre ?? '',
    categoria: d.categoria ?? undefined,
    monto: Number(d.monto) || 0,
    fecha: d.fecha,
    createdAt: new Date(d.created_at),
  }
}

// ─── Gastos fijos ──────────────────────────────────────────────

export const getGastosFijos = async (): Promise<GastoFijo[]> => {
  const { data, error } = await supabase
    .from('gastos_fijos')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(mapFijo)
}

export const createGastoFijo = async (
  input: Omit<GastoFijo, 'id' | 'createdAt'>,
): Promise<GastoFijo> => {
  const id = await generateReadableId('gastos_fijos', 'gasto_fijo', input.nombre)
  const { data, error } = await supabase
    .from('gastos_fijos')
    .insert({
      id,
      nombre: input.nombre,
      categoria: input.categoria ?? null,
      monto: input.monto,
      activo: input.activo ?? true,
      desde: input.desde ?? null,
      hasta: input.hasta ?? null,
    })
    .select('*')
    .single()
  if (error) throw error
  return mapFijo(data)
}

export const updateGastoFijo = async (
  id: string,
  updates: Partial<Omit<GastoFijo, 'id' | 'createdAt'>>,
): Promise<GastoFijo> => {
  const mapped: Record<string, any> = {}
  if (updates.nombre !== undefined) mapped.nombre = updates.nombre
  if (updates.categoria !== undefined) mapped.categoria = updates.categoria ?? null
  if (updates.monto !== undefined) mapped.monto = updates.monto
  if (updates.activo !== undefined) mapped.activo = updates.activo
  if (updates.desde !== undefined) mapped.desde = updates.desde ?? null
  if (updates.hasta !== undefined) mapped.hasta = updates.hasta ?? null
  const { data, error } = await supabase
    .from('gastos_fijos')
    .update(mapped)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return mapFijo(data)
}

export const deleteGastoFijo = async (id: string): Promise<void> => {
  const { error } = await supabase.from('gastos_fijos').delete().eq('id', id)
  if (error) throw error
}

// ─── Gastos variables ──────────────────────────────────────────

// Trae los gastos variables de un mes (1-12).
export const getGastosVariables = async (
  year: number,
  month: number,
): Promise<GastoVariable[]> => {
  const desde = `${year}-${String(month).padStart(2, '0')}-01`
  const finMes = new Date(year, month, 0).getDate()
  const hasta = `${year}-${String(month).padStart(2, '0')}-${String(finMes).padStart(2, '0')}`
  const { data, error } = await supabase
    .from('gastos_variables')
    .select('*')
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .order('fecha', { ascending: false })
  if (error) throw error
  return (data ?? []).map(mapVariable)
}

export const createGastoVariable = async (
  input: Omit<GastoVariable, 'id' | 'createdAt'>,
): Promise<GastoVariable> => {
  const id = await generateReadableId('gastos_variables', 'gasto_var', input.nombre)
  const { data, error } = await supabase
    .from('gastos_variables')
    .insert({
      id,
      nombre: input.nombre,
      categoria: input.categoria ?? null,
      monto: input.monto,
      fecha: input.fecha,
    })
    .select('*')
    .single()
  if (error) throw error
  return mapVariable(data)
}

export const updateGastoVariable = async (
  id: string,
  updates: Partial<Omit<GastoVariable, 'id' | 'createdAt'>>,
): Promise<GastoVariable> => {
  const mapped: Record<string, any> = {}
  if (updates.nombre !== undefined) mapped.nombre = updates.nombre
  if (updates.categoria !== undefined) mapped.categoria = updates.categoria ?? null
  if (updates.monto !== undefined) mapped.monto = updates.monto
  if (updates.fecha !== undefined) mapped.fecha = updates.fecha
  const { data, error } = await supabase
    .from('gastos_variables')
    .update(mapped)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return mapVariable(data)
}

export const deleteGastoVariable = async (id: string): Promise<void> => {
  const { error } = await supabase.from('gastos_variables').delete().eq('id', id)
  if (error) throw error
}
