// app/api/public/mas-vendidos/route.ts
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

  const [ventasRes, productosRes] = await Promise.all([
    supabaseAdmin.from("ventas").select("*"),
    supabaseAdmin.from("productos").select("*"),
  ]);

  const ventas = ventasRes.data || [];
  const productos = productosRes.data || [];

  // Aggregate quantities sold per productId
  const countMap: Record<string, number> = {};
  for (const row of ventas) {
    const items: { productId: string; quantity: number }[] = row.items || [];
    for (const item of items) {
      if (item.productId) {
        countMap[item.productId] = (countMap[item.productId] || 0) + (item.quantity || 1);
      }
    }
  }

  // Build product map
  const productMap: Record<string, any> = {};
  for (const data of productos) {
    if (data.disabled === true) continue;
    productMap[data.id] = {
      id: data.id,
      name: data.name,
      description: data.description,
      price: data.price,
      stock: data.stock,
      imageUrl: data.image_url,
      category: data.category,
      sinTacc: data.sin_tacc ?? false,
    };
  }

  // Sort by sold quantity, take top 3
  const top3 = Object.entries(countMap)
    .filter(([id]) => productMap[id])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id, soldCount]) => ({ ...productMap[id], soldCount }));

  // If fewer than 3 products have sales, fill with other products
  if (top3.length < 3) {
    const existing = new Set(top3.map((p) => p.id));
    const extras = Object.values(productMap)
      .filter((p) => !existing.has(p.id))
      .slice(0, 3 - top3.length)
      .map((p) => ({ ...p, soldCount: 0 }));
    top3.push(...extras);
  }

  return NextResponse.json({ products: top3 });
}
