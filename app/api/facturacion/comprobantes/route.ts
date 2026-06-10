// app/api/facturacion/comprobantes/route.ts
// Consulta comprobantes emitidos en AFIP via Bit Ingeniería
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { consultarComprobantes, obtenerUltimoNumero } from "@/lib/bitingenieria";
import { requireAuth } from "@/lib/api-auth";
import { parseJsonBody } from "@/lib/api-validation";

const comprobantesSchema = z.object({
  tipoComprobante: z.union([z.string(), z.number()]),
  nroInicial: z.number().optional(),
  nroFinal: z.number().optional(),
  ptoVta: z.union([z.string(), z.number()]).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const parsed = await parseJsonBody(request, comprobantesSchema);
    if (!parsed.ok) return parsed.response;
    const { tipoComprobante, nroInicial, nroFinal, ptoVta } = parsed.data;

    // Si no se pasa rango, consultar los últimos 10
    let inicio = nroInicial;
    let fin = nroFinal;

    if (!inicio || !fin) {
      const ultimo = await obtenerUltimoNumero(tipoComprobante, ptoVta);
      fin = ultimo;
      inicio = Math.max(1, ultimo - 9);
    }

    const resultado = await consultarComprobantes(
      tipoComprobante,
      inicio,
      fin,
      ptoVta
    );

    return NextResponse.json({
      success: true,
      data: resultado,
      rango: { inicio, fin },
    });
  } catch (error: any) {
    console.error("[API comprobantes] Error:", error.message);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
