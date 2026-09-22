import { describe, it, expect } from "vitest";
import { agruparPorPedido, clienteDeDescripcion, textoNovedad } from "./audit-pedidos";
import type { AuditEntry } from "@/lib/types";

const entrada = (over: Partial<AuditEntry> & { id: string; createdAt: Date }): AuditEntry => ({
  action: "order_status_changed",
  userId: "u1",
  userName: "NACHO",
  description: 'Pedido de "BIBIANA LUSIMA": pasó de "Pendiente" a "Preparación"',
  entityType: "order",
  entityId: "pedido_1",
  metadata: {},
  ...over,
}) as AuditEntry;

describe("agruparPorPedido", () => {
  it("junta todos los movimientos de un mismo pedido en un solo grupo", () => {
    const entries = [
      entrada({ id: "a", createdAt: new Date("2026-09-22T19:14:00") }),
      entrada({ id: "b", createdAt: new Date("2026-09-22T19:49:00") }),
    ];

    const { grupos, sueltas } = agruparPorPedido(entries);

    expect(sueltas).toHaveLength(0);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].entries.map((e) => e.id)).toEqual(["a", "b"]);
    expect(grupos[0].clientName).toBe("BIBIANA LUSIMA");
    expect(grupos[0].ultima).toEqual(new Date("2026-09-22T19:49:00"));
  });

  it("separa los movimientos que no son de pedidos", () => {
    const entries = [
      entrada({ id: "a", createdAt: new Date("2026-09-22T10:00:00") }),
      entrada({
        id: "c",
        createdAt: new Date("2026-09-22T11:00:00"),
        entityType: "product",
        entityId: "prod_1",
        action: "product_updated",
      }),
    ];

    const { grupos, sueltas } = agruparPorPedido(entries);

    expect(grupos).toHaveLength(1);
    expect(sueltas.map((e) => e.id)).toEqual(["c"]);
  });

  it("toma el remito y la venta del metadata de cualquier movimiento del pedido", () => {
    const entries = [
      entrada({ id: "a", createdAt: new Date("2026-09-22T10:00:00") }),
      entrada({
        id: "b",
        createdAt: new Date("2026-09-22T12:00:00"),
        metadata: { remitoNumber: "R-2026-00327", saleId: "venta_9" },
      }),
    ];

    const [grupo] = agruparPorPedido(entries).grupos;

    expect(grupo.remitoNumber).toBe("R-2026-00327");
    expect(grupo.saleId).toBe("venta_9");
  });

  it("arma las novedades de carga desde cambios y no entregados", () => {
    const entries = [
      entrada({
        id: "a",
        createdAt: new Date("2026-09-22T10:00:00"),
        action: "order_items_edited",
        metadata: {
          cambios: [{ tipo: "cantidad", productId: "p1", name: "QUESO HOLANDA", antes: 6, despues: 5.8 }],
        },
      }),
      entrada({
        id: "b",
        createdAt: new Date("2026-09-22T12:00:00"),
        action: "order_items_edited",
        metadata: { noEntregados: [{ name: "SALAME MILAN", quantity: 2, motivo: "rotura" }] },
      }),
    ];

    const [grupo] = agruparPorPedido(entries).grupos;

    expect(grupo.novedades).toHaveLength(2);
    expect(textoNovedad(grupo.novedades[0])).toBe("Faltante: QUESO HOLANDA: 5.8 de 6");
    expect(textoNovedad(grupo.novedades[1])).toBe("No entregado: SALAME MILAN x2 (rotura)");
  });
});

describe("clienteDeDescripcion", () => {
  it("extrae el nombre entre comillas", () => {
    expect(clienteDeDescripcion('Editó el pedido de "KIOSCO MARCELA" al generar el remito')).toBe(
      "KIOSCO MARCELA",
    );
  });

  it("devuelve undefined si no hay comillas", () => {
    expect(clienteDeDescripcion("Pedido actualizado")).toBeUndefined();
  });
});
