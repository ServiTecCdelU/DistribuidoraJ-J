import { describe, it, expect } from "vitest";
import { normalizarBusqueda, tokenizarBusqueda, ventaCoincide } from "./ventas-search";

describe("tokenizarBusqueda", () => {
  it("separa por espacios y quita caracteres que rompen el filtro", () => {
    expect(tokenizarBusqueda("  zapata, (joaquin) ")).toEqual(["zapata", "joaquin"]);
  });
});

describe("normalizarBusqueda", () => {
  it("pasa a minúsculas y quita tildes y eñes", () => {
    expect(normalizarBusqueda("Concepción MAÑANITA")).toBe("concepcion mananita");
  });
});

describe("ventaCoincide", () => {
  const venta = {
    id: "venta_1",
    clientName: "ZAPATA JOAQUIN",
    clientAddress: "Concepción del Uruguay",
    items: [{ name: "YERBA X 500G MAÑANITA" }],
  };

  it("encuentra con palabras en cualquier orden y sin importar mayúsculas", () => {
    expect(ventaCoincide(venta, ["joaquin", "Zapata"])).toBe(true);
  });

  it("ignora tildes", () => {
    expect(ventaCoincide(venta, ["concepcion"])).toBe(true);
    expect(ventaCoincide(venta, ["mananita"])).toBe(true);
  });

  it("combina cliente y producto", () => {
    expect(ventaCoincide(venta, ["zapata", "yerba"])).toBe(true);
  });

  it("descarta si alguna palabra no aparece", () => {
    expect(ventaCoincide(venta, ["zapata", "marisa"])).toBe(false);
  });
});
