-- Tipificaciones de la visita (29/09/2026): propuesta de Jose aprobada por Gabriel el 28/09.
--  1. «No se pudo hacer la visita» (con = 'Nadie'): además de Cerrado (se lee «Cerrado hoy»), No atendió y
--     Dirección errada, ahora Cerró definitivamente, Zona insegura y Otro motivo. Todas cuentan como visita
--     (Regla n.º 1) y van a «Sin contacto». Con Zona insegura u Otro motivo no se sabe si el local está en la
--     dirección: direccion_ok queda sin dato.
--  2. Con el dueño o el encargado (Reunión concretada) se puede anotar una fecha para volver, con cualquier
--     decisión. Es opcional. Se guarda en fecha_reagenda con las mismas reglas que «Reagendada»: la fecha
--     anterior a la visita se rechaza (error de captura) y la lejana se guarda marcada.
--     No se normaliza a «No se encontraba la persona que tomaba decisiones» ni a «Reagendé con quien decide»:
--     eso sigue solo para Reagendada.
--  3. Cuatro opciones nuevas de feedback, agregadas por Stratis (bbva = false), cada una en la rama de una
--     opción que ya existe.
--  4. v2_mi_base devuelve al final volver_el (la fecha para volver de la última visita) y ultima_motivo (el motivo
--     de la última visita si no se pudo hacer). El estado (esp, seg, rag, sin…) no cambia: el celular usa volver_el
--     para «Reagendados» y ultima_motivo para mostrar «Cerró definitivamente». Por decisión de Jose (29/09), un
--     comercio que cerró definitivamente no pasa a Cancelado: la visita cuenta y el estado lo detalla.
-- Se aplica solo con el OK de Jose, el mismo día en que se publica el celular.

-- ============ 1. Motivos ============
alter table public.v2_visitas drop constraint if exists v2_visitas_motivo_check;
alter table public.v2_visitas add constraint v2_visitas_motivo_check CHECK ((motivo = ANY (ARRAY['Cerrado'::text, 'No estaba'::text, 'No atendió'::text,
  'Dirección errada'::text, 'Cerró definitivamente'::text, 'Zona insegura'::text, 'Otro motivo'::text])));

-- ============ 3. Feedback nuevo ============
insert into public.v2_feedback_tipos(texto, grupo, orden, bbva)
select n.texto, t.grupo, (select coalesce(max(orden), 0) from public.v2_feedback_tipos) + n.i, false
  from (values (1, 'Desconfía de la visita (duda que representemos a BBVA)', 'No necesitaba los POS'),
               (2, 'No pidió el POS', 'No necesitaba los POS'),
               (3, 'Solicitó cambio de equipo', 'POS no enciende'),
               (4, 'Le falta una función', 'Le parece complicado usar el POS')) n(i, texto, hermana)
  join public.v2_feedback_tipos t on t.texto = n.hermana
 where not exists (select 1 from public.v2_feedback_tipos x where x.texto = n.texto);

-- Si alguna opción no entró (por ejemplo, porque su hermana no existe o se escribe distinto), la migración entera
-- se cae: sin esto, corregir una visita con el feedback nuevo fallaría con «no está en la lista».
do $$
begin
  if (select count(*) from public.v2_feedback_tipos where texto in ('Desconfía de la visita (duda que representemos a BBVA)',
        'No pidió el POS', 'Solicitó cambio de equipo', 'Le falta una función')) <> 4 then
    raise exception 'No entraron las 4 opciones nuevas de feedback: revisa que existan sus opciones hermanas en v2_feedback_tipos.';
  end if;
end $$;

-- ============ 1 y 2. Registrar ============
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
  v_hora_dup text; v_lejana boolean := false; v_mot text; v_conv boolean := false; v_fecha date;
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
  -- Zona insegura u Otro motivo: no se sabe si el local está en la dirección.
  v_dok := case when p_con = 'Nadie' and p_motivo = 'Dirección errada' then false
                when p_con = 'Nadie' and p_motivo in ('Zona insegura', 'Otro motivo') then null
                else p_direccion_ok end;
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
    -- 2. La fecha para volver vale con Reagendada (obligatoria) y con el dueño o encargado (opcional).
    if p_que in ('Reagendada', 'Reunión concretada') then v_fecha := p_fecha_reagenda; end if;
    if v_fecha < v_dia then raise exception 'La fecha en que vuelves no puede ser anterior a la visita.'; end if;
    -- Más de 10 días hábiles: se guarda igual y queda marcada para la señal «Fecha de volver lejana».
    if v_fecha is not null then v_lejana := v_fecha > public.v2_limite_habil(v_dia, 10); end if;
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
          v_fecha,
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

-- ============ 1 y 2. Corregir ============
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
    if v_motivo not in ('Cerrado','No atendió','Dirección errada','Cerró definitivamente','Zona insegura','Otro motivo')
       and not (v_motivo = 'No estaba' and v_mot0 = 'No estaba') then
      raise exception 'Elige por qué no se pudo hacer la visita: cerrado hoy, cerró definitivamente, nadie atendió, zona insegura, otro motivo o el comercio no está en esta dirección.';
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

    -- 2. La fecha para volver vale con Reagendada (obligatoria) y con el dueño o encargado (opcional).
    if v_que in ('Reagendada', 'Reunión concretada') then v_fecha := p_fecha_reagenda; else v_fecha := null; end if;
    if v_que = 'Reagendada' and v_fecha is null then raise exception 'Indica la fecha en que vuelves.'; end if;
    if v_fecha < v_dia then raise exception 'La fecha en que vuelves no puede ser anterior a la visita.'; end if;
    -- Más de 10 días hábiles: se guarda igual y queda marcada para la señal «Fecha de volver lejana».
    if v_fecha is not null then v_lejana := v_fecha > public.v2_limite_habil(v_dia, 10); end if;
  end if;

  -- Dirección de la base: «no está en esta dirección» la marca errada (no ubicado).
  -- Si se corrige desde «no está en esta dirección» a una visita con contacto, queda sin dato (null):
  -- pudo haberlo encontrado en otro lugar. Si se corrige a cerrado hoy, cerró definitivamente o nadie atendió,
  -- el local está ahí. Con zona insegura u otro motivo no se sabe: queda sin dato.
  v_dok := v_dok0; v_ubi := v_ubi0; v_dnu := v_dnu0;
  if v_con = 'Nadie' and v_motivo = 'Dirección errada' then
    v_dok := false; v_ubi := false; v_dnu := null;
  elsif v_con = 'Nadie' and v_motivo in ('Zona insegura', 'Otro motivo') then
    v_dok := null; v_ubi := null; v_dnu := null;
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

-- ============ 4. v2_mi_base con volver_el ============
-- Cambia la lista de columnas que devuelve, por eso se borra y se vuelve a crear con los mismos permisos.
drop function if exists public.v2_mi_base(text);
CREATE OR REPLACE FUNCTION public.v2_mi_base(p_periodo text DEFAULT NULL::text)
 RETURNS TABLE(customer_id text, razon_social text, rubro text, departamento text, provincia text, distrito text, direccion text, zona text, tasa_debito numeric, tasa_credito numeric, tasa_foranea numeric, nombre_comercial text, direccion_corregida text, referencia text, contacto text, correo text, ruta text, orden integer, estado_comercio text, visitas integer, visitas_validas integer, ultima_visita timestamp with time zone, ultima_que text, ultima_decision text, dias_trx integer, estado text, referencia_base text, direccion_original text, geo_lat double precision, geo_lng double precision, geo_calidad text, ruc text, terminales integer, tasas_aprox boolean, sunat_direccion text, sunat_lat double precision, sunat_lng double precision, sunat_metros integer, sunat_estado text, dir_extra jsonb, volver_el date, ultima_motivo text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with per as (select coalesce(p_periodo, public.v2_periodo_de((now() at time zone 'America/Lima')::date)) id),
  a as (select a.* from v2_asignaciones a, per where a.periodo = per.id
        and public.es_usuario_activo()
        and (public.es_admin() or a.correo = public.correo_actual() or a.correo is null)),
  vs as (select v.customer_id, count(*)::int n, count(*) filter (where v.lat is not null and not v.fuera_plazo)::int nv, max(v.visitado_en) ult
         from v2_visitas v, per where v.periodo = per.id and v.anulada_en is null group by v.customer_id),
  lv as (select distinct on (v.customer_id) v.customer_id, v.que, v.decision, v.fecha_reagenda, v.motivo from v2_visitas v, per
         where v.periodo = per.id and v.anulada_en is null order by v.customer_id, v.visitado_en desc),
  dx as (select e.customer_id, jsonb_agg(jsonb_build_object('direccion', e.direccion, 'distrito', e.distrito, 'en_zona', e.en_zona, 'verificacion', e.verificacion, 'lat', e.geo_lat, 'lng', e.geo_lng) order by e.orden) l
         from v2_direcciones_extra e where e.activa group by e.customer_id)
  select c.customer_id, c.razon_social, c.rubro, c.departamento, c.provincia, c.distrito, c.direccion, c.zona,
    c.tasa_debito, c.tasa_credito, c.tasa_foranea, c.nombre_comercial, c.direccion_corregida, c.referencia, c.contacto,
    a.correo, a.ruta, a.orden, c.estado, coalesce(vs.n,0), coalesce(vs.nv,0), vs.ult, lv.que, lv.decision, d.dias,
    case when c.estado = 'Cancelado' then 'can'
         when d.dias >= 2 then 'rea'
         when d.dias = 1 then 'uno'
         when lv.decision = 'Realizará consumos' then 'esp'
         when lv.decision = 'Aún no decide' then 'seg'
         when lv.decision = 'Desiste del producto' then 'des'
         when lv.que = 'Reagendada' then 'rag'
         when lv.que = 'Sin éxito' then 'sin'
         when lv.que is not null then 'vis'
         else 'por' end,
    c.referencia_base, c.direccion_original, c.geo_lat, c.geo_lng, c.geo_calidad,
    c.ruc, c.terminales, c.tasas_aprox,
    case when s.difiere then nullif(btrim(coalesce(s.direccion,'')), '') end,
    case when s.difiere then sg.lat end,
    case when s.difiere then sg.lng end,
    case when s.difiere then public.v2_metros(c.geo_lat, c.geo_lng, sg.lat, sg.lng) end,
    nullif(s.estado, 'ACTIVO'),
    dx.l,
    lv.fecha_reagenda,
    lv.motivo
  from a join v2_comercios c on c.customer_id = a.customer_id
  cross join per
  left join vs on vs.customer_id = a.customer_id
  left join lv on lv.customer_id = a.customer_id
  left join v2_sunat s on s.ruc = c.ruc
  left join dx on dx.customer_id = a.customer_id
  cross join lateral (
    select case when s.geo_lat between -12.6 and -11.3 and s.geo_lng between -77.35 and -76.5 then s.geo_lat end lat,
           case when s.geo_lat between -12.6 and -11.3 and s.geo_lng between -77.35 and -76.5 then s.geo_lng end lng
  ) sg
  cross join lateral (select case when vs.n is null then 0 else public.v2_dias_trx(a.customer_id, per.id) end dias) d
$function$
;

revoke execute on function public.v2_mi_base(text) from public, anon;
grant execute on function public.v2_mi_base(text) to authenticated, service_role;
