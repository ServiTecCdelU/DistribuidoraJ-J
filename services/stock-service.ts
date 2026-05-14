import {
  collection,
  doc,
  getDocs,
  query,
  where,
  orderBy,
  addDoc,
  serverTimestamp,
  updateDoc,
  increment,
  getDoc,
} from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import type { StockMovimiento } from "@/lib/types";
import { toDate } from "@/services/firestore-helpers";

const MOV_COL = "stock_movimientos";
const PROD_COL = "mayorista_productos";

function mapMovimiento(id: string, data: Record<string, unknown>): StockMovimiento {
  return {
    id,
    productoId: (data.productoId as string) ?? "",
    tipo: (data.tipo as StockMovimiento["tipo"]) ?? "ajuste",
    cantidad: (data.cantidad as number) ?? 0,
    referencia: data.referencia as string | undefined,
    fecha: toDate(data.fecha),
  };
}

export const getMovimientosByProducto = async (productoId: string): Promise<StockMovimiento[]> => {
  const q = query(
    collection(firestore, MOV_COL),
    where("productoId", "==", productoId),
    orderBy("fecha", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => mapMovimiento(d.id, d.data() as Record<string, unknown>));
};

/**
 * Registra un movimiento de stock Y actualiza el campo stockLocal del producto.
 * cantidad positiva = entrada (apertura_bulto), negativa = salida (venta).
 */
export const registrarMovimiento = async (params: {
  productoId: string;
  tipo: StockMovimiento["tipo"];
  cantidad: number;
  referencia?: string;
}): Promise<void> => {
  const { productoId, tipo, cantidad, referencia } = params;

  // Registrar movimiento
  await addDoc(collection(firestore, MOV_COL), {
    productoId,
    tipo,
    cantidad,
    referencia: referencia ?? null,
    fecha: serverTimestamp(),
  });

  // Actualizar stockLocal en el producto
  await updateDoc(doc(firestore, PROD_COL, productoId), {
    stockLocal: increment(cantidad),
    updatedAt: serverTimestamp(),
  });
};

/**
 * Descuenta stock de múltiples productos en una misma operación (venta).
 */
export const descontarStockVenta = async (
  items: { productoId: string; cantidad: number }[],
  ventaId: string
): Promise<void> => {
  await Promise.all(
    items.map((item) =>
      registrarMovimiento({
        productoId: item.productoId,
        tipo: "venta",
        cantidad: -item.cantidad,
        referencia: ventaId,
      })
    )
  );
};

/**
 * Actualiza ventas pendientes por orden de fecha (FIFO) cuando llega stock de un producto.
 * Si todos los items de una venta quedan cubiertos, la venta pasa a "listo".
 */
export const actualizarVentasPendientesFIFO = async (
  productoId: string,
  unidadesDisponibles: number
): Promise<void> => {
  if (unidadesDisponibles <= 0) return;

  const q = query(
    collection(firestore, "ventas"),
    where("status", "==", "pendiente"),
    orderBy("createdAt", "asc")
  );
  const snap = await getDocs(q);

  let restante = unidadesDisponibles;

  for (const ventaDoc of snap.docs) {
    if (restante <= 0) break;

    const data = ventaDoc.data();
    const items: any[] = data.items ?? [];

    const tieneProductoPendiente = items.some(
      (i) => i.productId === productoId && (i.cantidadPendienteMayorista ?? 0) > 0
    );
    if (!tieneProductoPendiente) continue;

    let cambiado = false;
    const newItems = items.map((item) => {
      if (item.productId !== productoId) return item;
      const pendiente = item.cantidadPendienteMayorista ?? 0;
      if (pendiente <= 0) return item;

      const cubrir = Math.min(pendiente, restante);
      restante -= cubrir;
      cambiado = true;

      return {
        ...item,
        cantidadPendienteMayorista: pendiente - cubrir,
        cantidadStockLocal: (item.cantidadStockLocal ?? 0) + cubrir,
      };
    });

    if (!cambiado) continue;

    const todoCubierto = newItems.every(
      (i: any) => (i.cantidadPendienteMayorista ?? 0) === 0
    );

    await updateDoc(doc(firestore, "ventas", ventaDoc.id), {
      items: newItems,
      ...(todoCubierto ? { status: "listo" } : {}),
    });
  }
};
