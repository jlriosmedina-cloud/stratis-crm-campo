-- Reactivados de BBVA que todavía no cuentan para la comisión (09/10/2026). Decisión de Jose: BBVA reporta comercios
-- reactivados, pero al ejecutivo le cuentan solo si, después de su primera visita válida con contacto, el comercio
-- transacciona en 2 días distintos (v2_dias_trx, sin cambios). A todo reactivado de BBVA que aún no cuenta, el ejecutivo
-- lo contacta (llamada, WhatsApp o correo) y lo registra como seguimiento remoto, aunque la visita haya tenido contacto.
-- No cambia la visita, el estado, el avance ni el bono (Regla n.º 1). Deja su línea en v2_bitacora_visita («seguimiento»).
-- La usa el celular: se aplica el mismo día en que se publica la app. Se aplica solo con el OK de Jose.

-- ¿Es reactivado de BBVA en el último corte del periodo y todavía no cuenta (menos de 2 días con transacciones)?
CREATE OR REPLACE FUNCTION public.v2_reactivado_por_contactar(p_cid text, p_periodo text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with kb as (select max(k.corte) corte from v2_cortes_bbva k join v2_periodos pp on pp.id = p_periodo where k.corte between pp.ini and pp.fin)
  select exists (select 1 from v2_resultados_bbva r, kb where r.corte = kb.corte and r.customer_id = p_cid and r.reactivado = 'Si')
     and public.v2_dias_trx(p_cid, p_periodo) < 2
$function$;
-- Solo la usa v2_registrar_seguimiento (security definer): nadie con sesión la llama directo.
revoke execute on function public.v2_reactivado_por_contactar(text, text) from public, anon, authenticated;
grant execute on function public.v2_reactivado_por_contactar(text, text) to service_role;

-- Registrar un seguimiento: visitas sin contacto, o la última visita de un reactivado de BBVA que aún no cuenta.
CREATE OR REPLACE FUNCTION public.v2_registrar_seguimiento(p_visita_id uuid, p_canal text, p_resultado text, p_nota text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_correo text := public.correo_actual();
  v record; v_id bigint; v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
begin
  if not public.es_usuario_activo() then raise exception 'Tu usuario no está activo.'; end if;
  select * into v from v2_visitas where id = p_visita_id;
  if not found then raise exception 'No se encontró la visita.'; end if;
  if v.correo is distinct from v_correo and not public.es_admin() then raise exception 'Solo el ejecutivo de la visita registra su seguimiento.'; end if;
  if v.anulada_en is not null then raise exception 'La visita está anulada.'; end if;
  if v.con is distinct from 'Nadie' and not (
       public.v2_reactivado_por_contactar(v.customer_id, v.periodo)
       and v.id = (select x.id from v2_visitas x where x.customer_id = v.customer_id and x.periodo = v.periodo and x.anulada_en is null
                   order by x.visitado_en desc limit 1)) then
    raise exception 'El seguimiento remoto es para las visitas sin contacto o para los reactivados BBVA que aún no cuentan.';
  end if;
  if v.periodo is distinct from public.v2_periodo_de((now() at time zone 'America/Lima')::date) then raise exception 'La visita es de un periodo cerrado.'; end if;
  if char_length(v_nota) > 300 then raise exception 'La nota tiene más de 300 caracteres.'; end if;
  insert into v2_seguimientos(visita_id, customer_id, periodo, correo, por, canal, resultado, nota)
  values (v.id, v.customer_id, v.periodo, v.correo, v_correo, p_canal, p_resultado, v_nota)
  returning id into v_id;
  insert into v2_bitacora_visita(visita_id, accion, por, antes, despues)
  values (v.id, 'seguimiento', v_correo, null, concat_ws(' · ', p_canal, p_resultado, v_nota));
  return v_id;
end $function$;
revoke execute on function public.v2_registrar_seguimiento(uuid, text, text, text) from public, anon;
grant execute on function public.v2_registrar_seguimiento(uuid, text, text, text) to authenticated, service_role;

-- Para el celular: los reactivados de BBVA del ejecutivo (un admin ve todos) en el último corte del periodo, con visita.
-- dias_trx: días con transacciones después de la primera visita válida con contacto (2 o más = cuenta).
CREATE OR REPLACE FUNCTION public.v2_mis_reactivados_bbva(p_periodo text DEFAULT NULL::text)
 RETURNS TABLE(customer_id text, dias_trx integer, con_contacto boolean, ultima_visita_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with per as (select coalesce(p_periodo, public.v2_periodo_de((now() at time zone 'America/Lima')::date)) id),
  kb as (select max(k.corte) corte from v2_cortes_bbva k, per, v2_periodos pp where pp.id = per.id and k.corte between pp.ini and pp.fin)
  select r.customer_id, public.v2_dias_trx(r.customer_id, per.id),
    exists (select 1 from v2_visitas c where c.customer_id = r.customer_id and c.periodo = per.id and c.anulada_en is null
            and c.lat is not null and not c.fuera_plazo and c.con <> 'Nadie'),
    u.id
  from v2_resultados_bbva r
  cross join per join kb on r.corte = kb.corte
  join v2_asignaciones a on a.periodo = per.id and a.customer_id = r.customer_id
  cross join lateral (select x.id from v2_visitas x where x.customer_id = r.customer_id and x.periodo = per.id and x.anulada_en is null
                      order by x.visitado_en desc limit 1) u
  where r.reactivado = 'Si' and public.es_usuario_activo()
    -- como v2_mi_base.bbva_reactivado: solo con visita válida (con ubicación y a tiempo)
    and exists (select 1 from v2_visitas w where w.customer_id = r.customer_id and w.periodo = per.id and w.anulada_en is null and w.lat is not null and not w.fuera_plazo) and (public.es_admin() or a.correo = public.correo_actual())
$function$;
revoke execute on function public.v2_mis_reactivados_bbva(text) from public, anon;
grant execute on function public.v2_mis_reactivados_bbva(text) to authenticated, service_role;
