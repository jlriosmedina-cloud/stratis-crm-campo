-- Retiro temporal de comercios de la base del ejecutivo (06/10/2026). Decisión de Jose: retirar por ahora los comercios
-- que ya facturan según BBVA y todavía no tienen visita, para que no entren en las rutas.
-- Solo se ocultan en el celular (v2_mi_base para ejecutivos). El analista los sigue viendo: el universo de 900, los
-- reportes, el Excel para BBVA y el medidor no cambian. Es reversible: se marca restituido_en y vuelven a aparecer.
-- No toca visitas, asignaciones ni el bono. Cambia v2_mi_base (la usa el celular) sin cambiar lo que devuelve.
-- Se aplica solo con el OK de Jose.

alter table public.v2_cargas drop constraint if exists v2_cargas_tipo_check;
alter table public.v2_cargas add constraint v2_cargas_tipo_check CHECK ((tipo = ANY (ARRAY['base'::text, 'transacciones'::text, 'estado'::text, 'resultados_bbva'::text, 'totales_bbva'::text, 'retiro_temporal'::text])));

create table if not exists public.v2_retiros_temporales (
  id bigserial primary key,
  periodo text not null references public.v2_periodos(id),
  customer_id text not null,
  motivo text not null check (char_length(btrim(motivo)) >= 10),
  retirado_por text not null,
  retirado_en timestamptz not null default now(),
  restituido_en timestamptz,
  restituido_por text,
  nota_restitucion text
);
-- un solo retiro vigente por comercio y periodo
create unique index if not exists v2_retiros_temporales_vigente on public.v2_retiros_temporales(periodo, customer_id) where restituido_en is null;

alter table public.v2_retiros_temporales enable row level security;
drop policy if exists v2_retiros_temporales_lectura on public.v2_retiros_temporales;
create policy v2_retiros_temporales_lectura on public.v2_retiros_temporales for select to authenticated using ((select public.v2_puede_escritorio()));
-- Sin escritura desde las apps: lo carga el analista con su respaldo en v2_cargas. Sin nada para anon.
revoke all on public.v2_retiros_temporales from anon;
revoke insert, update, delete, truncate, references, trigger on public.v2_retiros_temporales from authenticated;
revoke all on sequence public.v2_retiros_temporales_id_seq from anon, authenticated;

CREATE OR REPLACE FUNCTION public.v2_mi_base(p_periodo text DEFAULT NULL::text)
 RETURNS TABLE(customer_id text, razon_social text, rubro text, departamento text, provincia text, distrito text, direccion text, zona text, tasa_debito numeric, tasa_credito numeric, tasa_foranea numeric, nombre_comercial text, direccion_corregida text, referencia text, contacto text, correo text, ruta text, orden integer, estado_comercio text, visitas integer, visitas_validas integer, ultima_visita timestamp with time zone, ultima_que text, ultima_decision text, dias_trx integer, estado text, referencia_base text, direccion_original text, geo_lat double precision, geo_lng double precision, geo_calidad text, ruc text, terminales integer, tasas_aprox boolean, sunat_direccion text, sunat_lat double precision, sunat_lng double precision, sunat_metros integer, sunat_estado text, dir_extra jsonb, volver_el date, ultima_motivo text, bbva_reactivado date)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with per as (select coalesce(p_periodo, public.v2_periodo_de((now() at time zone 'America/Lima')::date)) id),
  a as (select a.* from v2_asignaciones a, per where a.periodo = per.id
        and public.es_usuario_activo()
        and (public.es_admin() or a.correo = public.correo_actual() or a.correo is null)
        -- retiro temporal (06/10): el ejecutivo no ve los comercios retirados; el analista sí (reportes y universo de 900).
        -- Si un retirado igual recibe una visita, vuelve a aparecer: la visita cuenta y se ve (Regla n.º 1).
        and (public.es_admin()
             or not exists (select 1 from v2_retiros_temporales r
                            where r.periodo = a.periodo and r.customer_id = a.customer_id and r.restituido_en is null)
             or exists (select 1 from v2_visitas v where v.periodo = a.periodo and v.customer_id = a.customer_id and v.anulada_en is null))),
  vs as (select v.customer_id, count(*)::int n, count(*) filter (where v.lat is not null and not v.fuera_plazo)::int nv, max(v.visitado_en) ult
         from v2_visitas v, per where v.periodo = per.id and v.anulada_en is null group by v.customer_id),
  lv as (select distinct on (v.customer_id) v.customer_id, v.que, v.decision, v.fecha_reagenda, v.motivo from v2_visitas v, per
         where v.periodo = per.id and v.anulada_en is null order by v.customer_id, v.visitado_en desc),
  dx as (select e.customer_id, jsonb_agg(jsonb_build_object('direccion', e.direccion, 'distrito', e.distrito, 'en_zona', e.en_zona, 'verificacion', e.verificacion, 'lat', e.geo_lat, 'lng', e.geo_lng) order by e.orden) l
         from v2_direcciones_extra e where e.activa group by e.customer_id),
  -- último corte de BBVA dentro del periodo y sus reactivados (informativo)
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
    case when coalesce(vs.nv, 0) > 0 then rb.corte end
  from a join v2_comercios c on c.customer_id = a.customer_id
  cross join per
  left join vs on vs.customer_id = a.customer_id
  left join lv on lv.customer_id = a.customer_id
  left join v2_sunat s on s.ruc = c.ruc
  left join dx on dx.customer_id = a.customer_id
  left join rb on rb.customer_id = a.customer_id
  cross join lateral (
    select case when s.geo_lat between -12.6 and -11.3 and s.geo_lng between -77.35 and -76.5 then s.geo_lat end lat,
           case when s.geo_lat between -12.6 and -11.3 and s.geo_lng between -77.35 and -76.5 then s.geo_lng end lng
  ) sg
  cross join lateral (select case when vs.n is null then 0 else public.v2_dias_trx(a.customer_id, per.id) end dias) d
$function$;
revoke execute on function public.v2_mi_base(text) from public, anon;
grant execute on function public.v2_mi_base(text) to authenticated, service_role;
