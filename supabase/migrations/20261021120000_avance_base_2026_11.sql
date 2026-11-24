-- Avance y bono con la base 2026-11 (21/10/2026). Decisiones de Jose del 21/10 («conforme con las recomendaciones, procede»):
--   · Visitados: sobre 225 por ejecutivo, solo con la base nueva (origen = 'base_nueva'). La base anterior va aparte.
--   · Reactivados que cuentan: en la lista de BBVA y con v2_dias_trx ≥ 2 (estado 'rea'), incluidos los de la base anterior.
--   · Los de 'salida' sin visita dejan de ser cartera.
-- La meta de visitas (225) va en 20261021115000_meta_visitas_2026_11.sql, aplicada el 21/10.
-- Va después de 20261021100000_base_2026_11_bloques.sql (usa v2_mi_base.origen) y se aplica el mismo día.
-- En los periodos anteriores (origen null) todo se cuenta igual que antes. No cambia lo que devuelve v2_avance.
-- Aplicada el 21/10/2026 con el OK de Jose («Sí, aplica la migración 20261021120000 de v2_avance tal como está»).

CREATE OR REPLACE FUNCTION public.v2_avance(p_periodo text DEFAULT NULL::text)
 RETURNS TABLE(correo text, nombre text, rol text, base integer, visitados integer, reactivados integer, conversion numeric, cumpl_visitas numeric, cumpl_reactivados numeric, cumpl_conversion numeric, puntos numeric, bono_pct numeric, bono_pagado numeric, bono_retenido numeric, objetivo_bbva boolean, sin_parametros boolean, hay_transacciones boolean, periodo text, meta_visitas integer, meta_reactivados integer, meta_conversion numeric, peso_reactivados numeric, peso_visitas numeric, peso_conversion numeric, puntos_min numeric, puntos_tope numeric, bono_min numeric, bono_tope numeric, bono_max numeric, bbva_meta_reactivados integer, pago_pct numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with per as (
    select coalesce(p_periodo, public.v2_periodo_de((now() at time zone 'America/Lima')::date)) id
  ),
  pa as (select p.* from v2_parametros p, per where p.periodo = per.id),
  tx as (select exists (select 1 from v2_transacciones) hay),
  mb as (
    select m.correo, m.visitas_validas, m.estado, m.origen
    from per, public.v2_mi_base(per.id) m
    where m.correo is not null
  ),
  b as (
    -- base y visitados: solo la base nueva (o todo, en los periodos sin origen); reactivados: todos los que cuentan
    select correo,
           count(*) filter (where coalesce(origen, 'base_nueva') = 'base_nueva')::int                         n_base,
           count(*) filter (where coalesce(origen, 'base_nueva') = 'base_nueva' and visitas_validas > 0)::int n_vis,
           count(*) filter (where estado = 'rea')::int                                                       n_rea
    from mb group by correo
  ),
  u as (
    select b.correo,
           coalesce(us.nombre_corto, us.nombre, b.correo) nombre,
           us.rol, b.n_base, b.n_vis, b.n_rea,
           case when b.n_vis > 0 then round(b.n_rea::numeric / b.n_vis * 100, 1) else 0 end conv
    from b left join usuarios us on us.correo = b.correo
  ),
  c as (
    select u.*, pa.*,
           round(least(u.n_vis::numeric / nullif(pa.meta_visitas, 0),     1) * 100, 1) cv,
           round(least(u.n_rea::numeric / nullif(pa.meta_reactivados, 0), 1) * 100, 1) cr,
           round(least(u.conv          / nullif(pa.meta_conversion, 0),   1) * 100, 1) cc
    from u left join pa on true
  ),
  d as (
    select c.*,
           round((c.cr * c.peso_reactivados + c.cv * c.peso_visitas + c.cc * c.peso_conversion) / 100, 1) pts,
           (c.bbva_meta_reactivados is not null and c.n_rea >= c.bbva_meta_reactivados) obj
    from c
  ),
  e as (
    select d.*,
           case when d.pts is null then null
                when d.pts >= d.puntos_tope and d.obj then d.bono_max
                when d.pts >= d.puntos_tope           then d.bono_tope
                when d.pts >= d.puntos_min            then round(d.bono_min
                       + (d.bono_tope - d.bono_min) * (d.pts - d.puntos_min)
                         / nullif(d.puntos_tope - d.puntos_min, 0), 1)
                else 0 end bono
    from d
  )
  select e.correo, e.nombre, e.rol,
         e.n_base, e.n_vis, e.n_rea, e.conv,
         e.cv, e.cr, e.cc, e.pts,
         e.bono,
         round(e.bono * e.pago_pct / 100, 2),
         round(e.bono * (100 - e.pago_pct) / 100, 2),
         e.obj,
         e.periodo is null,
         (select hay from tx),
         (select id from per),
         e.meta_visitas, e.meta_reactivados, e.meta_conversion,
         e.peso_reactivados, e.peso_visitas, e.peso_conversion,
         e.puntos_min, e.puntos_tope, e.bono_min, e.bono_tope, e.bono_max,
         e.bbva_meta_reactivados, e.pago_pct
  from e
  order by e.pts desc nulls last, e.nombre
$function$;
