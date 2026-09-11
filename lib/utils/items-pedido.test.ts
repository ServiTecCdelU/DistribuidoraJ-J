import { describe, it, expect } from "vitest";
import { consolidarItems, type ItemPedido } from "./items-pedido";

describe("consolidarItems", () => {
  it("deja igual una lista sin repetidos", () => {
    const items: ItemPedido[] = [
      { productId: "mp_001", quantity: 3, price: 100 },
      { productId: "mp_002", quantity: 5, price: 200 },
    ];
    expect(consolidarItems(items)).toEqual(items);
  });

  // Caso real: al reemplazar una marca por otra que ya estaba en el pedido se creaba
  // un segundo renglón del mismo producto (remito R-2026-01782, yerba en dos líneas de 10).
  it("suma las cantidades del mismo producto en un solo renglón", () => {
    const items: ItemPedido[] = [
      { productId: "mp_yerba", quantity: 10, price: 2075.87, name: "YERBA" },
      { productId: "mp_otro", quantity: 5, price: 500, name: "OTRO" },
      { productId: "mp_yerba", quantity: 10, price: 2075.87, name: "YERBA" },
    ];
    expect(consolidarItems(items)).toEqual([
      { productId: "mp_yerba", quantity: 20, price: 2075.87, name: "YERBA" },
      { productId: "mp_otro", quantity: 5, price: 500, name: "OTRO" },
    ]);
  });

  it("conserva el orden de aparición del primer renglón", () => {
    const items: ItemPedido[] = [
      { productId: "a", quantity: 1, price: 10 },
      { productId: "b", quantity: 1, price: 20 },
      { productId: "a", quantity: 2, price: 10 },
      { productId: "c", quantity: 1, price: 30 },
    ];
    expect(consolidarItems(items).map((i) => i.productId)).toEqual(["a", "b", "c"]);
  });

  it("suma también los regalos", () => {
    const items: ItemPedido[] = [
      { productId: "a", quantity: 5, price: 10, regalo: 1 },
      { productId: "a", quantity: 3, price: 10, regalo: 2 },
    ];
    expect(consolidarItems(items)).toEqual([
      { productId: "a", quantity: 8, price: 10, regalo: 3 },
    ]);
  });

  // Un mismo producto a distinto precio o con distinto descuento es una decisión
  // deliberada del vendedor: sumarlos perdería plata o la regalaría.
  it("no fusiona el mismo producto si el precio difiere", () => {
    const items: ItemPedido[] = [
      { productId: "a", quantity: 5, price: 100 },
      { productId: "a", quantity: 5, price: 90 },
    ];
    expect(consolidarItems(items)).toHaveLength(2);
  });

  it("no fusiona el mismo producto si el descuento difiere", () => {
    const items: ItemPedido[] = [
      { productId: "a", quantity: 5, price: 100, itemDiscount: 10 },
      { productId: "a", quantity: 5, price: 100 },
    ];
    expect(consolidarItems(items)).toHaveLength(2);
  });

  it("sí fusiona cuando el descuento es el mismo", () => {
    const items: ItemPedido[] = [
      { productId: "a", quantity: 5, price: 100, itemDiscount: 10 },
      { productId: "a", quantity: 4, price: 100, itemDiscount: 10 },
    ];
    expect(consolidarItems(items)).toEqual([
      { productId: "a", quantity: 9, price: 100, itemDiscount: 10 },
    ]);
  });

  it("no toca los items sin productId", () => {
    const items: ItemPedido[] = [
      { quantity: 2, price: 10, name: "SUELTO" } as ItemPedido,
      { quantity: 3, price: 10, name: "OTRO SUELTO" } as ItemPedido,
    ];
    expect(consolidarItems(items)).toHaveLength(2);
  });

  it("lista vacía devuelve vacío", () => {
    expect(consolidarItems([])).toEqual([]);
  });

  it("preserva los campos extra del primer renglón", () => {
    const items: ItemPedido[] = [
      { productId: "a", quantity: 5, price: 10, codigo: "0102075", unidadesPorBulto: 10 } as ItemPedido,
      { productId: "a", quantity: 5, price: 10, codigo: "0102075", unidadesPorBulto: 10 } as ItemPedido,
    ];
    expect(consolidarItems(items)).toEqual([
      { productId: "a", quantity: 10, price: 10, codigo: "0102075", unidadesPorBulto: 10 },
    ]);
  });
});
