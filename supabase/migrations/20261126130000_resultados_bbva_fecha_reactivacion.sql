-- Resultados de BBVA con fecha de reactivación (26/11/2026). Decisión de Jose: el archivo de reactivados que arma él trae solo RUC o DNI,
-- Reactivado (Si/No) y Fecha_Reactivacion (la que reporta BBVA). Sirve para el check-in: validar si el ejecutivo gestionó el comercio ANTES de que reactivara.
--
-- Qué cambia:
--   1. v2_resultados_bbva gana fecha_reactivacion (date, opcional): la fecha en que BBVA reporta la reactivación del comercio.
--   2. v2_cargar_resultados_bbva (misma firma) acepta filas sin gestion_con_contacto: en ese caso el CRM la calcula con sus visitas
--      (alguna visita no anulada con contacto, del periodo del corte y hasta la fecha del corte). Si la fila la trae, se respeta.
--      Y acepta fecha_reactivacion (AAAA-MM-DD), que no puede ser posterior al corte.
-- No toca visitas, el bono, el celular ni las demás funciones. Los cortes ya cargados quedan igual (fecha_reactivacion en blanco).
-- Va con el escritorio; se aplica solo con el OK de Jose.

alter table public.v2_resultados_bbva add column if not exists fecha_reactivacion date;

CREATE OR REPLACE FUNCTION public.v2_cargar_resultados_bbva(p_archivo text, p_corte date, p_filas jsonb, p_facturado_total numeric DEFAULT NULL::numeric, p_notas text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_correo text := public.correo_actual();
  r jsonb; i int := 0; v_ok int := 0; v_rech jsonb := '[]'::jsonb; v_cid text; v_id text; v_reac text; v_fac numeric; v_msg text; v_carga bigint; v_habia boolean;
  v_gc boolean; v_fecha date;
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
      -- la fila trae el documento (RUC o DNI) o el Customer ID de BBVA
      v_id := coalesce(nullif(btrim(r->>'documento'), ''), r->>'customer_id');
      v_cid := public.v2_comercio_de_fila(r);
      -- gestión con contacto: la trae el archivo o, si no, la calcula el CRM con sus visitas hasta el corte
      if jsonb_typeof(r->'gestion_con_contacto') = 'boolean' then
        v_gc := (r->>'gestion_con_contacto')::boolean;
      elsif r->'gestion_con_contacto' is null or jsonb_typeof(r->'gestion_con_contacto') = 'null' then
        v_gc := exists (select 1 from v2_visitas v join v2_periodos pp on pp.id = v.periodo
                        where p_corte between pp.ini and pp.fin and v.customer_id = v_cid and v.anulada_en is null
                          and v.con is distinct from 'Nadie' and (v.visitado_en at time zone 'America/Lima')::date <= p_corte);
      else
        raise exception 'gestion_con_contacto no es Si o No';
      end if;
      v_reac := r->>'reactivado';
      if v_reac not in ('Si', 'No', 'En proceso') then raise exception 'reactivado no es Si, No o En proceso'; end if;
      v_fecha := null;
      if nullif(btrim(coalesce(r->>'fecha_reactivacion', '')), '') is not null then
        if (r->>'fecha_reactivacion') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'fecha_reactivacion no es una fecha (AAAA-MM-DD)'; end if;
        v_fecha := (r->>'fecha_reactivacion')::date;
        if v_fecha > p_corte then raise exception 'la fecha de reactivación es posterior al corte'; end if;
      end if;
      if (r->>'facturado') is not null and (r->>'facturado') !~ '^\d+(\.\d+)?$' then raise exception 'facturado no es un monto'; end if;
      v_fac := (r->>'facturado')::numeric;
      insert into v2_resultados_bbva(corte, customer_id, gestion_con_contacto, reactivado, facturado, fecha_reactivacion)
      values (p_corte, v_cid, v_gc, v_reac, v_fac, v_fecha);
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
