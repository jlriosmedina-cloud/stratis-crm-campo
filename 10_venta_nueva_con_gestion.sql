-- ===========================================================================
--  Una venta nueva no existe sin la gestión que la cerró
--
--  Hasta ahora un cliente nuevo se daba de alta solo, y si el ejecutivo no
--  registraba después la visita, la fila salía al banco con 0 visitas, 0
--  llamadas y Contactado = NO. Una venta cerrada sin ningún contacto es una
--  contradicción: para cerrarla hubo que estar ahí o hablar por videollamada.
--
--  Ahora las dos cosas se guardan juntas o no se guarda ninguna:
--
--   · Un alta directa de tipo NUEVO queda prohibida por la política de acceso.
--   · La única puerta es crear_venta_nueva(), que inserta el comercio y su
--     gestión en la misma transacción. Si algo falla, no queda nada a medias.
--   · El medio tiene que ser presencial o virtual, y el resultado es siempre
--     "habló con el contacto": no hay venta sin conversación.
--
--  Los comentarios del cliente y del ejecutivo pasan a vivir en la gestión,
--  que es donde viven los de toda la campaña.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1 · Los comentarios vuelven a la gestión
-- ---------------------------------------------------------------------------
alter table public.clientes
  drop column if exists comentario_cliente,
  drop column if exists comentario_ejecutivo;

create or replace function public.fn_reglas_cliente()
returns trigger language plpgsql as $fn$
declare v_logrado boolean;
begin
  new.tipo_registro := coalesce(new.tipo_registro, 'CARTERA');

  if new.tipo_registro = 'NUEVO' then
    new.ruc          := regexp_replace(coalesce(new.ruc,''), '[^0-9]', '', 'g');
    new.customer_id  := 'NUEVO-' || new.ruc;
    new.razon_social := nullif(trim(new.razon_social), '');
    new.distrito     := null;
    new.direccion    := null;
    new.estado       := null;
    new.observacion  := null;
    new.resultado_gestion := 'VENTA';   -- la derivación es la venta
    new.nombre_comercio := coalesce(nullif(trim(new.nombre_comercio), ''), new.razon_social);
  else
    new.customer_id  := upper(trim(new.customer_id));
    new.distrito     := upper(trim(new.distrito));
    new.estado       := coalesce(new.estado, 'ACTIVO');
    new.ruc          := null;
    new.razon_social := null;

    if new.resultado_gestion in ('RETENIDO','VENTA') then
      select exists (
        select 1 from public.interacciones i
         where i.customer_id = new.customer_id and i.resultado = 'efectivo'
      ) into v_logrado;
      if not v_logrado then
        raise exception 'No se puede cerrar como % un comercio sin ningun contacto logrado. Registra primero la gestion en la que hablaste con el titular.',
          lower(new.resultado_gestion) using errcode = 'check_violation';
      end if;
    end if;

    if new.resultado_gestion = 'RETENIDO' and new.estado <> 'ACTIVO' then
      raise exception 'Un comercio dado de baja no puede quedar como retenido: si lo recuperaste marcalo como venta, y si no, no hay retencion que contar.'
        using errcode = 'check_violation';
    end if;
    if new.resultado_gestion = 'VENTA' and new.estado <> 'DE BAJA' then
      raise exception 'Venta es la recuperacion de un comercio que estaba dado de baja. Si el comercio figura activo y se queda con BBVA, eso es una retencion.'
        using errcode = 'check_violation';
    end if;
  end if;

  if auth.role() = 'authenticated' then
    if tg_op = 'INSERT' then
      new.asignado_correo := public.correo_actual();
      select coalesce(u.nombre_corto, u.nombre) into new.asignado
        from public.usuarios u where u.correo = new.asignado_correo;
    else
      new.asignado_correo := old.asignado_correo;
      new.asignado        := old.asignado;
      new.customer_id     := old.customer_id;
      new.tipo_registro   := old.tipo_registro;
      new.ruc             := old.ruc;
      new.creado_en       := old.creado_en;
    end if;
  end if;

  if new.rubro <> 'otro' then new.rubro_otro := null; end if;
  new.modificado_en := now();
  return new;
end $fn$;

create or replace function public.fn_auditar_cliente()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare v_det jsonb := '{}'::jsonb; v_campos text[] := array[
  'nombre_comercio','rubro','distrito','direccion','estado','resultado_gestion',
  'razon_social','observacion'];
  v_k text; v_a text; v_d text;
begin
  if tg_op = 'UPDATE' then
    foreach v_k in array v_campos loop
      v_a := to_jsonb(old) ->> v_k;
      v_d := to_jsonb(new) ->> v_k;
      if v_a is distinct from v_d then
        v_det := v_det || jsonb_build_object(v_k, jsonb_build_object('antes', v_a, 'despues', v_d));
      end if;
    end loop;
    if v_det = '{}'::jsonb then return new; end if;
  end if;
  insert into public.auditoria(tabla, accion, registro_id, customer_id, comercio, correo, ejecutivo, detalle)
  values ('clientes', case when tg_op='UPDATE' then 'editar' else 'eliminar' end,
          coalesce(old.customer_id, new.customer_id), coalesce(old.customer_id, new.customer_id),
          coalesce(old.nombre_comercio, new.nombre_comercio), public.correo_actual(),
          coalesce(old.asignado, new.asignado), v_det);
  return coalesce(new, old);
end $fn$;

-- ---------------------------------------------------------------------------
-- 2 · Nadie da de alta un cliente nuevo por la puerta de atrás
-- ---------------------------------------------------------------------------
drop policy if exists p_clientes_insert on public.clientes;
create policy p_clientes_insert on public.clientes
  for insert to authenticated
  with check (public.es_usuario_activo() and tipo_registro = 'CARTERA');

comment on policy p_clientes_insert on public.clientes is
  'Solo comercios de la cartera de BBVA. Una venta nueva entra unicamente por crear_venta_nueva(), que la guarda junto con su gestion.';

-- ---------------------------------------------------------------------------
-- 3 · La única puerta: comercio y gestión en la misma transacción
-- ---------------------------------------------------------------------------
create or replace function public.crear_venta_nueva(
  p_ruc                  text,
  p_razon_social         text,
  p_rubro                text,
  p_rubro_otro           text,
  p_tipo_contacto        text,
  p_fecha                date,
  p_hora                 time,
  p_evidencia_path       text,
  p_comentario_ejecutivo text,
  p_comentario_cliente   text  default null,
  p_calificacion         text  default null,
  p_ubicacion            text  default null,
  p_ubicacion_verificada boolean default false,
  p_gasto_total          numeric default null,
  p_gastos_paths         text[]  default '{}'
) returns text
language plpgsql security definer set search_path = public as $fn$
declare v_correo text; v_nombre text; v_cid text;
begin
  v_correo := public.correo_actual();
  if v_correo is null then
    raise exception 'Sesion no valida.' using errcode = 'check_violation';
  end if;
  select coalesce(u.nombre_corto, u.nombre) into v_nombre
    from public.usuarios u where u.correo = v_correo and u.activo;
  if v_nombre is null then
    raise exception 'Tu usuario no esta activo en el equipo.' using errcode = 'check_violation';
  end if;

  -- Una venta se cierra en la calle o en una reunion. Por telefono, correo o
  -- WhatsApp no se cierra una afiliacion nueva.
  if p_tipo_contacto not in ('visita_presencial','reunion_presencial','reunion_virtual','videollamada') then
    raise exception 'Una venta nueva se cierra en una visita presencial o en una reunion virtual.'
      using errcode = 'check_violation';
  end if;
  if coalesce(trim(p_evidencia_path), '') = '' then
    raise exception 'Falta la evidencia de la gestion.' using errcode = 'check_violation';
  end if;
  if coalesce(trim(p_comentario_ejecutivo), '') = '' then
    raise exception 'Falta el comentario del ejecutivo.' using errcode = 'check_violation';
  end if;

  insert into public.clientes(
    tipo_registro, ruc, razon_social, rubro, rubro_otro, nombre_comercio,
    asignado, asignado_correo)
  values ('NUEVO', p_ruc, p_razon_social, p_rubro, nullif(trim(p_rubro_otro),''), p_razon_social,
          v_nombre, v_correo)
  returning customer_id into v_cid;

  insert into public.interacciones(
    customer_id, correo_stratis, ejecutivo, fecha_contacto, hora_contacto,
    tipo_contacto, resultado, ubicacion, ubicacion_verificada, evidencia_path,
    gasto_total, gastos_paths, calificacion, comentario_ejecutivo, comentario_cliente)
  values (v_cid, v_correo, v_nombre, p_fecha, p_hora,
          p_tipo_contacto, 'efectivo', p_ubicacion, coalesce(p_ubicacion_verificada, false),
          p_evidencia_path, p_gasto_total, coalesce(p_gastos_paths, '{}'),
          nullif(p_calificacion,''), p_comentario_ejecutivo, nullif(trim(p_comentario_cliente),''));

  return v_cid;
end $fn$;

revoke all on function public.crear_venta_nueva(text,text,text,text,text,date,time,text,text,text,text,text,boolean,numeric,text[]) from public;
grant execute on function public.crear_venta_nueva(text,text,text,text,text,date,time,text,text,text,text,text,boolean,numeric,text[]) to authenticated;

comment on function public.crear_venta_nueva is
  'Da de alta una venta nueva junto con la gestion que la cerro, en una sola transaccion. Es la unica forma de crear un comercio de tipo NUEVO.';
