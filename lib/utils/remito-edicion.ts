// Ediciones que el admin aplica sobre los items de un pedido antes de generar el remito:
// cantidad, descuento por producto, reemplazo de marca y exclusión.
//
// El resultado tiene que quedar con un renglón por producto. El caso que lo hace evidente es
// el reemplazo: si el pedido ya tenía 1 leche y se reemplaza otro producto por leche, el
// remito debe decir 2 leches en un solo renglón, no dos renglones de 1.
//
// Las ediciones se identifican por CLAVE DE LÍNEA (producto+precio+descuento) y no por
// productId: el mismo producto a dos precios queda en dos renglones a propósito, y cada uno
// se edita por separado.
//
// Lógica pura para poder testear el pipeline completo sin Supabase ni React.

import { consolidarItems, type ItemPedido } from './items-pedido'
import { claveLinea } from './clave-linea'

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
  // Las tres se indexan por CLAVE DE LÍNEA (ver clave-linea.ts); se acepta el productId
  // como clave para compatibilidad, pero la de línea tiene prioridad.
  /** Cantidad editada. */
  quantities?: Record<string, number>
  /** Reemplazo de marca. */
  replacements?: Record<string, ReemplazoProducto>
  /** Descuento (%). 0 lo quita. */
  discounts?: Record<string, number>
  /** Renglones que no se envían en este remito (clave de línea o productId). */
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

  // Una edición puede venir identificada por línea (producto+precio+descuento) o, para
  // compatibilidad, por productId. La de línea gana: es la más específica.
  const edicionDe = <T,>(registro: Record<string, T>, item: ItemRemitoEdicion): T | undefined =>
    registro[claveLinea(item)] ?? registro[item.productId]

  const conDescuento = (item: ItemRemitoEdicion, original: ItemRemitoEdicion): ItemRemitoEdicion => {
    const d = edicionDe(discounts, original)
    if (d == null) return item
    const pct = Math.min(100, Math.max(0, num(d)))
    const { itemDiscount: _omit, ...rest } = item
    return pct > 0 ? { ...rest, itemDiscount: pct } : { ...rest }
  }

  // Se parte de la lista consolidada: un pedido guardado con el producto repetido
  // (anterior a esta corrección) recibiría cada edición una vez por renglón.
  const editados = consolidarItems(items).map((item) => {
    const nuevaCant = edicionDe(quantities, item)
    const cant = nuevaCant != null && nuevaCant !== item.quantity
      ? ((huboCambioCantidad = true), nuevaCant)
      : item.quantity

    const r = edicionDe(replacements, item)
    if (!r) return conDescuento(cant !== item.quantity ? { ...item, quantity: cant } : item, item)

    return conDescuento({
      ...item,
      productId: r.productId,
      name: r.name,
      price: r.price,
      codigo: r.codigo,
      quantity: cant,
    }, item)
  })

  // Los excluidos se marcan sobre la lista ORIGINAL (antes de reemplazos), por eso se
  // resuelve contra la lista consolidada de entrada y no contra la ya editada.
  const filtrados = excludeProductIds.length > 0
    ? consolidarItems(items)
        .map((original, i) => ({ original, editado: editados[i] }))
        .filter(({ original }) =>
          !excludeProductIds.includes(claveLinea(original)) &&
          !excludeProductIds.includes(original.productId))
        .map(({ editado }) => editado)
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
