import { describe, it, expect } from "vitest";
import {
  splitIncidencias,
  incidenciasVenta,
  incidenciasCaja,
  incidenciasDeVentas,
  type ItemNoEntregado,
} from "../utils/incidencias";

const items: ItemNoEntregado[] = [
  { price: 100, quantity: 2, motivo: "rotura" },        // 200
  { price: 50, quantity: 3, motivo: "faltante" },       // 150
  { price: 80, quantity: 1, motivo: "no_quiso" },       // 80
  { price: 200, quantity: 1, itemDiscount: 10, motivo: "no_quiso" }, // 180
];

describe("splitIncidencias", () => {
  it("agrupa por motivo y aplica descuento por item", () => {
    expect(splitIncidencias(items)).toEqual({ rotura: 200, faltante: 150, rechazo: 260 });
  });

  it("cuenta como rotura los items sin motivo", () => {
    expect(splitIncidencias([{ price: 100, quantity: 1 }])).toEqual({ rotura: 100, faltante: 0, rechazo: 0 });
  });

  it("devuelve ceros para lista vacía o nula", () => {
    expect(splitIncidencias([])).toEqual({ rotura: 0, faltante: 0, rechazo: 0 });
    expect(splitIncidencias(undefined)).toEqual({ rotura: 0, faltante: 0, rechazo: 0 });
  });
});

describe("incidenciasVenta", () => {
  it("separa pérdida (solo rotura), faltante y rechazo", () => {
    expect(incidenciasVenta(items)).toEqual({ perdida: 200, faltante: 150, rechazo: 260 });
  });

  it("no mezcla faltante dentro de pérdida", () => {
    const soloFaltante: ItemNoEntregado[] = [{ price: 10, quantity: 5, motivo: "faltante" }];
    expect(incidenciasVenta(soloFaltante)).toEqual({ perdida: 0, faltante: 50, rechazo: 0 });
  });
});

describe("incidenciasCaja", () => {
  it("suma rotura + faltante como pérdida y rechazo como devolución", () => {
    expect(incidenciasCaja(items)).toEqual({ perdida: 350, devolucion: 260 });
  });
});

describe("incidenciasDeVentas", () => {
  it("suma las incidencias de varias ventas separando los tres motivos", () => {
    const ventas = [
      { itemsNoEntregados: [{ price: 100, quantity: 2, motivo: "rotura" }] },
      { itemsNoEntregados: [{ price: 50, quantity: 3, motivo: "faltante" }] },
      { itemsNoEntregados: [{ price: 80, quantity: 1, motivo: "no_quiso" }] },
    ];
    expect(incidenciasDeVentas(ventas)).toEqual({
      perdida: 200,
      faltante: 150,
      rechazo: 80,
      total: 430,
      count: 3,
    });
  });

  // El faltante no es plata perdida: la mercadería vuelve al depósito. Por eso se
  // informa aparte y no sumado a la pérdida (antes la caja los mostraba juntos).
  it("no mezcla el faltante dentro de la pérdida", () => {
    const ventas = [
      { itemsNoEntregados: [
        { price: 100, quantity: 1, motivo: "rotura" },
        { price: 100, quantity: 1, motivo: "faltante" },
      ] },
    ];
    const r = incidenciasDeVentas(ventas);
    expect(r.perdida).toBe(100);
    expect(r.faltante).toBe(100);
  });

  it("cuenta solo las ventas que tienen alguna incidencia", () => {
    const ventas = [
      { itemsNoEntregados: [{ price: 100, quantity: 1, motivo: "rotura" }] },
      { itemsNoEntregados: [] },
      {},
    ];
    expect(incidenciasDeVentas(ventas).count).toBe(1);
  });

  it("aplica el descuento por item", () => {
    const ventas = [
      { itemsNoEntregados: [{ price: 200, quantity: 1, itemDiscount: 10, motivo: "rotura" }] },
    ];
    expect(incidenciasDeVentas(ventas).perdida).toBe(180);
  });

  it("lista vacía devuelve todo en cero", () => {
    expect(incidenciasDeVentas([])).toEqual({
      perdida: 0,
      faltante: 0,
      rechazo: 0,
      total: 0,
      count: 0,
    });
  });
});
