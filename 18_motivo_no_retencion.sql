-- ===========================================================================
--  Por qué se perdió
--
--  El archivo de la campaña dice cuánto se retuvo y cuánto se perdió, pero
--  nunca por qué. Sin eso no se distingue un problema de tasa de uno de
--  servicio, y no hay forma de armar una contraoferta: se sabe que el comercio
--  se fue, y nada más.
--
--  Es la única variable de la propuesta a BBVA que el CRM todavía no captura.
--  Se pide en el momento del cierre, que es cuando el ejecutivo lo tiene fresco,
--  y con lista cerrada: una lista abierta se llena de textos que después no se
--  pueden agrupar.
-- ===========================================================================

alter table public.clientes
  add column if not exists motivo_no_retencion text;

alter table public.clientes drop constraint if exists ck_motivo_no_retencion;
alter table public.clientes add constraint ck_motivo_no_retencion check (
  motivo_no_retencion is null or motivo_no_retencion in (
    'TASA','SERVICIO','COMPETENCIA','CERRO','NO_DECIDE','NO_CONTACTABLE','OTRO'));

comment on column public.clientes.motivo_no_retencion is
  'Por que no se retuvo. Lista cerrada, se pide al cerrar como Perdido.';

-- ---------------------------------------------------------------------------
--  Cerrar como perdido exige decir por qué
--
--  Solo se exige al momento de perderlo, no en cada edición posterior: los
--  comercios que ya estaban cerrados antes de que existiera esta columna
--  siguen guardándose sin problema.
-- ---------------------------------------------------------------------------
create or replace function public.fn_perdido_con_motivo()
returns trigger language plpgsql as $fn$
begin
  if new.resultado_gestion = 'PERDIDO'
     and (tg_op = 'INSERT' or old.resultado_gestion is distinct from 'PERDIDO')
     and coalesce(trim(new.motivo_no_retencion), '') = '' then
    raise exception 'Para cerrar como perdido hay que indicar por que no se retuvo.'
      using errcode = 'check_violation';
  end if;
  -- Si deja de estar perdido, el motivo ya no aplica.
  if new.resultado_gestion is distinct from 'PERDIDO' then
    new.motivo_no_retencion := null;
  end if;
  return new;
end $fn$;

drop trigger if exists tg_perdido_con_motivo on public.clientes;
create trigger tg_perdido_con_motivo
  before insert or update on public.clientes
  for each row execute function public.fn_perdido_con_motivo();

-- El campo se audita como cualquier otro cambio del comercio.
create or replace function public.fn_auditar_cliente()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare v_det jsonb := '{}'::jsonb; v_campos text[] := array[
  'nombre_comercio','rubro','distrito','direccion','estado','resultado_gestion',
  'razon_social','observacion','motivo_no_retencion'];
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
