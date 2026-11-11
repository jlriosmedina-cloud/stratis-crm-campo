-- Celulares adicionales del comercio (11/11/2026, pedido de Jose).
-- BBVA envía hasta 3 números por comercio (columnas numero, numero2 y numero3 de su base). El CRM solo guardaba uno
-- (contacto_celular). Esta migración agrega contacto_celular2 y contacto_celular3 a v2_comercios y los devuelve al final de
-- v2_mi_base para que el celular los muestre en «Contacto de BBVA». contacto_celular sigue siendo el principal.
-- Qué hace: dos columnas nuevas (nulas) y v2_mi_base con dos columnas más al final (por eso se borra y se vuelve a crear:
-- Postgres no deja cambiar las columnas de salida con create or replace). Mismo cuerpo y mismo orden por customer_id.
-- Privilegios: igual que antes: sin PUBLIC ni anon; authenticated y service_role pueden ejecutarla.
-- Qué no hace: no toca v2_visitas, ni el registro, ni el medidor. Los números se cargan aparte, con respaldo.
-- Para deshacer: volver a crear v2_mi_base con la definición de 20261110230000_mi_base_ordenada.sql y, si se quiere,
-- alter table public.v2_comercios drop column contacto_celular2, drop column contacto_celular3;
-- Se aplica solo con el OK de Jose, el mismo día en que se publica el celular.

alter table public.v2_comercios add column if not exists contacto_celular2 text, add column if not exists contacto_celular3 text;

drop function if exists public.v2_mi_base(text);

CREATE FUNCTION public.v2_mi_base(p_periodo text DEFAULT NULL::text)
 RETURNS TABLE(customer_id text, razon_social text, rubro text, departamento text, provincia text, distrito text, direccion text, zona text, tasa_debito numeric, tasa_credito numeric, tasa_foranea numeric, nombre_comercial text, direccion_corregida text, referencia text, contacto text, correo text, ruta text, orden integer, estado_comercio text, visitas integer, visitas_validas integer, ultima_visita timestamp with time zone, ultima_que text, ultima_decision text, dias_trx integer, estado text, referencia_base text, direccion_original text, geo_lat double precision, geo_lng double precision, geo_calidad text, ruc text, terminales integer, tasas_aprox boolean, sunat_direccion text, sunat_lat double precision, sunat_lng double precision, sunat_metros integer, sunat_estado text, dir_extra jsonb, volver_el date, ultima_motivo text, bbva_reactivado date, documento text, bloque smallint, origen text, bloque_ini date, bloque_fin date, potencial numeric, vinculacion text, vol_092026 numeric, tipo_equipo text, comercios_activos integer, grupo_ubicacion smallint, geo_nota text, contacto_celular text, contacto_correo text, ruta_propia text, orden_propio integer, ruta_propia_en timestamp with time zone, contacto_celular2 text, contacto_celular3 text)
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
    a.ruta_propia, a.orden_propio, a.ruta_propia_en, c.contacto_celular2, c.contacto_celular3
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
  order by c.customer_id
$function$;
revoke all on function public.v2_mi_base(text) from public, anon;
grant execute on function public.v2_mi_base(text) to authenticated, service_role;
