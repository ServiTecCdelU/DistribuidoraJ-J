import {
  collection,
  doc,
  getDocs,
  getDoc,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  limit,
} from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import type { MayoristaProducto, MayoristaPrefs } from "@/lib/types";
import { toDate } from "@/services/firestore-helpers";
import { invalidateProductsCache } from "@/services/products-service";

const COL = "mayorista_productos";
const PRODUCTS_COLLECTION = "productos";
const PREFS_COL = "configuracion";

// ─── Caché persistente (localStorage + memoria) ───────────────────────────────
// Persiste entre recargas de página para no gastar lecturas de Firestore (50K/día).
// TTL de 2 horas. Se invalida manualmente tras importar o forzar recarga.
const CACHE_KEY = "mayorista_cache_v1";
const CACHE_TTL = 2 * 60 * 60 * 1000; // 2 horas

let _memCache: { data: MayoristaProducto[]; ts: number } | null = null;

function readCache(): { data: MayoristaProducto[]; ts: number } | null {
  if (_memCache) return _memCache;
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { data: MayoristaProducto[]; ts: number };
    if (!parsed?.ts || !Array.isArray(parsed.data)) return null;
    _memCache = parsed;
    return _memCache;
  } catch {
    return null;
  }
}

function writeCache(data: MayoristaProducto[]): void {
  _memCache = { data, ts: Date.now() };
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(_memCache));
  } catch {
    // localStorage puede estar lleno — el caché en memoria sigue activo
  }
}

export const invalidateMayoristaCache = () => {
  _memCache = null;
  if (typeof window !== "undefined") {
    try { localStorage.removeItem(CACHE_KEY); } catch { /* noop */ }
  }
};

// Mapea un documento de mayorista_productos.
// Los campos que ahora viven en "productos" (precioVenta, gananciaGlobal, etc.)
// quedan en 0/undefined hasta que getMayoristaProductos los complete via join.
function mapDoc(id: string, data: Record<string, unknown>): MayoristaProducto {
  return {
    id,
    codigoBarras: (data.codigoBarras as string) ?? "",
    codigo: (data.codigo as string) ?? "",
    nombre: (data.nombre as string) ?? "",
    precioUnitarioMayorista: (data.precioUnitarioMayorista as number) ?? 0,
    rubro: (data.rubro as string) ?? "",
    subrubro: (data.subrubro as string) ?? "",
    categoria: (data.categoria as string) ?? "Sin categoría",
    habilitado: (data.habilitado as boolean) ?? false,
    productoId: data.productoId as string | undefined,
    updatedAt: toDate(data.updatedAt),
    // Campos desde "productos" — se completan en el join de getMayoristaProductos
    precioVenta: 0,
    gananciaGlobal: undefined,
    gananciaIndividual: false,
    stockLocal: 0,
    unidadesPorBulto: undefined,
    seDivideEn: undefined,
  };
}

export const getMayoristaProductos = async (forceRefresh = false): Promise<MayoristaProducto[]> => {
  if (!forceRefresh) {
    const cached = readCache();
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return cached.data;
    }
  }

  const snap = await getDocs(collection(firestore, COL));
  const data = snap.docs.map((d) => mapDoc(d.id, d.data() as Record<string, unknown>));

  // Join con "productos" para los habilitados — obtiene precioVenta, gananciaGlobal, etc.
  const habilitados = data.filter((p) => p.habilitado && p.productoId);
  if (habilitados.length > 0) {
    const productosSnaps = await Promise.all(
      habilitados.map((p) => getDoc(doc(firestore, PRODUCTS_COLLECTION, p.productoId!)))
    );
    const productosMap = new Map<string, Record<string, unknown>>();
    productosSnaps.forEach((snap) => {
      if (snap.exists()) productosMap.set(snap.id, snap.data() as Record<string, unknown>);
    });

    for (const p of data) {
      if (!p.productoId) continue;
      const pd = productosMap.get(p.productoId);
      if (!pd) continue;
      p.precioVenta = (pd.precioVenta as number) ?? (pd.price as number) ?? 0;
      p.gananciaGlobal = pd.gananciaGlobal as number | undefined;
      p.gananciaIndividual = (pd.gananciaIndividual as boolean) ?? false;
      p.stockLocal = (pd.stock as number) ?? 0;
      p.unidadesPorBulto = pd.unidadesPorBulto as number | undefined;
      p.seDivideEn = pd.seDivideEn as number | undefined;
    }
  }

  const sorted = data.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  writeCache(sorted);
  return sorted;
};

const BATCH_SIZE = 300;
const PARALLEL_BATCHES = 2; // 2 x 300 = 600 writes concurrentes, dentro del límite

export const upsertMayoristaProductos = async (
  productos: Omit<MayoristaProducto, "id" | "updatedAt" | "stockLocal" | "precioVenta" | "gananciaGlobal" | "gananciaIndividual" | "habilitado" | "unidadesPorBulto" | "seDivideEn" | "productoId">[],
  onProgress?: (done: number, total: number) => void
): Promise<void> => {
  // Pre-lectura para detectar cambios y solo escribir los productos que cambiaron.
  onProgress?.(0, productos.length);
  const snap = await getDocs(collection(firestore, COL));
  const existingMap = new Map<string, Record<string, unknown>>();
  snap.docs.forEach((d) => existingMap.set(d.id, d.data() as Record<string, unknown>));

  const toWrite = productos.filter((p) => {
    const id = `mp_${p.codigo.replace(/[^a-zA-Z0-9]/g, "_")}`;
    const ex = existingMap.get(id);
    if (!ex) return true; // nuevo producto
    return (
      ex.nombre !== p.nombre ||
      ex.precioUnitarioMayorista !== p.precioUnitarioMayorista ||
      ex.codigoBarras !== (p.codigoBarras ?? "") ||
      ex.rubro !== (p.rubro ?? "") ||
      ex.subrubro !== (p.subrubro ?? "")
    );
  });

  if (toWrite.length === 0) {
    onProgress?.(productos.length, productos.length);
    return;
  }

  const chunks: typeof toWrite[] = [];
  for (let i = 0; i < toWrite.length; i += BATCH_SIZE) {
    chunks.push(toWrite.slice(i, i + BATCH_SIZE));
  }

  let done = 0;

  for (const chunk of chunks) {
    const batch = writeBatch(firestore);
    for (const p of chunk) {
      const id = `mp_${p.codigo.replace(/[^a-zA-Z0-9]/g, "_")}`;
      batch.set(
        doc(firestore, COL, id),
        {
          codigoBarras: p.codigoBarras ?? "",
          codigo: p.codigo,
          nombre: p.nombre,
          precioUnitarioMayorista: p.precioUnitarioMayorista,
          rubro: p.rubro ?? "",
          subrubro: p.subrubro ?? "",
          categoria: p.categoria,
          updatedAt: serverTimestamp(),
        },
        { merge: true } // preserva habilitado, productoId, etc.
      );
    }
    await batch.commit();
    done += chunk.length;
    onProgress?.(Math.round((done / toWrite.length) * productos.length), productos.length);
  }
  onProgress?.(productos.length, productos.length);

  // Reconstruir caché aplicando los cambios escritos
  const updatedMap = new Map(existingMap);
  for (const p of toWrite) {
    const id = `mp_${p.codigo.replace(/[^a-zA-Z0-9]/g, "_")}`;
    const existing = existingMap.get(id) ?? {};
    updatedMap.set(id, {
      ...existing,
      codigoBarras: p.codigoBarras ?? "",
      codigo: p.codigo,
      nombre: p.nombre,
      precioUnitarioMayorista: p.precioUnitarioMayorista,
      rubro: p.rubro ?? "",
      subrubro: p.subrubro ?? "",
      categoria: p.categoria,
      updatedAt: new Date(),
    });
  }
  const updatedData = Array.from(updatedMap.entries())
    .map(([id, data]) => mapDoc(id, data))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  writeCache(updatedData);
};

// Aplica un porcentaje a una lista de productos — escribe en "productos", no en mayorista_productos.
export const applyGananciaToProducts = async (
  porcentaje: number,
  products: Array<{ id: string; productoId: string; precioUnitarioMayorista: number }>,
  onProgress?: (done: number, total: number) => void
): Promise<void> => {
  const chunks: typeof products[] = [];
  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    chunks.push(products.slice(i, i + BATCH_SIZE));
  }

  let done = 0;
  for (let i = 0; i < chunks.length; i += PARALLEL_BATCHES) {
    const group = chunks.slice(i, i + PARALLEL_BATCHES);
    await Promise.all(
      group.map(async (chunk) => {
        const batch = writeBatch(firestore);
        chunk.forEach(({ productoId, precioUnitarioMayorista }) => {
          const precioVenta = Math.round(precioUnitarioMayorista * (1 + porcentaje / 100) * 100) / 100;
          batch.update(doc(firestore, PRODUCTS_COLLECTION, productoId), {
            price: precioVenta,
            precioVenta,
            gananciaGlobal: porcentaje,
            gananciaIndividual: false,
          });
        });
        await batch.commit();
        done += chunk.length;
        onProgress?.(done, products.length);
      })
    );
  }

  // Invalidar caché de productos (catálogo, nueva venta) y actualizar caché mayorista
  invalidateProductsCache();
  const cached = readCache();
  if (cached) {
    const updateMap = new Map(products.map((p) => [p.id, p.precioUnitarioMayorista]));
    const updated = cached.data.map((p) => {
      if (!updateMap.has(p.id)) return p;
      return {
        ...p,
        precioVenta: Math.round(updateMap.get(p.id)! * (1 + porcentaje / 100) * 100) / 100,
        gananciaGlobal: porcentaje,
        gananciaIndividual: false,
      };
    });
    writeCache(updated);
    // Notificar a la UI que mayorista/productos se actualizó (para que componentes hagan refresh)
    if (typeof window !== "undefined") {
      try { window.dispatchEvent(new CustomEvent("mayorista:updated", { detail: { porcentaje } })); } catch { /* noop */ }
    }
  }
};

// Actualiza precio de venta individual en "productos"
export const updateProductoPrecioVenta = async (
  productoId: string,
  precio: number,
  gananciaIndividual: boolean
): Promise<void> => {
  await updateDoc(doc(firestore, PRODUCTS_COLLECTION, productoId), {
    price: precio,
    precioVenta: precio,
    gananciaIndividual,
  });
  // Invalidar caché de productos (catálogo, nueva venta) y actualizar caché mayorista
  invalidateProductsCache();
  const cached = readCache();
  if (cached) {
    const updated = cached.data.map((p) =>
      p.productoId === productoId
        ? { ...p, precioVenta: precio, gananciaIndividual }
        : p
    );
    writeCache(updated);
    if (typeof window !== "undefined") {
      try { window.dispatchEvent(new CustomEvent("mayorista:updated", { detail: { productoId, precio } })); } catch { /* noop */ }
    }
  }
};

// ─── Habilitar / Deshabilitar ─────────────────────────────────────────────────

export const habilitarProducto = async (
  mp: MayoristaProducto,
  unidadesPorBulto: number,
  seDivideEn: number,
  precioVentaOverride?: number,
  gananciaGlobal?: number
): Promise<void> => {
  // Si no se pasó gananciaGlobal, intentar obtener la ganancia "global" vigente
  // leyendo un producto que tenga gananciaGlobal registrada (si existe).
  let finalGanancia: number | undefined = gananciaGlobal;
  if (finalGanancia == null) {
    try {
      const q = query(collection(firestore, PRODUCTS_COLLECTION), where("gananciaGlobal", ">=", 0), limit(1));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const pd = snap.docs[0].data() as Record<string, unknown>;
        const g = pd.gananciaGlobal as number | undefined;
        if (typeof g === "number" && !isNaN(g)) finalGanancia = g;
      }
    } catch {
      // si falla la lectura, simplemente no aplicamos ganancia global
    }
  }

  // Calcular precio final: prioridad -> override pasado por UI, sino aplicar ganancia final si existe,
  // sino usar precio ya presente en mp.precioVenta
  const precio = precioVentaOverride != null
    ? precioVentaOverride
    : finalGanancia != null && mp.precioUnitarioMayorista > 0
      ? Math.round(mp.precioUnitarioMayorista * (1 + finalGanancia / 100) * 100) / 100
      : mp.precioVenta;

  let productoId = mp.productoId;

  if (productoId) {
    // Actualizar producto existente
    await updateDoc(doc(firestore, PRODUCTS_COLLECTION, productoId), {
      price: precio,
      precioVenta: precio,
      unidadesPorBulto,
      seDivideEn,
      disabled: false,
      ...(finalGanancia != null ? { gananciaGlobal: finalGanancia } : {}),
    });
  } else {
    // Crear nuevo producto con ID determinístico
    productoId = `prod_${mp.id}`;
    await setDoc(doc(firestore, PRODUCTS_COLLECTION, productoId), {
      name: mp.nombre,
      description: mp.codigo,
      price: precio,
      precioVenta: precio,
      stock: 0,
      imageUrl: "",
      category: mp.rubro || mp.categoria || "Sin categoría",
      disabled: false,
      unidadesPorBulto,
      seDivideEn,
      ...(finalGanancia != null ? { gananciaGlobal: finalGanancia } : {}),
      createdAt: serverTimestamp(),
    });
  }

  // Solo habilitado y productoId se guardan en mayorista_productos
  await updateDoc(doc(firestore, COL, mp.id), {
    habilitado: true,
    productoId,
    updatedAt: serverTimestamp(),
  });

  // Actualizar caché local
  const cached = readCache();
  if (cached) {
    const updated = cached.data.map((p) =>
      p.id === mp.id
        ? { ...p, habilitado: true, unidadesPorBulto, seDivideEn, productoId, precioVenta: precio, gananciaGlobal: finalGanancia ?? p.gananciaGlobal, updatedAt: new Date() }
        : p
    );
    writeCache(updated);
    if (typeof window !== "undefined") {
      try { window.dispatchEvent(new CustomEvent("mayorista:updated", { detail: { mpId: mp.id, productoId } })); } catch { /* noop */ }
    }
  }
};

export const deshabilitarProducto = async (mp: MayoristaProducto): Promise<void> => {
  await updateDoc(doc(firestore, COL, mp.id), {
    habilitado: false,
    updatedAt: serverTimestamp(),
  });

  // Deshabilitar en "productos"
  const productoId = mp.productoId ?? `prod_${mp.id}`;
  try {
    await updateDoc(doc(firestore, PRODUCTS_COLLECTION, productoId), {
      disabled: true,
    });
  } catch { /* si el doc no existe, ignorar */ }

  // Actualizar caché local
  const cached = readCache();
  if (cached) {
    const updated = cached.data.map((p) =>
      p.id === mp.id ? { ...p, habilitado: false, updatedAt: new Date() } : p
    );
    writeCache(updated);
    if (typeof window !== "undefined") {
      try { window.dispatchEvent(new CustomEvent("mayorista:updated", { detail: { mpId: mp.id, habilitado: false } })); } catch { /* noop */ }
    }
  }
};

// Sincroniza habilitado en mayorista_productos dado un productoId (relación inversa)
export const sincronizarHabilitadoEnMayorista = async (productoId: string, habilitado: boolean): Promise<void> => {
  const q = query(collection(firestore, COL), where("productoId", "==", productoId));
  const snap = await getDocs(q);
  if (snap.empty) return;
  await Promise.all(
    snap.docs.map((d) => updateDoc(d.ref, { habilitado, updatedAt: serverTimestamp() }))
  );
  invalidateMayoristaCache();
};

// ─── Preferencias de columnas (por usuario) ───────────────────────────────────

const PREFS_DEFAULTS: MayoristaPrefs = {
  showCodigoBarras: true,
  showRubro: true,
  showSubrubro: true,
};

export const getMayoristaPrefs = async (userId: string): Promise<MayoristaPrefs> => {
  const snap = await getDoc(doc(firestore, PREFS_COL, `${userId}_mayorista_prefs`));
  if (!snap.exists()) return { ...PREFS_DEFAULTS };
  const data = snap.data();
  return {
    showCodigoBarras: data.showCodigoBarras ?? true,
    showRubro: data.showRubro ?? true,
    showSubrubro: data.showSubrubro ?? true,
  };
};

export const saveMayoristaPrefs = async (
  userId: string,
  prefs: MayoristaPrefs
): Promise<void> => {
  await setDoc(doc(firestore, PREFS_COL, `${userId}_mayorista_prefs`), prefs);
};
