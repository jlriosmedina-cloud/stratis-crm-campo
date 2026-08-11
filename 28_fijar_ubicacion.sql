-- ===========================================================================
--  Escribir la ubicación a mano — solo dentro de la ventana de hoy
--
--  Jose lo pidió expresamente después de leer la objeción, así que va. Queda
--  escrito acá lo que implica, porque dentro de tres meses nadie se va a
--  acordar de esta conversación:
--
--  Una coordenada escrita después NO es lo mismo que una capturada por el
--  equipo en el momento. Por eso la corrección a mano guarda la coordenada
--  —que es lo que hace falta para ubicar el local en el mapa— pero
--  **ubicacion_verificada se queda en false**. Esa columna significa una sola
--  cosa: que el GPS lo midió ahí y entonces. Si una coordenada tecleada la
--  pusiera en true, la columna dejaria de significar nada y el respaldo que
--  Stratis le ofrece a BBVA se quedaria sin piso.
--
--  Resultado practico: el mapa queda bien, el conteo de visitas con respaldo
--  de GPS sigue diciendo la verdad, y la bitacora guarda quien la escribio,
--  cuando y que habia antes.
--
--  Todo esto vence con la ventana, hoy a las 23:59 de Lima.
-- ===========================================================================

-- El trigger que ya dejaba anular ahora tambien deja fijar un valor. La marca
-- lleva el id y, despues del '|', la coordenada; vacia significa anular.
create or replace function public.fn_anular_ubicacion()
returns trigger language plpgsql as $fn$
declare
  v_marca text := coalesce(current_setting('app.anulando_ubicacion', true), '');
begin
  if tg_op <> 'UPDATE' or v_marca = '' then return new; end if;
  if split_part(v_marca, '|', 1) is distinct from new.id::text then return new; end if;

  new.ubicacion            := split_part(v_marca, '|', 2);
  -- Nunca se marca como verificada: no la midio el equipo en el momento.
  new.ubicacion_verificada := false;
  return new;
end $fn$;

create or replace function public.fijar_ubicacion(
  p_id        uuid,
  p_ubicacion text,
  p_motivo    text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  v_old   public.interacciones%rowtype;
  v_admin boolean := public.es_admin();
  v_txt   text := trim(coalesce(p_ubicacion, ''));
  v_lat   numeric;
  v_lng   numeric;
begin
  select * into v_old from public.interacciones where id = p_id;
  if not found then
    raise exception 'No se encontró esa gestión.' using errcode = 'no_data_found';
  end if;

  if not (v_admin or v_old.correo_stratis = public.correo_actual()) then
    raise exception 'Solo puedes corregir la ubicación de tus propias gestiones.'
      using errcode = 'insufficient_privilege';
  end if;
  if not public.edicion_libre() then
    raise exception 'La ventana de corrección está cerrada: la ubicación ya no se puede escribir.'
      using errcode = 'check_violation';
  end if;

  -- Formato «lat, lng». Se valida de verdad: una coordenada mal tecleada que
  -- entre igual es peor que no tener ninguna.
  if v_txt !~ '^-?\d{1,3}(\.\d+)?\s*,\s*-?\d{1,3}(\.\d+)?$' then
    raise exception 'Escribe la ubicación como latitud, longitud. Ejemplo: -12.0464, -77.0428'
      using errcode = 'check_violation';
  end if;
  v_lat := split_part(replace(v_txt, ' ', ''), ',', 1)::numeric;
  v_lng := split_part(replace(v_txt, ' ', ''), ',', 2)::numeric;
  if v_lat < -90 or v_lat > 90 or v_lng < -180 or v_lng > 180 then
    raise exception 'Esas coordenadas no existen: la latitud va de -90 a 90 y la longitud de -180 a 180.'
      using errcode = 'check_violation';
  end if;
  -- La campaña es en Perú. Fuera de ese recuadro es casi seguro un dedazo,
  -- o coordenadas copiadas de otro lado.
  if v_lat < -19 or v_lat > 0.5 or v_lng < -82 or v_lng > -68 then
    raise exception 'Esas coordenadas caen fuera del Perú (%). Revísalas antes de guardarlas.', v_txt
      using errcode = 'check_violation';
  end if;

  v_txt := v_lat::text || ', ' || v_lng::text;

  perform set_config('app.anulando_ubicacion', p_id::text || '|' || v_txt, true);
  update public.interacciones set ubicacion = v_txt where id = p_id;
  perform set_config('app.anulando_ubicacion', '', true);

  insert into public.auditoria (tabla, accion, registro_id, customer_id, comercio,
                                correo, ejecutivo, detalle)
  select 'interacciones', 'editar', p_id::text, v_old.customer_id, c.nombre_comercio,
         public.correo_actual(), v_old.ejecutivo,
         jsonb_build_object(
           'ubicacion', jsonb_build_object(
             'antes',   coalesce(nullif(v_old.ubicacion, ''), '(sin dato)'),
             'despues', v_txt),
           '_nota', coalesce(nullif(trim(p_motivo), ''),
                             'Ubicación escrita a mano en la ventana de corrección; no cuenta como verificada por GPS'))
    from (select 1) t left join public.clientes c on c.customer_id = v_old.customer_id;

  return jsonb_build_object('ok', true, 'ubicacion', v_txt, 'verificada', false);
end $fn$;

revoke all on function public.fijar_ubicacion(uuid, text, text) from public, anon;
grant execute on function public.fijar_ubicacion(uuid, text, text) to authenticated;

comment on function public.fijar_ubicacion is
  'Escribe la ubicacion de una gestion durante la ventana de correccion. Nunca la marca como verificada: eso solo lo hace el GPS en el momento.';
