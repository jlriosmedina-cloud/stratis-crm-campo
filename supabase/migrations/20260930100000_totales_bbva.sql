-- Totales de BBVA por corte (30/09/2026). La reactivación vive en el drive de BBVA y no se puede descargar por comercio:
-- Jose tipea los totales que ve allí, por grupo, y el CRM pone la cantidad de comercios de cada grupo al mismo corte.
--   cc = visitados con contacto · sc = visitados sin contacto · nv = no visitados (grupos del CRM, como en la hoja Base)
--   *_reac = comercios reactivados según BBVA · *_fac = facturación en soles · *_trx = transacciones
-- «Reactivado que cuenta» (decisión de Jose, 30/09) = reactivado según BBVA y visitado con contacto según el CRM (cc_reac).
-- Solo lo guarda y lo ve quien tiene acceso al escritorio. No toca visitas ni el medidor.
-- Se aplica solo con el OK de Jose.

alter table public.v2_cargas drop constraint if exists v2_cargas_tipo_check;
alter table public.v2_cargas add constraint v2_cargas_tipo_check CHECK ((tipo = ANY (ARRAY['base'::text, 'transacciones'::text, 'estado'::text, 'resultados_bbva'::text, 'totales_bbva'::text])));

create table if not exists public.v2_totales_bbva (
  corte date primary key,
  cc_reac integer not null check (cc_reac >= 0), cc_fac numeric not null check (cc_fac >= 0), cc_trx bigint not null check (cc_trx >= 0),
  sc_reac integer not null check (sc_reac >= 0), sc_fac numeric not null check (sc_fac >= 0), sc_trx bigint not null check (sc_trx >= 0),
  nv_reac integer not null check (nv_reac >= 0), nv_fac numeric not null check (nv_fac >= 0), nv_trx bigint not null check (nv_trx >= 0),
  notas text,
  por text not null default public.correo_actual(),
  en timestamptz not null default now()
);

alter table public.v2_totales_bbva enable row level security;
drop policy if exists v2_totales_bbva_lectura on public.v2_totales_bbva;
create policy v2_totales_bbva_lectura on public.v2_totales_bbva for select to authenticated using ((select public.v2_puede_escritorio()));
-- Solo lectura desde la app: escribe la función (security definer). Sin nada para anon.
revoke all on public.v2_totales_bbva from anon;
revoke insert, update, delete, truncate, references, trigger on public.v2_totales_bbva from authenticated;

-- Guarda (o reemplaza) los totales de un corte y deja su línea en v2_cargas.
-- p_totales: { cc_reac, cc_fac, cc_trx, sc_reac, sc_fac, sc_trx, nv_reac, nv_fac, nv_trx } (números, sin separadores)
CREATE OR REPLACE FUNCTION public.v2_guardar_totales_bbva(p_corte date, p_totales jsonb, p_notas text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_correo text := public.correo_actual();
  k text; v_ant jsonb; v_carga bigint; n numeric;
begin
  if not public.v2_puede_escritorio() then raise exception 'Solo el analista guarda los totales de BBVA.'; end if;
  if p_corte is null or p_corte > (now() at time zone 'America/Lima')::date then raise exception 'La fecha de corte no puede ser futura.'; end if;
  if jsonb_typeof(p_totales) is distinct from 'object' then raise exception 'Faltan los totales.'; end if;
  foreach k in array array['cc_reac','cc_fac','cc_trx','sc_reac','sc_fac','sc_trx','nv_reac','nv_fac','nv_trx'] loop
    if jsonb_typeof(p_totales->k) is distinct from 'number' then raise exception 'Falta o no es un número: %', k; end if;
    n := (p_totales->>k)::numeric;
    if n < 0 then raise exception 'No puede ser negativo: %', k; end if;
    if k not like '%_fac' and n <> trunc(n) then raise exception 'Tiene que ser un entero: %', k; end if;
  end loop;

  -- respaldo: si el corte ya tenía totales, los 9 valores anteriores quedan en la nota de v2_cargas
  select to_jsonb(t) - 'corte' - 'notas' - 'por' - 'en' into v_ant from v2_totales_bbva t where corte = p_corte;
  insert into v2_totales_bbva(corte, cc_reac, cc_fac, cc_trx, sc_reac, sc_fac, sc_trx, nv_reac, nv_fac, nv_trx, notas, por, en)
  values (p_corte, (p_totales->>'cc_reac')::int, (p_totales->>'cc_fac')::numeric, (p_totales->>'cc_trx')::bigint,
          (p_totales->>'sc_reac')::int, (p_totales->>'sc_fac')::numeric, (p_totales->>'sc_trx')::bigint,
          (p_totales->>'nv_reac')::int, (p_totales->>'nv_fac')::numeric, (p_totales->>'nv_trx')::bigint, p_notas, v_correo, now())
  on conflict (corte) do update set cc_reac = excluded.cc_reac, cc_fac = excluded.cc_fac, cc_trx = excluded.cc_trx,
    sc_reac = excluded.sc_reac, sc_fac = excluded.sc_fac, sc_trx = excluded.sc_trx, nv_reac = excluded.nv_reac, nv_fac = excluded.nv_fac, nv_trx = excluded.nv_trx,
    notas = excluded.notas, por = excluded.por, en = excluded.en;

  insert into v2_cargas(tipo, archivo, fecha_corte, formato, filas, notas, por)
  values ('totales_bbva', 'Totales tipeados', p_corte, null, 3,
          concat_ws(' · ', p_notas, case when v_ant is not null then 'reemplaza los totales anteriores del corte: ' || v_ant::text end,
                    format('reactivados %s con contacto, %s sin contacto, %s no visitados', p_totales->>'cc_reac', p_totales->>'sc_reac', p_totales->>'nv_reac')), v_correo)
  returning id into v_carga;
  return jsonb_build_object('carga_id', v_carga, 'corte', p_corte, 'reemplazo', v_ant is not null);
end $function$
;
revoke execute on function public.v2_guardar_totales_bbva(date, jsonb, text) from public, anon;
grant execute on function public.v2_guardar_totales_bbva(date, jsonb, text) to authenticated, service_role;
