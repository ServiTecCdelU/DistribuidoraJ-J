import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { procesarEmision } from "@/lib/facturacion-helper";
import { requireAuth } from "@/lib/api-auth";
import { parseJsonBody } from "@/lib/api-validation";

const facturacionSchema = z.object({
  saleId: z.string().min(1, "Falta saleId"),
  client: z.any().optional(),
  emitirAfip: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const parsed = await parseJsonBody(request, facturacionSchema, "message");
    if (!parsed.ok) return parsed.response;
    const { saleId, client, emitirAfip } = parsed.data;

    const result = await procesarEmision(saleId, client, emitirAfip);

    if (!result.success) {
      return NextResponse.json(
        { message: result.message, error: result.error },
        { status: result.statusCode || 500 },
      );
    }

    return NextResponse.json({
      success: true,
      invoiceNumber: result.invoiceNumber,
      afipData: result.afipData
        ? {
            ...result.afipData,
            tipoComprobante: result.afipData.tipoComprobante === 1 ? "Factura A" : "Factura B",
          }
        : null,
      invoicePdfBase64: result.invoicePdfBase64 || null,
      message: result.message,
    });
  } catch (error: any) {
    console.error("[Facturacion] Error:", error.message);
    return NextResponse.json({ message: "Error interno" }, { status: 500 });
  }
}
