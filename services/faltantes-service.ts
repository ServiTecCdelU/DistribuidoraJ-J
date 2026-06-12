// services/faltantes-service.ts
// Historial de productos que NO se le pudieron enviar a un cliente (faltantes).
// Cuando un remito excluye un producto por falta de stock, queda registrado acá.
// Cuando en un remito posterior ese producto sí se le envía, se elimina del historial.
import { supabase } from "@/lib/supabase";

export type MotivoFaltante = 'faltante' | 'no_quiso'

export interface Faltante {
  id: string;
  clienteId: string;
  productoId: string;
  productoNombre: string;
  cantidad: number;
  pedidoId: string | null;
  fecha: string;
  motivo: MotivoFaltante;
}

export interface FaltanteItem {
  productId: string;
  name: string;
  quantity: number;
  motivo?: MotivoFaltante;
}

// Registra (o actualiza) los productos faltantes de un cliente.
// Upsert por (cliente_id, producto_id): si el producto ya estaba pendiente, refresca cantidad y fecha.
export async function registrarFaltantes(
  clienteId: string,
  items: FaltanteItem[],
  pedidoId?: string,
): Promise<void> {
  if (!clienteId || items.length === 0) return;
  const rows = items
    .filter((i) => i.productId && (i.quantity ?? 0) > 0)
    .map((i) => ({
      cliente_id: clienteId,
      producto_id: i.productId,
      producto_nombre: i.name,
      cantidad: i.quantity,
      pedido_id: pedidoId ?? null,
      fecha: new Date().toISOString(),
      motivo: i.motivo ?? 'faltante',
    }));
  if (rows.length === 0) return;
  await supabase.from("cliente_faltantes").upsert(rows, { onConflict: "cliente_id,producto_id" });
}

// Elimina del historial los productos que sí se le enviaron al cliente.
export async function quitarFaltantes(clienteId: string, productoIds: string[]): Promise<void> {
  if (!clienteId || productoIds.length === 0) return;
  await supabase
    .from("cliente_faltantes")
    .delete()
    .eq("cliente_id", clienteId)
    .in("producto_id", productoIds);
}

// Elimina un único faltante por id (quitado manual desde la ficha del cliente).
export async function eliminarFaltante(id: string): Promise<void> {
  if (!id) return;
  await supabase.from("cliente_faltantes").delete().eq("id", id);
}

// Lista los faltantes de un cliente, más recientes primero.
export async function getFaltantesByCliente(clienteId: string): Promise<Faltante[]> {
  if (!clienteId) return [];
  const { data, error } = await supabase
    .from("cliente_faltantes")
    .select("*")
    .eq("cliente_id", clienteId)
    .order("fecha", { ascending: false });
  if (error || !data) return [];
  return data.map((r: any) => ({
    id: r.id,
    clienteId: r.cliente_id,
    productoId: r.producto_id,
    productoNombre: r.producto_nombre,
    cantidad: r.cantidad ?? 0,
    pedidoId: r.pedido_id ?? null,
    fecha: r.fecha,
    motivo: (r.motivo ?? 'faltante') as MotivoFaltante,
  }));
}
