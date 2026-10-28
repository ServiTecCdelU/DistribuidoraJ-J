-- Borra índices duplicados (misma definición sobre la misma tabla) en public.
-- No aceleran ninguna consulta y encarecen cada escritura.
-- Se conserva siempre el que respalda una constraint (PK/UNIQUE); si ninguno lo hace,
-- el de nombre menor. Re-ejecutable: si ya no hay duplicados, no hace nada.
do $$
declare
  r record;
begin
  for r in
    select a.indexname
    from pg_indexes a
    join pg_indexes b
      on a.schemaname = b.schemaname
     and a.tablename = b.tablename
     and a.indexname <> b.indexname
     and regexp_replace(a.indexdef, '.* ON ', '') = regexp_replace(b.indexdef, '.* ON ', '')
    where a.schemaname = 'public'
      -- nunca el que respalda una constraint
      and not exists (select 1 from pg_constraint c where c.conindid = ('public.' || quote_ident(a.indexname))::regclass)
      -- si el otro respalda una constraint, se borra este; si ninguno, se borra el de nombre mayor
      and (
        exists (select 1 from pg_constraint c where c.conindid = ('public.' || quote_ident(b.indexname))::regclass)
        or a.indexname > b.indexname
      )
    group by a.indexname
  loop
    raise notice 'drop index %', r.indexname;
    execute format('drop index if exists public.%I', r.indexname);
  end loop;
end $$;
