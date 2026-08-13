-- ===========================================================================
--  El relato del reporte, guardado donde se pueda editar sin tocar código
--
--  El reporte que va a Mastercard y a BBVA tiene dos mitades. Una son los
--  números, y esos salen de la base: nadie los escribe a mano y por eso no se
--  pueden equivocar por distracción. La otra es el relato — los hitos, las
--  dos lecturas del embudo, las notas al pie, los pesos y las metas de cada
--  objetivo — y hasta hoy esa mitad vivía dentro de un script de Python que
--  solo yo puedo correr.
--
--  Eso tiene dos problemas. El primero es obvio: José no puede cambiar una
--  frase sin pedirlo. El segundo es peor: si el relato vive fuera de la base,
--  nadie sabe quién lo cambió ni cuándo, y una lámina que se presenta a quien
--  financia el proyecto es exactamente el lugar donde eso importa.
--
--  Acá el relato pasa a ser un dato: se edita desde Ajustes, se audita como
--  todo lo demás, y el reporte se arma leyendo esta tabla. La regla es
--  simple — lo que se calcula no se escribe, lo que se escribe no se calcula.
--
--  Nada de lo que se guarda acá menciona el CRM. El CRM es la herramienta de
--  gestión de Stratis; en una lámina para BBVA o Mastercard se lee como una
--  etapa del proceso comercial, y no lo es. Esa restricción es del negocio,
--  no de la pantalla, así que queda escrita también acá.
-- ===========================================================================

-- ---------------------------------------------------------------------------
--  1 · La tabla
--
--  Una fila por bloque del relato, no una fila por campo. Un hito no se edita
--  suelto: se edita la línea de tiempo entera, y así el orden y la coherencia
--  entre hitos quedan en manos de quien escribe y no de un ORDER BY.
-- ---------------------------------------------------------------------------
create table if not exists public.reporte_config (
  clave           text primary key,
  valor           jsonb not null,
  nota            text,
  actualizado_en  timestamptz not null default now(),
  actualizado_por text
);

comment on table public.reporte_config is
  'Relato del reporte de avance: hitos, lecturas, notas al pie y metas de cada objetivo. Los numeros no se guardan aca, se calculan de la base al momento de generar el reporte.';

alter table public.reporte_config drop constraint if exists ck_reporte_clave;
alter table public.reporte_config add constraint ck_reporte_clave
  check (clave in ('proyecto', 'hitos', 'relato', 'lecturas', 'notas', 'objetivos'));

-- El sello lo pone la base, no el navegador. Una fecha de edición que manda
-- el cliente es una fecha de edición que se puede inventar.
create or replace function public.fn_reporte_sello()
returns trigger language plpgsql as $fn$
begin
  new.actualizado_en  := now();
  new.actualizado_por := coalesce(public.correo_actual(), new.actualizado_por);
  if tg_op = 'UPDATE' then
    new.clave := old.clave;
  end if;
  return new;
end $fn$;

drop trigger if exists tg_reporte_sello on public.reporte_config;
create trigger tg_reporte_sello
  before insert or update on public.reporte_config
  for each row execute function public.fn_reporte_sello();

-- ---------------------------------------------------------------------------
--  2 · La bitácora
--
--  Mismo criterio que con los parámetros del bono: el antes y el después
--  completos. Si una frase de la lámina cambia entre una reunión y la
--  siguiente, tiene que poderse decir quién la cambió sin depender de que
--  alguien se acuerde.
-- ---------------------------------------------------------------------------
create or replace function public.fn_auditar_reporte()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare
  v_antes jsonb;
begin
  if tg_op = 'UPDATE' then
    if old.valor is not distinct from new.valor then return new; end if;
    v_antes := old.valor;
  end if;
  insert into public.auditoria (tabla, accion, registro_id, customer_id, comercio,
                                correo, ejecutivo, detalle)
  values ('reporte_config', 'editar', null, null, 'Reporte de avance',
          coalesce(public.correo_actual(), 'sistema'),
          coalesce(public.correo_actual(), 'sistema'),
          jsonb_build_object(
            new.clave, jsonb_build_object('antes', v_antes, 'despues', new.valor),
            '_nota', case when tg_op = 'INSERT'
                          then 'Se cargó el bloque «' || new.clave || '» del reporte'
                          else 'Se editó el bloque «' || new.clave || '» del reporte' end));
  return new;
end $fn$;

drop trigger if exists tg_auditar_reporte on public.reporte_config;
create trigger tg_auditar_reporte
  after insert or update on public.reporte_config
  for each row execute function public.fn_auditar_reporte();

-- ---------------------------------------------------------------------------
--  3 · Quién lo ve
--
--  El reporte es material de mando. Un ejecutivo no lo lee ni lo edita, y eso
--  se decide acá y no en el menú: la pestaña se puede esconder, la fila no.
-- ---------------------------------------------------------------------------
alter table public.reporte_config enable row level security;
drop policy if exists p_reporte_all on public.reporte_config;
create policy p_reporte_all on public.reporte_config for all
  using (public.es_admin()) with check (public.es_admin());
grant select, insert, update on public.reporte_config to authenticated;

-- ---------------------------------------------------------------------------
--  4 · El relato con el que arranca, tal como se presentó el 13 de agosto
--
--  Va como semilla y no como constante: desde acá se edita. Las fechas y los
--  textos son los acordados con Gabriel; el párrafo de las dos primeras
--  semanas es el que él pidió y falta afinarlo con Gerald para que sea
--  consistente con el relato interno que ya dio en BBVA.
-- ---------------------------------------------------------------------------
insert into public.reporte_config (clave, valor, nota, actualizado_por) values

('proyecto', jsonb_build_object(
  'cliente',   'Campaña BBVA Adquirencia',
  'subtitulo', 'Reporte de avance del proyecto',
  'inicio',    '2026-07-20',
  'fin',       '2026-12-18',
  'base_comercios', 841,
  'base_facturacion', 35326806.92
), 'Marco del proyecto; la base quedó congelada en el acuerdo del 12 de agosto', 'migración'),

('hitos', jsonb_build_array(
  jsonb_build_object('fecha','20 jul', 'titulo','Arranque del proyecto',
    'detalle',E'Línea base congelada:\n841 comercios y S/ 35,3 MM', 'color','navy'),
  jsonb_build_object('fecha','20 jul – 2 ago', 'titulo','Vínculo con los ejecutivos de BBVA',
    'detalle',E'Cada comercio se coordina con su\nejecutivo antes de ser contactado', 'color','azul'),
  jsonb_build_object('fecha','30 jul', 'titulo','Arranca el trabajo de campo',
    'detalle',E'Primeras llamadas y visitas; toma\nritmo la primera semana de agosto', 'color','naranja'),
  jsonb_build_object('fecha','12 ago', 'titulo','Acuerdos formalizados con BBVA',
    'detalle',E'Base congelada, ciclo 18/19 y\ncriterio de reactivación', 'color','verde'),
  jsonb_build_object('fecha','18 dic', 'titulo','Cierre del proyecto',
    'detalle',E'Medición final de los\ntres objetivos', 'color','gris')
), 'Línea de tiempo de la lámina de hitos', 'migración'),

('relato', jsonb_build_object(
  'hitos', 'Las dos primeras semanas se dedicaron a construir el vínculo con los ejecutivos de BBVA: los comercios preparados para gestión están coordinados con su ejecutivo antes de cualquier contacto. El trabajo de campo —llamadas y visitas en 44 distritos— arrancó a fines de julio y tomó ritmo en la primera semana de agosto.'
), 'Párrafo pedido por Gabriel; pendiente de afinar con Gerald', 'migración'),

('lecturas', jsonb_build_object(
  'embudo', jsonb_build_array(
    jsonb_build_object('titulo','El ritmo de campo ya está instalado', 'color','verde',
      'texto','En 14 días de trabajo de campo se contactó a 114 comercios: 8 por día. Sosteniendo ese ritmo, el portafolio completo queda contactado hacia mediados de noviembre, antes del cierre.'),
    jsonb_build_object('titulo','El cuello está entre el contacto y la gestión', 'color','naranja',
      'texto','De los comercios contactados, 27% pasó a gestión y de esos 35% llegó a visita. Ensanchar ese tramo es lo que mueve el resultado.')
  )
), 'Las dos lecturas que acompañan el embudo', 'migración'),

('notas', jsonb_build_object(
  'hitos',  'El trabajo de campo comprende llamadas, visitas presenciales y reuniones virtuales con el comercio.',
  'embudo', 'Universo, los comercios de la base congelada. Contacto, se registró al menos un intento; gestión, hubo interacción con el comercio; visita, presencial en el local.',
  'kpis',   'Facturación al cierre del último mes completo; el mes en curso sigue abierto. Reactivación = retenidos + recuperados.'
), 'Notas al pie de cada lámina; la fecha de corte la agrega el reporte', 'migración'),

-- Los pesos y las metas viven acá y no en el código porque son lo primero que
-- se discute en una reunión. La meta de venta sigue abierta —140 si es 7 por
-- ejecutivo y por mes, 35 si es 7 por ejecutivo al cierre— y mientras esté
-- abierta conviene que se cambie en un campo, no en un archivo.
('objetivos', jsonb_build_array(
  jsonb_build_object('id','facturacion', 'nombre','Facturación', 'peso',50, 'color','naranja',
    'tipo','monto', 'meta_pct',15,
    'etiqueta_meta','Meta al cierre  ·  +15%'),
  jsonb_build_object('id','reactivacion', 'nombre','Reactivación del portafolio', 'peso',30, 'color','azul',
    'tipo','conteo', 'meta',151,
    'etiqueta_meta','Meta al cierre  ·  +18 p.p.'),
  jsonb_build_object('id','venta', 'nombre','Venta · afiliación nueva', 'peso',20, 'color','verde',
    'tipo','conteo', 'meta',140,
    'etiqueta_meta','Meta al cierre  ·  7 por ejecutivo/mes')
), 'Pesos y metas de los tres objetivos; la meta de venta está pendiente de confirmar con Gerald', 'migración')

on conflict (clave) do nothing;

-- ---------------------------------------------------------------------------
--  Comprobación: seis bloques, todos con sello, y ninguno visible para un
--  ejecutivo. Si algo de esto falla, el reporte se arma con el relato viejo y
--  nadie se entera, así que se verifica acá y no en la pantalla.
-- ---------------------------------------------------------------------------
do $$
declare
  n int; sin_sello int;
begin
  select count(*) into n from public.reporte_config;
  select count(*) into sin_sello from public.reporte_config where actualizado_en is null;
  if n <> 6 then
    raise exception 'Se esperaban 6 bloques del reporte y hay %', n;
  end if;
  if sin_sello > 0 then
    raise exception '% bloques sin fecha de edición', sin_sello;
  end if;
  raise notice 'reporte_config: % bloques cargados, todos sellados', n;
end $$;
