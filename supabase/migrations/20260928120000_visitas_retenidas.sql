-- Visitas retenidas en el celular (hallazgo 1 de la revisión de la cola, decidido por Jose el 27/09/2026).
-- Cuando el servidor rechaza una visita de la cola, el celular la guarda como «pendiente de revisar» y avisa aquí.
-- Jose la ve en su escritorio y decide: si la descarta, el celular del ejecutivo la quita solo al sincronizar.
-- El ejecutivo no puede descartarla por su cuenta. Si el ejecutivo la corrige y el servidor la acepta, se resuelve
-- sola («registrada»). No cambia v2_visitas ni el medidor de visitas. Se aplica solo con el OK de Jose.

create table if not exists public.v2_visitas_retenidas (
  cliente_uid   text primary key,
  correo        text not null references public.usuarios(correo),
  customer_id   text,
  payload       jsonb not null,
  mensaje       text not null,
  intentos      integer not null default 1,
  reportada_en  timestamptz not null default now(),
  actualizada_en timestamptz not null default now(),
  estado        text not null default 'pendiente' check (estado in ('pendiente', 'descartada', 'registrada')),
  resuelta_en   timestamptz,
  resuelta_por  text,
  nota          text
);
alter table public.v2_visitas_retenidas enable row level security;
-- Solo lectura directa (el ejecutivo las suyas; el escritorio, todas). Todo cambio pasa por las funciones.
create policy v2_ret_sel on public.v2_visitas_retenidas as permissive for select to authenticated
  using (correo = (select public.correo_actual()) or (select public.v2_puede_escritorio()));

-- El celular avisa (o vuelve a avisar) que una visita quedó retenida.
CREATE OR REPLACE FUNCTION public.v2_reportar_retenida(p_cliente_uid text, p_payload jsonb, p_mensaje text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_correo text := public.correo_actual(); v_dueno text; v_estado text;
begin
  if not public.es_usuario_activo() then raise exception 'Tu usuario no está activo.'; end if;
  if nullif(btrim(coalesce(p_cliente_uid, '')), '') is null or p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Falta el identificador o los datos de la visita.';
  end if;
  if pg_column_size(p_payload) > 65536 then raise exception 'Los datos de la visita son demasiado grandes para el aviso.'; end if;
  select correo, estado into v_dueno, v_estado from v2_visitas_retenidas where cliente_uid = p_cliente_uid for update;
  if v_dueno is not null and v_dueno <> v_correo then raise exception 'Esa visita es de otro ejecutivo.'; end if;
  -- Si ya entró al servidor, no hay nada que retener.
  if exists (select 1 from v2_visitas where cliente_uid = p_cliente_uid) then
    update v2_visitas_retenidas set estado = 'registrada', resuelta_en = coalesce(resuelta_en, now()), resuelta_por = coalesce(resuelta_por, 'automática')
     where cliente_uid = p_cliente_uid and estado = 'pendiente';
    return 'registrada';
  end if;
  if v_dueno is null then
    insert into v2_visitas_retenidas(cliente_uid, correo, customer_id, payload, mensaje)
    values (p_cliente_uid, v_correo, p_payload->>'p_customer_id', p_payload, left(coalesce(p_mensaje, 'sin mensaje'), 1000));
    return 'pendiente';
  end if;
  -- Ya estaba: se actualiza con lo último que corrigió el ejecutivo (una descartada no se reabre).
  update v2_visitas_retenidas
     set payload = p_payload, customer_id = p_payload->>'p_customer_id', mensaje = left(coalesce(p_mensaje, 'sin mensaje'), 1000),
         intentos = intentos + 1, actualizada_en = now()
   where cliente_uid = p_cliente_uid and estado = 'pendiente';
  return v_estado;
end $function$
;

-- El celular pregunta qué pasó con sus visitas retenidas.
CREATE OR REPLACE FUNCTION public.v2_mis_retenidas()
 RETURNS TABLE(cliente_uid text, estado text, resuelta_en timestamp with time zone, nota text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select r.cliente_uid,
         -- si la visita ya entró al servidor, manda «registrada» (aunque se haya descartado mientras tanto)
         case when exists (select 1 from v2_visitas v where v.cliente_uid = r.cliente_uid) then 'registrada' else r.estado end,
         r.resuelta_en, r.nota
  from v2_visitas_retenidas r
  where public.es_usuario_activo() and r.correo = public.correo_actual()
$function$
;

-- El escritorio: las retenidas que esperan la decisión de Jose.
CREATE OR REPLACE FUNCTION public.v2_retenidas()
 RETURNS TABLE(cliente_uid text, correo text, ejecutivo text, customer_id text, comercio text, visitado_en timestamp with time zone,
               mensaje text, intentos integer, reportada_en timestamp with time zone, actualizada_en timestamp with time zone, payload jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select r.cliente_uid, r.correo, coalesce(u.nombre_corto, u.nombre, r.correo), r.customer_id,
         coalesce(nullif(btrim(c.nombre_comercial), ''), c.razon_social),
         case when (r.payload->>'p_visitado_en') ~ '^\d{4}-\d{2}-\d{2}' then (r.payload->>'p_visitado_en')::timestamptz end,
         r.mensaje, r.intentos, r.reportada_en, r.actualizada_en, r.payload
  from v2_visitas_retenidas r
  left join usuarios u on u.correo = r.correo
  left join v2_comercios c on c.customer_id = r.customer_id
  where public.v2_puede_escritorio() and r.estado = 'pendiente'
    and not exists (select 1 from v2_visitas v where v.cliente_uid = r.cliente_uid)
  order by r.reportada_en
$function$
;

-- Jose descarta una retenida: el celular la quita al sincronizar. Queda quién, cuándo y por qué.
CREATE OR REPLACE FUNCTION public.v2_descartar_retenida(p_cliente_uid text, p_nota text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_estado text;
begin
  if not public.v2_puede_escritorio() then raise exception 'Solo el analista descarta visitas retenidas.'; end if;
  select estado into v_estado from v2_visitas_retenidas where cliente_uid = p_cliente_uid for update;
  if v_estado is null then raise exception 'Esa visita retenida no existe.'; end if;
  if v_estado <> 'pendiente' then raise exception 'Esa visita retenida ya fue resuelta (%).', v_estado; end if;
  if exists (select 1 from v2_visitas where cliente_uid = p_cliente_uid) then
    raise exception 'Esa visita ya entró al servidor; no hay nada que descartar.';
  end if;
  update v2_visitas_retenidas
     set estado = 'descartada', resuelta_en = now(), resuelta_por = public.correo_actual(), nota = nullif(btrim(coalesce(p_nota, '')), '')
   where cliente_uid = p_cliente_uid;
end $function$
;

-- Cerradas desde que nacen (privilegios por defecto del 28/09), pero se dejan explícitas.
revoke execute on function public.v2_reportar_retenida(text, jsonb, text) from public, anon;
revoke execute on function public.v2_mis_retenidas() from public, anon;
revoke execute on function public.v2_retenidas() from public, anon;
revoke execute on function public.v2_descartar_retenida(text, text) from public, anon;
grant execute on function public.v2_reportar_retenida(text, jsonb, text) to authenticated, service_role;
grant execute on function public.v2_mis_retenidas() to authenticated, service_role;
grant execute on function public.v2_retenidas() to authenticated, service_role;
grant execute on function public.v2_descartar_retenida(text, text) to authenticated, service_role;
