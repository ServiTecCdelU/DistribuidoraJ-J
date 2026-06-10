// app/api/ventas/emitir/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { procesarEmision } from "@/lib/facturacion-helper";
import { requireAuth } from "@/lib/api-auth";
import { parseJsonBody } from "@/lib/api-validation";

const emitirSchema = z.object({
  saleId: z.string().min(1, "Falta saleId"),
  client: z.any().optional(),
  emitirAfip: z.boolean().optional(),
  collection: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const parsed = await parseJsonBody(request, emitirSchema, "message");
    if (!parsed.ok) return parsed.response;
    const { saleId, client, emitirAfip, collection: collectionName } = parsed.data;

    const result = await procesarEmision(saleId, client, emitirAfip, collectionName || "ventas");

    if (!result.success) {
      return NextResponse.json(
        { message: result.message, error: result.error },
        { status: result.statusCode || 500 },
      );
    }

    return NextResponse.json({
      success: true,
      invoiceNumber: result.invoiceNumber,
      afipData: result.afipData,
      message: result.message,
    });
  } catch (error: any) {
    console.error("[Emitir] Error:", error.message, error.stack);
    return NextResponse.json(
      { message: "Error interno", error: error.message, stack: error.stack?.substring(0, 500) },
      { status: 500 },
    );
  }
}
