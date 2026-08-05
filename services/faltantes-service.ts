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

export interface FaltanteDetalle extends Faltante {
  clienteNombre: string;
  precioUnitarioConGanancia: number;
  precioUnitarioSinGanancia: number;
  totalConGanancia: number;
  totalSinGanancia: number;
}

export interface FaltantesResumen {
  items: FaltanteDetalle[];
  totalUnidades: number;
  clientesAfectados: number;
  totalConGanancia: number;
  totalSinGanancia: number;
}

// Razón costo/venta de un producto (0..1), igual criterio que rentabilidad-service.
const MARGEN_DEFAULT_PCT = 30;
function ratioCosto(gananciaGlobal: number | null | undefined): number {
  if (gananciaGlobal != null && gananciaGlobal >= 0) return 1 / (1 + gananciaGlobal / 100);
  return 1 / (1 + MARGEN_DEFAULT_PCT / 100);
}

// Resumen global del historial de faltantes (todos los clientes) para el dashboard de productos.
export async function getFaltantesResumen(): Promise<FaltantesResumen> {
  const { data, error } = await supabase
    .from("cliente_faltantes")
    .select("*")
    .order("fecha", { ascending: false });
  if (error || !data || data.length === 0) {
    return { items: [], totalUnidades: 0, clientesAfectados: 0, totalConGanancia: 0, totalSinGanancia: 0 };
  }

  const clienteIds = [...new Set(data.map((r: any) => r.cliente_id).filter(Boolean))];
  const productoIds = [...new Set(data.map((r: any) => r.producto_id).filter(Boolean))];

  const [{ data: clientesData }, { data: productosData }] = await Promise.all([
    clienteIds.length > 0
      ? supabase.from("clientes").select("id, name").in("id", clienteIds)
      : Promise.resolve({ data: [] as any[] }),
    productoIds.length > 0
      ? supabase.from("productos").select("id, price, precio_base, ganancia_global").in("id", productoIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const clienteNombreMap = new Map<string, string>((clientesData ?? []).map((c: any) => [c.id, c.name]));
  const productoMap = new Map<string, { price: number; precioBase: number | null; ganancia: number | null }>(
    (productosData ?? []).map((p: any) => [
      p.id,
      { price: Number(p.price) || 0, precioBase: p.precio_base != null ? Number(p.precio_base) : null, ganancia: p.ganancia_global != null ? Number(p.ganancia_global) : null },
    ]),
  );

  let totalUnidades = 0;
  let totalConGanancia = 0;
  let totalSinGanancia = 0;

  const items: FaltanteDetalle[] = data.map((r: any) => {
    const cantidad = r.cantidad ?? 0;
    const producto = productoMap.get(r.producto_id);
    const precioConGanancia = producto?.price ?? 0;
    const precioSinGanancia = producto?.precioBase != null && producto.precioBase > 0
      ? producto.precioBase
      : precioConGanancia * ratioCosto(producto?.ganancia);

    const totalCon = precioConGanancia * cantidad;
    const totalSin = precioSinGanancia * cantidad;
    totalUnidades += cantidad;
    totalConGanancia += totalCon;
    totalSinGanancia += totalSin;

    return {
      id: r.id,
      clienteId: r.cliente_id,
      productoId: r.producto_id,
      productoNombre: r.producto_nombre,
      cantidad,
      pedidoId: r.pedido_id ?? null,
      fecha: r.fecha,
      motivo: (r.motivo ?? 'faltante') as MotivoFaltante,
      clienteNombre: clienteNombreMap.get(r.cliente_id) ?? 'Cliente desconocido',
      precioUnitarioConGanancia: precioConGanancia,
      precioUnitarioSinGanancia: precioSinGanancia,
      totalConGanancia: totalCon,
      totalSinGanancia: totalSin,
    };
  });

  return {
    items,
    totalUnidades,
    clientesAfectados: clienteIds.length,
    totalConGanancia,
    totalSinGanancia,
  };
}
