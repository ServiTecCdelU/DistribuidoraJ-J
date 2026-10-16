// Aviso de pago atrasado del servicio: lo calcula ServiTec (GET /api/externo/estado-pago)
// con los meses que cargó como impagos; acá solo se muestra. Lógica pura.

export interface DeudaServicio {
  total: number;
  /** Períodos vencidos "YYYY-MM-01", del más viejo al más nuevo. */
  periodos: string[];
}

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** ["2026-08-01", "2026-09-01"] → "agosto y septiembre". */
export function mesesAdeudados(periodos: string[]): string {
  const meses = periodos.map((p) => MESES[Number(p.slice(5, 7)) - 1] ?? p);
  if (meses.length <= 1) return meses[0] ?? "";
  return `${meses.slice(0, -1).join(", ")} y ${meses[meses.length - 1]}`;
}

/** Valida la respuesta de ServiTec: cualquier cosa rara = sin aviso. */
export function leerDeuda(body: unknown): DeudaServicio | null {
  const data = (body as { data?: unknown } | null)?.data as Partial<DeudaServicio> | null | undefined;
  if (!data || typeof data.total !== "number" || data.total <= 0 || !Array.isArray(data.periodos)) return null;
  const periodos = data.periodos.filter((p): p is string => typeof p === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p));
  return periodos.length > 0 ? { total: data.total, periodos } : null;
}

/** Clave de localStorage: la ventana se muestra una vez por día. */
export function claveAvisoPago(ahora: Date): string {
  const dia = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}-${String(ahora.getDate()).padStart(2, "0")}`;
  return `avisoPago:${dia}`;
}
