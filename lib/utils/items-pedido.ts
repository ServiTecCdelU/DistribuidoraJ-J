// Consolidación de los items de un pedido.
//
// Un pedido debe tener un renglón por producto. Dos renglones del mismo producto rompen todo
// lo que se indexa por productId aguas abajo: ajustes de cobro, descuentos, cantidades
// editadas, exclusiones del remito y el chequeo de stock (ver remito R-2026-01782, donde la
// yerba quedó en dos líneas de 10 y una rotura de 10 borró las 20).
//
// El caso que las genera es el reemplazo de marca al armar el remito: si el producto elegido
// ya estaba en el pedido, queda repetido.

// Los campos numéricos admiten null: así vienen las filas de Supabase y los items que
// arma createOrder (`itemDiscount: ... ?? null`).
export interface ItemPedido {
  productId?: string
  quantity?: number | null
  price?: number | null
  regalo?: number | null
  itemDiscount?: number | null
  [key: string]: unknown
}

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Une en un solo renglón los items que son el mismo producto al mismo precio y con el mismo
 * descuento, sumando cantidad y regalo. Conserva el orden de aparición y los campos extra
 * del primer renglón.
 *
 * Un mismo producto cargado a distinto precio o con distinto descuento NO se fusiona: es una
 * decisión deliberada del vendedor y fusionarlos cambiaría lo que se le cobra al cliente.
 * Los items sin productId se dejan intactos (no hay forma de identificarlos).
 */
export function consolidarItems<T extends ItemPedido>(items: T[]): T[] {
  const resultado: T[] = []
  const indicePorClave = new Map<string, number>()

  for (const item of items) {
    if (!item.productId) {
      resultado.push(item)
      continue
    }

    const clave = `${item.productId}|${num(item.price)}|${num(item.itemDiscount)}`
    const existente = indicePorClave.get(clave)

    if (existente === undefined) {
      indicePorClave.set(clave, resultado.length)
      resultado.push(item)
      continue
    }

    const previo = resultado[existente]
    const regalo = num(previo.regalo) + num(item.regalo)
    resultado[existente] = {
      ...previo,
      quantity: num(previo.quantity) + num(item.quantity),
      ...(regalo > 0 ? { regalo } : {}),
    }
  }

  return resultado
}
