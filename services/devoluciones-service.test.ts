import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock genérico del cliente Supabase: cola de respuestas por tabla, consumida en orden.
const { from, queues, inserts, updates, resetMock } = vi.hoisted(() => {
  const queues: Record<string, any[]> = {};
  const inserts: Record<string, any[]> = {};
  const updates: Record<string, any[]> = {};

  function builder(table: string) {
    const b: any = {
      select: () => b,
      eq: () => b,
      limit: () => b,
      insert: (row: any) => {
        (inserts[table] ||= []).push(row);
        return Promise.resolve({ data: null, error: null });
      },
      update: (row: any) => {
        (updates[table] ||= []).push(row);
        return b;
      },
      single: () => Promise.resolve(queues[table]?.shift() ?? { data: null, error: null }),
      maybeSingle: () => Promise.resolve(queues[table]?.shift() ?? { data: null, error: null }),
      then: (resolve: (v: any) => unknown) =>
        resolve(queues[table]?.shift() ?? { data: null, count: 0, error: null }),
    };
    return b;
  }

  const from = vi.fn((table: string) => builder(table));
  const resetMock = () => {
    from.mockClear();
    for (const k of Object.keys(queues)) delete queues[k];
    for (const k of Object.keys(inserts)) delete inserts[k];
    for (const k of Object.keys(updates)) delete updates[k];
  };
  return { from, queues, inserts, updates, resetMock };
});
// N° de recibo: RPC next_devolucion_number
const { rpc } = vi.hoisted(() => ({
  rpc: vi.fn().mockResolvedValue({ data: "DEV-00001", error: null }),
}));
vi.mock("@/lib/supabase", () => ({ supabase: { from, rpc } }));

const { moverSaldoClienteMock, moverTotalesVendedorMock } = vi.hoisted(() => ({
  moverSaldoClienteMock: vi.fn().mockResolvedValue(0),
  moverTotalesVendedorMock: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/services/supabase-helpers", () => ({
  generateReadableId: vi.fn().mockResolvedValue("devolucion_cliente_1"),
  moverSaldoCliente: moverSaldoClienteMock,
  moverTotalesVendedor: moverTotalesVendedorMock,
}));

const { registrarMovimientoMock } = vi.hoisted(() => ({
  registrarMovimientoMock: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/services/stock-service", () => ({
  registrarMovimiento: registrarMovimientoMock,
}));

const { recomputarSaldosDeudasMock } = vi.hoisted(() => ({
  recomputarSaldosDeudasMock: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/services/payments-service", () => ({
  recomputarSaldosDeudas: recomputarSaldosDeudasMock,
}));

import { registrarDevolucion } from "./devoluciones-service";

describe("registrarDevolucion", () => {
  beforeEach(() => {
    resetMock();
    registrarMovimientoMock.mockClear();
    recomputarSaldosDeudasMock.mockClear();
    moverSaldoClienteMock.mockClear();
    moverTotalesVendedorMock.mockClear();
    // Flag de cta cte (el saldo lo mueve la RPC mover_saldo_cliente)
    queues.clientes = [{ data: { cuenta_corriente_habilitada: true } }];
    queues.transacciones = [{ data: null }];
  });

  it("modo productos: repone stock 'stock', no repone 'perdida' y baja el saldo del cliente", async () => {
    const dev = await registrarDevolucion({
      saleId: "venta_1",
      saleNumber: "100",
      clientId: "cliente_1",
      clientName: "Juan",
      items: [
        { productId: "prod_1", name: "Fideos", quantity: 2, price: 500, destino: "stock" },
        { productId: "prod_2", name: "Arroz", quantity: 1, price: 300, destino: "perdida" },
      ],
    });

    expect(dev.total).toBe(1300);
    expect(registrarMovimientoMock).toHaveBeenCalledTimes(1);
    expect(registrarMovimientoMock).toHaveBeenCalledWith(
      expect.objectContaining({ productoId: "prod_1", cantidad: 2 }),
    );

    expect(dev.reciboNumero).toBe("DEV-00001");
    expect(moverSaldoClienteMock).toHaveBeenCalledWith("cliente_1", -1300);

    const txInsert = inserts.transacciones?.[0];
    expect(txInsert.amount).toBe(1300);
    expect(txInsert.description).toContain("#100");
  });

  it("modo monto libre con cuenta corriente: baja el saldo del cliente y guarda la nota", async () => {
    const dev = await registrarDevolucion({
      saleId: "venta_1",
      saleNumber: "100",
      clientId: "cliente_1",
      clientName: "Juan",
      monto: 2000,
      note: "Producto vencido",
      affectsBalance: true,
    });

    expect(dev.total).toBe(2000);
    expect(dev.note).toBe("Producto vencido");
    expect(dev.affectsBalance).toBe(true);
    expect(registrarMovimientoMock).not.toHaveBeenCalled();

    const txInsert = inserts.transacciones?.[0];
    expect(txInsert).toBeDefined();
    expect(txInsert.amount).toBe(2000);
    expect(txInsert.description).toContain("Producto vencido");
  });

  it("modo monto libre solo como nota: no toca la cuenta corriente ni la comisión", async () => {
    const dev = await registrarDevolucion({
      saleId: "venta_1",
      saleNumber: "100",
      clientId: "cliente_1",
      clientName: "Juan",
      sellerId: "vendedor_1",
      monto: 1500,
      note: "Descuento post-venta",
      affectsBalance: false,
    });

    expect(dev.total).toBe(1500);
    expect(dev.affectsBalance).toBe(false);
    // Queda visible en el extracto pero sin afectar saldo ni imputarse a la boleta.
    const tx = inserts.transacciones?.[0];
    expect(tx).toBeDefined();
    expect(tx.afecta_saldo).toBe(false);
    expect(tx.debt_id).toBeUndefined();
    expect(recomputarSaldosDeudasMock).not.toHaveBeenCalled();
    expect(moverSaldoClienteMock).not.toHaveBeenCalled();
    expect(moverTotalesVendedorMock).not.toHaveBeenCalled();
  });

  it("cliente sin cuenta corriente habilitada: la nota de crédito no genera saldo a favor", async () => {
    queues.clientes = [{ data: { cuenta_corriente_habilitada: false } }];

    const dev = await registrarDevolucion({
      saleId: "venta_1",
      saleNumber: "100",
      clientId: "cliente_contado",
      clientName: "Kiosco Matias",
      sellerId: "vendedor_1",
      monto: 4000,
      note: "Producto vencido",
      affectsBalance: true,
    });

    expect(dev.total).toBe(4000);
    expect(dev.affectsBalance).toBe(false);
    expect(inserts.devoluciones?.[0].affects_balance).toBe(false);
    // Se ve en el extracto con afecta_saldo false: no genera saldo a favor.
    const tx = inserts.transacciones?.[0];
    expect(tx).toBeDefined();
    expect(tx.afecta_saldo).toBe(false);
    expect(tx.amount).toBe(4000);
    expect(recomputarSaldosDeudasMock).not.toHaveBeenCalled();
    expect(moverSaldoClienteMock).not.toHaveBeenCalled();
    expect(moverTotalesVendedorMock).not.toHaveBeenCalled();
  });

  it("lanza error si no hay productos ni monto", async () => {
    await expect(registrarDevolucion({ items: [] })).rejects.toThrow(
      "No hay productos ni monto para devolver",
    );
  });
});
