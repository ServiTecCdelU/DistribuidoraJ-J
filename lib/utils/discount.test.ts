import { describe, it, expect } from "vitest";
import { effectiveDiscountMax, clampDiscount, initialItemDiscount } from "./discount";

describe("initialItemDiscount", () => {
  it("pre-aplica el % de oferta del producto", () => {
    expect(initialItemDiscount(15, undefined)).toBe(15);
  });

  it("la promo no se recorta al tope del vendedor", () => {
    expect(initialItemDiscount(15, 6)).toBe(15);
    expect(initialItemDiscount(99.99, 6)).toBe(99.99);
  });

  it("sin oferta no aplica descuento", () => {
    expect(initialItemDiscount(0, 10)).toBeUndefined();
    expect(initialItemDiscount(undefined, undefined)).toBeUndefined();
  });

  it("tope de vendedor 0 igual aplica la promo", () => {
    expect(initialItemDiscount(20, 0)).toBe(20);
  });
});

describe("effectiveDiscountMax", () => {
  it("sin tope de producto ni de vendedor permite hasta 100%", () => {
    expect(effectiveDiscountMax(0, undefined)).toBe(100);
    expect(effectiveDiscountMax(undefined, null)).toBe(100);
  });

  it("respeta el tope del producto cuando no hay tope de vendedor", () => {
    expect(effectiveDiscountMax(15, undefined)).toBe(15);
  });

  it("producto en promo: el máximo es la promo aunque el vendedor tenga tope menor", () => {
    expect(effectiveDiscountMax(15, 6)).toBe(15);
  });

  it("aplica el tope del producto cuando es menor que el del vendedor", () => {
    expect(effectiveDiscountMax(5, 6)).toBe(5);
  });

  it("tope de vendedor limita productos sin máximo propio", () => {
    expect(effectiveDiscountMax(0, 6)).toBe(6);
  });

  it("tope de vendedor 0 bloquea descuentos fuera de promo", () => {
    expect(effectiveDiscountMax(0, 0)).toBe(0);
    expect(effectiveDiscountMax(20, 0)).toBe(20);
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
