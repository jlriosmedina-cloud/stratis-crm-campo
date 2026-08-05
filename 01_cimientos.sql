-- ===========================================================================
--  CRM Stratis · Campaña BBVA Adquirencia — cimientos (v3)
--  Zona horaria, configuración, feriados, equipo y bucket de evidencias.
--  Se ejecuta ANTES del esquema v3.
-- ===========================================================================
-- ---------------------------------------------------------------------------
-- 0 · Zona horaria: todo el proyecto opera en hora de Lima
-- ---------------------------------------------------------------------------
do $tz$ begin
  execute format('alter database %I set timezone to %L', current_database(), 'America/Lima');
exception when insufficient_privilege then
  raise notice 'Sin permiso para fijar la zona horaria de la base; se aplica por sesion.';
end $tz$;
set timezone to 'America/Lima';

-- Hora actual de Lima, sin zona. Usar en vez de now() para comparar plazos.
create or replace function public.ahora_lima()
returns timestamp language sql stable as $$
  select (now() at time zone 'America/Lima')::timestamp
$$;

-- ---------------------------------------------------------------------------
-- 0.1 · Configuracion editable
-- ---------------------------------------------------------------------------
create table if not exists public.config (
  clave  text primary key,
  valor  text not null,
  nota   text
);

insert into public.config (clave, valor, nota) values
  ('dominio_permitido',   'mystratis.com', 'Solo correos de este dominio pueden entrar'),
  ('horas_utiles_pos',    '72',            'Plazo para retirar el POS tras la cancelación'),
  ('horas_utiles_por_dia','24',            '24 => 72 horas útiles equivalen a 3 días hábiles'),
  ('alerta_por_vencer_h', '24',            'A cuántas horas del vencimiento se marca "Por vencer"'),
  ('cumple_visita_historico','true',       'true: la Base marca SI si alguna vez hubo visita válida'),
  ('zona_horaria',        'America/Lima',  'Zona horaria de toda la operación')
on conflict (clave) do nothing;

create or replace function public.cfg(p_clave text)
returns text language sql stable as $$
  select valor from public.config where clave = p_clave
$$;

-- ---------------------------------------------------------------------------
-- 1 · Feriados del Perú (para contar horas útiles)
-- ---------------------------------------------------------------------------
create table if not exists public.feriados (
  fecha       date primary key,
  descripcion text
);

insert into public.feriados (fecha, descripcion) values
  ('2026-01-01','Año Nuevo'),                  ('2026-04-02','Jueves Santo'),
  ('2026-04-03','Viernes Santo'),              ('2026-05-01','Día del Trabajo'),
  ('2026-06-07','Batalla de Arica'),           ('2026-06-29','San Pedro y San Pablo'),
  ('2026-07-23','Día de la FAP'),              ('2026-07-28','Fiestas Patrias'),
  ('2026-07-29','Fiestas Patrias'),            ('2026-08-06','Batalla de Junín'),
  ('2026-08-30','Santa Rosa de Lima'),         ('2026-10-08','Combate de Angamos'),
  ('2026-11-01','Todos los Santos'),           ('2026-12-08','Inmaculada Concepción'),
  ('2026-12-09','Batalla de Ayacucho'),        ('2026-12-25','Navidad'),
  ('2027-01-01','Año Nuevo'),                  ('2027-03-25','Jueves Santo'),
  ('2027-03-26','Viernes Santo'),              ('2027-05-01','Día del Trabajo'),
  ('2027-06-29','San Pedro y San Pablo'),      ('2027-07-28','Fiestas Patrias'),
  ('2027-07-29','Fiestas Patrias')
on conflict (fecha) do nothing;

create or replace function public.es_dia_habil(p_fecha date)
returns boolean language sql stable as $$
  select extract(isodow from p_fecha) < 6
     and not exists (select 1 from public.feriados f where f.fecha = p_fecha)
$$;

-- Suma días hábiles saltando sábados, domingos y feriados.
create or replace function public.sumar_dias_habiles(p_desde timestamp, p_dias int)
returns timestamp language plpgsql stable as $$
declare v_fecha date := p_desde::date; v_faltan int := p_dias;
begin
  while v_faltan > 0 loop
    v_fecha := v_fecha + 1;
    if public.es_dia_habil(v_fecha) then v_faltan := v_faltan - 1; end if;
  end loop;
  while not public.es_dia_habil(v_fecha) loop v_fecha := v_fecha + 1; end loop;
  return v_fecha + p_desde::time;
end $$;

-- ---------------------------------------------------------------------------
-- 2 · Usuarios habilitados
-- ---------------------------------------------------------------------------
create table if not exists public.usuarios (
  correo        text primary key,
  nombre        text not null,               -- nombre completo, para reportes
  nombre_corto  text,                        -- tal como aparece en "Ejecutivo asignado"
  rol           text not null default 'Ejecutivo' check (rol in ('Ejecutivo','Analista','Manager')),
  activo        boolean not null default true,
  creado_en     timestamptz not null default now()
);
alter table public.usuarios add column if not exists nombre_corto text;

comment on table public.usuarios is
  'Lista blanca del CRM. Poner activo = false revoca el acceso al instante, sin tocar Supabase Auth.';

-- Correo del usuario de la sesión actual, siempre en minúsculas.
create or replace function public.correo_actual()
returns text language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

-- SECURITY DEFINER a propósito: evita recursión infinita al evaluar las
-- políticas de la propia tabla usuarios.
create or replace function public.es_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.usuarios
    where correo = public.correo_actual() and activo and rol in ('Analista','Manager')
  )
$$;

create or replace function public.es_usuario_activo()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.usuarios
    where correo = public.correo_actual() and activo
  )
$$;

-- ---------------------------------------------------------------------------
--  Políticas del equipo y bitácora
-- ---------------------------------------------------------------------------
alter table public.usuarios enable row level security;
alter table public.feriados enable row level security;
alter table public.config   enable row level security;

drop policy if exists p_usuarios_select on public.usuarios;
create policy p_usuarios_select on public.usuarios for select to authenticated
  using ( correo = public.correo_actual() or public.es_admin() );

drop policy if exists p_feriados_select on public.feriados;
create policy p_feriados_select on public.feriados for select to authenticated using (true);
drop policy if exists p_config_select on public.config;
create policy p_config_select on public.config for select to authenticated using (true);

-- Solo entra quien ya está en la lista del equipo. Sin esto, cualquiera con la
-- llave pública podría crearse una cuenta.
create or replace function public.fn_solo_equipo_stratis()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if not exists (select 1 from public.usuarios
                  where correo = lower(new.email) and activo) then
    raise exception 'Este correo no pertenece al equipo de la campaña.';
  end if;
  return new;
end $fn$;

drop trigger if exists tg_solo_equipo_stratis on auth.users;
create trigger tg_solo_equipo_stratis before insert on auth.users
  for each row execute function public.fn_solo_equipo_stratis();

-- Bitácora: toda edición y eliminación queda registrada, la vean o no.
create table if not exists public.auditoria (
  id          bigserial primary key,
  tabla       text not null,
  accion      text not null check (accion in ('editar','eliminar')),
  registro_id text,
  customer_id text,
  comercio    text,
  correo      text,
  ejecutivo   text,
  detalle     jsonb,
  creado_en   timestamptz not null default now()
);
create index if not exists ix_auditoria_fecha on public.auditoria(creado_en desc);

alter table public.auditoria enable row level security;
drop policy if exists p_aud_select on public.auditoria;
create policy p_aud_select on public.auditoria for select to authenticated
  using ( public.es_admin() );

-- ---------------------------------------------------------------------------
-- 8 · Bucket privado de evidencias
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('evidencias','evidencias', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880;

drop policy if exists p_evid_insert on storage.objects;
create policy p_evid_insert on storage.objects for insert to authenticated
  with check ( bucket_id = 'evidencias'
               and public.es_usuario_activo()
               and (storage.foldername(name))[1] = public.correo_actual() );

drop policy if exists p_evid_select on storage.objects;
create policy p_evid_select on storage.objects for select to authenticated
  using ( bucket_id = 'evidencias'
          and public.es_usuario_activo()
          and ( public.es_admin() or (storage.foldername(name))[1] = public.correo_actual() ) );

drop policy if exists p_evid_delete on storage.objects;
create policy p_evid_delete on storage.objects for delete to authenticated
  using ( bucket_id = 'evidencias'
          and ( public.es_admin() or (storage.foldername(name))[1] = public.correo_actual() ) );

