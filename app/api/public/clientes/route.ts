// app/api/public/clientes/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { rateLimit } from "@/lib/rate-limit";
import { formatCuit, normalizeCuit } from "@/lib/utils/format";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const { allowed } = rateLimit(ip, { maxRequests: 15, windowMs: 60_000 });
  if (!allowed) {
    return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const dni = searchParams.get("dni")?.trim();
  const cuit = searchParams.get("cuit")?.trim();
  if (!dni && !cuit) {
    return NextResponse.json({ found: false });
  }

  const field = cuit ? "cuit" : "dni";
  // Para CUIT intentamos ambos formatos (guiones y solo digitos) por compat con datos viejos
  const candidates: string[] = [];
  if (cuit) {
    const digits = normalizeCuit(cuit);
    const dashed = formatCuit(cuit);
    if (dashed) candidates.push(dashed);
    if (digits && !candidates.includes(digits)) candidates.push(digits);
    if (!candidates.includes(cuit)) candidates.push(cuit);
  } else if (dni) {
    candidates.push(dni);
    const digits = normalizeCuit(dni);
    if (digits && !candidates.includes(digits)) candidates.push(digits);
  }

  let foundData: any = null;
  for (const value of candidates) {
    const { data, error } = await supabaseAdmin
      .from("clientes")
      .select("*")
      .eq(field, value)
      .limit(1);
    if (!error && data && data.length > 0) {
      foundData = data[0];
      break;
    }
  }

  if (!foundData) {
    return NextResponse.json({ found: false });
  }

  return NextResponse.json({
    found: true,
    client: {
      id: foundData.id,
      name: foundData.name || "",
      phone: foundData.phone || "",
      address: foundData.address || "",
      email: foundData.email || "",
      cuit: foundData.cuit || "",
      dni: foundData.dni || "",
      taxCategory: foundData.tax_category || "consumidor_final",
      creditLimit: foundData.credit_limit ?? 50000,
      currentBalance: foundData.current_balance ?? 0,
    },
  });
}
