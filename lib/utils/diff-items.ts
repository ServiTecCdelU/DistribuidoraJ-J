// Comparación entre dos versiones de los items de un pedido, para dejar en la auditoría
// QUÉ cambió y no solo que "alguien editó el pedido".
//
// Nace del remito R-2026-01782: no se pudo determinar si la yerba se duplicó al cargar el
// pedido o al reemplazar una marca, porque el array de items se reescribió sin registro.

import { consolidarItems } from './items-pedido'

export interface ItemDiff {
  productId?: string
  name?: string
  quantity?: number | null
  price?: number | null
  itemDiscount?: number | null
  [key: string]: unknown
}

export type TipoCambio = 'agregado' | 'quitado' | 'cantidad' | 'precio' | 'descuento'

export interface Cambio {
  tipo: TipoCambio
  productId: string
  name: string
  antes?: number
  despues?: number
}

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Agrupa por producto sumando cantidades, para que la duplicación no esconda cambios reales. */
function porProducto(items: ItemDiff[]): Map<string, { name: string; quantity: number; price: number; itemDiscount: number }> {
  const mapa = new Map<string, { name: string; quantity: number; price: number; itemDiscount: number }>()
  for (const i of consolidarItems(items as any[])) {
    const id = (i as ItemDiff).productId
    if (!id) continue
    const previo = mapa.get(id)
    if (previo) {
      previo.quantity += num((i as ItemDiff).quantity)
      continue
    }
    mapa.set(id, {
      name: String((i as ItemDiff).name ?? id),
      quantity: num((i as ItemDiff).quantity),
      price: num((i as ItemDiff).price),
      itemDiscount: num((i as ItemDiff).itemDiscount),
    })
  }
  return mapa
}

/** Diferencias entre los items antes y después de una edición. */
export function diffItems(antes: ItemDiff[], despues: ItemDiff[]): Cambio[] {
  const a = porProducto(antes)
  const d = porProducto(despues)
  const cambios: Cambio[] = []

  for (const [id, viejo] of a) {
    const nuevo = d.get(id)
    if (!nuevo) {
      cambios.push({ tipo: 'quitado', productId: id, name: viejo.name, antes: viejo.quantity })
      continue
    }
    if (viejo.quantity !== nuevo.quantity) {
      cambios.push({ tipo: 'cantidad', productId: id, name: nuevo.name, antes: viejo.quantity, despues: nuevo.quantity })
    }
    if (viejo.price !== nuevo.price) {
      cambios.push({ tipo: 'precio', productId: id, name: nuevo.name, antes: viejo.price, despues: nuevo.price })
    }
    if (viejo.itemDiscount !== nuevo.itemDiscount) {
      cambios.push({ tipo: 'descuento', productId: id, name: nuevo.name, antes: viejo.itemDiscount, despues: nuevo.itemDiscount })
    }
  }

  for (const [id, nuevo] of d) {
    if (!a.has(id)) {
      cambios.push({ tipo: 'agregado', productId: id, name: nuevo.name, despues: nuevo.quantity })
    }
  }

  return cambios
}

function textoCambio(c: Cambio): string {
  switch (c.tipo) {
    case 'agregado':
      return `agregó ${c.name} x${c.despues}`
    case 'quitado':
      return `quitó ${c.name} x${c.antes}`
    case 'cantidad':
      return `${c.name} ${c.antes} → ${c.despues}`
    case 'precio':
      return `${c.name} precio ${c.antes} → ${c.despues}`
    case 'descuento':
      return `${c.name} descuento ${c.antes}% → ${c.despues}%`
  }
}

/**
 * Texto legible de los cambios para la descripción de auditoría.
 * Recorta a `maximo` entradas para no generar descripciones enormes.
 */
export function describirCambios(cambios: Cambio[], maximo = 8): string {
  if (cambios.length === 0) return ''
  const visibles = cambios.slice(0, maximo).map(textoCambio)
  const restantes = cambios.length - visibles.length
  if (restantes > 0) visibles.push(`y ${restantes} más`)
  return visibles.join('; ')
}
