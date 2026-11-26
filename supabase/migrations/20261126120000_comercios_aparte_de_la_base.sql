-- Comercios «aparte» de la base de un periodo (26/11/2026). Decisión de Jose: en el P5 la base final es el archivo de 460 (115 por ejecutivo);
-- los comercios que sobraban y ya tenían visita se quedan asignados (el celular y el avance del ejecutivo no cambian), pero el escritorio
-- los muestra aparte: no suman a la cartera, a la meta ni a la Base para BBVA, y cuentan como comercios menos del complemento de los 900 leads.
-- Esta migración solo crea la estructura y NO trae ningún comercio (el repositorio es público): Jose carga los ids por SQL.
-- No toca v2_asignaciones, v2_mi_base, v2_avance ni el celular. Nadie lee la tabla directo (RLS activada y SIN políticas); solo la función de
-- abajo (security definer) y solo para el analista del escritorio. Va con el escritorio; se aplica solo con el OK de Jose.

create table if not exists public.v2_asignaciones_aparte (
  periodo text not null references public.v2_periodos(id),
  customer_id text not null,
  correo text,
  motivo text,
  creado_por text not null default 'sistema',
  creado_en timestamptz not null default now(),
  primary key (periodo, customer_id)
);
alter table public.v2_asignaciones_aparte enable row level security;
revoke all on table public.v2_asignaciones_aparte from public, anon;
revoke truncate, references, trigger on table public.v2_asignaciones_aparte from authenticated;
grant all on table public.v2_asignaciones_aparte to service_role;

CREATE OR REPLACE FUNCTION public.v2_apartes()
 RETURNS TABLE(periodo text, customer_id text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.v2_puede_escritorio() then raise exception 'Solo el analista ve los comercios aparte de la base.'; end if;
  return query select a.periodo, a.customer_id from v2_asignaciones_aparte a order by a.periodo, a.customer_id;
end $function$;
