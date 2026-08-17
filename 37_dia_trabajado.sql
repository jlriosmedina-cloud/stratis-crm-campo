-- ===========================================================================
--  Qué cuenta como «día trabajado»
--
--  El requisito acordado es que la gestión se registre el mismo día trabajado
--  o, como máximo, el siguiente día trabajado. La primera versión del cálculo
--  solo saltaba el domingo, así que el sábado contaba como día de trabajo: una
--  gestión del viernes registrada el lunes salía con dos días de demora y caía
--  como fuera de plazo, cuando el lunes ES el siguiente día trabajado.
--
--  El efecto no era teórico. Con los datos del 17 de agosto:
--
--      alfredo.arrascue     56 gestiones     89%  →  91%
--      anibal.reyes         37 gestiones     32%  →  65%
--      emelin.perez        111 gestiones     50%  →  72%
--      juan.torres         182 gestiones     95%  →  96%
--
--  Dos ejecutivos estaban perdiendo el requisito de puntualidad —y con él la
--  llave del incentivo— por una regla que nadie había acordado.
--
--  Los feriados tampoco contaban. Van acá y no en el código porque el
--  calendario cambia de un año a otro, porque una empresa puede tener sus
--  propios días libres, y sobre todo porque viajan con la versión de
--  parámetros: corregir el calendario en noviembre no reescribe la
--  puntualidad de agosto, que es lo que hace auditable un cálculo de pago.
--
--  Calendario 2026 de julio a diciembre, feriados nacionales del Perú. El 23
--  de julio (Día de la Fuerza Aérea) conviene confirmarlo con RH: aparece en
--  el calendario publicado, y como es editable se corrige en un campo.
-- ===========================================================================

do $$
declare
  v_ver text; n int;
  v_fer jsonb := '["2026-07-23","2026-07-28","2026-07-29","2026-08-06","2026-08-30",
                   "2026-10-08","2026-11-01","2026-12-08","2026-12-09","2026-12-25"]'::jsonb;
begin
  for v_ver in select vigente_desde from public.bono_parametros
               where not (valor ? 'feriados') order by vigente_desde loop
    update public.bono_parametros
       set valor = jsonb_set(valor, '{feriados}', v_fer),
           nota  = coalesce(nullif(nota, ''), 'Modelo del documento de incentivos')
                   || ' · calendario de feriados'
     where vigente_desde = v_ver;
    raise notice 'calendario escrito en la versión %', v_ver;
  end loop;

  select count(*) into n from public.bono_parametros where not (valor ? 'feriados');
  if n > 0 then
    raise exception '% versiones quedaron sin calendario', n;
  end if;

  -- Las fechas tienen que ser fechas. Una mal escrita no rompe nada visible:
  -- simplemente deja de saltarse ese día, y eso se descubriría el día del pago.
  select count(*) into n from public.bono_parametros b,
       lateral jsonb_array_elements_text(b.valor->'feriados') f
   where f !~ '^\d{4}-\d{2}-\d{2}$';
  if n > 0 then
    raise exception '% fechas del calendario no tienen forma de fecha', n;
  end if;

  raise notice 'calendario verificado en todas las versiones';
end $$;
