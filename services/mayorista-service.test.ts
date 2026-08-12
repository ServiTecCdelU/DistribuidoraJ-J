import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: { from: vi.fn() } }));

import { buildVentaSearchFilter } from "./mayorista-service";

describe("buildVentaSearchFilter", () => {
  it("busca por nombre, codigo, code e id", () => {
    const filtro = buildVentaSearchFilter("0215882");

    expect(filtro).toBe(
      "name.ilike.%0215882%,codigo.ilike.%0215882%,code.ilike.%0215882%,id.ilike.%0215882%",
    );
  });

  it("incluye el id para encontrar productos del mayorista sin columna codigo", () => {
    const filtro = buildVentaSearchFilter("0215882");

    // "prod_mp_0215882" solo matchea por id cuando codigo/code estan en NULL
    expect(filtro).toContain("id.ilike.%0215882%");
  });
});
