// Lógica pura de ajustes posteriores a una venta (descuento / comisión).
// Sin dependencias de Supabase para poder testear el cálculo en aislamiento.

export type TipoDescuento = "percent" | "amount";

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Monto a descontar sobre el total de una venta.
 * - percent: % del total, tope 100% (descuento total permitido).
 * - amount: monto fijo, tope el total de la venta.
 */
export function calcularMontoDescuento(total: number, tipo: TipoDescuento, valor: number): number {
  const t = Number(total) || 0;
  const v = Number(valor) || 0;
  if (v <= 0 || t <= 0) return 0;
  const bruto = tipo === "percent" ? (t * Math.min(v, 100)) / 100 : Math.min(v, t);
  return round2(bruto);
}

/** Comisión que se descuenta al vendedor por un monto dado y su tasa (%). */
export function calcularComisionDescuento(monto: number, commissionRate: number): number {
  const m = Number(monto) || 0;
  const rate = Number(commissionRate) || 0;
  if (m <= 0 || rate <= 0) return 0;
  return round2(m * (rate / 100));
}
