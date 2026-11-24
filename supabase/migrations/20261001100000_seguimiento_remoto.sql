-- Seguimiento remoto de las visitas sin contacto (01/10/2026). Decisión de Jose: que ninguna visita quede sin feedback.
-- Cuando la visita no tuvo contacto (cerrado, no atendió, dirección errada…), el ejecutivo registra después qué hizo a
-- distancia: por qué canal (llamada, WhatsApp, correo) y qué respondió el comercio. Se pueden registrar varios intentos.
-- No cambia la visita, el estado del comercio, el avance ni el bono (Regla n.º 1: el medidor no se toca).
-- Cada registro deja su línea en v2_bitacora_visita (acción nueva «seguimiento»).
-- La usa el celular: se aplica el mismo día en que se publica la app. Se aplica solo con el OK de Jose.

alter table public.v2_bitacora_visita drop constraint if exists v2_bitacora_visita_accion_check;
alter table public.v2_bitacora_visita add constraint v2_bitacora_visita_accion_check CHECK ((accion = ANY (ARRAY['comentario'::text, 'resultado'::text, 'traslado'::text, 'pedido'::text, 'aprobado'::text, 'rechazado'::text, 'validada'::text, 'observada'::text, 'revision'::text, 'anulada'::text, 'restituida'::text, 'ubicacion'::text, 'seguimiento'::text])));

create table if not exists public.v2_seguimientos (
  id bigserial primary key,
  visita_id uuid not null references public.v2_visitas(id),
  customer_id text not null,
  periodo text not null,
  correo text not null,            -- ejecutivo de la visita
  por text not null,               -- quien registró el seguimiento (el mismo ejecutivo o un admin)
  canal text not null check (canal in ('Llamada', 'WhatsApp', 'Correo')),
  resultado text not null check (resultado in ('Respondió: usará el POS', 'Respondió: aún no decide', 'Respondió: agendamos otra visita',
    'Respondió: no usará el POS', 'No respondió', 'El dato de contacto no es válido')),
  nota text check (nota is null or char_length(nota) <= 300),
  hecho_en timestamptz not null default now()
);
create index if not exists v2_seguimientos_visita on public.v2_seguimientos(visita_id);
create index if not exists v2_seguimientos_periodo on public.v2_seguimientos(periodo, correo);

alter table public.v2_seguimientos enable row level security;
drop policy if exists v2_seguimientos_lectura on public.v2_seguimientos;
create policy v2_seguimientos_lectura on public.v2_seguimientos for select to authenticated using ((select public.v2_puede_escritorio()));
-- Solo lectura desde el escritorio: escribe la función (security definer). Sin nada para anon.
revoke all on public.v2_seguimientos from anon;
revoke insert, update, delete, truncate, references, trigger on public.v2_seguimientos from authenticated;
revoke all on sequence public.v2_seguimientos_id_seq from anon, authenticated;

-- Registrar un seguimiento: solo el ejecutivo de la visita (o un admin), solo visitas sin contacto, no anuladas y del periodo en curso.
CREATE OR REPLACE FUNCTION public.v2_registrar_seguimiento(p_visita_id uuid, p_canal text, p_resultado text, p_nota text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_correo text := public.correo_actual();
  v record; v_id bigint; v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
begin
  if not public.es_usuario_activo() then raise exception 'Tu usuario no está activo.'; end if;
  select * into v from v2_visitas where id = p_visita_id;
  if not found then raise exception 'No se encontró la visita.'; end if;
  if v.correo is distinct from v_correo and not public.es_admin() then raise exception 'Solo el ejecutivo de la visita registra su seguimiento.'; end if;
  if v.anulada_en is not null then raise exception 'La visita está anulada.'; end if;
  if v.con is distinct from 'Nadie' then raise exception 'El seguimiento remoto es para las visitas sin contacto.'; end if;
  if v.periodo is distinct from public.v2_periodo_de((now() at time zone 'America/Lima')::date) then raise exception 'La visita es de un periodo cerrado.'; end if;
  if char_length(v_nota) > 300 then raise exception 'La nota tiene más de 300 caracteres.'; end if;

  insert into v2_seguimientos(visita_id, customer_id, periodo, correo, por, canal, resultado, nota)
  values (v.id, v.customer_id, v.periodo, v.correo, v_correo, p_canal, p_resultado, v_nota)
  returning id into v_id;
  insert into v2_bitacora_visita(visita_id, accion, por, antes, despues)
  values (v.id, 'seguimiento', v_correo, null, concat_ws(' · ', p_canal, p_resultado, v_nota));
  return v_id;
end $function$
;
revoke execute on function public.v2_registrar_seguimiento(uuid, text, text, text) from public, anon;
grant execute on function public.v2_registrar_seguimiento(uuid, text, text, text) to authenticated, service_role;

-- Seguimientos del periodo para el celular: los propios (un admin ve todos).
CREATE OR REPLACE FUNCTION public.v2_mis_seguimientos(p_periodo text DEFAULT NULL::text)
 RETURNS TABLE(id bigint, visita_id uuid, customer_id text, canal text, resultado text, nota text, hecho_en timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with per as (select coalesce(p_periodo, public.v2_periodo_de((now() at time zone 'America/Lima')::date)) id)
  select s.id, s.visita_id, s.customer_id, s.canal, s.resultado, s.nota, s.hecho_en
  from v2_seguimientos s, per
  where s.periodo = per.id and public.es_usuario_activo() and (public.es_admin() or s.correo = public.correo_actual())
  order by s.hecho_en
$function$
;
revoke execute on function public.v2_mis_seguimientos(text) from public, anon;
grant execute on function public.v2_mis_seguimientos(text) to authenticated, service_role;
