-- Tanda 1 de la revisión del 27/09/2026 (hallazgos 1, 2, 4, 10, 11 y 14, y atribución de la reactivación).
-- Solo servidor: el celular y el escritorio no cambian. Se aplica solo con el OK de Jose.
--
--  1. Nadie sin sesión (anon/PUBLIC) ejecuta las funciones que leen o cambian datos, y v2_mi_base exige usuario activo.
--  2. Los Managers y Analistas siguen VIENDO todo, pero ya no pueden editar ni borrar visitas o la bitácora
--     directamente: todo cambio pasa por las funciones, que dejan su línea en v2_bitacora_visita.
--  4. Corregir una visita observada la deja «pendiente» (por validar), ya no «validada» sola.
-- 10. La fecha de «quedamos en volver» va desde el día de la visita hasta 10 días hábiles después,
--     al registrar y al corregir.
-- 11. Al corregir desde o hacia «El comercio no está en esta dirección», direccion_ok y comercio_ubicado
--     quedan coherentes: hacia ella, errada y no ubicado; desde ella a una visita con contacto, sin dato (null);
--     desde ella a local cerrado o nadie atendió, correcta. El punto del comercio no se toca.
--  D. Las funciones nuevas que cree postgres ya no nacen ejecutables por anon ni por PUBLIC.
-- 14. «No estaba» (valor anterior al 26/09) ya no se acepta en visitas nuevas ni al cambiar el motivo.
--  R. La reactivación solo se atribuye si antes hubo una visita válida CON contacto. «No hubo contacto»
--     sigue contando como visita para las 160.

-- ============ 1. Permisos de funciones ============
-- Postgres da EXECUTE a PUBLIC al crear una función; por eso se quita de PUBLIC y de anon.
revoke execute on function public.v2_mi_base(text)                          from public, anon;
revoke execute on function public.v2_avance(text)                           from public, anon;
revoke execute on function public.v2_mis_revisiones(text)                   from public, anon;
revoke execute on function public.v2_anular_visita(uuid, text, text)        from public, anon;
revoke execute on function public.v2_resolver_anulacion(uuid, boolean, text) from public, anon;
revoke execute on function public.v2_restituir_visita(uuid, text)           from public, anon;
revoke execute on function public.v2_cargar_transacciones(text, text, jsonb, text) from public, anon;
revoke execute on function public.v2_editar_comentario(uuid, text)          from public, anon;
revoke execute on function public.v2_pedir_anulacion(uuid, text)            from public, anon;

grant execute on function public.v2_mi_base(text)                          to authenticated, service_role;
grant execute on function public.v2_avance(text)                           to authenticated, service_role;
grant execute on function public.v2_mis_revisiones(text)                   to authenticated, service_role;
grant execute on function public.v2_anular_visita(uuid, text, text)        to authenticated, service_role;
grant execute on function public.v2_resolver_anulacion(uuid, boolean, text) to authenticated, service_role;
grant execute on function public.v2_restituir_visita(uuid, text)           to authenticated, service_role;
grant execute on function public.v2_cargar_transacciones(text, text, jsonb, text) to authenticated, service_role;
grant execute on function public.v2_editar_comentario(uuid, text)          to authenticated, service_role;
grant execute on function public.v2_pedir_anulacion(uuid, text)            to authenticated, service_role;

-- Funciones nuevas: cerradas desde que nacen. authenticated y service_role siguen recibiendo EXECUTE
-- por el privilegio por defecto de Supabase en public.
-- · anon está en el privilegio por defecto del esquema public: se quita ahí.
-- · PUBLIC viene del valor global de Postgres, que no se puede quitar por esquema: se quita a nivel global
--   para las funciones que cree postgres (en cualquier esquema).
alter default privileges for role postgres in schema public revoke execute on functions from anon;
alter default privileges for role postgres revoke execute on functions from public;

-- v2_mi_base: igual que antes, más «solo usuarios activos» (antes un usuario inactivo veía los comercios libres).
CREATE OR REPLACE FUNCTION public.v2_mi_base(p_periodo text DEFAULT NULL::text)
 RETURNS TABLE(customer_id text, razon_social text, rubro text, departamento text, provincia text, distrito text, direccion text, zona text, tasa_debito numeric, tasa_credito numeric, tasa_foranea numeric, nombre_comercial text, direccion_corregida text, referencia text, contacto text, correo text, ruta text, orden integer, estado_comercio text, visitas integer, visitas_validas integer, ultima_visita timestamp with time zone, ultima_que text, ultima_decision text, dias_trx integer, estado text, referencia_base text, direccion_original text, geo_lat double precision, geo_lng double precision, geo_calidad text, ruc text, terminales integer, tasas_aprox boolean, sunat_direccion text, sunat_lat double precision, sunat_lng double precision, sunat_metros integer, sunat_estado text, dir_extra jsonb)
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
  lv as (select distinct on (v.customer_id) v.customer_id, v.que, v.decision from v2_visitas v, per
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
    dx.l
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

-- ============ 2. Reglas de las tablas: los administradores solo leen ============
-- Las funciones que escriben son SECURITY DEFINER (dueño postgres) y no dependen de estas reglas.
drop policy if exists v2_vis_adm on public.v2_visitas;
create policy v2_vis_adm on public.v2_visitas as permissive for select to authenticated
  using (( SELECT es_admin() AS es_admin));

-- La lectura de la bitácora para administradores ya la cubre v2_bit_sel.
drop policy if exists v2_bit_adm on public.v2_bitacora_visita;

-- ============ 4. Corregir una observada la deja por validar ============
CREATE OR REPLACE FUNCTION public.v2_revision_tras_correccion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if old.validacion = 'observada' and new.validacion = 'observada'
     and (new.resultado_editado_en is distinct from old.resultado_editado_en
          or new.comentario_editado_en is distinct from old.comentario_editado_en
          or new.ubicacion_editada_en is distinct from old.ubicacion_editada_en) then
    new.validacion := 'pendiente';
    new.validacion_en := now();
    new.validacion_por := 'automática';
    new.validacion_nota := 'Corregida por el ejecutivo tras la observación: ' || coalesce(old.validacion_motivo, '') || '. Espera revisión.';
    insert into v2_bitacora_visita(visita_id, accion, por, antes, despues)
    values (new.id, 'revision', public.correo_actual(), 'observada · ' || coalesce(old.validacion_motivo,''), 'pendiente · corregida por el ejecutivo, espera revisión');
  end if;
  return new;
end $function$
;

-- ============ 10 y 14. Registrar: motivo sin «No estaba» y fecha de volver con tope ============
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
  v_hora_dup text; v_tope date;
begin
  if not public.es_usuario_activo() then raise exception 'Tu usuario no está activo.'; end if;
  if p_cliente_uid is not null then
    select id into v_id from v2_visitas where cliente_uid = p_cliente_uid;
    if v_id is not null then return v_id; end if;
  end if;

  v_fb := public.v2_feedback_limpio(
            case when p_con <> 'Nadie' and p_que = 'Reagendada'
                 then array_remove(coalesce(p_feedback, '{}'::text[]), 'Sin observaciones del comercio') || array['No se encontraba la persona que tomaba decisiones']
                 else p_feedback end, p_con);
  v_acc := public.v2_fb_acciones_limpio(
            case when p_con <> 'Nadie' and p_que = 'Reagendada' then coalesce(p_fb_acciones, '{}'::text[]) || array['Reagendé con quien decide']
                 else array_remove(p_fb_acciones, 'Reagendé con quien decide') end, v_fb);
  if cardinality(v_acc) = 0 then v_acc := null; end if;
  v_ext := public.v2_fb_extra_limpio(p_fb_extra, v_fb);
  v_fbn := case when p_con <> 'Nadie' then nullif(btrim(coalesce(p_feedback_nota, '')), '') end;
  v_msi := case when p_con <> 'Nadie' and p_que = 'Reunión concretada' then public.v2_motivos_si_limpio(p_motivos_si, p_decision) end;
  v_dok := case when p_con = 'Nadie' and p_motivo = 'Dirección errada' then false else p_direccion_ok end;
  v_ubi := case when v_dok = false then p_comercio_ubicado end;
  v_dnu := case when v_ubi then nullif(btrim(coalesce(p_direccion_nueva, '')), '') end;
  v_voz := nullif(btrim(coalesce(p_comentario_voz, '')), '');

  if p_visitado_en > now() + interval '10 minutes' then raise exception 'La hora de la visita no puede ser futura.'; end if;
  if char_length(v_fbn) > 300 then raise exception 'El feedback adicional admite hasta 300 caracteres.'; end if;
  if char_length(v_voz) > 4000 then raise exception 'El texto dictado admite hasta 4000 caracteres.'; end if;
  if char_length(v_dnu) > 200 then raise exception 'La dirección donde está el comercio admite hasta 200 caracteres.'; end if;

  if p_con = 'Nadie' and coalesce(p_motivo, '') not in ('Cerrado','No atendió','Dirección errada') then
    raise exception 'Elige por qué no hubo contacto: local cerrado, nadie atendió o el comercio no está en esta dirección.';
  end if;

  if p_con <> 'Nadie' then
    if p_que = 'Reunión concretada' and p_decision is null then raise exception 'Elige qué decidió el comercio.'; end if;
    if p_decision = 'Desiste del producto' and p_equipo is null then raise exception 'Indica si se recuperó el equipo.'; end if;
    if p_que = 'Reagendada' and p_fecha_reagenda is null then raise exception 'Indica la fecha en que vuelves.'; end if;
    if p_que = 'Reagendada' and p_fecha_reagenda < v_dia then raise exception 'La fecha en que vuelves no puede ser anterior a la visita.'; end if;
    if p_que = 'Reagendada' then
      v_tope := public.v2_limite_habil(v_dia, 10);
      if p_fecha_reagenda > v_tope then
        raise exception 'La fecha en que vuelves puede ser hasta el % (10 días hábiles). Si acordaron algo más lejano, pon la fecha más cercana posible y anota la real en el comentario.', to_char(v_tope, 'DD/MM');
      end if;
    end if;
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
                         fb_acciones, fb_extra, comentario_voz, ia_propuesta)
  values (v_per, p_customer_id, v_correo, p_visitado_en, p_lat, p_lng, p_precision, v_dist, p_con,
          case when p_con = 'Nadie' then p_motivo end,
          case when p_con = 'Nadie' then 'Sin éxito' else p_que end,
          case when p_que = 'Reunión concretada' then p_decision end,
          case when p_decision = 'Desiste del producto' then p_equipo end,
          case when p_que = 'Reagendada' then p_fecha_reagenda end,
          btrim(p_comentario), p_cliente_uid, v_dok,
          v_fb, v_fbn, v_msi, v_ubi, v_dnu, v_acc, v_ext, v_voz, p_ia_propuesta)
  returning id into v_id;
  return v_id;
end $function$
;

-- ============ 10, 11 y 14. Corregir: fecha con tope, dirección coherente y sin «No estaba» nuevo ============
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
  v_que text; v_motivo text; v_decision text; v_equipo text; v_fecha date; v_tope date;
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
      v_tope := public.v2_limite_habil(v_dia, 10);
      if v_fecha > v_tope then
        raise exception 'La fecha en que vuelves puede ser hasta el % (10 días hábiles). Si acordaron algo más lejano, pon la fecha más cercana posible y anota la real en el comentario.', to_char(v_tope, 'DD/MM');
      end if;
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
         resultado_editado_en = now(), resultado_editado_por = v_correo
  where id = p_visita_id;

  insert into v2_bitacora_visita(visita_id, accion, por, antes, despues)
  values (p_visita_id, 'resultado', v_correo, v_antes, v_despues);
end $function$
;

-- ============ R. La reactivación se cuenta desde la primera visita válida CON contacto ============
CREATE OR REPLACE FUNCTION public.v2_dias_trx(p_cid text, p_periodo text)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with p as (select ini, fin from v2_periodos where id = p_periodo),
  v as (select min((visitado_en at time zone 'America/Lima')::date) d from v2_visitas
        where customer_id = p_cid and periodo = p_periodo and anulada_en is null and lat is not null and not fuera_plazo
          and con <> 'Nadie'),
  t as (select fecha_corte, formato, trx,
          coalesce(lag(fecha_corte) over w, (to_date(mes,'YYYY-MM') - 1)) prev_corte,
          trx - coalesce(lag(trx) over w, 0) delta
        from v2_transacciones where customer_id = p_cid window w as (partition by mes, formato order by fecha_corte))
  select count(distinct t.fecha_corte)::int from t, v, p
  where v.d is not null and t.fecha_corte <= p.fin and (
    (t.formato = 'diario' and t.trx > 0 and t.fecha_corte > v.d) or
    (t.formato = 'acumulado_mes' and t.delta > 0 and t.prev_corte >= v.d))
$function$
;
