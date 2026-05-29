// app/api/afip/test/route.ts
// Test de conexión con AFIP via Bit Ingeniería
import { NextRequest, NextResponse } from "next/server";
import { obtenerUltimoNumero } from "@/lib/bitingenieria";
import { requireAuth } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    // Consultar último comprobante tipo Factura B (6) como test de conectividad
    const ultimo = await obtenerUltimoNumero(6);

    return NextResponse.json({
      success: true,
      message: "Conexión exitosa con AFIP via Bit Ingeniería",
      ultimoComprobante: ultimo,
      provider: "Bit Ingeniería (FEAFIP)",
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
