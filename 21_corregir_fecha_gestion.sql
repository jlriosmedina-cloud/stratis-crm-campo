-- ===========================================================================
--  Corregir la fecha de una gestión mal tipeada
--
--  La fecha del contacto es inmutable por diseño: es lo que sostiene el conteo
--  de intentos, la tasa de respuesta y el cierre del mes. Pero «inmutable» no
--  puede significar «un error de tipeo queda para siempre». Dos gestiones de
--  julio se registraron como agosto, y hasta ahora la única salida era borrar
--  el registro y volver a crearlo: se perdía la evidencia ya subida y la
--  bitácora mostraba una eliminación donde hubo una corrección.
--
--  La solución es la misma que se usó para el customer_id: la fecha sigue sin
--  poder cambiarse por la vía normal, y solo se mueve cuando esta función la
--  está corrigiendo. La marca de transacción lleva el id de la gestión y la
--  fecha de destino, así que autoriza exactamente ese cambio y ningún otro.
--
--  Queda en la bitácora como una edición con el antes y el después, que es lo
--  que realmente ocurrió.
-- ===========================================================================

-- 1 ---------------------------------------------------------- el permiso puntual
--  Este trigger corre DESPUÉS de tg_reglas_interaccion —el orden es alfabético
--  y 'tg_reglas' < 'tg_restaurar'—, así que deshace la restauración de la fecha
--  justo cuando la marca lo autoriza. Se hace acá y no dentro de las reglas para
--  no reescribir la función que sostiene el resto de la lógica.
create or replace function public.fn_restaurar_fecha_corregida()
returns trigger language plpgsql as $fn$
declare
  v_marca  text := coalesce(current_setting('app.corrigiendo_fecha', true), '');
  v_id     text;
  v_fecha  text;
begin
  if tg_op <> 'UPDATE' or v_marca = '' then return new; end if;

  v_id    := split_part(v_marca, '|', 1);
  v_fecha := split_part(v_marca, '|', 2);
  if v_id is distinct from new.id::text then return new; end if;

  new.fecha_contacto := v_fecha::date;
  -- La fecha de la visita se deriva de la del contacto: si no se recalcula acá,
  -- queda apuntando al día equivocado.
  new.fecha_visita_actualizada :=
    case when new.cumple_visita = 'SI' then new.fecha_contacto else null end;
  return new;
end $fn$;

drop trigger if exists tg_restaurar_fecha_corregida on public.interacciones;
create trigger tg_restaurar_fecha_corregida
  before update on public.interacciones
  for each row execute function public.fn_restaurar_fecha_corregida();

comment on function public.fn_restaurar_fecha_corregida is
  'Deja pasar el cambio de fecha_contacto solo cuando corregir_fecha_gestion() lo esta autorizando con la marca de transaccion.';

-- 2 --------------------------------------------------------------- la corrección
create or replace function public.corregir_fecha_gestion(
  p_id     uuid,
  p_fecha  date,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_old      public.interacciones%rowtype;
  v_hoy      date := (now() at time zone 'America/Lima')::date;
  v_comercio text;
  v_nueva    date;
begin
  if not public.es_admin() then
    raise exception 'Solo el Analista y el Manager pueden corregir la fecha de una gestión.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_old from public.interacciones where id = p_id;
  if not found then
    raise exception 'No se encontró esa gestión.' using errcode = 'no_data_found';
  end if;

  if p_fecha is null then
    raise exception 'Indica la fecha correcta de la gestión.' using errcode = 'check_violation';
  end if;
  if p_fecha = v_old.fecha_contacto then
    raise exception 'La gestión ya está fechada el %.', to_char(p_fecha, 'DD/MM/YYYY')
      using errcode = 'check_violation';
  end if;
  if p_fecha > v_hoy then
    raise exception 'La fecha corregida (%) es posterior a hoy (%). Una gestión no puede quedar en el futuro.',
      to_char(p_fecha, 'DD/MM/YYYY'), to_char(v_hoy, 'DD/MM/YYYY')
      using errcode = 'check_violation';
  end if;
  -- Un año hacia atrás es margen de sobra para una campaña que arrancó en julio;
  -- más allá de eso es casi seguro otro error de tipeo, en sentido contrario.
  if p_fecha < v_hoy - 365 then
    raise exception 'La fecha corregida (%) es de hace más de un año. Revísala.',
      to_char(p_fecha, 'DD/MM/YYYY') using errcode = 'check_violation';
  end if;

  perform set_config('app.corrigiendo_fecha',
                     p_id::text || '|' || to_char(p_fecha, 'YYYY-MM-DD'), true);
  update public.interacciones set fecha_contacto = p_fecha where id = p_id;
  perform set_config('app.corrigiendo_fecha', '', true);

  select fecha_contacto into v_nueva from public.interacciones where id = p_id;
  if v_nueva is distinct from p_fecha then
    raise exception 'La corrección no se aplicó: la fecha quedó en %.', to_char(v_nueva,'DD/MM/YYYY');
  end if;

  select nombre_comercio into v_comercio from public.clientes where customer_id = v_old.customer_id;

  insert into public.auditoria (tabla, accion, registro_id, customer_id, comercio,
                                correo, ejecutivo, detalle)
  values ('interacciones', 'editar', p_id::text, v_old.customer_id, v_comercio,
          public.correo_actual(), v_old.ejecutivo,
          jsonb_build_object(
            'fecha_contacto', jsonb_build_object(
              'antes',   to_char(v_old.fecha_contacto, 'DD/MM/YYYY'),
              'despues', to_char(p_fecha, 'DD/MM/YYYY')),
            '_nota', coalesce(nullif(trim(p_motivo), ''),
                              'Corrección de la fecha de la gestión')));

  return jsonb_build_object('ok', true,
                            'customer_id', v_old.customer_id,
                            'antes',   to_char(v_old.fecha_contacto, 'DD/MM/YYYY'),
                            'despues', to_char(p_fecha, 'DD/MM/YYYY'));
end $fn$;

revoke all on function public.corregir_fecha_gestion(uuid, date, text) from public, anon;
grant execute on function public.corregir_fecha_gestion(uuid, date, text) to authenticated;

comment on function public.corregir_fecha_gestion is
  'Corrige la fecha de una gestion mal tipeada. Solo Analista y Manager, nunca hacia el futuro, y queda en la bitacora con el antes y el despues.';
