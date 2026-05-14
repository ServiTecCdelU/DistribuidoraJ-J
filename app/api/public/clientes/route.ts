// app/api/public/clientes/route.ts
import { NextResponse } from "next/server";
import { adminFirestore } from "@/lib/firebase-admin";
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

  let snapshot = null as FirebaseFirestore.QuerySnapshot | null;
  for (const value of candidates) {
    const snap = await adminFirestore
      .collection("clientes")
      .where(field, "==", value)
      .limit(1)
      .get();
    if (!snap.empty) {
      snapshot = snap;
      break;
    }
  }
  if (!snapshot || snapshot.empty) {
    return NextResponse.json({ found: false });
  }

  const doc = snapshot.docs[0];
  const data = doc.data();
  return NextResponse.json({
    found: true,
    client: {
      id: doc.id,
      name: data.name || "",
      phone: data.phone || "",
      address: data.address || "",
      email: data.email || "",
      cuit: data.cuit || "",
      dni: data.dni || "",
      taxCategory: data.taxCategory || "consumidor_final",
      creditLimit: data.creditLimit ?? 50000,
      currentBalance: data.currentBalance ?? 0,
    },
  });
}
