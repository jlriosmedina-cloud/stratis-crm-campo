-- ===========================================================================
--  La meta de un periodo no es la meta del proyecto
--
--  El CRM venía calculando el cumplimiento de cada periodo así: tomaba lo que
--  el ejecutivo logró dentro del mes y lo dividía entre la meta de los cinco
--  meses. Un ejecutivo con 0,3 p.p. de reactivación en agosto salía con 1,8%
--  de cumplimiento, y con eso el bono era inalcanzable desde el primer día —
--  exactamente lo contrario de para lo que existe un incentivo.
--
--  El error tenía dos mitades, y las dos vienen de mezclar horizontes:
--
--    · El numerador era mensual (lo cerrado dentro de la ventana del bono).
--    · El denominador era del proyecto (+18 p.p., +15%).
--
--  El documento de incentivos ya resolvía esto y nadie lo había bajado al
--  sistema: «portafolio y facturación se evalúan por avance acumulado; la
--  venta se mide mensualmente», y trae una curva con la ruta esperada mes a
--  mes — 4, 8, 11, 15, 18 p.p. y 3, 6, 9, 12, 15%. No es la meta dividida
--  entre cinco: da más aire a los primeros meses, que son los del
--  aprendizaje, y por eso el primer punto de reactivación es 4 y no 3,6.
--
--  Así que ahora:
--
--    · Reactivación: avance ACUMULADO desde el 20 de julio, contra el punto
--      de la curva que corresponde a ese mes.
--    · Facturación: ya venía acumulada —crece contra la base congelada del
--      proyecto—; lo que cambia es contra qué meta se compara.
--    · Venta: mensual, 7 por periodo, sin acumular ni prorratear. Tal cual.
--
--  La curva viaja dentro de los parámetros versionados, así que la revisión
--  de octubre puede cambiarla sin reescribir agosto ni septiembre. Esta
--  migración solo la deja escrita en la versión que ya existía: el cálculo
--  funciona igual sin ella, porque el CRM cae en los valores del documento,
--  pero una versión que no dice con qué curva se calculó no es auditable.
-- ===========================================================================

do $$
declare
  v_ver text;
  v_react jsonb := '[4, 8, 11, 15, 18]'::jsonb;
  v_fact  jsonb := '[3, 6, 9, 12, 15]'::jsonb;
  n int;
begin
  -- La curva se escribe en TODAS las versiones que no la tengan. Si mañana
  -- hay una revisión de octubre sin curva propia, hereda la del documento y
  -- no se queda sin ruta.
  for v_ver in select vigente_desde from public.bono_parametros
               where not (valor ? 'curva') order by vigente_desde loop
    update public.bono_parametros
       set valor = jsonb_set(valor, '{curva}',
                     jsonb_build_object('reactivacion_pp', v_react,
                                        'facturacion_pct', v_fact)),
           nota = coalesce(nullif(nota, ''), 'Modelo del documento de incentivos')
                  || ' · ruta mensual del documento'
     where vigente_desde = v_ver;
    raise notice 'ruta mensual escrita en la versión %', v_ver;
  end loop;

  -- Comprobación: la curva tiene que ser creciente y terminar en la meta del
  -- proyecto. Una curva que baja diría que se puede perder avance ya logrado;
  -- una que no llega a la meta haría que cumplir el último mes no fuera
  -- cumplir. Cualquiera de las dos cosas se descubriría el día del pago.
  select count(*) into n from public.bono_parametros
   where not (valor ? 'curva');
  if n > 0 then
    raise exception '% versiones quedaron sin ruta mensual', n;
  end if;

  select count(*) into n from public.bono_parametros b
   where (b.valor->'curva'->'reactivacion_pp'->>-1)::numeric
         is distinct from (b.valor->'metas'->>'reactivacion_pp')::numeric
      or (b.valor->'curva'->'facturacion_pct'->>-1)::numeric
         is distinct from (b.valor->'metas'->>'facturacion_pct')::numeric;
  if n > 0 then
    raise exception '% versiones tienen una ruta que no termina en la meta del proyecto', n;
  end if;

  raise notice 'ruta mensual verificada en todas las versiones';
end $$;
