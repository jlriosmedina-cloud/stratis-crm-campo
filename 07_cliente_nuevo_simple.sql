-- ===========================================================================
--  Cliente nuevo — ficha mínima
--
--  El onboarding de una venta nueva (representante legal, DNI, cuenta, POS)
--  lo hace BBVA por su propio canal. En el CRM solo necesitamos poder verla:
--
--      RUC · razón social · rubro · resultado de la gestión · comentarios
--
--  Por eso salen de la base los datos de contacto, y para los clientes nuevos
--  no se piden distrito, dirección ni estado del cliente: un comercio que
--  recién se está afiliando no tiene estado que reportar.
--
--  La cartera de BBVA no cambia en nada.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1 · Fuera los datos de contacto
-- ---------------------------------------------------------------------------
alter table public.clientes drop constraint if exists ck_cartera_sin_datos;
alter table public.clientes drop constraint if exists ck_nuevo_con_datos;

alter table public.clientes
  drop column if exists contacto_nombre,
  drop column if exists contacto_celular,
  drop column if exists contacto_correo;

-- ---------------------------------------------------------------------------
-- 2 · Los dos comentarios de siempre, ahora también en la ficha del comercio
-- ---------------------------------------------------------------------------
alter table public.clientes
  add column if not exists comentario_cliente   text,
  add column if not exists comentario_ejecutivo text;

comment on column public.clientes.comentario_cliente is
  'Lo que dijo el cliente al momento del alta. Reemplaza a observacion en los clientes nuevos.';

-- ---------------------------------------------------------------------------
-- 3 · Distrito, dirección y estado dejan de ser obligatorios en la tabla:
--     la obligatoriedad pasa a depender del origen del comercio.
-- ---------------------------------------------------------------------------
alter table public.clientes alter column distrito  drop not null;
alter table public.clientes alter column direccion drop not null;
alter table public.clientes alter column estado    drop not null;

-- La cartera de BBVA los sigue exigiendo, igual que antes.
alter table public.clientes drop constraint if exists ck_cartera_completa;
alter table public.clientes add constraint ck_cartera_completa check (
  tipo_registro <> 'CARTERA' or (
        coalesce(trim(distrito),  '') <> ''
    and coalesce(trim(direccion), '') <> ''
    and estado in ('ACTIVO','DE BAJA')
    and ruc is null and razon_social is null));

-- Un cliente nuevo: RUC de once dígitos y razón social. Nada más, y nada
-- de los campos de la cartera.
alter table public.clientes add constraint ck_nuevo_con_datos check (
  tipo_registro <> 'NUEVO' or (
        ruc ~ '^[0-9]{11}$'
    and coalesce(trim(razon_social), '') <> ''
    and distrito is null and direccion is null and estado is null));

-- ---------------------------------------------------------------------------
-- 4 · Reglas del alta
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 5 · La bitácora sigue los campos que quedaron
-- ---------------------------------------------------------------------------
create or replace function public.fn_auditar_cliente()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare v_det jsonb := '{}'::jsonb; v_campos text[] := array[
  'nombre_comercio','rubro','distrito','direccion','estado','resultado_gestion',
  'razon_social','observacion','comentario_cliente','comentario_ejecutivo'];
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
