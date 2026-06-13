// Lógica pura de selección de pedidos para transiciones de estado en lote.
// Extraída de app/pedidos/page.tsx para poder testearla de forma aislada.
// Clave: cada pedido se mueve por su `id` individual, nunca por cliente —
// así un cliente con varios pedidos puede tener unos retenidos y otros avanzando.

export type MovableOrder = {
  id: string;
  status: string;
  remitoNumber?: string | null;
};

export type MoveResult<T> = {
  toMove: T[];
  sinRemito: number; // pedidos excluidos por no tener remito (solo al pasar a reparto)
};

const REQUIERE_REMITO = "delivery";

// Aplica el filtro de remito obligatorio cuando el destino es reparto.
function aplicarRemito<T extends MovableOrder>(
  candidatos: T[],
  to: string,
): MoveResult<T> {
  if (to !== REQUIERE_REMITO) return { toMove: candidatos, sinRemito: 0 };
  const conRemito = candidatos.filter((o) => o.remitoNumber);
  return { toMove: conRemito, sinRemito: candidatos.length - conRemito.length };
}

// Pedidos a mover en "Todos a...": del estado de origen, excluyendo retenidos.
export function ordersToMoveAll<T extends MovableOrder>(
  orders: T[],
  from: string,
  to: string,
  heldOrderIds: ReadonlySet<string>,
): MoveResult<T> {
  const candidatos = orders.filter((o) => o.status === from && !heldOrderIds.has(o.id));
  return aplicarRemito(candidatos, to);
}

// Pedidos a mover en selección manual: del estado de origen, solo los seleccionados por id.
export function ordersToMoveSelected<T extends MovableOrder>(
  orders: T[],
  from: string,
  to: string,
  selectedOrderIds: ReadonlySet<string>,
): MoveResult<T> {
  const candidatos = orders.filter((o) => o.status === from && selectedOrderIds.has(o.id));
  return aplicarRemito(candidatos, to);
}
