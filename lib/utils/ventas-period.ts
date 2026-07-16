// Rango de fechas (ISO) para filtrar ventas en el servidor según el período elegido.
// "all" devuelve { from: null, to: null } → sin límite de fecha.
// "custom" usa dateFrom/dateTo (inclusive: desde 00:00:00, hasta 23:59:59.999).
export function periodRange(
  period: string,
  dateFrom?: string,
  dateTo?: string,
  now: Date = new Date(),
): { from: string | null; to: string | null } {
  let from: string | null = null;
  let to: string | null = null;

  if (period === "today") {
    const d = new Date(now); d.setHours(0, 0, 0, 0); from = d.toISOString();
  } else if (period === "week") {
    const d = new Date(now); d.setDate(d.getDate() - 7); d.setHours(0, 0, 0, 0); from = d.toISOString();
  } else if (period === "month") {
    from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  } else if (period === "year") {
    from = new Date(now.getFullYear(), 0, 1).toISOString();
  } else if (period === "custom") {
    // Parsear en hora local (no UTC) para que "Desde" y "Hasta" sean inclusive.
    if (dateFrom) { from = new Date(`${dateFrom}T00:00:00`).toISOString(); }
    if (dateTo) { to = new Date(`${dateTo}T23:59:59.999`).toISOString(); }
  }

  return { from, to };
}
