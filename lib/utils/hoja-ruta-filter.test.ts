import { describe, it, expect } from "vitest";
import { filtrarHojasRuta } from "./hoja-ruta-filter";

const hojas = [
  { numero: "056", fechaReparto: "2026-07-23" },
  { numero: "057", fechaReparto: "2026-07-24" },
  { numero: "063", fechaReparto: "2026-07-28" },
];

describe("filtrarHojasRuta", () => {
  it("devuelve todas las hojas cuando no hay filtros", () => {
    expect(filtrarHojasRuta(hojas, {})).toHaveLength(3);
  });

  it("encuentra la hoja escribiendo el número sin ceros a la izquierda", () => {
    expect(filtrarHojasRuta(hojas, { numero: "56" })).toEqual([hojas[0]]);
  });

  it("encuentra la hoja escribiendo el número con ceros a la izquierda", () => {
    expect(filtrarHojasRuta(hojas, { numero: "056" })).toEqual([hojas[0]]);
  });

  it("filtra por fecha de reparto exacta", () => {
    expect(filtrarHojasRuta(hojas, { fecha: "2026-07-28" })).toEqual([hojas[2]]);
  });

  it("combina número y fecha", () => {
    expect(filtrarHojasRuta(hojas, { numero: "57", fecha: "2026-07-23" })).toHaveLength(0);
    expect(filtrarHojasRuta(hojas, { numero: "57", fecha: "2026-07-24" })).toEqual([hojas[1]]);
  });

  it("devuelve vacío cuando ninguna hoja coincide", () => {
    expect(filtrarHojasRuta(hojas, { numero: "999" })).toHaveLength(0);
  });
});
