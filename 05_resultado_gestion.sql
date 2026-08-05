-- ===========================================================================
--  Resultado de la gestión por comercio
--  Alimenta la columna "Gestión" del archivo de BBVA: SI cuando el objetivo
--  se cumplió (retención o venta), NO mientras siga pendiente o se haya
--  perdido. Es el único dato del formato del banco que la campaña no tenía.
-- ===========================================================================

alter table public.clientes
  add column if not exists resultado_gestion text not null default 'PENDIENTE';

alter table public.clientes drop constraint if exists ck_resultado_gestion;
alter table public.clientes add constraint ck_resultado_gestion check (
  resultado_gestion in ('PENDIENTE','RETENIDO','VENTA','PERDIDO'));

comment on column public.clientes.resultado_gestion is
  'Cierre de la gestión: PENDIENTE mientras se trabaja, RETENIDO o VENTA si se logró el objetivo, PERDIDO si el comercio se fue. Para BBVA, Gestión = SI cuando es RETENIDO o VENTA.';

-- Queda en la bitácora, como el resto de los campos del comercio
create or replace function public.fn_auditar_cliente()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare v_det jsonb := '{}'::jsonb;
begin
  if tg_op = 'UPDATE' then
    if old.nombre_comercio is distinct from new.nombre_comercio then
      v_det := v_det || jsonb_build_object('Nombre del comercio', jsonb_build_object('antes', old.nombre_comercio, 'despues', new.nombre_comercio)); end if;
    if old.rubro is distinct from new.rubro then
      v_det := v_det || jsonb_build_object('Rubro', jsonb_build_object('antes', old.rubro, 'despues', new.rubro)); end if;
    if old.distrito is distinct from new.distrito then
      v_det := v_det || jsonb_build_object('Distrito', jsonb_build_object('antes', old.distrito, 'despues', new.distrito)); end if;
    if old.direccion is distinct from new.direccion then
      v_det := v_det || jsonb_build_object('Direccion', jsonb_build_object('antes', old.direccion, 'despues', new.direccion)); end if;
    if old.estado is distinct from new.estado then
      v_det := v_det || jsonb_build_object('Estado', jsonb_build_object('antes', old.estado, 'despues', new.estado)); end if;
    if old.resultado_gestion is distinct from new.resultado_gestion then
      v_det := v_det || jsonb_build_object('Resultado de la gestion', jsonb_build_object('antes', old.resultado_gestion, 'despues', new.resultado_gestion)); end if;
    if old.observacion is distinct from new.observacion then
      v_det := v_det || jsonb_build_object('Observacion', jsonb_build_object('antes', old.observacion, 'despues', new.observacion)); end if;
    if v_det = '{}'::jsonb then return new; end if;
  end if;
  insert into public.auditoria(tabla, accion, registro_id, customer_id, comercio, correo, ejecutivo, detalle)
  values ('clientes', case when tg_op='UPDATE' then 'editar' else 'eliminar' end,
          coalesce(old.customer_id, new.customer_id), coalesce(old.customer_id, new.customer_id),
          coalesce(old.nombre_comercio, new.nombre_comercio), public.correo_actual(),
          coalesce(old.asignado, new.asignado), v_det);
  return coalesce(new, old);
end $fn$;
