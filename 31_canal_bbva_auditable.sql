-- ===========================================================================
--  El canal de contacto con BBVA pasa a ser auditable
--
--  Al completar el canal de 72 comercios historicos salio a la luz un hueco:
--  el auditor de clientes vigila el nombre, el rubro, el distrito, la
--  direccion, el estado, el resultado, el motivo, la razon social, el RUC, el
--  asignado y la observacion... pero no el canal de contacto con BBVA. Ese
--  campo se agrego despues del auditor y nadie volvio a mirarlo, asi que
--  cambiarlo no dejaba rastro.
--
--  El canal dice por donde se coordino con el banco antes de dar de alta el
--  comercio: es un dato de gestion, y si alguien lo cambia tiene que quedar
--  escrito igual que cualquier otro cambio. Se agrega con la misma forma que
--  usa el resto de la bitacora —{campo: {antes, despues}}— y con la misma
--  etiqueta 'editar', para que el filtro de la pantalla lo cuente sin tocar
--  nada del CRM.
-- ===========================================================================

create or replace function public.fn_auditar_canal_bbva()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if coalesce(new.contacto_bbva, '') is distinct from coalesce(old.contacto_bbva, '') then
    insert into public.auditoria (tabla, accion, registro_id, customer_id, comercio,
                                  correo, ejecutivo, detalle)
    values ('clientes', 'editar', new.customer_id, new.customer_id, new.nombre_comercio,
            public.correo_actual(),
            coalesce((select coalesce(nombre_corto, nombre) from public.usuarios
                       where correo = public.correo_actual()), 'sistema'),
            jsonb_build_object('contacto_bbva', jsonb_build_object(
              'antes',   coalesce(old.contacto_bbva, '(sin dato)'),
              'despues', coalesce(new.contacto_bbva, '(sin dato)'))));
  end if;
  return new;
end $fn$;

-- El nombre lo pone detras de tg_auditar_cliente: el orden de los AFTER es
-- alfabetico, y asi los dos cambios de una misma edicion se leen en ese orden.
drop trigger if exists tg_auditar_z_canal on public.clientes;
create trigger tg_auditar_z_canal
  after update on public.clientes
  for each row execute function public.fn_auditar_canal_bbva();

comment on function public.fn_auditar_canal_bbva is
  'Deja en la bitacora cualquier cambio del canal de contacto con BBVA. El auditor original no lo cubria porque el campo se agrego despues.';

-- ---------------------------------------------------------------------------
--  Y la correccion masiva queda escrita, aunque haya ocurrido antes del trigger
--
--  Los 72 comercios se completaron minutos antes de que existiera el disparador
--  de arriba, asi que no dejaron rastro. Se anota una linea que explica que
--  paso, quien lo pidio y por que: una bitacora con un hueco de 72 filas no
--  sirve para lo que la bitacora existe.
-- ---------------------------------------------------------------------------
insert into public.auditoria (tabla, accion, registro_id, customer_id, comercio,
                              correo, ejecutivo, detalle)
select 'clientes', 'editar', null, null, null,
       'jose.rios@mystratis.com', 'Jose Rios',
       jsonb_build_object(
         '_nota', 'Se completo el canal de contacto con BBVA como CORREO en 72 comercios de '
               || 'cartera registrados antes de que el campo fuera obligatorio. Confirmado por '
               || 'Jose Rios. No se toco ninguno que ya tuviera canal declarado.',
         'contacto_bbva', jsonb_build_object('antes', '(sin dato)', 'despues', 'CORREO'))
where not exists (
  select 1 from public.auditoria
   where detalle->>'_nota' like 'Se completo el canal de contacto con BBVA%');
