import { describe, it, expect } from "vitest";
import { desglosePago, agregarDesglose, type VentaCobro } from "./caja-desglose";

describe("desglosePago", () => {
  it("efectivo simple: todo lo cobrado va a efectivo", () => {
    const v: VentaCobro = { total: 1000, paymentType: "cash", paymentMethod: "efectivo" };
    expect(desglosePago(v)).toEqual({ efectivo: 1000, transferencia: 0, credito: 0 });
  });

  it("transferencia simple: todo lo cobrado va a transferencia", () => {
    const v: VentaCobro = { total: 1000, paymentType: "cash", paymentMethod: "transferencia" };
    expect(desglosePago(v)).toEqual({ efectivo: 0, transferencia: 1000, credito: 0 });
  });

  it("cuenta corriente: todo va a crédito", () => {
    const v: VentaCobro = { total: 1000, paymentType: "credit" };
    expect(desglosePago(v)).toEqual({ efectivo: 0, transferencia: 0, credito: 1000 });
  });

  // Caso real: venta_panaderiatiki_9. El repartidor cobró $193.675,41 por transferencia
  // pero el total de la venta quedó en $172.916,71. La caja informaba el total y el
  // descuadre de $20.758,70 nunca aparecía.
  it("usa el monto realmente cobrado cuando difiere del total de la venta", () => {
    const v: VentaCobro = {
      total: 172916.71,
      paymentType: "cash",
      paymentMethod: "transferencia",
      transferenciaAmount: 193675.41,
    };
    expect(desglosePago(v)).toEqual({ efectivo: 0, transferencia: 193675.41, credito: 0 });
  });

  it("acepta los campos en snake_case (lecturas crudas de Supabase)", () => {
    const v = {
      total: 172916.71,
      payment_type: "cash",
      payment_method: "transferencia",
      transferencia_amount: 193675.41,
    } as unknown as VentaCobro;
    expect(desglosePago(v)).toEqual({ efectivo: 0, transferencia: 193675.41, credito: 0 });
  });

  it("pago mixto efectivo + transferencia: respeta el split real", () => {
    const v: VentaCobro = {
      total: 1000,
      paymentType: "mixed",
      paymentMethod: "transferencia",
      efectivoAmount: 300,
      transferenciaAmount: 700,
    };
    expect(desglosePago(v)).toEqual({ efectivo: 300, transferencia: 700, credito: 0 });
  });

  it("pago mixto con parte a cuenta corriente", () => {
    const v: VentaCobro = {
      total: 1000,
      paymentType: "mixed",
      paymentMethod: "efectivo",
      efectivoAmount: 400,
      creditAmount: 600,
    };
    expect(desglosePago(v)).toEqual({ efectivo: 400, transferencia: 0, credito: 600 });
  });

  it("mixto sin desglose cargado (ventas viejas): cae a cashAmount según el método", () => {
    const v: VentaCobro = {
      total: 1000,
      paymentType: "mixed",
      paymentMethod: "transferencia",
      cashAmount: 700,
      creditAmount: 300,
    };
    expect(desglosePago(v)).toEqual({ efectivo: 0, transferencia: 700, credito: 300 });
  });

  it("sin paymentMethod asume efectivo", () => {
    const v: VentaCobro = { total: 500, paymentType: "cash" };
    expect(desglosePago(v)).toEqual({ efectivo: 500, transferencia: 0, credito: 0 });
  });

  it("tolera montos nulos o ausentes sin devolver NaN", () => {
    const v = { total: null, paymentType: "cash" } as unknown as VentaCobro;
    expect(desglosePago(v)).toEqual({ efectivo: 0, transferencia: 0, credito: 0 });
  });

  it("un monto cobrado en cero es un dato válido, no un campo ausente", () => {
    const v: VentaCobro = {
      total: 1000,
      paymentType: "cash",
      paymentMethod: "transferencia",
      transferenciaAmount: 0,
      efectivoAmount: 0,
    };
    expect(desglosePago(v)).toEqual({ efectivo: 0, transferencia: 0, credito: 0 });
  });
});

describe("agregarDesglose", () => {
  it("suma el desglose de varias ventas y reporta el desvío contra lo facturado", () => {
    const ventas: VentaCobro[] = [
      { total: 1000, paymentType: "cash", paymentMethod: "efectivo" },
      { total: 2000, paymentType: "cash", paymentMethod: "transferencia" },
      { total: 3000, paymentType: "credit" },
    ];
    expect(agregarDesglose(ventas)).toEqual({
      efectivo: 1000,
      transferencia: 2000,
      credito: 3000,
      cobrado: 6000,
      total: 6000,
      desvio: 0,
      count: 3,
    });
  });

  it("expone el desvío cuando lo cobrado no coincide con lo facturado", () => {
    const ventas: VentaCobro[] = [
      { total: 172916.71, paymentType: "cash", paymentMethod: "transferencia", transferenciaAmount: 193675.41 },
    ];
    const r = agregarDesglose(ventas);
    expect(r.transferencia).toBe(193675.41);
    expect(r.total).toBe(172916.71);
    expect(r.desvio).toBe(20758.7);
  });

  it("lista vacía devuelve todo en cero", () => {
    expect(agregarDesglose([])).toEqual({
      efectivo: 0,
      transferencia: 0,
      credito: 0,
      cobrado: 0,
      total: 0,
      desvio: 0,
      count: 0,
    });
  });
});
