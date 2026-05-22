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
    gananciaGlobal: d.ganancia_global != null ? Number(d.ganancia_global) : undefined,
    gananciaIndividual: d.ganancia_individual ?? undefined,
    codigo: d.codigo ?? undefined,
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
}> => {
  const { data, error } = await supabase
    .from('productos')
    .select('stock, price')
    .eq('disabled', false)

  if (error) throw error
  const rows = data ?? []
  return {
    totalProducts: rows.length,
    totalInventoryValue: rows.reduce((sum, r) => sum + (Number(r.price) || 0) * (r.stock ?? 0), 0),
    lowStockCount: rows.filter((r) => r.stock > 0 && r.stock < 10).length,
    outOfStockCount: rows.filter((r) => r.stock === 0).length,
  }
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
    ganancia_global: product.gananciaGlobal ?? null,
    ganancia_individual: product.gananciaIndividual ?? null,
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
  if (updates.gananciaGlobal !== undefined) mapped.ganancia_global = updates.gananciaGlobal
  if (updates.gananciaIndividual !== undefined) mapped.ganancia_individual = updates.gananciaIndividual
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
