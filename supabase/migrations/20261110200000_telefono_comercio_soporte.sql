-- Nueva tipificación de feedback (10/11/2026, pedido de Jose): «Teléfono del comercio que se comunicó a soporte».
-- Va en la rama «Atención y soporte», junto a «Su funcionario de BBVA no responde» (misma rama y mismas acciones de
-- «Qué ofreciste»). La agrega Stratis (bbva = false): su motivo, submotivo y acción son una PROPUESTA de Stratis hasta que
-- BBVA confirme su tipificación oficial. Si BBVA la clasifica distinto, basta un update sobre las tres columnas *_bbva.
-- No toca v2_visitas, ni el registro, ni el medidor. Para deshacer: delete from public.v2_feedback_tipos where texto = 'Teléfono del comercio que se comunicó a soporte';
-- Se aplica solo con el OK de Jose, el mismo día en que se publican el celular y el escritorio con la frase nueva.

insert into public.v2_feedback_tipos(texto, grupo, orden, bbva, motivo_bbva, submotivo_bbva, accion_bbva)
select 'Teléfono del comercio que se comunicó a soporte', t.grupo, (select coalesce(max(orden), 0) from public.v2_feedback_tipos) + 1, false,
       'Problema técnico', 'Comercio se comunicó a soporte',
       'Registrar el teléfono con el que el comercio se comunicó a soporte y confirmar con Soporte que el caso fue atendido.'
  from public.v2_feedback_tipos t
 where t.texto = 'Su funcionario de BBVA no responde'
   and not exists (select 1 from public.v2_feedback_tipos x where x.texto = 'Teléfono del comercio que se comunicó a soporte');

-- Si no entró (por ejemplo, porque su hermana no existe), la migración se cae: sin esto, corregir una visita con esta
-- frase fallaría con «no está en la lista».
do $$
begin
  if (select count(*) from public.v2_feedback_tipos where texto = 'Teléfono del comercio que se comunicó a soporte' and motivo_bbva is not null) <> 1 then
    raise exception 'No entró la frase nueva de feedback: revisa que exista «Su funcionario de BBVA no responde» en v2_feedback_tipos.';
  end if;
end $$;
