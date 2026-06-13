import { describe, it, expect } from "vitest";
import {
  ordersToMoveAll,
  ordersToMoveSelected,
  type MovableOrder,
} from "../utils/order-move";

const ids = <T extends MovableOrder>(r: { toMove: T[] }) => r.toMove.map((o) => o.id);

// 3 pedidos del mismo cliente (Juan) — el caso que reportó el bug.
const juan: MovableOrder[] = [
  { id: "p1", status: "pending", remitoNumber: null },
  { id: "p2", status: "pending", remitoNumber: null },
  { id: "p3", status: "pending", remitoNumber: null },
];

describe("ordersToMoveSelected", () => {
  it("mueve solo los pedidos seleccionados por id, no todos los del cliente", () => {
    const sel = new Set(["p2", "p3"]);
    const { toMove } = ordersToMoveSelected(juan, "pending", "preparation", sel);
    expect(ids({ toMove })).toEqual(["p2", "p3"]);
  });

  it("retiene un pedido al no seleccionarlo (1 de 3)", () => {
    const sel = new Set(["p1"]);
    const { toMove } = ordersToMoveSelected(juan, "pending", "preparation", sel);
    expect(ids({ toMove })).toEqual(["p1"]);
  });

  it("ignora pedidos de otro estado distinto al de origen", () => {
    const mixto: MovableOrder[] = [
      { id: "p1", status: "pending" },
      { id: "p2", status: "preparation" },
    ];
    const sel = new Set(["p1", "p2"]);
    const { toMove } = ordersToMoveSelected(mixto, "pending", "preparation", sel);
    expect(ids({ toMove })).toEqual(["p1"]);
  });

  it("devuelve vacío sin selección", () => {
    const { toMove } = ordersToMoveSelected(juan, "pending", "preparation", new Set());
    expect(toMove).toEqual([]);
  });

  it("al pasar a reparto exige remito y cuenta los que faltan", () => {
    const prep: MovableOrder[] = [
      { id: "p1", status: "preparation", remitoNumber: "R-1" },
      { id: "p2", status: "preparation", remitoNumber: null },
      { id: "p3", status: "preparation", remitoNumber: "R-3" },
    ];
    const sel = new Set(["p1", "p2", "p3"]);
    const { toMove, sinRemito } = ordersToMoveSelected(prep, "preparation", "delivery", sel);
    expect(ids({ toMove })).toEqual(["p1", "p3"]);
    expect(sinRemito).toBe(2 - 1);
  });
});

describe("ordersToMoveAll", () => {
  it("mueve todos los del estado de origen excepto los retenidos por id", () => {
    const held = new Set(["p2"]);
    const { toMove } = ordersToMoveAll(juan, "pending", "preparation", held);
    expect(ids({ toMove })).toEqual(["p1", "p3"]);
  });

  it("no exige remito cuando el destino no es reparto", () => {
    const { toMove, sinRemito } = ordersToMoveAll(juan, "pending", "preparation", new Set());
    expect(ids({ toMove })).toEqual(["p1", "p2", "p3"]);
    expect(sinRemito).toBe(0);
  });

  it("al pasar a reparto filtra sin remito y respeta retenidos", () => {
    const prep: MovableOrder[] = [
      { id: "p1", status: "preparation", remitoNumber: "R-1" },
      { id: "p2", status: "preparation", remitoNumber: "R-2" },
      { id: "p3", status: "preparation", remitoNumber: null },
    ];
    const held = new Set(["p2"]);
    const { toMove, sinRemito } = ordersToMoveAll(prep, "preparation", "delivery", held);
    expect(ids({ toMove })).toEqual(["p1"]);
    expect(sinRemito).toBe(1);
  });
});
