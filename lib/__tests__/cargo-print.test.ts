import { describe, it, expect } from "vitest";
import { buildCargoListHtml, type CargoGroup } from "../../app/pedidos/cargo-print";
import type { Order, Client } from "@/lib/types";

const order = (over: Partial<Order>): Order => ({
  id: "o1",
  clientId: "c1",
  clientName: "Kiosco A",
  items: [],
  status: "preparation",
  createdAt: new Date(),
  address: "Calle 123",
  remitoNumber: "R-1",
  ...(over as any),
}) as Order;

const clients: Client[] = [
  { id: "c1", name: "Kiosco A", currentBalance: 5000, debtClassification: "moroso", codigo: "10" } as Client,
];

const calcTotal = () => 1000;

describe("buildCargoListHtml", () => {
  it("incluye el cliente, su deuda y el remito de pedidos con remito vigente", () => {
    const groups: CargoGroup[] = [{ client: "Kiosco A", orders: [order({})] }];
    const html = buildCargoListHtml({
      groups, clients,
      heldOrderIds: new Set(), selectedOrderIds: new Set(), calcTotal,
      now: new Date("2026-06-16T10:00:00"),
    });
    expect(html).toContain("Listado de Carga");
    expect(html).toContain("Kiosco A");
    expect(html).toContain("MOROSO");
    expect(html).toContain("R-1");
    expect(html).toContain("Calle 123");
  });

  it("excluye pedidos retenidos (held)", () => {
    const groups: CargoGroup[] = [{ client: "Kiosco A", orders: [order({ id: "o1" })] }];
    const html = buildCargoListHtml({
      groups, clients,
      heldOrderIds: new Set(["o1"]), selectedOrderIds: new Set(), calcTotal,
    });
    expect(html).not.toContain("Calle 123");
  });

  it("excluye pedidos sin remito generado", () => {
    const groups: CargoGroup[] = [{ client: "Kiosco A", orders: [order({ remitoNumber: undefined })] }];
    const html = buildCargoListHtml({
      groups, clients,
      heldOrderIds: new Set(), selectedOrderIds: new Set(), calcTotal,
    });
    expect(html).not.toContain("Calle 123");
  });
});
