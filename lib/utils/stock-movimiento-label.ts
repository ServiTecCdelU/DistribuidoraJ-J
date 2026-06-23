// Clasifica un movimiento de stock para mostrarlo claro en el historial del producto.
// Los rechazos y devoluciones se guardan como tipo 'ajuste'; se distinguen por el motivo.

export interface MovimientoBadge {
  label: string;
  className: string;
}

const BASE: Record<string, MovimientoBadge> = {
  venta: { label: "Venta", className: "bg-blue-100 text-blue-700 border-blue-200" },
  regalo: { label: "Regalo", className: "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200" },
  apertura_bulto: { label: "Ingreso", className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  ajuste: { label: "Ajuste", className: "bg-amber-100 text-amber-700 border-amber-200" },
  rotura: { label: "Rotura", className: "bg-rose-100 text-rose-700 border-rose-200" },
};

export function badgeDeMovimiento(tipo: string, motivo: string | null): MovimientoBadge {
  if (tipo === "ajuste" && motivo) {
    if (/^rechazo/i.test(motivo)) {
      return { label: "Rechazo", className: "bg-rose-100 text-rose-700 border-rose-200" };
    }
    if (/eliminaci[oó]n remito|devoluci[oó]n|faltante/i.test(motivo)) {
      return { label: "Devolución", className: "bg-orange-100 text-orange-700 border-orange-200" };
    }
  }
  return BASE[tipo] ?? { label: tipo, className: "bg-gray-100 text-gray-700 border-gray-200" };
}
