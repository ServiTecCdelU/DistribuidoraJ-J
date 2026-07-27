import { describe, it, expect } from "vitest";
import { imputarADeuda, imputarFIFO, recomputarSaldos } from "../utils/saldo-imputacion";

describe("imputarADeuda", () => {
  it("baja el saldo por el monto imputado", () => {
    expect(imputarADeuda(1000, 300)).toBe(700);
  });

  it("nunca deja saldo negativo aunque el monto supere la deuda", () => {
    expect(imputarADeuda(500, 800)).toBe(0);
  });

  it("cancela exacto a 0", () => {
    expect(imputarADeuda(1000, 1000)).toBe(0);
  });

  it("limpia residuo de coma flotante a 0", () => {
    // 46451.01 - 46451.01 puede dejar un residuo ínfimo (ej. 7.27e-12)
    expect(imputarADeuda(46451.01, 46451.01)).toBe(0);
    expect(imputarADeuda(0.1 + 0.2, 0.3)).toBe(0);
  });
});

describe("imputarFIFO", () => {
  it("aplica a la deuda más antigua primero", () => {
    const deudas = [
      { id: "d1", saldo: 400 },
      { id: "d2", saldo: 600 },
    ];
    expect(imputarFIFO(deudas, 300)).toEqual([{ id: "d1", nuevoSaldo: 100 }]);
  });

  it("desborda al siguiente cuando cancela la primera", () => {
    const deudas = [
      { id: "d1", saldo: 400 },
      { id: "d2", saldo: 600 },
    ];
    expect(imputarFIFO(deudas, 500)).toEqual([
      { id: "d1", nuevoSaldo: 0 },
      { id: "d2", nuevoSaldo: 500 },
    ]);
  });

  it("no genera saldo a favor si el monto supera todas las deudas", () => {
    const deudas = [{ id: "d1", saldo: 200 }];
    expect(imputarFIFO(deudas, 1000)).toEqual([{ id: "d1", nuevoSaldo: 0 }]);
  });

  it("saltea deudas ya canceladas (saldo 0)", () => {
    const deudas = [
      { id: "d1", saldo: 0 },
      { id: "d2", saldo: 300 },
    ];
    expect(imputarFIFO(deudas, 100)).toEqual([{ id: "d2", nuevoSaldo: 200 }]);
  });

  it("limpia residuo de coma flotante al cancelar la primera deuda", () => {
    const deudas = [
      { id: "d1", saldo: 46451.01 },
      { id: "d2", saldo: 100 },
    ];
    expect(imputarFIFO(deudas, 46451.01)).toEqual([{ id: "d1", nuevoSaldo: 0 }]);
  });

  it("no toca deudas si el monto es 0", () => {
    const deudas = [{ id: "d1", saldo: 300 }];
    expect(imputarFIFO(deudas, 0)).toEqual([]);
  });

  it("devuelve solo las deudas que cambian, sin mutar la entrada", () => {
    const deudas = [
      { id: "d1", saldo: 100 },
      { id: "d2", saldo: 100 },
    ];
    const r = imputarFIFO(deudas, 50);
    expect(r).toEqual([{ id: "d1", nuevoSaldo: 50 }]);
    expect(deudas[0].saldo).toBe(100); // no mutó
  });
});

describe("recomputarSaldos", () => {
  const saldoTotal = (m: Map<string, number>) =>
    [...m.values()].reduce((a, s) => a + s, 0);

  it("cada deuda arranca en su monto y el pago se imputa FIFO", () => {
    const deudas = [
      { id: "d1", amount: 100 },
      { id: "d2", amount: 50 },
    ];
    const r = recomputarSaldos(deudas, [{ monto: 120 }]);
    expect(r.get("d1")).toBe(0);
    expect(r.get("d2")).toBe(30);
  });

  it("mantiene la invariante Σsaldo = Σdeuda − Σpagos con varios pagos", () => {
    const deudas = [
      { id: "d1", amount: 100 },
      { id: "d2", amount: 50 },
    ];
    const r = recomputarSaldos(deudas, [{ monto: 70 }, { monto: 60 }]);
    expect(saldoTotal(r)).toBe(20); // 150 - 130
  });

  it("imputa a la boleta puntual cuando el pago trae debtId", () => {
    const deudas = [
      { id: "d1", amount: 100 },
      { id: "d2", amount: 50 },
    ];
    const r = recomputarSaldos(deudas, [{ monto: 50, debtId: "d2" }]);
    expect(r.get("d1")).toBe(100);
    expect(r.get("d2")).toBe(0);
  });

  it("no deja residuo cuando un pago no cabía en las boletas 'del momento' pero sí en el total (bug raíz)", () => {
    // Escenario Dominguez/VILLAGRAN: un pago (retroactivo o devolución) que en el
    // camino incremental habría descartado excedente contra las boletas abiertas
    // de ese instante. Con replay todas coexisten y no queda saldo inflado.
    const deudas = [
      { id: "vieja", amount: 40 },
      { id: "nueva", amount: 100 },
    ];
    // El pago de 40 corresponde a "nueva" pero entra antes en la cronología.
    const r = recomputarSaldos(deudas, [
      { monto: 40 }, // FIFO: cancela "vieja"
      { monto: 100 }, // FIFO: cancela "nueva"
    ]);
    expect(saldoTotal(r)).toBe(0);
    expect(r.get("vieja")).toBe(0);
    expect(r.get("nueva")).toBe(0);
  });

  it("descarta el excedente que supera todas las deudas (crédito a favor vive en el global)", () => {
    const deudas = [{ id: "d1", amount: 100 }];
    const r = recomputarSaldos(deudas, [{ monto: 150 }]);
    expect(r.get("d1")).toBe(0);
    expect(saldoTotal(r)).toBe(0);
  });

  it("un pago puntual a una boleta ya cancelada no la vuelve negativa", () => {
    const deudas = [{ id: "d1", amount: 100 }];
    const r = recomputarSaldos(deudas, [
      { monto: 100, debtId: "d1" },
      { monto: 100, debtId: "d1" },
    ]);
    expect(r.get("d1")).toBe(0);
  });

  it("es idempotente: recalcula igual sin importar cuántas veces se corra", () => {
    const deudas = [
      { id: "d1", amount: 100 },
      { id: "d2", amount: 200 },
    ];
    const pagos = [{ monto: 150 }, { monto: 90, debtId: "d2" }];
    const r1 = recomputarSaldos(deudas, pagos);
    const r2 = recomputarSaldos(deudas, pagos);
    expect([...r1.entries()]).toEqual([...r2.entries()]);
  });
});
