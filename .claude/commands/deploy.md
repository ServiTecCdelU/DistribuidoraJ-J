---
description: Verifica y despliega a Vercel
---

Despliegue a Vercel (producción).

Pre-checks obligatorios:
1. `npm run build` debe pasar (recordá: errores TS se ignoran por `next.config.mjs`, pero errores de build reales NO).
2. `npm run lint` sin errores nuevos.
3. Revisar que no haya secrets nuevos hardcodeados (ver `.claude/rules/security.md`).
4. Variables de entorno presentes en Vercel (Supabase, AFIP/Bit Ingeniería, Google Drive). Ver `CLAUDE.local.md`.

Deploy:
- Push a `main` dispara el deploy automático en Vercel.
- Manual: `vercel --prod` (skill `vercel:deploy`).
- Logs / debug: skill `vercel:logs`.

Post-deploy:
- Verificar rutas críticas: `/caja`, `/ventas/nueva`, `/pedidos`, API `ventas/emitir`.
- Recordá que `lib/rate-limit.ts` es in-memory y se resetea en cada redeploy.
