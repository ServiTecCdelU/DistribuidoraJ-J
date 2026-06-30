// lib/offline-orders.ts
// Envío resiliente de pedidos a domicilio del vendedor.
//
// Problema: el vendedor en campo confirma un pedido sin señal y el `await` queda
// colgado para siempre ("procesando..."). Solución: si no hay conexión o la red
// falla, el pedido se guarda en una cola local (ver offline-orders-queue.ts) y se
// sube automáticamente al recuperar señal. La idempotencia la garantiza
// `clientRequestId` (UUID) + el índice único en la columna `client_request_id`.
//
// Alcance: SOLO pedidos (status pending). Las ventas atómicas (stock/AFIP) NO se
// encolan — requieren conexión siempre.

import { createOrder, type CreateOrderInput } from "@/services/orders-service";
import type { Order } from "@/lib/types";
import {
  enqueue,
  dequeue,
  readQueue,
  isOnline,
  newRequestId,
  withTimeout,
  getOfflineQueueCount,
} from "@/lib/offline-orders-queue";

export {
  getOfflineQueueCount,
  getQueuedOrders,
  subscribeOfflineQueue,
} from "@/lib/offline-orders-queue";
export type { QueuedOrder } from "@/lib/offline-orders-queue";

const SUBMIT_TIMEOUT_MS = 12_000;

export type SubmitResult =
  | { mode: "sent"; order: Order }
  | { mode: "queued"; clientRequestId: string };

/**
 * Envía un pedido de forma resiliente:
 * - Sin señal → lo guarda en la cola y resuelve al instante (no bloquea).
 * - Con señal → intenta crearlo; si la red falla o tarda demasiado, lo encola.
 * El `clientRequestId` evita duplicados en cualquier reintento.
 */
export async function submitOrderResilient(
  input: CreateOrderInput,
): Promise<SubmitResult> {
  const clientRequestId = input.clientRequestId ?? newRequestId();
  const payload: CreateOrderInput = { ...input, clientRequestId };

  if (!isOnline()) {
    enqueue({ clientRequestId, payload, enqueuedAt: Date.now() });
    return { mode: "queued", clientRequestId };
  }

  try {
    const order = await withTimeout(createOrder(payload), SUBMIT_TIMEOUT_MS);
    return { mode: "sent", order };
  } catch {
    // Falló por red/timeout: encolar para reintentar al volver la señal.
    enqueue({ clientRequestId, payload, enqueuedAt: Date.now() });
    return { mode: "queued", clientRequestId };
  }
}

let flushing = false;

/**
 * Reintenta subir todos los pedidos en cola. Se detiene al primer fallo de red
 * (sigue sin señal) para no quemar reintentos. Devuelve cuántos quedan pendientes.
 */
export async function flushOfflineOrders(): Promise<number> {
  if (flushing || !isOnline()) return getOfflineQueueCount();
  flushing = true;
  try {
    for (const item of readQueue()) {
      try {
        await withTimeout(createOrder(item.payload), SUBMIT_TIMEOUT_MS);
        dequeue(item.clientRequestId);
      } catch {
        // Sigue sin señal: cortar y reintentar más tarde.
        break;
      }
    }
  } finally {
    flushing = false;
  }
  return getOfflineQueueCount();
}
