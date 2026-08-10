-- ===========================================================================
--  Una gestión no se puede registrar antes de que ocurra
--
--  El formulario ya limitaba el calendario al día de hoy, pero ese tope es solo
--  del selector: escribiendo la fecha a mano el navegador la deja pasar, y la
--  base no la rechazaba. Así entraron dos gestiones fechadas 30 y 31 de agosto
--  registradas el 3 y el 5 de agosto. Como "Fecha_Ultima_Gestion" toma la fecha
--  más alta del comercio, esas dos filas se subieron a la primera posición y el
--  archivo del banco aparentaba una gestión que todavía no había ocurrido.
--
--  La regla: la fecha del contacto puede ser hoy o cualquier día anterior
--  —para registrar algo que se olvidó en su momento— y nunca posterior.
--
--  El "hoy" se calcula en hora de Lima, no en UTC: a las 8 de la noche en Lima
--  el servidor ya está en el día siguiente, y con current_date a secas el
--  ejecutivo del turno tarde vería rechazada una fecha que sí es válida.
-- ===========================================================================

create or replace function public.fn_fecha_no_futura()
returns trigger language plpgsql as $fn$
declare
  v_hoy date := (now() at time zone 'America/Lima')::date;
begin
  if new.fecha_contacto > v_hoy then
    raise exception 'La fecha del contacto (%) es posterior a hoy (%). Una gestión se registra el día que ocurrió o después, nunca antes. Si estás poniendo al día algo de días pasados, elige esa fecha; si te equivocaste de mes, corrígela.',
      to_char(new.fecha_contacto, 'DD/MM/YYYY'),
      to_char(v_hoy, 'DD/MM/YYYY')
      using errcode = 'check_violation';
  end if;
  return new;
end $fn$;

drop trigger if exists tg_fecha_no_futura on public.interacciones;
create trigger tg_fecha_no_futura
  before insert or update on public.interacciones
  for each row execute function public.fn_fecha_no_futura();

comment on function public.fn_fecha_no_futura is
  'La fecha del contacto puede ser hoy o anterior, nunca futura. Hoy se evalua en hora de Lima para no castigar al turno tarde.';

-- ---------------------------------------------------------------------------
--  Lo mismo para el cierre del comercio
--
--  cerrado_en lo sella el sistema con now(), así que hoy no puede venir del
--  futuro. Queda la regla igual por si algún día se permite fecharlo a mano:
--  el mes de cierre es lo que alimenta las metas, y un cierre adelantado
--  movería el avance de un mes que todavía no terminó.
-- ---------------------------------------------------------------------------

create or replace function public.fn_cierre_no_futuro()
returns trigger language plpgsql as $fn$
declare
  v_hoy date := (now() at time zone 'America/Lima')::date;
begin
  if new.cerrado_en is not null
     and (new.cerrado_en at time zone 'America/Lima')::date > v_hoy then
    raise exception 'La fecha de cierre (%) es posterior a hoy (%). Un comercio no se puede cerrar en una fecha que aún no llega.',
      to_char((new.cerrado_en at time zone 'America/Lima')::date, 'DD/MM/YYYY'),
      to_char(v_hoy, 'DD/MM/YYYY')
      using errcode = 'check_violation';
  end if;
  return new;
end $fn$;

drop trigger if exists tg_cierre_no_futuro on public.clientes;
create trigger tg_cierre_no_futuro
  before insert or update on public.clientes
  for each row execute function public.fn_cierre_no_futuro();

comment on function public.fn_cierre_no_futuro is
  'cerrado_en nunca puede quedar en el futuro: el mes de cierre alimenta las metas.';
