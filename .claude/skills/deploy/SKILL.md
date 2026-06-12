---
name: deploy
description: Despliegue del proyecto en Vercel — pre-checks, variables de entorno, build, post-deploy. Usar al desplegar o diagnosticar fallos de deploy.
---

# Deploy (Vercel)

Next.js 16 desplegado en Vercel. Push a `main` dispara deploy automático.

## Pre-checks
1. `npm run build` pasa. Nota: `next.config.mjs` tiene `typescript.ignoreBuildErrors: true` e `images.unoptimized: true` — errores TS no frenan el build, pero errores de runtime/import sí.
2. `npm run lint` sin errores nuevos.
3. Sin secrets hardcodeados (ver skill `supabase` / `rules/security.md`).
4. Variables de entorno cargadas en Vercel (ver `deploy-config.md`).

## Deploy
- **Automático**: `git push origin main`.
- **Manual**: `vercel --prod` (o skill `vercel:deploy`).
- **Logs**: skill `vercel:logs` o `vercel logs <url>`.

## Post-deploy — verificar
- `/caja`, `/ventas/nueva`, `/pedidos`.
- API `ventas/emitir` (AFIP). `generate-pdf` (puppeteer + chromium).
- `lib/rate-limit.ts` es in-memory: se resetea en cada redeploy (esperado).

Detalle de env y runtime en `deploy-config.md`.
