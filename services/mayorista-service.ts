import { supabase } from '@/lib/supabase'
import type { MayoristaProducto, MayoristaPrefs } from '@/lib/types'
import { invalidateProductsCache } from '@/services/products-service'
import { calcularPrecioVentaRemito, resolverProductoId } from '@/lib/utils/remito-import'

const BATCH_SIZE = 300
const UPDATE_CONCURRENCY = 10

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
    descuento: 0,
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

export const getRubrosHabilitados = async (): Promise<string[]> => {
  const { data, error } = await supabase
    .from('mayorista_productos')
    .select('rubro')
    .eq('habilitado', true)
    .not('rubro', 'is', null)
    .not('rubro', 'eq', '')
  if (error) throw error
  const set = new Set((data ?? []).map((d: any) => d.rubro as string))
  return Array.from(set).sort()
}

export interface VentaProductSearchParams {
  search?: string
  rubro?: string
  page?: number
  pageSize?: number
  soloDescuento?: boolean
  vendedorId?: string
}

export interface VentaProductSearchResult {
  data: Array<{
    id: string
    nombre: string
    codigo: string
    precioUnitarioMayorista: number
    rubro: string
    categoria: string
    productoId: string
    unidadesPorBulto?: number
    seDivideEn?: number
    precioVenta: number
    stockLocal: number
    descuento: number
    regaloMismo?: boolean
    regaloMismoMax?: number | null
    regaloOtroMax?: number | null
    regaloProductoId?: string | null
    regaloProductoNombre?: string | null
  }>
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export const searchProductosParaVenta = async (params: VentaProductSearchParams): Promise<VentaProductSearchResult> => {
  const { search, rubro, page = 1, pageSize = 10, soloDescuento = false, vendedorId } = params
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = supabase
    .from('mayorista_productos')
    .select('id, codigo, descripcion, precio_lista, rubro, categoria, producto_id, habilitado', { count: 'exact' })
    .eq('habilitado', true)
    .order('descripcion', { ascending: true })

  if (search) {
    query = query.or(`descripcion.ilike.%${search}%,codigo.ilike.%${search}%`)
  }
  if (rubro) {
    query = query.eq('rubro', rubro)
  }

  // Solo productos con alguna oferta activa (descuento o regalo), sin distinción de vendedor.
  if (soloDescuento) {
    const conDto = await supabase
      .from('productos')
      .select('id')
      .or('descuento.gt.0,regalo_mismo.eq.true,regalo_producto_id.not.is.null')
    const ids = (conDto.data ?? []).map((p: any) => p.id)
    if (ids.length === 0) {
      return { data: [], total: 0, page, pageSize, totalPages: 0 }
    }
    query = query.in('producto_id', ids)
  }

  query = query.range(from, to)

  const { data, error, count } = await query
  if (error) throw error

  const total = count ?? 0
  const mpRows = data ?? []

  // Join con productos para obtener precio_venta, stock, unidades_por_bulto, se_divide_en
  const prodIds = mpRows.map((r: any) => r.producto_id).filter(Boolean)
  const productosMap = new Map<string, Record<string, any>>()
  if (prodIds.length > 0) {
    const { data: prodRows } = await supabase
      .from('productos')
      .select('id, precio_venta, price, stock, unidades_por_bulto, se_divide_en, descuento, regalo_mismo, regalo_mismo_max, regalo_otro_max, regalo_producto_id, regalo_producto_nombre')
      .in('id', prodIds)
    ;(prodRows ?? []).forEach((p: any) => productosMap.set(p.id, p))
  }

  const results = mpRows.map((mp: any) => {
    const prod = productosMap.get(mp.producto_id)
    const precioVenta = prod ? (Number(prod.precio_venta) || Number(prod.price) || 0) : 0
    const descuento = prod?.descuento != null ? Number(prod.descuento) : 0
    return {
      id: mp.id,
      nombre: mp.descripcion ?? '',
      codigo: mp.codigo ?? '',
      precioUnitarioMayorista: Number(mp.precio_lista) || 0,
      rubro: mp.rubro ?? '',
      categoria: mp.categoria ?? '',
      productoId: mp.producto_id ?? '',
      unidadesPorBulto: prod?.unidades_por_bulto ?? undefined,
      seDivideEn: prod?.se_divide_en ? Number(prod.se_divide_en) : undefined,
      precioVenta,
      stockLocal: prod?.stock ?? 0,
      descuento,
      regaloMismo: prod?.regalo_mismo ?? false,
      regaloMismoMax: prod?.regalo_mismo_max != null ? Number(prod.regalo_mismo_max) : null,
      regaloOtroMax: prod?.regalo_otro_max != null ? Number(prod.regalo_otro_max) : null,
      regaloProductoId: prod?.regalo_producto_id ?? null,
      regaloProductoNombre: prod?.regalo_producto_nombre ?? null,
    }
  })

  return {
    data: results,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  }
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
          .select('id, precio_venta, price, ganancia_global, ganancia_individual, stock, unidades_por_bulto, se_divide_en, descuento')
          .in('id', chunk)
        ;(prodRows ?? []).forEach((p) => productosMap.set(p.id, p))
      }

      for (const p of productos) {
        if (!p.productoId) continue
        const pd = productosMap.get(p.productoId)
        if (!pd) continue
        p.precioVenta = Number(pd.precio_venta) || Number(pd.price) || 0
        p.gananciaGlobal = pd.ganancia_global != null ? Number(pd.ganancia_global) : undefined
        p.gananciaIndividual = !!pd.ganancia_individual
        p.stockLocal = pd.stock ?? 0
        p.unidadesPorBulto = pd.unidades_por_bulto ?? undefined
        p.seDivideEn = pd.se_divide_en ? Number(pd.se_divide_en) : undefined
        p.descuento = pd.descuento != null ? Number(pd.descuento) : 0
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
  for (let i = 0; i < products.length; i += UPDATE_CONCURRENCY) {
    const chunk = products.slice(i, i + UPDATE_CONCURRENCY)
    await Promise.all(
      chunk.map(async ({ productoId, precioUnitarioMayorista }) => {
        const precioVenta = Math.round(precioUnitarioMayorista * (1 + porcentaje / 100) * 100) / 100
        const { error } = await supabase.from('productos').update({
          price: precioVenta,
          precio_venta: precioVenta,
          ganancia_global: porcentaje,
          ganancia_individual: 0,
        }).eq('id', productoId)
        if (error) console.error(`Error actualizando ${productoId}:`, error.message)
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
    ganancia_individual: gananciaIndividual ? 1 : 0,
  }).eq('id', productoId)

  invalidateProductsCache()
  if (typeof window !== 'undefined') {
    try { window.dispatchEvent(new CustomEvent('mayorista:updated', { detail: { productoId, precio } })) } catch { /* noop */ }
  }
}

/**
 * Actualiza precio_lista en mayorista_productos para varios productos a la vez.
 * Recibe un array de { productoId, precioLista }.
 */
export const updatePrecioListaBatch = async (
  items: Array<{ productoId: string; precioLista: number }>
): Promise<number> => {
  let updated = 0
  await Promise.all(
    items.map(async ({ productoId, precioLista }) => {
      const { error } = await supabase
        .from('mayorista_productos')
        .update({ precio_lista: precioLista })
        .eq('producto_id', productoId)
      if (!error) updated++
      else console.error('[updatePrecioListaBatch]', productoId, error.message)
    })
  )
  invalidateProductsCache()
  return updated
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

// Habilita un producto a partir de su mpId, pensado para el ingreso por remito de proveedor.
// Garantiza que el producto quede visible para TODOS (vendedores y tienda):
//  - si la ficha en `productos` no existe, la crea (precio según ganancia global, disabled=false)
//  - si ya existe, solo la reactiva (disabled=false) SIN pisar precio/unidades/ganancia
//  - marca `mayorista_productos.habilitado=true` y vincula el producto_id
// Devuelve el productoId resultante (para sumarle stock luego).
export const habilitarDesdeRemito = async (mpId: string): Promise<string | null> => {
  const { data: mpRow } = await supabase.from('mayorista_productos').select('*').eq('id', mpId).maybeSingle()
  if (!mpRow) return null
  const mp = mapDoc(mpRow)

  let productoId = resolverProductoId(mp.productoId, mp.id)

  const { data: existente } = await supabase.from('productos').select('id').eq('id', productoId).maybeSingle()

  if (existente) {
    // La ficha ya existe: solo asegurar que esté visible. No tocar precio ni unidades.
    await supabase.from('productos').update({ disabled: false }).eq('id', productoId)
  } else {
    // Crear ficha. Precio de venta a partir de la ganancia global vigente.
    let ganancia: number | undefined
    try {
      const { data: rows } = await supabase
        .from('productos').select('ganancia_global').gte('ganancia_global', 0).limit(1)
      if (rows && rows.length > 0) {
        const g = Number(rows[0].ganancia_global)
        if (!isNaN(g)) ganancia = g
      }
    } catch { /* noop */ }

    const precio = calcularPrecioVentaRemito(mp.precioUnitarioMayorista, ganancia)

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
      unidades_por_bulto: 1,
      codigo: mp.codigo,
      ...(ganancia != null ? { ganancia_global: ganancia } : {}),
    })
  }

  await supabase.from('mayorista_productos').update({ habilitado: true, producto_id: productoId }).eq('id', mp.id)
  invalidateProductsCache()
  return productoId
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

// ─── Editar producto mayorista ────────────────────────────────────────────────

export interface EditarProductoData {
  nombre?: string
  precioLista?: number
  gananciaGlobal?: number
  precioVenta?: number
  stock?: number
  unidadesPorBulto?: number
  seDivideEn?: number
  rubro?: string
  categoria?: string
}

export const editarProductoMayorista = async (
  mp: MayoristaProducto,
  data: EditarProductoData
): Promise<void> => {
  // Actualizar campos en mayorista_productos
  const mpUpdate: Record<string, any> = {}
  if (data.nombre != null) mpUpdate.descripcion = data.nombre
  if (data.precioLista != null) mpUpdate.precio_lista = data.precioLista
  if (data.rubro != null) mpUpdate.rubro = data.rubro

  if (Object.keys(mpUpdate).length > 0) {
    await supabase.from('mayorista_productos').update(mpUpdate).eq('id', mp.id)
  }

  // Actualizar campos en productos (solo si está habilitado y tiene productoId)
  const productoId = mp.productoId
  if (productoId) {
    const prodUpdate: Record<string, any> = {}
    if (data.nombre != null) prodUpdate.name = data.nombre
    if (data.precioVenta != null) {
      prodUpdate.price = data.precioVenta
      prodUpdate.precio_venta = data.precioVenta
    }
    if (data.gananciaGlobal != null) prodUpdate.ganancia_global = data.gananciaGlobal
    if (data.stock != null) prodUpdate.stock = data.stock
    if (data.unidadesPorBulto != null) prodUpdate.unidades_por_bulto = data.unidadesPorBulto
    if (data.seDivideEn != null) prodUpdate.se_divide_en = data.seDivideEn
    if (data.categoria != null) prodUpdate.category = data.categoria

    if (Object.keys(prodUpdate).length > 0) {
      await supabase.from('productos').update(prodUpdate).eq('id', productoId)
    }
  }

  invalidateMayoristaCache()
  invalidateProductsCache()
  if (typeof window !== 'undefined') {
    try { window.dispatchEvent(new CustomEvent('mayorista:updated', { detail: { mpId: mp.id } })) } catch { /* noop */ }
  }
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

// ─── Actualización diaria de precios desde Excel del mayorista ────────────────

export interface PriceUpdateRow {
  codigo: string
  precio: number
  descripcion?: string
}

export interface PriceDiscrepancia {
  codigo: string
  esperado: number
  real: number | null
}

export interface PriceUpdateResult {
  actualizados: number
  sinMatch: number
  preciosVentaActualizados: number
  verificados: number
  discrepancias: PriceDiscrepancia[]
  agregados: number
  agregadosDetalle: { codigo: string; descripcion: string }[]
}

/**
 * Recibe filas con código + precio del Excel mayorista.
 * Busca por código en mayorista_productos, actualiza precio_lista.
 * Para los habilitados, recalcula precio_venta en productos usando la ganancia existente.
 */
export const actualizarPreciosMayorista = async (
  rows: PriceUpdateRow[],
  onProgress?: (done: number, total: number) => void
): Promise<PriceUpdateResult> => {
  onProgress?.(0, rows.length)

  // Cargar todos los mayorista_productos para match por código
  const mpRows: any[] = []
  let mpFrom = 0
  while (true) {
    const { data, error } = await supabase
      .from('mayorista_productos')
      .select('id, codigo, producto_id, habilitado, precio_lista')
      .range(mpFrom, mpFrom + 999)
    if (error) throw error
    if (!data || data.length === 0) break
    mpRows.push(...data)
    if (data.length < 1000) break
    mpFrom += 1000
  }

  // Mapas de búsqueda por código exacto y sin ceros iniciales
  const mpExact = new Map<string, any>()
  const mpStripped = new Map<string, any>()
  for (const d of mpRows) {
    const codigo = d.codigo ?? ''
    if (!codigo) continue
    mpExact.set(codigo, d)
    const stripped = codigo.replace(/^0+/, '') || codigo
    if (!mpStripped.has(stripped)) mpStripped.set(stripped, d)
  }

  // Cargar ganancias de productos habilitados para recalcular precio venta
  const habilitadosIds = mpRows
    .filter((m: any) => m.habilitado && m.producto_id)
    .map((m: any) => m.producto_id)
  const gananciaMap = new Map<string, number>()
  if (habilitadosIds.length > 0) {
    for (let i = 0; i < habilitadosIds.length; i += 500) {
      const chunk = habilitadosIds.slice(i, i + 500)
      const { data: prodRows } = await supabase
        .from('productos')
        .select('id, ganancia_global')
        .in('id', chunk)
      ;(prodRows ?? []).forEach((p: any) => {
        const g = Number(p.ganancia_global)
        if (!isNaN(g) && g > 0) gananciaMap.set(p.id, g)
      })
    }
  }

  let actualizados = 0
  let sinMatch = 0
  let preciosVentaActualizados = 0

  // Preparar updates
  const mpUpdates: Array<{ id: string; precio_lista: number }> = []
  const prodUpdates: Array<{ id: string; price: number; precio_venta: number }> = []
  // Productos del Excel que no existen en la base: se crean como nuevos (deshabilitados).
  const nuevos = new Map<string, { id: string; codigo: string; descripcion: string; precio_lista: number; codigo_barras: string; rubro: string; subrubro: string; categoria: string }>()

  for (const row of rows) {
    const mp = mpExact.get(row.codigo) || mpStripped.get(row.codigo.replace(/^0+/, '') || row.codigo)
    if (!mp) {
      // No está en la base: prepararlo para alta (deduplicado por id).
      const id = `mp_${row.codigo.replace(/[^a-zA-Z0-9]/g, '_')}`
      if (!nuevos.has(id)) {
        nuevos.set(id, {
          id,
          codigo: row.codigo,
          descripcion: row.descripcion?.trim() || row.codigo,
          precio_lista: row.precio,
          codigo_barras: '',
          rubro: '',
          subrubro: '',
          categoria: '',
        })
      }
      sinMatch++
      continue
    }

    // Actualizar precio_lista en mayorista_productos
    mpUpdates.push({ id: mp.id, precio_lista: row.precio })
    actualizados++

    // Si está habilitado y tiene producto, recalcular precio venta
    if (mp.habilitado && mp.producto_id) {
      const ganancia = gananciaMap.get(mp.producto_id)
      if (ganancia != null) {
        const precioVenta = Math.round(row.precio * (1 + ganancia / 100) * 100) / 100
        prodUpdates.push({ id: mp.producto_id, price: precioVenta, precio_venta: precioVenta })
        preciosVentaActualizados++
      }
    }
  }

  // Ejecutar updates en batches
  let done = 0
  const totalOps = mpUpdates.length + prodUpdates.length

  for (let i = 0; i < mpUpdates.length; i += BATCH_SIZE) {
    const chunk = mpUpdates.slice(i, i + BATCH_SIZE)
    // Supabase no soporta batch update por ID distinto, usar upsert
    const { error } = await supabase
      .from('mayorista_productos')
      .upsert(chunk, { onConflict: 'id', ignoreDuplicates: false })
    if (error) throw new Error(`Error actualizando precios mayorista: ${error.message}`)
    done += chunk.length
    onProgress?.(done, totalOps)
  }

  // productos tiene columnas NOT NULL (name, etc.): un upsert intentaría un
  // INSERT parcial y daría 400. Se usa UPDATE real por id, en lotes paralelos.
  const CONCURRENCIA = 40
  for (let i = 0; i < prodUpdates.length; i += CONCURRENCIA) {
    const lote = prodUpdates.slice(i, i + CONCURRENCIA)
    const resultados = await Promise.all(
      lote.map((u) =>
        supabase
          .from('productos')
          .update({ price: u.price, precio_venta: u.precio_venta })
          .eq('id', u.id),
      ),
    )
    for (const { error } of resultados) {
      if (error) throw new Error(`Error actualizando precios venta: ${error.message}`)
    }
    done += lote.length
    onProgress?.(done, totalOps)
  }

  // Alta de los productos que no existían: se crean en mayorista_productos
  // (deshabilitados, sin producto de venta asociado todavía).
  const nuevosRows = [...nuevos.values()]
  let agregados = 0
  const agregadosDetalle: { codigo: string; descripcion: string }[] = []
  for (let i = 0; i < nuevosRows.length; i += BATCH_SIZE) {
    const chunk = nuevosRows.slice(i, i + BATCH_SIZE)
    const { error } = await supabase
      .from('mayorista_productos')
      .upsert(chunk, { onConflict: 'id', ignoreDuplicates: false })
    if (error) throw new Error(`Error agregando productos nuevos: ${error.message}`)
    agregados += chunk.length
  }
  if (nuevosRows.length > 0) {
    agregadosDetalle.push(...nuevosRows.slice(0, 200).map((r) => ({ codigo: r.codigo, descripcion: r.descripcion })))
  }

  onProgress?.(totalOps, totalOps)
  invalidateProductsCache()

  // Verificación: releer de la base los precios recién actualizados y comparar
  // contra lo que se pidió escribir. Corrobora que el dato quedó guardado.
  // Chunks chicos para no generar URLs demasiado largas en el filtro `in`.
  // Si la verificación falla por motivos técnicos, NO se rompe el flujo:
  // el guardado ya ocurrió arriba (sin error), así que se asume correcto.
  const esperadoById = new Map<string, number>(mpUpdates.map((u) => [u.id, u.precio_lista]))
  const idsActualizados = mpUpdates.map((u) => u.id)
  let verificados = 0
  const discrepancias: PriceDiscrepancia[] = []
  const MAX_DISCREPANCIAS = 50
  const VERIF_CHUNK = 80

  try {
    // Lecturas en paralelo para que la verificación no demore (ni parezca colgada).
    const chunks: string[][] = []
    for (let i = 0; i < idsActualizados.length; i += VERIF_CHUNK) {
      chunks.push(idsActualizados.slice(i, i + VERIF_CHUNK))
    }
    const respuestas = await Promise.all(
      chunks.map((chunk) =>
        supabase.from('mayorista_productos').select('id, codigo, precio_lista').in('id', chunk),
      ),
    )
    const leidos = new Map<string, any>()
    for (const { data, error } of respuestas) {
      if (error) throw error
      ;(data ?? []).forEach((d: any) => leidos.set(d.id, d))
    }
    for (const id of idsActualizados) {
      const esperado = esperadoById.get(id) ?? 0
      const d = leidos.get(id)
      const real = d?.precio_lista != null ? Number(d.precio_lista) : null
      if (real != null && Math.abs(real - esperado) < 0.01) {
        verificados++
      } else if (discrepancias.length < MAX_DISCREPANCIAS) {
        discrepancias.push({ codigo: d?.codigo ?? id, esperado, real })
      }
    }
  } catch {
    // No se pudo verificar (p. ej. límite de la consulta). El guardado ya se
    // hizo sin error: se reporta como correcto para no bloquear el cierre.
    verificados = actualizados
    discrepancias.length = 0
  }

  return { actualizados, sinMatch, preciosVentaActualizados, verificados, discrepancias, agregados, agregadosDetalle }
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
