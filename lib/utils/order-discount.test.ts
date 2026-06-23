import { describe, it, expect } from "vitest";
import {
  clampDescuento,
  aplicarDescuentosItems,
  subtotalConDescuentos,
  hayCambiosDescuento,
  type ItemConDescuento,
} from "./order-discount";

const items: ItemConDescuento[] = [
  { name: "A", price: 100, quantity: 2 },
  { name: "B", price: 50, quantity: 1, itemDiscount: 10 },
];

describe("clampDescuento", () => {
  it("limita al rango 0-100", () => {
    expect(clampDescuento(150)).toBe(100);
    expect(clampDescuento(-5)).toBe(0);
    expect(clampDescuento(30)).toBe(30);
  });
  it("valores inválidos dan 0", () => {
    expect(clampDescuento(NaN)).toBe(0);
    expect(clampDescuento(Infinity)).toBe(0);
  });
});

describe("aplicarDescuentosItems", () => {
  it("setea itemDiscount cuando el % es > 0", () => {
    const out = aplicarDescuentosItems(items, { 0: 25, 1: 10 });
    expect(out[0].itemDiscount).toBe(25);
    expect(out[1].itemDiscount).toBe(10);
  });

  it("quita itemDiscount cuando el % es 0", () => {
    const out = aplicarDescuentosItems(items, { 0: 0, 1: 0 });
    expect("itemDiscount" in out[0]).toBe(false);
    expect("itemDiscount" in out[1]).toBe(false);
  });

  it("clampea porcentajes fuera de rango", () => {
    const out = aplicarDescuentosItems(items, { 0: 200, 1: -10 });
    expect(out[0].itemDiscount).toBe(100);
    expect("itemDiscount" in out[1]).toBe(false);
  });

  it("no muta los items originales", () => {
    aplicarDescuentosItems(items, { 0: 50 });
    expect(items[0].itemDiscount).toBeUndefined();
    expect(items[1].itemDiscount).toBe(10);
  });

  it("conserva las demás propiedades del item", () => {
    const out = aplicarDescuentosItems(items, { 0: 25 });
    expect(out[0].name).toBe("A");
    expect(out[0].price).toBe(100);
    expect(out[0].quantity).toBe(2);
  });
});

describe("subtotalConDescuentos", () => {
  it("usa el itemDiscount guardado cuando no se pasa mapa", () => {
    // A: 100*2 = 200 ; B: 50*1 con 10% = 45 ; total 245
    expect(subtotalConDescuentos(items)).toBe(245);
  });

  it("usa los % editados cuando se pasa el mapa", () => {
    // A: 200 con 50% = 100 ; B: 50 con 0% = 50 ; total 150
    expect(subtotalConDescuentos(items, { 0: 50, 1: 0 })).toBe(150);
  });

  it("sin descuentos devuelve el bruto", () => {
    expect(subtotalConDescuentos([{ price: 100, quantity: 3 }])).toBe(300);
  });
});

describe("hayCambiosDescuento", () => {
  it("detecta cambios respecto a lo guardado", () => {
    expect(hayCambiosDescuento(items, { 0: 0, 1: 20 })).toBe(true); // B pasa de 10 a 20
  });

  it("sin cambios devuelve false", () => {
    expect(hayCambiosDescuento(items, { 0: 0, 1: 10 })).toBe(false);
  });

  it("tratar índice ausente como 0", () => {
    expect(hayCambiosDescuento(items, { 1: 10 })).toBe(false); // 0 -> 0, 1 -> 10 (igual)
    expect(hayCambiosDescuento(items, {})).toBe(true); // B tenía 10, ahora 0
  });
});
