import { describe, it, expect } from "vitest";
import {
  calcularPrecioVentaRemito,
  resolverAccionFicha,
  esItemProcesable,
  necesitaHabilitar,
  stockResultante,
  resolverProductoId,
} from "./remito-import";

describe("calcularPrecioVentaRemito", () => {
  it("aplica la ganancia global al precio de lista", () => {
    expect(calcularPrecioVentaRemito(100, 30)).toBe(130);
  });

  it("redondea a 2 decimales", () => {
    expect(calcularPrecioVentaRemito(99.99, 30)).toBe(129.99);
  });

  it("usa el precio de lista cuando no hay ganancia", () => {
    expect(calcularPrecioVentaRemito(250, null)).toBe(250);
    expect(calcularPrecioVentaRemito(250, undefined)).toBe(250);
  });

  it("usa el precio de lista si la ganancia es NaN", () => {
    expect(calcularPrecioVentaRemito(250, NaN)).toBe(250);
  });

  it("devuelve el precio de lista si es 0 o negativo", () => {
    expect(calcularPrecioVentaRemito(0, 30)).toBe(0);
  });

  it("ganancia 0 no cambia el precio", () => {
    expect(calcularPrecioVentaRemito(100, 0)).toBe(100);
  });
});

describe("resolverAccionFicha", () => {
  it("reactiva cuando la ficha ya existe", () => {
    expect(resolverAccionFicha(true)).toBe("reactivar");
  });
  it("crea cuando la ficha no existe", () => {
    expect(resolverAccionFicha(false)).toBe("crear");
  });
});

describe("esItemProcesable", () => {
  it("es procesable si tiene ficha", () => {
    expect(esItemProcesable({ tieneFicha: true, tieneMayorista: false })).toBe(true);
  });
  it("es procesable si tiene registro mayorista aunque no tenga ficha", () => {
    expect(esItemProcesable({ tieneFicha: false, tieneMayorista: true })).toBe(true);
  });
  it("NO es procesable si no existe en ningún lado", () => {
    expect(esItemProcesable({ tieneFicha: false, tieneMayorista: false })).toBe(false);
  });
});

describe("necesitaHabilitar", () => {
  it("habilita cuando hay mayorista sin ficha (se creará)", () => {
    expect(necesitaHabilitar({ tieneFicha: false, tieneMayorista: true, mayoristaHabilitado: false })).toBe(true);
  });
  it("habilita cuando la ficha existe pero el mayorista está deshabilitado", () => {
    expect(necesitaHabilitar({ tieneFicha: true, tieneMayorista: true, mayoristaHabilitado: false })).toBe(true);
  });
  it("NO habilita cuando ficha existe y mayorista ya habilitado", () => {
    expect(necesitaHabilitar({ tieneFicha: true, tieneMayorista: true, mayoristaHabilitado: true })).toBe(false);
  });
  it("NO habilita si no hay registro mayorista (match local)", () => {
    expect(necesitaHabilitar({ tieneFicha: true, tieneMayorista: false, mayoristaHabilitado: false })).toBe(false);
  });
});

describe("stockResultante", () => {
  it("suma la cantidad al stock actual", () => {
    expect(stockResultante(10, 5)).toBe(15);
  });
  it("trata stock negativo como 0 antes de sumar", () => {
    expect(stockResultante(-3, 5)).toBe(5);
  });
  it("ficha nueva (stock 0) queda con la cantidad ingresada", () => {
    expect(stockResultante(0, 12)).toBe(12);
  });
});

describe("resolverProductoId", () => {
  it("usa el producto_id existente si está", () => {
    expect(resolverProductoId("prod_mp_123", "mp_123")).toBe("prod_mp_123");
  });
  it("deriva prod_{mpId} cuando no hay producto_id", () => {
    expect(resolverProductoId(null, "mp_123")).toBe("prod_mp_123");
    expect(resolverProductoId(undefined, "mp_999")).toBe("prod_mp_999");
  });
});
