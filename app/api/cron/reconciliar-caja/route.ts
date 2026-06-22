import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

// Reconciliación de caja por horario fijo 06:00–23:00 (hora Argentina, UTC-3).
// Pensado para ser invocado por un scheduler (Supabase pg_cron vía pg_net), de modo que la
// caja se abra/cierre sola TODOS los días sin depender de que alguien abra la página.
// Es idempotente: correr cada hora cubre apertura y cierre sin duplicar.

export const dynamic = "force-dynamic";

const OFF = 3 * 60 * 60 * 1000; // Argentina UTC-3 (sin horario de verano)
const HORA_APERTURA = 6;
const HORA_CIERRE = 23;
const LIMITE_DIAS = 31;

type Sale = {
  created_at: string;
  total: number | null;
  payment_type: string | null;
  payment_method: string | null;
  cash_amount: number | null;
  credit_amount: number | null;
  efectivo_amount: number | null;
  transferencia_amount: number | null;
  remito_number: string | null;
};

// Partes del reloj local (Argentina) de un instante UTC.
function localParts(utc: Date) {
  const l = new Date(utc.getTime() - OFF);
  return { y: l.getUTCFullYear(), m: l.getUTCMonth(), d: l.getUTCDate(), h: l.getUTCHours() };
}

// Instante UTC real para una hora de pared local (Argentina).
function utcFromLocal(y: number, m: number, d: number, h: number): Date {
  return new Date(Date.UTC(y, m, d, h, 0, 0, 0) + OFF);
}

const dayKeyLocal = (utc: Date) => {
  const p = localParts(utc);
  return `${p.y}-${p.m}-${p.d}`;
};

function agg(src: Sale[]) {
  let efectivo = 0, transfer = 0, credito = 0, total = 0;
  for (const s of src) {
    const t = Number(s.total) || 0;
    total += t;
    const method = s.payment_method || "efectivo";
    if (s.payment_type === "cash") {
      if (method === "transferencia") transfer += t; else efectivo += t;
    } else if (s.payment_type === "credit") {
      credito += t;
    } else if (s.payment_type === "mixed") {
      const cashAmt = Number(s.cash_amount) || 0;
      const creditAmt = Number(s.credit_amount) || 0;
      const ef = s.efectivo_amount != null ? Number(s.efectivo_amount) : (method !== "transferencia" ? cashAmt : 0);
      const tr = s.transferencia_amount != null ? Number(s.transferencia_amount) : (method === "transferencia" ? cashAmt : 0);
      efectivo += ef; transfer += tr; credito += creditAmt;
    }
  }
  return { efectivo, transfer, credito, total, count: src.length };
}

async function generarIdCaja(dateStr: string): Promise<string> {
  const base = `caja_${dateStr}`;
  for (let num = 1; num < 1000; num++) {
    const candidate = `${base}_${num}`;
    const { data } = await supabaseAdmin.from("caja").select("id").eq("id", candidate).maybeSingle();
    if (!data) return candidate;
  }
  return `${base}_${Date.now()}`;
}

async function comisionesEntre(desde: Date, hasta: Date): Promise<number> {
  const { data } = await supabaseAdmin
    .from("pagos_comisiones").select("monto")
    .gte("created_at", desde.toISOString()).lte("created_at", hasta.toISOString());
  return (data || []).reduce((a: number, p: any) => a + (Number(p.monto) || 0), 0);
}

async function reconciliar() {
  const now = new Date();
  const hoy = localParts(now);
  const diaHoy = utcFromLocal(hoy.y, hoy.m, hoy.d, 0); // 00:00 local de hoy, en UTC
  const aperturaHoy = utcFromLocal(hoy.y, hoy.m, hoy.d, HORA_APERTURA);
  const dentroHorario = hoy.h >= HORA_APERTURA && hoy.h < HORA_CIERRE;
  const acciones: string[] = [];

  const limite = utcFromLocal(hoy.y, hoy.m, hoy.d - LIMITE_DIAS, 0);

  // Ventas con remito del rango (solo estas suman a la caja).
  const { data: ventasRaw } = await supabaseAdmin
    .from("ventas")
    .select("created_at,total,payment_type,payment_method,cash_amount,credit_amount,efectivo_amount,transferencia_amount,remito_number")
    .not("remito_number", "is", null)
    .gte("created_at", limite.toISOString());
  const ventas = (ventasRaw || []) as Sale[];

  // 1) Cerrar cajas abiertas cuyo cierre (23:00 de su día) ya pasó.
  const { data: abiertas } = await supabaseAdmin
    .from("caja").select("*").eq("status", "open").order("opened_at", { ascending: true });
  for (const reg of abiertas || []) {
    const ap = new Date(reg.opened_at);
    const p = localParts(ap);
    const cierreReg = utcFromLocal(p.y, p.m, p.d, HORA_CIERRE);
    const esDeHoy = dayKeyLocal(ap) === dayKeyLocal(now);
    if (esDeHoy && now < cierreReg) continue; // caja de hoy aún en horario

    const periodo = ventas.filter((s) => {
      const t = new Date(s.created_at).getTime();
      return t >= ap.getTime() && t <= cierreReg.getTime();
    });
    const st = agg(periodo);
    const comis = await comisionesEntre(ap, cierreReg);
    const esperado = (reg.initial_amount || 0) + st.efectivo - comis;
    await supabaseAdmin.from("caja").update({
      closed_at: cierreReg.toISOString(),
      closed_by: "Cierre automático",
      final_amount: esperado,
      expected_amount: esperado,
      difference: 0,
      status: "closed",
      notes: "Cierre automático 23:00",
      sales_count: st.count,
      total_sales: st.total,
      cash_total: st.efectivo,
      credit_total: st.credito,
      transfer_total: st.transfer,
    }).eq("id", reg.id).eq("status", "open");
    acciones.push(`cerrada ${reg.id}`);
  }

  // 1.5) Backfill: crear cajas CERRADAS retroactivas para días pasados con ventas sin caja.
  const { data: cajasRango } = await supabaseAdmin
    .from("caja").select("opened_at").gte("opened_at", limite.toISOString());
  const diasConCaja = new Set((cajasRango || []).map((r: any) => dayKeyLocal(new Date(r.opened_at))));

  const ventasPorDia = new Map<string, Sale[]>();
  for (const s of ventas) {
    const d = new Date(s.created_at);
    if (d.getTime() < limite.getTime() || d.getTime() >= diaHoy.getTime()) continue;
    const key = dayKeyLocal(d);
    if (diasConCaja.has(key)) continue;
    if (!ventasPorDia.has(key)) ventasPorDia.set(key, []);
    ventasPorDia.get(key)!.push(s);
  }

  for (const [key, ventasDia] of ventasPorDia) {
    const [yy, mm, dd] = key.split("-").map(Number);
    const ap = utcFromLocal(yy, mm, dd, HORA_APERTURA);
    const cierre = utcFromLocal(yy, mm, dd, HORA_CIERRE);
    const periodo = ventasDia.filter((s) => {
      const t = new Date(s.created_at).getTime();
      return t >= ap.getTime() && t <= cierre.getTime();
    });
    if (periodo.length === 0) continue;
    const st = agg(periodo);
    const comis = await comisionesEntre(ap, cierre);
    const esperado = st.efectivo - comis;
    const dateStr = `${yy}${String(mm + 1).padStart(2, "0")}${String(dd).padStart(2, "0")}`;
    const id = await generarIdCaja(dateStr);
    await supabaseAdmin.from("caja").insert({
      id,
      opened_at: ap.toISOString(),
      opened_by: "Apertura automática",
      initial_amount: 0,
      closed_at: cierre.toISOString(),
      closed_by: "Cierre automático",
      final_amount: esperado,
      expected_amount: esperado,
      difference: 0,
      status: "closed",
      notes: "Cierre automático 23:00 (retroactivo)",
      sales_count: st.count,
      total_sales: st.total,
      cash_total: st.efectivo,
      credit_total: st.credito,
      transfer_total: st.transfer,
    });
    acciones.push(`backfill ${id}`);
  }

  // 2) ¿Ya hay caja abierta de hoy? Si sí, nada que hacer.
  const { data: deHoy } = await supabaseAdmin
    .from("caja").select("id").eq("status", "open")
    .gte("opened_at", diaHoy.toISOString()).order("opened_at", { ascending: false }).limit(1);
  if (deHoy && deHoy.length) return { acciones, abierta: deHoy[0].id };

  // 3) Dentro de horario y sin caja de hoy: abrir (06:00, inicial 0).
  if (dentroHorario) {
    const dateStr = `${hoy.y}${String(hoy.m + 1).padStart(2, "0")}${String(hoy.d).padStart(2, "0")}`;
    const id = await generarIdCaja(dateStr);
    const { error } = await supabaseAdmin.from("caja").insert({
      id,
      opened_at: aperturaHoy.toISOString(),
      opened_by: "Apertura automática",
      initial_amount: 0,
      status: "open",
    });
    if (!error) {
      acciones.push(`abierta ${id}`);
      return { acciones, abierta: id };
    }
  }

  return { acciones, abierta: null };
}

function autorizado(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  const qs = req.nextUrl.searchParams.get("secret");
  return qs === secret;
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) {
    return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
  }
  try {
    const result = await reconciliar();
    return NextResponse.json({ success: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || "Error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
