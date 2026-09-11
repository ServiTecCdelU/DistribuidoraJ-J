import { describe, it, expect } from "vitest";
import {
  camposAnulacion,
  puedeAnularse,
  ESTADOS_INACTIVOS,
  type EstadoPedido,
} from "./anulacion-pedido";

describe("camposAnulacion", () => {
  it("deja el pedido anulado con responsable, motivo y fecha", () => {
    const ahora = new Date("2026-09-10T18:00:00.000Z");
    expect(camposAnulacion("Emanuel", "  cargado dos veces  ", ahora)).toEqual({
      status: "anulado",
      held: false,
      anulado_at: "2026-09-10T18:00:00.000Z",
      anulado_por: "Emanuel",
      anulado_motivo: "cargado dos veces",
    });
  });

  it("exige un motivo: es el dato que hoy se pierde al eliminar", () => {
    expect(() => camposAnulacion("Emanuel", "")).toThrow(/motivo/i);
    expect(() => camposAnulacion("Emanuel", "   ")).toThrow(/motivo/i);
  });

  it("exige responsable", () => {
    expect(() => camposAnulacion("", "motivo valido")).toThrow(/responsable/i);
  });

  it("quita el pedido de retenidos al anularlo", () => {
    expect(camposAnulacion("Emanuel", "error").held).toBe(false);
  });
});

describe("puedeAnularse", () => {
  it("permite anular pedidos en curso", () => {
    (["pending", "preparation", "delivery"] as EstadoPedido[]).forEach((e) => {
      expect(puedeAnularse(e).ok).toBe(true);
    });
  });

  // Un pedido cobrado ya tiene venta, caja y comision: anularlo por las malas dejaria
  // esos registros colgados. Se corrige desde Ventas, no desde Pedidos.
  it("no permite anular un pedido ya cobrado", () => {
    const r = puedeAnularse("completed");
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/cobrado/i);
  });

  it("no permite anular dos veces", () => {
    const r = puedeAnularse("anulado");
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/ya está anulado/i);
  });

  it("no permite anular un pedido rechazado: son cosas distintas", () => {
    const r = puedeAnularse("rechazado");
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/rechazado/i);
  });
});

describe("ESTADOS_INACTIVOS", () => {
  it("incluye anulado para que no ensucie el flujo de trabajo", () => {
    expect(ESTADOS_INACTIVOS).toContain("anulado");
    expect(ESTADOS_INACTIVOS).toContain("completed");
    expect(ESTADOS_INACTIVOS).toContain("rechazado");
  });

  it("no incluye estados en curso", () => {
    expect(ESTADOS_INACTIVOS).not.toContain("pending");
    expect(ESTADOS_INACTIVOS).not.toContain("delivery");
  });
});
