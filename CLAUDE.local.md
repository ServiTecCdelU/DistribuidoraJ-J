# CLAUDE.local.md

> Notas locales del desarrollador. **NO se commitea** (agregar a `.gitignore`).
> Para reglas del proyecto compartidas ver `CLAUDE.md`.

## Entorno local

- SO: Windows 10 Pro — shell PowerShell 7 (`pwsh`). Bash disponible vía Git Bash.
- Node: usar el del proyecto. Scripts npm invocan binarios desde `./node_modules` directamente.
- Editor: VS Code.

## Comandos rápidos

```bash
npm run dev        # dev server (localhost:3000)
npm run build      # build prod (ignora errores TS — ver next.config.mjs)
npm run lint       # eslint .
npm run test       # vitest run
npm run test:watch # vitest watch
```

## Credenciales / Variables (NO pegar valores acá)

Las variables viven en `.env.local` (gitignored). Requeridas:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `BIT_INGENIERIA_CUIT`, `BIT_INGENIERIA_PTO_VTA`, `BIT_INGENIERIA_PRODUCTION`
- `BIT_INGENIERIA_COMPANY_NAME`, `BIT_INGENIERIA_COMPANY_ADDRESS`, `BIT_INGENIERIA_COMPANY_CITY`
- Credenciales Google Drive (backup PDFs)

## Atajos de diagnóstico

Scripts sueltos en `scripts/` (diag-*, fix-*) para depurar datos en Supabase. Se ejecutan con:

```bash
npx tsx scripts/diag-xxx.js
```

## Pendientes personales

- [ ] Aplicar RLS en Supabase (crítico — ver `PLAN_MEJORAS.md` 1.1).
- [ ] Limpiar `firebase` / `firebase-admin` de `package.json` (deps sin uso).
- [ ] Rotar secreto Supabase que quedó hardcodeado en `settings.local.json`.
