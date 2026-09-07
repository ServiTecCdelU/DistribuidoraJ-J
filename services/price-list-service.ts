// services/price-list-service.ts
import { supabase } from '@/lib/supabase'
import type { PriceList } from '@/lib/types'
import { generateReadableId } from '@/services/supabase-helpers'

export const getPriceLists = async (): Promise<PriceList[]> => {
  const { data } = await supabase
    .from('listas_precios')
    .select('*')
    .order('created_at', { ascending: false })

  const lists = data ?? []
  const ids = lists.map((d) => d.id)
  const { data: links } = ids.length
    ? await supabase.from('listas_precios_productos').select('lista_id, producto_id').in('lista_id', ids)
    : { data: [] as { lista_id: string; producto_id: string }[] }

  const productsByList = new Map<string, string[]>()
  for (const l of links ?? []) {
    const arr = productsByList.get(l.lista_id) ?? []
    arr.push(l.producto_id)
    productsByList.set(l.lista_id, arr)
  }

  return lists.map((d) => ({
    id: d.id,
    name: d.name,
    type: 'general' as PriceList['type'],
    description: d.description ?? '',
    multiplier: Number(d.multiplier) || 1,
    isActive: d.is_active ?? true,
    createdAt: new Date(d.created_at),
    scope: (d.scope === 'selected' ? 'selected' : 'all') as PriceList['scope'],
    productIds: productsByList.get(d.id) ?? [],
  }))
}

export const createPriceList = async (
  data: Omit<PriceList, 'id' | 'createdAt'>,
): Promise<PriceList> => {
  const docId = await generateReadableId('listas_precios', 'lista', data.name)
  await supabase.from('listas_precios').insert({
    id: docId,
    name: data.name,
    description: data.description,
    multiplier: data.multiplier,
    is_active: data.isActive,
    scope: data.scope,
  })
  if (data.scope === 'selected' && data.productIds.length > 0) {
    await supabase.from('listas_precios_productos').insert(
      data.productIds.map((producto_id) => ({ lista_id: docId, producto_id })),
    )
  }
  return { id: docId, ...data, createdAt: new Date() }
}

export const updatePriceList = async (
  id: string,
  updates: Partial<PriceList>,
): Promise<void> => {
  const mapped: Record<string, any> = {}
  if (updates.name !== undefined) mapped.name = updates.name
  if (updates.description !== undefined) mapped.description = updates.description
  if (updates.multiplier !== undefined) mapped.multiplier = updates.multiplier
  if (updates.isActive !== undefined) mapped.is_active = updates.isActive
  if (updates.scope !== undefined) mapped.scope = updates.scope
  if (Object.keys(mapped).length > 0) {
    await supabase.from('listas_precios').update(mapped).eq('id', id)
  }
  if (updates.productIds !== undefined) {
    await supabase.from('listas_precios_productos').delete().eq('lista_id', id)
    if (updates.productIds.length > 0) {
      await supabase.from('listas_precios_productos').insert(
        updates.productIds.map((producto_id) => ({ lista_id: id, producto_id })),
      )
    }
  }
}

export const deletePriceList = async (id: string): Promise<void> => {
  await supabase.from('listas_precios').delete().eq('id', id)
}

// Calculate price for a product given a price list. Si la lista aplica solo a productos
// seleccionados y el producto no está incluido, devuelve el precio base sin modificar.
export const calculatePrice = (
  basePrice: number,
  priceList: PriceList | null,
  productId?: string,
): number => {
  if (!priceList || !priceList.isActive) return basePrice;
  if (priceList.scope === 'selected' && productId && !priceList.productIds.includes(productId)) {
    return basePrice;
  }
  return Math.round(basePrice * priceList.multiplier * 100) / 100;
}
