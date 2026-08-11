-- ===========================================================================
--  Qué sigue con este comercio
--
--  El CRM registraba bien lo que pasó, pero no lo que quedó pendiente. Si en
--  una visita el dueño dice «vuelve el lunes con el tarifario», eso vivía en
--  el comentario y en la memoria del ejecutivo: nadie podía ver cuántos
--  compromisos tiene el equipo, cuáles vencieron y cuáles nadie retomó.
--
--  El catálogo de acciones no está clavado en el código: vive en una tabla que
--  el Analista y el Manager mantienen desde Ajustes. Cuando la campaña cambie
--  —y va a cambiar—, se agrega o se renombra una acción sin tocar el sistema,
--  y todos los ejecutivos la ven al instante. Las que dejan de usarse se
--  desactivan en vez de borrarse, para no romper el historial.
--
--  Una gestión que no cierra el comercio deja una próxima acción con fecha.
--  Un comercio tiene como mucho UNA acción abierta —la siguiente—: si hubiera
--  varias, ninguna sería la siguiente. Al registrar una gestión nueva sobre
--  ese comercio, la acción pendiente se da por cumplida sola: ya se actuó.
-- ===========================================================================

-- ---------------------------------------------------------------------------
--  El catálogo, editable desde el CRM
-- ---------------------------------------------------------------------------
create table if not exists public.acciones_seguimiento (
  codigo      text primary key,
  nombre      text not null,
  descripcion text,
  orden       int  not null default 50,
  activo      boolean not null default true
);

insert into public.acciones_seguimiento (codigo, nombre, descripcion, orden) values
  ('VISITAR',   'Volver a visitar',          'Hay que regresar al local',                        1),
  ('LLAMAR',    'Llamar',                    'Retomar por teléfono en la fecha acordada',        2),
  ('PROPUESTA', 'Enviar propuesta o tarifario','El cliente pidió condiciones por escrito',       3),
  ('ESPERAR',   'Esperar respuesta del cliente','Quedó en avisar él; hay que darle seguimiento', 4),
  ('ESCALAR',   'Escalar a BBVA',            'Necesita una definición del banco',                5),
  ('CERRAR',    'Cerrar como perdido',       'Ya no hay nada que hacer, falta formalizarlo',     6)
on conflict (codigo) do nothing;

alter table public.acciones_seguimiento enable row level security;

drop policy if exists p_acc_select on public.acciones_seguimiento;
create policy p_acc_select on public.acciones_seguimiento for select
  using (public.es_usuario_activo());

drop policy if exists p_acc_write on public.acciones_seguimiento;
create policy p_acc_write on public.acciones_seguimiento for all
  using (public.es_admin()) with check (public.es_admin());

grant select on public.acciones_seguimiento to authenticated;
grant insert, update, delete on public.acciones_seguimiento to authenticated;

comment on table public.acciones_seguimiento is
  'Catalogo de proximas acciones, mantenido por Analista y Manager desde Ajustes. Se desactivan, no se borran.';

create table if not exists public.seguimientos (
  id             uuid primary key default gen_random_uuid(),
  customer_id    text not null references public.clientes(customer_id)
                   on update cascade on delete cascade,
  interaccion_id uuid references public.interacciones(id) on delete set null,
  accion         text not null references public.acciones_seguimiento(codigo) on update cascade,
  fecha_objetivo date not null,
  comentario     text,
  correo_stratis text not null,
  ejecutivo      text not null,
  creado_en      timestamptz not null default now(),
  cerrado_en     timestamptz,
  cerrado_por    text
);

-- La siguiente acción es una sola. Un comercio con tres «siguientes» no tiene
-- ninguna.
create unique index if not exists ux_seguimiento_abierto
  on public.seguimientos(customer_id) where cerrado_en is null;

create index if not exists ix_seguimiento_agenda
  on public.seguimientos(correo_stratis, fecha_objetivo) where cerrado_en is null;

comment on table public.seguimientos is
  'Proxima accion comprometida con cada comercio. Una abierta por comercio; se cierra sola al registrar la siguiente gestion.';

-- ---------------------------------------------------------------------------
--  Reglas
-- ---------------------------------------------------------------------------
create or replace function public.fn_reglas_seguimiento()
returns trigger language plpgsql as $fn$
begin
  if tg_op = 'INSERT' then
    -- El dueño es quien lo crea: no se agenda trabajo a nombre de otro.
    if auth.role() = 'authenticated' then
      new.correo_stratis := public.correo_actual();
      new.ejecutivo := coalesce(
        (select coalesce(nombre_corto, nombre) from public.usuarios
          where correo = new.correo_stratis), new.ejecutivo);
    end if;
    if new.fecha_objetivo < (now() at time zone 'America/Lima')::date then
      raise exception 'La fecha del compromiso no puede ser anterior a hoy.'
        using errcode = 'check_violation';
    end if;
    if new.fecha_objetivo > (now() at time zone 'America/Lima')::date + 120 then
      raise exception 'Esa fecha está a más de cuatro meses. Si el comercio no se trabaja antes, ciérralo o revisa la fecha.'
        using errcode = 'check_violation';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    new.customer_id    := old.customer_id;
    new.correo_stratis := old.correo_stratis;
    new.creado_en      := old.creado_en;
    if new.cerrado_en is not null and old.cerrado_en is null then
      new.cerrado_por := coalesce(new.cerrado_por, public.correo_actual());
    end if;
  end if;
  return new;
end $fn$;

drop trigger if exists tg_reglas_seguimiento on public.seguimientos;
create trigger tg_reglas_seguimiento
  before insert or update on public.seguimientos
  for each row execute function public.fn_reglas_seguimiento();

-- Al registrar una gestión nueva, lo pendiente de ese comercio se cumplió.
create or replace function public.fn_cerrar_seguimiento()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  update public.seguimientos
     set cerrado_en = now(), cerrado_por = new.correo_stratis
   where customer_id = new.customer_id
     and cerrado_en is null
     and (interaccion_id is null or interaccion_id <> new.id);
  return new;
end $fn$;

drop trigger if exists tg_cerrar_seguimiento on public.interacciones;
create trigger tg_cerrar_seguimiento
  after insert on public.interacciones
  for each row execute function public.fn_cerrar_seguimiento();

comment on function public.fn_cerrar_seguimiento is
  'Al registrar una gestion, da por cumplida la accion pendiente de ese comercio: ya se actuo.';

-- Cerrar el comercio también cierra lo que quedaba pendiente.
create or replace function public.fn_cerrar_seguimiento_cliente()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if coalesce(new.resultado_gestion,'PENDIENTE') <> 'PENDIENTE'
     and coalesce(old.resultado_gestion,'PENDIENTE') = 'PENDIENTE' then
    update public.seguimientos
       set cerrado_en = now(), cerrado_por = public.correo_actual()
     where customer_id = new.customer_id and cerrado_en is null;
  end if;
  return new;
end $fn$;

drop trigger if exists tg_cerrar_seguimiento_cliente on public.clientes;
create trigger tg_cerrar_seguimiento_cliente
  after update on public.clientes
  for each row execute function public.fn_cerrar_seguimiento_cliente();

-- ---------------------------------------------------------------------------
--  Quién ve qué: el ejecutivo lo suyo, supervisión todo.
-- ---------------------------------------------------------------------------
alter table public.seguimientos enable row level security;

drop policy if exists p_seg_select on public.seguimientos;
create policy p_seg_select on public.seguimientos for select
  using (public.es_usuario_activo()
         and (public.es_admin() or correo_stratis = public.correo_actual()));

drop policy if exists p_seg_insert on public.seguimientos;
create policy p_seg_insert on public.seguimientos for insert
  with check (public.es_ejecutivo() and correo_stratis = public.correo_actual());

drop policy if exists p_seg_update on public.seguimientos;
create policy p_seg_update on public.seguimientos for update
  using (public.es_usuario_activo()
         and (public.es_admin() or correo_stratis = public.correo_actual()));

drop policy if exists p_seg_delete on public.seguimientos;
create policy p_seg_delete on public.seguimientos for delete
  using (public.es_usuario_activo() and correo_stratis = public.correo_actual());

grant select, insert, update, delete on public.seguimientos to authenticated;
