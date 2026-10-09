-- Recupero del POS (09/10/2026). Decisión de Jose: medir qué hizo el ejecutivo cuando el comercio desiste del producto.
-- El ejecutivo no recupera el equipo (lo hacen Soporte de Openpay y el comercio): llama a Soporte, acompaña el trámite y
-- confirma la entrega; Jose valida el cierre. Pasos: llamar → tramite → entregado → validado; salidas: trabado y sigue.
-- El caso nace con la primera acción; mientras tanto se deduce de la última visita («Desiste del producto»; equipo «Sí» =
-- entregado). No cambia la visita, el medidor ni el bono (Regla n.º 1). Cada acción deja su línea en v2_bitacora_visita
-- (acción nueva «recupero»). La usa el celular: se aplica el mismo día en que se publica la app. Solo con el OK de Jose.

alter table public.v2_bitacora_visita drop constraint if exists v2_bitacora_visita_accion_check;
alter table public.v2_bitacora_visita add constraint v2_bitacora_visita_accion_check CHECK ((accion = ANY (ARRAY['comentario'::text, 'resultado'::text, 'traslado'::text, 'pedido'::text, 'aprobado'::text, 'rechazado'::text, 'validada'::text, 'observada'::text, 'revision'::text, 'anulada'::text, 'restituida'::text, 'ubicacion'::text, 'seguimiento'::text, 'recupero'::text])));

create table if not exists public.v2_recuperos (
  id bigserial primary key,
  periodo text not null references public.v2_periodos(id),
  customer_id text not null,
  correo text not null,                       -- ejecutivo de la visita del desiste
  visita_id uuid not null references public.v2_visitas(id),
  paso text not null check (paso in ('llamar', 'tramite', 'entregado', 'validado', 'trabado', 'sigue')),
  caso_soporte text check (caso_soporte is null or char_length(caso_soporte) <= 40),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  validado_por text,
  validado_en timestamptz,
  unique (periodo, customer_id)
);
create table if not exists public.v2_recupero_eventos (
  id bigserial primary key,
  recupero_id bigint not null references public.v2_recuperos(id),
  paso_antes text not null,
  paso_despues text not null,
  accion text not null check (accion in ('llame_soporte', 'entregado', 'problema', 'validar', 'observar')),
  detalle text,
  nota text check (nota is null or char_length(nota) <= 300),
  por text not null,
  en timestamptz not null default now()
);
create index if not exists v2_recupero_eventos_rec on public.v2_recupero_eventos(recupero_id);
alter table public.v2_recuperos enable row level security;
alter table public.v2_recupero_eventos enable row level security;
drop policy if exists v2_recuperos_lectura on public.v2_recuperos;
create policy v2_recuperos_lectura on public.v2_recuperos for select to authenticated using ((select public.v2_puede_escritorio()));
drop policy if exists v2_recupero_eventos_lectura on public.v2_recupero_eventos;
create policy v2_recupero_eventos_lectura on public.v2_recupero_eventos for select to authenticated using ((select public.v2_puede_escritorio()));
-- Solo lectura desde el escritorio: escriben las funciones (security definer). Sin nada para anon.
revoke all on public.v2_recuperos, public.v2_recupero_eventos from anon;
revoke insert, update, delete, truncate, references, trigger on public.v2_recuperos, public.v2_recupero_eventos from authenticated;
revoke all on sequence public.v2_recuperos_id_seq, public.v2_recupero_eventos_id_seq from anon, authenticated;

-- Casos del periodo (decisiones de Jose del 09/10):
-- · los abiertos de periodos anteriores siguen hasta que se validen (un equipo no deja de estar pendiente porque cambió el periodo);
-- · «sigue» (cambió de opinión) se ve hasta que Jose lo valida;
-- · si la visita del desiste se anula o se corrige, o hay una reunión posterior en que ya no desiste, el caso abierto se lee «cambio»
--   (cerrado por cambio de visita) y ya no se puede avanzar;
-- · sin caso todavía, se deduce de la última reunión del periodo con «Desiste del producto» (equipo «Sí» = entregado).
CREATE OR REPLACE FUNCTION public.v2_recuperos_del_periodo(p_periodo text)
 RETURNS TABLE(id bigint, customer_id text, correo text, visita_id uuid, paso text, caso_soporte text, desde date, actualizado_en timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with abiertos as (
    select r.* from v2_recuperos r
    where (r.periodo = p_periodo and not (r.paso = 'sigue' and r.validado_en is not null))
       or (r.periodo < p_periodo and (r.paso in ('llamar', 'tramite', 'entregado', 'trabado') or (r.paso = 'sigue' and r.validado_en is null)))),
  leidos as (
    select r.*, vis.visitado_en vis_en,
      case when r.paso in ('llamar', 'tramite', 'entregado', 'trabado') and (
             vis.anulada_en is not null or vis.que is distinct from 'Reunión concretada' or vis.decision is distinct from 'Desiste del producto'
             or exists (select 1 from v2_visitas x where x.customer_id = r.customer_id and x.anulada_en is null and x.que = 'Reunión concretada'
                        and x.visitado_en > vis.visitado_en and x.decision is distinct from 'Desiste del producto'))
           then 'cambio' else r.paso end paso_leido
    from abiertos r join v2_visitas vis on vis.id = r.visita_id),
  -- la última reunión del comercio desde el periodo 3 (2026-10, inicio del recupero) hasta este periodo; sin caso, se deduce de ella
  u as (select distinct on (v.customer_id) v.* from v2_visitas v
        where v.periodo between '2026-10' and p_periodo and v.anulada_en is null and v.que = 'Reunión concretada' order by v.customer_id, v.visitado_en desc)
  select l.id, l.customer_id, l.correo, l.visita_id, l.paso_leido, l.caso_soporte, (l.vis_en at time zone 'America/Lima')::date, l.actualizado_en
  from leidos l
  where not (l.periodo < p_periodo and l.paso_leido = 'cambio')   -- un «cambio» de un periodo anterior ya no se arrastra
  union all
  select null, u.customer_id, u.correo, u.id, case when u.equipo = 'Sí' then 'entregado' else 'llamar' end, null,
         (u.visitado_en at time zone 'America/Lima')::date, u.visitado_en
  from u where u.decision = 'Desiste del producto'
    and not exists (select 1 from leidos l where l.customer_id = u.customer_id)   -- ya tiene un caso (de este periodo o arrastrado)
    and not exists (select 1 from v2_recuperos r where r.customer_id = u.customer_id and r.periodo between u.periodo and p_periodo)
$function$;
revoke execute on function public.v2_recuperos_del_periodo(text) from public, anon, authenticated;
grant execute on function public.v2_recuperos_del_periodo(text) to service_role;

-- Para el celular y el escritorio: los recuperos del ejecutivo (un admin ve todos), con el nombre del comercio (el caso puede venir
-- de un periodo anterior y no estar en la base actual del ejecutivo), intentos e historial.
CREATE OR REPLACE FUNCTION public.v2_mis_recuperos(p_periodo text DEFAULT NULL::text)
 RETURNS TABLE(customer_id text, comercio text, correo text, visita_id uuid, paso text, caso_soporte text, desde date, actualizado_en timestamp with time zone, intentos integer, historial jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with per as (select coalesce(p_periodo, public.v2_periodo_de((now() at time zone 'America/Lima')::date)) id)
  select b.customer_id, (select coalesce(nullif(btrim(c.nombre_comercial), ''), c.razon_social) from v2_comercios c where c.customer_id = b.customer_id),
    b.correo, b.visita_id, b.paso, b.caso_soporte, b.desde, b.actualizado_en,
    coalesce((select count(*)::int from v2_recupero_eventos e where e.recupero_id = b.id and e.detalle = 'No contestaron, vuelvo a llamar'), 0),
    coalesce((select jsonb_agg(jsonb_build_object('en', e.en, 'accion', e.accion, 'detalle', e.detalle, 'nota', e.nota, 'paso', e.paso_despues, 'por', e.por) order by e.en)
              from v2_recupero_eventos e where e.recupero_id = b.id), '[]'::jsonb)
  from per, public.v2_recuperos_del_periodo(per.id) b
  where public.es_usuario_activo() and (public.es_admin() or b.correo = public.correo_actual())
$function$;
revoke execute on function public.v2_mis_recuperos(text) from public, anon;
grant execute on function public.v2_mis_recuperos(text) to authenticated, service_role;

-- Caso para escribir (periodo en curso, o abierto de uno anterior): lo crea si solo estaba deducido. Null si no hay recupero.
CREATE OR REPLACE FUNCTION public.v2_recupero_para_escribir(p_customer_id text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_per text := public.v2_periodo_de((now() at time zone 'America/Lima')::date); b record; v_id bigint;
begin
  select * into b from public.v2_recuperos_del_periodo(v_per) x where x.customer_id = p_customer_id order by x.actualizado_en desc limit 1;
  if not found then return null; end if;
  if b.paso = 'cambio' then raise exception 'El recupero se cerró porque cambió la visita del comercio (otra reunión, corrección o anulación).'; end if;
  if b.id is not null then return b.id; end if;
  insert into v2_recuperos(periodo, customer_id, correo, visita_id, paso) values (v_per, b.customer_id, b.correo, b.visita_id, b.paso)
  on conflict (periodo, customer_id) do nothing returning id into v_id;
  if v_id is null then select r.id into v_id from v2_recuperos r where r.periodo = v_per and r.customer_id = p_customer_id; end if;
  return v_id;
end $function$;
revoke execute on function public.v2_recupero_para_escribir(text) from public, anon, authenticated;
grant execute on function public.v2_recupero_para_escribir(text) to service_role;

-- El ejecutivo de la visita (o el analista del escritorio; el Manager solo lee) avanza el recupero.
-- Acciones: llame_soporte, entregado, problema. Devuelve el paso nuevo.
CREATE OR REPLACE FUNCTION public.v2_avanzar_recupero(p_customer_id text, p_accion text, p_detalle text, p_caso text DEFAULT NULL::text, p_nota text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_correo text := public.correo_actual(); v_id bigint; r record; v_nuevo text;
  v_nota text := nullif(btrim(coalesce(p_nota, '')), ''); v_caso text := nullif(btrim(coalesce(p_caso, '')), '');
begin
  if not public.es_usuario_activo() then raise exception 'Tu usuario no está activo.'; end if;
  v_id := public.v2_recupero_para_escribir(p_customer_id);
  if v_id is null then raise exception 'Este comercio no tiene un recupero del POS abierto.'; end if;
  select * into r from v2_recuperos where id = v_id for update;
  if r.correo is distinct from v_correo and not public.v2_puede_escritorio() then raise exception 'Solo el ejecutivo de la visita avanza su recupero.'; end if;
  if char_length(v_nota) > 300 then raise exception 'La nota tiene más de 300 caracteres.'; end if;
  if char_length(v_caso) > 40 then raise exception 'El número de caso tiene más de 40 caracteres.'; end if;
  if p_accion = 'llame_soporte' and r.paso in ('llamar', 'trabado') then
    if p_detalle not in ('Programaron el recojo', 'Me dieron un número de caso', 'No contestaron, vuelvo a llamar') then raise exception 'Elige qué te dijeron en Soporte.'; end if;
    v_nuevo := case when p_detalle = 'No contestaron, vuelvo a llamar' then r.paso else 'tramite' end;
  elsif p_accion = 'entregado' and r.paso = 'tramite' then
    v_nuevo := 'entregado';
  elsif p_accion = 'problema' and r.paso in ('llamar', 'tramite', 'trabado') then
    if p_detalle not in ('No quiere entregar el equipo', 'No ubica el equipo', 'Cambió de opinión: seguirá usando el POS') then raise exception 'Elige el problema.'; end if;
    if p_detalle = 'Cambió de opinión: seguirá usando el POS' and char_length(coalesce(v_nota, '')) < 10 then
      raise exception 'Escribe en la nota por qué seguirá usando el POS (mínimo 10 caracteres).';
    end if;
    v_nuevo := case when p_detalle = 'Cambió de opinión: seguirá usando el POS' then 'sigue' else 'trabado' end;
  else
    raise exception 'Ese paso no corresponde: el recupero está en «%».', r.paso;
  end if;
  update v2_recuperos set paso = v_nuevo, caso_soporte = coalesce(v_caso, caso_soporte), actualizado_en = now(), validado_por = null, validado_en = null where id = r.id;
  insert into v2_recupero_eventos(recupero_id, paso_antes, paso_despues, accion, detalle, nota, por)
  values (r.id, r.paso, v_nuevo, p_accion, nullif(p_detalle, ''), v_nota, v_correo);
  insert into v2_bitacora_visita(visita_id, accion, por, antes, despues)
  values (r.visita_id, 'recupero', v_correo, r.paso, concat_ws(' · ', v_nuevo, nullif(p_detalle, ''), v_caso, v_nota));
  return v_nuevo;
end $function$;
revoke execute on function public.v2_avanzar_recupero(text, text, text, text, text) from public, anon;
grant execute on function public.v2_avanzar_recupero(text, text, text, text, text) to authenticated, service_role;

-- Jose valida u observa: «entregado» → validado (o vuelve a trámite); «sigue» → queda validado (o vuelve a llamar). Observar pide nota.
CREATE OR REPLACE FUNCTION public.v2_validar_recupero(p_customer_id text, p_valido boolean, p_nota text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_correo text := public.correo_actual(); v_id bigint; r record; v_nuevo text; v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
begin
  if not public.v2_puede_escritorio() then raise exception 'Solo el analista valida el recupero.'; end if;
  v_id := public.v2_recupero_para_escribir(p_customer_id);
  if v_id is null then raise exception 'Este comercio no tiene un recupero del POS abierto.'; end if;
  select * into r from v2_recuperos where id = v_id for update;
  if not (r.paso = 'entregado' or (r.paso = 'sigue' and r.validado_en is null)) then raise exception 'Ese paso no corresponde: el recupero está en «%».', r.paso; end if;
  if not p_valido and char_length(coalesce(v_nota, '')) < 10 then raise exception 'Escribe una nota de al menos 10 caracteres para observar.'; end if;
  if char_length(v_nota) > 300 then raise exception 'La nota tiene más de 300 caracteres.'; end if;
  v_nuevo := case when p_valido then (case when r.paso = 'sigue' then 'sigue' else 'validado' end) when r.paso = 'sigue' then 'llamar' else 'tramite' end;
  update v2_recuperos set paso = v_nuevo, actualizado_en = now(),
    validado_por = case when p_valido then v_correo end, validado_en = case when p_valido then now() end where id = r.id;
  insert into v2_recupero_eventos(recupero_id, paso_antes, paso_despues, accion, nota, por)
  values (r.id, r.paso, v_nuevo, case when p_valido then 'validar' else 'observar' end, v_nota, v_correo);
  insert into v2_bitacora_visita(visita_id, accion, por, antes, despues)
  values (r.visita_id, 'recupero', v_correo, r.paso, concat_ws(' · ', v_nuevo, case when p_valido then 'validado' else 'observado' end, v_nota));
  return v_nuevo;
end $function$;
revoke execute on function public.v2_validar_recupero(text, boolean, text) from public, anon;
grant execute on function public.v2_validar_recupero(text, boolean, text) to authenticated, service_role;
