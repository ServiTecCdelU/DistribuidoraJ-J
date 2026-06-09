import { supabase } from '@/lib/supabase'
import type { Product } from '@/lib/types'
import { generateReadableId } from '@/services/supabase-helpers'

function mapRow(d: Record<string, any>): Product {
  return {
    id: d.id,
    name: d.name ?? '',
    description: d.description ?? '',
    price: Number(d.price) || 0,
    stock: d.stock ?? 0,
    imageUrl: d.image_url ?? '',
    category: d.category ?? '',
    base: d.base ?? 'crema',
    marca: d.brand ?? 'Sin identificar',
    sinTacc: d.sin_tacc ?? false,
    disabled: d.disabled ?? false,
    createdAt: new Date(d.created_at),
    unidadesPorBulto: d.unidades_por_bulto ?? undefined,
    seDivideEn: d.se_divide_en ? Number(d.se_divide_en) : undefined,
    precioVenta: d.precio_venta != null ? Number(d.precio_venta) : undefined,
    precioBase: d.precio_base != null ? Number(d.precio_base) : undefined,
    gananciaGlobal: d.ganancia_global != null ? Number(d.ganancia_global) : undefined,
    gananciaIndividual: d.ganancia_individual ?? undefined,
    codigo: d.codigo ?? undefined,
    descuento: d.descuento != null ? Number(d.descuento) : 0,
    regaloMismo: d.regalo_mismo ?? false,
    regaloMismoMax: d.regalo_mismo_max != null ? Number(d.regalo_mismo_max) : null,
    regaloOtroMax: d.regalo_otro_max != null ? Number(d.regalo_otro_max) : null,
    regaloProductoId: d.regalo_producto_id ?? null,
    regaloProductoNombre: d.regalo_producto_nombre ?? null,
  }
}


export function invalidateProductsCache(): void {
  // No-op — sin cache con Supabase
}

export const getProducts = async (_forceRefresh = false): Promise<Product[]> => {
  const all: any[] = []
  const PAGE = 1000
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('productos')
      .select('*')
      .order('created_at', { ascending: false })
      .range(from, from + PAGE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }
  return all.map(mapRow)
}

/**
 * Trae productos por una lista de IDs (batch). Para resolver config de oferta
 * vigente o stock de productos regalados sin cargar todo el catálogo.
 */
export const getProductsByIds = async (ids: string[]): Promise<Product[]> => {
  const unique = Array.from(new Set(ids.filter(Boolean)))
  if (unique.length === 0) return []
  const all: any[] = []
  for (let i = 0; i < unique.length; i += 500) {
    const chunk = unique.slice(i, i + 500)
    const { data } = await supabase.from('productos').select('*').in('id', chunk)
    if (data) all.push(...data)
  }
  return all.map(mapRow)
}

/**
 * Trae los productos que tienen al menos una oferta activa:
 * descuento %, regalo del mismo producto, o regalo de otro producto.
 */
export const getProductosConOfertas = async (): Promise<Product[]> => {
  const { data } = await supabase
    .from('productos')
    .select('*')
    .or('descuento.gt.0,regalo_mismo.eq.true,regalo_producto_id.not.is.null')
    .order('name', { ascending: true })
  return (data ?? []).filter((d: any) => !d.disabled).map(mapRow)
}

export interface ProductSearchParams {
  search?: string
  category?: string
  stockFilter?: 'all' | 'available' | 'low' | 'out'
  page?: number
  pageSize?: number
}

export interface ProductSearchResult {
  data: Product[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export const searchProducts = async (params: ProductSearchParams): Promise<ProductSearchResult> => {
  const { search, category, stockFilter, page = 1, pageSize = 10 } = params
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = supabase
    .from('productos')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })

  if (search) {
    query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%,category.ilike.%${search}%,codigo.ilike.%${search}%`)
  }
  if (category && category !== 'all') {
    query = query.eq('category', category)
  }
  if (stockFilter && stockFilter !== 'all') {
    if (stockFilter === 'available') query = query.gt('stock', 0)
    else if (stockFilter === 'low') query = query.gt('stock', 0).lt('stock', 10)
    else if (stockFilter === 'out') query = query.eq('stock', 0)
  }

  query = query.range(from, to)

  const { data, error, count } = await query
  if (error) throw error

  const total = count ?? 0
  return {
    data: (data ?? []).map(mapRow),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  }
}

export const getProductStats = async (): Promise<{
  totalProducts: number
  totalInventoryValue: number
  lowStockCount: number
  outOfStockCount: number
  gananciaActual: number | null
  gananciaMedicamentos: number | null
}> => {
  const activeFilter = 'disabled.eq.false,disabled.is.null'

  // Queries de conteo en paralelo (sin límite de 1000 filas)
  const [totalRes, outRes, lowRes, gananciaRes, gananciaMedRes] = await Promise.all([
    supabase.from('productos').select('*', { count: 'exact', head: true }).or(activeFilter),
    supabase.from('productos').select('*', { count: 'exact', head: true }).or(activeFilter).eq('stock', 0),
    supabase.from('productos').select('*', { count: 'exact', head: true }).or(activeFilter).gt('stock', 0).lt('stock', 10),
    supabase.from('productos').select('ganancia_global').or(activeFilter).gt('ganancia_global', 0).limit(1),
    supabase.from('productos').select('ganancia_global').ilike('category', '%medicamento%').gt('ganancia_global', 0).limit(1),
  ])

  // Valor de inventario: paginar para sumar todo
  let totalInventoryValue = 0
  let from = 0
  const batchSize = 1000
  while (true) {
    const { data } = await supabase
      .from('productos')
      .select('stock, price')
      .or(activeFilter)
      .range(from, from + batchSize - 1)
    if (!data || data.length === 0) break
    totalInventoryValue += data.reduce((sum, r) => sum + (Number(r.price) || 0) * (r.stock ?? 0), 0)
    if (data.length < batchSize) break
    from += batchSize
  }

  const gananciaRow = gananciaRes.data?.[0]
  const gananciaActual = gananciaRow ? Number(gananciaRow.ganancia_global) : null

  const gananciaMedRow = gananciaMedRes.data?.[0]
  const gananciaMedicamentos = gananciaMedRow ? Number(gananciaMedRow.ganancia_global) : null

  return {
    totalProducts: totalRes.count ?? 0,
    totalInventoryValue,
    lowStockCount: lowRes.count ?? 0,
    outOfStockCount: outRes.count ?? 0,
    gananciaActual,
    gananciaMedicamentos,
  }
}

export const getProductCategories = async (): Promise<string[]> => {
  const all: string[] = []
  let from = 0
  const PAGE = 1000
  while (true) {
    const { data, error } = await supabase
      .from('productos')
      .select('category')
      .or('disabled.eq.false,disabled.is.null')
      .range(from, from + PAGE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    for (const r of data) {
      if (r.category) all.push(r.category)
    }
    if (data.length < PAGE) break
    from += PAGE
  }
  return [...new Set(all)].sort()
}

export const getProductById = async (id: string): Promise<Product | undefined> => {
  const { data } = await supabase
    .from('productos')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  return data ? mapRow(data) : undefined
}

export const createProduct = async (
  product: Omit<Product, 'id' | 'createdAt'>
): Promise<Product> => {
  const docId = await generateReadableId('productos', 'producto', product.name)
  const row: Record<string, any> = {
    id: docId,
    name: product.name,
    description: product.description,
    price: product.price,
    stock: product.stock,
    image_url: product.imageUrl,
    category: product.category,
    disabled: product.disabled ?? false,
    code: product.codigo ?? null,
    codigo: product.codigo ?? null,
    unidades_por_bulto: product.unidadesPorBulto ?? null,
    se_divide_en: product.seDivideEn ?? null,
    precio_venta: product.precioVenta ?? null,
    precio_base: product.precioBase ?? null,
    ganancia_global: product.gananciaGlobal ?? null,
    ganancia_individual: product.gananciaIndividual ?? null,
    descuento: product.descuento ?? 0,
  }
  await supabase.from('productos').insert(row)
  return { ...product, id: docId, disabled: product.disabled ?? false, createdAt: new Date() }
}

export const updateProduct = async (
  id: string,
  updates: Partial<Product>
): Promise<Product> => {
  const mapped: Record<string, any> = {}
  if (updates.name !== undefined) mapped.name = updates.name
  if (updates.description !== undefined) mapped.description = updates.description
  if (updates.price !== undefined) mapped.price = updates.price
  if (updates.stock !== undefined) mapped.stock = updates.stock
  if (updates.imageUrl !== undefined) mapped.image_url = updates.imageUrl
  if (updates.category !== undefined) mapped.category = updates.category
  if (updates.disabled !== undefined) mapped.disabled = updates.disabled
  if (updates.codigo !== undefined) mapped.codigo = updates.codigo
  if (updates.unidadesPorBulto !== undefined) mapped.unidades_por_bulto = updates.unidadesPorBulto
  if (updates.seDivideEn !== undefined) mapped.se_divide_en = updates.seDivideEn
  if (updates.precioVenta !== undefined) mapped.precio_venta = updates.precioVenta
  if (updates.precioBase !== undefined) mapped.precio_base = updates.precioBase
  if (updates.gananciaGlobal !== undefined) mapped.ganancia_global = updates.gananciaGlobal
  if (updates.gananciaIndividual !== undefined) mapped.ganancia_individual = updates.gananciaIndividual
  if (updates.descuento !== undefined) mapped.descuento = updates.descuento
  if (updates.regaloMismo !== undefined) mapped.regalo_mismo = updates.regaloMismo
  if (updates.regaloMismoMax !== undefined) mapped.regalo_mismo_max = updates.regaloMismoMax
  if (updates.regaloOtroMax !== undefined) mapped.regalo_otro_max = updates.regaloOtroMax
  if (updates.regaloProductoId !== undefined) mapped.regalo_producto_id = updates.regaloProductoId
  if (updates.regaloProductoNombre !== undefined) mapped.regalo_producto_nombre = updates.regaloProductoNombre
  if ((updates as any).base !== undefined) mapped.base = (updates as any).base
  if ((updates as any).marca !== undefined) mapped.brand = (updates as any).marca
  if ((updates as any).sinTacc !== undefined) mapped.sin_tacc = (updates as any).sinTacc

  const { data } = await supabase
    .from('productos')
    .update(mapped)
    .eq('id', id)
    .select()
    .single()

  if (!data) throw new Error('Product not found')
  return mapRow(data)
}

export const deleteProduct = async (id: string): Promise<void> => {
  await supabase.from('productos').delete().eq('id', id)
}

export const getProductsPaginated = async (
  pageSize: number = 50,
  lastDoc?: any,
): Promise<{ data: Product[]; lastDoc: any; hasMore: boolean }> => {
  const offset = lastDoc ?? 0
  const { data } = await supabase
    .from('productos')
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1)

  const products = (data ?? []).map(mapRow)
  return {
    data: products,
    lastDoc: products.length === pageSize ? offset + pageSize : null,
    hasMore: products.length === pageSize,
  }
}
