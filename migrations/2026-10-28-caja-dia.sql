-- Todo lo que necesita la pantalla de Caja para un día en UNA llamada (antes: buscar la caja y
-- después 5 consultas más). Los totales siguen saliendo de la fórmula única en JS
-- (efectivoEsperado, lib/utils/caja-desglose.ts), compartida con el PDF y el cierre automático:
-- la pantalla igual necesita las filas para listarlas.
-- Re-ejecutable.
--
-- p_hoy:   inicio del día de hoy (hora Argentina) — lo manda el navegador.
-- p_hasta: hasta cuándo (ahora).
-- p_incluir_cerrada: false → solo la caja ABIERTA de hoy (carga inicial).
--                    true  → la última de hoy aunque esté cerrada; si no hay, la última abierta
--                            (recarga después de una acción, igual que loadData).
-- Devuelve {caja, desde, ventas, perdidas, comisiones, rechazados, movimientos}.
create or replace function caja_dia(
  p_hoy             timestamptz,
  p_hasta           timestamptz,
  p_incluir_cerrada boolean default false
) returns jsonb
language plpgsql
stable
as $$
declare
  v_caja  caja%rowtype;
  v_desde timestamptz := p_hoy;
begin
  if p_incluir_cerrada then
    select * into v_caja from caja where opened_at >= p_hoy order by opened_at desc limit 1;
    if not found then
      select * into v_caja from caja where status = 'open' order by opened_at desc limit 1;
    end if;
  else
    select * into v_caja from caja where status = 'open' and opened_at >= p_hoy
     order by opened_at desc limit 1;
  end if;

  -- El día de la caja (puede ser una abierta de otro día si el cierre automático no corrió).
  if v_caja.id is not null then
    v_desde := date_trunc('day', v_caja.opened_at at time zone 'America/Argentina/Buenos_Aires')
               at time zone 'America/Argentina/Buenos_Aires';
  end if;

  return jsonb_build_object(
    'caja', case when v_caja.id is null then null else to_jsonb(v_caja) end,
    'desde', v_desde,
    -- Solo ventas con remito: sin remito es un cobro duplicado/incompleto (vale el remito).
    'ventas', coalesce((
      select jsonb_agg(to_jsonb(v) - 'remito_pdf_base64' - 'invoice_pdf_base64' - 'afip_data'
                                   - 'client_data' - 'busqueda' order by v.created_at desc)
        from ventas v
       where v.created_at >= v_desde and v.created_at <= p_hasta and v.remito_number is not null
    ), '[]'::jsonb),
    'perdidas', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'amount', t.amount, 'description', t.description, 'date', t.date))
        from transacciones t
       where t.description like '[ROTURA]%' and t.date >= v_desde
    ), '[]'::jsonb),
    'comisiones', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'seller_name', p.seller_name, 'monto', p.monto,
                                          'monto_pagado', p.monto_pagado, 'created_at', p.created_at,
                                          'fecha_pago', p.fecha_pago))
        from pagos_comisiones p
       where not coalesce(p.anulado, false) and p.fecha_pago >= v_desde
    ), '[]'::jsonb),
    'rechazados', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'client_name', p.client_name,
                                          'remito_number', p.remito_number, 'updated_at', p.updated_at))
        from pedidos p
       where p.status = 'rechazado' and p.updated_at >= v_desde
    ), '[]'::jsonb),
    'movimientos', coalesce((
      select jsonb_agg(to_jsonb(m)) from caja_movimientos_efectivo(v_desde, p_hasta) m
    ), '[]'::jsonb)
  );
end;
$$;
