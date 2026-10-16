// GET /api/aviso-pago — pregunta a ServiTec si el servicio tiene meses atrasados.
// La clave queda en el servidor (SERVITEC_ESTADO_PAGO_CLAVE). Si falta la clave o
// ServiTec no responde, devuelve null: el aviso nunca traba el sistema.

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { leerDeuda } from "@/lib/utils/aviso-pago";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const URL_POR_DEFECTO = "https://servitec-demo.vercel.app/api/externo/estado-pago";

export async function GET(request: Request) {
  const auth = await requireAuth(request, { roles: ["admin"] });
  if (!auth.ok) return auth.response;

  const clave = process.env.SERVITEC_ESTADO_PAGO_CLAVE?.trim();
  if (!clave) return NextResponse.json({ success: true, data: null, error: null });

  try {
    const res = await fetch(process.env.SERVITEC_ESTADO_PAGO_URL?.trim() || URL_POR_DEFECTO, {
      headers: { Authorization: `Bearer ${clave}` },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.warn("[aviso-pago] ServiTec respondió", res.status);
      return NextResponse.json({ success: true, data: null, error: null });
    }
    return NextResponse.json({ success: true, data: leerDeuda(await res.json()), error: null });
  } catch (e) {
    console.warn("[aviso-pago] sin respuesta de ServiTec", e instanceof Error ? e.message : e);
    return NextResponse.json({ success: true, data: null, error: null });
  }
}
