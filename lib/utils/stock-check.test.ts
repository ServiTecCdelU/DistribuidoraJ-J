import { describe, it, expect } from "vitest";
import { repartirStockDisponible, type ItemConStock } from "./stock-check";

describe("repartirStockDisponible", () => {
  it("asigna el stock del producto a un renglón simple", () => {
    const items: ItemConStock[] = [{ productId: "a", quantity: 5 }];
    expect(repartirStockDisponible(items, new Map([["a", 20]]))).toEqual([
      { productId: "a", quantity: 5, stock: 20 },
    ]);
  });

  // Con dos renglones del mismo producto, cada uno comparaba su cantidad contra el stock
  // TOTAL: 10 y 10 contra 15 daba "alcanza" dos veces, cuando en realidad faltan 5.
  it("descuenta del disponible lo que ya tomaron los renglones anteriores", () => {
    const items: ItemConStock[] = [
      { productId: "a", quantity: 10 },
      { productId: "a", quantity: 10 },
    ];
    expect(repartirStockDisponible(items, new Map([["a", 15]]))).toEqual([
      { productId: "a", quantity: 10, stock: 15 },
      { productId: "a", quantity: 10, stock: 5 },
    ]);
  });

  it("no baja de cero cuando el stock ya se agotó", () => {
    const items: ItemConStock[] = [
      { productId: "a", quantity: 10 },
      { productId: "a", quantity: 10 },
      { productId: "a", quantity: 10 },
    ];
    const r = repartirStockDisponible(items, new Map([["a", 12]]));
    expect(r.map((i) => i.stock)).toEqual([12, 2, 0]);
  });

  it("productos distintos no se pisan entre sí", () => {
    const items: ItemConStock[] = [
      { productId: "a", quantity: 5 },
      { productId: "b", quantity: 3 },
      { productId: "a", quantity: 5 },
    ];
    const r = repartirStockDisponible(items, new Map([["a", 8], ["b", 50]]));
    expect(r.map((i) => i.stock)).toEqual([8, 50, 3]);
  });

  it("stock cero o producto ausente del mapa", () => {
    const items: ItemConStock[] = [{ productId: "z", quantity: 4 }];
    expect(repartirStockDisponible(items, new Map())).toEqual([
      { productId: "z", quantity: 4, stock: 0 },
    ]);
  });

  it("preserva los demás campos del item", () => {
    const items: ItemConStock[] = [
      { productId: "a", quantity: 5, name: "YERBA", price: 100 } as ItemConStock,
    ];
    expect(repartirStockDisponible(items, new Map([["a", 9]]))).toEqual([
      { productId: "a", quantity: 5, name: "YERBA", price: 100, stock: 9 },
    ]);
  });

  it("lista vacía", () => {
    expect(repartirStockDisponible([], new Map([["a", 5]]))).toEqual([]);
  });
});
