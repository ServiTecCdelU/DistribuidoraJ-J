import { describe, it, expect } from "vitest";
import { diffItems, describirCambios, type ItemDiff } from "./diff-items";

const item = (productId: string, name: string, quantity: number, price = 100, itemDiscount?: number): ItemDiff =>
  ({ productId, name, quantity, price, ...(itemDiscount != null ? { itemDiscount } : {}) });

describe("diffItems", () => {
  it("sin cambios devuelve lista vacía", () => {
    const items = [item("a", "LECHE", 2)];
    expect(diffItems(items, items)).toEqual([]);
  });

  it("detecta un cambio de cantidad", () => {
    expect(diffItems([item("a", "LECHE", 2)], [item("a", "LECHE", 5)])).toEqual([
      { tipo: "cantidad", productId: "a", name: "LECHE", antes: 2, despues: 5 },
    ]);
  });

  it("detecta un producto agregado", () => {
    const r = diffItems([item("a", "LECHE", 2)], [item("a", "LECHE", 2), item("b", "PAN", 3)]);
    expect(r).toEqual([{ tipo: "agregado", productId: "b", name: "PAN", despues: 3 }]);
  });

  it("detecta un producto quitado", () => {
    const r = diffItems([item("a", "LECHE", 2), item("b", "PAN", 3)], [item("a", "LECHE", 2)]);
    expect(r).toEqual([{ tipo: "quitado", productId: "b", name: "PAN", antes: 3 }]);
  });

  it("detecta cambio de descuento", () => {
    const r = diffItems([item("a", "LECHE", 2, 100, 0)], [item("a", "LECHE", 2, 100, 15)]);
    expect(r).toEqual([
      { tipo: "descuento", productId: "a", name: "LECHE", antes: 0, despues: 15 },
    ]);
  });

  it("detecta cambio de precio", () => {
    const r = diffItems([item("a", "LECHE", 2, 100)], [item("a", "LECHE", 2, 120)]);
    expect(r).toEqual([
      { tipo: "precio", productId: "a", name: "LECHE", antes: 100, despues: 120 },
    ]);
  });

  // Un reemplazo es un producto que sale y otro que entra: se informan los dos,
  // porque es lo que permite reconstruir qué pasó.
  it("un reemplazo aparece como quitado + agregado", () => {
    const r = diffItems([item("a", "LECHE", 2)], [item("b", "LECHE DESCREMADA", 2)]);
    expect(r).toHaveLength(2);
    expect(r.map((c) => c.tipo).sort()).toEqual(["agregado", "quitado"]);
  });

  // El caso de la panadería: dos renglones del mismo producto se suman antes de comparar,
  // asi un cambio real no queda escondido detras de la duplicacion.
  it("suma los renglones repetidos del mismo producto antes de comparar", () => {
    const antes = [item("a", "YERBA", 10), item("a", "YERBA", 10)];
    const despues = [item("a", "YERBA", 20)];
    expect(diffItems(antes, despues)).toEqual([]);
  });

  it("agrupa varios cambios a la vez", () => {
    const antes = [item("a", "LECHE", 2), item("b", "PAN", 3)];
    const despues = [item("a", "LECHE", 4), item("c", "QUESO", 1)];
    const r = diffItems(antes, despues);
    expect(r).toHaveLength(3);
  });
});

describe("describirCambios", () => {
  it("arma un texto legible para la auditoría", () => {
    const antes = [item("a", "LECHE", 2), item("b", "PAN", 3)];
    const despues = [item("a", "LECHE", 5), item("c", "QUESO", 1)];
    expect(describirCambios(diffItems(antes, despues))).toBe(
      "LECHE 2 → 5; quitó PAN x3; agregó QUESO x1",
    );
  });

  it("describe descuentos y precios con su unidad", () => {
    const cambios = diffItems(
      [item("a", "LECHE", 2, 100, 0)],
      [item("a", "LECHE", 2, 120, 15)],
    );
    const texto = describirCambios(cambios);
    expect(texto).toContain("descuento 0% → 15%");
    expect(texto).toContain("precio 100 → 120");
  });

  it("sin cambios devuelve cadena vacía", () => {
    expect(describirCambios([])).toBe("");
  });

  it("recorta la lista cuando hay demasiados cambios", () => {
    const antes = Array.from({ length: 12 }, (_, i) => item(`p${i}`, `PROD${i}`, 1));
    const despues = antes.map((i) => ({ ...i, quantity: 2 }));
    const texto = describirCambios(diffItems(antes, despues), 5);
    expect(texto).toContain("y 7 más");
    expect(texto.split(";")).toHaveLength(6);
  });
});
