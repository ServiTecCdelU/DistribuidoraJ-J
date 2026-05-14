import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  orderBy,
  serverTimestamp,
  limit,
} from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import type { PedidoMayorista } from "@/lib/types";
import { toDate } from "@/services/firestore-helpers";

const COL = "pedidos_mayorista";

function mapDoc(id: string, data: Record<string, unknown>): PedidoMayorista {
  return {
    id,
    fecha: toDate(data.fecha),
    estado: (data.estado as PedidoMayorista["estado"]) ?? "borrador",
    productos: (data.productos as PedidoMayorista["productos"]) ?? [],
  };
}

export const getPedidosMayorista = async (): Promise<PedidoMayorista[]> => {
  const q = query(collection(firestore, COL), orderBy("fecha", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => mapDoc(d.id, d.data() as Record<string, unknown>));
};

export const getPedidoMayoristaActivo = async (): Promise<PedidoMayorista | null> => {
  const q = query(collection(firestore, COL), orderBy("fecha", "desc"), limit(10));
  const snap = await getDocs(q);
  const activo = snap.docs.find((d) => {
    const estado = d.data().estado;
    return estado === "enviado" || estado === "recibido_parcial";
  });
  if (!activo) return null;
  return mapDoc(activo.id, activo.data() as Record<string, unknown>);
};

export const crearPedidoMayorista = async (
  productos: PedidoMayorista["productos"]
): Promise<PedidoMayorista> => {
  const id = `pm_${Date.now()}`;
  await setDoc(doc(firestore, COL, id), {
    fecha: serverTimestamp(),
    estado: "borrador",
    productos,
  });
  return { id, fecha: new Date(), estado: "borrador", productos };
};

export const actualizarEstadoPedidoMayorista = async (
  id: string,
  estado: PedidoMayorista["estado"]
): Promise<void> => {
  await updateDoc(doc(firestore, COL, id), { estado });
};

export const actualizarUnidadesRecibidas = async (
  pedidoId: string,
  productos: PedidoMayorista["productos"]
): Promise<void> => {
  await updateDoc(doc(firestore, COL, pedidoId), { productos });
};
