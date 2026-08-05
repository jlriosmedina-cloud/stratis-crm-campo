-- ===========================================================================
--  Una venta nueva es una derivación
--
--  El ejecutivo de Stratis no puede saber si BBVA terminó afiliando al
--  comercio: eso se ve en la cartera del siguiente corte. Preguntarle el
--  resultado sería pedirle un dato que no tiene.
--
--  Para el equipo la derivación ya cuenta, así que la base la marca como
--  venta y no deja que nadie la cambie. La efectividad real de las
--  derivaciones se mide después, cruzando contra la cartera de BBVA.
-- ===========================================================================

create or replace function public.fn_reglas_cliente()
returns trigger language plpgsql as $fn$
begin
  new.tipo_registro := coalesce(new.tipo_registro, 'CARTERA');

  if new.tipo_registro = 'NUEVO' then
    -- Sin customer_id: la llave se deriva del RUC para que siga siendo única.
    new.ruc          := regexp_replace(coalesce(new.ruc,''), '[^0-9]', '', 'g');
    new.customer_id  := 'NUEVO-' || new.ruc;
    new.razon_social := nullif(trim(new.razon_social), '');
    -- Un comercio que recién se afilia no tiene dirección de cartera ni estado.
    new.distrito     := null;
    new.direccion    := null;
    new.estado       := null;
    new.observacion  := null;
    -- La derivación es la venta. No se pregunta y no se edita.
    new.resultado_gestion := 'VENTA';
    -- El nombre con el que se lista es la razón social: no se pide aparte.
    new.nombre_comercio := coalesce(nullif(trim(new.nombre_comercio), ''), new.razon_social);
  else
    new.customer_id  := upper(trim(new.customer_id));
    new.distrito     := upper(trim(new.distrito));
    new.estado       := coalesce(new.estado, 'ACTIVO');
    new.ruc          := null;
    new.razon_social := null;
    -- Los comentarios de la ficha son de los clientes nuevos; la cartera usa
    -- observacion y los comentarios de cada gestión.
    new.comentario_cliente   := null;
    new.comentario_ejecutivo := null;
  end if;

  new.comentario_cliente   := nullif(trim(coalesce(new.comentario_cliente,   '')), '');
  new.comentario_ejecutivo := nullif(trim(coalesce(new.comentario_ejecutivo, '')), '');

  if auth.role() = 'authenticated' then
    if tg_op = 'INSERT' then
      new.asignado_correo := public.correo_actual();
      select coalesce(u.nombre_corto, u.nombre) into new.asignado
        from public.usuarios u where u.correo = new.asignado_correo;
    else
      -- nadie puede pasarle su cartera a otro, ni cambiar la identidad del registro
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

-- Que también quede escrito en la tabla, no solo en el disparador.
alter table public.clientes drop constraint if exists ck_nuevo_es_venta;
alter table public.clientes add constraint ck_nuevo_es_venta check (
  tipo_registro <> 'NUEVO' or resultado_gestion = 'VENTA');
