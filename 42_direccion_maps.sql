-- =========================================================================
-- 42 · La dirección para el mapa, aparte de la dirección de BBVA
--
-- José, 09/09/2026: «sincerar las direcciones para que los ejecutivos puedan
-- encontrar la ruta en Google Maps o Waze».
--
-- La dirección que trae la base viene en formato SUNAT y se le entrega de
-- vuelta al banco tal cual, en la columna Direccion_Actual del archivo. NO se
-- toca. Lo que el ejecutivo corrige para llegar vive en dos columnas nuevas:
--
--   direccion_maps   la dirección como se buscaría en Maps o Waze
--   referencia_maps  lo que le dirías a alguien para que llegue
--
-- Las dos las edita el dueño del comercio o supervisión —la política de UPDATE
-- que ya existe lo permite— y quedan en la bitácora: el trigger de auditoría
-- tiene la lista de campos escrita a mano, así que hay que sumárselas o la
-- corrección pasaría sin dejar rastro.
-- =========================================================================

alter table public.clientes
  add column if not exists direccion_maps  text,
  add column if not exists referencia_maps text;

comment on column public.clientes.direccion_maps  is 'Dirección para Google Maps / Waze, corregida a mano. No reemplaza a direccion, que es la de BBVA.';
comment on column public.clientes.referencia_maps is 'Referencia para llegar, escrita por el ejecutivo.';

create or replace function public.fn_auditar_cliente()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_det jsonb := '{}'::jsonb; v_campos text[] := array[
  'nombre_comercio','rubro','distrito','direccion','estado','resultado_gestion',
  'razon_social','observacion','motivo_no_retencion',
  -- 42: la dirección para el mapa y su referencia también dejan rastro.
  'direccion_maps','referencia_maps'];
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
end $function$;
