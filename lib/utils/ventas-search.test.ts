import { describe, it, expect } from "vitest";
import { buildFiltroBusqueda, tokenizarBusqueda, variantesProductId, ventaCoincide } from "./ventas-search";

describe("tokenizarBusqueda", () => {
  it("separa por espacios y quita caracteres que rompen el filtro", () => {
    expect(tokenizarBusqueda("  zapata, (joaquin) ")).toEqual(["zapata", "joaquin"]);
  });
});

describe("buildFiltroBusqueda", () => {
  it("una palabra: or plano sobre las columnas", () => {
    expect(buildFiltroBusqueda(["zapata"], ["client_name", "seller_name"])).toBe(
      "client_name.ilike.%zapata%,seller_name.ilike.%zapata%",
    );
  });

  it("varias palabras: todas deben coincidir, más los productos", () => {
    expect(buildFiltroBusqueda(["joaquin", "zapata"], ["client_name"], ["mp_1"])).toBe(
      'and(or(client_name.ilike.%joaquin%),or(client_name.ilike.%zapata%)),items.cs.[{"productId":"mp_1"}]',
    );
  });
});

describe("variantesProductId", () => {
  it("incluye el id mayorista sin prefijo prod_", () => {
    expect(variantesProductId("prod_mp_123")).toEqual(["prod_mp_123", "mp_123"]);
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
