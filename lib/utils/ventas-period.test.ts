import { describe, it, expect } from "vitest";
import { periodRange } from "./ventas-period";

// Fecha fija para resultados determinísticos: jueves 11/06/2026 14:30 local.
const NOW = new Date(2026, 5, 11, 14, 30, 0);

describe("periodRange", () => {
  it("'all' no aplica límite de fecha", () => {
    expect(periodRange("all", undefined, undefined, NOW)).toEqual({ from: null, to: null });
  });

  it("'today' arranca a las 00:00 del día actual y sin tope", () => {
    const { from, to } = periodRange("today", undefined, undefined, NOW);
    expect(to).toBeNull();
    const d = new Date(from!);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(5);
    expect(d.getDate()).toBe(11);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
  });

  it("'week' arranca 7 días antes a las 00:00", () => {
    const { from } = periodRange("week", undefined, undefined, NOW);
    const d = new Date(from!);
    expect(d.getDate()).toBe(4);
    expect(d.getMonth()).toBe(5);
    expect(d.getHours()).toBe(0);
  });

  it("'month' arranca el día 1 del mes actual", () => {
    const { from } = periodRange("month", undefined, undefined, NOW);
    const d = new Date(from!);
    expect(d.getDate()).toBe(1);
    expect(d.getMonth()).toBe(5);
  });

  it("'year' arranca el 1 de enero del año actual", () => {
    const { from } = periodRange("year", undefined, undefined, NOW);
    const d = new Date(from!);
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(1);
  });

  it("'custom' usa desde 00:00 y hasta 23:59:59.999 inclusive", () => {
    const { from, to } = periodRange("custom", "2026-06-01", "2026-06-10", NOW);
    const f = new Date(from!);
    const t = new Date(to!);
    expect(f.getHours()).toBe(0);
    expect(f.getMinutes()).toBe(0);
    expect(t.getHours()).toBe(23);
    expect(t.getMinutes()).toBe(59);
    expect(t.getSeconds()).toBe(59);
    expect(t.getMilliseconds()).toBe(999);
  });

  it("'custom' sin fechas no aplica límites", () => {
    expect(periodRange("custom", "", "", NOW)).toEqual({ from: null, to: null });
  });
});
