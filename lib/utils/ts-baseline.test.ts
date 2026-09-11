import { describe, it, expect } from "vitest";
import { contarPorArchivo, compararConBaseline } from "./ts-baseline";

const salida = [
  "app/pedidos/page.tsx(310,70): error TS2345: Argument of type 'string | undefined'",
  "app/pedidos/page.tsx(801,29): error TS2339: Property 'catch' does not exist",
  "hooks/useCart.ts(278,48): error TS2339: Property 'stockLocal' does not exist",
  "",
  "Found 3 errors in 2 files.",
].join("\n");

describe("contarPorArchivo", () => {
  it("cuenta los errores agrupados por archivo", () => {
    expect(contarPorArchivo(salida)).toEqual({
      "app/pedidos/page.tsx": 2,
      "hooks/useCart.ts": 1,
    });
  });

  it("ignora las líneas que no son errores", () => {
    expect(contarPorArchivo("Found 0 errors.\n\n")).toEqual({});
  });

  it("normaliza las barras de Windows", () => {
    const r = contarPorArchivo("app\\pedidos\\page.tsx(1,1): error TS1: x");
    expect(r).toEqual({ "app/pedidos/page.tsx": 1 });
  });

  it("salida vacía devuelve objeto vacío", () => {
    expect(contarPorArchivo("")).toEqual({});
  });
});

describe("compararConBaseline", () => {
  it("sin cambios: pasa", () => {
    const b = { "a.ts": 2, "b.ts": 1 };
    const r = compararConBaseline(b, { ...b });
    expect(r.ok).toBe(true);
    expect(r.empeoraron).toEqual([]);
    expect(r.mejoraron).toEqual([]);
  });

  it("un archivo con más errores que antes: falla", () => {
    const r = compararConBaseline({ "a.ts": 2 }, { "a.ts": 5 });
    expect(r.ok).toBe(false);
    expect(r.empeoraron).toEqual([{ archivo: "a.ts", antes: 2, ahora: 5 }]);
  });

  // Es el caso que dejó pasar `order_cancelled`: un archivo nuevo con errores.
  it("un archivo que antes no tenía errores: falla", () => {
    const r = compararConBaseline({ "a.ts": 2 }, { "a.ts": 2, "nuevo.ts": 1 });
    expect(r.ok).toBe(false);
    expect(r.empeoraron).toEqual([{ archivo: "nuevo.ts", antes: 0, ahora: 1 }]);
  });

  it("un archivo con menos errores: pasa y lo informa", () => {
    const r = compararConBaseline({ "a.ts": 5 }, { "a.ts": 2 });
    expect(r.ok).toBe(true);
    expect(r.mejoraron).toEqual([{ archivo: "a.ts", antes: 5, ahora: 2 }]);
  });

  it("un archivo que quedó sin errores cuenta como mejora", () => {
    const r = compararConBaseline({ "a.ts": 3 }, {});
    expect(r.ok).toBe(true);
    expect(r.mejoraron).toEqual([{ archivo: "a.ts", antes: 3, ahora: 0 }]);
  });

  // El total puede quedar igual mientras un archivo mejora y otro empeora: comparar
  // totales no alcanza, justamente lo que permitió que un error pasara inadvertido.
  it("detecta el empeoramiento aunque el total no cambie", () => {
    const r = compararConBaseline({ "a.ts": 3, "b.ts": 1 }, { "a.ts": 2, "b.ts": 2 });
    expect(r.ok).toBe(false);
    expect(r.empeoraron).toEqual([{ archivo: "b.ts", antes: 1, ahora: 2 }]);
    expect(r.mejoraron).toEqual([{ archivo: "a.ts", antes: 3, ahora: 2 }]);
  });

  it("informa los totales de antes y ahora", () => {
    const r = compararConBaseline({ "a.ts": 3, "b.ts": 1 }, { "a.ts": 2 });
    expect(r.totalAntes).toBe(4);
    expect(r.totalAhora).toBe(2);
  });

  it("baseline vacío y sin errores: pasa", () => {
    const r = compararConBaseline({}, {});
    expect(r.ok).toBe(true);
    expect(r.totalAhora).toBe(0);
  });
});
