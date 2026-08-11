-- ===========================================================================
--  El ejecutivo corrige el medio y el resultado de su gestión
--
--  Hasta ahora, equivocarse al elegir «llamada» en vez de WhatsApp obligaba a
--  eliminar el registro y volver a crearlo: se perdía la evidencia ya subida y
--  en la bitácora quedaba una eliminación donde solo hubo un dedazo.
--
--  Se abre una ventana corta y con reglas:
--
--    · El ejecutivo, solo el medio y el resultado. La fecha, la hora, la
--      ubicación y la evidencia siguen intactas: son la constancia de lo que
--      pasó. Tampoco puede convertir una gestión remota en presencial: eso
--      sería fabricar una visita sin el GPS que la respalda.
--    · El Analista y el Manager corrigen además la hora, y la fecha con
--      corregir_fecha_gestion(). Así no dependen de nadie para arreglar un
--      dedazo. Las coordenadas no las toca nadie: son una medición del equipo,
--      no un dato declarado.
--    · Solo sobre gestiones propias. El Analista y el Manager pueden sobre
--      cualquiera, sin ventana, porque son quienes auditan.
--    · Hasta la medianoche del día siguiente al que se registró. Un dedazo se
--      nota enseguida; un mes cerrado no se retoca.
--    · Siempre queda en la bitácora, con el antes y el después.
--
--  Cambiar el medio a uno presencial no inventa un GPS: la gestión queda
--  marcada como «sin ubicación verificada», que es exactamente lo que fue.
-- ===========================================================================

-- 1 ----------------------------------------------------- el permiso puntual
--  Corre después de tg_reglas_interaccion —el orden es alfabético— y vuelve a
--  poner los valores corregidos que aquella acaba de revertir, recalculando
--  todo lo que se deriva de ellos.
create or replace function public.fn_restaurar_gestion_corregida()
returns trigger language plpgsql as $fn$
declare
  v_marca text := coalesce(current_setting('app.corrigiendo_gestion', true), '');
  v_pres  boolean;
  v_virt  boolean;
begin
  if tg_op <> 'UPDATE' or v_marca = '' then return new; end if;
  if split_part(v_marca, '|', 1) is distinct from new.id::text then return new; end if;

  new.tipo_contacto := split_part(v_marca, '|', 2);
  new.resultado     := split_part(v_marca, '|', 3);
  -- La hora solo la mueve supervisión, y solo si vino en la marca.
  if nullif(split_part(v_marca, '|', 4), '') is not null then
    new.hora_contacto := split_part(v_marca, '|', 4)::time;
  end if;

  -- Lo derivado se recalcula acá porque las reglas ya corrieron con los valores viejos.
  v_pres := new.tipo_contacto in ('visita_presencial','reunion_presencial');
  v_virt := new.tipo_contacto in ('reunion_virtual','videollamada');
  new.visita_presencial := case when v_pres then 'SI' else 'No' end;
  new.visita_virtual    := case when v_virt then 'SI' else 'No' end;
  new.cumple_visita     := case when (v_pres or v_virt) and new.resultado = 'efectivo'
                                then 'SI' else 'No' end;
  new.fecha_visita_actualizada :=
    case when new.cumple_visita = 'SI' then new.fecha_contacto else null end;
  return new;
end $fn$;

drop trigger if exists tg_restaurar_gestion_corregida on public.interacciones;
create trigger tg_restaurar_gestion_corregida
  before update on public.interacciones
  for each row execute function public.fn_restaurar_gestion_corregida();

comment on function public.fn_restaurar_gestion_corregida is
  'Aplica el medio y el resultado corregidos por corregir_gestion() y recalcula lo que se deriva de ellos.';

-- 2 ------------------------------------------------------------ la ventana
--  Hasta la medianoche del día siguiente al registro. No son 48 horas
--  corridas: es «hoy y mañana», que es como lo piensa quien está en la calle.
create or replace function public.gestion_editable(p_creado_en timestamptz)
returns boolean language sql stable as $fn$
  select ((now() at time zone 'America/Lima')::date
          - (p_creado_en at time zone 'America/Lima')::date) <= 1;
$fn$;

comment on function public.gestion_editable is
  'True mientras no haya pasado la medianoche del dia siguiente al registro, en hora de Lima.';

-- 3 ---------------------------------------------------------- la corrección
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
  if not v_admin
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

drop function if exists public.corregir_gestion(uuid, text, text);
revoke all on function public.corregir_gestion(uuid, text, text, time) from public, anon;
grant execute on function public.corregir_gestion(uuid, text, text, time) to authenticated;
grant execute on function public.gestion_editable(timestamptz) to authenticated;

comment on function public.corregir_gestion is
  'Corrige el medio y el resultado de una gestion. El ejecutivo, solo las suyas y hasta la medianoche del dia siguiente al registro; Analista y Manager, cualquiera. Siempre queda en la bitacora.';
