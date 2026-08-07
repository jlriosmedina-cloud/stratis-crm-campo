-- ===========================================================================
--  Una eliminación tiene que decir qué se eliminó
--
--  Hasta ahora, borrar dejaba una línea vacía en la bitácora: "Eliminó un
--  registro" y nada más. Justo al revés de lo que hace falta — eliminar es la
--  única salida a las reglas de inmutabilidad, así que es el momento en que
--  más importa saber qué desapareció.
--
--  Ahora el disparador guarda una foto de lo borrado: la gestión con su
--  fecha, medio y resultado; el comercio con su estado y cuántas gestiones se
--  llevó con él.
-- ===========================================================================

create or replace function public.fn_auditar_interaccion()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare v_det jsonb := '{}'::jsonb; v_com text; v_cid text;
begin
  v_cid := coalesce(old.customer_id, new.customer_id);
  select nombre_comercio into v_com from public.clientes where customer_id = v_cid;

  if tg_op = 'UPDATE' then
    if old.comentario_ejecutivo is distinct from new.comentario_ejecutivo then
      v_det := v_det || jsonb_build_object('Comentario del ejecutivo',
        jsonb_build_object('antes', old.comentario_ejecutivo, 'despues', new.comentario_ejecutivo)); end if;
    if old.comentario_cliente is distinct from new.comentario_cliente then
      v_det := v_det || jsonb_build_object('Comentario del cliente',
        jsonb_build_object('antes', old.comentario_cliente, 'despues', new.comentario_cliente)); end if;
    if old.calificacion is distinct from new.calificacion then
      v_det := v_det || jsonb_build_object('Calificacion',
        jsonb_build_object('antes', old.calificacion, 'despues', new.calificacion)); end if;
    if old.gasto_total is distinct from new.gasto_total then
      v_det := v_det || jsonb_build_object('Monto de viáticos',
        jsonb_build_object('antes', old.gasto_total, 'despues', new.gasto_total)); end if;
    if old.gastos_paths is distinct from new.gastos_paths then
      v_det := v_det || jsonb_build_object('Comprobantes',
        jsonb_build_object('antes', coalesce(array_length(old.gastos_paths,1),0),
                           'despues', coalesce(array_length(new.gastos_paths,1),0))); end if;
    if v_det = '{}'::jsonb then return new; end if;
  else
    -- La foto de lo que se borró, para que la línea de la bitácora se explique sola.
    v_det := jsonb_build_object('_borrado', jsonb_build_object(
      'fecha',      to_char(old.fecha_contacto, 'DD/MM/YYYY'),
      'hora',       to_char(old.hora_contacto, 'HH24:MI'),
      'medio',      old.tipo_contacto,
      'resultado',  old.resultado,
      'cumple',     old.cumple_visita,
      'ubicacion',  case when old.ubicacion_verificada then 'con GPS' else 'sin GPS' end,
      'gasto',      old.gasto_total,
      'comentario', left(coalesce(old.comentario_ejecutivo,''), 140)));
  end if;

  insert into public.auditoria(tabla, accion, registro_id, customer_id, comercio, correo, ejecutivo, detalle)
  values ('interacciones', case when tg_op='UPDATE' then 'editar' else 'eliminar' end,
          coalesce(old.id::text, new.id::text), v_cid, v_com, public.correo_actual(),
          coalesce(old.ejecutivo, new.ejecutivo), v_det);
  return coalesce(new, old);
end $fn$;

create or replace function public.fn_auditar_cliente()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare v_det jsonb := '{}'::jsonb; v_campos text[] := array[
  'nombre_comercio','rubro','distrito','direccion','estado','resultado_gestion',
  'razon_social','observacion'];
  v_k text; v_a text; v_d text; v_n int;
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
  else
    select count(*) into v_n from public.interacciones where customer_id = old.customer_id;
    v_det := jsonb_build_object('_borrado', jsonb_build_object(
      'tipo',      case when old.tipo_registro = 'NUEVO' then 'venta nueva' else 'cartera' end,
      'llave',     case when old.tipo_registro = 'NUEVO' then 'RUC ' || coalesce(old.ruc,'') else 'ID ' || old.customer_id end,
      'nombre',    old.nombre_comercio,
      'rubro',     old.rubro,
      'distrito',  old.distrito,
      'estado',    old.estado,
      'cierre',    old.resultado_gestion,
      'gestiones', v_n));
  end if;

  insert into public.auditoria(tabla, accion, registro_id, customer_id, comercio, correo, ejecutivo, detalle)
  values ('clientes', case when tg_op='UPDATE' then 'editar' else 'eliminar' end,
          coalesce(old.customer_id, new.customer_id), coalesce(old.customer_id, new.customer_id),
          coalesce(old.nombre_comercio, new.nombre_comercio), public.correo_actual(),
          coalesce(old.asignado, new.asignado), v_det);
  return coalesce(new, old);
end $fn$;
