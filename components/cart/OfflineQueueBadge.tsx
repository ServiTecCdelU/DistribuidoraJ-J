// components/cart/OfflineQueueBadge.tsx
"use client";

import { CloudUpload } from "lucide-react";
import { useOfflineQueue } from "@/hooks/useOfflineQueue";

/**
 * Avisa al vendedor que tiene pedidos guardados sin subir (sin señal). Se sube
 * solo al recuperar conexión; el badge desaparece cuando la cola queda vacía.
 */
export function OfflineQueueBadge() {
  const count = useOfflineQueue();
  if (count === 0) return null;

  return (
    <div className="flex items-center gap-2 rounded-2xl border-2 border-amber-200 bg-amber-50 px-3 py-2 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
      <CloudUpload className="h-4 w-4 shrink-0 animate-pulse" />
      <span className="text-xs font-medium">
        {count === 1
          ? "1 pedido pendiente de envío — se subirá al recuperar señal"
          : `${count} pedidos pendientes de envío — se subirán al recuperar señal`}
      </span>
    </div>
  );
}
