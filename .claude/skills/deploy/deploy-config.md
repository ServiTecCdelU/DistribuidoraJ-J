# Deploy — Configuración

## Variables de entorno (Vercel · Project Settings → Environment Variables)

Supabase:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only, no `NEXT_PUBLIC_`)

AFIP / Bit Ingeniería:
- `BIT_INGENIERIA_CUIT`
- `BIT_INGENIERIA_PTO_VTA`
- `BIT_INGENIERIA_PRODUCTION`
- `BIT_INGENIERIA_COMPANY_NAME`
- `BIT_INGENIERIA_COMPANY_ADDRESS`
- `BIT_INGENIERIA_COMPANY_CITY`

Google Drive (backup PDFs): credenciales según `app/api/drive`.

> Mantener en sync con `.env.local` (local). No commitear valores.

## Runtime / build
- `next.config.mjs`: `ignoreBuildErrors: true`, `images.unoptimized: true`. **No modificar.**
- Generación de PDF server-side usa `puppeteer-core` + `@sparticuz/chromium` (compatible con serverless de Vercel). Si el deploy falla en `/api/generate-pdf`, revisar tamaño de función/timeout.
- Rutas API pesadas (PDF, parse-remito con tesseract): vigilar límites de ejecución de Vercel.

## MCP (opcional, local)
`.mcp.json` define el server MCP de Supabase en modo `--read-only`. Requiere en el entorno local:
- `SUPABASE_PROJECT_REF`
- `SUPABASE_ACCESS_TOKEN` (personal access token de Supabase, NO la service role key)

## Rollback
- Vercel → Deployments → promover un deploy previo a Production.
- O revertir el commit en `main` y push.
