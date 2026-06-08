import { describe, it, expect } from "vitest";
import {
  labelCategoria,
  periodoActual,
  esGastoFijoVigente,
  type VigenciaInput,
} from "../gastos-constants";

const activo = (extra: Partial<VigenciaInput> = {}): VigenciaInput => ({
  activo: true,
  ...extra,
});

describe("labelCategoria", () => {
  it("devuelve 'Sin categoría' cuando es null/undefined/vacío", () => {
    expect(labelCategoria(null)).toBe("Sin categoría");
    expect(labelCategoria(undefined)).toBe("Sin categoría");
    expect(labelCategoria("")).toBe("Sin categoría");
  });

  it("capitaliza la primera letra", () => {
    expect(labelCategoria("alquiler")).toBe("Alquiler");
    expect(labelCategoria("combustible")).toBe("Combustible");
  });
});

describe("periodoActual", () => {
  it("formatea 'YYYY-MM' con mes a dos dígitos", () => {
    expect(periodoActual(new Date(2026, 0, 5))).toBe("2026-01"); // enero
    expect(periodoActual(new Date(2026, 11, 31))).toBe("2026-12"); // diciembre
    expect(periodoActual(new Date(2026, 5, 8))).toBe("2026-06"); // junio
  });
});

describe("esGastoFijoVigente", () => {
  it("un gasto inactivo nunca está vigente", () => {
    expect(esGastoFijoVigente({ activo: false }, "2026-06")).toBe(false);
    expect(esGastoFijoVigente({ activo: false, desde: "2020-01-01" }, "2026-06")).toBe(false);
  });

  it("sin desde/hasta, activo, está vigente en cualquier mes", () => {
    expect(esGastoFijoVigente(activo(), "2026-06")).toBe(true);
    expect(esGastoFijoVigente(activo(), "2020-01")).toBe(true);
  });

  it("no está vigente si 'desde' es posterior al mes consultado", () => {
    expect(esGastoFijoVigente(activo({ desde: "2026-07-01" }), "2026-06")).toBe(false);
  });

  it("está vigente si 'desde' cae dentro o antes del mes", () => {
    expect(esGastoFijoVigente(activo({ desde: "2026-06-01" }), "2026-06")).toBe(true);
    expect(esGastoFijoVigente(activo({ desde: "2026-06-30" }), "2026-06")).toBe(true);
    expect(esGastoFijoVigente(activo({ desde: "2025-01-01" }), "2026-06")).toBe(true);
  });

  it("no está vigente si 'hasta' es anterior al mes consultado", () => {
    expect(esGastoFijoVigente(activo({ hasta: "2026-05-31" }), "2026-06")).toBe(false);
  });

  it("está vigente si 'hasta' cae dentro o después del mes", () => {
    expect(esGastoFijoVigente(activo({ hasta: "2026-06-01" }), "2026-06")).toBe(true);
    expect(esGastoFijoVigente(activo({ hasta: "2026-12-31" }), "2026-06")).toBe(true);
  });

  it("respeta un rango desde..hasta", () => {
    const g = activo({ desde: "2026-03-01", hasta: "2026-08-31" });
    expect(esGastoFijoVigente(g, "2026-02")).toBe(false); // antes del rango
    expect(esGastoFijoVigente(g, "2026-03")).toBe(true); // inicio
    expect(esGastoFijoVigente(g, "2026-06")).toBe(true); // dentro
    expect(esGastoFijoVigente(g, "2026-08")).toBe(true); // fin
    expect(esGastoFijoVigente(g, "2026-09")).toBe(false); // después
  });

  it("calcula bien el último día en febrero (28 días)", () => {
    expect(esGastoFijoVigente(activo({ desde: "2026-02-28" }), "2026-02")).toBe(true);
    expect(esGastoFijoVigente(activo({ hasta: "2026-02-28" }), "2026-02")).toBe(true);
    expect(esGastoFijoVigente(activo({ hasta: "2026-01-31" }), "2026-02")).toBe(false);
  });

  it("devuelve false con un período inválido", () => {
    expect(esGastoFijoVigente(activo(), "")).toBe(false);
    expect(esGastoFijoVigente(activo(), "basura")).toBe(false);
  });
});
