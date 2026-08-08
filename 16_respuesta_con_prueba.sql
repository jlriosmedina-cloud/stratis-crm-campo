-- ===========================================================================
--  Enviar no es que te respondan
--
--  "Contacto efectivo" nunca significó objetivo cumplido: significa que la
--  comunicación se concretó. Pero la palabra invitaba a leerlo al revés, y en
--  los medios asincrónicos —correo y WhatsApp— nada impedía marcarlo apenas se
--  mandaba el mensaje. En la base había tres gestiones marcadas así cuyo propio
--  comentario decía que no hubo respuesta.
--
--  El nombre ya cambió en la aplicación: "El cliente respondió". Acá va la
--  parte que no depende de la pantalla: en correo y WhatsApp, decir que el
--  cliente respondió obliga a escribir qué respondió. Si respondió, hay algo
--  que citar; si no hay nada que citar, no respondió.
--
--  En llamada, visita y reunión no se pide: ahí la respuesta se da en el acto
--  y el comentario del ejecutivo ya la describe.
-- ===========================================================================

create or replace function public.fn_respuesta_con_prueba()
returns trigger language plpgsql as $fn$
begin
  if new.resultado = 'efectivo'
     and new.tipo_contacto in ('correo','whatsapp')
     and coalesce(trim(new.comentario_cliente), '') = '' then
    raise exception 'Si el cliente respondió por % , escribe en "Lo que dijo el cliente" qué respondió. Mandar el mensaje sin respuesta se registra como "No respondió".',
      case new.tipo_contacto when 'correo' then 'correo' else 'WhatsApp' end
      using errcode = 'check_violation';
  end if;
  return new;
end $fn$;

drop trigger if exists tg_respuesta_con_prueba on public.interacciones;
create trigger tg_respuesta_con_prueba
  before insert or update on public.interacciones
  for each row execute function public.fn_respuesta_con_prueba();

comment on function public.fn_respuesta_con_prueba is
  'En correo y WhatsApp, marcar que el cliente respondio exige transcribir su respuesta. Evita contar un mensaje enviado como comunicacion lograda.';
