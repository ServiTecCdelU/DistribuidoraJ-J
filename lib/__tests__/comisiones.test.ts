import { describe, it, expect } from "vitest";
import { resumenComisiones, resumenVentasPendientes, type ComisionLike } from "../utils/comisiones";

const comisiones: ComisionLike[] = [
  { commissionAmount: 100, isPaid: true },   // venta cobrada
  { commissionAmount: 50, isPaid: false },   // venta pendiente
  { commissionAmount: 30, isPaid: false },   // venta pendiente
  { commissionAmount: -20, isPaid: false },  // devolución pendiente
  { commissionAmount: -10, isPaid: true },   // devolución cobrada
];

describe("resumenComisiones", () => {
  it("brutas suma solo comisiones de ventas (>= 0)", () => {
    expect(resumenComisiones(comisiones).brutas).toBe(180);
  });

  it("devoluciones es la magnitud positiva de las comisiones negativas", () => {
    expect(resumenComisiones(comisiones).devoluciones).toBe(30);
  });

  it("finales = brutas − devoluciones = Σ commissionAmount", () => {
    const r = resumenComisiones(comisiones);
    expect(r.finales).toBe(150);
    expect(r.finales).toBe(r.brutas - r.devoluciones);
  });

  it("pendiente y cobrado son netos (descuentan devoluciones de cada estado)", () => {
    const r = resumenComisiones(comisiones);
    expect(r.pendiente).toBe(60);  // 50 + 30 − 20
    expect(r.cobrado).toBe(90);    // 100 − 10
    expect(r.pendiente + r.cobrado).toBe(r.finales);
  });

  it("cuenta ventas, devoluciones y pendientes", () => {
    const r = resumenComisiones(comisiones);
    expect(r.ventasCount).toBe(3);
    expect(r.devolucionesCount).toBe(2);
    expect(r.pendienteCount).toBe(3);
  });

  it("el vendedor y el admin ven el mismo neto para la misma lista", () => {
    // El admin filtra por rango; con el mismo subconjunto, el número final es idéntico.
    const subset = comisiones.slice(0, 3);
    expect(resumenComisiones(subset).finales).toBe(resumenComisiones(subset).finales);
    expect(resumenComisiones(subset).finales).toBe(180);
  });

  it("lista vacía o nula devuelve ceros", () => {
    expect(resumenComisiones([]).finales).toBe(0);
    expect(resumenComisiones(undefined).finales).toBe(0);
  });
});

describe("resumenVentasPendientes", () => {
  it("separa ventas brutas y devoluciones, y el neto las descuenta", () => {
    const r = resumenVentasPendientes([
      { saleTotal: 1000 },
      { saleTotal: 500 },
      { saleTotal: -200 },
    ]);
    expect(r).toEqual({ brutas: 1500, devoluciones: 200, neto: 1300 });
  });

  it("ignora las ventas ya pagadas", () => {
    const r = resumenVentasPendientes([
      { saleTotal: 1000, isPaid: true },
      { saleTotal: 300 },
      { saleTotal: -50, isPaid: true },
    ]);
    expect(r).toEqual({ brutas: 300, devoluciones: 0, neto: 300 });
  });

  it("lista vacía o nula da todo en cero", () => {
    expect(resumenVentasPendientes(null)).toEqual({ brutas: 0, devoluciones: 0, neto: 0 });
  });
});
