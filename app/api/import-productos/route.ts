import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(req: Request) {
  try {
    const { productos } = await req.json();

    if (!Array.isArray(productos) || productos.length === 0) {
      return NextResponse.json(
        { error: "Se requiere un array de productos" },
        { status: 400 }
      );
    }

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
