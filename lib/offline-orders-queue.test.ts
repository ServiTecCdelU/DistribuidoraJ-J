import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  enqueue,
  dequeue,
  readQueue,
  getOfflineQueueCount,
  isOnline,
  withTimeout,
  type QueuedOrder,
} from "./offline-orders-queue";

// localStorage falso en memoria para correr en entorno node (sin jsdom).
function createFakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  };
}

const item = (id: string): QueuedOrder => ({
  clientRequestId: id,
  payload: { clientName: "Juan", items: [], address: "Calle 1", status: "pending" },
  enqueuedAt: 1,
});

function setOnline(value: boolean) {
  Object.defineProperty(globalThis, "navigator", {
    value: { onLine: value },
    configurable: true,
    writable: true,
  });
}

beforeEach(() => {
  (globalThis as any).window = { localStorage: createFakeStorage() };
  setOnline(true);
});

afterEach(() => {
  delete (globalThis as any).window;
});

describe("cola offline de pedidos", () => {
  it("empieza vacía", () => {
    expect(getOfflineQueueCount()).toBe(0);
    expect(readQueue()).toEqual([]);
  });

  it("encola un pedido y lo cuenta", () => {
    enqueue(item("a"));
    expect(getOfflineQueueCount()).toBe(1);
    expect(readQueue()[0].clientRequestId).toBe("a");
  });

  it("no duplica al reencolar el mismo clientRequestId", () => {
    enqueue(item("a"));
    enqueue(item("a"));
    expect(getOfflineQueueCount()).toBe(1);
  });

  it("mantiene varios pedidos distintos en orden", () => {
    enqueue(item("a"));
    enqueue(item("b"));
    expect(readQueue().map((q) => q.clientRequestId)).toEqual(["a", "b"]);
  });

  it("quita de la cola por clientRequestId", () => {
    enqueue(item("a"));
    enqueue(item("b"));
    dequeue("a");
    expect(readQueue().map((q) => q.clientRequestId)).toEqual(["b"]);
  });

  it("dequeue de un id inexistente no rompe", () => {
    enqueue(item("a"));
    dequeue("zzz");
    expect(getOfflineQueueCount()).toBe(1);
  });

  it("persiste la cola en localStorage", () => {
    enqueue(item("a"));
    const raw = (globalThis as any).window.localStorage.getItem(
      "offline-orders-queue",
    );
    expect(JSON.parse(raw)[0].clientRequestId).toBe("a");
  });

  it("limpia la clave de storage cuando queda vacía", () => {
    enqueue(item("a"));
    dequeue("a");
    expect(
      (globalThis as any).window.localStorage.getItem("offline-orders-queue"),
    ).toBeNull();
  });
});

describe("isOnline", () => {
  it("es true cuando navigator.onLine es true", () => {
    setOnline(true);
    expect(isOnline()).toBe(true);
  });

  it("es false cuando navigator.onLine es false", () => {
    setOnline(false);
    expect(isOnline()).toBe(false);
  });
});

describe("withTimeout", () => {
  it("resuelve si la promesa termina a tiempo", async () => {
    await expect(withTimeout(Promise.resolve("ok"), 1000)).resolves.toBe("ok");
  });

  it("rechaza si supera el tiempo límite", async () => {
    const lenta = new Promise((r) => setTimeout(r, 50));
    await expect(withTimeout(lenta, 5)).rejects.toThrow("offline-timeout");
  });
});
