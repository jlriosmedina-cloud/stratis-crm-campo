-- ===========================================================================
--  El CRM se actualiza solo
--
--  Hasta ahora, para ver lo que otro acababa de registrar había que recargar
--  la página entera: volver a bajar la cartera, las gestiones y a firmar las
--  evidencias. En campo, con datos móviles, eso son varios segundos y a veces
--  un reintento.
--
--  Van dos piezas:
--
--  1. La publicación de tiempo real. Postgres empuja cada alta, cambio y
--     borrado de clientes e interacciones a los navegadores conectados. Las
--     políticas RLS siguen aplicando: el ejecutivo solo recibe avisos de sus
--     propios comercios, igual que en una consulta normal.
--
--  2. pulso(): la firma barata del estado. Devuelve cuántos comercios y
--     gestiones ve QUIEN PREGUNTA y cuál fue el último movimiento. La
--     aplicación la consulta cada tanto y solo se molesta en volver a bajar
--     todo si la firma cambió. Va sin security definer a propósito: así lee
--     con los permisos del que llama y la firma respeta el RLS.
-- ===========================================================================

-- 1 ------------------------------------------------------------------ empuje
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname='supabase_realtime' and schemaname='public' and tablename='clientes') then
    alter publication supabase_realtime add table public.clientes;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname='supabase_realtime' and schemaname='public' and tablename='interacciones') then
    alter publication supabase_realtime add table public.interacciones;
  end if;
end $$;

-- 2 ------------------------------------------------------------------- pulso
create or replace function public.pulso()
returns table (comercios bigint, gestiones bigint, ultimo timestamptz)
language sql
stable
security invoker
set search_path = public
as $fn$
  select
    (select count(*) from public.clientes),
    (select count(*) from public.interacciones),
    greatest(
      coalesce((select max(greatest(c.creado_en, coalesce(c.modificado_en, c.creado_en)))
                  from public.clientes c), 'epoch'::timestamptz),
      coalesce((select max(greatest(i.creado_en, coalesce(i.modificado_en, i.creado_en)))
                  from public.interacciones i), 'epoch'::timestamptz)
    );
$fn$;

revoke all on function public.pulso() from public, anon;
grant execute on function public.pulso() to authenticated;

comment on function public.pulso is
  'Firma barata del estado visible para quien pregunta: cuantos comercios, cuantas gestiones y cual fue el ultimo movimiento. La app la usa para decidir si vale la pena recargar.';
