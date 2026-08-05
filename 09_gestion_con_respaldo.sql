-- ===========================================================================
--  La columna «Gestión» de BBVA no se marca sola
--
--  Gestión = SI significa objetivo cumplido, y hasta ahora nada impedía
--  marcarlo sin una sola gestión detrás: al banco le llegaba SI con cero
--  visitas, cero llamadas y Contactado = NO. Esa fila se cae sola en cuanto
--  alguien la mira.
--
--  Dos reglas, ahora en la base:
--
--   1 · Retenido y Venta exigen al menos un contacto logrado —una gestión
--       con resultado "habló con el contacto"— sobre ese mismo comercio.
--
--   2 · El estado del comercio decide cuál de los dos aplica:
--         · ACTIVO  → operaba y se queda: es RETENCIÓN.
--         · DE BAJA → al gestionarlo no era cliente activo. Si se recuperó es
--                     VENTA y se deriva al ejecutivo de BBVA; si no, no hay
--                     retención que contar.
--
--  Los clientes nuevos quedan fuera de la regla 1: ahí la derivación es la
--  venta y no depende de una gestión previa.
-- ===========================================================================

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
    new.comentario_cliente   := null;
    new.comentario_ejecutivo := null;

    -- ---- Regla 1: nada de cerrar sin haber hablado con alguien ------------
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

    -- ---- Regla 2: el estado decide si es retención o venta ----------------
    if new.resultado_gestion = 'RETENIDO' and new.estado <> 'ACTIVO' then
      raise exception 'Un comercio dado de baja no puede quedar como retenido: si lo recuperaste marcalo como venta, y si no, no hay retencion que contar.'
        using errcode = 'check_violation';
    end if;
    if new.resultado_gestion = 'VENTA' and new.estado <> 'DE BAJA' then
      raise exception 'Venta es la recuperacion de un comercio que estaba dado de baja. Si el comercio figura activo y se queda con BBVA, eso es una retencion.'
        using errcode = 'check_violation';
    end if;
  end if;

  new.comentario_cliente   := nullif(trim(coalesce(new.comentario_cliente,   '')), '');
  new.comentario_ejecutivo := nullif(trim(coalesce(new.comentario_ejecutivo, '')), '');

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

-- ---------------------------------------------------------------------------
--  Y si después se borra la gestión que sostenía el cierre, el cierre cae
--  con ella. Queda en la bitácora, así que se ve quién y cuándo.
-- ---------------------------------------------------------------------------
create or replace function public.fn_cierre_sin_respaldo()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  update public.clientes c
     set resultado_gestion = 'PENDIENTE'
   where c.customer_id = old.customer_id
     and c.tipo_registro = 'CARTERA'
     and c.resultado_gestion in ('RETENIDO','VENTA')
     and not exists (select 1 from public.interacciones i
                      where i.customer_id = old.customer_id and i.resultado = 'efectivo');
  return old;
end $fn$;

drop trigger if exists tg_cierre_sin_respaldo on public.interacciones;
create trigger tg_cierre_sin_respaldo
  after delete on public.interacciones
  for each row execute function public.fn_cierre_sin_respaldo();

comment on function public.fn_cierre_sin_respaldo is
  'Si se elimina el ultimo contacto logrado de un comercio cerrado, el cierre vuelve a Pendiente.';
