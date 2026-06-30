// hooks/useOfflineQueue.ts
"use client";

import { useEffect, useState } from "react";
import {
  getOfflineQueueCount,
  subscribeOfflineQueue,
  flushOfflineOrders,
} from "@/lib/offline-orders";
import { toast } from "sonner";

/**
 * Expone la cantidad de pedidos pendientes de envío y dispara el flush automático:
 * al montar, al volver la señal (`online`) y cada 30s como red de seguridad.
 */
export function useOfflineQueue(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    setCount(getOfflineQueueCount());
    const unsubscribe = subscribeOfflineQueue(() =>
      setCount(getOfflineQueueCount()),
    );

    const flush = async () => {
      const before = getOfflineQueueCount();
      if (before === 0) return;
      const after = await flushOfflineOrders();
      const enviados = before - after;
      if (enviados > 0) {
        toast.success(
          enviados === 1
            ? "Se envió 1 pedido pendiente"
            : `Se enviaron ${enviados} pedidos pendientes`,
        );
      }
    };

    flush();
    window.addEventListener("online", flush);
    const interval = setInterval(flush, 30_000);

    return () => {
      unsubscribe();
      window.removeEventListener("online", flush);
      clearInterval(interval);
    };
  }, []);

  return count;
}
