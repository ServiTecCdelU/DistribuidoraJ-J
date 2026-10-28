-- Productos con irregularidad de stock agrupados en la base (antes: bajaba ~3600 movimientos
-- en páginas de 1000 y los agrupaba en JS). Irregular = una salida que intentó descontar más de lo
-- que había (stock_anterior + cantidad < 0): mover_stock la frena en 0 y el faltante queda oculto.
-- Re-ejecutable.
create or replace function productos_a_revisar()
returns table (
  mayorista_producto_id text,
  nombre                text,
  codigo                text,
  stock_actual          numeric,
  cantidad_movimientos  bigint,
  unidades_faltantes    numeric,
  ultima_fecha          timestamptz,
  ultimo_motivo         text
)
language sql
stable
as $$
  with irregulares as (
    select m.mayorista_producto_id, m.cantidad, m.stock_anterior, m.motivo, m.created_at,
           row_number() over (partition by m.mayorista_producto_id order by m.created_at desc, m.id) as rn
      from stock_movimientos m
     where m.stock_posterior = 0
       and m.cantidad < 0
       and m.stock_anterior + m.cantidad < 0
       and coalesce(m.mayorista_producto_id, '') <> ''
  )
  select i.mayorista_producto_id,
         coalesce(p.name, i.mayorista_producto_id),
         coalesce(p.codigo::text, regexp_replace(i.mayorista_producto_id, '^mp_', '')),
         coalesce(p.stock, 0),
         count(*),
         sum(-(i.stock_anterior + i.cantidad)),
         max(i.created_at),
         coalesce(max(i.motivo) filter (where i.rn = 1), '')
    from irregulares i
    left join productos p on p.id = 'prod_' || i.mayorista_producto_id
   group by i.mayorista_producto_id, p.name, p.codigo, p.stock
$$;
