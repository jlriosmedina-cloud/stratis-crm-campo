-- Meta de visitas del periodo 2026-11: 225 por ejecutivo (la base nueva completa), solo con la base nueva; la base anterior va aparte.
-- Decisión de Jose del 21/10 («conforme con las recomendaciones, procede»). La meta de reactivados sigue en 40.
-- Solo cambia el dato del periodo 2026-11. Aplicada el 21/10/2026 con el OK de Jose.
update public.v2_parametros
   set meta_visitas = 225,
       notas = concat_ws(' · ', notas, 'Base 2026-11 en bloques (21/10/2026): meta de visitas 225 por ejecutivo, solo con la base nueva; la base anterior va aparte. Decisión de Jose.')
 where periodo = '2026-11' and meta_visitas <> 225;
