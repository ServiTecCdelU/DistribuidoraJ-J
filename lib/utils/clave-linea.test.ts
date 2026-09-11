import { describe, it, expect } from "vitest";
import { claveLinea, clavesDeLineas, type LineaIdentificable } from "./clave-linea";

const linea = (productId: string, price: number, itemDiscount?: number): LineaIdentificable =>
  ({ productId, price, ...(itemDiscount != null ? { itemDiscount } : {}) });

describe("claveLinea", () => {
  it("identifica un renglón por producto, precio y descuento", () => {
    expect(claveLinea(linea("a", 100))).toBe("a|100|0");
  });

  it("incluye el descuento para distinguir renglones", () => {
    expect(claveLinea(linea("a", 100, 10))).toBe("a|100|10");
  });

  // El caso del #4b: el mismo producto cargado a dos precios distintos son dos
  // renglones legítimos y cada uno tiene que poder editarse por separado.
  it("distingue el mismo producto a distinto precio", () => {
    expect(claveLinea(linea("a", 100))).not.toBe(claveLinea(linea("a", 90)));
  });

  it("distingue el mismo producto con distinto descuento", () => {
    expect(claveLinea(linea("a", 100, 0))).not.toBe(claveLinea(linea("a", 100, 15)));
  });

  it("dos renglones idénticos comparten clave: ya fueron consolidados en uno", () => {
    expect(claveLinea(linea("a", 100))).toBe(claveLinea(linea("a", 100)));
  });

  it("tolera precio o descuento ausentes", () => {
    expect(claveLinea({ productId: "a" })).toBe("a|0|0");
  });
});

describe("clavesDeLineas", () => {
  it("devuelve la clave de cada renglón en orden", () => {
    expect(clavesDeLineas([linea("a", 100), linea("b", 50), linea("a", 90)])).toEqual([
      "a|100|0",
      "b|50|0",
      "a|90|0",
    ]);
  });

  it("las claves son únicas cuando los renglones están consolidados", () => {
    const claves = clavesDeLineas([linea("a", 100), linea("a", 90), linea("b", 50)]);
    expect(new Set(claves).size).toBe(3);
  });

  it("lista vacía", () => {
    expect(clavesDeLineas([])).toEqual([]);
  });
});
