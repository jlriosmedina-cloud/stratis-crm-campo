-- Cargas de BBVA por documento (21/10/2026). Decisión de Jose: «BBVA va a reportar por RUC/DNI».
-- Va después de 20261021100000_base_2026_11_bloques.sql (usa v2_comercios.documento) y se aplica el mismo día.
--
-- Qué hace:
--   1. v2_comercio_de_id(texto) traduce el identificador que trae un archivo de BBVA al customer_id del CRM:
--        · 11 dígitos → RUC: busca v2_comercios.documento.
--        · hasta 8 dígitos → se completa a 8 con ceros (Excel quita el cero inicial de los DNI) y se busca como
--          Customer ID de BBVA o como DNI. Si coincide con dos comercios distintos, no adivina: la fila se rechaza.
--      Los comercios nuevos de la base 2026-11 tienen customer_id = documento; los 20 que ya existían conservan su
--      Customer ID y se encuentran por su documento.
--   2. v2_resultados_bbva acepta customer_id de 8 u 11 dígitos (antes solo 8).
--   3. v2_cargar_resultados_bbva y v2_cargar_transacciones aceptan en cada fila «documento», «customer_id» o los dos
--      (v2_comercio_de_fila; si los dos llevan a comercios distintos, la fila se rechaza). Se limpia el «.0» o «,0» de Excel. Todo lo demás (validaciones, reemplazo del corte, registro en v2_cargas, lo que devuelven)
--      queda igual que la versión en vivo.
--
-- No toca visitas, el bono ni las funciones del celular. Se aplica solo con el OK de Jose.

-- 1. Traducción del identificador ----------------------------------------------------------------------------------
create or replace function public.v2_comercio_de_id(p_id text)
 returns text
 language plpgsql
 stable
 set search_path to 'public'
as $function$
declare
  v text := regexp_replace(btrim(coalesce(p_id, '')), '[.,]0+$', '');
  v_cid text; v_doc text;
begin
  if v !~ '^[0-9]{1,11}$' or length(v) in (9, 10) then
    raise exception 'el identificador no es un Customer ID ni un DNI (8 dígitos) ni un RUC (11 dígitos)';
  end if;
  if length(v) = 11 then
    select customer_id into v_doc from v2_comercios where documento = v;
    if v_doc is null then raise exception 'el RUC no está en la base'; end if;
    return v_doc;
  end if;
  v := lpad(v, 8, '0');
  select customer_id into v_cid from v2_comercios where customer_id = v;
  select customer_id into v_doc from v2_comercios where documento = v;
  if v_cid is not null and v_doc is not null and v_cid <> v_doc then
    raise exception 'el número coincide con un Customer ID y con el DNI de otro comercio: revisar a mano';
  end if;
  if coalesce(v_cid, v_doc) is null then raise exception 'el identificador no está en la base'; end if;
  return coalesce(v_cid, v_doc);
end $function$;
-- Una fila puede traer documento, customer_id o los dos; si trae los dos y llevan a comercios distintos, se rechaza.
create or replace function public.v2_comercio_de_fila(r jsonb)
 returns text
 language plpgsql
 stable
 set search_path to 'public'
as $function$
declare v_doc text := nullif(btrim(r->>'documento'), ''); v_cid text := nullif(btrim(r->>'customer_id'), ''); a text; b text;
begin
  if v_doc is not null then a := public.v2_comercio_de_id(v_doc); end if;
  if v_cid is not null then b := public.v2_comercio_de_id(v_cid); end if;
  if a is not null and b is not null and a <> b then raise exception 'documento y customer_id llevan a comercios distintos'; end if;
  if coalesce(a, b) is null then raise exception 'la fila no trae documento ni customer_id'; end if;
  return coalesce(a, b);
end $function$;
revoke execute on function public.v2_comercio_de_fila(jsonb) from public, anon, authenticated;
grant execute on function public.v2_comercio_de_fila(jsonb) to service_role;
-- Solo la usan las funciones de carga (security definer, dueño postgres): nadie la llama directo.
revoke execute on function public.v2_comercio_de_id(text) from public, anon, authenticated;
grant execute on function public.v2_comercio_de_id(text) to service_role;

-- 2. Resultados de BBVA con customer_id de 8 u 11 dígitos -----------------------------------------------------------
alter table public.v2_resultados_bbva drop constraint if exists v2_resultados_bbva_customer_id_check;
alter table public.v2_resultados_bbva add constraint v2_resultados_bbva_customer_id_check
  check (customer_id ~ '^[0-9]{8}$' or customer_id ~ '^[0-9]{11}$');

-- 3. Cargas ----------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.v2_cargar_resultados_bbva(p_archivo text, p_corte date, p_filas jsonb, p_facturado_total numeric DEFAULT NULL::numeric, p_notas text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_correo text := public.correo_actual();
  r jsonb; i int := 0; v_ok int := 0; v_rech jsonb := '[]'::jsonb; v_cid text; v_id text; v_reac text; v_fac numeric; v_msg text; v_carga bigint; v_habia boolean;
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
      -- base 2026-11: la fila trae el documento (RUC o DNI) o el Customer ID de BBVA
      v_id := coalesce(nullif(btrim(r->>'documento'), ''), r->>'customer_id');
      v_cid := public.v2_comercio_de_fila(r);
      if jsonb_typeof(r->'gestion_con_contacto') <> 'boolean' then raise exception 'gestion_con_contacto no es Si o No'; end if;
      v_reac := r->>'reactivado';
      if v_reac not in ('Si', 'No', 'En proceso') then raise exception 'reactivado no es Si, No o En proceso'; end if;
      if (r->>'facturado') is not null and (r->>'facturado') !~ '^\d+(\.\d+)?$' then raise exception 'facturado no es un monto'; end if;
      v_fac := (r->>'facturado')::numeric;
      insert into v2_resultados_bbva(corte, customer_id, gestion_con_contacto, reactivado, facturado)
      values (p_corte, v_cid, (r->>'gestion_con_contacto')::boolean, v_reac, v_fac);
      v_ok := v_ok + 1;
    exception when others then
      v_msg := case when sqlstate = '23505' then 'comercio repetido en el archivo' else sqlerrm end;
      if jsonb_array_length(v_rech) < 300 then v_rech := v_rech || jsonb_build_object('fila', i, 'customer_id', v_id, 'motivo', v_msg); end if;
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
end $function$;

CREATE OR REPLACE FUNCTION public.v2_cargar_transacciones(p_archivo text, p_formato text, p_filas jsonb, p_notas text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_correo text := public.correo_actual();
  v_carga bigint; r jsonb; i int := 0; v_ins int := 0; v_upd int := 0;
  v_rech jsonb := '[]'::jsonb; v_cid text; v_fecha date; v_trx int; v_vol numeric; v_existe boolean; v_max date; v_msg text;
begin
  if not public.v2_puede_escritorio() then raise exception 'Solo el analista carga transacciones.'; end if;
  if p_formato not in ('diario','acumulado_mes') then raise exception 'Formato no válido: diario o acumulado_mes.'; end if;
  if jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 then raise exception 'No hay filas que cargar.'; end if;

  insert into v2_cargas(tipo, archivo, formato, filas, notas, por, en)
  values ('transacciones', p_archivo, p_formato, 0, p_notas, v_correo, now()) returning id into v_carga;

  for r in select * from jsonb_array_elements(p_filas) loop
    i := i + 1;
    begin
      -- base 2026-11: la fila trae el documento (RUC o DNI) o el Customer ID de BBVA
      v_cid := public.v2_comercio_de_fila(r);
      if (r->>'fecha_corte') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'fecha_corte no es AAAA-MM-DD'; end if;
      v_fecha := (r->>'fecha_corte')::date;
      if (r->>'trx') !~ '^\d+$' then raise exception 'trx no es un entero'; end if;
      v_trx := (r->>'trx')::int;
      if (r->>'vol') is not null and (r->>'vol') !~ '^-?\d+(\.\d+)?$' then raise exception 'vol no es numérico'; end if;
      v_vol := coalesce((r->>'vol')::numeric, 0); if v_vol < 0 then raise exception 'vol negativo'; end if;
      select true into v_existe from v2_transacciones where customer_id = v_cid and mes = to_char(v_fecha,'YYYY-MM') and fecha_corte = v_fecha;
      insert into v2_transacciones(fecha_corte, customer_id, mes, formato, vol, trx, carga_id)
      values (v_fecha, v_cid, to_char(v_fecha,'YYYY-MM'), p_formato, v_vol, v_trx, v_carga)
      on conflict (customer_id, mes, fecha_corte) do update
        set vol = excluded.vol, trx = excluded.trx, formato = excluded.formato, carga_id = excluded.carga_id;
      if v_existe then v_upd := v_upd + 1; else v_ins := v_ins + 1; end if;
      v_existe := null;
      v_max := greatest(coalesce(v_max, v_fecha), v_fecha);
    exception when others then
      v_msg := case when sqlstate = '22008' or sqlstate = '22007' then 'fecha_corte no es una fecha válida' else sqlerrm end;
      if jsonb_array_length(v_rech) < 300 then
        v_rech := v_rech || jsonb_build_object('fila', i, 'motivo', v_msg);
      end if;
    end;
  end loop;

  update v2_cargas set filas = v_ins + v_upd, fecha_corte = v_max,
         notas = concat_ws(' · ', p_notas, format('%s filas: %s nuevas, %s actualizadas, %s rechazadas', i, v_ins, v_upd, i - v_ins - v_upd))
   where id = v_carga;
  return jsonb_build_object('carga_id', v_carga, 'leidas', i, 'insertadas', v_ins, 'actualizadas', v_upd,
                            'rechazadas', i - v_ins - v_upd, 'detalle', v_rech, 'fecha_corte', v_max);
end $function$;
revoke execute on function public.v2_cargar_resultados_bbva(text, date, jsonb, numeric, text) from public, anon;
grant execute on function public.v2_cargar_resultados_bbva(text, date, jsonb, numeric, text) to authenticated, service_role;
revoke execute on function public.v2_cargar_transacciones(text, text, jsonb, text) from public, anon;
grant execute on function public.v2_cargar_transacciones(text, text, jsonb, text) to authenticated, service_role;
