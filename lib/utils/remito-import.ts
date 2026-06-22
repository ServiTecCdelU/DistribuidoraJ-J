// Helpers puros del ingreso de stock por remito de proveedor.
// La lógica acoplada a Supabase vive en services/mayorista-service.ts (habilitarDesdeRemito);
// acá quedan las decisiones puras para poder testearlas sin tocar la BD.

export type AccionRemito = "reactivar" | "crear";

/**
 * Precio de venta a partir del precio de lista (compra) y la ganancia global (%).
 * Si no hay ganancia o el precio de lista no es válido, se usa el precio de lista tal cual.
 */
export function calcularPrecioVentaRemito(precioLista: number, ganancia?: number | null): number {
  if (ganancia != null && !isNaN(ganancia) && precioLista > 0) {
    return Math.round(precioLista * (1 + ganancia / 100) * 100) / 100;
  }
  return precioLista;
}

/**
 * Si la ficha del producto ya existe se reactiva (disabled=false sin pisar datos);
 * si no existe, se crea.
 */
export function resolverAccionFicha(fichaExiste: boolean): AccionRemito {
  return fichaExiste ? "reactivar" : "crear";
}

/**
 * Un renglón del remito es procesable si tiene ficha matcheada en `productos`
 * o un registro en `mayorista_productos` (mpId) con el que crear/habilitar la ficha.
 */
export function esItemProcesable(args: { tieneFicha: boolean; tieneMayorista: boolean }): boolean {
  return args.tieneFicha || args.tieneMayorista;
}

/**
 * Indica si, al confirmar el remito, el renglón implica habilitar un producto:
 * porque su registro mayorista está deshabilitado, o porque hay que crear la ficha.
 */
export function necesitaHabilitar(args: { tieneFicha: boolean; tieneMayorista: boolean; mayoristaHabilitado: boolean }): boolean {
  if (!args.tieneMayorista) return false;
  if (!args.tieneFicha) return true; // se creará la ficha
  return args.mayoristaHabilitado === false; // ficha existe pero estaba deshabilitada
}

/** Stock resultante tras el ingreso (nunca negativo de base). */
export function stockResultante(stockActual: number, cantidad: number): number {
  return Math.max(0, stockActual) + cantidad;
}

/** ID de ficha de producto para un código mayorista: usa el existente o deriva `prod_{mpId}`. */
export function resolverProductoId(productoIdExistente: string | null | undefined, mpId: string): string {
  return productoIdExistente ?? `prod_${mpId}`;
}
