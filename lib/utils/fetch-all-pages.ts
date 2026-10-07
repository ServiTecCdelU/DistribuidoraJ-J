// Supabase (PostgREST) devuelve como máximo 1000 filas por consulta, aunque se pida
// un .limit() mayor. Para traer todo, se piden páginas con .range(from, to) hasta
// que una venga incompleta.
// `fetchPage` debe armar la consulta de cero en cada llamada y tener un orden
// estable (ej. created_at + id) para que las páginas no se pisen ni salteen filas.
export const PAGE_SIZE = 1000;

type PageResult<T> = { data: T[] | null; error: unknown };

export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize: number = PAGE_SIZE,
): Promise<T[]> {
  let rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw error;
    const page = data ?? [];
    rows = [...rows, ...page];
    if (page.length < pageSize) return rows;
  }
}
