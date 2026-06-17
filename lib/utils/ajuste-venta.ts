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

export interface ItemDescuento {
  name: string;
  pct: number;
}

export interface DescuentoParseado {
  items: ItemDescuento[];
  motivo?: string;
  final?: string; // texto del descuento final (ej "Final -10%") si aplica
}

/**
 * Parsea la descripción de un movimiento [DESCUENTO]:
 *   "[DESCUENTO] #venta — Nombre -3%, Nombre -4% (motivo)"
 *   "[DESCUENTO] #venta — Final -10% (motivo)"
 * Devuelve los productos con su % de descuento, el motivo y, si fue un
 * descuento final, su texto.
 */
export function parseDescuentoDescripcion(description: string): DescuentoParseado {
  let s = (description ?? "").replace(/^\[DESCUENTO\]\s*/, "").replace(/^#?[\w-]*\s*—\s*/, "");
  let motivo: string | undefined;
  const m = s.match(/\(([^)]*)\)\s*$/);
  if (m && m.index != null) {
    motivo = m[1].trim();
    s = s.slice(0, m.index).trim();
  }
  const items: ItemDescuento[] = [];
  let final: string | undefined;
  for (const part of s.split(", ").map((p) => p.trim()).filter(Boolean)) {
    if (/^Final\b/i.test(part)) {
      final = part;
      continue;
    }
    const mm = part.match(/^(.+?)\s+-\s*(\d+(?:[.,]\d+)?)\s*%$/);
    if (mm) items.push({ name: mm[1].trim(), pct: Number(mm[2].replace(",", ".")) });
  }
  return { items, motivo, final };
}

/** Comisión que se descuenta al vendedor por un monto dado y su tasa (%). */
export function calcularComisionDescuento(monto: number, commissionRate: number): number {
  const m = Number(monto) || 0;
  const rate = Number(commissionRate) || 0;
  if (m <= 0 || rate <= 0) return 0;
  return round2(m * (rate / 100));
}
