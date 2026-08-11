-- ===========================================================================
--  Restaurante y cafetería dejan de ser el mismo rubro
--
--  «Restaurante / Cafetería» concentra 46 de los comercios de la campaña, casi
--  la mitad de la cartera registrada. Juntos no dicen nada: un restaurante y
--  una cafetería tienen ticket, horario y volumen distintos, y la conversación
--  con cada uno no se parece.
--
--  Los 46 que ya estaban quedan como «Restaurante», que es lo que la mayoría
--  es. No se adivina cuáles eran cafeterías —eso lo sabe quien los visitó—:
--  se reclasifican editando el comercio, uno por uno, cuando corresponda.
-- ===========================================================================

update public.rubros set nombre = 'Restaurante' where codigo = 'restaurante';

-- Se abre hueco en el orden para que «Cafetería» quede al lado de
-- «Restaurante» en la lista. El 99 es «Otro» y se queda al final.
update public.rubros set orden = orden + 1 where orden >= 3 and orden < 99;

insert into public.rubros (codigo, nombre, orden)
values ('cafeteria', 'Cafetería', 3)
on conflict (codigo) do update
  set nombre = excluded.nombre, orden = excluded.orden;
