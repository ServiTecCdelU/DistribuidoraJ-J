-- ============================================================
-- 2026-10-23 — Mover stock entre la distribuidora y el supermercado (kiosko)
-- ============================================================
-- Solo stock. El kiosko (Supermercado Patricia) tiene SU stock en su propia base;
-- los productos son los mismos (el kiosko guarda el id de aca como dist_id).
-- El kiosko orquesta cada transferencia y llama a mover_stock_kiosko con su id:
-- la tabla kiosko_transferencias hace que un reintento no descuente dos veces.
--
-- No destructivo y re-ejecutable.

create table if not exists kiosko_transferencias (
  id              text primary key,          -- id de la transferencia en el kiosko
  producto_id     text not null references productos(id),
  delta           numeric not null,          -- negativo: sale de aca; positivo: entra
  stock_anterior  numeric,
  stock_posterior numeric,
  created_at      timestamptz not null default now()
);

alter table kiosko_transferencias enable row level security;
revoke all on table kiosko_transferencias from anon, authenticated;

create or replace function mover_stock_kiosko(
  p_transferencia_id text,
  p_producto_id      text,
  p_delta            numeric
) returns jsonb
language plpgsql
as $$
declare
  v_prev   kiosko_transferencias%rowtype;
  v_actual numeric;
  v_nuevo  numeric;
begin
  if p_delta is null or p_delta = 0 then
    raise exception 'Cantidad invalida';
  end if;

  -- Reintento de una transferencia ya aplicada: no se toca nada.
  select * into v_prev from kiosko_transferencias where id = p_transferencia_id;
  if found then
    if v_prev.producto_id <> p_producto_id or v_prev.delta <> p_delta then
      raise exception 'La transferencia % ya existe con otros datos', p_transferencia_id;
    end if;
    return jsonb_build_object('stock', v_prev.stock_posterior, 'repetida', true);
  end if;

  select stock into v_actual from productos where id = p_producto_id for update;
  if not found then
    raise exception 'El producto % no existe en la distribuidora', p_producto_id;
  end if;

  v_nuevo := coalesce(v_actual, 0) + p_delta;
  if v_nuevo < 0 then
    raise exception 'Stock insuficiente en la distribuidora (hay %)', coalesce(v_actual, 0);
  end if;

  update productos set stock = v_nuevo where id = p_producto_id;
  update mayorista_productos set stock_local = v_nuevo where producto_id = p_producto_id;

  insert into stock_movimientos
    (id, mayorista_producto_id, tipo, cantidad, stock_anterior, stock_posterior, motivo, created_at)
  values
    (gen_random_uuid(),
     (select id from mayorista_productos where producto_id = p_producto_id limit 1),
     'ajuste', p_delta, v_actual, v_nuevo,
     case when p_delta < 0 then 'Transferencia al supermercado ' else 'Transferencia desde el supermercado ' end
       || p_transferencia_id,
     now());

  insert into kiosko_transferencias (id, producto_id, delta, stock_anterior, stock_posterior)
  values (p_transferencia_id, p_producto_id, p_delta, v_actual, v_nuevo);

  return jsonb_build_object('stock', v_nuevo, 'stock_anterior', v_actual, 'repetida', false);
end;
$$;

revoke execute on function mover_stock_kiosko(text, text, numeric) from public, anon, authenticated;
