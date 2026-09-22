import { describe, it, expect } from "vitest";
import { faltantesDeCambios, notaFaltantes, type Cambio } from "./diff-items";

const quitado: Cambio = { tipo: "quitado", productId: "p1", name: "QUESO HOLANDA", antes: 6 };
const menos: Cambio = { tipo: "cantidad", productId: "p2", name: "SALAME MILAN", antes: 2, despues: 1.58 };
const mas: Cambio = { tipo: "cantidad", productId: "p3", name: "QUESO CREMOSO", antes: 4, despues: 4.2 };
const precio: Cambio = { tipo: "precio", productId: "p4", name: "JAMON", antes: 100, despues: 120 };

describe("faltantesDeCambios", () => {
  it("toma los productos quitados y los que van con menos cantidad", () => {
    expect(faltantesDeCambios([quitado, menos, mas, precio])).toEqual([quitado, menos]);
  });

  it("no considera faltante un aumento de cantidad", () => {
    expect(faltantesDeCambios([mas])).toEqual([]);
  });
});

describe("notaFaltantes", () => {
  it("arma la nota para reparto con el detalle de lo que falta", () => {
    expect(notaFaltantes([quitado, menos])).toBe(
      "FALTANTES EN LA CARGA: QUESO HOLANDA (no se envía, pidió 6); SALAME MILAN (1.58 de 2)",
    );
  });

  it("devuelve vacío si no hubo faltantes", () => {
    expect(notaFaltantes([mas, precio])).toBe("");
  });
});
