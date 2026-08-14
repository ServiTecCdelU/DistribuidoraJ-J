import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock del cliente Supabase: cola de respuestas por tabla, consumida en orden.
const { from, queues, resetMock } = vi.hoisted(() => {
  const queues: Record<string, any[]> = {};

  function builder(table: string) {
    const b: any = {
      select: () => b,
      eq: () => b,
      in: () => b,
      like: () => b,
      limit: () => b,
      order: () => b,
      insert: () => Promise.resolve({ data: null, error: null }),
      update: () => b,
      single: () => Promise.resolve(queues[table]?.shift() ?? { data: null, error: null }),
      maybeSingle: () => Promise.resolve(queues[table]?.shift() ?? { data: null, error: null }),
      then: (resolve: (v: any) => unknown) =>
        resolve(queues[table]?.shift() ?? { data: null, error: null }),
    };
    return b;
  }

  const from = vi.fn((table: string) => builder(table));
  const resetMock = () => {
    from.mockClear();
    for (const k of Object.keys(queues)) delete queues[k];
  };
  return { from, queues, resetMock };
});
vi.mock("@/lib/supabase", () => ({ supabase: { from } }));
vi.mock("@/services/supabase-helpers", () => ({
  generateReadableId: vi.fn().mockResolvedValue("transaccion_cliente_1"),
}));
vi.mock("@/services/payments-service", () => ({
  aplicarPagoADeudas: vi.fn().mockResolvedValue(undefined),
}));

import { getDescuentosTotalsBySales } from "./ajustes-venta-service";

describe("getDescuentosTotalsBySales", () => {
  beforeEach(() => resetMock());

  it("devuelve un mapa vacío cuando no se pasan ventas", async () => {
    const map = await getDescuentosTotalsBySales([]);
    expect(map).toEqual({});
    expect(from).not.toHaveBeenCalled();
  });

  it("suma los descuentos de una misma venta", async () => {
    queues["transacciones"] = [
      {
        data: [
          { sale_id: "venta_1", amount: 1000, description: "[DESCUENTO] #N1" },
          { sale_id: "venta_1", amount: 500.5, description: "[DESCUENTO] #N1" },
          { sale_id: "venta_2", amount: 250, description: "[DESCUENTO] #N2" },
        ],
        error: null,
      },
    ];

    const map = await getDescuentosTotalsBySales(["venta_1", "venta_2"]);

    expect(map).toEqual({ venta_1: 1500.5, venta_2: 250 });
  });

  it("parte la consulta en chunks de 100 ids y acumula los resultados", async () => {
    const ids = Array.from({ length: 150 }, (_, i) => `venta_${i}`);
    queues["transacciones"] = [
      { data: [{ sale_id: "venta_5", amount: 300, description: "[DESCUENTO] #A" }], error: null },
      { data: [{ sale_id: "venta_120", amount: 700, description: "[DESCUENTO] #B" }], error: null },
    ];

    const map = await getDescuentosTotalsBySales(ids);

    expect(from).toHaveBeenCalledTimes(2);
    expect(map).toEqual({ venta_5: 300, venta_120: 700 });
  });

  it("ignora transacciones sin sale_id", async () => {
    queues["transacciones"] = [
      {
        data: [
          { sale_id: null, amount: 900, description: "[DESCUENTO] suelto" },
          { sale_id: "venta_3", amount: 100, description: "[DESCUENTO] #N3" },
        ],
        error: null,
      },
    ];

    const map = await getDescuentosTotalsBySales(["venta_3"]);

    expect(map).toEqual({ venta_3: 100 });
  });
});
