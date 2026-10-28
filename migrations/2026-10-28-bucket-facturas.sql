-- ============================================================
-- 2026-10-28 — Bucket `facturas` (comprobantes de transferencia del cobro)
-- ============================================================
-- El cobro de pedidos (app/pedidos/page.tsx) sube el comprobante de transferencia a
-- `facturas` y guarda la URL pública en ventas.comprobante_transferencia. El bucket no
-- existía: la subida fallaba y el comprobante nunca se guardaba.
-- Público (se lee por getPublicUrl); subir/reemplazar solo usuarios logueados,
-- igual que `hojas-ruta`. No destructivo y re-ejecutable.

insert into storage.buckets (id, name, public)
values ('facturas', 'facturas', true)
on conflict (id) do update set public = true;

drop policy if exists facturas_select on storage.objects;
create policy facturas_select on storage.objects
  for select to authenticated
  using (bucket_id = 'facturas');

drop policy if exists facturas_insert on storage.objects;
create policy facturas_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'facturas');

-- upsert: true en la subida → necesita update además de insert
drop policy if exists facturas_update on storage.objects;
create policy facturas_update on storage.objects
  for update to authenticated
  using (bucket_id = 'facturas')
  with check (bucket_id = 'facturas');
