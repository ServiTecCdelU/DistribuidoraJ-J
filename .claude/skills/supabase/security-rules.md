# Supabase — Seguridad y RLS

## Estado actual (crítico)
**RLS está DESHABILITADO** en las tablas. Mientras siga así, la anon key puede leer/escribir lo que las políticas permitirían. Aplicar RLS — ver `PLAN_MEJORAS.md` 1.1.

## Principios
- `SUPABASE_SERVICE_ROLE_KEY` **bypassa RLS**. Solo server-side, solo en rutas protegidas con auth verificada. Nunca en cliente ni en `NEXT_PUBLIC_*`.
- La anon key va al navegador: asumir que el usuario ve su valor. Toda protección real es server-side o por RLS.
- No exponer datos de clientes/ventas/facturación por rutas `app/api/public/*` más allá de lo estrictamente necesario para la tienda.

## Plan RLS (esqueleto)
Al habilitar, por cada tabla:
```sql
ALTER TABLE ventas ENABLE ROW LEVEL SECURITY;

-- lectura: dueño o admin
CREATE POLICY ventas_select ON ventas
  FOR SELECT USING (
    auth.uid() = vendedor_auth_uid
    OR (auth.jwt() ->> 'role') = 'admin'
  );

-- escritura solo server (service role) o reglas explícitas
CREATE POLICY ventas_insert ON ventas
  FOR INSERT WITH CHECK ( (auth.jwt() ->> 'role') = 'admin' );
```
Ajustar columnas/roles reales por tabla. Probar cada política antes de producción (las RPC con service role siguen funcionando porque bypassean RLS).

## Checklist antes de exponer un endpoint
- [ ] ¿Usa admin client? → debe estar detrás de auth + verificación de rol server-side.
- [ ] ¿Devuelve datos sensibles a una ruta pública? → recortar campos.
- [ ] ¿La operación muta estado? → validar rol, no confiar en UI.
- [ ] ¿Hay un secret en el código/`settings.local.json`? → mover a env y rotar.
