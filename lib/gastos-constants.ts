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
