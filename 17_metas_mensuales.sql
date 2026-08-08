-- ===========================================================================
--  La cartera asignada, mes a mes
--
--  Hasta ahora el CRM solo sabía lo que se registró, nunca lo que había que
--  hacer. Sin denominador no hay alcance: un ejecutivo con 11 comercios
--  trabajados se ve igual de bien tenga 20 asignados o tenga 206.
--
--  El Analista y el Manager cargan cuántos casos le tocan a cada quien en cada
--  mes. Se guarda por mes, no se pisa: así queda el histórico y se puede ver la
--  evolución. El ejecutivo ve la suya, no la de los demás.
--
--  Y para que el avance del mes sea de verdad del mes, hace falta saber cuándo
--  se cerró cada comercio. Eso tampoco se guardaba.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1 · Cuándo se cerró la gestión
--     El resultado se veía, pero no la fecha en que se decidió. Sin ella todo
--     avance es acumulado y una meta mensual no significa nada.
-- ---------------------------------------------------------------------------
alter table public.clientes
  add column if not exists cerrado_en timestamptz;

comment on column public.clientes.cerrado_en is
  'Momento en que la gestion dejo de estar pendiente. La pone el disparador; se limpia si vuelve a Pendiente.';

create or replace function public.fn_sellar_cierre()
returns trigger language plpgsql as $fn$
begin
  if tg_op = 'INSERT' then
    if coalesce(new.resultado_gestion,'PENDIENTE') <> 'PENDIENTE' then
      new.cerrado_en := now();
    end if;
    return new;
  end if;

  if new.resultado_gestion is distinct from old.resultado_gestion then
    if coalesce(new.resultado_gestion,'PENDIENTE') = 'PENDIENTE' then
      new.cerrado_en := null;                       -- se reabrio: deja de contar
    elsif old.cerrado_en is null then
      new.cerrado_en := now();                      -- primer cierre
    end if;
    -- Si ya estaba cerrado y solo cambia de Retenido a Venta (o al reves), la
    -- fecha original se respeta: el mes en que se decidio no cambia.
  end if;
  return new;
end $fn$;

drop trigger if exists tg_sellar_cierre on public.clientes;
create trigger tg_sellar_cierre
  before insert or update on public.clientes
  for each row execute function public.fn_sellar_cierre();

-- Los comercios que ya estaban cerrados antes de existir la columna: se les
-- asigna la fecha de su ultima gestion, que es lo mas cercano a la verdad.
update public.clientes c
   set cerrado_en = coalesce(
        (select max(i.fecha_contacto)::timestamptz + interval '12 hours'
           from public.interacciones i where i.customer_id = c.customer_id),
        c.modificado_en)
 where coalesce(c.resultado_gestion,'PENDIENTE') <> 'PENDIENTE'
   and c.cerrado_en is null;

-- ---------------------------------------------------------------------------
-- 2 · La meta del mes
-- ---------------------------------------------------------------------------
create table if not exists public.metas (
  correo            text not null references public.usuarios(correo) on delete cascade,
  periodo           date not null,                  -- siempre dia 1 del mes
  cartera_asignada  integer not null default 0 check (cartera_asignada >= 0 and cartera_asignada <= 100000),
  nota              text,
  actualizado_por   text,
  actualizado_en    timestamptz not null default now(),
  primary key (correo, periodo)
);

comment on table public.metas is
  'Cuantos casos de la cartera BBVA tiene asignados cada ejecutivo en cada mes. Es el denominador del alcance.';

create index if not exists ix_metas_periodo on public.metas(periodo desc);

-- El periodo siempre queda anclado al dia 1: asi "agosto" es una sola fila y
-- no tres segun el dia en que se haya cargado.
create or replace function public.fn_normalizar_periodo()
returns trigger language plpgsql as $fn$
begin
  new.periodo := date_trunc('month', new.periodo)::date;
  new.actualizado_en := now();
  if tg_op = 'INSERT' then
    new.actualizado_por := coalesce(nullif(public.correo_actual(),''), new.actualizado_por);
  else
    new.actualizado_por := coalesce(nullif(public.correo_actual(),''), old.actualizado_por);
  end if;
  return new;
end $fn$;

drop trigger if exists tg_normalizar_periodo on public.metas;
create trigger tg_normalizar_periodo
  before insert or update on public.metas
  for each row execute function public.fn_normalizar_periodo();

-- ---------------------------------------------------------------------------
-- 3 · Quien puede verlas y quien puede cargarlas
-- ---------------------------------------------------------------------------
alter table public.metas enable row level security;

drop policy if exists p_metas_select on public.metas;
create policy p_metas_select on public.metas
  for select to authenticated
  using (public.es_admin() or correo = public.correo_actual());

drop policy if exists p_metas_insert on public.metas;
create policy p_metas_insert on public.metas
  for insert to authenticated with check (public.es_admin());

drop policy if exists p_metas_update on public.metas;
create policy p_metas_update on public.metas
  for update to authenticated using (public.es_admin()) with check (public.es_admin());

drop policy if exists p_metas_delete on public.metas;
create policy p_metas_delete on public.metas
  for delete to authenticated using (public.es_admin());

comment on policy p_metas_select on public.metas is
  'El ejecutivo ve su propia meta; el Analista y el Manager ven las de todos.';
comment on policy p_metas_insert on public.metas is
  'Solo el Analista y el Manager cargan metas.';

grant select, insert, update, delete on public.metas to authenticated;
