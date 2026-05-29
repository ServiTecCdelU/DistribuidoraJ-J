// app/api/facturacion/consultar-cuit/route.ts
// Consulta datos fiscales de un CUIT via Bit Ingeniería -> AFIP
import { NextRequest, NextResponse } from "next/server";
import { consultarCuit } from "@/lib/bitingenieria";
import { requireAuth } from "@/lib/api-auth";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { cuit } = body;

    if (!cuit) {
      return NextResponse.json(
        { error: "CUIT es requerido" },
        { status: 400 }
      );
    }

    const resultado = await consultarCuit(cuit);

    return NextResponse.json({
      success: true,
      data: resultado,
    });
  } catch (error: any) {
    console.error("[API consultar-cuit] Error:", error.message);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
