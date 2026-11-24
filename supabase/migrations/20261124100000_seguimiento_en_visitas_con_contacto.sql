-- Seguimiento remoto en visitas con contacto (24/11/2026). Pedido de Jose a raíz de un ejecutivo en campo: el comercio respondió
-- después de una visita con contacto («Aún no decide») y no había dónde dejar el comentario. Hasta hoy el seguimiento remoto era
-- solo para visitas sin contacto y para reactivados BBVA que aún no cuentan.
-- Desde ahora vale para toda visita con contacto, siempre que sea la última visita (no anulada) del comercio en el periodo.
-- No cambia la visita, el estado, el avance ni el bono (Regla n.º 1). Deja su línea en v2_bitacora_visita («seguimiento»).
-- La usa el celular: se aplica el mismo día en que se publica la app. Se aplica solo con el OK de Jose.

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
  -- Visita con contacto: el seguimiento va en la última visita del comercio en el periodo (la que muestra el estado actual).
  if v.con is distinct from 'Nadie' and v.id is distinct from (
       select x.id from v2_visitas x where x.customer_id = v.customer_id and x.periodo = v.periodo and x.anulada_en is null
       order by x.visitado_en desc limit 1) then
    raise exception 'El seguimiento de una visita con contacto se registra en la última visita del comercio en el periodo.';
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
