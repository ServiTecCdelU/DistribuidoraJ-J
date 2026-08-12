import { describe, it, expect } from "vitest";
import {
  periodosEntre,
  montoPorPeriodo,
  resumirSuscripcion,
  labelPeriodo,
  type DatosSuscripcion,
  type PagoSuscripcion,
} from "./suscripcion";

const datos: DatosSuscripcion = {
  montoMensual: 200000,
  sucursales: 1,
  diaVencimiento: 10,
  fechaInicio: "2026-05-01",
  estado: "activo",
};

const pago = (periodo: string, extra: Partial<PagoSuscripcion> = {}): PagoSuscripcion => ({
  id: `pago_${periodo}`,
  periodo,
  monto: 200000,
  fechaPago: `${periodo}-05`,
  metodo: "transferencia",
  comprobante: null,
  estado: "pagado",
  notas: null,
  ...extra,
});

describe("periodosEntre", () => {
  it("incluye ambos extremos y cruza el cambio de año", () => {
    expect(periodosEntre("2025-11", "2026-02")).toEqual([
      "2025-11", "2025-12", "2026-01", "2026-02",
    ]);
  });

  it("devuelve un solo periodo cuando desde y hasta son iguales", () => {
    expect(periodosEntre("2026-08", "2026-08")).toEqual(["2026-08"]);
  });
});

describe("montoPorPeriodo", () => {
  it("multiplica el abono por la cantidad de sucursales", () => {
    expect(montoPorPeriodo({ ...datos, sucursales: 3 })).toBe(600000);
  });

  it("nunca cobra menos de una sucursal", () => {
    expect(montoPorPeriodo({ ...datos, sucursales: 0 })).toBe(200000);
  });
});

describe("resumirSuscripcion", () => {
  const hoy = new Date("2026-08-12T12:00:00");

  it("marca al dia cuando estan pagados todos los meses desde el inicio", () => {
    const pagos = ["2026-05", "2026-06", "2026-07", "2026-08"].map((p) => pago(p));
    const r = resumirSuscripcion(datos, pagos, hoy);

    expect(r.alDia).toBe(true);
    expect(r.mesesPagados).toBe(4);
    expect(r.mesesAdeudados).toBe(0);
    expect(r.deuda).toBe(0);
    expect(r.totalPagado).toBe(800000);
  });

  it("calcula la deuda de los meses faltantes", () => {
    const pagos = [pago("2026-05"), pago("2026-07")];
    const r = resumirSuscripcion(datos, pagos, hoy);

    expect(r.periodosAdeudados).toEqual(["2026-06", "2026-08"]);
    expect(r.deuda).toBe(400000);
    expect(r.alDia).toBe(false);
  });

  it("no cuenta como pagado un periodo en estado pendiente", () => {
    const pagos = [pago("2026-05"), pago("2026-06", { estado: "pendiente" })];
    const r = resumirSuscripcion(datos, pagos, hoy);

    expect(r.periodosAdeudados).toContain("2026-06");
    expect(r.mesesPagados).toBe(1);
  });

  it("informa el ultimo pago y el proximo vencimiento del mes en curso", () => {
    const r = resumirSuscripcion(datos, [pago("2026-05"), pago("2026-07")], hoy);

    expect(r.ultimoPago?.periodo).toBe("2026-07");
    expect(r.proximoVencimiento).toBe("2026-08-10");
  });

  it("pasa el vencimiento al mes siguiente cuando el mes actual ya esta pagado", () => {
    const pagos = ["2026-05", "2026-06", "2026-07", "2026-08"].map((p) => pago(p));
    const r = resumirSuscripcion(datos, pagos, hoy);

    expect(r.proximoVencimiento).toBe("2026-09-10");
  });

  it("factura solo el mes actual cuando no hay fecha de inicio", () => {
    const r = resumirSuscripcion({ ...datos, fechaInicio: null }, [], hoy);

    expect(r.periodosFacturables).toEqual(["2026-08"]);
    expect(r.deuda).toBe(200000);
  });

  it("no factura nada si la suscripcion arranca en el futuro", () => {
    const r = resumirSuscripcion({ ...datos, fechaInicio: "2026-12-01" }, [], hoy);

    expect(r.periodosFacturables).toEqual([]);
    expect(r.alDia).toBe(true);
  });
});

describe("labelPeriodo", () => {
  it("muestra el mes en espanol con el ano", () => {
    expect(labelPeriodo("2026-08")).toBe("Agosto 2026");
  });
});
