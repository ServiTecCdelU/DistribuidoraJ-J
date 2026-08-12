// Lógica pura de la suscripción del sistema (plan, meses pagados, deuda).
// Sin acceso a red ni a Supabase: fácil de testear y reutilizable desde la API.

export type EstadoSuscripcion = "activo" | "suspendido" | "cancelado";
export type EstadoPago = "pagado" | "pendiente";

export interface PagoSuscripcion {
  id: string;
  periodo: string; // 'YYYY-MM'
  monto: number;
  fechaPago?: string | null; // 'YYYY-MM-DD'
  metodo?: string | null;
  comprobante?: string | null;
  estado: EstadoPago;
  notas?: string | null;
}

export interface DatosSuscripcion {
  montoMensual: number;
  sucursales: number;
  diaVencimiento: number;
  fechaInicio?: string | null; // 'YYYY-MM-DD'
  estado: EstadoSuscripcion;
}

export const PLANES = [
  { value: "basico", label: "Básico" },
  { value: "pro", label: "Pro" },
  { value: "enterprise", label: "Enterprise" },
] as const;

export const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export function periodoDe(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function labelPeriodo(periodo: string): string {
  const [year, month] = periodo.split("-").map(Number);
  return `${MESES[(month || 1) - 1]} ${year}`;
}

/** Lista de periodos 'YYYY-MM' desde `desde` hasta `hasta`, ambos inclusive. */
export function periodosEntre(desde: string, hasta: string): string[] {
  const [yd, md] = desde.split("-").map(Number);
  const [yh, mh] = hasta.split("-").map(Number);
  if (!yd || !md || !yh || !mh) return [];

  const periodos: string[] = [];
  let y = yd;
  let m = md;
  while (y < yh || (y === yh && m <= mh)) {
    periodos.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return periodos;
}

/** Monto que corresponde por mes según plan y cantidad de sucursales. */
export function montoPorPeriodo(datos: DatosSuscripcion): number {
  return datos.montoMensual * Math.max(1, datos.sucursales);
}

export interface ResumenSuscripcion {
  periodoActual: string;
  periodosFacturables: string[];
  periodosPagados: string[];
  periodosAdeudados: string[];
  mesesPagados: number;
  mesesAdeudados: number;
  totalPagado: number;
  deuda: number;
  alDia: boolean;
  ultimoPago: PagoSuscripcion | null;
  proximoVencimiento: string | null; // 'YYYY-MM-DD'
}

/**
 * Resume el estado de cuenta de la suscripción.
 * Se factura desde el mes de inicio hasta el mes actual, ambos inclusive.
 */
export function resumirSuscripcion(
  datos: DatosSuscripcion,
  pagos: PagoSuscripcion[],
  hoy: Date = new Date(),
): ResumenSuscripcion {
  const periodoActual = periodoDe(hoy);
  const inicio = datos.fechaInicio ? datos.fechaInicio.slice(0, 7) : periodoActual;
  const periodosFacturables = inicio > periodoActual ? [] : periodosEntre(inicio, periodoActual);

  const pagados = pagos.filter((p) => p.estado === "pagado");
  const periodosPagados = pagados.map((p) => p.periodo);
  const setPagados = new Set(periodosPagados);

  const periodosAdeudados = periodosFacturables.filter((p) => !setPagados.has(p));
  const monto = montoPorPeriodo(datos);
  const totalPagado = pagados.reduce((acc, p) => acc + p.monto, 0);

  const ultimoPago = pagados
    .slice()
    .sort((a, b) => b.periodo.localeCompare(a.periodo))[0] ?? null;

  const [y, m] = periodoActual.split("-").map(Number);
  const dia = String(Math.min(28, Math.max(1, datos.diaVencimiento || 10))).padStart(2, "0");
  const vencimientoMesActual = `${y}-${String(m).padStart(2, "0")}-${dia}`;
  const proximoVencimiento = setPagados.has(periodoActual)
    ? siguientePeriodoVencimiento(y, m, dia)
    : vencimientoMesActual;

  return {
    periodoActual,
    periodosFacturables,
    periodosPagados,
    periodosAdeudados,
    mesesPagados: pagados.length,
    mesesAdeudados: periodosAdeudados.length,
    totalPagado,
    deuda: periodosAdeudados.length * monto,
    alDia: periodosAdeudados.length === 0,
    ultimoPago,
    proximoVencimiento,
  };
}

function siguientePeriodoVencimiento(year: number, month: number, dia: string): string {
  const y = month === 12 ? year + 1 : year;
  const m = month === 12 ? 1 : month + 1;
  return `${y}-${String(m).padStart(2, "0")}-${dia}`;
}
