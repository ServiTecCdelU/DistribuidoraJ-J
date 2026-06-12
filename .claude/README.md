# .claude — Estructura de contexto y herramientas

Configuración profesional de Claude Code para este proyecto. Objetivo: ubicar y entender cada área **sin leer todo el código**.

## Mapa

```
.claude/
├── settings.json          # hooks (pre/post tool) — compartido
├── settings.local.json    # permisos locales — NO compartir
├── context/
│   └── codemap.md         # ÍNDICE: qué archivo hace qué, por área. Leer primero.
├── rules/                 # estándares que aplican siempre
│   ├── architecture.md    # fachada lib/api.ts, UnifiedCart, RPC, no duplicar
│   ├── code-style.md      # teal/rounded-2xl, shadcn, inmutabilidad
│   ├── api-conventions.md # rutas públicas/protegidas, envelope, clientes Supabase
│   ├── testing.md         # Vitest, prioridad de cobertura
│   └── security.md        # secrets, RLS, auth, input
├── commands/              # slash commands: /review /fix-issue /create-feature /refactor /deploy
├── skills/                # conocimiento por dominio (auto-activable)
│   ├── react/             # React 19 + Next 16 patterns
│   ├── supabase/          # acceso a datos, RLS
│   └── deploy/            # Vercel, env, runtime
├── agents/                # subagentes: code-reviewer, security-auditor,
│   │                      # performance-expert, ui-designer, backend-architect
└── hooks/                 # validate-bash, lint, format (best-effort, Git Bash)
```

## Cómo leer rápido un área
1. `context/codemap.md` → ubicá page + componentes + service del área.
2. `app/<modulo>/<MODULO>.md` → doc detallado del módulo (si existe).
3. Solo entonces abrir los archivos concretos.

## Stack
Next.js 16 · React 19 · TS · Tailwind v4 · shadcn/ui · Supabase · Vitest · Vercel.
