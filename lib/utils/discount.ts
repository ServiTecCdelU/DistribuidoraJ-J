// lib/utils/discount.ts
// Tope de descuento por producto combinado con el tope configurado por vendedor.

/**
 * Máximo de descuento (%) que se puede aplicar a un producto:
 * - Producto en promoción (`productDescuento` > 0): la promo la configura el
 *   admin, así que vale para cualquier vendedor sin importar su tope propio.
 * - Producto sin promoción: el tope del perfil del vendedor
 *   (`sellerMaxDiscount`, undefined = sin vendedor asignado → 100%).
 */
export function effectiveDiscountMax(
  productDescuento: number | undefined,
  sellerMaxDiscount: number | undefined | null,
): number {
  if ((productDescuento ?? 0) > 0) return Math.min(100, productDescuento as number);
  return sellerMaxDiscount != null ? sellerMaxDiscount : 100;
}

/**
 * Descuento que se pre-aplica al agregar un producto en promoción al carrito:
 * el % configurado en el producto. undefined si el producto no tiene promo.
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
