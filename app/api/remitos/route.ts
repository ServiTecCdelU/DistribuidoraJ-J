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

    // El remito es inmodificable: si la venta ya tiene número, no se asigna otro.
    if (venta.remito_number) {
      return NextResponse.json({ message: "La venta ya tiene remito" }, { status: 409 });
    }

    // Número del contador atómico compartido con Pedidos (antes: último de ventas + 1).
    const { data: remitoNumber, error: nroError } = await supabaseAdmin.rpc("next_remito_number");
    if (nroError || !remitoNumber) {
      console.error("[Remitos] next_remito_number:", nroError?.message);
      return NextResponse.json({ message: "No se pudo generar el número de remito" }, { status: 500 });
    }

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
