import { describe, it, expect } from "vitest";
import { claveAvisoPago, leerDeuda, mesesAdeudados } from "./aviso-pago";

describe("mesesAdeudados", () => {
  it("nombra uno o varios meses", () => {
    expect(mesesAdeudados(["2026-09-01"])).toBe("septiembre");
    expect(mesesAdeudados(["2026-07-01", "2026-08-01", "2026-09-01"])).toBe("julio, agosto y septiembre");
  });
});

describe("leerDeuda", () => {
  it("al día o respuesta rara no muestra aviso", () => {
    expect(leerDeuda({ success: true, data: null })).toBeNull();
    expect(leerDeuda(null)).toBeNull();
    expect(leerDeuda({ data: { total: "100", periodos: ["2026-09-01"] } })).toBeNull();
    expect(leerDeuda({ data: { total: 100, periodos: ["x"] } })).toBeNull();
  });

  it("con deuda devuelve total y períodos", () => {
    expect(leerDeuda({ success: true, data: { total: 100000, periodos: ["2026-09-01"] } })).toEqual({
      total: 100000,
      periodos: ["2026-09-01"],
    });
  });
});

describe("claveAvisoPago", () => {
  it("cambia de un día para otro", () => {
    expect(claveAvisoPago(new Date(2026, 9, 16, 23))).toBe("avisoPago:2026-10-16");
    expect(claveAvisoPago(new Date(2026, 9, 17, 0, 1))).toBe("avisoPago:2026-10-17");
  });
});
