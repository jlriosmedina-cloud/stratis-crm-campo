-- ===========================================================================
--  Viáticos: comprobantes de gasto y monto por visita presencial
--  Sirve para validar los gastos que el ejecutivo hace en campo.
-- ===========================================================================

alter table public.interacciones
  add column if not exists gasto_total  numeric(10,2),
  add column if not exists gastos_paths text[] not null default '{}';

-- Solo las visitas y reuniones presenciales generan viáticos.
alter table public.interacciones drop constraint if exists ck_gasto_presencial;
alter table public.interacciones add constraint ck_gasto_presencial check (
  (coalesce(gasto_total,0) = 0 and coalesce(array_length(gastos_paths,1),0) = 0)
  or tipo_contacto in ('visita_presencial','reunion_presencial'));

-- No se declara un monto sin respaldo: si hay gasto, hay comprobante.
alter table public.interacciones drop constraint if exists ck_gasto_con_comprobante;
alter table public.interacciones add constraint ck_gasto_con_comprobante check (
  coalesce(gasto_total,0) = 0 or coalesce(array_length(gastos_paths,1),0) > 0);

-- Y no se aceptan montos negativos ni absurdos.
alter table public.interacciones drop constraint if exists ck_gasto_rango;
alter table public.interacciones add constraint ck_gasto_rango check (
  gasto_total is null or (gasto_total >= 0 and gasto_total <= 2000));

comment on column public.interacciones.gasto_total is
  'Monto total gastado en la visita, en soles. Requiere comprobante adjunto.';
comment on column public.interacciones.gastos_paths is
  'Rutas de las boletas y comprobantes en el bucket privado de evidencias.';

-- El monto y los comprobantes SÍ se pueden corregir después (a diferencia del
-- medio, el resultado o la ubicación), pero cada cambio queda en la bitácora.
create or replace function public.fn_auditar_interaccion()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare v_det jsonb := '{}'::jsonb; v_com text; v_cid text;
begin
  v_cid := coalesce(old.customer_id, new.customer_id);
  select nombre_comercio into v_com from public.clientes where customer_id = v_cid;
  if tg_op = 'UPDATE' then
    if old.comentario_ejecutivo is distinct from new.comentario_ejecutivo then
      v_det := v_det || jsonb_build_object('Comentario del ejecutivo',
        jsonb_build_object('antes', old.comentario_ejecutivo, 'despues', new.comentario_ejecutivo)); end if;
    if old.comentario_cliente is distinct from new.comentario_cliente then
      v_det := v_det || jsonb_build_object('Comentario del cliente',
        jsonb_build_object('antes', old.comentario_cliente, 'despues', new.comentario_cliente)); end if;
    if old.calificacion is distinct from new.calificacion then
      v_det := v_det || jsonb_build_object('Calificacion',
        jsonb_build_object('antes', old.calificacion, 'despues', new.calificacion)); end if;
    if old.gasto_total is distinct from new.gasto_total then
      v_det := v_det || jsonb_build_object('Monto de viáticos',
        jsonb_build_object('antes', old.gasto_total, 'despues', new.gasto_total)); end if;
    if old.gastos_paths is distinct from new.gastos_paths then
      v_det := v_det || jsonb_build_object('Comprobantes',
        jsonb_build_object('antes', coalesce(array_length(old.gastos_paths,1),0),
                           'despues', coalesce(array_length(new.gastos_paths,1),0))); end if;
    if v_det = '{}'::jsonb then return new; end if;
  end if;
  insert into public.auditoria(tabla, accion, registro_id, customer_id, comercio, correo, ejecutivo, detalle)
  values ('interacciones', case when tg_op='UPDATE' then 'editar' else 'eliminar' end,
          coalesce(old.id::text, new.id::text), v_cid, v_com, public.correo_actual(),
          coalesce(old.ejecutivo, new.ejecutivo), v_det);
  return coalesce(new, old);
end $fn$;

-- Resumen de viáticos por ejecutivo
drop view if exists public.v_viaticos cascade;
create view public.v_viaticos with (security_invoker = on) as
select i.correo_stratis, i.ejecutivo,
       date_trunc('month', i.fecha_contacto)::date as mes,
       count(*) filter (where coalesce(i.gasto_total,0) > 0) as visitas_con_gasto,
       coalesce(sum(i.gasto_total), 0) as total,
       coalesce(sum(coalesce(array_length(i.gastos_paths,1),0)), 0) as comprobantes
  from public.interacciones i
 group by 1,2,3;
