// /api/stock-super — pantalla "Stock Super" (solo admin). Pasa al kiosko con la clave
// del servidor (lib/kiosko-stock.ts): el kiosko arma la lista con el stock de los dos
// lados y orquesta cada transferencia.
//   GET  -> productos con stock del super y de la distribuidora + ultimos movimientos
//   POST { accion: "transferir", productoId, cantidad, direccion } | { accion: "reintentar" }

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { llamarKiosko } from "@/lib/kiosko-stock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAuth(request, { roles: ["admin"] });
  if (!auth.ok) return auth.response;
  const { status, data } = await llamarKiosko({ accion: "stock" });
  return NextResponse.json(data, { status });
}

export async function POST(request: Request) {
  const auth = await requireAuth(request, { roles: ["admin"] });
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => null);

  if (body?.accion === "reintentar") {
    const { status, data } = await llamarKiosko({ accion: "reintentar" });
    return NextResponse.json(data, { status });
  }
  if (body?.accion === "transferir") {
    // Solo los campos esperados: el kiosko valida todo de nuevo.
    const { status, data } = await llamarKiosko({
      accion: "transferir",
      productoId: body.productoId,
      cantidad: body.cantidad,
      direccion: body.direccion,
      usuario: "Distribuidora",
    });
    return NextResponse.json(data, { status });
  }
  return NextResponse.json({ error: "Accion desconocida" }, { status: 400 });
}
