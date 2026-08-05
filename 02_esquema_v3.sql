-- ===========================================================================
--  CRM Stratis · Campaña BBVA Adquirencia
--  Esquema v3 — cartera en campo, sin datos sensibles
--
--  Qué guarda esta base:
--    · customer_id — el único dato que viene de BBVA, lo digita el ejecutivo.
--    · El nombre del comercio lo escribe el propio ejecutivo para reconocerlo;
--      NO es la razón social.
--    · Rubro de lista cerrada, distrito, dirección y estado (ACTIVO / DE BAJA).
--    · Cada intento de comunicación, con su medio, su resultado y su evidencia.
--    · Coordenadas tomadas por el GPS del equipo, no editables ni antes ni
--      después de guardar.
--
--  Qué NO guarda: razón social, RUC, celulares, correos, personas de contacto,
--  funcionario BBVA ni saldos. Si se necesitan, se cruzan por customer_id
--  contra la base de BBVA.
--
--  Reglas que viven en Postgres y no en la pantalla:
--    · customer_id es único en TODA la campaña: el primero que lo registra se
--      queda con el comercio.
--    · Cada intento cuenta por separado, aunque sea el quinto con el mismo
--      comercio. Solo "habló con el contacto" cuenta como logrado.
--    · Al editar una interacción, la base restaura medio, resultado, fecha y
--      ubicación: solo se pueden corregir comentarios y calificación.
--    · No hay módulo de cancelaciones ni control de entrega de POS.
--    · Un registro no puede declararse con GPS verificado sin coordenadas.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1 · Catálogos
-- ---------------------------------------------------------------------------
create table if not exists public.rubros (
  codigo  text primary key,
  nombre  text not null,
  orden   int  not null default 99
);

insert into public.rubros (codigo, nombre, orden) values
  ('bodega',        'Bodega / Minimarket',        1),
  ('restaurante',   'Restaurante / Cafetería',    2),
  ('polleria',      'Pollería',                   3),
  ('panaderia',     'Panadería / Pastelería',     4),
  ('licoreria',     'Licorería',                  5),
  ('botica',        'Botica / Farmacia',          6),
  ('salud',         'Salud / Consultorio',        7),
  ('veterinaria',   'Veterinaria',                8),
  ('belleza',       'Belleza / Peluquería',       9),
  ('ferreteria',    'Ferretería',                10),
  ('construccion',  'Construcción / Materiales', 11),
  ('autopartes',    'Autopartes / Taller',       12),
  ('grifo',         'Grifo / Estación',          13),
  ('textil',        'Textil / Confección',       14),
  ('ropa',          'Ropa / Boutique',           15),
  ('calzado',       'Calzado',                   16),
  ('libreria',      'Librería / Bazar',          17),
  ('tecnologia',    'Tecnología / Celulares',    18),
  ('optica',        'Óptica',                    19),
  ('hospedaje',     'Hotel / Hospedaje',         20),
  ('educacion',     'Educación / Academia',      21),
  ('transporte',    'Transporte',                22),
  ('servicios',     'Servicios generales',       23),
  ('otro',          'Otro',                      99)
on conflict (codigo) do update set nombre = excluded.nombre, orden = excluded.orden;

alter table public.rubros enable row level security;
drop policy if exists p_rubros_select on public.rubros;
create policy p_rubros_select on public.rubros for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- 2 · Clientes — ahora los crea el ejecutivo
-- ---------------------------------------------------------------------------
drop table if exists public.interacciones cascade;
drop table if exists public.clientes      cascade;

create table public.clientes (
  customer_id         text primary key,
  rubro               text not null references public.rubros(codigo),
  rubro_otro          text,
  nombre_comercio     text not null,
  distrito            text not null,
  direccion           text not null,
  estado              text not null default 'ACTIVO'
                        check (estado in ('ACTIVO','DE BAJA')),
  observacion         text,

  -- dueño del registro: el ejecutivo que lo dio de alta
  asignado            text not null,
  asignado_correo     text not null references public.usuarios(correo),

  creado_en           timestamptz not null default now(),
  modificado_en       timestamptz not null default now(),

  constraint ck_rubro_otro check (rubro <> 'otro' or coalesce(rubro_otro,'') <> ''),
  constraint ck_customer_id check (length(trim(customer_id)) between 3 and 30)
);
create index ix_clientes_asignado on public.clientes(asignado_correo);
create index ix_clientes_rubro    on public.clientes(rubro);
create index ix_clientes_distrito on public.clientes(distrito);
create index ix_clientes_estado   on public.clientes(estado);

comment on table public.clientes is
  'Cartera en campo sin datos sensibles. El customer_id es el único nexo con BBVA; el nombre del comercio lo escribe el ejecutivo.';

-- ---------------------------------------------------------------------------
-- 3 · Interacciones — cada intento de comunicación cuenta
-- ---------------------------------------------------------------------------
create table public.interacciones (
  id                       uuid primary key default gen_random_uuid(),
  customer_id              text not null references public.clientes(customer_id) on delete cascade,
  correo_stratis           text not null references public.usuarios(correo),
  ejecutivo                text not null,

  fecha_contacto           date not null,
  hora_contacto            time not null,
  tipo_contacto            text not null,
  resultado                text not null default 'efectivo'
                             check (resultado in ('efectivo','no_contesta','local_cerrado',
                                                  'titular_ausente','datos_errados','rechazo')),

  -- calculadas por trigger
  visita_presencial        text,
  visita_virtual           text,
  cumple_visita            text,
  fecha_visita_actualizada date,

  ubicacion                text,
  ubicacion_verificada     boolean not null default false,
  evidencia_path           text,
  calificacion             text check (calificacion is null or calificacion in ('A','B','C','D','E')),
  comentario_ejecutivo     text not null,
  comentario_cliente       text,


  creado_en                timestamptz not null default now(),
  modificado_en            timestamptz not null default now(),

  -- Solo el GPS del equipo puede sellar un registro como verificado: si dice
  -- que lo está, el texto tiene que tener forma de coordenadas.
  constraint ck_ubicacion_verificada check (
    ubicacion_verificada = false
    or ubicacion ~ '^-?[0-9]{1,3}\.[0-9]+, *-?[0-9]{1,3}\.[0-9]+')
);
create index ix_inter_cliente on public.interacciones(customer_id, fecha_contacto desc, hora_contacto desc);
create index ix_inter_correo  on public.interacciones(correo_stratis);
create index ix_inter_result  on public.interacciones(resultado);

comment on column public.interacciones.resultado is
  'Distingue el intento del contacto logrado. Todos los registros cuentan como intento; solo "efectivo" cuenta como comunicación lograda.';

-- ---------------------------------------------------------------------------
-- 5 · Reglas de negocio de las interacciones
-- ---------------------------------------------------------------------------
create or replace function public.fn_reglas_interaccion()
returns trigger language plpgsql as $$
declare
  v_presencial boolean;
  v_virtual    boolean;
begin
  -- Lo que quedó registrado no se toca. Al editar solo se pueden corregir
  -- los comentarios y la calificación; todo lo demás se restaura desde la
  -- fila original, venga de donde venga la petición.
  if tg_op = 'UPDATE' then
    new.customer_id        := old.customer_id;
    new.correo_stratis     := old.correo_stratis;
    new.ejecutivo          := old.ejecutivo;
    new.fecha_contacto     := old.fecha_contacto;
    new.hora_contacto      := old.hora_contacto;
    new.tipo_contacto      := old.tipo_contacto;
    new.resultado          := old.resultado;
    new.ubicacion          := old.ubicacion;
    new.ubicacion_verificada := old.ubicacion_verificada;
    new.evidencia_path     := old.evidencia_path;
    new.creado_en          := old.creado_en;
  end if;

  v_presencial := new.tipo_contacto in ('visita_presencial','reunion_presencial');
  v_virtual    := new.tipo_contacto in ('reunion_virtual','videollamada');

  new.visita_presencial := case when v_presencial then 'SI' else 'No' end;
  new.visita_virtual    := case when v_virtual    then 'SI' else 'No' end;
  new.cumple_visita     := case when (v_presencial or v_virtual)
                                 and new.resultado = 'efectivo' then 'SI' else 'No' end;
  new.fecha_visita_actualizada :=
    case when new.cumple_visita = 'SI' then new.fecha_contacto else null end;


  if tg_op = 'INSERT' and auth.role() = 'authenticated' then
    new.correo_stratis := public.correo_actual();
  end if;

  new.modificado_en := now();
  return new;
end $$;

drop trigger if exists tg_reglas_interaccion on public.interacciones;
create trigger tg_reglas_interaccion before insert or update on public.interacciones
for each row execute function public.fn_reglas_interaccion();

-- ---------------------------------------------------------------------------
-- 6 · Reglas del alta de clientes
-- ---------------------------------------------------------------------------
create or replace function public.fn_reglas_cliente()
returns trigger language plpgsql as $$
begin
  new.customer_id := upper(trim(new.customer_id));
  new.distrito    := upper(trim(new.distrito));

  if auth.role() = 'authenticated' then
    if tg_op = 'INSERT' then
      new.asignado_correo := public.correo_actual();
      select coalesce(u.nombre_corto, u.nombre) into new.asignado
        from public.usuarios u where u.correo = new.asignado_correo;
    else
      -- nadie puede pasarle su cartera a otro desde la aplicación
      new.asignado_correo := old.asignado_correo;
      new.asignado        := old.asignado;
      new.customer_id     := old.customer_id;
      new.creado_en       := old.creado_en;
    end if;
  end if;

  if new.rubro <> 'otro' then new.rubro_otro := null; end if;
  new.modificado_en := now();
  return new;
end $$;

drop trigger if exists tg_reglas_cliente on public.clientes;
create trigger tg_reglas_cliente before insert or update on public.clientes
for each row execute function public.fn_reglas_cliente();

-- ---------------------------------------------------------------------------
-- 7 · Aislamiento (RLS)
-- ---------------------------------------------------------------------------
alter table public.clientes      enable row level security;
alter table public.interacciones enable row level security;

-- Clientes ---------------------------------------------------------------
drop policy if exists p_clientes_select on public.clientes;
create policy p_clientes_select on public.clientes for select to authenticated
  using ( public.es_usuario_activo()
          and ( public.es_admin() or asignado_correo = public.correo_actual() ) );

drop policy if exists p_clientes_insert on public.clientes;
create policy p_clientes_insert on public.clientes for insert to authenticated
  with check ( public.es_usuario_activo() );

drop policy if exists p_clientes_update on public.clientes;
create policy p_clientes_update on public.clientes for update to authenticated
  using ( public.es_usuario_activo() and asignado_correo = public.correo_actual() )
  with check ( asignado_correo = public.correo_actual() );

drop policy if exists p_clientes_delete on public.clientes;
create policy p_clientes_delete on public.clientes for delete to authenticated
  using ( public.es_usuario_activo() and asignado_correo = public.correo_actual() );

-- Interacciones ----------------------------------------------------------
drop policy if exists p_inter_select on public.interacciones;
create policy p_inter_select on public.interacciones for select to authenticated
  using ( public.es_usuario_activo()
          and ( public.es_admin() or correo_stratis = public.correo_actual() ) );

drop policy if exists p_inter_insert on public.interacciones;
create policy p_inter_insert on public.interacciones for insert to authenticated
  with check ( public.es_usuario_activo()
               and correo_stratis = public.correo_actual()
               and exists (select 1 from public.clientes c
                            where c.customer_id = interacciones.customer_id
                              and c.asignado_correo = public.correo_actual()) );

drop policy if exists p_inter_update on public.interacciones;
create policy p_inter_update on public.interacciones for update to authenticated
  using ( public.es_usuario_activo() and correo_stratis = public.correo_actual() )
  with check ( correo_stratis = public.correo_actual() );

drop policy if exists p_inter_delete on public.interacciones;
create policy p_inter_delete on public.interacciones for delete to authenticated
  using ( public.es_usuario_activo() and correo_stratis = public.correo_actual() );

-- ---------------------------------------------------------------------------
-- 8 · Vistas de lectura
-- ---------------------------------------------------------------------------
drop view if exists public.v_avance        cascade;
drop view if exists public.v_base          cascade;
drop view if exists public.v_visitas       cascade;
drop view if exists public.v_efectividad   cascade;

create view public.v_base with (security_invoker = on) as
select c.customer_id,
       r.nombre as rubro,
       coalesce(c.rubro_otro, r.nombre) as rubro_detalle,
       c.nombre_comercio, c.distrito, c.direccion, c.estado,
       c.asignado as ejecutivo, c.asignado_correo,
       (select count(*) from public.interacciones i where i.customer_id = c.customer_id) as intentos,
       (select count(*) from public.interacciones i
         where i.customer_id = c.customer_id and i.resultado = 'efectivo') as efectivos,
       (select count(*) from public.interacciones i
         where i.customer_id = c.customer_id and i.cumple_visita = 'SI') as visitas_validas,
       (select max(i.fecha_contacto) from public.interacciones i
         where i.customer_id = c.customer_id) as ultimo_contacto,
       c.creado_en
  from public.clientes c
  join public.rubros r on r.codigo = c.rubro;

create view public.v_efectividad with (security_invoker = on) as
select u.correo,
       coalesce(u.nombre_corto, u.nombre) as ejecutivo,
       (select count(*) from public.clientes c where c.asignado_correo = u.correo) as clientes,
       (select count(*) from public.interacciones i where i.correo_stratis = u.correo) as intentos,
       (select count(*) from public.interacciones i
         where i.correo_stratis = u.correo and i.resultado = 'efectivo') as efectivos,
       (select count(*) from public.interacciones i
         where i.correo_stratis = u.correo and i.cumple_visita = 'SI') as visitas_validas,
       (select count(distinct i.customer_id) from public.interacciones i
         where i.correo_stratis = u.correo) as clientes_trabajados,
       round(100.0 * (select count(*) from public.interacciones i
                       where i.correo_stratis = u.correo and i.resultado = 'efectivo')
             / nullif((select count(*) from public.interacciones i
                        where i.correo_stratis = u.correo), 0), 1) as pct_efectividad
  from public.usuarios u
 where u.rol = 'Ejecutivo';

-- ---------------------------------------------------------------------------
-- 9 · Comprobaciones
-- ---------------------------------------------------------------------------
do $$
declare n int;
begin
  select count(*) into n from public.rubros;
  raise notice 'rubros cargados: %', n;
  select count(*) into n from pg_policies where schemaname = 'public';
  raise notice 'politicas activas: %', n;
end $$;
