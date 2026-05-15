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
    const { data } = await supabase
      .from(table)
      .select('id')
      .eq('id', candidateId)
      .maybeSingle()
    if (!data) return candidateId
    num++
  }
  return `${base}_${Date.now()}`
}
