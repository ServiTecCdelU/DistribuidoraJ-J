import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAuth } from "@/lib/api-auth";
import { parseJsonBody } from "@/lib/api-validation";

const remitoSchema = z.object({
  saleId: z.string().min(1, "Falta saleId"),
});

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const parsed = await parseJsonBody(request, remitoSchema, "message");
    if (!parsed.ok) return parsed.response;
    const { saleId } = parsed.data;

    // Obtener venta
    const { data: venta, error: ventaError } = await supabaseAdmin
      .from("ventas")
      .select("*")
      .eq("id", saleId)
      .single();

    if (ventaError || !venta) {
      return NextResponse.json({ message: "Venta no encontrada" }, { status: 404 });
    }

    // Generar número de remito secuencial
    const { data: lastRemitos } = await supabaseAdmin
      .from("ventas")
      .select("remito_number")
      .not("remito_number", "is", null)
      .order("remito_number", { ascending: false })
      .limit(1);

    let lastNumber = 0;
    if (lastRemitos && lastRemitos.length > 0) {
      const lastRemito = lastRemitos[0].remito_number;
      const match = lastRemito?.match(/R-\d+-(\d+)/);
      if (match) lastNumber = parseInt(match[1], 10);
    }

    const remitoNumber = `R-${new Date().getFullYear()}-${String(lastNumber + 1).padStart(5, "0")}`;

    // Actualizar venta con el número de remito (el PDF se genera en el frontend)
    await supabaseAdmin
      .from("ventas")
      .update({
        remito_number: remitoNumber,
        remito_generated_at: new Date().toISOString(),
      })
      .eq("id", saleId);

    return NextResponse.json({
      success: true,
      remitoNumber,
      message: "Número de remito asignado. Genere el PDF desde el frontend.",
    });

  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json(
      { message: "Error interno", error: error.message },
      { status: 500 }
    );
  }
}
