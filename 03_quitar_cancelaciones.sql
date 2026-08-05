-- ===========================================================================
--  Retiro del módulo de cancelaciones y del control de entrega de POS
--  La campaña ya no mide ese indicador, así que las columnas salen de la base.
-- ===========================================================================

-- 1 · El trigger deja de calcular plazos
create or replace function public.fn_reglas_interaccion()
returns trigger language plpgsql as $fn$
declare
  v_presencial boolean;
  v_virtual    boolean;
begin
  if tg_op = 'UPDATE' then
    new.customer_id          := old.customer_id;
    new.correo_stratis       := old.correo_stratis;
    new.ejecutivo            := old.ejecutivo;
    new.fecha_contacto       := old.fecha_contacto;
    new.hora_contacto        := old.hora_contacto;
    new.tipo_contacto        := old.tipo_contacto;
    new.resultado            := old.resultado;
    new.ubicacion            := old.ubicacion;
    new.ubicacion_verificada := old.ubicacion_verificada;
    new.evidencia_path       := old.evidencia_path;
    new.creado_en            := old.creado_en;
  end if;

  v_presencial := new.tipo_contacto in ('visita_presencial','reunion_presencial');
  v_virtual    := new.tipo_contacto in ('reunion_virtual','videollamada');

  new.visita_presencial := case when v_presencial then 'SI' else 'No' end;
  new.visita_virtual    := case when v_virtual    then 'SI' else 'No' end;
  new.cumple_visita     := case when (v_presencial or v_virtual)
                                 and new.resultado = 'efectivo' then 'SI' else 'No' end;
  new.fecha_visita_actualizada :=
    case when new.cumple_visita = 'SI' then new.fecha_contacto else null end;

  if tg_op = 'INSERT' and auth.role() = 'authenticated' then
    new.correo_stratis := public.correo_actual();
  end if;

  new.modificado_en := now();
  return new;
end $fn$;

-- 2 · Fuera las vistas que dependen de esas columnas
drop view if exists public.v_base          cascade;
drop view if exists public.v_cancelaciones cascade;

-- 3 · Fuera las restricciones y el índice
alter table public.interacciones drop constraint if exists ck_cancelacion_con_motivo;
alter table public.interacciones drop constraint if exists ck_entrega_con_fecha;
drop index if exists public.ix_inter_tipo;

-- 4 · Fuera las columnas
alter table public.interacciones
  drop column if exists tipo,
  drop column if exists motivo_cancelacion,
  drop column if exists cancelara_pos,
  drop column if exists fecha_limite_pos,
  drop column if exists pos_entregado,
  drop column if exists fecha_entrega_pos,
  drop column if exists hora_entrega_pos,
  drop column if exists entrego_pos_72hrs;

drop type if exists public.tipo_interaccion;

-- 5 · La aritmética de días hábiles ya no tiene uso
drop function if exists public.sumar_dias_habiles(timestamp, int);
drop function if exists public.es_dia_habil(date);
drop table if exists public.feriados cascade;
delete from public.config
 where clave in ('horas_utiles_pos','horas_utiles_por_dia','alerta_por_vencer_h');

-- 6 · La vista de base, sin cancelaciones
create view public.v_base with (security_invoker = on) as
select c.customer_id,
       r.nombre as rubro,
       coalesce(c.rubro_otro, r.nombre) as rubro_detalle,
       c.nombre_comercio, c.distrito, c.direccion, c.estado,
       c.asignado as ejecutivo, c.asignado_correo,
       (select count(*) from public.interacciones i where i.customer_id = c.customer_id) as intentos,
       (select count(*) from public.interacciones i
         where i.customer_id = c.customer_id and i.resultado = 'efectivo') as efectivos,
       (select count(*) from public.interacciones i
         where i.customer_id = c.customer_id and i.cumple_visita = 'SI') as visitas_validas,
       (select max(i.fecha_contacto) from public.interacciones i
         where i.customer_id = c.customer_id) as ultimo_contacto,
       c.creado_en
  from public.clientes c
  join public.rubros r on r.codigo = c.rubro;
