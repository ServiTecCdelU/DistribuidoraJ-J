import { describe, it, expect } from "vitest";
import { metodoPagoDesdeDescripcion } from "./metodo-pago";

describe("metodoPagoDesdeDescripcion", () => {
  it("reconoce el medio con que se registró el cobro", () => {
    expect(metodoPagoDesdeDescripcion("Pago en efectivo — Cobrado por JULIO")).toBe("efectivo");
    expect(metodoPagoDesdeDescripcion("Pago en efectivo (mayorista)")).toBe("efectivo");
    expect(metodoPagoDesdeDescripcion("Pago por transferencia bancaria (Remito R-2026-00010)")).toBe("transferencia");
    expect(metodoPagoDesdeDescripcion("Pago con comprobante (foto.jpg)")).toBe("transferencia");
    expect(metodoPagoDesdeDescripcion("Pago registrado manualmente")).toBe("otro");
  });

  it("no inventa un medio para descripciones libres o etiquetas", () => {
    expect(metodoPagoDesdeDescripcion("Seña del cliente")).toBeNull();
    expect(metodoPagoDesdeDescripcion("[DEVOLUCION] #N100 — 2x Fideos")).toBeNull();
    expect(metodoPagoDesdeDescripcion(undefined)).toBeNull();
  });
});
