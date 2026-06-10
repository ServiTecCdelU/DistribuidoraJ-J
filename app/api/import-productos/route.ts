import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAuth } from "@/lib/api-auth";
import { parseJsonBody } from "@/lib/api-validation";

const importSchema = z.object({
  productos: z
    .array(
      z
        .object({
          codigo: z.string().optional(),
          nombre: z.string().optional(),
          categoria: z.string().optional(),
        })
        .passthrough(),
    )
    .min(1, "Se requiere un array de productos"),
});

export async function POST(req: Request) {
  try {
    const auth = await requireAuth(req, { roles: ["admin"] });
    if (!auth.ok) return auth.response;

    const parsed = await parseJsonBody(req, importSchema);
    if (!parsed.ok) return parsed.response;
    const { productos } = parsed.data;

    let count = 0;
    const batch: any[] = [];

    for (const producto of productos) {
      if (!producto.codigo || !producto.nombre) continue;

      batch.push({
        name: producto.nombre.trim(),
        description: producto.nombre.trim(),
        codigo: producto.codigo.trim(),
        price: 0,
        stock: 0,
        image_url: "",
        category: producto.categoria || "Sin categoría",
        base: "crema",
        marca: "Sin identificar",
        sin_tacc: false,
        disabled: false,
        created_at: new Date().toISOString(),
      });
      count++;
    }

    // Insert in chunks of 499 to match original batch size
    for (let i = 0; i < batch.length; i += 499) {
      const chunk = batch.slice(i, i + 499);
      const { error } = await supabaseAdmin.from("productos").insert(chunk);
      if (error) throw error;
    }

    return NextResponse.json({ success: true, imported: count });
  } catch (error: unknown) {
    console.error("Error importing productos:", error);
    return NextResponse.json(
      { error: "Error al importar productos" },
      { status: 500 }
    );
  }
}
