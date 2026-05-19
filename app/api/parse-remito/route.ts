import { NextRequest, NextResponse } from "next/server";

// Esta ruta ya no se usa — el OCR del remito se hace client-side.
export async function POST(request: NextRequest) {
  return NextResponse.json(
    { error: "El procesamiento de remitos se realiza en el navegador." },
    { status: 410 }
  );
}
