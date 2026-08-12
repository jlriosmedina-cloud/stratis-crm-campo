-- ===========================================================================
--  Eximir la ubicacion de una gestion puntual
--
--  Una visita presencial se registra con la coordenada que toma el GPS del
--  equipo. Cuando esa coordenada no quedo —no hubo señal, no dieron permiso,
--  o la visita ocurrio antes de que el CRM la pidiera— no hay forma honesta
--  de recuperarla: la visita ya paso. Inventar una coordenada seria peor que
--  no tenerla, porque convertiria una constancia auditable en un dato falso.
--
--  Lo que si se puede hacer es decir la verdad de otra manera: marcar esa
--  gestion como "sin ubicacion exigible", con un motivo escrito y firmado por
--  quien lo decidio. Deja de figurar como un hueco —porque no lo es, es una
--  excepcion aceptada— pero sigue distinguiendose de una visita que si trajo
--  su GPS. En el Excel sale como "No aplica", nunca como "SI".
--
--  La exencion es del Analista y del Manager. Un ejecutivo no puede eximirse
--  a si mismo de la prueba de su propia visita: eso vaciaria la regla.
-- ===========================================================================

alter table public.interacciones
  add column if not exists ubicacion_exenta boolean not null default false,
  add column if not exists ubicacion_exenta_motivo text;

comment on column public.interacciones.ubicacion_exenta is
  'La gestion no exige coordenada. Solo lo marca la supervision, con motivo, y queda en la bitacora.';

-- Nadie la marca escribiendo directo en la tabla: se pasa por la funcion, que
-- es la que exige el motivo y deja el rastro.
create or replace function public.fn_ubicacion_exenta_solo_rpc()
returns trigger language plpgsql as $fn$
begin
  if tg_op = 'UPDATE'
     and new.ubicacion_exenta is distinct from old.ubicacion_exenta
     and coalesce(current_setting('app.eximiendo_ubicacion', true), '') <> new.id::text then
    new.ubicacion_exenta        := old.ubicacion_exenta;
    new.ubicacion_exenta_motivo := old.ubicacion_exenta_motivo;
  end if;
  return new;
end $fn$;

drop trigger if exists tg_zz_ubicacion_exenta on public.interacciones;
create trigger tg_zz_ubicacion_exenta
  before update on public.interacciones
  for each row execute function public.fn_ubicacion_exenta_solo_rpc();

create or replace function public.eximir_ubicacion(p_id uuid, p_motivo text)
returns text language plpgsql security definer set search_path = public as $fn$
declare v_r record; v_motivo text;
begin
  if not public.es_admin() then
    raise exception 'Solo el Analista o el Manager pueden eximir la ubicacion de una gestion.'
      using errcode = 'insufficient_privilege';
  end if;

  v_motivo := nullif(btrim(coalesce(p_motivo, '')), '');
  if v_motivo is null then
    raise exception 'Escribe por que esta gestion no puede tener coordenada. Sin motivo no se exime.'
      using errcode = 'check_violation';
  end if;

  select i.*, c.nombre_comercio into v_r
    from interacciones i join clientes c on c.customer_id = i.customer_id
   where i.id = p_id;
  if not found then
    raise exception 'No existe esa gestion.' using errcode = 'no_data_found';
  end if;

  if coalesce(v_r.ubicacion, '') <> '' or v_r.ubicacion_verificada then
    raise exception 'Esa gestion ya tiene ubicacion registrada: no hay nada que eximir.'
      using errcode = 'check_violation';
  end if;

  perform set_config('app.eximiendo_ubicacion', p_id::text, true);
  update interacciones
     set ubicacion_exenta = true, ubicacion_exenta_motivo = v_motivo
   where id = p_id;

  insert into auditoria (tabla, accion, registro_id, customer_id, comercio,
                         correo, ejecutivo, detalle)
  values ('interacciones', 'editar', p_id::text, v_r.customer_id, v_r.nombre_comercio,
          public.correo_actual(),
          coalesce((select coalesce(nombre_corto, nombre) from usuarios
                     where correo = public.correo_actual()), 'sistema'),
          jsonb_build_object(
            '_nota', 'Gestion del ' || to_char(v_r.fecha_contacto, 'DD/MM/YYYY') ||
                     ' exenta de ubicacion. Motivo: ' || v_motivo,
            'ubicacion_exenta', jsonb_build_object('antes', 'no', 'despues', 'si')));

  return 'ok';
end $fn$;

revoke all on function public.eximir_ubicacion(uuid, text) from public;
grant execute on function public.eximir_ubicacion(uuid, text) to authenticated;

comment on function public.eximir_ubicacion is
  'Marca una gestion como sin ubicacion exigible, con motivo obligatorio y rastro en la bitacora. Solo Analista y Manager.';
