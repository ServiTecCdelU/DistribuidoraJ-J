// services/price-list-service.ts
import { supabase } from '@/lib/supabase'
import type { PriceList } from '@/lib/types'
import { generateReadableId } from '@/services/supabase-helpers'

export const getPriceLists = async (): Promise<PriceList[]> => {
  const { data } = await supabase
    .from('listas_precios')
    .select('*')
    .order('created_at', { ascending: false })

  return (data ?? []).map((d) => ({
    id: d.id,
    name: d.name,
    type: 'general' as PriceList['type'],
    description: d.description ?? '',
    multiplier: Number(d.multiplier) || 1,
    isActive: d.is_active ?? true,
    createdAt: new Date(d.created_at),
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
  })
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
  await supabase.from('listas_precios').update(mapped).eq('id', id)
}

export const deletePriceList = async (id: string): Promise<void> => {
  await supabase.from('listas_precios').delete().eq('id', id)
}

// Calculate price for a product given a price list
export const calculatePrice = (
  basePrice: number,
  priceList: PriceList | null,
): number => {
  if (!priceList || !priceList.isActive) return basePrice;
  return Math.round(basePrice * priceList.multiplier);
}
