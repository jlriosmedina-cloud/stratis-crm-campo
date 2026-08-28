-- =========================================================================
-- 38 · Corregir la llave de un comercio, completo y para quien lo registró
--
-- ATENCIÓN, LÉASE JUNTO CON EL 39. Se aplicó y se probó el mismo día, y la
-- prueba mostró que el punto 1 de acá abajo era falso: la escotilla de los
-- seguimientos ya vivía en la cláusula WHEN de su trigger, así que la rama que
-- este archivo le agrega al cuerpo es código muerto. El freno de verdad estaba
-- en el padre —`fn_reglas_cliente`— y por eso `corregir_customer_id` llevaba
-- meses sin renombrar nada. El 39 revierte esta parte y arregla lo que sí era.
-- Se conserva este archivo porque se aplicó: la historia de la base lo tiene.
--
-- Tres cosas, y la primera es un defecto vivo.
--
-- 1 · LA CITA SE QUEDABA ATRÁS. `fn_reglas_seguimiento` hace, en cada UPDATE,
--     `new.customer_id := old.customer_id`. Es correcto como regla general —la
--     cita no cambia de dueño— pero no tiene la escotilla que sí tiene
--     `fn_reglas_interaccion`. Al corregir un Customer ID, el ON UPDATE CASCADE
--     movía el seguimiento y el trigger lo devolvía; y como `corregir_customer_id`
--     solo contaba interacciones al verificar, la corrección terminaba «bien»
--     dejando la cita colgando de una llave que ya no existe.
--
--     Los dos comercios corregidos a mano el 27 y el 28/08 tenían una cita cada
--     uno. Se movieron a mano; el defecto seguía puesto para el siguiente.
--
-- 2 · EL RUC LO CORREGÍA SOLO SUPERVISIÓN. El dedazo lo descubre quien está en
--     la calle. Hacerlo esperar deja el dato malo en la base que se le entrega
--     al banco, que es justo lo que no queremos.
--
-- 3 · LA VENTANA DE EDICIÓN NO GOBIERNA ESTO. La ventana existe para que nadie
--     retoque gestiones pasadas y se mejore los indicadores. Corregir una llave
--     mal tecleada no mueve ningún indicador: el comercio conserva su historia,
--     su estado y su gestión; lo único que cambia es cómo se llama. Lo que sí se
--     conserva es la otra mitad de la regla —solo sobre lo propio— y la bitácora
--     con nombre y apellido.
-- =========================================================================

-- ---- 1 · La escotilla en el trigger de seguimientos ----------------------
create or replace function public.fn_reglas_seguimiento()
returns trigger
language plpgsql
as $function$
declare
  v_corrigiendo text := coalesce(current_setting('app.corrigiendo_customer_id', true), '');
begin
  if tg_op = 'INSERT' then
    if public.correo_actual() is not null then
      new.correo_stratis := public.correo_actual();
      new.ejecutivo := coalesce(
        (select coalesce(nombre_corto, nombre) from public.usuarios
          where correo = new.correo_stratis), new.ejecutivo);
    end if;
    if new.fecha_objetivo < (now() at time zone 'America/Lima')::date then
      raise exception 'La cita no puede quedar en el pasado. Si la visita ya ocurrio, registrala como gestion.'
        using errcode = 'check_violation';
    end if;
    if new.fecha_objetivo > (now() at time zone 'America/Lima')::date + 180 then
      raise exception 'Esa fecha esta a mas de seis meses. Revisala.'
        using errcode = 'check_violation';
    end if;
    if new.modalidad is not null and new.duracion_min is null then
      new.duracion_min := case when new.modalidad = 'VIRTUAL' then 30 else 60 end;
    end if;
  end if;

  if tg_op = 'UPDATE' then
    -- La cita no cambia de comercio... salvo cuando el comercio entero cambia
    -- de llave, y eso solo puede pedirlo `corregir_customer_id`, que deja su
    -- marca en la sesion. Sin la marca, la regla de siempre.
    if not (v_corrigiendo <> '' and new.customer_id = v_corrigiendo) then
      new.customer_id := old.customer_id;
    end if;
    new.correo_stratis := old.correo_stratis;
    new.creado_en      := old.creado_en;
    new.historial      := coalesce(old.historial, '[]'::jsonb);

    if new.cerrado_en is not null and old.cerrado_en is null then
      new.cerrado_por := coalesce(new.cerrado_por, public.correo_actual());
      new.cerrado_motivo := coalesce(new.cerrado_motivo, 'DESCARTADA');
    end if;

    if new.modalidad is not null
       and (new.fecha_objetivo is distinct from old.fecha_objetivo
            or new.hora_inicio is distinct from old.hora_inicio) then

      if new.fecha_objetivo < (now() at time zone 'America/Lima')::date
         and not public.es_admin() then
        raise exception 'No se puede reagendar hacia atras. Si la visita ya ocurrio, registrala como gestion.'
          using errcode = 'check_violation';
      end if;
      if new.fecha_objetivo > (now() at time zone 'America/Lima')::date + 180 then
        raise exception 'Esa fecha esta a mas de seis meses. Revisala.'
          using errcode = 'check_violation';
      end if;

      new.historial := new.historial || jsonb_build_object(
        'fecha',      old.fecha_objetivo,
        'hora',       old.hora_inicio,
        'movida_en',  now(),
        'movida_por', public.correo_actual());
    end if;
  end if;
  return new;
end $function$;

-- ---- 1b · El aviso que dejaba de ser cierto ------------------------------
-- `fn_llave_inmutable` salta cuando alguien toca la llave por fuera del RPC, y
-- decia «solo el Analista o el Manager». Desde hoy tambien la corrige quien
-- registro el comercio, asi que el aviso mandaria a la persona equivocada. Lo
-- que la regla protege no es quien, es por donde: a mano nunca, desde la ficha
-- siempre.
create or replace function public.fn_llave_inmutable()
returns trigger
language plpgsql
as $function$
begin
  if new.customer_id is distinct from old.customer_id
     and coalesce(current_setting('app.corrigiendo_customer_id', true), '') is distinct from new.customer_id then
    raise exception 'El Customer ID no se edita a mano: se corrige desde la ficha del comercio, con el boton Corregir.'
      using errcode = 'check_violation';
  end if;
  return new;
end $function$;

-- ---- 2 · Corregir el Customer ID, arrastrando TODO -----------------------
create or replace function public.corregir_customer_id(p_actual text, p_nuevo text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actual  text := trim(coalesce(p_actual, ''));
  v_nuevo   text := trim(coalesce(p_nuevo, ''));
  v_nombre  text;
  v_tipo    text;
  v_duenio  text;
  v_correo  text := public.correo_actual();
  v_n       int;
  v_ncitas  int;
  v_quedan  int;
begin
  if v_correo is null then
    raise exception 'Sesion no valida.' using errcode = 'check_violation';
  end if;

  select nombre_comercio, tipo_registro, asignado_correo
    into v_nombre, v_tipo, v_duenio
    from public.clientes where customer_id = v_actual for update;
  if v_nombre is null then
    raise exception 'No existe ningun comercio con el Customer ID %.', v_actual
      using errcode = 'check_violation';
  end if;

  -- Supervision cualquiera; el ejecutivo, lo suyo. La ventana de edicion NO
  -- gobierna esto: un identificador mal tecleado no mueve ningun indicador, y
  -- dejarlo mal en la base que se le entrega al banco es peor que corregirlo
  -- tarde. Quien lo hizo queda en la bitacora.
  if not public.es_admin() and v_duenio is distinct from v_correo then
    raise exception 'Solo puedes corregir el Customer ID de los comercios que tu registraste.'
      using errcode = 'insufficient_privilege';
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
  -- Once digitos es un RUC, y un RUC convierte la ficha en venta nueva sin que
  -- nadie lo haya pedido: el comercio saldria del portafolio de retencion y de
  -- todos sus indicadores. Una correccion no puede cambiar de que se trata.
  if v_nuevo ~ '^[0-9]{11}$' then
    raise exception 'Ese numero tiene forma de RUC. Un comercio de cartera no puede quedar identificado como venta nueva.'
      using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.clientes where customer_id = v_nuevo) then
    raise exception 'El Customer ID % ya esta en uso por otro comercio.', v_nuevo
      using errcode = 'unique_violation';
  end if;

  select count(*) into v_n      from public.interacciones where customer_id = v_actual;
  select count(*) into v_ncitas from public.seguimientos  where customer_id = v_actual;

  perform set_config('app.corrigiendo_customer_id', v_nuevo, true);
  update public.clientes set customer_id = v_nuevo where customer_id = v_actual;

  select count(*) into v_quedan from public.interacciones where customer_id = v_actual;
  if v_quedan > 0 then
    update public.interacciones set customer_id = v_nuevo where customer_id = v_actual;
  end if;
  select count(*) into v_quedan from public.seguimientos where customer_id = v_actual;
  if v_quedan > 0 then
    update public.seguimientos set customer_id = v_nuevo where customer_id = v_actual;
  end if;
  perform set_config('app.corrigiendo_customer_id', '', true);

  -- Se verifica lo que se movio, TODO. Antes solo se contaban las gestiones y
  -- una cita rezagada pasaba en silencio: la correccion terminaba «bien» y
  -- dejaba el seguimiento colgando de una llave que ya no existe.
  select count(*) into v_quedan from public.interacciones where customer_id = v_actual;
  if v_quedan > 0 then
    raise exception 'La correccion se cancelo: % de % gestiones no siguieron al comercio.',
      v_quedan, v_n using errcode = 'check_violation';
  end if;
  select count(*) into v_quedan from public.seguimientos where customer_id = v_actual;
  if v_quedan > 0 then
    raise exception 'La correccion se cancelo: % de % citas no siguieron al comercio.',
      v_quedan, v_ncitas using errcode = 'check_violation';
  end if;

  update public.auditoria set customer_id = v_nuevo where customer_id = v_actual;

  insert into public.auditoria(tabla, accion, registro_id, customer_id, comercio,
                               correo, ejecutivo, detalle)
  values ('clientes', 'editar', v_nuevo, v_nuevo, v_nombre, v_correo,
          (select coalesce(nombre_corto, nombre) from public.usuarios where correo = v_correo),
          jsonb_build_object('customer_id',
            jsonb_build_object('antes', v_actual, 'despues', v_nuevo),
            '_arrastro', v_n, '_citas', v_ncitas));

  return format('%s: %s -> %s, con %s gestion(es) y %s cita(s)',
                v_nombre, v_actual, v_nuevo, v_n, v_ncitas);
end $function$;

-- ---- 3 · Corregir el RUC, tambien por quien lo registro ------------------
create or replace function public.corregir_ruc(p_customer_id text, p_ruc text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_correo  text := public.correo_actual();
  v_actual  text := trim(coalesce(p_customer_id, ''));
  v_ruc     text := trim(coalesce(p_ruc, ''));
  v_nuevo   text;
  v_c       public.clientes%rowtype;
  v_n       int;
  v_ncitas  int;
  v_quedan  int;
  v_leido   text;
begin
  if v_correo is null then
    raise exception 'Sesion no valida.' using errcode = 'check_violation';
  end if;

  select * into v_c from public.clientes where customer_id = v_actual for update;
  if not found then
    raise exception 'No existe ningun comercio con el Customer ID %.', v_actual
      using errcode = 'check_violation';
  end if;
  if v_c.tipo_registro <> 'NUEVO' then
    raise exception 'Solo las ventas nuevas llevan RUC. Un comercio de cartera se corrige con el Customer ID.'
      using errcode = 'check_violation';
  end if;

  -- Mismo criterio que el Customer ID: supervision cualquiera, el ejecutivo lo
  -- suyo. Antes esto era solo de supervision y el dedazo lo descubre quien esta
  -- en la calle.
  if not public.es_admin() and v_c.asignado_correo is distinct from v_correo then
    raise exception 'Solo puedes corregir el RUC de las ventas que tu registraste.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_ruc !~ '^[0-9]{11}$' then
    raise exception 'El RUC son 11 digitos, sin espacios ni guiones. Recibi: %', coalesce(nullif(v_ruc,''),'(vacio)')
      using errcode = 'check_violation';
  end if;
  if v_ruc = v_c.ruc then
    raise exception 'El RUC nuevo es igual al que ya tiene el registro.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.clientes where ruc = v_ruc and customer_id <> v_actual) then
    raise exception 'Ya hay otra venta registrada con el RUC %.', v_ruc using errcode = 'unique_violation';
  end if;

  v_nuevo := 'NUEVO-' || v_ruc;
  if exists (select 1 from public.clientes where customer_id = v_nuevo) then
    raise exception 'El Customer ID % ya esta en uso.', v_nuevo using errcode = 'unique_violation';
  end if;

  select count(*) into v_n      from public.interacciones where customer_id = v_actual;
  select count(*) into v_ncitas from public.seguimientos  where customer_id = v_actual;

  perform set_config('app.corrigiendo_customer_id', v_nuevo, true);
  perform set_config('app.corrigiendo_ruc', v_actual || '|' || v_ruc || '|' || v_nuevo, true);

  update public.clientes
     set customer_id = v_nuevo,
         ruc         = v_ruc
   where customer_id = v_actual;

  select ruc into v_leido from public.clientes where customer_id = v_nuevo;
  if v_leido is null then
    raise exception 'La correccion no se aplico: el comercio sigue como %.', v_actual;
  end if;
  if v_leido is distinct from v_ruc then
    raise exception 'La correccion no se aplico: el RUC quedo en %.', coalesce(v_leido, '(nulo)');
  end if;

  select count(*) into v_quedan from public.interacciones where customer_id = v_actual;
  if v_quedan > 0 then
    update public.interacciones set customer_id = v_nuevo where customer_id = v_actual;
  end if;
  select count(*) into v_quedan from public.seguimientos where customer_id = v_actual;
  if v_quedan > 0 then
    update public.seguimientos set customer_id = v_nuevo where customer_id = v_actual;
  end if;

  perform set_config('app.corrigiendo_ruc', '', true);
  perform set_config('app.corrigiendo_customer_id', '', true);

  select count(*) into v_quedan from public.interacciones where customer_id = v_actual;
  if v_quedan > 0 then
    raise exception 'La correccion se cancelo: % de % gestiones no siguieron al comercio.',
      v_quedan, v_n using errcode = 'check_violation';
  end if;
  select count(*) into v_quedan from public.seguimientos where customer_id = v_actual;
  if v_quedan > 0 then
    raise exception 'La correccion se cancelo: % de % citas no siguieron al comercio.',
      v_quedan, v_ncitas using errcode = 'check_violation';
  end if;

  update public.auditoria set customer_id = v_nuevo where customer_id = v_actual;

  insert into public.auditoria(tabla, accion, registro_id, customer_id, comercio,
                               correo, ejecutivo, detalle)
  values ('clientes', 'editar', v_nuevo, v_nuevo, v_c.nombre_comercio, v_correo,
          (select coalesce(nombre_corto, nombre) from public.usuarios where correo = v_correo),
          jsonb_build_object(
            'ruc',         jsonb_build_object('antes', coalesce(v_c.ruc, '(sin dato)'), 'despues', v_ruc),
            'customer_id', jsonb_build_object('antes', v_actual, 'despues', v_nuevo),
            '_arrastro',   v_n, '_citas', v_ncitas));

  return format('%s: RUC %s -> %s (%s -> %s), con %s gestion(es) y %s cita(s)',
                v_c.nombre_comercio, coalesce(v_c.ruc,'(sin dato)'), v_ruc, v_actual, v_nuevo, v_n, v_ncitas);
end $function$;
