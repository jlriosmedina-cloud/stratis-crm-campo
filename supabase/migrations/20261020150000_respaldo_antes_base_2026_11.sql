-- Respaldo completo de las tablas v2 y de las funciones v2 antes de la nueva estructura
-- (base 2026-11 en bloques quincenales, «Base anterior», sin segunda dirección SUNAT).
-- Pedido de Jose el 20/10/2026. Solo copia: no cambia ni borra nada de public.
-- Las copias viven en el esquema «respaldo», que la API no expone; además se les quita todo
-- permiso a anon y authenticated y se les activa RLS sin políticas.
-- Son copias de datos: no traen claves, índices, triggers ni secuencias. Para restaurar se usa el DDL
-- de las migraciones del repo y luego un setval de las secuencias.

create schema if not exists respaldo;
revoke all on schema respaldo from public, anon, authenticated;

do $$
declare t text;
begin
  for t in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'v2\_%'
    order by 1
  loop
    execute format('create table respaldo.%I as table public.%I', t || '_20261020', t);
    execute format('alter table respaldo.%I enable row level security', t || '_20261020');
    execute format('revoke all on respaldo.%I from public, anon, authenticated', t || '_20261020');
  end loop;
end $$;

-- Definición de todas las funciones v2 tal como estaban hoy
create table respaldo.funciones_v2_20261020 as
select p.oid::regprocedure::text as firma, pg_get_functiondef(p.oid) as definicion, now() as respaldado_en
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname like 'v2\_%' and p.prokind = 'f';
alter table respaldo.funciones_v2_20261020 enable row level security;
revoke all on respaldo.funciones_v2_20261020 from public, anon, authenticated;

comment on table respaldo.funciones_v2_20261020 is
  'Respaldo del 20/10/2026, antes de la nueva estructura de la base 2026-11. Código: tags respaldo-publicado-2026-10-20 y respaldo-pr16-2026-10-20.';
