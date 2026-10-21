import { describe, it, expect } from "vitest";
import { recomputarSaldos } from "./saldo-imputacion";

describe("recomputarSaldos", () => {
  it("imputa los pagos sin deuda puntual en orden FIFO", () => {
    const saldos = recomputarSaldos(
      [{ id: "a", amount: 100 }, { id: "b", amount: 50 }],
      [{ monto: 120 }],
    );
    expect(saldos.get("a")).toBe(0);
    expect(saldos.get("b")).toBe(30);
  });

  it("imputa un pago puntual a su deuda aunque no sea la más vieja", () => {
    const saldos = recomputarSaldos(
      [{ id: "a", amount: 100 }, { id: "b", amount: 50 }],
      [{ monto: 50, debtId: "b" }],
    );
    expect(saldos.get("a")).toBe(100);
    expect(saldos.get("b")).toBe(0);
  });

  it("el sobrante de una devolución a una boleta ya cancelada pasa a las siguientes", () => {
    const saldos = recomputarSaldos(
      [{ id: "a", amount: 100 }, { id: "b", amount: 80 }],
      [{ monto: 100 }, { monto: 30, debtId: "a" }],
    );
    expect(saldos.get("a")).toBe(0);
    expect(saldos.get("b")).toBe(50);
  });

  it("el excedente sobre todas las deudas no deja saldos negativos", () => {
    const saldos = recomputarSaldos([{ id: "a", amount: 100 }], [{ monto: 150, debtId: "a" }]);
    expect(saldos.get("a")).toBe(0);
  });
});
