import { describe, it, expect } from "vitest";
import {
  ventasDescuadradas,
  ventasConCobroDistinto,
  pedidosConItemsDuplicados,
  ventasCreditConMontoCobrado,
  cajasDuplicadas,
  cajasDesactualizadas,
} from "./health-checks";

describe("ventasDescuadradas", () => {
  it("detecta cuando la suma de los items no coincide con el total", () => {
    const ventas = [
      { id: "v1", sale_number: "N1", total: 100, items: [{ price: 50, quantity: 2 }] },
      { id: "v2", sale_number: "N2", total: 100, items: [{ price: 50, quantity: 1 }] },
    ];
    const r = ventasDescuadradas(ventas);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ id: "v2", total: 100, sumaItems: 50, diferencia: -50 });
  });

  it("aplica el descuento por item", () => {
    const ventas = [{ id: "v1", total: 90, items: [{ price: 100, quantity: 1, itemDiscount: 10 }] }];
    expect(ventasDescuadradas(ventas)).toEqual([]);
  });

  it("tolera diferencias de redondeo de un centavo", () => {
    const ventas = [{ id: "v1", total: 100.01, items: [{ price: 100, quantity: 1 }] }];
    expect(ventasDescuadradas(ventas)).toEqual([]);
  });

  it("ignora ventas sin items", () => {
    expect(ventasDescuadradas([{ id: "v1", total: 100, items: [] }])).toEqual([]);
  });
});

describe("ventasConCobroDistinto", () => {
  // El caso de PANADERIA TIKI: se cobraron $193.675,41 y la venta quedó en $172.916,71.
  it("detecta cuando lo cobrado no coincide con el total", () => {
    const ventas = [{
      id: "v1", sale_number: "N1656", total: 172916.71,
      payment_type: "cash", payment_method: "transferencia", transferencia_amount: 193675.41,
    }];
    const r = ventasConCobroDistinto(ventas);
    expect(r).toHaveLength(1);
    expect(r[0].diferencia).toBe(20758.7);
  });

  it("no marca nada cuando coinciden", () => {
    const ventas = [{
      id: "v1", total: 1000, payment_type: "cash", payment_method: "efectivo", efectivo_amount: 1000,
    }];
    expect(ventasConCobroDistinto(ventas)).toEqual([]);
  });

  it("ignora las ventas a cuenta corriente: no hay cobro que comparar", () => {
    const ventas = [{ id: "v1", total: 1000, payment_type: "credit" }];
    expect(ventasConCobroDistinto(ventas)).toEqual([]);
  });

  it("ignora las ventas sin monto cobrado cargado (anteriores al campo)", () => {
    const ventas = [{ id: "v1", total: 1000, payment_type: "cash", payment_method: "efectivo" }];
    expect(ventasConCobroDistinto(ventas)).toEqual([]);
  });
});

describe("pedidosConItemsDuplicados", () => {
  it("detecta el mismo producto en dos renglones", () => {
    const pedidos = [{
      id: "p1", remito_number: "R-1", client_name: "TIKI",
      items: [
        { productId: "a", name: "YERBA", price: 100, quantity: 10 },
        { productId: "b", name: "OTRO", price: 50, quantity: 1 },
        { productId: "a", name: "YERBA", price: 100, quantity: 10 },
      ],
    }];
    const r = pedidosConItemsDuplicados(pedidos);
    expect(r).toHaveLength(1);
    expect(r[0].duplicados).toEqual([{ name: "YERBA", renglones: 2, unidades: 20 }]);
  });

  // Dos renglones a distinto precio son deliberados: no se fusionan ni se reportan.
  it("no marca el mismo producto a distinto precio", () => {
    const pedidos = [{
      id: "p1", items: [
        { productId: "a", name: "LECHE", price: 100, quantity: 5 },
        { productId: "a", name: "LECHE", price: 90, quantity: 5 },
      ],
    }];
    expect(pedidosConItemsDuplicados(pedidos)).toEqual([]);
  });

  it("pedido sano no se reporta", () => {
    const pedidos = [{ id: "p1", items: [{ productId: "a", name: "X", price: 10, quantity: 1 }] }];
    expect(pedidosConItemsDuplicados(pedidos)).toEqual([]);
  });
});

describe("ventasCreditConMontoCobrado", () => {
  it("detecta residuos de conversión a cuenta corriente", () => {
    const ventas = [
      { id: "v1", sale_number: "N1", payment_type: "credit", transferencia_amount: 185357.18 },
      { id: "v2", payment_type: "credit" },
      { id: "v3", payment_type: "cash", efectivo_amount: 100 },
    ];
    const r = ventasCreditConMontoCobrado(ventas);
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe("v1");
  });

  it("un monto en cero también es un residuo", () => {
    const ventas = [{ id: "v1", payment_type: "credit", efectivo_amount: 0 }];
    expect(ventasCreditConMontoCobrado(ventas)).toHaveLength(1);
  });
});

describe("cajasDuplicadas", () => {
  it("detecta dos cajas abiertas el mismo día", () => {
    const cajas = [
      { id: "caja_20260728_1", opened_at: "2026-07-28T09:00:00Z" },
      { id: "caja_20260728_2", opened_at: "2026-07-28T09:00:00Z" },
      { id: "caja_20260729_1", opened_at: "2026-07-29T09:00:00Z" },
    ];
    const r = cajasDuplicadas(cajas);
    expect(r).toHaveLength(1);
    expect(r[0].ids).toEqual(["caja_20260728_1", "caja_20260728_2"]);
  });

  it("un día con una sola caja no se reporta", () => {
    expect(cajasDuplicadas([{ id: "c1", opened_at: "2026-07-28T09:00:00Z" }])).toEqual([]);
  });
});

describe("cajasDesactualizadas", () => {
  const venta = (created_at: string, total: number, efectivo: number) =>
    ({ created_at, total, payment_type: "cash", payment_method: "efectivo", efectivo_amount: efectivo });

  it("detecta una caja cuyos totales no coinciden con el recálculo", () => {
    const cajas = [{
      id: "c1", opened_at: "2026-07-28T09:00:00Z", status: "closed",
      cash_total: 500, transfer_total: 0, credit_total: 0,
    }];
    const ventas = [venta("2026-07-28T12:00:00Z", 800, 800)];
    const r = cajasDesactualizadas(cajas, ventas);
    expect(r).toHaveLength(1);
    expect(r[0].efectivo).toEqual({ guardado: 500, real: 800 });
  });

  it("una caja al día no se reporta", () => {
    const cajas = [{
      id: "c1", opened_at: "2026-07-28T09:00:00Z", status: "closed",
      cash_total: 800, transfer_total: 0, credit_total: 0,
    }];
    expect(cajasDesactualizadas(cajas, [venta("2026-07-28T12:00:00Z", 800, 800)])).toEqual([]);
  });

  it("ignora las cajas abiertas: todavía se están moviendo", () => {
    const cajas = [{
      id: "c1", opened_at: "2026-07-28T09:00:00Z", status: "open",
      cash_total: 0, transfer_total: 0, credit_total: 0,
    }];
    expect(cajasDesactualizadas(cajas, [venta("2026-07-28T12:00:00Z", 800, 800)])).toEqual([]);
  });
});
