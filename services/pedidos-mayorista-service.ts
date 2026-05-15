import { supabase } from "@/lib/supabase";
import type { PedidoMayorista } from "@/lib/types";

const TABLE = "pedidos_mayorista";

function mapRow(row: any): PedidoMayorista {
  return {
    id: row.id,
    fecha: new Date(row.fecha || row.created_at),
    estado: row.estado ?? "borrador",
    productos: row.productos ?? [],
  };
}

export const getPedidosMayorista = async (): Promise<PedidoMayorista[]> => {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .order("fecha", { ascending: false });
  if (error) throw error;
  return (data || []).map(mapRow);
};

export const getPedidoMayoristaActivo = async (): Promise<PedidoMayorista | null> => {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .in("estado", ["enviado", "recibido_parcial"])
    .order("fecha", { ascending: false })
    .limit(1);
  if (error) throw error;
  if (!data || data.length === 0) return null;
  return mapRow(data[0]);
};

export const crearPedidoMayorista = async (
  productos: PedidoMayorista["productos"]
): Promise<PedidoMayorista> => {
  const id = `pm_${Date.now()}`;
  const { error } = await supabase.from(TABLE).insert({
    id,
    fecha: new Date().toISOString(),
    estado: "borrador",
    productos,
  });
  if (error) throw error;
  return { id, fecha: new Date(), estado: "borrador", productos };
};

export const actualizarEstadoPedidoMayorista = async (
  id: string,
  estado: PedidoMayorista["estado"]
): Promise<void> => {
  const { error } = await supabase.from(TABLE).update({ estado }).eq("id", id);
  if (error) throw error;
};

export const actualizarUnidadesRecibidas = async (
  pedidoId: string,
  productos: PedidoMayorista["productos"]
): Promise<void> => {
  const { error } = await supabase.from(TABLE).update({ productos }).eq("id", pedidoId);
  if (error) throw error;
};
