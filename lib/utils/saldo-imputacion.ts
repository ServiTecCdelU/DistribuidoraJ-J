// Lógica pura de imputación de pagos/devoluciones a saldos de deudas (remitos).
// Un saldo nunca puede quedar negativo. El sobrante de un pago/devolución que
// excede las deudas no genera saldo a favor acá (queda como crédito en current_balance).

export type DeudaSaldo = {
  id: string;
  saldo: number;
};

export type ImputacionUpdate = {
  id: string;
  nuevoSaldo: number;
};

// Tolerancia para residuos de coma flotante: un saldo por debajo de este umbral
// se considera cancelado (0). Evita que restas como 46451.01 - 46451.01 dejen
// residuos ínfimos (ej. 7.27e-12) que hacen figurar una deuda como pendiente.
export const SALDO_EPSILON = 0.01;

// Redondea a 0 los residuos de coma flotante por debajo de SALDO_EPSILON.
function limpiarResiduo(saldo: number): number {
  return saldo < SALDO_EPSILON ? 0 : saldo;
}

// Imputa `monto` a una deuda puntual. Devuelve el nuevo saldo (nunca < 0).
export function imputarADeuda(saldoActual: number, monto: number): number {
  return limpiarResiduo(Math.max(0, saldoActual - monto));
}

// Imputa `monto` a una lista de deudas en orden FIFO (la lista debe venir ya
// ordenada: más antigua primero). Devuelve solo las deudas que cambian, con su
// nuevo saldo. No modifica las deudas de entrada.
export function imputarFIFO(
  deudas: ReadonlyArray<DeudaSaldo>,
  monto: number,
): ImputacionUpdate[] {
  const updates: ImputacionUpdate[] = [];
  let restante = monto;
  for (const d of deudas) {
    if (restante <= 0) break;
    const saldo = Number(d.saldo) || 0;
    if (saldo <= 0) continue;
    const aplicado = Math.min(saldo, restante);
    updates.push({ id: d.id, nuevoSaldo: limpiarResiduo(saldo - aplicado) });
    restante -= aplicado;
  }
  return updates;
}

export type DeudaOriginal = {
  id: string;
  amount: number;
};

export type PagoImputacion = {
  monto: number;
  // Si viene, el pago se imputa a ESA deuda puntual; si no, FIFO.
  debtId?: string;
};

// Recalcula desde cero el saldo de todas las deudas replayeando los pagos.
// Cada deuda arranca en su monto original y se le aplican los pagos en el orden
// recibido (que debe ser cronológico). A diferencia de imputar un pago suelto
// contra las deudas abiertas "en ese momento", acá TODAS las deudas coexisten,
// así que un pago retroactivo o previo a su venta se imputa igual y no deja
// residuos inflados. El excedente que supera todas las deudas es crédito a favor
// y se descarta del detalle por-boleta (vive en current_balance).
// `deudas` debe venir en orden FIFO (más antigua primero) para los pagos sin debtId.
export function recomputarSaldos(
  deudas: ReadonlyArray<DeudaOriginal>,
  pagos: ReadonlyArray<PagoImputacion>,
): Map<string, number> {
  const saldos = new Map<string, number>();
  for (const d of deudas) {
    saldos.set(d.id, limpiarResiduo(Math.max(0, Number(d.amount) || 0)));
  }
  for (const p of pagos) {
    if (p.debtId && saldos.has(p.debtId)) {
      saldos.set(p.debtId, imputarADeuda(saldos.get(p.debtId)!, p.monto));
      continue;
    }
    let restante = p.monto;
    for (const d of deudas) {
      if (restante <= 0) break;
      const saldo = saldos.get(d.id)!;
      if (saldo <= 0) continue;
      const aplicado = Math.min(saldo, restante);
      saldos.set(d.id, limpiarResiduo(saldo - aplicado));
      restante -= aplicado;
    }
  }
  return saldos;
}
