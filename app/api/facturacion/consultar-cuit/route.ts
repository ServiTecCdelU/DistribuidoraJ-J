// app/api/facturacion/consultar-cuit/route.ts
// Consulta datos fiscales de un CUIT via Bit Ingeniería -> AFIP
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { consultarCuit } from "@/lib/bitingenieria";
import { requireAuth } from "@/lib/api-auth";
import { parseJsonBody } from "@/lib/api-validation";

const cuitSchema = z.object({
  cuit: z.union([z.string().min(1, "CUIT es requerido"), z.number()]),
});

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const parsed = await parseJsonBody(request, cuitSchema);
    if (!parsed.ok) return parsed.response;
    const { cuit } = parsed.data;

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
