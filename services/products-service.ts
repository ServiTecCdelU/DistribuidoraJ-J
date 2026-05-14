import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  query,
  orderBy,
  limit,
  startAfter,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import type { Product } from "@/lib/types";
import { toDate, generateReadableId } from "@/services/firestore-helpers";

const PRODUCTS_COLLECTION = "productos";

// ─── Caché en localStorage (30 min) ──────────────────────────────────────────
const PROD_CACHE_KEY = "products_cache_v1";
const PROD_CACHE_TTL = 30 * 60 * 1000; // 30 minutos

let _prodMemCache: { data: Product[]; ts: number } | null = null;

function readProductsCache(): { data: Product[]; ts: number } | null {
  if (_prodMemCache) return _prodMemCache;
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PROD_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { data: Product[]; ts: number };
    if (!parsed?.ts || !Array.isArray(parsed.data)) return null;
    _prodMemCache = parsed;
    return _prodMemCache;
  } catch { return null; }
}

function writeProductsCache(data: Product[]): void {
  _prodMemCache = { data, ts: Date.now() };
  if (typeof window === "undefined") return;
  try { localStorage.setItem(PROD_CACHE_KEY, JSON.stringify(_prodMemCache)); } catch { /* noop */ }
}

export function invalidateProductsCache(): void {
  _prodMemCache = null;
  if (typeof window !== "undefined") {
    try { localStorage.removeItem(PROD_CACHE_KEY); } catch { /* noop */ }
  }
}

function mapProduct(docSnap: { id: string; data: () => Record<string, unknown> }): Product {
  const data = docSnap.data();
  return {
    id: docSnap.id,
    name: data.name as string,
    description: data.description as string,
    price: data.price as number,
    stock: data.stock as number,
    imageUrl: data.imageUrl as string,
    category: data.category as string,
    base: (data.base as string) ?? 'crema',
    marca: (data.marca as string) ?? 'Sin identificar',
    sinTacc: (data.sinTacc as boolean) ?? false,
    disabled: (data.disabled as boolean) ?? false,
    createdAt: toDate(data.createdAt),
    // Campos mayorista (presentes cuando el producto fue creado desde mayorista_productos)
    unidadesPorBulto: data.unidadesPorBulto as number | undefined,
    seDivideEn: data.seDivideEn as number | undefined,
    precioVenta: data.precioVenta as number | undefined,
    gananciaGlobal: data.gananciaGlobal as number | undefined,
    gananciaIndividual: data.gananciaIndividual as boolean | undefined,
  };
}

export const getProducts = async (forceRefresh = false): Promise<Product[]> => {
  if (!forceRefresh) {
    const cached = readProductsCache();
    if (cached && Date.now() - cached.ts < PROD_CACHE_TTL) return cached.data;
  }
  const snapshot = await getDocs(collection(firestore, PRODUCTS_COLLECTION));
  const data = snapshot.docs
    .map((d) => mapProduct(d as any))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  writeProductsCache(data);
  return data;
}


export const getProductById = async (id: string): Promise<Product | undefined> => {
  const snapshot = await getDoc(doc(firestore, PRODUCTS_COLLECTION, id))
  if (!snapshot.exists()) return undefined
  return mapProduct(snapshot as any)
}


export const createProduct = async (
  product: Omit<Product, "id" | "createdAt">
): Promise<Product> => {
  const docId = await generateReadableId(firestore, PRODUCTS_COLLECTION, 'producto', product.name)
  await setDoc(doc(firestore, PRODUCTS_COLLECTION, docId), {
    ...product,
    disabled: product.disabled ?? false,
    createdAt: serverTimestamp(),
  });
  invalidateProductsCache();
  return {
    ...product,
    id: docId,
    disabled: product.disabled ?? false,
    createdAt: new Date(),
  };
};

export const updateProduct = async (
  id: string,
  updates: Partial<Product>
): Promise<Product> => {
  await updateDoc(doc(firestore, PRODUCTS_COLLECTION, id), { ...updates });
  invalidateProductsCache();
  // Actualizar caché local en lugar de releer Firestore
  const cached = readProductsCache();
  if (cached) {
    const updated = cached.data.map(p => p.id === id ? { ...p, ...updates } : p);
    writeProductsCache(updated);
    return updated.find(p => p.id === id) ?? { id, ...updates } as Product;
  }
  const fresh = await getProductById(id);
  if (!fresh) throw new Error("Product not found");
  return fresh;
};

export const deleteProduct = async (id: string): Promise<void> => {
  await deleteDoc(doc(firestore, PRODUCTS_COLLECTION, id));
  invalidateProductsCache();
};

export const getProductsPaginated = async (
  pageSize: number = 50,
  lastDoc?: QueryDocumentSnapshot,
): Promise<{ data: Product[]; lastDoc: QueryDocumentSnapshot | null; hasMore: boolean }> => {
  let q = query(
    collection(firestore, PRODUCTS_COLLECTION),
    orderBy("createdAt", "desc"),
    limit(pageSize),
  );

  if (lastDoc) {
    q = query(
      collection(firestore, PRODUCTS_COLLECTION),
      orderBy("createdAt", "desc"),
      startAfter(lastDoc),
      limit(pageSize),
    );
  }

  const snapshot = await getDocs(q);
  const data = snapshot.docs.map((docSnap) => {
    const d = docSnap.data();
    return {
      id: docSnap.id,
      name: d.name,
      description: d.description,
      price: d.price,
      stock: d.stock,
      imageUrl: d.imageUrl,
      category: d.category,
      base: d.base ?? 'crema',
      marca: d.marca ?? 'Sin identificar',
      sinTacc: d.sinTacc ?? false,
      disabled: d.disabled ?? false,
      createdAt: toDate(d.createdAt),
    } as Product;
  });
  const lastVisible = snapshot.docs[snapshot.docs.length - 1] || null;

  return {
    data,
    lastDoc: lastVisible,
    hasMore: snapshot.docs.length === pageSize,
  };
};
