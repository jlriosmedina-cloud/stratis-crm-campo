-- ===========================================================================
--  Ventana de edición — solo por hoy, y se cierra sola
--
--  Jose dio un ultimátum al equipo para que dejen sus registros en orden. Para
--  que puedan hacerlo hace falta abrir por un día lo que normalmente está
--  cerrado. La ventana vence el 11/08/2026 a las 23:59 de Lima y **no hay que
--  acordarse de apagarla**: pasada esa hora, todo vuelve solo a las reglas de
--  siempre. Si mañana hiciera falta más tiempo, se mueve la fecha en config.
--
--  Lo que se abre mientras dure:
--
--    · El ejecutivo corrige el medio y el resultado de cualquier gestión suya,
--      sin el plazo de la medianoche del día siguiente.
--    · El ejecutivo corrige el Customer ID de los comercios que él registró.
--    · El ejecutivo puede ANULAR una ubicación equivocada.
--
--  Lo que NO se abre, ni hoy ni con la ventana puesta: escribir coordenadas
--  nuevas. Nadie puede hacerlo, y no es terquedad. Una ubicación se mide en el
--  momento y en el sitio; alguien que hoy, desde su casa, "corrige" la
--  ubicación de una visita de la semana pasada estaría grabando dónde está
--  ahora, no dónde estuvo. Eso no arregla el error: lo vuelve creíble.
--
--  Por eso la salida para una ubicación equivocada es anularla —la gestión
--  queda como «sin ubicación verificada», que es la verdad— o eliminar el
--  registro y volver a crearlo desde el local. Ambas quedan en la bitácora.
-- ===========================================================================

insert into public.config (clave, valor)
values ('edicion_libre_hasta', '2026-08-11T23:59:59-05:00')
on conflict (clave) do update set valor = excluded.valor;

create or replace function public.edicion_libre()
returns boolean language sql stable
set search_path = public as $fn$
  select coalesce(
    (select now() < (valor)::timestamptz from public.config where clave = 'edicion_libre_hasta'),
    false);
$fn$;

grant execute on function public.edicion_libre() to authenticated;

comment on function public.edicion_libre is
  'Ventana temporal de correccion. Vence sola en la fecha guardada en config.edicion_libre_hasta.';

-- ---------------------------------------------------------------------------
-- 1 · El plazo del ejecutivo cede mientras la ventana esté abierta
-- ---------------------------------------------------------------------------
create or replace function public.gestion_editable(p_creado_en timestamptz)
returns boolean language sql stable
set search_path = public as $fn$
  select public.edicion_libre()
      or ((now() at time zone 'America/Lima')::date
          - (p_creado_en at time zone 'America/Lima')::date) <= 1;
$fn$;

-- ---------------------------------------------------------------------------
-- 2 · Anular una ubicación equivocada
--
--  No la reescribe: la borra y deja el registro marcado como sin respaldo de
--  GPS. Es la única corrección honesta que se puede hacer a posteriori.
-- ---------------------------------------------------------------------------
create or replace function public.fn_anular_ubicacion()
returns trigger language plpgsql as $fn$
begin
  if tg_op <> 'UPDATE' then return new; end if;
  if coalesce(current_setting('app.anulando_ubicacion', true), '') is distinct from new.id::text then
    return new;
  end if;
  new.ubicacion            := '';
  new.ubicacion_verificada := false;
  return new;
end $fn$;

drop trigger if exists tg_zz_anular_ubicacion on public.interacciones;
create trigger tg_zz_anular_ubicacion          -- 'zz' para que corra al final
  before update on public.interacciones
  for each row execute function public.fn_anular_ubicacion();

create or replace function public.anular_ubicacion(p_id uuid, p_motivo text default null)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  v_old   public.interacciones%rowtype;
  v_admin boolean := public.es_admin();
  v_mio   boolean;
begin
  select * into v_old from public.interacciones where id = p_id;
  if not found then
    raise exception 'No se encontró esa gestión.' using errcode = 'no_data_found';
  end if;

  v_mio := v_old.correo_stratis = public.correo_actual();
  if not (v_admin or v_mio) then
    raise exception 'Solo puedes anular la ubicación de tus propias gestiones.'
      using errcode = 'insufficient_privilege';
  end if;
  if not v_admin and not public.edicion_libre() then
    raise exception 'La ventana de corrección está cerrada. Pídeselo a tu supervisor.'
      using errcode = 'check_violation';
  end if;
  if coalesce(v_old.ubicacion, '') = '' and v_old.ubicacion_verificada is not true then
    raise exception 'Esta gestión ya no tiene ubicación registrada.' using errcode = 'check_violation';
  end if;

  perform set_config('app.anulando_ubicacion', p_id::text, true);
  update public.interacciones set ubicacion = '' where id = p_id;
  perform set_config('app.anulando_ubicacion', '', true);

  insert into public.auditoria (tabla, accion, registro_id, customer_id, comercio,
                                correo, ejecutivo, detalle)
  select 'interacciones', 'editar', p_id::text, v_old.customer_id, c.nombre_comercio,
         public.correo_actual(), v_old.ejecutivo,
         jsonb_build_object(
           'ubicacion', jsonb_build_object('antes', coalesce(nullif(v_old.ubicacion,''),'(sin dato)'),
                                           'despues', '(anulada)'),
           '_nota', coalesce(nullif(trim(p_motivo), ''),
                             'Ubicación anulada: quedó como gestión sin respaldo de GPS'))
    from (select 1) t left join public.clientes c on c.customer_id = v_old.customer_id;

  return jsonb_build_object('ok', true, 'customer_id', v_old.customer_id);
end $fn$;

revoke all on function public.anular_ubicacion(uuid, text) from public, anon;
grant execute on function public.anular_ubicacion(uuid, text) to authenticated;

comment on function public.anular_ubicacion is
  'Borra una ubicacion equivocada y deja la gestion como sin respaldo de GPS. Nunca escribe coordenadas nuevas.';

-- ---------------------------------------------------------------------------
-- 3 · El Customer ID, corregible por quien registró el comercio
-- ---------------------------------------------------------------------------
create or replace function public.corregir_customer_id(p_actual text, p_nuevo text)
returns text
language plpgsql security definer set search_path = public as $fn$
declare
  v_actual  text := trim(coalesce(p_actual, ''));
  v_nuevo   text := trim(coalesce(p_nuevo, ''));
  v_nombre  text;
  v_tipo    text;
  v_duenio  text;
  v_correo  text := public.correo_actual();
  v_n       int;
  v_quedan  int;
begin
  select nombre_comercio, tipo_registro, asignado_correo
    into v_nombre, v_tipo, v_duenio
    from public.clientes where customer_id = v_actual for update;
  if v_nombre is null then
    raise exception 'No existe ningun comercio con el Customer ID %.', v_actual
      using errcode = 'check_violation';
  end if;

  -- Supervisión siempre; el ejecutivo solo sobre lo suyo y con la ventana abierta.
  if not public.es_admin() then
    if v_duenio is distinct from v_correo then
      raise exception 'Solo puedes corregir el Customer ID de los comercios que tú registraste.'
        using errcode = 'insufficient_privilege';
    end if;
    if not public.edicion_libre() then
      raise exception 'La ventana de corrección está cerrada. Pídele el cambio a tu supervisor.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  if v_actual = '' or v_nuevo = '' then
    raise exception 'Indica el Customer ID actual y el correcto.' using errcode = 'check_violation';
  end if;
  if v_actual = v_nuevo then
    raise exception 'El Customer ID nuevo es igual al actual.' using errcode = 'check_violation';
  end if;
  if length(v_nuevo) < 3 or length(v_nuevo) > 30 then
    raise exception 'El Customer ID debe tener entre 3 y 30 caracteres.' using errcode = 'check_violation';
  end if;
  if v_nuevo !~ '^[A-Za-z0-9._-]+$' then
    raise exception 'El Customer ID solo admite letras, numeros, punto, guion y guion bajo.'
      using errcode = 'check_violation';
  end if;
  if v_tipo <> 'CARTERA' then
    raise exception 'Una venta nueva se identifica por RUC, no por Customer ID.'
      using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.clientes where customer_id = v_nuevo) then
    raise exception 'El Customer ID % ya esta en uso por otro comercio.', v_nuevo
      using errcode = 'unique_violation';
  end if;

  select count(*) into v_n from public.interacciones where customer_id = v_actual;

  perform set_config('app.corrigiendo_customer_id', v_nuevo, true);
  update public.clientes set customer_id = v_nuevo where customer_id = v_actual;

  select count(*) into v_quedan from public.interacciones where customer_id = v_actual;
  if v_quedan > 0 then
    update public.interacciones set customer_id = v_nuevo where customer_id = v_actual;
  end if;
  perform set_config('app.corrigiendo_customer_id', '', true);

  select count(*) into v_quedan from public.interacciones where customer_id = v_actual;
  if v_quedan > 0 then
    raise exception 'La correccion se cancelo: % de % gestiones no siguieron al comercio.',
      v_quedan, v_n using errcode = 'check_violation';
  end if;

  update public.auditoria set customer_id = v_nuevo where customer_id = v_actual;

  insert into public.auditoria(tabla, accion, registro_id, customer_id, comercio,
                               correo, ejecutivo, detalle)
  values ('clientes', 'editar', v_nuevo, v_nuevo, v_nombre, v_correo,
          (select coalesce(nombre_corto, nombre) from public.usuarios where correo = v_correo),
          jsonb_build_object('customer_id',
            jsonb_build_object('antes', v_actual, 'despues', v_nuevo),
            '_arrastro', v_n));

  return format('%s: %s -> %s, con %s gestion(es)', v_nombre, v_actual, v_nuevo, v_n);
end $fn$;

revoke all on function public.corregir_customer_id(text, text) from public, anon;
grant execute on function public.corregir_customer_id(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4 · Durante la ventana, el ejecutivo también puede corregir un medio que
--     eligió mal aunque el destino sea presencial.
--
--     Ojo con lo que esto NO hace: la gestión no gana un GPS que nunca tuvo.
--     Sigue marcada como «sin ubicación verificada» y sale en las alertas. Si
--     de verdad fue una visita, el camino sigue siendo eliminar el registro y
--     crearlo de nuevo desde el local.
-- ---------------------------------------------------------------------------
create or replace function public.corregir_gestion(
  p_id        uuid,
  p_tipo      text,
  p_resultado text,
  p_hora      time default null      -- solo Analista y Manager
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_old   public.interacciones%rowtype;
  v_admin boolean := public.es_admin();
  v_mio   boolean;
  v_new   public.interacciones%rowtype;
begin
  select * into v_old from public.interacciones where id = p_id;
  if not found then
    raise exception 'No se encontró esa gestión.' using errcode = 'no_data_found';
  end if;

  v_mio := v_old.correo_stratis = public.correo_actual();
  if not (v_admin or v_mio) then
    raise exception 'Solo puedes corregir tus propias gestiones.'
      using errcode = 'insufficient_privilege';
  end if;

  -- La ventana no aplica a quien audita: si el Analista tiene que arreglar algo
  -- de la semana pasada, tiene que poder.
  if not v_admin and not public.gestion_editable(v_old.creado_en) then
    raise exception 'Esta gestión ya no se puede corregir: se registró el % y el plazo vence a la medianoche del día siguiente. Pídele la corrección a tu supervisor.',
      to_char(v_old.creado_en at time zone 'America/Lima', 'DD/MM/YYYY')
      using errcode = 'check_violation';
  end if;

  if p_tipo is null or p_resultado is null then
    raise exception 'Indica el medio y el resultado.' using errcode = 'check_violation';
  end if;
  if p_tipo not in ('visita_presencial','reunion_presencial','reunion_virtual',
                    'videollamada','llamada','whatsapp','correo') then
    raise exception 'Medio de contacto desconocido: %', p_tipo using errcode = 'check_violation';
  end if;
  if p_resultado not in ('efectivo','no_contesta','local_cerrado','titular_ausente',
                         'datos_errados','rechazo') then
    raise exception 'Resultado desconocido: %', p_resultado using errcode = 'check_violation';
  end if;
  if p_hora is not null and not v_admin then
    raise exception 'Solo el Analista y el Manager pueden corregir la hora.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Convertir una gestión remota en presencial después del hecho sería fabricar
  -- una visita: la ubicación se captura en el momento y no se modifica jamás.
  if not v_admin and not public.edicion_libre()
     and p_tipo in ('visita_presencial','reunion_presencial')
     and p_tipo is distinct from v_old.tipo_contacto
     and v_old.ubicacion_verificada is not true then
    raise exception 'No puedes cambiar el medio a presencial: una visita se respalda con la ubicación capturada en el momento, y esa no se modifica. Elimina el registro y créalo de nuevo desde el local.'
      using errcode = 'check_violation';
  end if;

  if p_tipo = v_old.tipo_contacto and p_resultado = v_old.resultado
     and (p_hora is null or p_hora = v_old.hora_contacto) then
    raise exception 'No hay nada que corregir: el medio, el resultado y la hora son los mismos.'
      using errcode = 'check_violation';
  end if;

  -- La misma regla de siempre, aplicada al valor corregido: decir que el
  -- cliente respondió por correo o WhatsApp exige transcribir qué respondió.
  -- Se comprueba acá porque el trigger que la vigila corre antes que la
  -- corrección y vería todavía los valores viejos.
  if p_resultado = 'efectivo' and p_tipo in ('correo','whatsapp')
     and coalesce(trim(v_old.comentario_cliente), '') = '' then
    raise exception 'Si el cliente respondió por %, primero escribe en «Lo que dijo el cliente» qué respondió.',
      case p_tipo when 'correo' then 'correo' else 'WhatsApp' end
      using errcode = 'check_violation';
  end if;

  perform set_config('app.corrigiendo_gestion',
                     p_id::text || '|' || p_tipo || '|' || p_resultado || '|' ||
                     coalesce(to_char(p_hora, 'HH24:MI:SS'), ''), true);
  update public.interacciones
     set tipo_contacto = p_tipo, resultado = p_resultado
   where id = p_id;
  perform set_config('app.corrigiendo_gestion', '', true);

  select * into v_new from public.interacciones where id = p_id;
  if v_new.tipo_contacto is distinct from p_tipo
     or v_new.resultado is distinct from p_resultado then
    raise exception 'La corrección no se aplicó.';
  end if;

  insert into public.auditoria (tabla, accion, registro_id, customer_id, comercio,
                                correo, ejecutivo, detalle)
  select 'interacciones', 'editar', p_id::text, v_old.customer_id, c.nombre_comercio,
         public.correo_actual(), v_old.ejecutivo,
         (case when p_tipo is distinct from v_old.tipo_contacto
               then jsonb_build_object('tipo_contacto',
                      jsonb_build_object('antes', v_old.tipo_contacto, 'despues', p_tipo))
               else '{}'::jsonb end)
         ||
         (case when p_resultado is distinct from v_old.resultado
               then jsonb_build_object('resultado',
                      jsonb_build_object('antes', v_old.resultado, 'despues', p_resultado))
               else '{}'::jsonb end)
         ||
         (case when p_hora is not null and p_hora is distinct from v_old.hora_contacto
               then jsonb_build_object('hora_contacto',
                      jsonb_build_object('antes', to_char(v_old.hora_contacto,'HH24:MI'),
                                         'despues', to_char(p_hora,'HH24:MI')))
               else '{}'::jsonb end)
         || jsonb_build_object('_nota',
              case when v_admin and not v_mio
                   then 'Corrección hecha por supervisión'
                   else 'El ejecutivo corrigió su registro' end)
    from (select 1) t left join public.clientes c on c.customer_id = v_old.customer_id;

  return jsonb_build_object('ok', true,
    'medio_antes', v_old.tipo_contacto, 'medio_despues', p_tipo,
    'resultado_antes', v_old.resultado, 'resultado_despues', p_resultado,
    'cumple_visita', v_new.cumple_visita);
end $fn$;
