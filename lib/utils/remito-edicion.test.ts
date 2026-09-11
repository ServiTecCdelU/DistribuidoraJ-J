import { describe, it, expect } from "vitest";
import { aplicarEdicionesRemito, type ItemRemitoEdicion } from "./remito-edicion";

const leche = (quantity: number): ItemRemitoEdicion => ({
  productId: "prod_leche",
  name: "LECHE X 1L YATASTO ENTERA",
  price: 1859.76,
  codigo: "0106068",
  quantity,
});

describe("aplicarEdicionesRemito", () => {
  // Caso que reportó el usuario: el pedido arranca con 1 leche y al final se reemplaza
  // otro producto por leche. Tiene que quedar UN renglón de 2, no dos renglones de 1.
  it("al reemplazar por un producto que ya está en el pedido, suma en un solo renglón", () => {
    const items = [leche(1), { productId: "prod_otro", name: "OTRO", price: 500, quantity: 1 }];
    const r = aplicarEdicionesRemito(items, {
      replacements: {
        prod_otro: { productId: "prod_leche", name: "LECHE X 1L YATASTO ENTERA", price: 1859.76, codigo: "0106068" },
      },
    });
    expect(r.items).toEqual([leche(2)]);
  });

  it("suma las cantidades reales, no una unidad por renglón", () => {
    const items = [leche(6), { productId: "prod_otro", name: "OTRO", price: 500, quantity: 4 }];
    const r = aplicarEdicionesRemito(items, {
      replacements: {
        prod_otro: { productId: "prod_leche", name: "LECHE X 1L YATASTO ENTERA", price: 1859.76, codigo: "0106068" },
      },
    });
    expect(r.items).toEqual([leche(10)]);
  });

  it("el pedido que ya venía con el producto repetido queda consolidado", () => {
    const r = aplicarEdicionesRemito([leche(10), { productId: "prod_x", name: "X", price: 10, quantity: 1 }, leche(10)], {});
    expect(r.items[0]).toEqual(leche(20));
    expect(r.items).toHaveLength(2);
  });

  it("aplica las cantidades editadas por el admin", () => {
    const r = aplicarEdicionesRemito([leche(10)], { quantities: { prod_leche: 4 } });
    expect(r.items).toEqual([leche(4)]);
    expect(r.huboCambioCantidad).toBe(true);
  });

  it("no marca cambio de cantidad si el valor es el mismo", () => {
    const r = aplicarEdicionesRemito([leche(10)], { quantities: { prod_leche: 10 } });
    expect(r.huboCambioCantidad).toBe(false);
  });

  it("aplica el descuento por producto y lo quita cuando es cero", () => {
    const conDesc = aplicarEdicionesRemito([leche(2)], { discounts: { prod_leche: 15 } });
    expect(conDesc.items[0].itemDiscount).toBe(15);

    const sinDesc = aplicarEdicionesRemito(
      [{ ...leche(2), itemDiscount: 15 }],
      { discounts: { prod_leche: 0 } },
    );
    expect(sinDesc.items[0].itemDiscount).toBeUndefined();
  });

  it("excluye los productos marcados", () => {
    const r = aplicarEdicionesRemito(
      [leche(2), { productId: "prod_x", name: "X", price: 10, quantity: 1 }],
      { excludeProductIds: ["prod_x"] },
    );
    expect(r.items).toEqual([leche(2)]);
  });

  it("el reemplazo respeta la cantidad editada del renglón original", () => {
    const items = [leche(1), { productId: "prod_otro", name: "OTRO", price: 500, quantity: 10 }];
    const r = aplicarEdicionesRemito(items, {
      quantities: { prod_otro: 3 },
      replacements: {
        prod_otro: { productId: "prod_leche", name: "LECHE X 1L YATASTO ENTERA", price: 1859.76, codigo: "0106068" },
      },
    });
    expect(r.items).toEqual([leche(4)]);
  });

  // El reemplazo trae su propio precio. Si no coincide con el del renglón que ya estaba,
  // fusionarlos cambiaría lo que se le cobra al cliente: quedan separados a propósito.
  it("no fusiona si el producto de reemplazo viene a otro precio", () => {
    const items = [leche(1), { productId: "prod_otro", name: "OTRO", price: 500, quantity: 1 }];
    const r = aplicarEdicionesRemito(items, {
      replacements: {
        prod_otro: { productId: "prod_leche", name: "LECHE X 1L YATASTO ENTERA", price: 1900, codigo: "0106068" },
      },
    });
    expect(r.items).toHaveLength(2);
  });

  it("sin ediciones devuelve los items consolidados tal cual", () => {
    const items = [leche(3), { productId: "prod_x", name: "X", price: 10, quantity: 1 }];
    expect(aplicarEdicionesRemito(items, {}).items).toEqual(items);
  });
});
