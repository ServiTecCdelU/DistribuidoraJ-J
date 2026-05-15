// app/api/public/productos/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

export async function GET() {
  const { data: rows, error } = await supabaseAdmin
    .from("productos")
    .select("*");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const products = (rows || [])
    .map((data: any) => ({
      id: data.id,
      name: data.name,
      description: data.description,
      price: data.price,
      stock: data.stock,
      imageUrl: data.image_url,
      category: data.category,
      createdAt: data.created_at || null,
      marca: data.marca ?? null,
      base: data.base ?? "crema",
      sinTacc: data.sin_tacc ?? false,
      disabled: data.disabled ?? false,
    }))
    .filter((product: any) => product.disabled !== true);

  return NextResponse.json({ products });
}
