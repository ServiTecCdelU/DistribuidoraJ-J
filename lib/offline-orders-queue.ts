// lib/offline-orders-queue.ts
// Lógica pura de la cola offline de pedidos (sin dependencias de Supabase ni UI),
// para poder testearla aislada. La usa lib/offline-orders.ts.

import type { CreateOrderInput } from "@/services/orders-service";

const STORAGE_KEY = "offline-orders-queue";

export interface QueuedOrder {
  clientRequestId: string;
  payload: CreateOrderInput;
  enqueuedAt: number;
}

// ─── Pub/sub para que la UI refleje la cantidad de pendientes ─────────────────
type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeOfflineQueue(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function notify(): void {
  listeners.forEach((fn) => fn());
}

// ─── Acceso a localStorage (defensivo: SSR / storage deshabilitado) ───────────
export function readQueue(): QueuedOrder[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as QueuedOrder[]) : [];
  } catch {
    return [];
  }
}

export function writeQueue(queue: QueuedOrder[]): void {
  if (typeof window === "undefined") return;
  try {
    if (queue.length > 0) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // storage lleno o bloqueado: no podemos persistir, pero no rompemos el flujo
  }
  notify();
}

export function getQueuedOrders(): QueuedOrder[] {
  return readQueue();
}

export function getOfflineQueueCount(): number {
  return readQueue().length;
}

/** Agrega a la cola. Idempotente: no reencola si ya existe el mismo clientRequestId. */
export function enqueue(item: QueuedOrder): void {
  const queue = readQueue();
  if (queue.some((q) => q.clientRequestId === item.clientRequestId)) return;
  writeQueue([...queue, item]);
}

/** Quita de la cola por clientRequestId. */
export function dequeue(clientRequestId: string): void {
  writeQueue(readQueue().filter((q) => q.clientRequestId !== clientRequestId));
}

// ─── Helpers puros ─────────────────────────────────────────────────────────
export function newRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function isOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("offline-timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
