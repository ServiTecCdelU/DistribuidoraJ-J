import { describe, it, expect } from "vitest";
import { badgeDeMovimiento } from "./stock-movimiento-label";

describe("badgeDeMovimiento", () => {
  it("etiqueta una venta", () => {
    expect(badgeDeMovimiento("venta", "Remito R-2026-00299").label).toBe("Venta");
  });

  it("ingreso por remito proveedor", () => {
    expect(badgeDeMovimiento("apertura_bulto", "Ingreso por remito proveedor").label).toBe("Ingreso");
  });

  it("ajuste de rechazo se muestra como Rechazo", () => {
    const b = badgeDeMovimiento("ajuste", "Rechazo pedido R-2026-00299 — ZABALLO PAMELA (retroactivo)");
    expect(b.label).toBe("Rechazo");
    expect(b.className).toContain("rose");
  });

  it("ajuste de eliminación de remito se muestra como Devolución", () => {
    expect(badgeDeMovimiento("ajuste", "Eliminación remito R-2026-00315 pedido #x").label).toBe("Devolución");
  });

  it("ajuste de devolución/faltante se muestra como Devolución", () => {
    expect(badgeDeMovimiento("ajuste", "Devolución/faltante cobro pedido #x").label).toBe("Devolución");
  });

  it("ajuste genérico (sin motivo reconocido) queda como Ajuste", () => {
    expect(badgeDeMovimiento("ajuste", "AJUSTE").label).toBe("Ajuste");
    expect(badgeDeMovimiento("ajuste", null).label).toBe("Ajuste");
  });

  it("tipo desconocido devuelve el tipo crudo", () => {
    expect(badgeDeMovimiento("otro", null).label).toBe("otro");
  });
});
