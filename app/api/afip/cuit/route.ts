// app/api/afip/cuit/route.ts
import { NextRequest, NextResponse } from "next/server";
import { consultarCUIT } from "@/lib/afip-direct";
import { requireAuth } from "@/lib/api-auth";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  const cuit = req.nextUrl.searchParams.get("cuit");
  if (!cuit) return NextResponse.json({ error: "CUIT requerido" }, { status: 400 });

  try {
    const datos = await consultarCUIT(cuit);
    return NextResponse.json(datos);
  } catch (e: any) {
    const msg: string = e.message || "Error consultando ARCA";
    console.error("[ARCA cuit]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
