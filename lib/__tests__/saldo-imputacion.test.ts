import { describe, it, expect } from "vitest";
import { imputarADeuda, imputarFIFO } from "../utils/saldo-imputacion";

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
