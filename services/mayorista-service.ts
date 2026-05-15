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

export const getMayoristaProductos = async (_forceRefresh = false, includeJoin = true): Promise<MayoristaProducto[]> => {
  const { data: rows } = await supabase
    .from('mayorista_productos')
    .select('*')
    .order('descripcion', { ascending: true })

  const productos = (rows ?? []).map(mapDoc)

  // Join con "productos" para los habilitados
  if (includeJoin) {
    const habilitados = productos.filter((p) => p.habilitado && p.productoId)
    if (habilitados.length > 0) {
      const prodIds = habilitados.map((p) => p.productoId!)
      const { data: prodRows } = await supabase
        .from('productos')
        .select('id, precio_venta, price, ganancia_global, ganancia_individual, stock, unidades_por_bulto, se_divide_en')
        .in('id', prodIds)

      const productosMap = new Map<string, Record<string, any>>()
      ;(prodRows ?? []).forEach((p) => productosMap.set(p.id, p))

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

  const rows = productos.map((p) => ({
    id: `mp_${p.codigo.replace(/[^a-zA-Z0-9]/g, '_')}`,
    codigo: p.codigo,
    descripcion: p.nombre,
    precio_lista: p.precioUnitarioMayorista,
    codigo_barras: p.codigoBarras ?? '',
    rubro: p.rubro ?? '',
    subrubro: p.subrubro ?? '',
    categoria: p.categoria ?? '',
  }))

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
  descripcion: string
  stockUnidades: number
  unPack: number
  lista1: number
}

export const importarListaPrecios = async (
  rows: ImportRow[],
  onProgress?: (done: number, total: number) => void
): Promise<{ procesados: number; noEncontrados: string[] }> => {
  const GANANCIA = 30

  onProgress?.(0, rows.length)

  // Cargar todos los mayorista_productos para hacer el match por codigo
  const { data: mpRows } = await supabase
    .from('mayorista_productos')
    .select('id, codigo, producto_id, rubro, categoria')

  type MpEntry = { id: string; productoId?: string; rubro?: string; categoria?: string }
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
    }
    mpExact.set(codigo, entry)
    const stripped = codigo.replace(/^0+/, '') || codigo
    if (!mpStripped.has(stripped)) mpStripped.set(stripped, entry)
  })

  type PreparedRow = ImportRow & { mp: MpEntry; productoId: string }
  const prepared: PreparedRow[] = []
  const noEncontrados: string[] = []

  for (const row of rows) {
    const mp = mpExact.get(row.codigo)
      || mpStripped.get(row.codigo.replace(/^0+/, '') || row.codigo)
    if (!mp) {
      noEncontrados.push(row.codigo)
      continue
    }
    prepared.push({ ...row, mp, productoId: mp.productoId || `prod_${mp.id}` })
  }

  // Procesar en batches
  let done = 0
  for (let i = 0; i < prepared.length; i += BATCH_SIZE) {
    const chunk = prepared.slice(i, i + BATCH_SIZE)

    // 1. Upsert mayorista_productos
    const mpUpserts = chunk.map((row) => ({
      id: row.mp.id,
      precio_lista: row.lista1,
      descripcion: row.descripcion,
      habilitado: true,
      producto_id: row.productoId,
    }))
    const { error: mpErr } = await supabase.from('mayorista_productos').upsert(mpUpserts, { onConflict: 'id' })
    if (mpErr) throw new Error(`Error mayorista_productos: ${mpErr.message}`)

    // 2. Upsert productos
    const prodUpserts = chunk.map((row) => {
      const precioVenta = Math.round(row.lista1 * (1 + GANANCIA / 100) * 100) / 100
      const isNew = !row.mp.productoId
      return {
        id: row.productoId,
        name: row.descripcion,
        description: row.codigo,
        price: precioVenta,
        precio_venta: precioVenta,
        ganancia_global: GANANCIA,
        stock: row.stockUnidades,
        unidades_por_bulto: row.unPack,
        disabled: false,
        ...(isNew ? { image_url: '', category: row.mp.rubro || row.mp.categoria || 'Sin categoria' } : {}),
      }
    })
    const { error: prodErr } = await supabase.from('productos').upsert(prodUpserts, { onConflict: 'id' })
    if (prodErr) throw new Error(`Error productos: ${prodErr.message}`)

    done += chunk.length
    onProgress?.(done + noEncontrados.length, rows.length)
  }

  onProgress?.(rows.length, rows.length)
  invalidateProductsCache()

  return { procesados: prepared.length, noEncontrados }
}
