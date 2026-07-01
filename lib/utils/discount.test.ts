import { describe, it, expect } from "vitest";
import { effectiveDiscountMax, clampDiscount } from "./discount";

describe("effectiveDiscountMax", () => {
  it("sin tope de producto ni de vendedor permite hasta 100%", () => {
    expect(effectiveDiscountMax(0, undefined)).toBe(100);
    expect(effectiveDiscountMax(undefined, null)).toBe(100);
  });

  it("respeta el tope del producto cuando no hay tope de vendedor", () => {
    expect(effectiveDiscountMax(15, undefined)).toBe(15);
  });

  it("aplica el tope del vendedor cuando es menor que el del producto", () => {
    expect(effectiveDiscountMax(15, 6)).toBe(6);
  });

  it("aplica el tope del producto cuando es menor que el del vendedor", () => {
    expect(effectiveDiscountMax(5, 6)).toBe(5);
  });

  it("tope de vendedor limita productos sin máximo propio", () => {
    expect(effectiveDiscountMax(0, 6)).toBe(6);
  });

  it("tope de vendedor 0 bloquea todo descuento", () => {
    expect(effectiveDiscountMax(20, 0)).toBe(0);
  });
});

describe("clampDiscount", () => {
  it("recorta al máximo permitido", () => {
    expect(clampDiscount(10, 6)).toBe(6);
  });

  it("nunca devuelve negativo", () => {
    expect(clampDiscount(-5, 6)).toBe(0);
  });

  it("deja pasar valores dentro del rango", () => {
    expect(clampDiscount(4, 6)).toBe(4);
  });
});
