// Ediciones que el admin aplica sobre los items de un pedido antes de generar el remito:
// cantidad, descuento por producto, reemplazo de marca y exclusión.
//
// Todas las ediciones se indexan por productId, así que el resultado tiene que quedar con un
// renglón por producto. El caso que lo hace evidente es el reemplazo: si el pedido ya tenía
// 1 leche y se reemplaza otro producto por leche, el remito debe decir 2 leches en un solo
// renglón, no dos renglones de 1.
//
// Lógica pura para poder testear el pipeline completo sin Supabase ni React.

import { consolidarItems, type ItemPedido } from './items-pedido'

export interface ItemRemitoEdicion extends ItemPedido {
  productId: string
  name?: string
  price?: number | null
  codigo?: string
}

export interface ReemplazoProducto {
  productId: string
  name: string
  price: number
  codigo?: string
}

export interface EdicionesRemito {
  /** Cantidad editada por producto. */
  quantities?: Record<string, number>
  /** Reemplazo de marca por producto. */
  replacements?: Record<string, ReemplazoProducto>
  /** Descuento (%) por producto. 0 lo quita. */
  discounts?: Record<string, number>
  /** Productos que no se envían en este remito. */
  excludeProductIds?: string[]
}

export interface ResultadoEdicion {
  items: ItemRemitoEdicion[]
  /** true si alguna cantidad quedó distinta de la original (el caller avisa al usuario). */
  huboCambioCantidad: boolean
}

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export function aplicarEdicionesRemito(
  items: ItemRemitoEdicion[],
  ediciones: EdicionesRemito,
): ResultadoEdicion {
  const { quantities = {}, replacements = {}, discounts = {}, excludeProductIds = [] } = ediciones
  let huboCambioCantidad = false

  const conDescuento = (item: ItemRemitoEdicion): ItemRemitoEdicion => {
    const d = discounts[item.productId]
    if (d == null) return item
    const pct = Math.min(100, Math.max(0, num(d)))
    const { itemDiscount: _omit, ...rest } = item
    return pct > 0 ? { ...rest, itemDiscount: pct } : { ...rest }
  }

  // Se parte de la lista consolidada: un pedido guardado con el producto repetido
  // (anterior a esta corrección) recibiría cada edición una vez por renglón.
  const editados = consolidarItems(items).map((item) => {
    const nuevaCant = quantities[item.productId]
    const cant = nuevaCant != null && nuevaCant !== item.quantity
      ? ((huboCambioCantidad = true), nuevaCant)
      : item.quantity

    const r = replacements[item.productId]
    if (!r) return conDescuento(cant !== item.quantity ? { ...item, quantity: cant } : item)

    return conDescuento({
      ...item,
      productId: r.productId,
      name: r.name,
      price: r.price,
      codigo: r.codigo,
      quantity: cant,
    })
  })

  const filtrados = excludeProductIds.length > 0
    ? editados.filter((i) => !excludeProductIds.includes(i.productId))
    : editados

  // Segunda consolidación: un reemplazo pudo apuntar a un producto que ya estaba.
  return { items: consolidarItems(filtrados), huboCambioCantidad }
}

/**
 * Cantidad que ya tiene el pedido de un producto, para avisar en la UI que un reemplazo
 * se va a sumar a un renglón existente en vez de crear uno nuevo.
 * Devuelve 0 si el producto no está o si el renglón que se reemplaza es el mismo.
 */
export function cantidadYaEnPedido(
  items: ItemRemitoEdicion[],
  productIdDestino: string,
  productIdOrigen?: string,
): number {
  return items
    .filter((i) => i.productId === productIdDestino && i.productId !== productIdOrigen)
    .reduce((acc, i) => acc + num(i.quantity), 0)
}
