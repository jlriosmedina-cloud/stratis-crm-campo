-- ===========================================================================
--  Cierres de periodo (24/10/2026, pedido de Jose)
--
--  El histórico de lo que se aprobó y pagó en cada periodo cerrado, congelado
--  tal como se firmó en el acta. No se recalcula: si después se corrige una
--  visita o llega otro corte de BBVA, el cierre no cambia (como el sello del
--  CRM anterior). El CRM solo vuelve a contar lo que puede (visitados y con
--  contacto) para mostrar si cuadra.
--
--  Todo va en porcentaje del sueldo base: los sueldos no viven en el CRM. Lo
--  retenido es el % que se acumula para el cierre del proyecto (bolsa).
--
--  Los datos de cada cierre NO van en este archivo (el repositorio no lleva
--  datos de ejecutivos ni de comercios): se cargan aparte, con el OK de Jose.
--
--  Quién ve qué:
--   · el ejecutivo, solo sus cierres y solo lo del acta (alcances, incentivo,
--     pagado, retenido): v2_mis_cierres;
--   · Jose (Analista) y el Manager, todo, con el detalle (puntajes, viáticos,
--     ajustes) y el cuadre: v2_cierres_equipo y v2_cierre_cuadre.
--  Las tablas no se leen directo: RLS sin políticas, solo por estas funciones.
-- ===========================================================================

create table if not exists public.v2_cierres (
  periodo        text not null,              -- id del periodo: '2026-08', '2026-09', '2026-10'…
  correo         text not null,              -- el ejecutivo
  nombre         text not null,              -- cómo se muestra: 'P3 · octubre'
  ini            date not null,
  fin            date not null,
  modelo         text not null,              -- con qué modelo de incentivo se midió
  aprobado_en    date,
  enviado_en     date,
  incentivo_pct  numeric(6,2) not null,      -- % del sueldo base
  pagado_pct     numeric(6,2) not null,      -- se pagó con la remuneración del mes
  retenido_pct   numeric(6,2) not null,      -- va a la bolsa del cierre del proyecto
  alcances       jsonb not null default '[]'::jsonb,  -- [{"k":"Visitados","v":"178 / 160"}…] lo que ve el ejecutivo
  detalle        jsonb not null default '{}'::jsonb,  -- solo escritorio: puntajes, viáticos, ajustes, ventana de visitas, cifras del acta
  cargado_en     timestamptz not null default now(),
  cargado_por    text,
  primary key (periodo, correo),
  constraint ck_cierres_pct check (incentivo_pct >= 0 and pagado_pct >= 0 and retenido_pct >= 0
                                   and abs(pagado_pct + retenido_pct - incentivo_pct) <= 0.05),
  constraint ck_cierres_fechas check (fin >= ini),
  constraint ck_cierres_correo check (correo = lower(correo))
);
comment on table public.v2_cierres is
  'Cierre aprobado de cada periodo por ejecutivo, congelado como se firmó. Porcentajes del sueldo base; los sueldos no viven en el CRM.';

-- Los reactivados aprobados en el cierre, comercio por comercio (la lista no siempre sale del CRM:
-- en el periodo 3 salió de la base de BBVA al 19/10, revisada a mano).
create table if not exists public.v2_cierre_reactivados (
  periodo      text not null,
  correo       text not null,
  customer_id  text not null,
  ya_facturaba boolean not null default false,  -- facturaba al 11/09: no cuenta en la medición Stratis
  primary key (periodo, customer_id),
  foreign key (periodo, correo) references public.v2_cierres(periodo, correo) on delete cascade
);
comment on table public.v2_cierre_reactivados is
  'Reactivados aprobados en el cierre de cada periodo, por comercio. Fuente: el Excel del cierre enviado.';

alter table public.v2_cierres enable row level security;
alter table public.v2_cierre_reactivados enable row level security;
-- Nadie las lee ni escribe directo: solo las funciones de abajo (security definer). authenticated conserva SELECT,
-- como todas las tablas v2_* (convención del 28/09), pero la RLS sin políticas no le devuelve nada.
revoke all on public.v2_cierres, public.v2_cierre_reactivados from anon, authenticated;
grant select on public.v2_cierres, public.v2_cierre_reactivados to authenticated;

-- El ejecutivo ve sus cierres (solo lo del acta). Un admin puede pedir los de un ejecutivo
-- para «Ver su celular» (?como=); nadie más puede pedir los de otro.
create or replace function public.v2_mis_cierres(p_correo text default null)
 returns table(periodo text, nombre text, ini date, fin date, modelo text, aprobado_en date,
               incentivo_pct numeric, pagado_pct numeric, retenido_pct numeric, alcances jsonb)
 language sql stable security definer
 set search_path to 'public'
as $function$
  select c.periodo, c.nombre, c.ini, c.fin, c.modelo, c.aprobado_en, c.incentivo_pct, c.pagado_pct, c.retenido_pct, c.alcances
  from v2_cierres c
  where public.es_usuario_activo()
    and c.correo = case when p_correo is not null and public.es_admin() then lower(p_correo) else public.correo_actual() end
  order by c.ini;
$function$;
revoke execute on function public.v2_mis_cierres(text) from public, anon;
grant execute on function public.v2_mis_cierres(text) to authenticated, service_role;

-- El escritorio: todos los cierres, con el detalle y cuántos reactivados aprobados guarda cada uno.
create or replace function public.v2_cierres_equipo()
 returns table(periodo text, correo text, ejecutivo text, nombre text, ini date, fin date, modelo text,
               aprobado_en date, enviado_en date, incentivo_pct numeric, pagado_pct numeric, retenido_pct numeric,
               alcances jsonb, detalle jsonb, reactivados_lista integer, reactivados_ya_facturaban integer)
 language sql stable security definer
 set search_path to 'public'
as $function$
  select c.periodo, c.correo, coalesce(u.nombre, c.correo), c.nombre, c.ini, c.fin, c.modelo, c.aprobado_en, c.enviado_en,
         c.incentivo_pct, c.pagado_pct, c.retenido_pct, c.alcances, c.detalle,
         (select count(*)::int from v2_cierre_reactivados r where r.periodo = c.periodo and r.correo = c.correo),
         (select count(*)::int from v2_cierre_reactivados r where r.periodo = c.periodo and r.correo = c.correo and r.ya_facturaba)
  from v2_cierres c left join usuarios u on lower(u.correo) = c.correo
  where public.es_usuario_activo() and public.es_admin()
  order by c.ini, coalesce(u.nombre, c.correo);
$function$;
revoke execute on function public.v2_cierres_equipo() from public, anon;
grant execute on function public.v2_cierres_equipo() to authenticated, service_role;

-- El cuadre: vuelve a contar en el registro de visitas, con la ventana de visitas del acta
-- (detalle.visitas_desde / visitas_hasta), los comercios visitados y con contacto de cada ejecutivo.
-- Visita válida = no anulada, con ubicación y a tiempo (la misma regla de siempre).
create or replace function public.v2_cierre_cuadre(p_periodo text)
 returns table(correo text, visitados integer, con_contacto integer)
 language sql stable security definer
 set search_path to 'public'
as $function$
  with c as (select c.correo, (c.detalle->>'visitas_desde')::date d, (c.detalle->>'visitas_hasta')::date h
             from v2_cierres c where c.periodo = p_periodo and c.detalle ? 'visitas_desde' and c.detalle ? 'visitas_hasta')
  select c.correo,
         count(distinct v.customer_id)::int,
         count(distinct v.customer_id) filter (where v.con is distinct from 'Nadie')::int
  from c left join v2_visitas v on v.correo = c.correo and v.anulada_en is null and v.lat is not null and not coalesce(v.fuera_plazo, false)
       and (v.visitado_en at time zone 'America/Lima')::date between c.d and c.h
  where public.es_usuario_activo() and public.es_admin()
  group by c.correo;
$function$;
revoke execute on function public.v2_cierre_cuadre(text) from public, anon;
grant execute on function public.v2_cierre_cuadre(text) to authenticated, service_role;
