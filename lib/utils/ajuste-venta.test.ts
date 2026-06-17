import { describe, it, expect } from "vitest";
import {
  calcularMontoDescuento,
  calcularComisionDescuento,
  parseDescuentoDescripcion,
} from "./ajuste-venta";

describe("calcularMontoDescuento", () => {
  it("calcula un porcentaje del total", () => {
    expect(calcularMontoDescuento(1000, "percent", 10)).toBe(100);
  });

  it("permite el 100% (descuento total)", () => {
    expect(calcularMontoDescuento(1000, "percent", 100)).toBe(1000);
  });

  it("topea el porcentaje en 100", () => {
    expect(calcularMontoDescuento(1000, "percent", 150)).toBe(1000);
  });

  it("aplica un monto fijo", () => {
    expect(calcularMontoDescuento(1000, "amount", 250)).toBe(250);
  });

  it("topea el monto fijo en el total", () => {
    expect(calcularMontoDescuento(1000, "amount", 5000)).toBe(1000);
  });

  it("devuelve 0 con valores no positivos", () => {
    expect(calcularMontoDescuento(1000, "percent", 0)).toBe(0);
    expect(calcularMontoDescuento(0, "amount", 100)).toBe(0);
    expect(calcularMontoDescuento(1000, "amount", -50)).toBe(0);
  });

  it("redondea a 2 decimales", () => {
    expect(calcularMontoDescuento(333.33, "percent", 33)).toBe(110);
  });
});

describe("calcularComisionDescuento", () => {
  it("calcula la comisión sobre el monto", () => {
    expect(calcularComisionDescuento(1000, 10)).toBe(100);
  });

  it("devuelve 0 sin tasa o sin monto", () => {
    expect(calcularComisionDescuento(1000, 0)).toBe(0);
    expect(calcularComisionDescuento(0, 10)).toBe(0);
  });

  it("redondea a 2 decimales", () => {
    expect(calcularComisionDescuento(333.33, 7)).toBe(23.33);
  });
});

describe("parseDescuentoDescripcion", () => {
  it("parsea descuentos por producto", () => {
    const r = parseDescuentoDescripcion(
      "[DESCUENTO] #N222-16-06-2026 — AC PLUSBELLE 1LT HIDRATACION -3%, AC SEDAL X 190 ML CREM BALANCE -1%",
    );
    expect(r.items).toEqual([
      { name: "AC PLUSBELLE 1LT HIDRATACION", pct: 3 },
      { name: "AC SEDAL X 190 ML CREM BALANCE", pct: 1 },
    ]);
    expect(r.motivo).toBeUndefined();
    expect(r.final).toBeUndefined();
  });

  it("extrae el motivo entre paréntesis al final", () => {
    const r = parseDescuentoDescripcion("[DESCUENTO] #N1 — Coca 2L -10% (mal estado)");
    expect(r.items).toEqual([{ name: "Coca 2L", pct: 10 }]);
    expect(r.motivo).toBe("mal estado");
  });

  it("detecta descuento final", () => {
    const r = parseDescuentoDescripcion("[DESCUENTO] #N1 — Final -10%");
    expect(r.items).toHaveLength(0);
    expect(r.final).toBe("Final -10%");
  });
});
