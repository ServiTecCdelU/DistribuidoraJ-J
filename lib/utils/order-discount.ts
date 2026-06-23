// Helpers puros para editar el descuento por producto de un pedido.
// La persistencia (Supabase) vive en services/orders-service.ts; acá queda la lógica pura
// para poder testearla sin tocar la BD ni React.

export interface ItemConDescuento {
  price: number;
  quantity: number;
  itemDiscount?: number;
  [key: string]: unknown;
}

/** Limita el porcentaje de descuento al rango [0, 100]; valores inválidos => 0. */
export function clampDescuento(valor: number): number {
  if (!Number.isFinite(valor)) return 0;
  return Math.min(100, Math.max(0, valor));
}

/**
 * Aplica los porcentajes editados (por índice) a los items, devolviendo un array NUEVO.
 * Si el % es > 0 se setea `itemDiscount`; si es 0 se quita la propiedad.
 */
export function aplicarDescuentosItems<T extends ItemConDescuento>(
  items: T[],
  descPorIndice: Record<number, number>,
): T[] {
  return items.map((it, i) => {
    const d = clampDescuento(Number(descPorIndice[i]) || 0);
    const { itemDiscount: _omit, ...rest } = it as ItemConDescuento;
    return (d > 0 ? { ...rest, itemDiscount: d } : { ...rest }) as T;
  });
}

/**
 * Subtotal del pedido con los descuentos por producto aplicados.
 * Si se pasa `descPorIndice` usa esos %; si no, usa el `itemDiscount` guardado en cada item.
 */
export function subtotalConDescuentos(
  items: ItemConDescuento[],
  descPorIndice?: Record<number, number>,
): number {
  return items.reduce((acc, it, i) => {
    const dto = descPorIndice ? clampDescuento(Number(descPorIndice[i]) || 0) : (it.itemDiscount ?? 0);
    const base = it.price * it.quantity;
    return acc + base - (dto ? (base * dto) / 100 : 0);
  }, 0);
}

/** Indica si los porcentajes editados difieren de los guardados en los items. */
export function hayCambiosDescuento(
  items: ItemConDescuento[],
  descPorIndice: Record<number, number>,
): boolean {
  return items.some((it, i) => clampDescuento(Number(descPorIndice[i]) || 0) !== (it.itemDiscount ?? 0));
}
