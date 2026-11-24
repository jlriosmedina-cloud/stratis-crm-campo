-- Tipificaciones oficiales de BBVA en el catálogo de feedback (decisión de Jose, 01/11/2026: «son las que necesita BBVA, serán
-- las definitivas»). Fuente: el archivo de BBVA «Tipificaciones Mystratis.xlsx» (copia en el OneDrive de Stratis).
-- Medido el 01/11: sus 25 frases son idénticas, carácter por carácter, a las 25 de v2_feedback_tipos. No cambia ninguna frase:
-- cada una gana su motivo, submotivo y la acción que pide BBVA, para reportar por motivo sin tocar las visitas guardadas.
--
-- Qué hace: agrega motivo_bbva, submotivo_bbva y accion_bbva a v2_feedback_tipos y las llena. Comprueba al final que las 25
-- queden con motivo (si falta alguna, la migración falla y no se aplica nada).
-- Qué no hace: no toca v2_visitas, ni el registro, ni la validación del feedback o de «qué ofreciste» (siguen por rama),
-- ni el medidor. Para deshacer: alter table public.v2_feedback_tipos drop column motivo_bbva, drop column submotivo_bbva,
-- drop column accion_bbva;
-- Se aplica solo con el OK de Jose.

alter table public.v2_feedback_tipos
  add column if not exists motivo_bbva text,
  add column if not exists submotivo_bbva text,
  add column if not exists accion_bbva text;

update public.v2_feedback_tipos t set motivo_bbva = n.m, submotivo_bbva = n.s, accion_bbva = n.a
from (values
  ('Cobra con Yape o Plin para no pagar comisión', 'Mala venta - falta de necesidad', 'Prefiere exclusivamente otros medios de pago', 'Antes realizar una útlima recuperación y en todo caso de no ser efectiva generar la baja por teléfono'),
  ('Soporte no ayudó al comercio', 'Disconformidad con el servicio', 'Atención al cliente insatisfactoria', 'Confirmar solución. Si tiene problemas, derivar a la mesa para su atención.'),
  ('El cobro a través del POS tarda demasiado cuando existe alta demanda', 'Problema técnico', 'POS lento o falla de conexión', 'Generar avería para solución'),
  ('POS queda procesando el pago , se demora', 'Problema técnico', 'POS lento o falla de conexión', 'Generar avería para solución'),
  ('Pide una tasa más baja', 'Condiciones comerciales', 'Condiciones comerciales poco atractivas', 'Brindar información de campañas actuales ( si aplica ) y confirmar uso'),
  ('No necesitaba los POS', 'Mala venta - falta de necesidad', 'Negocio / rubro no requiere POS', 'Realizar intentos comerciales y campañas para comprometer al uso , en todo caso de no ser posible realicemos la baja por teléfono'),
  ('POS no tiene señal y no puedo cobrar', 'Problema técnico', 'POS lento o falla de conexión', 'Generar avería para solución'),
  ('Mala Señal en el POS', 'Problema técnico', 'POS lento o falla de conexión', 'Generar avería para solución'),
  ('Los abonos le llegan con demora', 'Liquidaciones / abonos', 'Problemas con liquidación de pagos', 'Si tiene problemas, derivar a la mesa para su atención.'),
  ('Solo acepta efectivo', 'Mala venta - falta de necesidad', 'No acepta pagos con tarjeta (solo efectivo / transferencia)', 'Realizar intentos comerciales y campañas para comprometer al uso , en todo caso de no ser posible realicemos la baja por teléfono'),
  ('POS problema con abonos', 'Liquidaciones / abonos', 'Problemas con liquidación de pagos', 'Si tiene problemas, derivar a la mesa para su atención.'),
  ('Le parece complicado usar el POS', 'Adopción / conocimiento', 'No sabe usar el POS', 'Programar capacitación, agendar sesión y enviar mail confirmando sesión'),
  ('Su funcionario de BBVA no responde', 'Disconformidad con el servicio', 'Atención al cliente insatisfactoria', 'Confirmar solución. Si tiene problemas, derivar a la mesa para su atención.'),
  ('No tiene contómetros o le quedan pocos', 'Barrera operativa del comercio', 'No tiene contómetro', 'Realizar solicitud de envío de contómetros'),
  ('POS no cuenta con la tarifa acordada', 'Mala venta - expectativa comercial incorrecta', 'Condiciones comerciales informadas incorrectamente', 'Informar sobre la nueva campaña y en todo caso derivar con su ejecutivo de BBVA'),
  ('No se encontraba la persona que tomaba decisiones', 'Contacto pendiente', 'Decisor ausente en visita', 'Realizar segunda visita acorde a agenda asegurando fecha y hora con compromiso'),
  ('Sin observaciones del comercio', 'Sin causa identificada', 'Sin observaciones registradas', 'Levantar información adicional para identificar el motivo de no uso del POS.'),
  ('Usa POS de otra marca', 'Preferencia por competencia', 'Utiliza POS de otro adquirente (marca adquirente)', 'Identificar el adquirente utilizado y consultar los motivos de preferencia por la competencia.'),
  ('POS rechaza los pagos con tarjeta', 'Problema técnico', 'POS rechaza pagos con tarjeta', 'Realizar diagnóstico técnico del POS, validar conectividad . Escalar a soporte técnico si corresponde.'),
  ('POS no enciende', 'Problema técnico', 'POS no enciende', 'Validar alimentación eléctrica, batería y funcionamiento del equipo. Gestionar soporte técnico o reemplazo si corresponde.'),
  ('Desconfía de la visita (duda que representemos a BBVA)', 'Validación de identidad', 'Desconfianza de representante en visita', 'Soporte ya cuenta con las credenciales de los ejecutivos en campo'),
  ('Le falta una función', 'Producto / funcionalidad', 'Identificar la funcionalidad faltante', 'Identificar la funcionalidad requerida, validar su disponibilidad y comunicar alternativas o gestionar el requerimiento.'),
  ('No pidió el POS', 'Mala venta - falta de necesidad', 'Negocio / rubro no requiere POS', '¿ Cuál fue la necesidad de adquirir el POS ? Protocolo de baja por teléfono'),
  ('Solicitó cambio de equipo', 'Problema técnico', 'Problemas técnicos previos', 'Confirmar solución. Si tiene problemas, derivar a la mesa para su atención.'),
  ('No sabe revisar sus ventas o abonos', 'Adopción / conocimiento', 'No sabe usar el POS', 'Programar capacitación, agendar sesión y enviar mail confirmando sesión')
) as n(texto, m, s, a)
where t.texto = n.texto;

do $$ begin
  if (select count(*) from public.v2_feedback_tipos where motivo_bbva is null) > 0 then
    raise exception 'Hay frases de feedback sin tipificación de BBVA: %', (select string_agg(texto, ' | ') from public.v2_feedback_tipos where motivo_bbva is null);
  end if;
end $$;
