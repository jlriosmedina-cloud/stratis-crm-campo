-- 03/11/2026 (Jose): las 4 fases de la tipificación de BBVA (motivo → submotivo → frase → acción y estado).
-- El celular ya guarda la frase (y de ella salen el motivo y el submotivo, en v2_feedback_tipos). Ahora también guarda,
-- dentro de fb_extra (sin cambiar las funciones que registran o corrigen la visita ni la cola sin señal):
--   fb_principal   la frase principal, cuando marcó más de una (una de las marcadas y con acción de BBVA)
--   accion_estado  cómo quedó lo que pide BBVA para esa frase: Hecho / En trámite / No se pudo
--   numero_ticket  el ticket o caso de Soporte, si lo hay (hasta 40 caracteres)
-- Al registrar (v2_fb_extra_obs) nada se rechaza: lo que no calza queda en datos_observados y avisa (regla n.º 1).
-- Al corregir (v2_fb_extra_limpio) un valor imposible se rechaza con un mensaje, como el resto de la corrección.
-- Solo cambian estas dos funciones; los permisos se mantienen (create or replace no los toca).

CREATE OR REPLACE FUNCTION public.v2_fb_extra_obs(p jsonb, p_fb text[], OUT limpio jsonb, OUT fuera jsonb)
 RETURNS record
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r jsonb := '{}'::jsonb; f jsonb := '{}'::jsonb; v text[]; t numeric; o text; d numeric;
begin
  if p is null or p_fb is null or jsonb_typeof(p) <> 'object' then return; end if;
  if 'Usa POS de otra marca' = any(p_fb) then
    select array_agg(x order by array_position(array['Niubiz','Izipay','Culqi','Mercado Pago','Otro'], x)) into v
      from (select distinct x from jsonb_array_elements_text(case when jsonb_typeof(p->'competidores') = 'array' then p->'competidores' else '[]'::jsonb end) x
             where x = any(array['Niubiz','Izipay','Culqi','Mercado Pago','Otro'])) s;
    if v is not null then r := r || jsonb_build_object('competidores', to_jsonb(v)); end if;
    o := nullif(btrim(coalesce(p->>'competidor_otro', '')), '');
    if o is not null and 'Otro' = any(coalesce(v, '{}')) then
      if char_length(o) > 60 then f := f || jsonb_build_object('competidor_otro', p->'competidor_otro');
      else r := r || jsonb_build_object('competidor_otro', o); end if;
    end if;
    if nullif(btrim(coalesce(p->>'tasa_competidor', '')), '') is not null then
      begin t := replace(p->>'tasa_competidor', ',', '.')::numeric; exception when others then t := null; end;
      if t is null or t <= 0 or t > 15 then f := f || jsonb_build_object('tasa_competidor', p->'tasa_competidor');
      else r := r || jsonb_build_object('tasa_competidor', round(t, 2)); end if;
    end if;
    select array_agg(x order by array_position(array['Tasa','Abono más rápido','Equipo o señal','Costumbre o atención'], x)) into v
      from (select distinct x from jsonb_array_elements_text(case when jsonb_typeof(p->'prefiere_por') = 'array' then p->'prefiere_por' else '[]'::jsonb end) x
             where x = any(array['Tasa','Abono más rápido','Equipo o señal','Costumbre o atención'])) s;
    if v is not null then r := r || jsonb_build_object('prefiere_por', to_jsonb(v)); end if;
  end if;
  if 'No necesitaba los POS' = any(p_fb) then
    o := p->>'no_necesita_por';
    if o = any(array['Pocas ventas con tarjeta','Negocio cerrado o por cerrar','Otro motivo']) then
      r := r || jsonb_build_object('no_necesita_por', o);
    end if;
  end if;
  if 'Los abonos le llegan con demora' = any(p_fb) then
    if nullif(btrim(coalesce(p->>'dias_demora_abono', '')), '') is not null then
      begin d := replace(p->>'dias_demora_abono', ',', '.')::numeric; exception when others then d := null; end;
      if d is null or d < 1 or d > 60 or d <> trunc(d) then f := f || jsonb_build_object('dias_demora_abono', p->'dias_demora_abono');
      else r := r || jsonb_build_object('dias_demora_abono', d::int); end if;
    end if;
    o := p->>'banco_abono';
    if o = any(array['BBVA','Otro banco']) then r := r || jsonb_build_object('banco_abono', o); end if;
  end if;
  -- 03/11: frase principal, estado de la acción de BBVA y ticket. El estado y el ticket solo valen con una principal válida.
  o := nullif(btrim(coalesce(p->>'fb_principal', '')), '');
  if o is not null then
    if o = any(p_fb) and exists (select 1 from v2_feedback_tipos where texto = o and accion_bbva is not null) then
      r := r || jsonb_build_object('fb_principal', o);
    else f := f || jsonb_build_object('fb_principal', p->'fb_principal'); end if;
  end if;
  o := nullif(btrim(coalesce(p->>'accion_estado', '')), '');
  if o is not null then
    if r ? 'fb_principal' and o = any(array['Hecho','En trámite','No se pudo']) then r := r || jsonb_build_object('accion_estado', o);
    else f := f || jsonb_build_object('accion_estado', p->'accion_estado'); end if;
  end if;
  o := nullif(btrim(coalesce(p->>'numero_ticket', '')), '');
  if o is not null then
    if r ? 'accion_estado' and char_length(o) <= 40 then r := r || jsonb_build_object('numero_ticket', o);
    else f := f || jsonb_build_object('numero_ticket', p->'numero_ticket'); end if;
  end if;
  limpio := nullif(r, '{}'::jsonb); fuera := nullif(f, '{}'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION public.v2_fb_extra_limpio(p jsonb, p_fb text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r jsonb := '{}'::jsonb; v text[]; t numeric; o text; d numeric;
begin
  if p is null or p_fb is null or jsonb_typeof(p) <> 'object' then return null; end if;
  if 'Usa POS de otra marca' = any(p_fb) then
    select array_agg(x order by array_position(array['Niubiz','Izipay','Culqi','Mercado Pago','Otro'], x)) into v
      from (select distinct x from jsonb_array_elements_text(coalesce(p->'competidores', '[]')) x
             where x = any(array['Niubiz','Izipay','Culqi','Mercado Pago','Otro'])) s;
    if v is not null then r := r || jsonb_build_object('competidores', to_jsonb(v)); end if;
    o := nullif(btrim(coalesce(p->>'competidor_otro', '')), '');
    if o is not null and 'Otro' = any(coalesce(v, '{}')) then
      if char_length(o) > 60 then raise exception 'El nombre del otro competidor admite hasta 60 caracteres.'; end if;
      r := r || jsonb_build_object('competidor_otro', o);
    end if;
    if nullif(btrim(coalesce(p->>'tasa_competidor', '')), '') is not null then
      begin t := replace(p->>'tasa_competidor', ',', '.')::numeric;
      exception when others then raise exception 'La tasa del competidor debe ser un número (ej.: 2,5).'; end;
      if t <= 0 or t > 15 then raise exception 'La tasa del competidor debe estar entre 0 y 15 %%.'; end if;
      r := r || jsonb_build_object('tasa_competidor', round(t, 2));
    end if;
    select array_agg(x order by array_position(array['Tasa','Abono más rápido','Equipo o señal','Costumbre o atención'], x)) into v
      from (select distinct x from jsonb_array_elements_text(coalesce(p->'prefiere_por', '[]')) x
             where x = any(array['Tasa','Abono más rápido','Equipo o señal','Costumbre o atención'])) s;
    if v is not null then r := r || jsonb_build_object('prefiere_por', to_jsonb(v)); end if;
  end if;
  if 'No necesitaba los POS' = any(p_fb) then
    o := p->>'no_necesita_por';
    if o = any(array['Pocas ventas con tarjeta','Negocio cerrado o por cerrar','Otro motivo']) then
      r := r || jsonb_build_object('no_necesita_por', o);
    end if;
  end if;
  if 'Los abonos le llegan con demora' = any(p_fb) then
    if nullif(btrim(coalesce(p->>'dias_demora_abono', '')), '') is not null then
      begin d := replace(p->>'dias_demora_abono', ',', '.')::numeric;
      exception when others then raise exception 'Los días de demora deben ser un número (ej.: 3).'; end;
      if d < 1 or d > 60 or d <> trunc(d) then raise exception 'Los días de demora deben ser un número entero entre 1 y 60.'; end if;
      r := r || jsonb_build_object('dias_demora_abono', d::int);
    end if;
    o := p->>'banco_abono';
    if o = any(array['BBVA','Otro banco']) then r := r || jsonb_build_object('banco_abono', o); end if;
  end if;
  -- 03/11: frase principal, estado de la acción de BBVA y ticket. Si la principal ya no está entre las frases marcadas
  -- (se desmarcó al corregir), se quitan la principal, el estado y el ticket, sin rechazar la corrección.
  o := nullif(btrim(coalesce(p->>'fb_principal', '')), '');
  if o is not null and o = any(p_fb) and exists (select 1 from v2_feedback_tipos where texto = o and accion_bbva is not null) then
    r := r || jsonb_build_object('fb_principal', o);
    o := nullif(btrim(coalesce(p->>'accion_estado', '')), '');
    if o is not null then
      if o <> all(array['Hecho','En trámite','No se pudo']) then raise exception 'El estado de lo que pide BBVA debe ser Hecho, En trámite o No se pudo.'; end if;
      r := r || jsonb_build_object('accion_estado', o);
      o := nullif(btrim(coalesce(p->>'numero_ticket', '')), '');
      if o is not null then
        if char_length(o) > 40 then raise exception 'El número de ticket admite hasta 40 caracteres.'; end if;
        r := r || jsonb_build_object('numero_ticket', o);
      end if;
    end if;
  end if;
  return nullif(r, '{}'::jsonb);
end $function$;
