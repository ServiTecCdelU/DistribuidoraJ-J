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

// El mismo producto a distinto precio queda en dos renglones a propósito. Editar por
// productId afectaba a los dos; las ediciones se indexan por clave de línea.
describe("aplicarEdicionesRemito · renglones del mismo producto a distinto precio", () => {
  const caro = { productId: "prod_leche", name: "LECHE", price: 2000, quantity: 10 };
  const barato = { productId: "prod_leche", name: "LECHE", price: 1800, quantity: 5 };

  it("cambiar la cantidad de un renglón no toca el otro", () => {
    const r = aplicarEdicionesRemito([caro, barato], {
      quantities: { "prod_leche|1800|0": 2 },
    });
    expect(r.items).toEqual([caro, { ...barato, quantity: 2 }]);
  });

  it("el descuento se aplica solo al renglón elegido", () => {
    const r = aplicarEdicionesRemito([caro, barato], {
      discounts: { "prod_leche|2000|0": 10 },
    });
    expect(r.items[0].itemDiscount).toBe(10);
    expect(r.items[1].itemDiscount).toBeUndefined();
  });

  it("excluir un renglón deja el otro en el remito", () => {
    const r = aplicarEdicionesRemito([caro, barato], {
      excludeProductIds: ["prod_leche|1800|0"],
    });
    expect(r.items).toEqual([caro]);
  });

  it("reemplazar un renglón no reemplaza el otro", () => {
    const r = aplicarEdicionesRemito([caro, barato], {
      replacements: {
        "prod_leche|1800|0": { productId: "prod_otra", name: "OTRA MARCA", price: 1800 },
      },
    });
    expect(r.items).toHaveLength(2);
    expect(r.items[0]).toEqual(caro);
    expect(r.items[1].productId).toBe("prod_otra");
  });

  it("sigue aceptando ediciones por productId (un renglón por producto)", () => {
    const r = aplicarEdicionesRemito([leche(10)], { quantities: { prod_leche: 4 } });
    expect(r.items).toEqual([leche(4)]);
  });

  it("la clave de línea tiene prioridad sobre la de producto", () => {
    const r = aplicarEdicionesRemito([caro, barato], {
      quantities: { prod_leche: 99, "prod_leche|1800|0": 2 },
    });
    expect(r.items[1].quantity).toBe(2);
  });
});
