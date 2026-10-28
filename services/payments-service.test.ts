import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock del cliente Supabase: la consulta del cliente devuelve lo que haya en `cliente`;
// los inserts se registran para verificar que no se grabó nada.
const { from, rpc, inserts, estado } = vi.hoisted(() => {
  const inserts: any[] = [];
  const estado: { cliente: any; clienteError: any } = { cliente: null, clienteError: null };
  const builder = (table: string) => {
    const b: any = {
      select: () => b,
      eq: () => b,
      maybeSingle: () =>
        Promise.resolve(table === "clientes" ? { data: estado.cliente, error: estado.clienteError } : { data: null, error: null }),
      insert: (row: any) => {
        inserts.push({ table, row });
        return Promise.resolve({ error: null });
      },
    };
    return b;
  };
  return {
    from: vi.fn((table: string) => builder(table)),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    inserts,
    estado,
  };
});
vi.mock("@/lib/supabase", () => ({ supabase: { from, rpc } }));

const { moverSaldoClienteMock } = vi.hoisted(() => ({ moverSaldoClienteMock: vi.fn().mockResolvedValue(0) }));
vi.mock("@/services/supabase-helpers", () => ({
  generateReadableId: vi.fn().mockResolvedValue("transaccion_cliente_1"),
  moverSaldoCliente: moverSaldoClienteMock,
}));

import { registerCashPayment } from "./payments-service";

describe("registerCashPayment — validación", () => {
  beforeEach(() => {
    inserts.length = 0;
    moverSaldoClienteMock.mockClear();
    estado.cliente = { current_balance: 1000, name: "Cliente" };
    estado.clienteError = null;
  });

  it.each([0, -50, Number.NaN, Number.POSITIVE_INFINITY])("rechaza el monto %s sin grabar nada", async (amount) => {
    await expect(registerCashPayment({ clientId: "cliente_1", amount })).rejects.toThrow("mayor a cero");
    expect(inserts).toHaveLength(0);
    expect(moverSaldoClienteMock).not.toHaveBeenCalled();
  });

  it("rechaza un cliente inexistente sin grabar el pago", async () => {
    estado.cliente = null;
    await expect(registerCashPayment({ clientId: "no_existe", amount: 100 })).rejects.toThrow("no existe");
    expect(inserts).toHaveLength(0);
  });

  it("registra un pago válido y baja el saldo del cliente", async () => {
    await registerCashPayment({ clientId: "cliente_1", amount: 100, metodoPago: "efectivo" });
    expect(inserts).toHaveLength(1);
    expect(inserts[0].row).toMatchObject({ client_id: "cliente_1", type: "payment", amount: 100 });
    expect(moverSaldoClienteMock).toHaveBeenCalledWith("cliente_1", -100, "minorista");
  });
});
