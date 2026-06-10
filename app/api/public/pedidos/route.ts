// app/api/public/pedidos/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { rateLimit } from "@/lib/rate-limit";
import { parseJsonBody } from "@/lib/api-validation";

export const runtime = "nodejs";

const pedidoPublicoSchema = z
  .object({
    items: z.array(z.unknown()).min(1, "Items requeridos"),
    client: z.record(z.string(), z.unknown()).optional(),
    clientId: z.string().nullish(),
    clientPhone: z.string().optional(),
    clientEmail: z.string().optional(),
    deliveryMethod: z.string().optional(),
    address: z.string().optional(),
    city: z.string().nullish(),
    lat: z.number().nullish(),
    lng: z.number().nullish(),
    discount: z.number().nullish(),
    discountType: z.string().nullish(),
  })
  .passthrough();

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

async function generateAdminReadableId(
  table: string,
  prefix: string,
  identifier: string,
): Promise<string> {
  const slug = slugify(identifier);
  const base = `${prefix}_${slug}`;
  for (let num = 1; num < 1000; num++) {
    const candidateId = `${base}_${num}`;
    const { data } = await supabaseAdmin
      .from(table)
      .select("id")
      .eq("id", candidateId)
      .single();
    if (!data) return candidateId;
  }
  return `${base}_${Date.now()}`;
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const { allowed } = rateLimit(ip, { maxRequests: 15, windowMs: 60_000 });
  if (!allowed) {
    return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
  }

  const parsed = await parseJsonBody(request, pedidoPublicoSchema, "message");
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const client: Record<string, unknown> = body.client || {};
  const name = String(client.name || "").trim();
  const phone = String(client.phone || body.clientPhone || "").trim();
  const email = String(client.email || body.clientEmail || "").trim();
  const dni = String(client.dni || "").trim();
  const cuit = String(client.cuit || "").trim();
  const address = String(client.address || "").trim();
  const taxCategory = String(client.taxCategory || "consumidor_final").trim();

  if (!name || !phone) {
    return NextResponse.json(
      { message: "Nombre y teléfono son obligatorios" },
      { status: 400 },
    );
  }

  // Si ya viene un clientId (ya registrado), usarlo directamente
  let clientId: string | null = body.clientId || null;
  let clientName = name;

  if (!clientId) {
    // Buscar cliente existente por CUIT, DNI o email
    let existingDoc: any = null;

    if (cuit) {
      const { data } = await supabaseAdmin
        .from("clientes")
        .select("*")
        .eq("cuit", cuit)
        .limit(1);
      if (data && data.length > 0) existingDoc = data[0];
    }
    if (!existingDoc && dni) {
      const { data } = await supabaseAdmin
        .from("clientes")
        .select("*")
        .eq("dni", dni)
        .limit(1);
      if (data && data.length > 0) existingDoc = data[0];
    }
    if (!existingDoc && email) {
      const { data } = await supabaseAdmin
        .from("clientes")
        .select("*")
        .eq("email", email)
        .limit(1);
      if (data && data.length > 0) existingDoc = data[0];
    }

    if (existingDoc) {
      clientId = existingDoc.id;
      clientName = existingDoc.name || name;

      // Actualizar datos si cambió algo
      const updates: Record<string, unknown> = {};
      if (phone && !existingDoc.phone) updates.phone = phone;
      if (email && !existingDoc.email) updates.email = email;
      if (address && !existingDoc.address) updates.address = address;
      if (Object.keys(updates).length > 0) {
        await supabaseAdmin
          .from("clientes")
          .update(updates)
          .eq("id", clientId);
      }
    } else {
      // Crear nuevo cliente con ID legible: cliente_{name}_{cuit} o cliente_{name}_{counter}
      let clientDocId: string;
      if (cuit) {
        // ID con nombre + CUIT (único por persona)
        const namePart = slugify(name);
        const cuitPart = cuit.replace(/[^0-9]/g, "");
        clientDocId = `cliente_${namePart}_${cuitPart}`;
        // Verificar si ya existe ese ID
        const { data: existing } = await supabaseAdmin
          .from("clientes")
          .select("id")
          .eq("id", clientDocId)
          .single();
        if (existing) {
          // Fallback a contador
          clientDocId = await generateAdminReadableId("clientes", "cliente", name);
        }
      } else {
        clientDocId = await generateAdminReadableId("clientes", "cliente", name);
      }

      await supabaseAdmin.from("clientes").upsert({
        id: clientDocId,
        name,
        dni: dni || null,
        cuit: cuit || null,
        email: email || null,
        phone,
        address: address || null,
        tax_category: taxCategory,
        credit_limit: 0,
        current_balance: 0,
        created_at: new Date().toISOString(),
      });
      clientId = clientDocId;
    }
  }

  // Resolver dirección
  const deliveryMethod = String(body.deliveryMethod || "pickup");
  const isPickup = deliveryMethod === "pickup";
  const resolvedAddress =
    body.address ||
    (isPickup ? "Retiro en local" : "Dirección no especificada");

  // Crear pedido con ID legible: pedido_{clientName}_{counter}
  const orderDocId = await generateAdminReadableId("pedidos", "pedido", clientName);

  await supabaseAdmin.from("pedidos").upsert({
    id: orderDocId,
    sale_id: null,
    client_id: clientId,
    client_name: clientName,
    client_phone: phone || null,
    client_email: email || null,
    seller_id: null,
    seller_name: null,
    items: body.items,
    city: isPickup ? null : (body.city || null),
    address: resolvedAddress,
    lat: isPickup ? null : (body.lat ?? null),
    lng: isPickup ? null : (body.lng ?? null),
    delivery_method: deliveryMethod,
    status: "pending",
    source: "tienda",
    discount: body.discount ?? null,
    discount_type: body.discountType ?? null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  return NextResponse.json({ orderId: orderDocId });
}
