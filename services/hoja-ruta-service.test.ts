import { describe, it, expect, vi, beforeEach } from "vitest";

const uploadMock = vi.fn();
const upsertSelectSingle = vi.fn();
const fromMock = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: uploadMock,
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.test/${path}` } }),
      }),
    },
    from: (...args: any[]) => fromMock(...args),
  },
}));

import { saveHojaRuta } from "./hoja-ruta-service";

let insertedRow: any = null;

beforeEach(() => {
  insertedRow = null;
  uploadMock.mockReset().mockResolvedValue({ error: null });
  upsertSelectSingle.mockReset();
  fromMock.mockReset().mockImplementation(() => ({
    upsert: (row: any) => {
      insertedRow = row;
      return {
        select: () => ({
          single: async () => ({ data: { ...row, created_at: "2026-07-28T10:00:00Z" }, error: null }),
        }),
      };
    },
  }));
});

const baseParams = {
  numero: "064",
  html: "<html>hoja</html>",
  fechaReparto: new Date(2026, 6, 28, 15, 30),
  total: 1500,
  pedidoIds: ["pedido_a_1", "pedido_b_2"],
  cantidadClientes: 2,
  vendedores: ["Juan"],
};

describe("saveHojaRuta", () => {
  it("sube el HTML con el número de hoja en el nombre del archivo", async () => {
    await saveHojaRuta(baseParams);

    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(uploadMock.mock.calls[0][0]).toBe("hoja-ruta-064.html");
    expect(uploadMock.mock.calls[0][2]).toMatchObject({ upsert: true });
  });

  it("guarda la fecha de reparto en horario local sin desplazarse de día", async () => {
    await saveHojaRuta(baseParams);

    expect(insertedRow.fecha_reparto).toBe("2026-07-28");
  });

  it("usa un id derivado del número para que reimprimir pise el mismo registro", async () => {
    await saveHojaRuta(baseParams);

    expect(insertedRow.id).toBe("hr_064");
    expect(insertedRow.cantidad_pedidos).toBe(2);
  });

  it("devuelve la url pública del archivo subido", async () => {
    const hoja = await saveHojaRuta(baseParams);

    expect(hoja.url).toBe("https://cdn.test/hoja-ruta-064.html");
    expect(hoja.total).toBe(1500);
  });

  it("lanza error con mensaje claro si falla la subida", async () => {
    uploadMock.mockResolvedValue({ error: { message: "bucket not found" } });

    await expect(saveHojaRuta(baseParams)).rejects.toThrow("bucket not found");
  });
});
