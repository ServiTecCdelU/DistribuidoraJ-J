-- ============================================================
-- 2026-10-27 — Atomicidad de saldos/stock/numeración + índices + vistas
-- ============================================================
-- Hasta ahora el saldo del cliente, los totales del vendedor y el stock se
-- actualizaban leyendo el valor en el navegador, sumando y escribiendo: dos
-- operaciones simultáneas se pisaban y se perdía un movimiento. Estas funciones
-- hacen la suma dentro de Postgres (una sola sentencia, con lock de fila).
--
-- `p_clave` (opcional) hace idempotente el movimiento: si ya se aplicó uno con
-- esa clave, no se repite. Sirve para que el reintento de un cobro cortado a
-- mitad no descuente/reponga stock ni sume comisión dos veces.
--
-- No destructivo y re-ejecutable.

-- ── 1. Índices ──────────────────────────────────────────────
create extension if not exists pg_trgm;

create index if not exists ventas_seller_created_idx    on ventas (seller_id, created_at desc);
create index if not exists ventas_client_created_idx    on ventas (client_id, created_at desc);
create index if not exists ventas_remito_created_idx    on ventas (created_at desc, id desc) where remito_number is not null;
create index if not exists ventas_order_id_idx          on ventas (order_id);
create index if not exists ventas_busqueda_trgm_idx     on ventas using gin (busqueda gin_trgm_ops);
create index if not exists pedidos_status_created_idx   on pedidos (status, created_at desc);
create index if not exists pedidos_busqueda_trgm_idx    on pedidos using gin (busqueda gin_trgm_ops);
create index if not exists transacciones_client_date_idx on transacciones (client_id, date desc);
create index if not exists transacciones_deuda_idx      on transacciones (client_id, date) where type = 'debt';
create index if not exists transacciones_sale_idx       on transacciones (sale_id);
create index if not exists devoluciones_seller_idx      on devoluciones (seller_id);
create index if not exists devoluciones_sale_idx        on devoluciones (sale_id);
create index if not exists pagos_comisiones_seller_idx  on pagos_comisiones (seller_id);
create index if not exists productos_name_trgm_idx      on productos using gin (name gin_trgm_ops);
create index if not exists productos_codigo_trgm_idx    on productos using gin (codigo gin_trgm_ops);
create index if not exists mayorista_desc_trgm_idx      on mayorista_productos using gin (descripcion gin_trgm_ops);
create index if not exists stock_mov_producto_idx       on stock_movimientos (mayorista_producto_id, created_at desc);

-- ── 2. Idempotencia ─────────────────────────────────────────
alter table stock_movimientos add column if not exists clave text;
create unique index if not exists stock_movimientos_clave_uq on stock_movimientos (clave) where clave is not null;

create table if not exists movimientos_aplicados (
  clave      text primary key,
  created_at timestamptz not null default now()
);

-- ── 3. Stock ────────────────────────────────────────────────
-- Misma lógica que registrarMovimiento (services/stock-service.ts):
-- fuente de verdad productos.stock (cae a mayorista_productos.stock_local),
-- nunca queda negativo, registra el movimiento y sincroniza ambas tablas.
create or replace function mover_stock(
  p_producto_id text,
  p_tipo        text,
  p_cantidad    numeric,
  p_motivo      text default null,
  p_clave       text default null
) returns numeric
language plpgsql
as $$
declare
  v_prod text;
  v_mp   text;
  v_ant  numeric;
  v_post numeric;
begin
  if p_producto_id like 'prod\_%' then
    v_prod := p_producto_id;
    v_mp   := substr(p_producto_id, 6);
  elsif p_producto_id like 'mp\_%' then
    v_prod := 'prod_' || p_producto_id;
    v_mp   := p_producto_id;
  else
    v_prod := p_producto_id;
    v_mp   := null;
  end if;

  select stock into v_ant from productos where id = v_prod for update;
  if v_ant is null and v_mp is not null then
    select stock_local into v_ant from mayorista_productos where id = v_mp for update;
  end if;

  -- Reintento: el movimiento con esta clave ya se aplicó (se chequea con la fila lockeada).
  if p_clave is not null then
    select stock_posterior into v_post from stock_movimientos where clave = p_clave limit 1;
    if found then
      return v_post;
    end if;
  end if;

  v_ant  := coalesce(v_ant, 0);
  v_post := greatest(0, v_ant + p_cantidad);

  insert into stock_movimientos (mayorista_producto_id, tipo, cantidad, stock_anterior, stock_posterior, motivo, clave)
  values (v_mp, p_tipo, p_cantidad, v_ant, v_post, p_motivo, p_clave);

  if v_mp is not null then
    update mayorista_productos set stock_local = v_post where id = v_mp;
  end if;
  update productos set stock = v_post where id = v_prod;

  return v_post;
end;
$$;

-- ── 4. Saldo del cliente ────────────────────────────────────
-- p_cuenta: 'minorista' → current_balance | 'mayorista' → current_balance_mayorista.
drop function if exists mover_saldo_cliente(text, numeric);
create or replace function mover_saldo_cliente(
  p_client_id text,
  p_delta     numeric,
  p_cuenta    text default 'minorista'
) returns numeric
language plpgsql
as $$
declare
  v_saldo numeric;
begin
  if p_cuenta = 'mayorista' then
    update clientes
       set current_balance_mayorista = round(coalesce(current_balance_mayorista, 0) + p_delta, 2)
     where id = p_client_id
    returning current_balance_mayorista into v_saldo;
  else
    update clientes
       set current_balance = round(coalesce(current_balance, 0) + p_delta, 2)
     where id = p_client_id
    returning current_balance into v_saldo;
  end if;
  if not found then
    raise exception 'El cliente % no existe', p_client_id;
  end if;
  return v_saldo;
end;
$$;

-- ── 5. Totales del vendedor ─────────────────────────────────
create or replace function mover_totales_vendedor(
  p_seller_id      text,
  p_delta_ventas   numeric,
  p_delta_comision numeric,
  p_clave          text default null
) returns void
language plpgsql
as $$
begin
  if p_clave is not null then
    insert into movimientos_aplicados (clave) values (p_clave) on conflict do nothing;
    if not found then
      return; -- ya aplicado
    end if;
  end if;
  update vendedores
     set total_sales      = greatest(0, round(coalesce(total_sales, 0) + p_delta_ventas, 2)),
         total_commission = greatest(0, round(coalesce(total_commission, 0) + p_delta_comision, 2))
   where id = p_seller_id;
end;
$$;

-- Pago de comisiones: registra el pago y pone en cero los totales en la misma
-- transacción (antes se ponían en cero primero y, si el insert fallaba, se perdían).
-- Rechaza un segundo pago igual dentro de 15 s (doble click).
create or replace function pagar_comisiones(
  p_pago_id     text,
  p_seller_id   text,
  p_seller_name text,
  p_monto       numeric,
  p_cantidad    integer,
  p_nota        text default null
) returns setof pagos_comisiones
language plpgsql
as $$
begin
  perform 1 from vendedores where id = p_seller_id for update;
  if exists (
    select 1 from pagos_comisiones
     where seller_id = p_seller_id
       and monto = round(p_monto, 2)
       and fecha_pago > now() - interval '15 seconds'
       and not coalesce(anulado, false)
  ) then
    raise exception 'Ese pago de comisión ya se registró';
  end if;

  update vendedores set total_commission = 0, total_sales = 0 where id = p_seller_id;

  return query
  insert into pagos_comisiones (id, seller_id, seller_name, monto, monto_pagado, fecha_pago, cantidad_comisiones, nota)
  values (p_pago_id, p_seller_id, p_seller_name, round(p_monto, 2), round(p_monto, 2), now(), p_cantidad, p_nota)
  returning *;
end;
$$;

-- ── 6. Numeración atómica ───────────────────────────────────
-- N° de venta (Nxxxx-dd-mm-aaaa): la secuencia da el número, la fecha la arma el código.
create sequence if not exists seq_venta_numero;
select setval('seq_venta_numero', greatest(m, 1), m > 0)
  from (select coalesce(max((substring(sale_number from '^N(\d+)-'))::bigint), 0) as m from ventas) s;

create or replace function next_venta_number() returns bigint
language sql
as $$ select nextval('seq_venta_numero') $$;

-- Recibo de devolución (DEV-00001). Antes: count(*)+1 → se repetía al borrar o en paralelo.
create sequence if not exists seq_devolucion_numero;
select setval('seq_devolucion_numero', greatest(m, 1), m > 0)
  from (select coalesce(max((substring(recibo_numero from '^DEV-(\d+)'))::bigint), 0) as m from devoluciones) s;

create or replace function next_devolucion_number() returns text
language sql
as $$ select 'DEV-' || lpad(nextval('seq_devolucion_numero')::text, 5, '0') $$;

-- Hoja de ruta: mismo contenido (fingerprint) → mismo número; si cambió → +1.
-- Igual que assignHojaRuta pero con lock de fila: dos admins a la vez ya no sacan el mismo número.
create or replace function next_hoja_ruta_number(p_fingerprint text) returns text
language plpgsql
as $$
declare
  v_value jsonb;
  v_last  integer;
begin
  insert into configuracion (key, value) values ('hoja_ruta', '{}'::jsonb) on conflict (key) do nothing;
  select value into v_value from configuracion where key = 'hoja_ruta' for update;
  v_last := coalesce((v_value->>'last')::integer, 0);
  if v_last > 0 and v_value->>'hash' = p_fingerprint then
    return lpad(v_last::text, 3, '0');
  end if;
  v_last := v_last + 1;
  update configuracion set value = jsonb_build_object('last', v_last, 'hash', p_fingerprint) where key = 'hoja_ruta';
  return lpad(v_last::text, 3, '0');
end;
$$;

-- ── 7. Vistas y agregados (cálculo en la base) ──────────────
-- Deuda pendiente más antigua por cliente + si tiene deuda anterior ([DEUDA_ANT]).
-- Reemplaza el barrido de transacciones en el navegador (cortaba en 1000 filas).
create or replace view cliente_deuda_desde as
select client_id,
       min(date)                                   as debt_since,
       bool_or(description like '[DEUDA_ANT]%')    as deuda_anterior
  from transacciones
 where type = 'debt'
   and coalesce(saldo, amount) > 0.01
 group by client_id;

-- Cantidad de compras por cliente (export de Clientes: antes bajaba todas las ventas con PDFs).
create or replace view compras_por_cliente as
select client_id, count(*)::integer as compras
  from ventas
 where client_id is not null
 group by client_id;

-- Rubros de productos habilitados (antes: paginar toda la tabla para sacar los distintos).
create or replace view rubros_habilitados as
select distinct category
  from productos
 where coalesce(disabled, false) = false
   and category is not null
   and category <> '';

-- Valor del inventario (antes: 8 requests para sumar price*stock en el navegador).
create or replace function valor_inventario() returns numeric
language sql stable
as $$
  select coalesce(sum(coalesce(price, 0) * coalesce(stock, 0)), 0)
    from productos
   where coalesce(disabled, false) = false
$$;
