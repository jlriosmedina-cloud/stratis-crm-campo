-- ===========================================================================
--  Corregir un Customer ID mal tipeado
--
--  El customer_id es la llave con la que se cruza contra la cartera del banco.
--  Si se registra con un dedazo, el comercio no le pega a nada: no es un dato
--  cosmético, es la identidad del registro. Hasta ahora no había forma de
--  arreglarlo sin borrar el comercio —y con él sus gestiones y su evidencia—
--  y volver a empezar.
--
--  Se abre una puerta, una sola, y estrecha:
--    · la usan el Analista y el Manager, no el ejecutivo que cometió el error;
--    · el ID nuevo tiene que estar libre;
--    · el comercio y sus gestiones se mueven juntos, en una transacción;
--    · queda en la bitácora quién lo corrigió, de qué a qué y qué arrastró.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1 · Las gestiones tienen que poder seguir a su comercio
--     El borrado ya arrastraba en cascada; el renombrado no, y por eso la
--     llave era intocable.
-- ---------------------------------------------------------------------------
alter table public.interacciones
  drop constraint if exists interacciones_customer_id_fkey;

alter table public.interacciones
  add constraint interacciones_customer_id_fkey
  foreign key (customer_id) references public.clientes(customer_id)
  on delete cascade on update cascade;

-- ---------------------------------------------------------------------------
-- 2 · La corrección
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
  if v_correo is null then
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

  -- El comercio se mueve y la cascada lleva sus gestiones con él.
  update public.clientes set customer_id = v_nuevo where customer_id = v_actual;

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

comment on function public.corregir_customer_id is
  'Corrige un Customer ID mal tipeado. Solo Analista o Manager; el ID nuevo debe estar libre; las gestiones viajan con el comercio y la correccion queda en la bitacora.';
