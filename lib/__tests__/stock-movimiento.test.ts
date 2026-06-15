import { describe, it, expect } from "vitest";
import { buildMovimientoRow } from "../utils/stock-movimiento";

describe("buildMovimientoRow", () => {
  it("registra el usuario que ejecuta el ajuste (id y nombre)", () => {
    const row = buildMovimientoRow({
      mpId: "mp_001",
      tipo: "ajuste",
      cantidad: -5,
      stockAnterior: 20,
      stockPosterior: 15,
      referencia: "Conteo físico",
      usuario: { id: "usuario_juan_1", nombre: "Juan" },
    });

    expect(row.usuario_id).toBe("usuario_juan_1");
    expect(row.usuario_nombre).toBe("Juan");
    expect(row.motivo).toBe("Conteo físico");
    expect(row.cantidad).toBe(-5);
    expect(row.stock_anterior).toBe(20);
    expect(row.stock_posterior).toBe(15);
  });

  it("normaliza a null cuando no hay usuario (ej: venta automática)", () => {
    const row = buildMovimientoRow({
      mpId: "mp_002",
      tipo: "venta",
      cantidad: -3,
      stockAnterior: 10,
      stockPosterior: 7,
    });

    expect(row.usuario_id).toBeNull();
    expect(row.usuario_nombre).toBeNull();
    expect(row.motivo).toBeNull();
  });

  it("normaliza a null campos de usuario parcialmente vacíos", () => {
    const row = buildMovimientoRow({
      mpId: "mp_003",
      tipo: "apertura_bulto",
      cantidad: 12,
      stockAnterior: 0,
      stockPosterior: 12,
      usuario: { id: undefined, nombre: "Admin" },
    });

    expect(row.usuario_id).toBeNull();
    expect(row.usuario_nombre).toBe("Admin");
  });

  it("mapea el codigo de producto y tipo sin alterarlos", () => {
    const row = buildMovimientoRow({
      mpId: "mp_999",
      tipo: "rotura",
      cantidad: -2,
      stockAnterior: 5,
      stockPosterior: 3,
    });

    expect(row.mayorista_producto_id).toBe("mp_999");
    expect(row.tipo).toBe("rotura");
  });
});
