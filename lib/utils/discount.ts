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

/**
 * Descuento que se pre-aplica al agregar un producto en oferta al carrito:
 * el % configurado en el producto, recortado al tope del vendedor.
 * undefined si el producto no tiene oferta (o el tope resultante es 0).
 */
export function initialItemDiscount(
  productDescuento: number | undefined,
  sellerMaxDiscount: number | undefined | null,
): number | undefined {
  if (!productDescuento || productDescuento <= 0) return undefined;
  const value = clampDiscount(productDescuento, effectiveDiscountMax(productDescuento, sellerMaxDiscount));
  return value > 0 ? value : undefined;
}

/** Recorta un descuento al rango [0, max]. */
export function clampDiscount(discount: number, max: number): number {
  return Math.max(0, Math.min(max, discount));
}
