-- Base 2026-11 en bloques (20/10/2026). Encargo aprobado por Jose («conforme, procede») sobre
-- ESPEC_nueva_estructura_2026-11.md, sección 1 (datos). Solo estructura: los datos se cargan aparte, con el OK de Jose,
-- con el script de carga (que vive en el OneDrive, porque lleva documentos de comercios).
--
-- Qué hace:
--   1. v2_comercios gana los campos de la base nueva de BBVA: documento (RUC o DNI), potencial, vinculación,
--      volumen de setiembre, equipo, grupo de ubicación, nota de ubicación y contacto (celular y correo).
--   2. v2_asignaciones gana bloque (1 o 2) y origen:
--        'base_nueva'    → comercio de la base nueva, en su bloque;
--        'base_anterior' → visitado antes de la base nueva (19 y 20/10); no es pendiente, pero cuenta si BBVA lo reactiva;
--        'salida'        → no visitado de la base anterior; sale de la base activa SIN borrarse.
--      Los de 'salida' siguen en v2_asignaciones para que una visita que espera en la cola del celular se guarde igual
--      (Regla n.º 1: el medidor de visitas no se toca). El ejecutivo deja de verlos, salvo que reciban una visita.
--   3. v2_bloques guarda las fechas de cada bloque por periodo (se llenan cuando Jose las confirme).
--   4. v2_mi_base devuelve los campos nuevos AL FINAL (las columnas de siempre no cambian de lugar ni de nombre,
--      así el celular publicado sigue funcionando) y oculta al ejecutivo los comercios de 'salida' sin visita.
--
-- No toca visitas, transacciones, resultados de BBVA, el bono ni v2_registrar_visita.
-- Cambia v2_mi_base (la usa el celular): es compatible con la versión publicada, pero se aplica el mismo día que la carga.
-- Se aplica solo con el OK de Jose.

-- 1. Campos nuevos por comercio ------------------------------------------------------------------------------------
alter table public.v2_comercios
  add column if not exists documento text,
  add column if not exists potencial numeric,
  add column if not exists vinculacion text,
  add column if not exists vol_092026 numeric,
  add column if not exists tipo_equipo text,
  add column if not exists comercios_activos integer,
  add column if not exists grupo_ubicacion smallint,
  add column if not exists geo_nota text,
  add column if not exists contacto_celular text,
  add column if not exists contacto_correo text;

alter table public.v2_comercios drop constraint if exists v2_comercios_documento_check;
alter table public.v2_comercios add constraint v2_comercios_documento_check check (documento is null or documento ~ '^[0-9]{8}$|^[0-9]{11}$');
alter table public.v2_comercios drop constraint if exists v2_comercios_grupo_ubicacion_check;
alter table public.v2_comercios add constraint v2_comercios_grupo_ubicacion_check check (grupo_ubicacion is null or grupo_ubicacion between 1 and 3);
alter table public.v2_comercios drop constraint if exists v2_comercios_potencial_check;
alter table public.v2_comercios add constraint v2_comercios_potencial_check check (potencial is null or potencial >= 0);
-- Un documento no puede estar en dos comercios a la vez (hoy hay un RUC repetido en la base anterior: ese no lleva documento).
create unique index if not exists v2_comercios_documento_unico on public.v2_comercios(documento) where documento is not null;

comment on column public.v2_comercios.documento is 'RUC (11) o DNI (8) del comercio según BBVA (documento_bbva2). Base 2026-11.';
comment on column public.v2_comercios.potencial is 'Potencial en soles según BBVA. Base 2026-11.';
comment on column public.v2_comercios.vol_092026 is 'Volumen facturado en setiembre 2026 según BBVA (soles).';
comment on column public.v2_comercios.grupo_ubicacion is '1 = ubicado al 100 %, 2 = rango cercano, 3 = requiere búsqueda.';
comment on column public.v2_comercios.geo_nota is 'Nota de la ubicación; aquí van las otras direcciones del negocio. La dirección que manda es la de BBVA.';

-- 2. Bloque y origen por asignación --------------------------------------------------------------------------------
alter table public.v2_asignaciones
  add column if not exists bloque smallint,
  add column if not exists origen text;
alter table public.v2_asignaciones drop constraint if exists v2_asignaciones_bloque_check;
alter table public.v2_asignaciones add constraint v2_asignaciones_bloque_check check (bloque is null or bloque in (1, 2));
alter table public.v2_asignaciones drop constraint if exists v2_asignaciones_origen_check;
alter table public.v2_asignaciones add constraint v2_asignaciones_origen_check
  check (origen is null or origen in ('base_nueva', 'base_anterior', 'salida'));
-- Un comercio de la base nueva siempre tiene bloque; los otros orígenes no.
alter table public.v2_asignaciones drop constraint if exists v2_asignaciones_bloque_origen_check;
alter table public.v2_asignaciones add constraint v2_asignaciones_bloque_origen_check
  check ((origen = 'base_nueva') = (bloque is not null) or origen is null);

-- 3. Fechas de los bloques -----------------------------------------------------------------------------------------
create table if not exists public.v2_bloques (
  periodo text not null references public.v2_periodos(id),
  bloque smallint not null check (bloque in (1, 2)),
  ini date not null,
  fin date not null,
  primary key (periodo, bloque),
  check (fin >= ini)
);
alter table public.v2_bloques enable row level security;
drop policy if exists v2_bloques_lectura on public.v2_bloques;
create policy v2_bloques_lectura on public.v2_bloques for select to authenticated using ((select public.es_usuario_activo()));
-- Sin escritura desde las apps: lo carga el analista. Sin nada para anon.
revoke all on public.v2_bloques from anon;
revoke insert, update, delete, truncate, references, trigger on public.v2_bloques from authenticated;

-- 4. v2_mi_base con los campos nuevos --------------------------------------------------------------------------------
-- Cambia lo que devuelve (columnas nuevas al final), por eso se borra y se vuelve a crear.
drop function if exists public.v2_mi_base(text);
CREATE FUNCTION public.v2_mi_base(p_periodo text DEFAULT NULL::text)
 RETURNS TABLE(customer_id text, razon_social text, rubro text, departamento text, provincia text, distrito text, direccion text, zona text, tasa_debito numeric, tasa_credito numeric, tasa_foranea numeric, nombre_comercial text, direccion_corregida text, referencia text, contacto text, correo text, ruta text, orden integer, estado_comercio text, visitas integer, visitas_validas integer, ultima_visita timestamp with time zone, ultima_que text, ultima_decision text, dias_trx integer, estado text, referencia_base text, direccion_original text, geo_lat double precision, geo_lng double precision, geo_calidad text, ruc text, terminales integer, tasas_aprox boolean, sunat_direccion text, sunat_lat double precision, sunat_lng double precision, sunat_metros integer, sunat_estado text, dir_extra jsonb, volver_el date, ultima_motivo text, bbva_reactivado date,
   -- nuevos (base 2026-11)
   documento text, bloque smallint, origen text, bloque_ini date, bloque_fin date, potencial numeric, vinculacion text, vol_092026 numeric, tipo_equipo text, comercios_activos integer, grupo_ubicacion smallint, geo_nota text, contacto_celular text, contacto_correo text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with per as (select coalesce(p_periodo, public.v2_periodo_de((now() at time zone 'America/Lima')::date)) id),
  a as (select a.* from v2_asignaciones a, per where a.periodo = per.id
        and public.es_usuario_activo()
        and (public.es_admin() or a.correo = public.correo_actual() or a.correo is null)
        -- retiro temporal (06/10) y salida de la base anterior (base 2026-11): el ejecutivo no los ve; el analista sí.
        -- Si igual reciben una visita, vuelven a aparecer: la visita cuenta y se ve (Regla n.º 1).
        and (public.es_admin()
             or ((a.origen is distinct from 'salida')
                 and not exists (select 1 from v2_retiros_temporales r
                                 where r.periodo = a.periodo and r.customer_id = a.customer_id and r.restituido_en is null))
             or exists (select 1 from v2_visitas v where v.periodo = a.periodo and v.customer_id = a.customer_id and v.anulada_en is null))),
  vs as (select v.customer_id, count(*)::int n, count(*) filter (where v.lat is not null and not v.fuera_plazo)::int nv, max(v.visitado_en) ult
         from v2_visitas v, per where v.periodo = per.id and v.anulada_en is null group by v.customer_id),
  lv as (select distinct on (v.customer_id) v.customer_id, v.que, v.decision, v.fecha_reagenda, v.motivo from v2_visitas v, per
         where v.periodo = per.id and v.anulada_en is null order by v.customer_id, v.visitado_en desc),
  dx as (select e.customer_id, jsonb_agg(jsonb_build_object('direccion', e.direccion, 'distrito', e.distrito, 'en_zona', e.en_zona, 'verificacion', e.verificacion, 'lat', e.geo_lat, 'lng', e.geo_lng) order by e.orden) l
         from v2_direcciones_extra e where e.activa group by e.customer_id),
  kb as (select max(k.corte) corte from v2_cortes_bbva k, per, v2_periodos pp where pp.id = per.id and k.corte between pp.ini and pp.fin),
  rb as (select r.customer_id, r.corte from v2_resultados_bbva r, kb where r.corte = kb.corte and r.reactivado = 'Si')
  select c.customer_id, c.razon_social, c.rubro, c.departamento, c.provincia, c.distrito, c.direccion, c.zona,
    c.tasa_debito, c.tasa_credito, c.tasa_foranea, c.nombre_comercial, c.direccion_corregida, c.referencia, c.contacto,
    a.correo, a.ruta, a.orden, c.estado, coalesce(vs.n,0), coalesce(vs.nv,0), vs.ult, lv.que, lv.decision, d.dias,
    case when c.estado = 'Cancelado' then 'can'
         when d.dias >= 2 then 'rea'
         when d.dias = 1 then 'uno'
         when lv.decision = 'Realizará consumos' then 'esp'
         when lv.decision = 'Aún no decide' then 'seg'
         when lv.decision = 'Desiste del producto' then 'des'
         when lv.que = 'Reagendada' then 'rag'
         when lv.que = 'Sin éxito' then 'sin'
         when lv.que is not null then 'vis'
         else 'por' end,
    c.referencia_base, c.direccion_original, c.geo_lat, c.geo_lng, c.geo_calidad,
    c.ruc, c.terminales, c.tasas_aprox,
    case when s.difiere then nullif(btrim(coalesce(s.direccion,'')), '') end,
    case when s.difiere then sg.lat end,
    case when s.difiere then sg.lng end,
    case when s.difiere then public.v2_metros(c.geo_lat, c.geo_lng, sg.lat, sg.lng) end,
    nullif(s.estado, 'ACTIVO'),
    dx.l,
    lv.fecha_reagenda,
    lv.motivo,
    case when coalesce(vs.nv, 0) > 0 then rb.corte end,
    c.documento, a.bloque, a.origen, b.ini, b.fin, c.potencial, c.vinculacion, c.vol_092026, c.tipo_equipo,
    c.comercios_activos, c.grupo_ubicacion, c.geo_nota, c.contacto_celular, c.contacto_correo
  from a join v2_comercios c on c.customer_id = a.customer_id
  cross join per
  left join vs on vs.customer_id = a.customer_id
  left join lv on lv.customer_id = a.customer_id
  left join v2_sunat s on s.ruc = c.ruc
  left join dx on dx.customer_id = a.customer_id
  left join rb on rb.customer_id = a.customer_id
  left join v2_bloques b on b.periodo = a.periodo and b.bloque = a.bloque
  cross join lateral (
    select case when s.geo_lat between -12.6 and -11.3 and s.geo_lng between -77.35 and -76.5 then s.geo_lat end lat,
           case when s.geo_lat between -12.6 and -11.3 and s.geo_lng between -77.35 and -76.5 then s.geo_lng end lng
  ) sg
  cross join lateral (select case when vs.n is null then 0 else public.v2_dias_trx(a.customer_id, per.id) end dias) d
$function$;
revoke execute on function public.v2_mi_base(text) from public, anon;
grant execute on function public.v2_mi_base(text) to authenticated, service_role;
