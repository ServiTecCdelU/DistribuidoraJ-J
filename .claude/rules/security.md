# Seguridad

## Secrets
- NUNCA hardcodear keys/tokens. Usar `.env.local` (gitignored).
- `SUPABASE_SERVICE_ROLE_KEY` solo server-side. Nunca exponer al cliente ni en `NEXT_PUBLIC_*`.
- Revisar que `.claude/settings.local.json` no contenga secrets en comandos permitidos.

> ⚠️ Pendiente: rotar el secreto Supabase que quedó hardcodeado en `settings.local.json` (allow-list de curl). Ver `CLAUDE.local.md`.

## Supabase / RLS
- **RLS está deshabilitado (crítico)** — aplicar políticas antes de exponer más superficie. Ver `PLAN_MEJORAS.md` 1.1.
- Service role bypassea RLS: usarlo solo en rutas protegidas con auth verificada.

## Entradas
- Validar todo input con `zod` en el borde (forms y API).
- Parametrizar queries; con Supabase usar el SDK, no concatenar SQL. Las RPC reciben parámetros tipados.

## Auth
- Supabase Auth + Google OAuth. Roles: `admin`, `seller`, `customer`.
- Verificar rol en server para acciones sensibles, no solo ocultar en UI.
- Tras cambiar rol: `invalidateAuthCache()` (`hooks/use-auth.ts`).

## Antes de commit
- [ ] Sin secrets hardcodeados.
- [ ] Input validado.
- [ ] Rutas que mutan estado verifican auth/rol.
- [ ] Errores no filtran datos sensibles.
