// app/api/public/productos/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const { allowed } = rateLimit(ip, { maxRequests: 60, windowMs: 60_000 });
  if (!allowed) {
    return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
  }

  // Filtra deshabilitados en la BD (no traer ~7400 filas para descartar en JS).
  const { data: rows, error } = await supabaseAdmin
    .from("productos")
    .select("*")
    .or("disabled.is.null,disabled.eq.false");

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
