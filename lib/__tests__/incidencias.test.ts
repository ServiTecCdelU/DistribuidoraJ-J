import { describe, it, expect } from "vitest";
import {
  splitIncidencias,
  incidenciasVenta,
  incidenciasCaja,
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
