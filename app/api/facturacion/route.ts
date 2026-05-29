import { NextRequest, NextResponse } from "next/server";
import { procesarEmision } from "@/lib/facturacion-helper";
import { requireAuth } from "@/lib/api-auth";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const { saleId, client, emitirAfip } = await request.json();
    if (!saleId) {
      return NextResponse.json({ message: "Falta saleId" }, { status: 400 });
    }

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
