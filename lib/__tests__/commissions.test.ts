import { describe, it, expect } from "vitest";
import { buildSellerCommissions, type VentaRow, type DevolucionRow } from "../utils/commissions";

const ventas: VentaRow[] = [
  { id: "v1", sale_number: "1", client_name: "Kiosco A", total: 1000, created_at: "2026-01-10T10:00:00Z", seller_id: "s1" },
  { id: "v2", sale_number: "2", client_name: "Kiosco B", total: 2000, created_at: "2026-02-10T10:00:00Z", seller_id: "s1" },
];

describe("buildSellerCommissions", () => {
  it("calcula la comisión como porcentaje del total de cada venta", () => {
    const res = buildSellerCommissions({
      sellerId: "s1",
      commissionRate: 10,
      ventas,
      devoluciones: [],
      paidCutoff: null,
    });
    const v1 = res.find((c) => c.id === "v1")!;
    expect(v1.commissionAmount).toBe(100);
    expect(res.find((c) => c.id === "v2")!.commissionAmount).toBe(200);
  });

  it("ordena por fecha descendente (más reciente primero)", () => {
    const res = buildSellerCommissions({
      sellerId: "s1",
      commissionRate: 10,
      ventas,
      devoluciones: [],
      paidCutoff: null,
    });
    expect(res[0].id).toBe("v2");
    expect(res[1].id).toBe("v1");
  });

  it("marca como pagadas solo las ventas anteriores al cutoff", () => {
    const res = buildSellerCommissions({
      sellerId: "s1",
      commissionRate: 10,
      ventas,
      devoluciones: [],
      paidCutoff: new Date("2026-01-15T00:00:00Z"),
    });
    expect(res.find((c) => c.id === "v1")!.isPaid).toBe(true);
    expect(res.find((c) => c.id === "v2")!.isPaid).toBe(false);
  });

  it("incluye devoluciones como comisión negativa", () => {
    const devoluciones: DevolucionRow[] = [
      { id: "d1", sale_id: "v1", sale_number: "1", client_name: "Kiosco A", total: 500, commission_amount: 50, commission_rate: 10, created_at: "2026-03-01T10:00:00Z" },
    ];
    const res = buildSellerCommissions({
      sellerId: "s1",
      commissionRate: 10,
      ventas: [],
      devoluciones,
      paidCutoff: null,
    });
    expect(res[0].commissionAmount).toBe(-50);
    expect(res[0].saleTotal).toBe(-500);
    expect(res[0].saleNumber).toBe("Devolución #1");
  });

  it("usa la tasa del vendedor por defecto y devuelve vacío sin datos", () => {
    expect(
      buildSellerCommissions({ sellerId: "s1", commissionRate: 12, ventas: [], devoluciones: [], paidCutoff: null }),
    ).toEqual([]);
  });
});
