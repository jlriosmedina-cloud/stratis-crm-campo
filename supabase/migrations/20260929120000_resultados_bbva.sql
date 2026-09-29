-- Resultados de BBVA por corte (29/09/2026): el Excel mínimo que Jose arma desde el entorno de BBVA
-- (Customer ID, gestión con contacto, reactivado y, si lo tiene, el monto facturado por comercio).
-- Solo lo carga y lo ve quien tiene acceso al escritorio (v2_puede_escritorio). Los ejecutivos no lo ven
-- hasta que Jose lo decida con Gabriel. No toca visitas ni el medidor: es una tabla aparte, por corte.
-- «Cuenta» (decisión de Jose, 29/09) = reactivado y con gestión con contacto según BBVA, y con visita válida de Stratis en el CRM.
-- Esa regla la aplica la presentación del escritorio; aquí se guarda la data de BBVA tal cual.
-- Se aplica solo con el OK de Jose.

-- v2_cargas registra también esta carga
alter table public.v2_cargas drop constraint if exists v2_cargas_tipo_check;
alter table public.v2_cargas add constraint v2_cargas_tipo_check CHECK ((tipo = ANY (ARRAY['base'::text, 'transacciones'::text, 'estado'::text, 'resultados_bbva'::text])));

create table if not exists public.v2_cortes_bbva (
  corte date primary key,
  archivo text,
  filas integer not null default 0,
  facturado_total numeric check (facturado_total is null or facturado_total >= 0),
  notas text,
  por text not null default public.correo_actual(),
  en timestamptz not null default now()
);

create table if not exists public.v2_resultados_bbva (
  corte date not null references public.v2_cortes_bbva(corte) on delete cascade,
  customer_id text not null check (customer_id ~ '^[0-9]{8}$'),
  gestion_con_contacto boolean not null,
  reactivado text not null check (reactivado in ('Si', 'No', 'En proceso')),
  facturado numeric check (facturado is null or facturado >= 0),
  primary key (corte, customer_id)
);

alter table public.v2_cortes_bbva enable row level security;
alter table public.v2_resultados_bbva enable row level security;
drop policy if exists v2_cortes_bbva_lectura on public.v2_cortes_bbva;
create policy v2_cortes_bbva_lectura on public.v2_cortes_bbva for select to authenticated using ((select public.v2_puede_escritorio()));
drop policy if exists v2_resultados_bbva_lectura on public.v2_resultados_bbva;
create policy v2_resultados_bbva_lectura on public.v2_resultados_bbva for select to authenticated using ((select public.v2_puede_escritorio()));
-- Solo lectura desde la app: escribe la función de carga (security definer). Sin nada para anon.
revoke all on public.v2_cortes_bbva, public.v2_resultados_bbva from anon;
revoke insert, update, delete, truncate, references, trigger on public.v2_cortes_bbva, public.v2_resultados_bbva from authenticated;

-- Carga un corte completo: si el corte ya existía, se reemplaza entero. Deja su línea en v2_cargas.
-- p_filas: [{customer_id, gestion_con_contacto: true|false, reactivado: 'Si'|'No'|'En proceso', facturado: número o null}]
CREATE OR REPLACE FUNCTION public.v2_cargar_resultados_bbva(p_archivo text, p_corte date, p_filas jsonb, p_facturado_total numeric DEFAULT NULL::numeric, p_notas text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_correo text := public.correo_actual();
  r jsonb; i int := 0; v_ok int := 0; v_rech jsonb := '[]'::jsonb; v_cid text; v_reac text; v_fac numeric; v_msg text; v_carga bigint; v_habia boolean;
begin
  if not public.v2_puede_escritorio() then raise exception 'Solo el analista carga los resultados de BBVA.'; end if;
  if p_corte is null or p_corte > (now() at time zone 'America/Lima')::date then raise exception 'La fecha de corte no puede ser futura.'; end if;
  if jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 then raise exception 'No hay filas que cargar.'; end if;
  if p_facturado_total is not null and p_facturado_total < 0 then raise exception 'El total facturado no puede ser negativo.'; end if;

  select true into v_habia from v2_cortes_bbva where corte = p_corte;
  delete from v2_cortes_bbva where corte = p_corte;   -- reemplaza el corte (las filas se borran en cascada)
  insert into v2_cortes_bbva(corte, archivo, filas, facturado_total, notas, por) values (p_corte, p_archivo, 0, p_facturado_total, p_notas, v_correo);

  for r in select * from jsonb_array_elements(p_filas) loop
    i := i + 1;
    begin
      v_cid := btrim(r->>'customer_id');
      if v_cid !~ '^[0-9]{1,8}$' then raise exception 'customer_id no es numérico o tiene más de 8 dígitos'; end if;
      v_cid := lpad(v_cid, 8, '0');
      if not exists (select 1 from v2_comercios where customer_id = v_cid) then raise exception 'customer_id no está en la base'; end if;
      if jsonb_typeof(r->'gestion_con_contacto') <> 'boolean' then raise exception 'gestion_con_contacto no es Si o No'; end if;
      v_reac := r->>'reactivado';
      if v_reac not in ('Si', 'No', 'En proceso') then raise exception 'reactivado no es Si, No o En proceso'; end if;
      if (r->>'facturado') is not null and (r->>'facturado') !~ '^\d+(\.\d+)?$' then raise exception 'facturado no es un monto'; end if;
      v_fac := (r->>'facturado')::numeric;
      insert into v2_resultados_bbva(corte, customer_id, gestion_con_contacto, reactivado, facturado)
      values (p_corte, v_cid, (r->>'gestion_con_contacto')::boolean, v_reac, v_fac);
      v_ok := v_ok + 1;
    exception when others then
      v_msg := case when sqlstate = '23505' then 'customer_id repetido en el archivo' else sqlerrm end;
      if jsonb_array_length(v_rech) < 300 then v_rech := v_rech || jsonb_build_object('fila', i, 'customer_id', r->>'customer_id', 'motivo', v_msg); end if;
    end;
  end loop;

  -- Si no entró ninguna fila, se deshace todo (incluido el borrado del corte anterior)
  if v_ok = 0 then raise exception 'Ninguna fila se pudo cargar (%): el corte anterior se mantiene.', coalesce(v_rech->0->>'motivo', 'sin detalle'); end if;
  update v2_cortes_bbva set filas = v_ok where corte = p_corte;
  insert into v2_cargas(tipo, archivo, fecha_corte, formato, filas, notas, por)
  values ('resultados_bbva', p_archivo, p_corte, null, v_ok,
          concat_ws(' · ', p_notas, case when v_habia then 'reemplaza el corte anterior' end, format('%s filas: %s cargadas, %s rechazadas', i, v_ok, i - v_ok),
                    case when p_facturado_total is not null then format('total facturado S/ %s', p_facturado_total) end), v_correo)
  returning id into v_carga;
  return jsonb_build_object('carga_id', v_carga, 'corte', p_corte, 'leidas', i, 'cargadas', v_ok, 'rechazadas', i - v_ok, 'reemplazo', coalesce(v_habia, false),
    'reactivados', (select count(*) from v2_resultados_bbva where corte = p_corte and reactivado = 'Si'),
    'con_contacto', (select count(*) from v2_resultados_bbva where corte = p_corte and reactivado = 'Si' and gestion_con_contacto),
    'detalle', v_rech);
end $function$
;
revoke execute on function public.v2_cargar_resultados_bbva(text, date, jsonb, numeric, text) from public, anon;
grant execute on function public.v2_cargar_resultados_bbva(text, date, jsonb, numeric, text) to authenticated, service_role;
