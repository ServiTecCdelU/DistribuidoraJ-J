import { supabase } from '@/lib/supabase'
import type { MayoristaProducto, MayoristaPrefs } from '@/lib/types'
import { invalidateProductsCache } from '@/services/products-service'

const BATCH_SIZE = 300

function mapDoc(d: Record<string, any>): MayoristaProducto {
  return {
    id: d.id,
    codigoBarras: d.codigo_barras ?? '',
    codigo: d.codigo ?? '',
    nombre: d.descripcion ?? d.nombre ?? '',
    precioUnitarioMayorista: Number(d.precio_lista) || 0,
    rubro: d.rubro ?? '',
    subrubro: d.subrubro ?? '',
    categoria: d.categoria ?? 'Sin categoria',
    habilitado: d.habilitado ?? false,
    productoId: d.producto_id ?? undefined,
    updatedAt: new Date(d.updated_at ?? d.created_at),
    // Campos desde "productos" — se completan en el join
    precioVenta: 0,
    gananciaGlobal: undefined,
    gananciaIndividual: false,
    stockLocal: d.stock_local ?? 0,
    unidadesPorBulto: undefined,
    seDivideEn: undefined,
  }
}

export const invalidateMayoristaCache = () => {
  // No-op con Supabase
}

export interface MayoristaSearchParams {
  search?: string
  rubro?: string
  subrubro?: string
  estado?: 'todos' | 'habilitados' | 'deshabilitados'
  page?: number
  pageSize?: number
}

export interface MayoristaSearchResult {
  data: MayoristaProducto[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export const searchMayoristaProductos = async (params: MayoristaSearchParams): Promise<MayoristaSearchResult> => {
  const { search, rubro, subrubro, estado, page = 1, pageSize = 10 } = params
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = supabase
    .from('mayorista_productos')
    .select('*', { count: 'exact' })
    .order('descripcion', { ascending: true })

  if (search) {
    query = query.or(`descripcion.ilike.%${search}%,codigo.ilike.%${search}%,codigo_barras.ilike.%${search}%`)
  }
  if (rubro && rubro !== 'todos') {
    query = query.eq('rubro', rubro)
  }
  if (subrubro && subrubro !== 'todos') {
    query = query.ilike('subrubro', `${subrubro}%`)
  }
  if (estado === 'habilitados') {
    query = query.eq('habilitado', true)
  } else if (estado === 'deshabilitados') {
    query = query.eq('habilitado', false)
  }

  query = query.range(from, to)

  const { data, error, count } = await query
  if (error) throw error

  const total = count ?? 0
  return {
    data: (data ?? []).map(mapDoc),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  }
}

export const getMayoristaRubros = async (): Promise<string[]> => {
  const { data, error } = await supabase
    .from('mayorista_productos')
    .select('rubro')
    .not('rubro', 'is', null)
    .not('rubro', 'eq', '')
  if (error) throw error
  const set = new Set((data ?? []).map((d: any) => d.rubro as string))
  return Array.from(set).sort()
}

export const getMayoristaProductos = async (_forceRefresh = false, includeJoin = true): Promise<MayoristaProducto[]> => {
  const all: any[] = []
  const PAGE = 1000
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('mayorista_productos')
      .select('*')
      .order('descripcion', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }

  const productos = all.map(mapDoc)

  // Join con "productos" para los habilitados
  if (includeJoin) {
    const habilitados = productos.filter((p) => p.habilitado && p.productoId)
    if (habilitados.length > 0) {
      const prodIds = habilitados.map((p) => p.productoId!)
      // Supabase .in() tiene límite, paginar en chunks
      const productosMap = new Map<string, Record<string, any>>()
      for (let i = 0; i < prodIds.length; i += 500) {
        const chunk = prodIds.slice(i, i + 500)
        const { data: prodRows } = await supabase
          .from('productos')
          .select('id, precio_venta, price, ganancia_global, ganancia_individual, stock, unidades_por_bulto, se_divide_en')
          .in('id', chunk)
        ;(prodRows ?? []).forEach((p) => productosMap.set(p.id, p))
      }

      for (const p of productos) {
        if (!p.productoId) continue
        const pd = productosMap.get(p.productoId)
        if (!pd) continue
        p.precioVenta = Number(pd.precio_venta) || Number(pd.price) || 0
        p.gananciaGlobal = pd.ganancia_global ? Number(pd.ganancia_global) : undefined
        p.gananciaIndividual = pd.ganancia_individual ?? false
        p.stockLocal = pd.stock ?? 0
        p.unidadesPorBulto = pd.unidades_por_bulto ?? undefined
        p.seDivideEn = pd.se_divide_en ? Number(pd.se_divide_en) : undefined
      }
    }
  }

  return productos
}

export const upsertMayoristaProductos = async (
  productos: Omit<MayoristaProducto, 'id' | 'updatedAt' | 'stockLocal' | 'precioVenta' | 'gananciaGlobal' | 'gananciaIndividual' | 'habilitado' | 'unidadesPorBulto' | 'seDivideEn' | 'productoId'>[],
  onProgress?: (done: number, total: number) => void
): Promise<void> => {
  onProgress?.(0, productos.length)

  const allRows = productos.map((p) => ({
    id: `mp_${p.codigo.replace(/[^a-zA-Z0-9]/g, '_')}`,
    codigo: p.codigo,
    descripcion: p.nombre,
    precio_lista: p.precioUnitarioMayorista,
    codigo_barras: p.codigoBarras ?? '',
    rubro: p.rubro ?? '',
    subrubro: p.subrubro ?? '',
    categoria: p.categoria ?? '',
  }))

  // Deduplicar por ID — si hay colisiones, el último gana
  const byId = new Map<string, typeof allRows[0]>()
  for (const r of allRows) byId.set(r.id, r)
  const rows = [...byId.values()]
  const dupes = allRows.length - rows.length
  if (dupes > 0) console.warn(`[upsertMayorista] ${dupes} productos con ID duplicado (códigos colisionan)`)
  console.log(`[upsertMayorista] ${productos.length} recibidos → ${rows.length} únicos por ID`)

  // Upsert en batches
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE)
    const { error } = await supabase
      .from('mayorista_productos')
      .upsert(chunk, { onConflict: 'id', ignoreDuplicates: false })
    if (error) throw new Error(`Error al importar batch ${i}: ${error.message}`)
    onProgress?.(Math.min(i + BATCH_SIZE, rows.length), productos.length)
  }

  onProgress?.(productos.length, productos.length)
}

// Aplica un porcentaje a una lista de productos — escribe en "productos"
export const applyGananciaToProducts = async (
  porcentaje: number,
  products: Array<{ id: string; productoId: string; precioUnitarioMayorista: number }>,
  onProgress?: (done: number, total: number) => void
): Promise<void> => {
  let done = 0
  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const chunk = products.slice(i, i + BATCH_SIZE)
    await Promise.all(
      chunk.map(({ productoId, precioUnitarioMayorista }) => {
        const precioVenta = Math.round(precioUnitarioMayorista * (1 + porcentaje / 100) * 100) / 100
        return supabase.from('productos').update({
          price: precioVenta,
          precio_venta: precioVenta,
          ganancia_global: porcentaje,
          ganancia_individual: false,
        }).eq('id', productoId)
      })
    )
    done += chunk.length
    onProgress?.(done, products.length)
  }

  invalidateProductsCache()
  if (typeof window !== 'undefined') {
    try { window.dispatchEvent(new CustomEvent('mayorista:updated', { detail: { porcentaje } })) } catch { /* noop */ }
  }
}

// Actualiza precio de venta individual en "productos"
export const updateProductoPrecioVenta = async (
  productoId: string,
  precio: number,
  gananciaIndividual: boolean
): Promise<void> => {
  await supabase.from('productos').update({
    price: precio,
    precio_venta: precio,
    ganancia_individual: gananciaIndividual,
  }).eq('id', productoId)

  invalidateProductsCache()
  if (typeof window !== 'undefined') {
    try { window.dispatchEvent(new CustomEvent('mayorista:updated', { detail: { productoId, precio } })) } catch { /* noop */ }
  }
}

// ─── Habilitar / Deshabilitar ─────────────────────────────────────────────────

export const habilitarProducto = async (
  mp: MayoristaProducto,
  unidadesPorBulto: number,
  seDivideEn?: number,
  precioVentaOverride?: number,
  gananciaGlobal?: number
): Promise<void> => {
  let finalGanancia: number | undefined = gananciaGlobal
  if (finalGanancia == null) {
    try {
      const { data: rows } = await supabase
        .from('productos')
        .select('ganancia_global')
        .gte('ganancia_global', 0)
        .limit(1)
      if (rows && rows.length > 0) {
        const g = Number(rows[0].ganancia_global)
        if (!isNaN(g)) finalGanancia = g
      }
    } catch { /* noop */ }
  }

  const precio = precioVentaOverride != null
    ? precioVentaOverride
    : finalGanancia != null && mp.precioUnitarioMayorista > 0
      ? Math.round(mp.precioUnitarioMayorista * (1 + finalGanancia / 100) * 100) / 100
      : mp.precioVenta

  let productoId = mp.productoId

  if (productoId) {
    await supabase.from('productos').update({
      price: precio,
      precio_venta: precio,
      unidades_por_bulto: unidadesPorBulto,
      ...(seDivideEn != null ? { se_divide_en: seDivideEn } : {}),
      disabled: false,
      ...(finalGanancia != null ? { ganancia_global: finalGanancia } : {}),
    }).eq('id', productoId)
  } else {
    productoId = `prod_${mp.id}`
    await supabase.from('productos').insert({
      id: productoId,
      name: mp.nombre,
      description: mp.codigo,
      price: precio,
      precio_venta: precio,
      stock: 0,
      image_url: '',
      category: mp.rubro || mp.categoria || 'Sin categoria',
      disabled: false,
      unidades_por_bulto: unidadesPorBulto,
      ...(seDivideEn != null ? { se_divide_en: seDivideEn } : {}),
      ...(finalGanancia != null ? { ganancia_global: finalGanancia } : {}),
    })
  }

  await supabase.from('mayorista_productos').update({
    habilitado: true,
    producto_id: productoId,
  }).eq('id', mp.id)

  if (typeof window !== 'undefined') {
    try { window.dispatchEvent(new CustomEvent('mayorista:updated', { detail: { mpId: mp.id, productoId } })) } catch { /* noop */ }
  }
}

export const deshabilitarProducto = async (mp: MayoristaProducto): Promise<void> => {
  await supabase.from('mayorista_productos').update({ habilitado: false }).eq('id', mp.id)

  const productoId = mp.productoId ?? `prod_${mp.id}`
  try {
    await supabase.from('productos').update({ disabled: true }).eq('id', productoId)
  } catch { /* si el doc no existe, ignorar */ }

  if (typeof window !== 'undefined') {
    try { window.dispatchEvent(new CustomEvent('mayorista:updated', { detail: { mpId: mp.id, habilitado: false } })) } catch { /* noop */ }
  }
}

export const sincronizarHabilitadoEnMayorista = async (productoId: string, habilitado: boolean): Promise<void> => {
  await supabase
    .from('mayorista_productos')
    .update({ habilitado })
    .eq('producto_id', productoId)
}

// ─── Preferencias de columnas (por usuario) ───────────────────────────────────

const PREFS_DEFAULTS: MayoristaPrefs = {
  showCodigoBarras: true,
  showRubro: true,
  showSubrubro: true,
}

export const getMayoristaPrefs = async (userId: string): Promise<MayoristaPrefs> => {
  const { data } = await supabase
    .from('configuracion')
    .select('value')
    .eq('key', `${userId}_mayorista_prefs`)
    .maybeSingle()

  if (!data?.value) return { ...PREFS_DEFAULTS }
  const v = data.value as Record<string, boolean>
  return {
    showCodigoBarras: v.showCodigoBarras ?? true,
    showRubro: v.showRubro ?? true,
    showSubrubro: v.showSubrubro ?? true,
  }
}

export const saveMayoristaPrefs = async (
  userId: string,
  prefs: MayoristaPrefs
): Promise<void> => {
  await supabase
    .from('configuracion')
    .upsert({ key: `${userId}_mayorista_prefs`, value: prefs }, { onConflict: 'key' })
}

// ─── Importacion masiva desde lista de precios Excel ─────────────────────────

export type ImportRow = {
  codigo: string
  descripcion?: string
  stockUnidades: number
  unPack: number
  lista1: number
}

export const importarListaPrecios = async (
  rows: ImportRow[],
  onProgress?: (done: number, total: number) => void
): Promise<{ procesados: number; sinMayorista: number }> => {
  const GANANCIA = 30

  onProgress?.(0, rows.length)

  // Cargar todos los mayorista_productos para hacer el match por codigo
  const mpRows: any[] = []
  let mpFrom = 0
  while (true) {
    const { data, error } = await supabase
      .from('mayorista_productos')
      .select('id, codigo, producto_id, rubro, categoria, descripcion')
      .range(mpFrom, mpFrom + 999)
    if (error) throw error
    if (!data || data.length === 0) break
    mpRows.push(...data)
    if (data.length < 1000) break
    mpFrom += 1000
  }

  type MpEntry = { id: string; productoId?: string; rubro?: string; categoria?: string; descripcion?: string }
  const mpExact = new Map<string, MpEntry>()
  const mpStripped = new Map<string, MpEntry>()
  ;(mpRows ?? []).forEach((d) => {
    const codigo = d.codigo ?? ''
    if (!codigo) return
    const entry: MpEntry = {
      id: d.id,
      productoId: d.producto_id ?? undefined,
      rubro: d.rubro ?? undefined,
      categoria: d.categoria ?? undefined,
      descripcion: d.descripcion ?? undefined,
    }
    mpExact.set(codigo, entry)
    const stripped = codigo.replace(/^0+/, '') || codigo
    if (!mpStripped.has(stripped)) mpStripped.set(stripped, entry)
  })

  type PreparedRow = ImportRow & { mp: MpEntry | null; productoId: string }
  const prepared: PreparedRow[] = []
  let sinMayorista = 0

  for (const row of rows) {
    const mp = mpExact.get(row.codigo)
      || mpStripped.get(row.codigo.replace(/^0+/, '') || row.codigo)
    if (mp) {
      prepared.push({ ...row, mp, productoId: mp.productoId || `prod_${mp.id}` })
    } else {
      // Sin match en mayorista — crear producto igual
      sinMayorista++
      const prodId = `prod_mp_${row.codigo.replace(/[^a-zA-Z0-9]/g, '_')}`
      prepared.push({ ...row, mp: null, productoId: prodId })
    }
  }

  console.log(`[importarListaPrecios] ${prepared.length} total, ${sinMayorista} sin mayorista`)

  // Procesar en batches
  let done = 0
  for (let i = 0; i < prepared.length; i += BATCH_SIZE) {
    const chunk = prepared.slice(i, i + BATCH_SIZE)

    // 1. Upsert productos primero (mayorista tiene FK a productos)
    const prodUpserts = chunk.map((row) => {
      const descripcion = row.mp?.descripcion || row.descripcion || row.codigo
      const precioVenta = Math.round(row.lista1 * (1 + GANANCIA / 100) * 100) / 100
      const isNew = !row.mp?.productoId
      return {
        id: row.productoId,
        name: descripcion,
        description: row.codigo,
        price: precioVenta,
        precio_venta: precioVenta,
        ganancia_global: GANANCIA,
        stock: row.stockUnidades,
        unidades_por_bulto: row.unPack,
        disabled: false,
        ...(isNew ? { image_url: '', category: row.mp?.rubro || row.mp?.categoria || 'Sin categoria' } : {}),
      }
    })
    const { error: prodErr } = await supabase.from('productos').upsert(prodUpserts, { onConflict: 'id' })
    if (prodErr) throw new Error(`Error productos: ${prodErr.message}`)

    // 2. Upsert mayorista_productos — solo los que tienen match
    const conMayorista = chunk.filter((row) => row.mp !== null)
    if (conMayorista.length > 0) {
      const mpUpserts = conMayorista.map((row) => ({
        id: row.mp!.id,
        precio_lista: row.lista1,
        habilitado: true,
        producto_id: row.productoId,
      }))
      const { error: mpErr } = await supabase.from('mayorista_productos').upsert(mpUpserts, { onConflict: 'id' })
      if (mpErr) throw new Error(`Error mayorista_productos: ${mpErr.message}`)
    }

    done += chunk.length
    onProgress?.(done, rows.length)
  }

  onProgress?.(rows.length, rows.length)
  invalidateProductsCache()

  return { procesados: prepared.length, sinMayorista }
}
