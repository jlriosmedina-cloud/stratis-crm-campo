-- ===========================================================================
--  Registrar es trabajo de campo
--
--  El Analista y el Manager supervisan la campaña: ven todo, exportan todo y
--  gestionan el equipo. Pero no dan de alta comercios ni registran gestiones,
--  porque no salen a la calle. Que puedan hacerlo ensucia las métricas —un
--  intento suyo entraría al conteo de efectividad— y confunde a quién le
--  pertenece cada comercio.
--
--  Se cierra en la base, no solo en la pantalla.
-- ===========================================================================

create or replace function public.es_ejecutivo()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.usuarios
    where correo = public.correo_actual() and activo and rol = 'Ejecutivo'
  )
$$;

comment on function public.es_ejecutivo is
  'Verdadero solo para quien trabaja la calle. El Analista y el Manager supervisan, no registran.';

-- ---------------------------------------------------------------------------
-- 1 · Alta de comercios de la cartera
-- ---------------------------------------------------------------------------
drop policy if exists p_clientes_insert on public.clientes;
create policy p_clientes_insert on public.clientes
  for insert to authenticated
  with check (public.es_ejecutivo() and tipo_registro = 'CARTERA');

comment on policy p_clientes_insert on public.clientes is
  'Solo un ejecutivo activo, y solo comercios de la cartera de BBVA. Una venta nueva entra unicamente por crear_venta_nueva().';

-- ---------------------------------------------------------------------------
-- 2 · Registro de gestiones
-- ---------------------------------------------------------------------------
drop policy if exists p_inter_insert on public.interacciones;
create policy p_inter_insert on public.interacciones
  for insert to authenticated
  with check (
    public.es_ejecutivo()
    and correo_stratis = public.correo_actual()
    and exists (select 1 from public.clientes c
                 where c.customer_id = interacciones.customer_id
                   and c.asignado_correo = public.correo_actual()));

comment on policy p_inter_insert on public.interacciones is
  'Solo un ejecutivo activo, a su propio nombre y sobre un comercio de su propia cartera.';

-- ---------------------------------------------------------------------------
-- 3 · La venta nueva pasa por una función, así que la regla va adentro
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
    from public.usuarios u
   where u.correo = v_correo and u.activo and u.rol = 'Ejecutivo';
  if v_nombre is null then
    raise exception 'Las ventas nuevas las registran los ejecutivos en campo.'
      using errcode = 'check_violation';
  end if;

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
