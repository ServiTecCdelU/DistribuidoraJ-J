import { describe, it, expect } from "vitest";
import {
  salidasRemito,
  reposicionEliminarRemito,
  reconciliarCobro,
  type ItemRemito,
  type AjusteCobro,
} from "../utils/stock-remito";

describe("salidasRemito", () => {
  it("descuenta la cantidad de cada item (movimiento negativo)", () => {
    const items: ItemRemito[] = [
      { productId: "mp_001", quantity: 3 },
      { productId: "mp_002", quantity: 5 },
    ];
    expect(salidasRemito(items)).toEqual([
      { productId: "mp_001", cantidad: -3 },
      { productId: "mp_002", cantidad: -5 },
    ]);
  });

  it("suma el regalo del mismo producto a la salida", () => {
    const items: ItemRemito[] = [{ productId: "mp_001", quantity: 10, regalo: 2 }];
    expect(salidasRemito(items)).toEqual([{ productId: "mp_001", cantidad: -12 }]);
  });

  it("omite items sin productId o sin cantidad", () => {
    const items: ItemRemito[] = [
      { productId: "mp_001", quantity: 0 },
      { quantity: 5 } as ItemRemito,
      { productId: "mp_003", quantity: 4 },
    ];
    expect(salidasRemito(items)).toEqual([{ productId: "mp_003", cantidad: -4 }]);
  });

  it("devuelve vacío para lista vacía", () => {
    expect(salidasRemito([])).toEqual([]);
  });
});

describe("reposicionEliminarRemito", () => {
  it("repone todo lo descontado cuando el pedido tenía stock descontado (movimiento positivo)", () => {
    const items: ItemRemito[] = [
      { productId: "mp_001", quantity: 3 },
      { productId: "mp_002", quantity: 5, regalo: 1 },
    ];
    expect(reposicionEliminarRemito(true, items)).toEqual([
      { productId: "mp_001", cantidad: 3 },
      { productId: "mp_002", cantidad: 6 },
    ]);
  });

  it("no repone nada si el stock no se había descontado", () => {
    const items: ItemRemito[] = [{ productId: "mp_001", quantity: 3 }];
    expect(reposicionEliminarRemito(false, items)).toEqual([]);
  });
});

describe("reconciliarCobro", () => {
  const ajustes: AjusteCobro[] = [
    { productId: "mp_001", type: "rotura", quantity: 2 },
    { productId: "mp_002", type: "faltante", quantity: 3 },
    { productId: "mp_003", type: "no_quiere", quantity: 1 },
  ];

  it("con stock ya descontado: repone faltante y no_quiere, ignora rotura", () => {
    expect(reconciliarCobro(true, ajustes)).toEqual([
      { productId: "mp_002", cantidad: 3 },
      { productId: "mp_003", cantidad: 1 },
    ]);
  });

  it("sin stock descontado (legacy): solo descuenta la rotura", () => {
    expect(reconciliarCobro(false, ajustes)).toEqual([
      { productId: "mp_001", cantidad: -2 },
    ]);
  });

  it("sin ajustes no genera movimientos", () => {
    expect(reconciliarCobro(true, [])).toEqual([]);
    expect(reconciliarCobro(false, [])).toEqual([]);
  });

  it("ignora ajustes con cantidad cero", () => {
    const conCero: AjusteCobro[] = [
      { productId: "mp_001", type: "faltante", quantity: 0 },
      { productId: "mp_002", type: "rotura", quantity: 0 },
    ];
    expect(reconciliarCobro(true, conCero)).toEqual([]);
    expect(reconciliarCobro(false, conCero)).toEqual([]);
  });
});
