// lib/kiosko-stock.ts — conexion de stock con el supermercado (kiosko de ServiTec).
// Solo stock: los productos son los mismos (el kiosko guarda el id de aca como
// dist_id) y cada lado tiene el suyo. El kiosko orquesta cada transferencia y llama
// a /api/integracion/kiosko; esta app llama a /api/integracion/distribuidora del
// kiosko desde /api/stock-super. Las dos con la misma clave (KIOSKO_STOCK_CLAVE),
// que nunca llega al navegador. Migracion: migrations/2026-10-23-stock-kiosko.sql.
import { timingSafeEqual } from "node:crypto";

/** Authorization: Bearer <KIOSKO_STOCK_CLAVE>, comparado en tiempo constante. */
export function claveKioskoValida(request: Request): boolean {
  const clave = process.env.KIOSKO_STOCK_CLAVE?.trim();
  if (!clave) return false;
  const recibida = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(recibida);
  const b = Buffer.from(clave);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** POST a la integracion del kiosko. Devuelve el status y el JSON tal cual. */
export async function llamarKiosko(body: Record<string, unknown>): Promise<{ status: number; data: any }> {
  const base = process.env.KIOSKO_API_URL?.trim();
  const clave = process.env.KIOSKO_STOCK_CLAVE?.trim();
  if (!base || !clave) return { status: 500, data: { error: "Falta configurar KIOSKO_API_URL o KIOSKO_STOCK_CLAVE" } };
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/api/integracion/distribuidora`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${clave}` },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    return { status: res.status, data: await res.json().catch(() => ({ error: `El super respondió ${res.status}` })) };
  } catch {
    return { status: 502, data: { error: "El sistema del super no responde" } };
  }
}
