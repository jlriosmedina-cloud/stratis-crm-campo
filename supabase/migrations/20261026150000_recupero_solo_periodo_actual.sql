-- Recupero del POS: solo los casos del periodo en curso (decisión de Jose, 26/10/2026).
-- Desde el 09/10, los casos abiertos de periodos anteriores (y los deducidos de un «Desiste» sin acción registrada) pasaban al
-- periodo siguiente. Medido el 26/10: 50 comercios del periodo 2026-10 aparecían en la tarjeta «Recupero del POS» del celular,
-- ninguno está en la base 2026-11 y solo 1 recupero en toda la base tenía un paso registrado. Para el ejecutivo era confuso
-- («estos comercios no están en mi base») y el proceso todavía no tiene trazabilidad entre periodos.
--
-- Qué cambia: v2_recuperos_del_periodo(p) devuelve solo los recuperos del periodo p (los de v2_recuperos y los deducidos de las
-- visitas de ese periodo). Lo leen v2_mis_recuperos (celular y escritorio) y v2_recupero_para_escribir (avanzar y validar).
-- Qué no cambia: no se borra nada (v2_recuperos, v2_recupero_eventos y las visitas quedan igual); el escritorio sigue leyendo un
-- periodo anterior pasando p_periodo; las visitas, el medidor y el bono no se tocan; el celular no cambia de versión.
-- Para deshacer: volver a correr SOLO el bloque de v2_recuperos_del_periodo y sus grants de 20261010100000_recupero_pos.sql
-- (líneas 54 a 86), nunca el archivo completo: redefine el CHECK de acciones de la bitácora sin «ruta» y rompería la ruta propia.
-- Se aplica solo con el OK de Jose.

CREATE OR REPLACE FUNCTION public.v2_recuperos_del_periodo(p_periodo text)
 RETURNS TABLE(id bigint, customer_id text, correo text, visita_id uuid, paso text, caso_soporte text, desde date, actualizado_en timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with abiertos as (
    select r.* from v2_recuperos r
    where r.periodo = p_periodo and not (r.paso = 'sigue' and r.validado_en is not null)),
  leidos as (
    select r.*, vis.visitado_en vis_en,
      case when r.paso in ('llamar', 'tramite', 'entregado', 'trabado') and (
             vis.anulada_en is not null or vis.que is distinct from 'Reunión concretada' or vis.decision is distinct from 'Desiste del producto'
             or exists (select 1 from v2_visitas x where x.customer_id = r.customer_id and x.anulada_en is null and x.que = 'Reunión concretada'
                        and x.visitado_en > vis.visitado_en and x.decision is distinct from 'Desiste del producto'))
           then 'cambio' else r.paso end paso_leido
    from abiertos r join v2_visitas vis on vis.id = r.visita_id),
  u as (select distinct on (v.customer_id) v.* from v2_visitas v
        where v.periodo = p_periodo and v.anulada_en is null and v.que = 'Reunión concretada' order by v.customer_id, v.visitado_en desc)
  select l.id, l.customer_id, l.correo, l.visita_id, l.paso_leido, l.caso_soporte, (l.vis_en at time zone 'America/Lima')::date, l.actualizado_en
  from leidos l
  union all
  select null, u.customer_id, u.correo, u.id, case when u.equipo = 'Sí' then 'entregado' else 'llamar' end, null,
         (u.visitado_en at time zone 'America/Lima')::date, u.visitado_en
  from u where u.decision = 'Desiste del producto'
    and not exists (select 1 from leidos l where l.customer_id = u.customer_id)
    and not exists (select 1 from v2_recuperos r where r.customer_id = u.customer_id and r.periodo = p_periodo)
$function$;
revoke execute on function public.v2_recuperos_del_periodo(text) from public, anon, authenticated;
grant execute on function public.v2_recuperos_del_periodo(text) to service_role;
