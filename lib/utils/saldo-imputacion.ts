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
