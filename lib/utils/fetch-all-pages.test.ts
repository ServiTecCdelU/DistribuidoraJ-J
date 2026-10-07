import { describe, it, expect, vi } from "vitest";
import { fetchAllPages } from "./fetch-all-pages";

// Simula una tabla de `total` filas paginada con .range(from, to) inclusive.
function fakeTable(total: number) {
  const rows = Array.from({ length: total }, (_, i) => i);
  return vi.fn(async (from: number, to: number) => ({ data: rows.slice(from, to + 1), error: null }));
}

describe("fetchAllPages", () => {
  it("trae todas las filas cuando superan el tamaño de página", async () => {
    const fetchPage = fakeTable(2112);
    const rows = await fetchAllPages(fetchPage, 1000);
    expect(rows).toHaveLength(2112);
    expect(rows[0]).toBe(0);
    expect(rows[2111]).toBe(2111);
    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(fetchPage).toHaveBeenNthCalledWith(2, 1000, 1999);
  });

  it("con menos filas que una página hace una sola consulta", async () => {
    const fetchPage = fakeTable(5);
    expect(await fetchAllPages(fetchPage, 1000)).toHaveLength(5);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("si el total es múltiplo exacto pide una página extra vacía y corta", async () => {
    const fetchPage = fakeTable(2000);
    expect(await fetchAllPages(fetchPage, 1000)).toHaveLength(2000);
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it("data null se toma como página vacía", async () => {
    const rows = await fetchAllPages(async () => ({ data: null, error: null }));
    expect(rows).toEqual([]);
  });

  it("propaga el error de la consulta", async () => {
    const err = new Error("falló");
    await expect(fetchAllPages(async () => ({ data: null, error: err }))).rejects.toBe(err);
  });
});
