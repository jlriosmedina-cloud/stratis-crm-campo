-- ===========================================================================
--  Cómo se contactó al ejecutivo de BBVA
--
--  Un comercio de cartera no aparece solo: alguien de Stratis contactó al
--  ejecutivo de BBVA, este confirmó los datos del cliente, y recién ahí se
--  registra en el CRM. Ese contacto previo no se estaba guardando, así que no
--  había forma de medir por dónde llega la cartera ni de sostener que cada
--  comercio registrado nació de una coordinación real.
--
--  Desde ahora es obligatorio al dar de alta un comercio de cartera. No aplica
--  a las ventas nuevas: ahí no hay ejecutivo BBVA de por medio todavía, el
--  comercio lo trae Stratis.
--
--  Los comercios que ya estaban registrados quedan con el campo vacío. No se
--  los inventa: aparecen como «Sin indicar» en el Excel y con su alerta, para
--  que se completen cuando alguien los edite.
-- ===========================================================================

alter table public.clientes
  add column if not exists contacto_bbva text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ck_contacto_bbva') then
    alter table public.clientes
      add constraint ck_contacto_bbva
      check (contacto_bbva is null or contacto_bbva in ('CORREO','LLAMADA','WHATSAPP','VISITA','CHAT'));
  end if;
end $$;

comment on column public.clientes.contacto_bbva is
  'Como se contacto al ejecutivo de BBVA para confirmar los datos del comercio: CORREO, LLAMADA, WHATSAPP, VISITA (oficinas BBVA) o CHAT. Obligatorio en cartera, no aplica a ventas nuevas.';

-- ---------------------------------------------------------------------------
--  La regla
--
--  En el alta de un comercio de cartera es obligatorio. En una venta nueva se
--  fuerza a nulo: no hay ejecutivo BBVA todavía, y dejar el campo suelto ahí
--  ensuciaría la medición.
--
--  Al editar no se exige, porque hay muchos caminos que actualizan un comercio
--  sin pasar por el formulario —cerrar una gestión, corregir el Customer ID— y
--  los registros viejos no lo tienen. Lo que sí se impide es borrarlo una vez
--  puesto: se puede cambiar de canal, nunca dejarlo en blanco.
-- ---------------------------------------------------------------------------
create or replace function public.fn_contacto_bbva()
returns trigger language plpgsql as $fn$
begin
  new.contacto_bbva := nullif(upper(trim(coalesce(new.contacto_bbva, ''))), '');

  if coalesce(new.tipo_registro, 'CARTERA') = 'NUEVO' then
    new.contacto_bbva := null;
    return new;
  end if;

  if tg_op = 'INSERT' and new.contacto_bbva is null then
    raise exception 'Indica cómo se contactó al ejecutivo de BBVA para confirmar los datos de este comercio: correo, llamada, WhatsApp, visita a sus oficinas o chat del banco.'
      using errcode = 'check_violation';
  end if;

  if tg_op = 'UPDATE' and new.contacto_bbva is null then
    new.contacto_bbva := old.contacto_bbva;   -- no se borra lo que ya estaba
  end if;

  return new;
end $fn$;

drop trigger if exists tg_contacto_bbva on public.clientes;
create trigger tg_contacto_bbva
  before insert or update on public.clientes
  for each row execute function public.fn_contacto_bbva();

comment on function public.fn_contacto_bbva is
  'Obliga a declarar el canal con el ejecutivo BBVA al dar de alta un comercio de cartera; lo anula en ventas nuevas y no permite borrarlo una vez puesto.';
