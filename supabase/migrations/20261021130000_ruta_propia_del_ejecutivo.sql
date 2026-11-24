-- Ruta propia del ejecutivo (21/10/2026). Pedido de Jose: que los ejecutivos puedan ajustar sus rutas desde el celular
-- (mover un comercio a otra ruta y cambiar el orden). Lo recomendó la sesión «Stratis CRM campo Tanda 2».
--
-- Qué hace:
--   1. v2_asignaciones gana ruta_propia, orden_propio, ruta_propia_en y ruta_propia_por. La ruta recomendada (ruta, orden),
--      que carga el analista, NO se toca: así no se pierde la propuesta y el escritorio puede mostrar las dos.
--      Sin ruta propia, el comercio sigue en su ruta recomendada.
--   2. v2_bitacora_visita acepta líneas sin visita (un cambio de ruta no tiene visita): visita_id pasa a ser opcional y se
--      agregan periodo y customer_id. Toda línea lleva visita o comercio con periodo. Acción nueva «ruta».
--      Ninguna función lee la bitácora; el escritorio la lee por visita_id, así que estas líneas no le aparecen en la ficha
--      de una visita. El ejecutivo no ve estas líneas (la regla de lectura pide que la visita sea suya).
--   3. v2_armar_ruta(p_ruta, p_customer_ids): el ejecutivo deja la ruta p_ruta con esos comercios en ese orden.
--      Solo comercios propios (no libres, no de otro ejecutivo), del periodo vigente y que estén en su base (no los de
--      «salida»). Con p_ruta null, esos comercios vuelven a su ruta recomendada. Cada comercio que cambia deja su línea.
--   4. v2_mi_base devuelve ruta_propia, orden_propio y ruta_propia_en AL FINAL. Las columnas ruta y orden siguen siendo la
--      recomendada: el celular publicado (d9ca90) sigue igual y el escritorio no cambia lo que ve.
--
-- No toca visitas, el medidor, el avance ni el bono (Regla n.º 1). La usa el celular: se aplica el mismo día en que se
-- publica la app. Se aplica solo con el OK de Jose.

-- 1. Ruta propia por asignación -----------------------------------------------------------------------------------------
alter table public.v2_asignaciones
  add column if not exists ruta_propia text,
  add column if not exists orden_propio integer,
  add column if not exists ruta_propia_en timestamptz,
  add column if not exists ruta_propia_por text;
alter table public.v2_asignaciones drop constraint if exists v2_asignaciones_ruta_propia_check;
alter table public.v2_asignaciones add constraint v2_asignaciones_ruta_propia_check
  check ((ruta_propia is null) = (orden_propio is null)
         and (ruta_propia is null or char_length(btrim(ruta_propia)) between 3 and 80)
         and (orden_propio is null or orden_propio between 1 and 200));
comment on column public.v2_asignaciones.ruta_propia is 'Ruta que armó el ejecutivo desde el celular (v2_armar_ruta). La recomendada sigue en ruta.';
comment on column public.v2_asignaciones.orden_propio is 'Orden dentro de la ruta propia. Va junto con ruta_propia.';

-- 2. Bitácora con líneas sin visita -------------------------------------------------------------------------------------
alter table public.v2_bitacora_visita alter column visita_id drop not null;
alter table public.v2_bitacora_visita
  add column if not exists periodo text,
  add column if not exists customer_id text;
alter table public.v2_bitacora_visita drop constraint if exists v2_bitacora_visita_sujeto_check;
alter table public.v2_bitacora_visita add constraint v2_bitacora_visita_sujeto_check
  check (visita_id is not null or (periodo is not null and customer_id is not null));
alter table public.v2_bitacora_visita drop constraint if exists v2_bitacora_visita_accion_check;
alter table public.v2_bitacora_visita add constraint v2_bitacora_visita_accion_check CHECK ((accion = ANY (ARRAY['comentario'::text, 'resultado'::text, 'traslado'::text, 'pedido'::text, 'aprobado'::text, 'rechazado'::text, 'validada'::text, 'observada'::text, 'revision'::text, 'anulada'::text, 'restituida'::text, 'ubicacion'::text, 'seguimiento'::text, 'recupero'::text, 'ruta'::text])));
create index if not exists v2_bitacora_visita_comercio on public.v2_bitacora_visita(periodo, customer_id) where visita_id is null;

-- 3. Armar una ruta -----------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.v2_armar_ruta(p_ruta text, p_customer_ids text[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_correo text := public.correo_actual();
  v_per text := public.v2_periodo_de((now() at time zone 'America/Lima')::date);
  v_ruta text := nullif(btrim(coalesce(p_ruta, '')), '');
  v_ids text[] := coalesce(p_customer_ids, '{}');
  v_n int := coalesce(array_length(v_ids, 1), 0);
  v_cambios int := 0;
  r record;
begin
  if not public.es_usuario_activo() then raise exception 'Tu usuario no está activo.'; end if;
  if public.es_admin() then raise exception 'Las rutas propias las arma cada ejecutivo desde su celular.'; end if;
  if v_per is null then raise exception 'No hay un periodo vigente.'; end if;
  if v_n = 0 then raise exception 'Elige al menos un comercio.'; end if;
  if v_n > 60 then raise exception 'Una ruta puede tener hasta 60 comercios.'; end if;
  if (select count(distinct x) from unnest(v_ids) x) <> v_n then raise exception 'Un comercio está dos veces en la ruta.'; end if;
  if v_ruta is not null and char_length(v_ruta) not between 3 and 80 then raise exception 'El nombre de la ruta va de 3 a 80 caracteres.'; end if;

  -- todos tienen que ser del ejecutivo, del periodo vigente y estar en su base (los de «salida» no se ven en el celular)
  perform 1 from v2_asignaciones a where a.periodo = v_per and a.customer_id = any(v_ids) for update;
  if (select count(*) from v2_asignaciones a
      where a.periodo = v_per and a.customer_id = any(v_ids) and a.correo = v_correo and a.origen is distinct from 'salida') <> v_n then
    raise exception 'Solo puedes mover comercios de tu base de este periodo.';
  end if;

  for r in
    select a.customer_id, a.ruta, a.orden, a.ruta_propia, a.orden_propio, x.i::int i
    from unnest(v_ids) with ordinality x(cid, i) join v2_asignaciones a on a.periodo = v_per and a.customer_id = x.cid
    order by x.i
  loop
    -- sin cambio real (ya está en esa ruta y en ese lugar), no se escribe ni deja línea
    continue when (v_ruta is null and r.ruta_propia is null)
               or (v_ruta is not null and coalesce(r.ruta_propia, r.ruta) is not distinct from v_ruta
                   and coalesce(r.orden_propio, r.orden) is not distinct from r.i);
    update v2_asignaciones set
      ruta_propia = v_ruta, orden_propio = case when v_ruta is null then null else r.i end,
      ruta_propia_en = case when v_ruta is null then null else now() end,
      ruta_propia_por = case when v_ruta is null then null else v_correo end
    where periodo = v_per and customer_id = r.customer_id;
    insert into v2_bitacora_visita(visita_id, periodo, customer_id, accion, por, antes, despues)
    values (null, v_per, r.customer_id, 'ruta', v_correo,
            concat_ws(' · ', coalesce(r.ruta_propia, r.ruta, 'sin ruta'), coalesce(r.orden_propio, r.orden)::text),
            case when v_ruta is null then concat_ws(' · ', 'vuelve a la recomendada', coalesce(r.ruta, 'sin ruta'), r.orden::text)
                 else concat_ws(' · ', v_ruta, r.i::text) end);
    v_cambios := v_cambios + 1;
  end loop;
  return v_cambios;
end $function$;
revoke execute on function public.v2_armar_ruta(text, text[]) from public, anon;
grant execute on function public.v2_armar_ruta(text, text[]) to authenticated, service_role;

-- 4. v2_mi_base con la ruta propia --------------------------------------------------------------------------------------
-- Cambia lo que devuelve (columnas nuevas al final), por eso se borra y se vuelve a crear. El cuerpo es el de
-- 20261021100000_base_2026_11_bloques más las tres columnas nuevas.
drop function if exists public.v2_mi_base(text);
CREATE FUNCTION public.v2_mi_base(p_periodo text DEFAULT NULL::text)
 RETURNS TABLE(customer_id text, razon_social text, rubro text, departamento text, provincia text, distrito text, direccion text, zona text, tasa_debito numeric, tasa_credito numeric, tasa_foranea numeric, nombre_comercial text, direccion_corregida text, referencia text, contacto text, correo text, ruta text, orden integer, estado_comercio text, visitas integer, visitas_validas integer, ultima_visita timestamp with time zone, ultima_que text, ultima_decision text, dias_trx integer, estado text, referencia_base text, direccion_original text, geo_lat double precision, geo_lng double precision, geo_calidad text, ruc text, terminales integer, tasas_aprox boolean, sunat_direccion text, sunat_lat double precision, sunat_lng double precision, sunat_metros integer, sunat_estado text, dir_extra jsonb, volver_el date, ultima_motivo text, bbva_reactivado date,
   -- base 2026-11
   documento text, bloque smallint, origen text, bloque_ini date, bloque_fin date, potencial numeric, vinculacion text, vol_092026 numeric, tipo_equipo text, comercios_activos integer, grupo_ubicacion smallint, geo_nota text, contacto_celular text, contacto_correo text,
   -- ruta propia (21/10)
   ruta_propia text, orden_propio integer, ruta_propia_en timestamp with time zone)
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
    c.comercios_activos, c.grupo_ubicacion, c.geo_nota, c.contacto_celular, c.contacto_correo,
    a.ruta_propia, a.orden_propio, a.ruta_propia_en
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
