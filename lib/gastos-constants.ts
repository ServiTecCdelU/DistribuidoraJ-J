// lib/gastos-constants.ts
// Categorías sugeridas para los selects de gastos (el campo es texto libre en BD).

export const CATEGORIAS_GASTO_FIJO = [
  "alquiler",
  "sueldos",
  "servicios",
  "impuestos",
  "seguros",
  "internet/telefonía",
  "otros",
] as const;

export const CATEGORIAS_GASTO_VARIABLE = [
  "combustible",
  "mantenimiento",
  "reparación",
  "mercadería",
  "fletes",
  "insumos",
  "otros",
] as const;

export function labelCategoria(cat?: string | null): string {
  if (!cat) return "Sin categoría";
  return cat.charAt(0).toUpperCase() + cat.slice(1);
}

// 'YYYY-MM' del mes actual.
export function periodoActual(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export interface VigenciaInput {
  activo: boolean;
  desde?: string | null; // 'YYYY-MM-DD'
  hasta?: string | null; // 'YYYY-MM-DD'
}

// Un gasto fijo cuenta en el mes 'YYYY-MM' si está activo y el mes cae dentro
// de su vigencia (desde/hasta opcionales). Misma regla que rentabilidad-service.
export function esGastoFijoVigente(g: VigenciaInput, periodo: string): boolean {
  if (!g.activo) return false;
  const [y, m] = periodo.split("-").map(Number);
  if (!y || !m) return false;
  const inicioMes = `${periodo}-01`;
  const finDia = new Date(y, m, 0).getDate();
  const finMes = `${periodo}-${String(finDia).padStart(2, "0")}`;
  if (g.desde && g.desde > finMes) return false;
  if (g.hasta && g.hasta < inicioMes) return false;
  return true;
}
