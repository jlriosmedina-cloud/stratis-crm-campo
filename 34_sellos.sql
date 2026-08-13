-- ===========================================================================
--  Sellos: que un periodo liquidado no cambie de número solo
--
--  Hasta acá los parámetros del bono vivían en una sola fila de config. Eso
--  quiere decir que cambiar una meta en octubre recalculaba agosto y
--  septiembre con la meta nueva, en silencio, sin dejar rastro. Para un
--  incentivo que se paga mes a mes eso no es un detalle: es la diferencia
--  entre un cálculo auditable y uno que nadie puede reproducir dos veces.
--
--  Tres cosas se arreglan acá, y las tres son de la misma familia — congelar
--  lo que ya pasó:
--
--    1. Los parámetros pasan a tener periodo de vigencia. Cada periodo se
--       calcula con la versión que regía entonces. La revisión de octubre
--       cambia octubre en adelante, no lo ya pagado.
--
--    2. El periodo se puede cerrar con un sello: una foto de los números,
--       con nombre y fecha. Después se puede corregir un registro —queda en
--       la bitácora— pero lo liquidado no se mueve.
--
--    3. La facturación inicial deja de pedirse periodo a periodo. El acuerdo
--       del 12 de agosto congeló la base del proyecto, así que se carga una
--       vez y no se vuelve a tocar. Cada periodo solo trae el monto final.
--
--  Nada de esto lo ve un ejecutivo, y no por la pantalla: por RLS.
-- ===========================================================================

-- ---------------------------------------------------------------------------
--  1 · Parámetros del bono, con vigencia
--
--  La vigencia se expresa en periodos del bono (2026-10), no en fechas. Un
--  parámetro no empieza a regir un martes a las tres de la tarde: rige desde
--  un periodo completo. Decirlo en fechas invitaba a la pregunta de qué pasa
--  con las gestiones de esa misma semana.
-- ---------------------------------------------------------------------------
create table if not exists public.bono_parametros (
  vigente_desde   text primary key,              -- periodo del bono: 'YYYY-MM'
  valor           jsonb not null,
  nota            text,
  creado_en       timestamptz not null default now(),
  creado_por      text
);

comment on table public.bono_parametros is
  'Versiones del modelo de incentivos, cada una vigente desde un periodo del bono. El calculo de un periodo usa la version que regia entonces: cambiar una meta no reescribe lo ya liquidado.';

alter table public.bono_parametros drop constraint if exists ck_bono_periodo;
alter table public.bono_parametros add constraint ck_bono_periodo
  check (vigente_desde ~ '^[0-9]{4}-[0-9]{2}$');

create or replace function public.fn_bono_param_sello()
returns trigger language plpgsql as $fn$
begin
  new.creado_en  := now();
  new.creado_por := coalesce(public.correo_actual(), new.creado_por);
  if tg_op = 'UPDATE' then
    new.vigente_desde := old.vigente_desde;
  end if;
  return new;
end $fn$;

drop trigger if exists tg_bono_param_sello on public.bono_parametros;
create trigger tg_bono_param_sello
  before insert or update on public.bono_parametros
  for each row execute function public.fn_bono_param_sello();

-- Cada cambio de parámetros queda en la bitácora, con el antes y el después.
-- Una meta que cambia sin dejar rastro es la mitad de un problema; la otra
-- mitad es no poder decir quién la cambió.
create or replace function public.fn_auditar_bono_param()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare
  v_antes jsonb;
begin
  if tg_op = 'UPDATE' then v_antes := old.valor; else v_antes := null; end if;
  insert into public.auditoria (tabla, accion, registro_id, customer_id, comercio,
                                correo, ejecutivo, detalle)
  values ('bono_parametros',
          case when tg_op = 'INSERT' then 'editar' else 'editar' end,
          null, null, 'Parámetros del bono',
          coalesce(public.correo_actual(), 'sistema'),
          coalesce(public.correo_actual(), 'sistema'),
          jsonb_build_object(
            'vigente_desde', jsonb_build_object('antes', v_antes, 'despues', new.valor),
            '_nota', case when tg_op = 'INSERT'
                          then 'Nueva versión de los parámetros, vigente desde ' || new.vigente_desde
                          else 'Se corrigió la versión vigente desde ' || new.vigente_desde end));
  return new;
end $fn$;

drop trigger if exists tg_auditar_bono_param on public.bono_parametros;
create trigger tg_auditar_bono_param
  after insert or update on public.bono_parametros
  for each row execute function public.fn_auditar_bono_param();

alter table public.bono_parametros enable row level security;
drop policy if exists p_bono_param_all on public.bono_parametros;
create policy p_bono_param_all on public.bono_parametros for all
  using (public.es_admin()) with check (public.es_admin());
grant select, insert, update on public.bono_parametros to authenticated;

-- La versión que ya estaba en config pasa a ser la primera, vigente desde el
-- periodo en que arrancó el proyecto. Así ningún cálculo cambia hoy.
insert into public.bono_parametros (vigente_desde, valor, nota, creado_por)
select '2026-08', c.valor::jsonb,
       'Modelo del documento de incentivos, vigente desde el arranque del proyecto',
       'migración'
from public.config c
where c.clave = 'bono_parametros'
on conflict (vigente_desde) do nothing;

-- ---------------------------------------------------------------------------
--  2 · El sello del periodo
--
--  Cerrar un periodo guarda la foto: los números de cada ejecutivo y los
--  parámetros con los que se calcularon. El CRM la arma y la manda; la base
--  la sella con quién y cuándo, y no deja que se sobrescriba.
--
--  Un cierre equivocado no se borra: se anula, y la anulación también queda.
-- ---------------------------------------------------------------------------
create table if not exists public.periodos_cerrados (
  id            uuid primary key default gen_random_uuid(),
  periodo       text not null,
  foto          jsonb not null,
  nota          text,
  cerrado_en    timestamptz not null default now(),
  cerrado_por   text,
  anulado_en    timestamptz,
  anulado_por   text,
  anulado_nota  text
);

comment on table public.periodos_cerrados is
  'Foto sellada de los numeros de un periodo del bono. Lo liquidado no se recalcula: si despues se corrige una gestion, se ve en la bitacora pero el sello no cambia.';

alter table public.periodos_cerrados drop constraint if exists ck_cierre_periodo;
alter table public.periodos_cerrados add constraint ck_cierre_periodo
  check (periodo ~ '^[0-9]{4}-[0-9]{2}$');

-- Un solo sello vigente por periodo. Los anulados quedan, pero no cuentan.
drop index if exists ux_periodo_cerrado_vigente;
create unique index ux_periodo_cerrado_vigente
  on public.periodos_cerrados (periodo) where anulado_en is null;

create or replace function public.fn_cierre_sello()
returns trigger language plpgsql as $fn$
begin
  if tg_op = 'INSERT' then
    new.cerrado_en  := now();
    new.cerrado_por := coalesce(public.correo_actual(), new.cerrado_por);
    new.anulado_en  := null;
    new.anulado_por := null;
  else
    -- Lo único que se puede cambiar de un sello es anularlo. Ni la foto, ni el
    -- periodo, ni quién lo cerró: si eso se pudiera editar, no sería un sello.
    new.periodo     := old.periodo;
    new.foto        := old.foto;
    new.cerrado_en  := old.cerrado_en;
    new.cerrado_por := old.cerrado_por;
    if old.anulado_en is not null then
      raise exception 'Este cierre ya estaba anulado el %', old.anulado_en
        using errcode = 'check_violation';
    end if;
    if new.anulado_en is null then
      raise exception 'De un cierre sellado solo se puede anular. Para volver a cerrar el periodo, anula este y sella uno nuevo.'
        using errcode = 'check_violation';
    end if;
    new.anulado_en  := now();
    new.anulado_por := coalesce(public.correo_actual(), new.anulado_por);
  end if;
  return new;
end $fn$;

drop trigger if exists tg_cierre_sello on public.periodos_cerrados;
create trigger tg_cierre_sello
  before insert or update on public.periodos_cerrados
  for each row execute function public.fn_cierre_sello();

create or replace function public.fn_auditar_cierre()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  insert into public.auditoria (tabla, accion, registro_id, customer_id, comercio,
                                correo, ejecutivo, detalle)
  values ('periodos_cerrados',
          case when tg_op = 'INSERT' then 'editar' else 'eliminar' end,
          new.id, null, 'Periodo ' || new.periodo,
          coalesce(public.correo_actual(), 'sistema'),
          coalesce(public.correo_actual(), 'sistema'),
          jsonb_build_object(
            'periodo', jsonb_build_object('antes', null, 'despues', new.periodo),
            '_nota', case when tg_op = 'INSERT'
                          then 'Se selló el cierre del periodo ' || new.periodo
                          else 'Se anuló el cierre del periodo ' || new.periodo
                               || coalesce(' — ' || new.anulado_nota, '') end));
  return new;
end $fn$;

drop trigger if exists tg_auditar_cierre on public.periodos_cerrados;
create trigger tg_auditar_cierre
  after insert or update on public.periodos_cerrados
  for each row execute function public.fn_auditar_cierre();

alter table public.periodos_cerrados enable row level security;
drop policy if exists p_cierre_all on public.periodos_cerrados;
create policy p_cierre_all on public.periodos_cerrados for all
  using (public.es_admin()) with check (public.es_admin());
grant select, insert, update on public.periodos_cerrados to authenticated;

-- ---------------------------------------------------------------------------
--  3 · La facturación base del proyecto
--
--  El acuerdo del 12 de agosto congeló los S/ 35,3 MM de la base inicial. Ya
--  no tiene sentido pedir el monto inicial cada periodo: se carga una vez por
--  ejecutivo y el crecimiento de cada periodo se mide contra esa base.
--
--  La tabla facturacion se queda como está y sigue guardando el monto final
--  de cada periodo. El monto_inicial que ya tenía cargado no se toca: si
--  alguien no fija la base, el CRM sigue usándolo.
-- ---------------------------------------------------------------------------
create table if not exists public.facturacion_base (
  correo          text primary key,
  monto           numeric(14,2) not null,
  nota            text,
  actualizado_en  timestamptz not null default now(),
  actualizado_por text
);

comment on table public.facturacion_base is
  'Facturacion de la base inicial del proyecto por ejecutivo. Congelada por acuerdo del 12/08/2026: se carga una vez y el crecimiento de cada periodo se mide contra ella.';

alter table public.facturacion_base drop constraint if exists ck_fact_base_monto;
alter table public.facturacion_base add constraint ck_fact_base_monto
  check (monto >= 0);

create or replace function public.fn_fact_base_sello()
returns trigger language plpgsql as $fn$
begin
  new.actualizado_en  := now();
  new.actualizado_por := coalesce(public.correo_actual(), new.actualizado_por);
  if tg_op = 'UPDATE' then new.correo := old.correo; end if;
  return new;
end $fn$;

drop trigger if exists tg_fact_base_sello on public.facturacion_base;
create trigger tg_fact_base_sello
  before insert or update on public.facturacion_base
  for each row execute function public.fn_fact_base_sello();

-- Cambiar la base del proyecto es cambiar el denominador de un objetivo
-- acordado con el banco. No se hace sin dejar rastro.
create or replace function public.fn_auditar_fact_base()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if tg_op = 'UPDATE' and old.monto = new.monto then return new; end if;
  insert into public.auditoria (tabla, accion, registro_id, customer_id, comercio,
                                correo, ejecutivo, detalle)
  values ('facturacion_base', 'editar', null, null, 'Base de facturación',
          coalesce(public.correo_actual(), 'sistema'), new.correo,
          jsonb_build_object(
            'monto', jsonb_build_object(
              'antes',   case when tg_op = 'UPDATE' then to_jsonb(old.monto) else null end,
              'despues', to_jsonb(new.monto)),
            '_nota', 'Base de facturación de ' || new.correo));
  return new;
end $fn$;

drop trigger if exists tg_auditar_fact_base on public.facturacion_base;
create trigger tg_auditar_fact_base
  after insert or update on public.facturacion_base
  for each row execute function public.fn_auditar_fact_base();

alter table public.facturacion_base enable row level security;
drop policy if exists p_fact_base_all on public.facturacion_base;
create policy p_fact_base_all on public.facturacion_base for all
  using (public.es_admin()) with check (public.es_admin());
grant select, insert, update on public.facturacion_base to authenticated;
