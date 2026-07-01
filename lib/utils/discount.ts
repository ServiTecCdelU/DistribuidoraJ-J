// lib/utils/discount.ts
// Tope de descuento por producto combinado con el tope configurado por vendedor.

/**
 * Máximo de descuento (%) que se puede aplicar a un producto, combinando:
 * - el máximo del producto (`productDescuento`, 0 = libre hasta 100%)
 * - el tope configurado en el perfil del vendedor (`sellerMaxDiscount`,
 *   undefined = sin vendedor asignado / sin tope propio → 100%)
 */
export function effectiveDiscountMax(
  productDescuento: number | undefined,
  sellerMaxDiscount: number | undefined | null,
): number {
  const productMax = (productDescuento ?? 0) > 0 ? (productDescuento as number) : 100;
  const sellerCap = sellerMaxDiscount != null ? sellerMaxDiscount : 100;
  return Math.min(productMax, sellerCap);
}

/** Recorta un descuento al rango [0, max]. */
export function clampDiscount(discount: number, max: number): number {
  return Math.max(0, Math.min(max, discount));
}
