import { describe, it, expect, vi } from "vitest";
import { paginarTodo } from "./paginar";

/** Simula una tabla: devuelve la porción pedida, como hace PostgREST con .range(). */
const tablaDe = (filas: number[], pageSize = 1000) => {
  const llamadas: Array<[number, number]> = [];
  const fetchPage = async (desde: number, hasta: number) => {
    llamadas.push([desde, hasta]);
    return { data: filas.slice(desde, hasta + 1), error: null };
  };
  return { fetchPage, llamadas, pageSize };
};

describe("paginarTodo", () => {
  it("junta todas las páginas en una sola lista", async () => {
    const filas = Array.from({ length: 2500 }, (_, i) => i);
    const t = tablaDe(filas);
    const r = await paginarTodo(t.fetchPage, { pageSize: 1000 });
    expect(r).toHaveLength(2500);
    expect(r[0]).toBe(0);
    expect(r[2499]).toBe(2499);
  });

  it("pide las páginas con los rangos correctos", async () => {
    const t = tablaDe(Array.from({ length: 2500 }, (_, i) => i));
    await paginarTodo(t.fetchPage, { pageSize: 1000 });
    expect(t.llamadas).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it("corta al recibir una página incompleta, sin pedir una de más", async () => {
    const t = tablaDe(Array.from({ length: 1500 }, (_, i) => i));
    await paginarTodo(t.fetchPage, { pageSize: 1000 });
    expect(t.llamadas).toHaveLength(2);
  });

  // Si el total es múltiplo exacto del tamaño de página, la última página viene llena
  // y hace falta una consulta más para saber que no hay nada después.
  it("maneja un total que es múltiplo exacto del tamaño de página", async () => {
    const t = tablaDe(Array.from({ length: 2000 }, (_, i) => i));
    const r = await paginarTodo(t.fetchPage, { pageSize: 1000 });
    expect(r).toHaveLength(2000);
    expect(t.llamadas).toHaveLength(3);
  });

  it("una sola página cuando entra todo", async () => {
    const t = tablaDe([1, 2, 3]);
    const r = await paginarTodo(t.fetchPage, { pageSize: 1000 });
    expect(r).toEqual([1, 2, 3]);
    expect(t.llamadas).toHaveLength(1);
  });

  it("tabla vacía devuelve lista vacía", async () => {
    const t = tablaDe([]);
    expect(await paginarTodo(t.fetchPage)).toEqual([]);
  });

  it("data en null se trata como página vacía", async () => {
    const r = await paginarTodo(async () => ({ data: null, error: null }));
    expect(r).toEqual([]);
  });

  // Un error tiene que cortar el proceso: devolver los datos parciales sería peor que
  // fallar, porque el caller los tomaría como completos (justo lo que pasaba al truncar).
  it("propaga el error en vez de devolver datos parciales", async () => {
    const fetchPage = vi.fn(async (desde: number) =>
      desde === 0
        ? { data: Array.from({ length: 1000 }, (_, i) => i), error: null }
        : { data: null, error: { message: "boom" } },
    );
    await expect(paginarTodo(fetchPage, { pageSize: 1000 })).rejects.toThrow(/boom/);
  });

  it("respeta un tamaño de página distinto", async () => {
    const t = tablaDe(Array.from({ length: 250 }, (_, i) => i));
    const r = await paginarTodo(t.fetchPage, { pageSize: 100 });
    expect(r).toHaveLength(250);
    expect(t.llamadas).toEqual([[0, 99], [100, 199], [200, 299]]);
  });

  // Red de seguridad: si el backend devolviera siempre una página llena, sin tope
  // el bucle no terminaría nunca.
  it("corta al llegar al tope de páginas y avisa", async () => {
    const fetchPage = async () => ({ data: Array.from({ length: 10 }, (_, i) => i), error: null });
    await expect(
      paginarTodo(fetchPage, { pageSize: 10, maxPaginas: 3 }),
    ).rejects.toThrow(/tope de páginas/i);
  });
});
