-- ===========================================================================
--  Que la corrección del Customer ID no dependa solo del cascade
--
--  Jose intentó corregir 2811170 → 28511170 desde el CRM y le salió «las
--  gestiones no siguieron al comercio». Esa comprobación existe justamente
--  para no dejar gestiones huérfanas: si el arrastre no ocurre, la corrección
--  se cancela entera. Hizo bien su trabajo.
--
--  El problema es que hasta ahora la única forma de mover las gestiones era el
--  ON UPDATE CASCADE de la llave foránea, y si algo lo interfiere —cualquier
--  regla que corra en medio— no hay plan B: la corrección simplemente no se
--  puede hacer desde la aplicación.
--
--  Acá se agrega ese plan B: si después del cascade quedó alguna gestión con
--  el Customer ID viejo, se arrastran a mano con la misma marca de transacción
--  que autoriza el cambio. La comprobación final se mantiene igual de estricta
--  —si aun así quedara alguna, se cancela todo—, pero ahora avisa cuántas.
-- ===========================================================================

create or replace function public.corregir_customer_id(p_actual text, p_nuevo text)
returns text          -- se conserva el tipo original: la aplicación no lo lee
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_actual  text := trim(coalesce(p_actual, ''));
  v_nuevo   text := trim(coalesce(p_nuevo, ''));
  v_nombre  text;
  v_tipo    text;
  v_correo  text := public.correo_actual();
  v_n       int;
  v_quedan  int;
begin
  if not public.es_admin() then
    raise exception 'Solo el Analista y el Manager pueden corregir el Customer ID.'
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

  -- Plan B: si el cascade no las movio, se arrastran a mano. La marca sigue
  -- puesta, que es lo unico que autoriza tocarles la llave.
  select count(*) into v_quedan from public.interacciones where customer_id = v_actual;
  if v_quedan > 0 then
    update public.interacciones set customer_id = v_nuevo where customer_id = v_actual;
  end if;
  perform set_config('app.corrigiendo_customer_id', '', true);

  select count(*) into v_quedan from public.interacciones where customer_id = v_actual;
  if v_quedan > 0 then
    raise exception 'La correccion se cancelo: % de % gestiones no siguieron al comercio.',
      v_quedan, v_n using errcode = 'check_violation';
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

  return format('%s: %s -> %s, con %s gestion(es)', v_nombre, v_actual, v_nuevo, v_n);
end $fn$;

revoke all on function public.corregir_customer_id(text, text) from public, anon;
grant execute on function public.corregir_customer_id(text, text) to authenticated;

comment on function public.corregir_customer_id is
  'Corrige el Customer ID arrastrando gestiones y bitacora. Si el cascade no mueve las gestiones, las mueve explicitamente; si aun asi quedara alguna, cancela todo.';
