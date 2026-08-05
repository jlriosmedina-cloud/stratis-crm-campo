-- ===========================================================================
--  Clientes nuevos que trae Stratis
--
--  Hasta ahora todo comercio venía de la cartera de BBVA y se identificaba por
--  customer_id. Ahora el ejecutivo también puede dar de alta una venta nueva:
--  un negocio que el banco todavía no tiene afiliado, así que no hay
--  customer_id y el identificador es el RUC.
--
--  Para que BBVA pueda afiliarlo necesita saber quién es, así que en estos
--  casos —y solo en estos— se guardan razón social y un dato de contacto.
--  Los comercios de la cartera de BBVA siguen sin ninguno de esos campos.
-- ===========================================================================

alter table public.clientes
  add column if not exists tipo_registro     text not null default 'CARTERA',
  add column if not exists ruc               text,
  add column if not exists razon_social      text,
  add column if not exists contacto_nombre   text,
  add column if not exists contacto_celular  text,
  add column if not exists contacto_correo   text;

alter table public.clientes drop constraint if exists ck_tipo_registro;
alter table public.clientes add constraint ck_tipo_registro check (
  tipo_registro in ('CARTERA','NUEVO'));

-- Un comercio de la cartera de BBVA no guarda datos del titular. Punto.
alter table public.clientes drop constraint if exists ck_cartera_sin_datos;
alter table public.clientes add constraint ck_cartera_sin_datos check (
  tipo_registro <> 'CARTERA' or (
    ruc is null and razon_social is null and
    contacto_nombre is null and contacto_celular is null and contacto_correo is null));

-- Un cliente nuevo sí los necesita: RUC de 11 dígitos, razón social y al
-- menos una forma de contactarlo.
alter table public.clientes drop constraint if exists ck_nuevo_con_datos;
alter table public.clientes add constraint ck_nuevo_con_datos check (
  tipo_registro <> 'NUEVO' or (
    ruc ~ '^[0-9]{11}$'
    and coalesce(trim(razon_social),'') <> ''
    and (coalesce(trim(contacto_celular),'') <> '' or coalesce(trim(contacto_correo),'') <> '')));

-- El RUC no se repite en toda la campaña, igual que el customer_id
drop index if exists ux_clientes_ruc;
create unique index ux_clientes_ruc on public.clientes(ruc) where ruc is not null;

comment on column public.clientes.tipo_registro is
  'CARTERA = comercio de la base de BBVA, identificado por customer_id. NUEVO = venta que trae Stratis, identificada por RUC.';

-- ---------------------------------------------------------------------------
--  Reglas del alta: el customer_id de un cliente nuevo lo arma la base
-- ---------------------------------------------------------------------------
create or replace function public.fn_reglas_cliente()
returns trigger language plpgsql as $fn$
begin
  new.tipo_registro := coalesce(new.tipo_registro, 'CARTERA');
  new.distrito      := upper(trim(new.distrito));

  if new.tipo_registro = 'NUEVO' then
    -- Sin customer_id: la llave se deriva del RUC para que siga siendo única.
    new.ruc         := regexp_replace(coalesce(new.ruc,''), '[^0-9]', '', 'g');
    new.customer_id := 'NUEVO-' || new.ruc;
    new.razon_social      := nullif(trim(new.razon_social), '');
    new.contacto_nombre   := nullif(trim(new.contacto_nombre), '');
    new.contacto_celular  := nullif(regexp_replace(coalesce(new.contacto_celular,''), '[^0-9]', '', 'g'), '');
    new.contacto_correo   := nullif(lower(trim(new.contacto_correo)), '');
  else
    new.customer_id := upper(trim(new.customer_id));
    new.ruc := null; new.razon_social := null;
    new.contacto_nombre := null; new.contacto_celular := null; new.contacto_correo := null;
  end if;

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
--  La bitácora también sigue estos campos
-- ---------------------------------------------------------------------------
create or replace function public.fn_auditar_cliente()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare v_det jsonb := '{}'::jsonb; v_campos text[] := array[
  'nombre_comercio','rubro','distrito','direccion','estado','resultado_gestion',
  'razon_social','contacto_nombre','contacto_celular','contacto_correo','observacion'];
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
