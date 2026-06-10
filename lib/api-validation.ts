import { NextResponse } from "next/server";
import type { z } from "zod";

type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: NextResponse };

/**
 * Parsea y valida el body JSON de un request contra un schema zod.
 * Devuelve `{ ok: true, data }` con el dato tipado, o `{ ok: false, response }`
 * con un 400 listo para retornar. Mantiene el campo de error que ya usa cada
 * ruta (`error` o `message`) para no romper a los clientes existentes.
 *
 * Uso:
 *   const parsed = await parseJsonBody(request, schema);
 *   if (!parsed.ok) return parsed.response;
 *   const { ... } = parsed.data;
 */
export async function parseJsonBody<T>(
  request: Request,
  schema: z.ZodSchema<T>,
  errorField: "error" | "message" = "error",
): Promise<ParseResult<T>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { [errorField]: "Body inválido (JSON malformado)" },
        { status: 400 },
      ),
    };
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const detalle = parsed.error.issues
      .map((i) => `${i.path.join(".") || "body"}: ${i.message}`)
      .join("; ");
    return {
      ok: false,
      response: NextResponse.json(
        { [errorField]: `Datos inválidos: ${detalle}` },
        { status: 400 },
      ),
    };
  }

  return { ok: true, data: parsed.data };
}
