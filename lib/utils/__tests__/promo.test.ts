import { describe, it, expect } from "vitest";
import { unidadesRegalo, maxQtyPagable, calcularRegalosCruzados } from "../promo";

describe("unidadesRegalo — promo 'cada X comprados +1 gratis'", () => {
  it("sin promo (regaloCada null/0/undefined) no regala nada", () => {
    expect(unidadesRegalo(50, null)).toBe(0);
    expect(unidadesRegalo(50, 0)).toBe(0);
    expect(unidadesRegalo(50, undefined)).toBe(0);
  });

  it("cantidad 0 o negativa no regala", () => {
    expect(unidadesRegalo(0, 10)).toBe(0);
    expect(unidadesRegalo(-5, 10)).toBe(0);
  });

  it("regaloCada=10: no regala hasta llegar al múltiplo", () => {
    expect(unidadesRegalo(9, 10)).toBe(0);
    expect(unidadesRegalo(10, 10)).toBe(1);
    expect(unidadesRegalo(11, 10)).toBe(1);
    expect(unidadesRegalo(19, 10)).toBe(1);
  });

  it("regaloCada=10: suma 1 por cada múltiplo completo", () => {
    expect(unidadesRegalo(20, 10)).toBe(2);
    expect(unidadesRegalo(25, 10)).toBe(2); // todavía no llega al tercero
    expect(unidadesRegalo(30, 10)).toBe(3);
  });

  it("regaloCada=12 (caso del usuario)", () => {
    expect(unidadesRegalo(11, 12)).toBe(0);
    expect(unidadesRegalo(12, 12)).toBe(1);
    expect(unidadesRegalo(24, 12)).toBe(2);
  });

  it("regaloCada=1 regala 1 por cada unidad", () => {
    expect(unidadesRegalo(5, 1)).toBe(5);
  });

  it("la mecánica acordada: paga la cantidad, lleva cantidad + regalo", () => {
    const cantidad = 10;
    const regalo = unidadesRegalo(cantidad, 10);
    const lleva = cantidad + regalo;
    expect(regalo).toBe(1);
    expect(lleva).toBe(11);
  });

  it("regaloCantidad configurable: cada 10 con 2 gratis", () => {
    expect(unidadesRegalo(9, 10, 2)).toBe(0);
    expect(unidadesRegalo(10, 10, 2)).toBe(2);
    expect(unidadesRegalo(20, 10, 2)).toBe(4);
    expect(unidadesRegalo(25, 10, 2)).toBe(4);
    expect(unidadesRegalo(30, 10, 2)).toBe(6);
  });

  it("regaloCantidad 3: cada 5 con 3 gratis", () => {
    expect(unidadesRegalo(5, 5, 3)).toBe(3);
    expect(unidadesRegalo(10, 5, 3)).toBe(6);
  });

  it("regaloCantidad null/0 equivale a 1 (retrocompat)", () => {
    expect(unidadesRegalo(10, 10, null)).toBe(1);
    expect(unidadesRegalo(10, 10, 0)).toBe(1);
    expect(unidadesRegalo(10, 10, undefined)).toBe(1);
  });
});

describe("maxQtyPagable — tope de cantidad para no superar el stock con el regalo", () => {
  it("stock 0 devuelve 0", () => {
    expect(maxQtyPagable(0, 10)).toBe(0);
  });

  it("sin promo devuelve el stock tal cual", () => {
    expect(maxQtyPagable(11, null)).toBe(11);
    expect(maxQtyPagable(11, 0)).toBe(11);
  });

  it("regaloCada=10, stock=11: máximo pagable 10 (10 + 1 regalo = 11)", () => {
    expect(maxQtyPagable(11, 10)).toBe(10);
  });

  it("regaloCada=10, stock=10: máximo pagable 9 (10 pagadas necesitarían 11)", () => {
    expect(maxQtyPagable(10, 10)).toBe(9);
  });

  it("regaloCada=10, stock=22: máximo pagable 20 (20 + 2 regalo = 22)", () => {
    expect(maxQtyPagable(22, 10)).toBe(20);
  });

  it("regaloCada=10, stock=21: máximo pagable 19 (19 + 1 = 20 ≤ 21; 20 + 2 = 22 > 21)", () => {
    expect(maxQtyPagable(21, 10)).toBe(19);
  });

  it("stock chico (1) con promo deja pagar 1 sin regalo", () => {
    expect(maxQtyPagable(1, 10)).toBe(1);
  });

  it("regaloCantidad=2, stock=12: máximo pagable 10 (10 + 2 regalo = 12)", () => {
    expect(maxQtyPagable(12, 10, 2)).toBe(10);
  });

  it("invariante: pagable + su regalo nunca supera el stock", () => {
    for (let stock = 1; stock <= 100; stock++) {
      for (const cada of [1, 2, 5, 10, 12]) {
        for (const cant of [1, 2, 3]) {
          const q = maxQtyPagable(stock, cada, cant);
          expect(q + unidadesRegalo(q, cada, cant)).toBeLessThanOrEqual(stock);
          // y un pagable mayor sí lo superaría (q es el máximo)
          expect((q + 1) + unidadesRegalo(q + 1, cada, cant)).toBeGreaterThan(stock);
        }
      }
    }
  });
});

describe("calcularRegalosCruzados — regalo de OTRO producto", () => {
  const itemA = (quantity: number, cada: number | null, cant: number | null, bId = "prod_B", bNom = "Producto B") => ({
    quantity,
    product: { regaloProductoId: bId, regaloProductoNombre: bNom, regaloProductoCada: cada, regaloProductoCantidad: cant },
  });

  it("sin producto de regalo configurado devuelve vacío", () => {
    expect(calcularRegalosCruzados([{ quantity: 50, product: {} }])).toEqual([]);
  });

  it("12 leche → 2 de otro producto", () => {
    const r = calcularRegalosCruzados([itemA(12, 12, 2)]);
    expect(r).toEqual([{ productoId: "prod_B", nombre: "Producto B", cantidad: 2 }]);
  });

  it("no activa si no llega al múltiplo", () => {
    expect(calcularRegalosCruzados([itemA(11, 12, 2)])).toEqual([]);
  });

  it("24 leche → 4 (dos bloques)", () => {
    expect(calcularRegalosCruzados([itemA(24, 12, 2)])[0].cantidad).toBe(4);
  });

  it("regaloProductoCantidad null se toma como 1", () => {
    expect(calcularRegalosCruzados([itemA(12, 12, null)])[0].cantidad).toBe(1);
  });

  it("acumula cuando varios items regalan el mismo producto", () => {
    const r = calcularRegalosCruzados([itemA(12, 12, 2), itemA(24, 12, 2)]);
    expect(r).toHaveLength(1);
    expect(r[0].cantidad).toBe(6); // 2 + 4
  });

  it("separa por producto regalado distinto", () => {
    const r = calcularRegalosCruzados([
      itemA(12, 12, 1, "prod_B", "B"),
      itemA(10, 10, 1, "prod_C", "C"),
    ]);
    expect(r).toHaveLength(2);
  });
});
