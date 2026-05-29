// lib/api-auth.ts
// Verificación de autenticación + rol para rutas API protegidas.
// Valida el token Bearer contra Supabase Auth y resuelve el rol en la tabla `usuarios`
// (lookup dual: id legacy o auth_uid). Bloquea usuarios inactivos y roles no permitidos.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type Role = "admin" | "seller" | "customer";

export interface AuthedUser {
  authId: string;
  userId: string;
  role: Role;
}

type AuthResult =
  | { ok: true; user: AuthedUser }
  | { ok: false; response: NextResponse };

export async function requireAuth(
  request: Request,
  opts: { roles?: Role[] } = {},
): Promise<AuthResult> {
  const roles = opts.roles ?? ["admin", "seller"];

  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return {
      ok: false,
      response: NextResponse.json({ error: "No autorizado" }, { status: 401 }),
    };
  }

  const token = authHeader.substring(7);

  let authId: string;
  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) throw error ?? new Error("sin usuario");
    authId = data.user.id;
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "Token inválido" }, { status: 401 }),
    };
  }

  // Resolver rol: usuarios legacy tienen el Auth UID como id; los nuevos usan auth_uid.
  const { data: rows } = await supabaseAdmin
    .from("usuarios")
    .select("id, role, is_active")
    .or(`id.eq.${authId},auth_uid.eq.${authId}`)
    .limit(1);

  const profile = rows?.[0];
  if (!profile || profile.is_active === false) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Acceso denegado" }, { status: 403 }),
    };
  }

  if (!roles.includes(profile.role as Role)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Permisos insuficientes" }, { status: 403 }),
    };
  }

  return {
    ok: true,
    user: { authId, userId: profile.id, role: profile.role as Role },
  };
}
