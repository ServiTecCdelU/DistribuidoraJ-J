import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock del cliente Supabase: captura la fila insertada y simula queries select.
const { insert, from, setSelectData } = vi.hoisted(() => {
  const insert = vi.fn().mockResolvedValue({ data: null, error: null });
  let selectData: any[] = [];
  const setSelectData = (d: any[]) => { selectData = d; };
  const builder: any = {
    insert,
    select: () => builder,
    like: () => builder,
    eq: () => builder,
    limit: () => builder,
    then: (resolve: (v: { data: any[] }) => unknown) => resolve({ data: selectData }),
  };
  const from = vi.fn(() => builder);
  return { insert, from, setSelectData };
});
vi.mock("@/lib/supabase", () => ({ supabase: { from } }));

// ID legible determinístico para aislar el test.
vi.mock("@/services/supabase-helpers", () => ({
  generateReadableId: vi.fn().mockResolvedValue("producto_milanesa_1"),
}));

import { createProduct, suggestUniqueCodigo, codigoExists } from "./products-service";
import type { Product } from "@/lib/types";

const baseInput: Omit<Product, "id" | "createdAt"> = {
  name: "Milanesa de Pollo",
  description: "Rica",
  price: 1500,
  stock: 10,
  imageUrl: "",
  category: "Congelados",
} as Omit<Product, "id" | "createdAt">;

describe("createProduct", () => {
  beforeEach(() => {
    insert.mockClear();
    from.mockClear();
    setSelectData([]);
  });

  it("inserta en la tabla productos con el ID legible generado", async () => {
    await createProduct(baseInput);

    expect(from).toHaveBeenCalledWith("productos");
    const row = insert.mock.calls[0][0];
    expect(row.id).toBe("producto_milanesa_1");
    expect(row.name).toBe("Milanesa de Pollo");
    expect(row.price).toBe(1500);
    expect(row.stock).toBe(10);
    expect(row.category).toBe("Congelados");
  });

  it("mapea codigo a las columnas code y codigo", async () => {
    await createProduct({ ...baseInput, codigo: "ABC123" } as any);

    const row = insert.mock.calls[0][0];
    expect(row.code).toBe("ABC123");
    expect(row.codigo).toBe("ABC123");
  });

  it("usa disabled=false por defecto cuando no se especifica", async () => {
    await createProduct(baseInput);

    expect(insert.mock.calls[0][0].disabled).toBe(false);
  });

  it("devuelve el producto con id, disabled y createdAt", async () => {
    const result = await createProduct(baseInput);

    expect(result.id).toBe("producto_milanesa_1");
    expect(result.disabled).toBe(false);
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.name).toBe("Milanesa de Pollo");
  });

  it("aplica descuento 0 por defecto y campos de precio null cuando faltan", async () => {
    await createProduct(baseInput);

    const row = insert.mock.calls[0][0];
    expect(row.descuento).toBe(0);
    expect(row.precio_base).toBeNull();
    expect(row.ganancia_global).toBeNull();
  });
});

describe("suggestUniqueCodigo", () => {
  beforeEach(() => setSelectData([]));

  it("sugiere P00001 cuando no hay códigos con el prefijo", async () => {
    setSelectData([]);
    expect(await suggestUniqueCodigo()).toBe("P00001");
  });

  it("incrementa el mayor sufijo existente", async () => {
    setSelectData([{ codigo: "P00003" }, { codigo: "P00010" }, { codigo: "P00007" }]);
    expect(await suggestUniqueCodigo()).toBe("P00011");
  });

  it("ignora sufijos no numéricos", async () => {
    setSelectData([{ codigo: "Pabc" }, { codigo: "P00004" }]);
    expect(await suggestUniqueCodigo()).toBe("P00005");
  });
});

describe("codigoExists", () => {
  beforeEach(() => setSelectData([]));

  it("devuelve false para código vacío sin consultar", async () => {
    expect(await codigoExists("  ")).toBe(false);
  });

  it("devuelve true cuando la consulta trae al menos una fila", async () => {
    setSelectData([{ id: "producto_x_1" }]);
    expect(await codigoExists("P00001")).toBe(true);
  });

  it("devuelve false cuando la consulta no trae filas", async () => {
    setSelectData([]);
    expect(await codigoExists("P99999")).toBe(false);
  });
});
