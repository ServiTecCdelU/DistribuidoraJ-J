import { describe, it, expect } from "vitest";
import {
  salidasRemito,
  reposicionEliminarRemito,
  reconciliarCobro,
  aplicarAjustesAItems,
  type ItemRemito,
  type AjusteCobro,
  type ItemAjustable,
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
      { productId: "mp_002", cantidad: 3, motivo: "faltante" },
      { productId: "mp_003", cantidad: 1, motivo: "no_quiere" },
    ]);
  });

  it("sin stock descontado (legacy): solo descuenta la rotura", () => {
    expect(reconciliarCobro(false, ajustes)).toEqual([
      { productId: "mp_001", cantidad: -2, motivo: "rotura" },
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

describe("aplicarAjustesAItems", () => {
  it("descuenta la cantidad ajustada de un item simple", () => {
    const items: ItemAjustable[] = [{ productId: "mp_001", quantity: 10, price: 100 }];
    const ajustes: AjusteCobro[] = [{ productId: "mp_001", type: "rotura", quantity: 4 }];
    expect(aplicarAjustesAItems(items, ajustes)).toEqual([
      { productId: "mp_001", quantity: 6, price: 100 },
    ]);
  });

  // Caso real: remito R-2026-01782 (PANADERIA TIKI). La yerba figuraba en dos
  // renglones de 10; una rotura de 10 borraba los dos (20 unidades) y dejaba
  // $20.758,70 cobrados sin item en la venta.
  it("con el producto duplicado descuenta el total pedido, no una vez por renglón", () => {
    const items: ItemAjustable[] = [
      { productId: "mp_yerba", quantity: 10, price: 2075.87 },
      { productId: "mp_otro", quantity: 5, price: 500 },
      { productId: "mp_yerba", quantity: 10, price: 2075.87 },
    ];
    const ajustes: AjusteCobro[] = [{ productId: "mp_yerba", type: "rotura", quantity: 10 }];
    expect(aplicarAjustesAItems(items, ajustes)).toEqual([
      { productId: "mp_otro", quantity: 5, price: 500 },
      { productId: "mp_yerba", quantity: 10, price: 2075.87 },
    ]);
  });

  it("consume renglones en orden hasta agotar la cantidad ajustada", () => {
    const items: ItemAjustable[] = [
      { productId: "mp_001", quantity: 4, price: 10 },
      { productId: "mp_001", quantity: 9, price: 10 },
    ];
    const ajustes: AjusteCobro[] = [{ productId: "mp_001", type: "faltante", quantity: 6 }];
    expect(aplicarAjustesAItems(items, ajustes)).toEqual([
      { productId: "mp_001", quantity: 7, price: 10 },
    ]);
  });

  it("suma los distintos motivos sobre el mismo producto", () => {
    const items: ItemAjustable[] = [{ productId: "mp_001", quantity: 10, price: 10 }];
    const ajustes: AjusteCobro[] = [
      { productId: "mp_001", type: "rotura", quantity: 2 },
      { productId: "mp_001", type: "no_quiere", quantity: 3 },
    ];
    expect(aplicarAjustesAItems(items, ajustes)).toEqual([
      { productId: "mp_001", quantity: 5, price: 10 },
    ]);
  });

  it("nunca deja cantidades negativas si el ajuste excede lo pedido", () => {
    const items: ItemAjustable[] = [{ productId: "mp_001", quantity: 3, price: 10 }];
    const ajustes: AjusteCobro[] = [{ productId: "mp_001", type: "rotura", quantity: 99 }];
    expect(aplicarAjustesAItems(items, ajustes)).toEqual([]);
  });

  it("deja intactos los items sin ajuste", () => {
    const items: ItemAjustable[] = [
      { productId: "mp_001", quantity: 3, price: 10 },
      { productId: "mp_002", quantity: 7, price: 20 },
    ];
    expect(aplicarAjustesAItems(items, [])).toEqual(items);
  });

  it("preserva los campos extra del item (nombre, código, descuento)", () => {
    const items: ItemAjustable[] = [
      { productId: "mp_001", quantity: 10, price: 10, name: "YERBA", codigo: "0102075", itemDiscount: 5 } as ItemAjustable,
    ];
    const ajustes: AjusteCobro[] = [{ productId: "mp_001", type: "rotura", quantity: 4 }];
    expect(aplicarAjustesAItems(items, ajustes)).toEqual([
      { productId: "mp_001", quantity: 6, price: 10, name: "YERBA", codigo: "0102075", itemDiscount: 5 },
    ]);
  });
});
