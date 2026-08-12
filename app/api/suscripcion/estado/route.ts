import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { z } from "zod";
import {
  resumirSuscripcion,
  type DatosSuscripcion,
  type PagoSuscripcion,
} from "@/lib/utils/suscripcion";

// Endpoint de integración: lo consume el sistema de control de ServiTec para saber
// si esta instancia está al día, qué plan tiene y qué meses pagó.
// Auth por API key dedicada (no expone el service role ni datos de clientes).

export const dynamic = "force-dynamic";

function autorizado(req: NextRequest): boolean {
  const key = process.env.SUSCRIPCION_API_KEY;
  if (!key) return false;
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${key}`) return true;
  return req.headers.get("x-api-key") === key;
}

const pagoSchema = z.object({
  periodo: z.string().regex(/^\d{4}-\d{2}$/, "periodo debe ser YYYY-MM"),
  monto: z.number().nonnegative(),
  fechaPago: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  metodo: z.string().max(50).optional().nullable(),
  comprobante: z.string().max(120).optional().nullable(),
  estado: z.enum(["pagado", "pendiente"]).default("pagado"),
  notas: z.string().max(500).optional().nullable(),
});

async function cargar() {
  const [{ data: susc, error: e1 }, { data: pagos, error: e2 }] = await Promise.all([
    supabaseAdmin.from("suscripcion").select("*").eq("id", "default").maybeSingle(),
    supabaseAdmin.from("suscripcion_pagos").select("*").order("periodo", { ascending: false }),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;

  const datos: DatosSuscripcion = {
    montoMensual: Number(susc?.monto_mensual) || 0,
    sucursales: Number(susc?.sucursales) || 1,
    diaVencimiento: Number(susc?.dia_vencimiento) || 10,
    fechaInicio: susc?.fecha_inicio ?? null,
    estado: (susc?.estado ?? "activo") as DatosSuscripcion["estado"],
  };

  const lista: PagoSuscripcion[] = (pagos ?? []).map((p: Record<string, any>) => ({
    id: p.id,
    periodo: p.periodo,
    monto: Number(p.monto) || 0,
    fechaPago: p.fecha_pago ?? null,
    metodo: p.metodo ?? null,
    comprobante: p.comprobante ?? null,
    estado: p.estado === "pendiente" ? "pendiente" : "pagado",
    notas: p.notas ?? null,
  }));

  return { susc, datos, pagos: lista };
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) {
    return NextResponse.json({ success: false, data: null, error: "No autorizado" }, { status: 401 });
  }
  try {
    const { susc, datos, pagos } = await cargar();
    const resumen = resumirSuscripcion(datos, pagos);

    return NextResponse.json({
      success: true,
      error: null,
      data: {
        cliente: {
          razonSocial: susc?.razon_social ?? null,
          nombreFantasia: susc?.nombre_fantasia ?? null,
          cuit: susc?.cuit ?? null,
          email: susc?.email ?? null,
          telefono: susc?.telefono ?? null,
          ciudad: susc?.ciudad ?? null,
        },
        plan: {
          nombre: susc?.plan ?? null,
          montoMensual: datos.montoMensual,
          moneda: susc?.moneda ?? "ARS",
          sucursales: datos.sucursales,
          diaVencimiento: datos.diaVencimiento,
          fechaInicio: datos.fechaInicio,
          estado: datos.estado,
        },
        cuenta: resumen,
        pagos,
      },
    });
  } catch (e: any) {
    console.error("[suscripcion/estado] GET", e);
    return NextResponse.json({ success: false, data: null, error: "Error al obtener el estado" }, { status: 500 });
  }
}

/** Registra o actualiza el pago de un período desde el sistema externo. */
export async function POST(req: NextRequest) {
  if (!autorizado(req)) {
    return NextResponse.json({ success: false, data: null, error: "No autorizado" }, { status: 401 });
  }
  try {
    const parsed = pagoSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, data: null, error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
        { status: 400 },
      );
    }
    const p = parsed.data;

    const { error } = await supabaseAdmin.from("suscripcion_pagos").upsert(
      {
        id: `susc_pago_${p.periodo}`,
        periodo: p.periodo,
        monto: p.monto,
        fecha_pago: p.fechaPago ?? null,
        metodo: p.metodo ?? null,
        comprobante: p.comprobante ?? null,
        estado: p.estado,
        notas: p.notas ?? null,
      },
      { onConflict: "periodo" },
    );
    if (error) throw error;

    const { datos, pagos } = await cargar();
    return NextResponse.json({
      success: true,
      error: null,
      data: { cuenta: resumirSuscripcion(datos, pagos) },
    });
  } catch (e: any) {
    console.error("[suscripcion/estado] POST", e);
    return NextResponse.json({ success: false, data: null, error: "Error al registrar el pago" }, { status: 500 });
  }
}
