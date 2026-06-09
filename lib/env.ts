import { z } from "zod";

/**
 * Validación de variables de entorno.
 * Falla con un mensaje claro si falta una variable requerida,
 * en vez de propagar `undefined` y romper en runtime con un error oscuro.
 */

const serverEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url("NEXT_PUBLIC_SUPABASE_URL debe ser una URL válida"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY es requerida"),
});

type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | null = null;

/**
 * Devuelve las env server-side validadas (cacheadas tras la primera llamada).
 * Usar solo en código server-side (rutas API, services con service role).
 */
export function getServerEnv(): ServerEnv {
  if (cached) return cached;

  const parsed = serverEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.message).join("; ");
    throw new Error(`[env] Variables de entorno inválidas o faltantes: ${missing}`);
  }

  cached = parsed.data;
  return cached;
}
