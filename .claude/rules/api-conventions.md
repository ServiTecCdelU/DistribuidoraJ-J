# Convenciones de API

Route Handlers de Next.js en `app/api/`.

## Públicas vs protegidas
- **Públicas** (sin auth): `app/api/public/*` — clientes, productos, pedidos, mas-vendidos, vendedores. Solo lectura segura para la tienda.
- **Protegidas**: validar sesión con `lib/api-auth.ts`. Incluyen `facturacion/`, `ventas/emitir`, `afip/`, `generate-pdf`, `import-productos`, `remitos/`, `parse-remito/`, `drive/`, `apply-ganancia`.

## Cliente Supabase correcto
- Server-side / rutas API → `lib/supabase-admin.ts` (service role).
- Client-side → `lib/supabase.ts` (anon key).

## Formato de respuesta
Envelope consistente:
```ts
// éxito
return NextResponse.json({ success: true, data, error: null });
// error
return NextResponse.json({ success: false, data: null, error: "mensaje" }, { status: 400 });
```

## Reglas
- Validar input con `zod` antes de procesar. Nunca confiar en el body.
- Rate limiting en endpoints sensibles (`lib/rate-limit.ts`).
- Operaciones de negocio compuestas → RPC en PostgreSQL (ej. `process_sale`, `apply_ganancia_global`), no múltiples queries sueltas.
- Errores: no filtrar detalles internos ni secrets en el mensaje al cliente. Loguear detalle en server.
- PDFs: server-side `puppeteer-core` + `@sparticuz/chromium`; client-side `@react-pdf/renderer`.
