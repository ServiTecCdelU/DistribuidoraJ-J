import { useEffect, useState } from "react";

/**
 * Devuelve el valor "debounceado" tras `delay` ms sin cambios.
 * Usar en búsquedas sobre listados grandes (productos, clientes, ventas)
 * para no filtrar en cada tecla.
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);

  return debounced;
}
