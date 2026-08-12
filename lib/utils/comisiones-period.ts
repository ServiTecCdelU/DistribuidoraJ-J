// Rango de fechas para filtrar comisiones en el cliente.
// Se usa en app/comisiones. Todos los rangos son inclusivos y en hora local,
// para que los números coincidan exactamente con lo que se ve en Ventas.

export type ComisionPeriodMode = 'month' | 'day' | 'custom'

export interface DateRange {
  from: Date
  to: Date
}

const startOfDay = (d: Date): Date =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)

const endOfDay = (d: Date): Date =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)

/** Mes completo que contiene a `date` (del 1 a fin de mes). */
export function monthRange(date: Date): DateRange {
  const from = new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0)
  const to = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999)
  return { from, to }
}

/** Día completo de `date`. */
export function dayRange(date: Date): DateRange {
  return { from: startOfDay(date), to: endOfDay(date) }
}

/** Rango a partir de dos fechas `YYYY-MM-DD` (inclusive). Si falta una, se usa la otra. */
export function customRange(dateFrom: string, dateTo: string): DateRange | null {
  if (!dateFrom && !dateTo) return null
  const from = dateFrom ? new Date(`${dateFrom}T00:00:00`) : new Date(`${dateTo}T00:00:00`)
  const to = dateTo ? new Date(`${dateTo}T23:59:59.999`) : new Date(`${dateFrom}T23:59:59.999`)
  return { from, to }
}

/** Suma `delta` meses manteniendo el día 1 (evita el corrimiento del 31). */
export function shiftMonth(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1)
}

export function isInRange(date: Date, range: DateRange | null): boolean {
  if (!range) return true
  const t = date.getTime()
  return t >= range.from.getTime() && t <= range.to.getTime()
}

export function filterByRange<T extends { createdAt: Date }>(
  items: T[],
  range: DateRange | null,
): T[] {
  if (!range) return items
  return items.filter((i) => isInRange(i.createdAt, range))
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

/** Ej: "agosto 2026" */
export function monthLabel(date: Date): string {
  return `${MESES[date.getMonth()]} ${date.getFullYear()}`
}

/** `YYYY-MM-DD` en hora local (para inputs type="date"). */
export function toInputDate(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${m}-${d}`
}
