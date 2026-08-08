-- ===========================================================================
--  Que la llave se pueda corregir — y que nadie más la toque
--
--  Al probar corregir_customer_id() salió algo peor de lo que iba a arreglar:
--
--  1) fn_reglas_interaccion revierte en silencio cualquier cambio de
--     customer_id en una gestión. Es la regla de inmutabilidad, y está bien
--     que exista, pero también le ganaba al ON UPDATE CASCADE: el comercio se
--     renombraba y sus gestiones se quedaban apuntando al ID viejo, que ya no
--     existía. Sin error. Gestiones huérfanas.
--
--  2) Del otro lado, nada impedía cambiar clientes.customer_id: cualquiera con
--     sesión podía renombrar la llave de su propio comercio por la API y dejar
--     sus gestiones colgando, con la misma mecánica.
--
--  Se cierra por los dos lados y se abre una sola rendija: una marca de
--  transacción que únicamente pone corregir_customer_id(), y que vale para un
--  ID de destino concreto. Fuera de esa función, la llave sigue siendo
--  intocable.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1 · La gestión deja pasar el cambio solo si viene de la corrección
-- ---------------------------------------------------------------------------
create or replace function public.fn_reglas_interaccion()
returns trigger language plpgsql as $function$
declare
  v_presencial boolean;
  v_virtual    boolean;
begin
  if tg_op = 'UPDATE' then
    -- El customer_id es inmutable, salvo cuando corregir_customer_id() está
    -- arrastrando las gestiones detrás de su comercio. La marca lleva el ID
    -- de destino: autoriza ese cambio y ningún otro.
    if coalesce(current_setting('app.corrigiendo_customer_id', true), '') is distinct from new.customer_id then
      new.customer_id := old.customer_id;
    end if;
    new.correo_stratis       := old.correo_stratis;
    new.ejecutivo            := old.ejecutivo;
    new.fecha_contacto       := old.fecha_contacto;
    new.hora_contacto        := old.hora_contacto;
    new.tipo_contacto        := old.tipo_contacto;
    new.resultado            := old.resultado;
    new.ubicacion            := old.ubicacion;
    new.ubicacion_verificada := old.ubicacion_verificada;
    new.evidencia_path       := old.evidencia_path;
    new.creado_en            := old.creado_en;
  end if;

  v_presencial := new.tipo_contacto in ('visita_presencial','reunion_presencial');
  v_virtual    := new.tipo_contacto in ('reunion_virtual','videollamada');

  new.visita_presencial := case when v_presencial then 'SI' else 'No' end;
  new.visita_virtual    := case when v_virtual    then 'SI' else 'No' end;
  new.cumple_visita     := case when (v_presencial or v_virtual)
                                 and new.resultado = 'efectivo' then 'SI' else 'No' end;
  new.fecha_visita_actualizada :=
    case when new.cumple_visita = 'SI' then new.fecha_contacto else null end;

  if tg_op = 'INSERT' and auth.role() = 'authenticated' then
    new.correo_stratis := public.correo_actual();
  end if;

  new.modificado_en := now();
  return new;
end $function$;

-- ---------------------------------------------------------------------------
-- 2 · El comercio tampoco cambia de llave por su cuenta
-- ---------------------------------------------------------------------------
create or replace function public.fn_llave_inmutable()
returns trigger language plpgsql as $function$
begin
  if new.customer_id is distinct from old.customer_id
     and coalesce(current_setting('app.corrigiendo_customer_id', true), '') is distinct from new.customer_id then
    raise exception 'El Customer ID no se edita: se corrige desde la ficha, y solo el Analista o el Manager.'
      using errcode = 'check_violation';
  end if;
  return new;
end $function$;

drop trigger if exists tg_llave_inmutable on public.clientes;
create trigger tg_llave_inmutable
  before update on public.clientes
  for each row execute function public.fn_llave_inmutable();

comment on function public.fn_llave_inmutable is
  'El customer_id solo cambia dentro de corregir_customer_id(); en cualquier otra ruta se rechaza.';

-- ---------------------------------------------------------------------------
-- 3 · La corrección enciende la marca mientras dura
-- ---------------------------------------------------------------------------
create or replace function public.corregir_customer_id(p_actual text, p_nuevo text)
returns text
language plpgsql security definer set search_path = public as $fn$
declare
  v_correo text;
  v_actual text := trim(coalesce(p_actual, ''));
  v_nuevo  text := trim(coalesce(p_nuevo, ''));
  v_nombre text;
  v_tipo   text;
  v_n      int;
begin
  v_correo := public.correo_actual();
  if coalesce(v_correo, '') = '' then
    raise exception 'Sesion no valida.' using errcode = 'check_violation';
  end if;
  if not public.es_admin() then
    raise exception 'Corregir un Customer ID lo hacen el Analista o el Manager.'
      using errcode = 'check_violation';
  end if;

  if v_actual = '' or v_nuevo = '' then
    raise exception 'Falta el Customer ID.' using errcode = 'check_violation';
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

  select nombre_comercio, tipo_registro into v_nombre, v_tipo
    from public.clientes where customer_id = v_actual for update;
  if v_nombre is null then
    raise exception 'No existe ningun comercio con el Customer ID %.', v_actual
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

  -- La marca vale solo dentro de esta transaccion y solo para este destino.
  perform set_config('app.corrigiendo_customer_id', v_nuevo, true);
  update public.clientes set customer_id = v_nuevo where customer_id = v_actual;
  perform set_config('app.corrigiendo_customer_id', '', true);

  if exists (select 1 from public.interacciones where customer_id = v_actual) then
    raise exception 'La correccion se cancelo: las gestiones no siguieron al comercio.'
      using errcode = 'check_violation';
  end if;

  -- La bitácora del comercio viaja también: si no, el historial queda partido
  -- en dos y nadie encuentra lo que pasó antes de la corrección.
  update public.auditoria set customer_id = v_nuevo where customer_id = v_actual;

  insert into public.auditoria(tabla, accion, registro_id, customer_id, comercio,
                               correo, ejecutivo, detalle)
  values ('clientes', 'editar', v_nuevo, v_nuevo, v_nombre, v_correo,
          (select coalesce(nombre_corto, nombre) from public.usuarios where correo = v_correo),
          jsonb_build_object('customer_id',
            jsonb_build_object('antes', v_actual, 'despues', v_nuevo),
            '_arrastro', v_n));

  return v_nuevo;
end $fn$;

revoke all on function public.corregir_customer_id(text, text) from public;
grant execute on function public.corregir_customer_id(text, text) to authenticated;
