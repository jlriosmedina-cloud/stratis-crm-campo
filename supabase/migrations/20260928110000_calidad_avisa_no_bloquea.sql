-- Regla n.º 1 (27/09/2026): el medidor de visitas no se toca. Las reglas de calidad avisan, no bloquean.
-- Registrar una visita ya no la rechaza por calidad; se guarda y queda marcada para una señal en el escritorio.
--  1. Fecha de «volver» a más de 10 días hábiles: se guarda con la fecha del ejecutivo y queda marcada en
--     v2_visitas.fecha_lejana (señal «Fecha de volver lejana»). La fecha anterior a la visita sí se rechaza
--     (error de captura). Al corregir se aplica lo mismo.
--  2. «No estaba» en una visita nueva: se guarda como «No atendió», con una línea en la bitácora.
--     Al corregir sigue como en la tanda 1.
--  A. Feedback, «Qué ofreciste» o «Qué lo convenció» fuera de la lista (o que no corresponde a la rama marcada):
--     los campos limpios quedan solo con lo válido y lo que no calzó se guarda tal cual en
--     v2_visitas.datos_observados, con su línea en la bitácora. «Sin observaciones del comercio» combinado con
--     otra opción: se queda la otra y se anota.
--  B. Datos del detalle fuera de rango (tasa del competidor, días de demora, nombre del otro POS): igual que A.
--  C. Textos largos (feedback adicional, dictado, nueva dirección): se recortan al límite y el texto completo
--     queda en la bitácora.
--  F. Hora del celular a más de 10 minutos en el futuro: se guarda con la hora del servidor; la del celular queda
--     en la bitácora y en datos_observados.hora_celular (señal «Hora del celular corregida»).
-- Al corregir (v2_editar_resultado), A, B y C siguen como estaban: un rechazo ahí no pierde la visita.
-- v2_actividad devuelve fecha_lejana y datos_observados al final (el resto igual). Se aplica solo con el OK de Jose.

alter table public.v2_visitas add column if not exists fecha_lejana boolean not null default false;
alter table public.v2_visitas add column if not exists datos_observados jsonb;

-- Visitas ya guardadas: hoy ninguna reagendada pasa de 10 días hábiles, pero se marca por si acaso.
update public.v2_visitas
   set fecha_lejana = true
 where que = 'Reagendada' and fecha_reagenda > public.v2_limite_habil((visitado_en at time zone 'America/Lima')::date, 10);

-- ============ A y B. Limpieza que no rechaza: devuelve lo válido y lo que no calzó ============
-- Las funciones v2_*_limpio (que rechazan) se quedan para v2_editar_resultado.
CREATE OR REPLACE FUNCTION public.v2_feedback_obs(p_feedback text[], p_con text, OUT limpio text[], OUT fuera text[], OUT combinado boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v text[];
begin
  combinado := false;
  if p_con = 'Nadie' or p_feedback is null then return; end if;
  select array_agg(distinct case when btrim(x) = 'Usa POS o pasarela de la competencia' then 'Usa POS de otra marca' else btrim(x) end)
    into v from unnest(p_feedback) x where nullif(btrim(x), '') is not null;
  if v is null then return; end if;
  select array_agg(x order by x) into fuera from unnest(v) x where not exists (select 1 from v2_feedback_tipos t where t.texto = x);
  select array_agg(t.texto order by t.orden) into limpio from v2_feedback_tipos t where t.texto = any(v);
  if 'Sin observaciones del comercio' = any(limpio) and cardinality(limpio) > 1 then
    limpio := array_remove(limpio, 'Sin observaciones del comercio'); combinado := true;
  end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.v2_fb_acciones_obs(p_acc text[], p_fb text[], OUT limpio text[], OUT fuera text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v text[]; v_ramas text[];
begin
  if p_acc is null then return; end if;
  select array_agg(distinct case when btrim(x) = 'Solicité cambio de equipo' then 'Solicité cambio de equipo (sin costo)' else btrim(x) end)
    into v from unnest(p_acc) x where nullif(btrim(x), '') is not null;
  if v is null then return; end if;
  if p_fb is not null then
    select array_agg(distinct grupo) into v_ramas from v2_feedback_tipos where texto = any(p_fb) and grupo <> 'Sin observaciones';
  end if;
  select array_agg(a.texto order by a.orden, a.texto desc) into limpio
    from v2_feedback_acciones a where a.texto = any(v) and a.ramas && coalesce(v_ramas, '{}'::text[]);
  select array_agg(x order by x) into fuera from unnest(v) x where not (x = any(coalesce(limpio, '{}'::text[])));
end $function$
;

CREATE OR REPLACE FUNCTION public.v2_fb_extra_obs(p jsonb, p_fb text[], OUT limpio jsonb, OUT fuera jsonb)
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
  limpio := nullif(r, '{}'::jsonb); fuera := nullif(f, '{}'::jsonb);
end $function$
;

CREATE OR REPLACE FUNCTION public.v2_motivos_si_obs(p text[], p_decision text, OUT limpio text[], OUT fuera text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v text[];
begin
  if p_decision is distinct from 'Realizará consumos' or p is null then return; end if;
  select array_agg(distinct btrim(x)) into v from unnest(p) x where nullif(btrim(x), '') is not null;
  if v is null then return; end if;
  select array_agg(x order by x) into fuera from unnest(v) x where not exists (select 1 from v2_motivo_si_tipos t where t.texto = x);
  select array_agg(t.texto order by t.orden) into limpio from v2_motivo_si_tipos t where t.texto = any(v);
end $function$
;

revoke execute on function public.v2_feedback_obs(text[], text) from public, anon;
revoke execute on function public.v2_fb_acciones_obs(text[], text[]) from public, anon;
revoke execute on function public.v2_fb_extra_obs(jsonb, text[]) from public, anon;
revoke execute on function public.v2_motivos_si_obs(text[], text) from public, anon;

-- ============ 1, 2, A, B, C y F. Registrar ============
CREATE OR REPLACE FUNCTION public.v2_registrar_visita(p_customer_id text, p_visitado_en timestamp with time zone, p_lat double precision, p_lng double precision, p_precision numeric, p_con text, p_motivo text, p_que text, p_decision text, p_equipo text, p_fecha_reagenda date, p_comentario text, p_cliente_uid text, p_direccion_ok boolean DEFAULT NULL::boolean, p_feedback text[] DEFAULT NULL::text[], p_feedback_nota text DEFAULT NULL::text, p_motivos_si text[] DEFAULT NULL::text[], p_comercio_ubicado boolean DEFAULT NULL::boolean, p_direccion_nueva text DEFAULT NULL::text, p_fb_acciones text[] DEFAULT NULL::text[], p_fb_extra jsonb DEFAULT NULL::jsonb, p_comentario_voz text DEFAULT NULL::text, p_ia_propuesta jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_correo text := public.correo_actual();
  v_per text; v_id uuid; v_dueno text; v_existe boolean; v_fin date;
  v_clat double precision; v_clng double precision; v_dist integer;
  v_dia date := (p_visitado_en at time zone 'America/Lima')::date;
  v_fb text[]; v_fbn text; v_msi text[]; v_dok boolean; v_ubi boolean; v_dnu text; v_acc text[]; v_ext jsonb; v_voz text;
  v_hora_dup text; v_lejana boolean := false; v_mot text; v_conv boolean := false;
  v_visitado timestamptz := p_visitado_en; v_obs jsonb := '{}'::jsonb; v_calidad jsonb := '{}'::jsonb; v_rec jsonb := '{}'::jsonb;
  v_fb_fuera text[]; v_comb boolean; v_acc_fuera text[]; v_ext_fuera jsonb; v_msi_fuera text[]; k text;
begin
  if not public.es_usuario_activo() then raise exception 'Tu usuario no está activo.'; end if;
  if p_cliente_uid is not null then
    select id into v_id from v2_visitas where cliente_uid = p_cliente_uid;
    if v_id is not null then return v_id; end if;
  end if;

  -- F. Hora del celular adelantada: se usa la del servidor y la del celular queda anotada.
  if p_visitado_en > now() + interval '10 minutes' then
    v_visitado := now();
    v_obs := v_obs || jsonb_build_object('hora_celular', p_visitado_en);
  end if;
  v_dia := (v_visitado at time zone 'America/Lima')::date;

  -- A y B. Los campos limpios quedan solo con lo válido; lo que no calzó va a datos_observados.
  if p_con <> 'Nadie' then
    select o.limpio, o.fuera, o.combinado into v_fb, v_fb_fuera, v_comb from public.v2_feedback_obs(
             case when p_que = 'Reagendada'
                  then array_remove(coalesce(p_feedback, '{}'::text[]), 'Sin observaciones del comercio') || array['No se encontraba la persona que tomaba decisiones']
                  else p_feedback end, p_con) o;
    select o.limpio, o.fuera into v_acc, v_acc_fuera from public.v2_fb_acciones_obs(
             case when p_que = 'Reagendada' then coalesce(p_fb_acciones, '{}'::text[]) || array['Reagendé con quien decide']
                  else array_remove(p_fb_acciones, 'Reagendé con quien decide') end, v_fb) o;
    select o.limpio, o.fuera into v_ext, v_ext_fuera from public.v2_fb_extra_obs(p_fb_extra, v_fb) o;
    if p_que = 'Reunión concretada' then
      select o.limpio, o.fuera into v_msi, v_msi_fuera from public.v2_motivos_si_obs(p_motivos_si, p_decision) o;
    end if;
  end if;
  if cardinality(v_acc) = 0 then v_acc := null; end if;
  if v_fb_fuera is not null then v_calidad := v_calidad || jsonb_build_object('feedback', to_jsonb(v_fb_fuera)); end if;
  if v_comb then v_calidad := v_calidad || jsonb_build_object('sin_observaciones_combinado', true); end if;
  if v_acc_fuera is not null then v_calidad := v_calidad || jsonb_build_object('fb_acciones', to_jsonb(v_acc_fuera)); end if;
  if v_ext_fuera is not null then v_calidad := v_calidad || jsonb_build_object('fb_extra', v_ext_fuera); end if;
  if v_msi_fuera is not null then v_calidad := v_calidad || jsonb_build_object('motivos_si', to_jsonb(v_msi_fuera)); end if;
  v_obs := v_obs || v_calidad;

  v_fbn := case when p_con <> 'Nadie' then nullif(btrim(coalesce(p_feedback_nota, '')), '') end;
  v_dok := case when p_con = 'Nadie' and p_motivo = 'Dirección errada' then false else p_direccion_ok end;
  v_ubi := case when v_dok = false then p_comercio_ubicado end;
  v_dnu := case when v_ubi then nullif(btrim(coalesce(p_direccion_nueva, '')), '') end;
  v_voz := nullif(btrim(coalesce(p_comentario_voz, '')), '');

  -- C. Textos largos: se recortan al límite y el texto completo queda en la bitácora.
  if char_length(v_fbn) > 300 then v_rec := v_rec || jsonb_build_object('feedback adicional', v_fbn); v_fbn := left(v_fbn, 300); end if;
  if char_length(v_voz) > 4000 then v_rec := v_rec || jsonb_build_object('texto dictado', v_voz); v_voz := left(v_voz, 4000); end if;
  if char_length(v_dnu) > 200 then v_rec := v_rec || jsonb_build_object('dirección donde está el comercio', v_dnu); v_dnu := left(v_dnu, 200); end if;

  -- «No estaba» (valor anterior al 26/09) se guarda como «No atendió»; queda una línea en la bitácora.
  v_mot := case when p_con = 'Nadie' then p_motivo end;
  if v_mot = 'No estaba' then v_mot := 'No atendió'; v_conv := true; end if;

  if p_con <> 'Nadie' then
    if p_que = 'Reunión concretada' and p_decision is null then raise exception 'Elige qué decidió el comercio.'; end if;
    if p_decision = 'Desiste del producto' and p_equipo is null then raise exception 'Indica si se recuperó el equipo.'; end if;
    if p_que = 'Reagendada' and p_fecha_reagenda is null then raise exception 'Indica la fecha en que vuelves.'; end if;
    if p_que = 'Reagendada' and p_fecha_reagenda < v_dia then raise exception 'La fecha en que vuelves no puede ser anterior a la visita.'; end if;
    -- Más de 10 días hábiles: se guarda igual y queda marcada para la señal «Fecha de volver lejana».
    if p_que = 'Reagendada' then v_lejana := p_fecha_reagenda > public.v2_limite_habil(v_dia, 10); end if;
  end if;

  v_per := public.v2_periodo_de(v_dia);
  if v_per is null then raise exception 'La fecha de la visita no cae en ningún periodo abierto.'; end if;
  select fin into v_fin from v2_periodos where id = v_per;
  if (now() at time zone 'America/Lima')::date > v_fin then
    raise exception 'El periodo cerró el %: ya no se reciben visitas de ese periodo.', to_char(v_fin, 'DD/MM');
  end if;
  select true, correo into v_existe, v_dueno from v2_asignaciones where periodo = v_per and customer_id = p_customer_id for update;
  if v_existe is null then raise exception 'Este comercio no está en la base del periodo.'; end if;
  if v_dueno is null then
    update v2_asignaciones set correo = v_correo, tomado_en = now() where periodo = v_per and customer_id = p_customer_id and correo is null;
  elsif v_dueno <> v_correo then
    raise exception 'Este comercio ya lo está trabajando otro ejecutivo.';
  end if;

  select to_char(visitado_en at time zone 'America/Lima', 'HH24:MI') into v_hora_dup
    from v2_visitas where customer_id = p_customer_id and anulada_en is null
     and (visitado_en at time zone 'America/Lima')::date = v_dia
   order by visitado_en limit 1;
  if v_hora_dup is not null then
    raise exception 'Este comercio ya tiene una visita el % a las %. Corrige esa visita en lugar de registrar otra.', to_char(v_dia, 'DD/MM'), v_hora_dup;
  end if;

  select geo_lat, geo_lng into v_clat, v_clng from v2_comercios where customer_id = p_customer_id;
  v_dist := public.v2_metros(p_lat, p_lng, v_clat, v_clng);

  insert into v2_visitas(periodo, customer_id, correo, visitado_en, lat, lng, precision_m, distancia_m,
                         con, motivo, que, decision, equipo, fecha_reagenda, comentario, cliente_uid, direccion_ok,
                         feedback, feedback_nota, motivos_si, comercio_ubicado, direccion_nueva,
                         fb_acciones, fb_extra, comentario_voz, ia_propuesta, fecha_lejana, datos_observados)
  values (v_per, p_customer_id, v_correo, v_visitado, p_lat, p_lng, p_precision, v_dist, p_con,
          v_mot,
          case when p_con = 'Nadie' then 'Sin éxito' else p_que end,
          case when p_que = 'Reunión concretada' then p_decision end,
          case when p_decision = 'Desiste del producto' then p_equipo end,
          case when p_que = 'Reagendada' then p_fecha_reagenda end,
          btrim(p_comentario), p_cliente_uid, v_dok,
          v_fb, v_fbn, v_msi, v_ubi, v_dnu, v_acc, v_ext, v_voz, p_ia_propuesta, v_lejana, nullif(v_obs, '{}'::jsonb))
  returning id into v_id;
  if v_calidad <> '{}'::jsonb then
    insert into v2_bitacora_visita(visita_id, accion, por, antes, despues)
    values (v_id, 'resultado', 'automática', 'No calzó con la lista: ' || v_calidad::text,
            'Guardada solo con los valores válidos; lo que no calzó queda en datos_observados');
  end if;
  for k in select jsonb_object_keys(v_rec) loop
    insert into v2_bitacora_visita(visita_id, accion, por, antes, despues)
    values (v_id, 'resultado', 'automática', 'Texto completo de ' || k || ' (' || char_length(v_rec->>k) || ' caracteres): ' || (v_rec->>k),
            'Guardado recortado al límite');
  end loop;
  if v_obs ? 'hora_celular' then
    insert into v2_bitacora_visita(visita_id, accion, por, antes, despues)
    values (v_id, 'resultado', 'automática', 'Hora del celular: ' || to_char(p_visitado_en at time zone 'America/Lima', 'DD/MM/YYYY HH24:MI:SS'),
            'Hora del servidor: ' || to_char(v_visitado at time zone 'America/Lima', 'DD/MM/YYYY HH24:MI:SS') || ' · la del celular estaba adelantada');
  end if;
  if v_conv then
    insert into v2_bitacora_visita(visita_id, accion, por, antes, despues)
    values (v_id, 'resultado', 'automática', 'Nadie · No estaba (enviado por el celular)', 'Nadie · No atendió · «No estaba» ya no se usa desde el 26/09');
  end if;
  return v_id;
end $function$
;

-- ============ 1. Corregir ============
CREATE OR REPLACE FUNCTION public.v2_editar_resultado(p_visita_id uuid, p_con text, p_motivo text, p_que text, p_decision text, p_equipo text, p_fecha_reagenda date, p_comentario text, p_feedback text[] DEFAULT NULL::text[], p_feedback_nota text DEFAULT NULL::text, p_motivos_si text[] DEFAULT NULL::text[], p_fb_acciones text[] DEFAULT NULL::text[], p_fb_extra jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_correo text := public.correo_actual();
  v_admin  boolean := public.es_admin();
  v_dueno text; v_dia date; v_limite date; v_antes text; v_despues text;
  v_con text := btrim(coalesce(p_con,''));
  v_que text; v_motivo text; v_decision text; v_equipo text; v_fecha date; v_lejana boolean := false;
  v_com text := btrim(coalesce(p_comentario,''));
  v_fb0 text[]; v_fbn0 text; v_fb text[]; v_fbn text; v_msi0 text[]; v_msi text[];
  v_acc0 text[]; v_ext0 jsonb; v_acc text[]; v_ext jsonb;
  v_mot0 text; v_dok0 boolean; v_ubi0 boolean; v_dnu0 text; v_dok boolean; v_ubi boolean; v_dnu text;
begin
  if not public.es_usuario_activo() then raise exception 'Tu usuario no está activo.'; end if;

  select correo, (visitado_en at time zone 'America/Lima')::date,
         public.v2_resumen_visita(con, motivo, que, decision, equipo, fecha_reagenda, comentario),
         feedback, feedback_nota, motivos_si, fb_acciones, fb_extra,
         motivo, direccion_ok, comercio_ubicado, direccion_nueva
    into v_dueno, v_dia, v_antes, v_fb0, v_fbn0, v_msi0, v_acc0, v_ext0,
         v_mot0, v_dok0, v_ubi0, v_dnu0
  from v2_visitas where id = p_visita_id and anulada_en is null;

  if v_dueno is null then raise exception 'Esa visita no existe o está anulada.'; end if;
  if not v_admin and v_dueno <> v_correo then raise exception 'Solo puedes corregir tus propias visitas.'; end if;

  if not v_admin then
    v_limite := public.v2_limite_habil(v_dia, 2);
    if (now() at time zone 'America/Lima')::date > v_limite then
      raise exception 'El plazo para corregir esta visita venció el %.', to_char(v_limite, 'DD/MM');
    end if;
  end if;

  if v_con not in ('Dueño','Tercero','Nadie') then raise exception 'Con quién hablaste no es válido.'; end if;
  if v_com = '' or length(v_com) < 5 then raise exception 'El comentario tiene que decir algo: escribe al menos 5 caracteres.'; end if;

  if v_con = 'Nadie' then
    v_motivo := nullif(btrim(coalesce(p_motivo,'')),'');
    -- «No estaba» solo se conserva en las visitas antiguas que ya lo tenían
    if v_motivo not in ('Cerrado','No atendió','Dirección errada')
       and not (v_motivo = 'No estaba' and v_mot0 = 'No estaba') then
      raise exception 'Elige por qué no hubo contacto: local cerrado, nadie atendió o el comercio no está en esta dirección.';
    end if;
    v_que := 'Sin éxito'; v_decision := null; v_equipo := null; v_fecha := null;
  else
    v_motivo := null;
    v_que := nullif(btrim(coalesce(p_que,'')),'');
    if v_que not in ('Reunión concretada','Reagendada','Sin éxito') then raise exception 'Elige qué pasó en la visita.'; end if;

    if v_que = 'Reunión concretada' then
      v_decision := nullif(btrim(coalesce(p_decision,'')),'');
      if v_decision not in ('Realizará consumos','Aún no decide','Desiste del producto') then raise exception 'Elige qué decidió el comercio.'; end if;
      if v_decision = 'Desiste del producto' then
        v_equipo := nullif(btrim(coalesce(p_equipo,'')),'');
        if v_equipo not in ('Sí','No','Pendiente') then raise exception 'Indica si se recuperó el equipo.'; end if;
      else v_equipo := null; end if;
    else v_decision := null; v_equipo := null; end if;

    if v_que = 'Reagendada' then
      v_fecha := p_fecha_reagenda;
      if v_fecha is null then raise exception 'Indica la fecha en que vuelves.'; end if;
      if v_fecha < v_dia then raise exception 'La fecha en que vuelves no puede ser anterior a la visita.'; end if;
      -- Más de 10 días hábiles: se guarda igual y queda marcada para la señal «Fecha de volver lejana».
      v_lejana := v_fecha > public.v2_limite_habil(v_dia, 10);
    else v_fecha := null; end if;
  end if;

  -- Dirección de la base: «no está en esta dirección» la marca errada (no ubicado).
  -- Si se corrige desde «no está en esta dirección» a una visita con contacto, queda sin dato (null):
  -- pudo haberlo encontrado en otro lugar. Si se corrige a local cerrado o nadie atendió, el local está ahí.
  v_dok := v_dok0; v_ubi := v_ubi0; v_dnu := v_dnu0;
  if v_con = 'Nadie' and v_motivo = 'Dirección errada' then
    v_dok := false; v_ubi := false; v_dnu := null;
  elsif v_mot0 = 'Dirección errada' then
    v_dok := case when v_con = 'Nadie' then true end; v_ubi := null; v_dnu := null;
  end if;

  if v_con = 'Nadie' then v_fb := null; v_fbn := null; v_acc := null; v_ext := null;
  elsif p_feedback is null then v_fb := v_fb0; v_fbn := v_fbn0; v_acc := v_acc0; v_ext := v_ext0;
  else
    v_fb := public.v2_feedback_limpio(p_feedback, v_con);
    v_fbn := nullif(btrim(coalesce(p_feedback_nota, '')), '');
    if char_length(v_fbn) > 300 then raise exception 'El feedback adicional admite hasta 300 caracteres.'; end if;
    v_acc := public.v2_fb_acciones_limpio(p_fb_acciones, v_fb);
    v_ext := public.v2_fb_extra_limpio(p_fb_extra, v_fb);
  end if;

  if v_con <> 'Nadie' then
    if v_que = 'Reagendada' then
      v_fb := public.v2_feedback_limpio(array_remove(coalesce(v_fb, '{}'::text[]), 'Sin observaciones del comercio') || array['No se encontraba la persona que tomaba decisiones'], v_con);
      v_acc := public.v2_fb_acciones_limpio(coalesce(v_acc, '{}'::text[]) || array['Reagendé con quien decide'], v_fb);
    else
      v_acc := public.v2_fb_acciones_limpio(array_remove(v_acc, 'Reagendé con quien decide'), v_fb);
    end if;
    if cardinality(v_acc) = 0 then v_acc := null; end if;
    v_ext := public.v2_fb_extra_limpio(v_ext, v_fb);
  end if;

  if v_decision is distinct from 'Realizará consumos' then v_msi := null;
  elsif p_motivos_si is null then v_msi := v_msi0;
  else v_msi := public.v2_motivos_si_limpio(p_motivos_si, v_decision); end if;

  v_antes := v_antes || coalesce(' · Feedback: ' || array_to_string(v_fb0, ' | '), '') || coalesce(' · Nota: ' || v_fbn0, '')
             || coalesce(' · Qué ofreció: ' || array_to_string(v_acc0, ' | '), '') || coalesce(' · Detalle: ' || v_ext0::text, '')
             || coalesce(' · Por qué sí: ' || array_to_string(v_msi0, ' | '), '')
             || coalesce(' · Dirección de la base: ' || case when v_dok0 then 'correcta' when v_ubi0 then 'errada, lo ubicó en otra dirección' when v_dok0 = false then 'errada, no lo ubicó' end, '');
  v_despues := public.v2_resumen_visita(v_con, v_motivo, v_que, v_decision, v_equipo, v_fecha, v_com)
               || coalesce(' · Feedback: ' || array_to_string(v_fb, ' | '), '') || coalesce(' · Nota: ' || v_fbn, '')
               || coalesce(' · Qué ofreció: ' || array_to_string(v_acc, ' | '), '') || coalesce(' · Detalle: ' || v_ext::text, '')
               || coalesce(' · Por qué sí: ' || array_to_string(v_msi, ' | '), '')
               || coalesce(' · Dirección de la base: ' || case when v_dok then 'correcta' when v_ubi then 'errada, lo ubicó en otra dirección' when v_dok = false then 'errada, no lo ubicó' end, '');
  if v_antes is not distinct from v_despues then return; end if;

  update v2_visitas set con = v_con, motivo = v_motivo, que = v_que, decision = v_decision,
         equipo = v_equipo, fecha_reagenda = v_fecha, comentario = v_com,
         feedback = v_fb, feedback_nota = v_fbn, motivos_si = v_msi, fb_acciones = v_acc, fb_extra = v_ext,
         direccion_ok = v_dok, comercio_ubicado = v_ubi, direccion_nueva = v_dnu,
         fecha_lejana = v_lejana,
         resultado_editado_en = now(), resultado_editado_por = v_correo
  where id = p_visita_id;

  insert into v2_bitacora_visita(visita_id, accion, por, antes, despues)
  values (p_visita_id, 'resultado', v_correo, v_antes, v_despues);
end $function$
;

-- ============ v2_actividad con fecha_lejana y datos_observados ============
-- Cambia la lista de columnas que devuelve, por eso se borra y se vuelve a crear con los mismos permisos.
drop function if exists public.v2_actividad(date, date);
CREATE OR REPLACE FUNCTION public.v2_actividad(p_desde date DEFAULT NULL::date, p_hasta date DEFAULT NULL::date)
 RETURNS TABLE(id uuid, visitado_en timestamp with time zone, recibido_en timestamp with time zone, correo text, ejecutivo text, customer_id text, comercio text, distrito text, direccion text, ruta text, con text, que text, motivo text, decision text, equipo text, fecha_reagenda date, comentario text, comentario_editado_en timestamp with time zone, editado_en timestamp with time zone, lat double precision, lng double precision, precision_m numeric, distancia_m integer, geo_calidad text, estado_anul text, anul_motivo text, anul_nota text, anul_pedida_por text, puede_editar boolean, limite_edicion date, es_mia boolean, validacion text, validacion_en timestamp with time zone, validacion_por text, validacion_motivo text, validacion_nota text, periodo text, razon_social text, ruc text, terminales integer, tasa_debito numeric, tasa_credito numeric, orden integer, geo_lat double precision, geo_lng double precision, anul_pedida_en timestamp with time zone, resultado_editado_en timestamp with time zone, ref_lat double precision, ref_lng double precision, ref_calidad text, ref_nota text, direccion_ok boolean, plazo_hasta date, fuera_plazo boolean, ubicacion_editada_en timestamp with time zone, feedback text[], feedback_nota text, motivos_si text[], comercio_ubicado boolean, direccion_nueva text, fb_acciones text[], fb_extra jsonb, comentario_voz text, ia_propuesta jsonb, fecha_lejana boolean, datos_observados jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with r as (
    select coalesce(p_desde, (now() at time zone 'America/Lima')::date) d1,
           coalesce(p_hasta, p_desde, (now() at time zone 'America/Lima')::date) d2
  ),
  yo as (select public.correo_actual() c, public.es_admin() adm, (now() at time zone 'America/Lima')::date hoy)
  select v.id, v.visitado_en, v.recibido_en,
         v.correo, coalesce(u.nombre_corto, u.nombre, v.correo),
         c.customer_id, coalesce(nullif(btrim(c.nombre_comercial), ''), c.razon_social),
         c.distrito, coalesce(nullif(btrim(c.direccion_corregida), ''), c.direccion), a.ruta,
         v.con, v.que, v.motivo, v.decision, v.equipo, v.fecha_reagenda,
         v.comentario, v.comentario_editado_en,
         greatest(v.comentario_editado_en, v.resultado_editado_en),
         v.lat, v.lng, v.precision_m, v.distancia_m, c.geo_calidad,
         case when v.anulada_en is not null then 'anulada'
              when v.anul_pedida_en is not null and v.anul_resuelta_en is null then 'pendiente'
              when v.anul_resuelta_en is not null then 'rechazada'
              else 'activa' end,
         coalesce(v.anulada_motivo, v.anul_pedida_motivo), v.anul_resuelta_nota, v.anul_pedida_por,
         v.anulada_en is null and (yo.adm or (v.correo = yo.c and yo.hoy <= lim.d)),
         lim.d,
         v.correo = yo.c,
         v.validacion, v.validacion_en, v.validacion_por, v.validacion_motivo, v.validacion_nota,
         v.periodo, c.razon_social, c.ruc, c.terminales, c.tasa_debito, c.tasa_credito, a.orden,
         c.geo_lat, c.geo_lng, v.anul_pedida_en, v.resultado_editado_en,
         v.ref_lat, v.ref_lng, v.ref_calidad, v.ref_nota, v.direccion_ok,
         v.plazo_hasta, v.fuera_plazo, v.ubicacion_editada_en, v.feedback, v.feedback_nota, v.motivos_si,
         v.comercio_ubicado, v.direccion_nueva, v.fb_acciones, v.fb_extra, v.comentario_voz, v.ia_propuesta, v.fecha_lejana, v.datos_observados
  from v2_visitas v
  join v2_comercios c on c.customer_id = v.customer_id
  left join usuarios u on u.correo = v.correo
  left join v2_asignaciones a on a.customer_id = v.customer_id and a.periodo = v.periodo
  cross join r cross join yo
  cross join lateral (select public.v2_limite_habil((v.visitado_en at time zone 'America/Lima')::date, 2) d) lim
  where (v.visitado_en at time zone 'America/Lima')::date between r.d1 and r.d2
    and (yo.adm or v.correo = yo.c)
  order by v.visitado_en desc
$function$
;

revoke execute on function public.v2_actividad(date, date) from public, anon;
grant execute on function public.v2_actividad(date, date) to authenticated, service_role;
