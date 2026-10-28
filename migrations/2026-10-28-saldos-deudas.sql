-- Saldo por boleta (transacciones.saldo de las deudas) calculado en la base.
-- Antes: el navegador bajaba deudas y pagos del cliente, recalculaba en JS y mandaba un UPDATE
-- por boleta, en serie. Misma lógica que lib/utils/saldo-imputacion.ts (recomputarSaldos /
-- imputarFIFO / imputarADeuda), con el residuo < 0.01 redondeado a 0.
-- Re-ejecutable.

create or replace function limpiar_residuo_saldo(p numeric) returns numeric
language sql immutable
as $$ select case when p < 0.01 then 0 else p end $$;

-- Recalcula desde cero el saldo de cada boleta del cliente/cuenta replayeando todos los pagos
-- vigentes en orden cronológico (con debt_id: a esa boleta y el sobrante FIFO; sin debt_id: FIFO).
-- Solo toca las boletas cuyo saldo cambia. No toca current_balance.
create or replace function recomputar_saldos_deudas(p_client_id text, p_cuenta text) returns void
language plpgsql
as $$
declare
  v_ids      text[];
  v_saldos   numeric[];
  v_actual   numeric[];
  v_n        int;
  v_pago     record;
  v_restante numeric;
  v_aplicado numeric;
  v_i        int;
  v_j        int;
begin
  -- Serializa recálculos del mismo cliente (dos pagos simultáneos).
  perform pg_advisory_xact_lock(hashtext('saldos:' || p_client_id || ':' || p_cuenta));

  select array_agg(id order by date, id),
         array_agg(limpiar_residuo_saldo(greatest(0, coalesce(amount, 0))) order by date, id),
         array_agg(saldo order by date, id)
    into v_ids, v_saldos, v_actual
    from transacciones
   where client_id = p_client_id
     and type = 'debt'
     and anulado = false
     and saldo is not null
     and (case when p_cuenta = 'mayorista' then cuenta = 'mayorista'
               else cuenta = 'minorista' or cuenta is null end);
  v_n := coalesce(array_length(v_ids, 1), 0);
  if v_n = 0 then
    return;
  end if;

  for v_pago in
    select amount, debt_id
      from transacciones
     where client_id = p_client_id
       and type = 'payment'
       and anulado = false
       and afecta_saldo is distinct from false
       and (case when p_cuenta = 'mayorista' then cuenta = 'mayorista'
                 else cuenta = 'minorista' or cuenta is null end)
     order by date, id
  loop
    v_restante := coalesce(v_pago.amount, 0);
    if v_pago.debt_id is not null then
      v_j := array_position(v_ids, v_pago.debt_id);
      if v_j is not null then
        v_aplicado := least(v_saldos[v_j], v_restante);
        v_saldos[v_j] := limpiar_residuo_saldo(v_saldos[v_j] - v_aplicado);
        v_restante := v_restante - v_aplicado;
      end if;
    end if;
    v_i := 1;
    while v_restante > 0 and v_i <= v_n loop
      if v_saldos[v_i] > 0 then
        v_aplicado := least(v_saldos[v_i], v_restante);
        v_saldos[v_i] := limpiar_residuo_saldo(v_saldos[v_i] - v_aplicado);
        v_restante := v_restante - v_aplicado;
      end if;
      v_i := v_i + 1;
    end loop;
  end loop;

  update transacciones t
     set saldo = u.saldo
    from unnest(v_ids, v_saldos, v_actual) as u(id, saldo, actual)
   where t.id = u.id
     and abs(u.saldo - u.actual) > 0.000000001;
end;
$$;

-- Imputa un pago suelto: con p_debt_id a esa boleta; sin él, FIFO a las boletas con saldo.
-- Las deudas legacy (saldo null) no se tocan en FIFO.
create or replace function aplicar_pago_a_deudas(
  p_client_id text,
  p_cuenta    text,
  p_monto     numeric,
  p_debt_id   text default null
) returns void
language plpgsql
as $$
declare
  v_deuda    record;
  v_restante numeric := p_monto;
  v_aplicado numeric;
begin
  perform pg_advisory_xact_lock(hashtext('saldos:' || p_client_id || ':' || p_cuenta));

  if p_debt_id is not null then
    update transacciones
       set saldo = limpiar_residuo_saldo(greatest(0, coalesce(saldo, amount) - p_monto))
     where id = p_debt_id;
    return;
  end if;

  for v_deuda in
    select id, saldo
      from transacciones
     where client_id = p_client_id
       and type = 'debt'
       and saldo > 0
       and (case when p_cuenta = 'mayorista' then cuenta = 'mayorista'
                 else cuenta = 'minorista' or cuenta is null end)
     order by date, id
     for update
  loop
    exit when v_restante <= 0;
    v_aplicado := least(v_deuda.saldo, v_restante);
    update transacciones set saldo = limpiar_residuo_saldo(v_deuda.saldo - v_aplicado) where id = v_deuda.id;
    v_restante := v_restante - v_aplicado;
  end loop;
end;
$$;
