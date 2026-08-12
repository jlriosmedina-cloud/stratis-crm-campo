-- ===========================================================================
--  Se retira la foto de evidencia del flujo
--
--  El control pedia una imagen en cada gestion y nadie la revisaba. De 119
--  registros, 107 eran correo, WhatsApp o llamada: pantallazos de un chat o
--  de un correo, que prueban poco y costaban un paso en cada registro. Un
--  control que se exige al 100% y se revisa al 0% no protege nada: solo
--  cansa a quien lo cumple y da una falsa sensacion de respaldo.
--
--  Lo que sigue respaldando una gestion:
--    · el GPS, obligatorio en toda visita presencial y no modificable
--    · lo que el cliente dijo, transcrito, obligatorio cuando se registra
--      una respuesta por correo o WhatsApp
--    · el comentario del ejecutivo, obligatorio en todo registro
--    · la fecha y la hora, que no pueden ser futuras, y la puntualidad del
--      registro, que ahora se mide en el incentivo
--    · la bitacora, que guarda cada edicion con nombre y fecha
--
--  Las fotos ya cargadas NO se borran: siguen viendose en cada gestion que
--  las tenga y siguen saliendo en el Excel. Se deja de pedirlas, no se
--  reescribe el pasado.
--
--  Nota de metodo: el primer intento quito el bloque de la evidencia con una
--  expresion regular sobre la definicion viva de la funcion. Funciono a
--  medias —tambien se llevo la validacion del comentario del ejecutivo, que
--  estaba pegada abajo— y lo detecto la prueba que corria despues. Por eso
--  aca la funcion se reescribe entera y explicita: sobre una funcion de
--  produccion, un reemplazo a ciegas que no se puede releer no es una
--  herramienta aceptable.
-- ===========================================================================

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

  -- La evidencia fotografica dejo de exigirse en agosto de 2026. El parametro
  -- se mantiene en la firma para no romper a nadie que siga mandandolo: si
  -- viene una ruta se guarda, y si no, no pasa nada.

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
          nullif(trim(coalesce(p_evidencia_path, '')), ''),
          p_gasto_total, coalesce(p_gastos_paths, '{}'),
          nullif(p_calificacion,''), p_comentario_ejecutivo, nullif(trim(p_comentario_cliente),''));

  return v_cid;
end $fn$;

comment on function public.crear_venta_nueva is
  'Alta de una venta nueva junto con la gestion que la cerro, en una sola transaccion. La evidencia fotografica es opcional desde agosto de 2026.';

-- ---------------------------------------------------------------------------
--  Y queda escrito por que cambio la regla
-- ---------------------------------------------------------------------------
insert into public.auditoria (tabla, accion, registro_id, customer_id, comercio,
                              correo, ejecutivo, detalle)
select 'interacciones', 'editar', null, null, null,
       'jose.rios@mystratis.com', 'Jose Rios',
       jsonb_build_object(
         '_nota', 'Se retiro la foto de evidencia de todo el flujo de registro. De 119 gestiones, '
               || '107 eran pantallazos de correo, WhatsApp o llamada. Decision de Jose Rios: el '
               || 'control se exigia al 100% y se revisaba al 0%. Las fotos ya cargadas se '
               || 'conservan. El GPS de las visitas presenciales se mantiene obligatorio.',
         'evidencia', jsonb_build_object('antes', 'obligatoria', 'despues', 'no se pide'))
where not exists (
  select 1 from public.auditoria
   where detalle->>'_nota' like 'Se retiro la foto de evidencia%');
