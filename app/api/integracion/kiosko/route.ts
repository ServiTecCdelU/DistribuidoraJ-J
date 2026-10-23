// POST /api/integracion/kiosko — lo llama el servidor del supermercado (kiosko).
// Sin sesion: Authorization Bearer KIOSKO_STOCK_CLAVE (lib/kiosko-stock.ts).
//   stock -> { productos: [{ id, name, codigo, stock, price, category, imageUrl, description }] }
//            catalogo habilitado completo con su stock (el super da de alta lo que le falte)
//   mover { transferenciaId, productoId, delta } -> RPC mover_stock_kiosko
//         (idempotente por transferenciaId: un reintento no descuenta dos veces)
// 400 = no se aplico (ej. sin stock); 500 = error de la base, el kiosko reintenta.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { claveKioskoValida } from "@/lib/kiosko-stock";
import { fetchAllPages } from "@/lib/utils/fetch-all-pages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!claveKioskoValida(request)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const body = await request.json().catch(() => null);

  if (body?.accion === "stock") {
    try {
      const filas = await fetchAllPages<any>((desde, hasta) =>
        supabaseAdmin
          .from("productos")
          .select("id, name, codigo, stock, price, category, image_url, description, disabled")
          .or("disabled.is.null,disabled.eq.false")
          .order("id", { ascending: true })
          .range(desde, hasta),
      );
      return NextResponse.json({
        productos: filas.map((p) => ({
          id: p.id,
          name: p.name ?? "",
          codigo: p.codigo ?? null,
          stock: Number(p.stock) || 0,
          price: Number(p.price) || 0,
          category: p.category ?? "",
          imageUrl: p.image_url ?? "",
          description: p.description ?? "",
        })),
      });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Error leyendo el stock" }, { status: 500 });
    }
  }

  if (body?.accion === "mover") {
    const { transferenciaId, productoId } = body;
    const delta = Number(body.delta);
    if (typeof transferenciaId !== "string" || !transferenciaId || typeof productoId !== "string" || !productoId) {
      return NextResponse.json({ error: "Faltan datos de la transferencia" }, { status: 400 });
    }
    if (!Number.isInteger(delta) || delta === 0) {
      return NextResponse.json({ error: "La cantidad tiene que ser un número entero" }, { status: 400 });
    }
    const { data, error } = await supabaseAdmin.rpc("mover_stock_kiosko", {
      p_transferencia_id: transferenciaId,
      p_producto_id: productoId,
      p_delta: delta,
    });
    // P0001 = raise exception de la RPC (sin stock, no existe...): rechazo definitivo.
    if (error) return NextResponse.json({ error: error.message }, { status: error.code === "P0001" ? 400 : 500 });
    return NextResponse.json(data);
  }

  return NextResponse.json({ error: "Accion desconocida" }, { status: 400 });
}
