-- ============================================================
-- 2026-10-28 — Caja: cobros de cuenta corriente en efectivo y devoluciones en efectivo
-- ============================================================
-- Hasta ahora el efectivo esperado era inicial + efectivo de ventas − comisiones. No
-- sumaba la plata que entra por cobros de cuenta corriente en efectivo ni restaba la que
-- sale al devolverle efectivo a un cliente, y el cierre automático (final = esperado)
-- escondía el descuadre.
--
-- 1. transacciones.metodo_pago: el medio de pago de cada cobro ('efectivo' |
--    'transferencia' | 'otro'). Antes solo estaba escrito en la descripción.
-- 2. caja.cobros_efectivo / caja.devoluciones_efectivo: lo que entró y salió por esto en
--    cada caja cerrada (queda registrado junto al resto del cierre).
-- 3. caja_movimientos_efectivo(desde, hasta): los movimientos de efectivo del período que
--    no son ventas, calculados en la base.
--
-- No destructivo y re-ejecutable.

alter table transacciones add column if not exists metodo_pago text;

-- Backfill desde la descripción con que se registraron los cobros
update transacciones
   set metodo_pago = case
         when description ilike 'Pago en efectivo%'      then 'efectivo'
         when description ilike 'Pago por transferencia%' then 'transferencia'
         when description ilike 'Pago con comprobante%'   then 'transferencia'
         when description ilike 'Pago registrado manualmente%' then 'otro'
       end
 where type = 'payment'
   and metodo_pago is null
   and (description ilike 'Pago en efectivo%'
     or description ilike 'Pago por transferencia%'
     or description ilike 'Pago con comprobante%'
     or description ilike 'Pago registrado manualmente%');

alter table caja add column if not exists cobros_efectivo numeric;
alter table caja add column if not exists devoluciones_efectivo numeric;

-- Movimientos de efectivo del período que no son ventas. monto > 0 entra, < 0 sale.
--  · cobro:          cobro de cta cte en efectivo registrado por el admin → entra al registrarse.
--  · cobro_cobrador: cobro en efectivo de un cobrador en la calle → entra cuando el admin
--                    lo autoriza (recibe la plata), no cuando el cobrador lo carga.
--  · devolucion:     nota de crédito "Devuelto en efectivo" (affects_balance = false).
--  · descuento:      descuento de venta devuelto en efectivo (se guarda sin client_id).
-- Los cobros anulados no cuentan.
create or replace function caja_movimientos_efectivo(p_desde timestamptz, p_hasta timestamptz)
returns table (tipo text, id text, fecha timestamptz, cliente text, monto numeric, detalle text)
language sql stable
as $$
  select 'cobro', t.id, t.created_at, c.name, t.amount, t.description
    from transacciones t
    left join clientes c on c.id = t.client_id
   where t.type = 'payment'
     and t.metodo_pago = 'efectivo'
     and not coalesce(t.anulado, false)
     and not exists (select 1 from comprobantes_pago cp where cp.transaction_id = t.id and cp.via_cobrador)
     and t.created_at >= p_desde and t.created_at < p_hasta
  union all
  select 'cobro_cobrador', t.id, cp.autorizado_at, c.name, t.amount, t.description
    from comprobantes_pago cp
    join transacciones t on t.id = cp.transaction_id
    left join clientes c on c.id = t.client_id
   where cp.via_cobrador
     and cp.autorizado
     and t.metodo_pago = 'efectivo'
     and not coalesce(t.anulado, false)
     and cp.autorizado_at >= p_desde and cp.autorizado_at < p_hasta
  union all
  select 'devolucion', d.id, d.created_at, d.client_name, -d.total,
         coalesce(d.recibo_numero, '') || coalesce(' — venta #' || d.sale_number, '')
    from devoluciones d
   where d.affects_balance = false
     and d.total > 0
     and d.created_at >= p_desde and d.created_at < p_hasta
  union all
  select 'descuento', t.id, t.created_at, null, -t.amount, t.description
    from transacciones t
   where t.type = 'payment'
     and t.description like '[DESCUENTO]%'
     and t.client_id is null
     and t.amount > 0
     and t.created_at >= p_desde and t.created_at < p_hasta
$$;
