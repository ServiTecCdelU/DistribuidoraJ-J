import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock del service: simula la creación del pedido en BD (con o sin red).
const { createOrder } = vi.hoisted(() => ({ createOrder: vi.fn() }));
vi.mock("@/services/orders-service", () => ({ createOrder }));

import {
  submitOrderResilient,
  flushOfflineOrders,
  getOfflineQueueCount,
  getQueuedOrders,
} from "./offline-orders";
import type { CreateOrderInput } from "@/services/orders-service";

function createFakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  };
}

function setOnline(value: boolean) {
  Object.defineProperty(globalThis, "navigator", {
    value: { onLine: value },
    configurable: true,
    writable: true,
  });
}

const input: CreateOrderInput = {
  clientName: "Juan",
  items: [],
  address: "Calle 1",
  status: "pending",
};

beforeEach(() => {
  (globalThis as any).window = { localStorage: createFakeStorage() };
  setOnline(true);
  createOrder.mockReset();
});

afterEach(() => {
  delete (globalThis as any).window;
});

describe("submitOrderResilient — SIN señal", () => {
  it("no llama a createOrder, encola el pedido y devuelve queued", async () => {
    setOnline(false);

    const result = await submitOrderResilient(input);

    expect(result.mode).toBe("queued");
    expect(createOrder).not.toHaveBeenCalled();
    expect(getOfflineQueueCount()).toBe(1);
    // El pedido encolado lleva un clientRequestId para idempotencia.
    expect(getQueuedOrders()[0].payload.clientRequestId).toBeTruthy();
  });

  it("resuelve al instante aunque la red estuviera caída (no se cuelga)", async () => {
    setOnline(false);
    // Si intentara crear, quedaría colgado para siempre: probamos que NO lo intenta.
    createOrder.mockImplementation(() => new Promise(() => {}));

    await expect(submitOrderResilient(input)).resolves.toMatchObject({
      mode: "queued",
    });
  });
});

describe("submitOrderResilient — CON señal", () => {
  it("crea el pedido y devuelve sent", async () => {
    createOrder.mockResolvedValue({ id: "pedido_juan_1" });

    const result = await submitOrderResilient(input);

    expect(result.mode).toBe("sent");
    expect(createOrder).toHaveBeenCalledOnce();
    expect(getOfflineQueueCount()).toBe(0);
  });

  it("si la red falla en pleno envío, lo encola en vez de perderlo", async () => {
    createOrder.mockRejectedValue(new Error("network"));

    const result = await submitOrderResilient(input);

    expect(result.mode).toBe("queued");
    expect(getOfflineQueueCount()).toBe(1);
  });
});

describe("flushOfflineOrders — al recuperar señal", () => {
  it("sube los pedidos encolados y vacía la cola", async () => {
    setOnline(false);
    await submitOrderResilient(input);
    await submitOrderResilient({ ...input, clientName: "Pedro" });
    expect(getOfflineQueueCount()).toBe(2);

    setOnline(true);
    createOrder.mockResolvedValue({ id: "ok" });
    const restantes = await flushOfflineOrders();

    expect(restantes).toBe(0);
    expect(createOrder).toHaveBeenCalledTimes(2);
    expect(getOfflineQueueCount()).toBe(0);
  });

  it("reenvía con el MISMO clientRequestId (idempotencia anti-duplicados)", async () => {
    setOnline(false);
    const queued = await submitOrderResilient(input);
    const idEncolado = getQueuedOrders()[0].clientRequestId;

    setOnline(true);
    createOrder.mockResolvedValue({ id: "ok" });
    await flushOfflineOrders();

    const enviado = createOrder.mock.calls[0][0] as CreateOrderInput;
    expect(enviado.clientRequestId).toBe(idEncolado);
    expect(queued.mode).toBe("queued");
  });

  it("si sigue sin señal, mantiene los pedidos en cola", async () => {
    setOnline(false);
    await submitOrderResilient(input);

    // Vuelve 'online' pero el server aún no responde (createOrder falla).
    setOnline(true);
    createOrder.mockRejectedValue(new Error("network"));
    const restantes = await flushOfflineOrders();

    expect(restantes).toBe(1);
    expect(getOfflineQueueCount()).toBe(1);
  });

  it("flush sin pendientes no hace nada", async () => {
    const restantes = await flushOfflineOrders();
    expect(restantes).toBe(0);
    expect(createOrder).not.toHaveBeenCalled();
  });
});
