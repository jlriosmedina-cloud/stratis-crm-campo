-- Domicilios de los ejecutivos como referencia de seguimiento (26/11/2026). Decisión de Jose (25/11): se ubican y se usan para dar
-- seguimiento a los registros hechos cerca del domicilio con el comercio lejos («alertas de registro» del escritorio).
-- Es un dato restringido: esta migración solo crea la estructura y NO trae ningún domicilio (el repositorio es público).
-- Los domicilios los carga Jose desde el escritorio. Nadie lee ni escribe la tabla directo: RLS activada y SIN políticas (ninguna fila es
-- visible ni modificable para authenticated, como en el resto de las tablas del CRM los privilegios los decide RLS); anon no tiene nada.
-- Solo las tres funciones de abajo (security definer) acceden, y solo para el analista del escritorio (v2_puede_escritorio).
-- No toca las visitas, el avance ni el bono (Regla n.º 1): las alertas solo avisan. El borrado es lógico (queda quién y cuándo).
-- La usa el escritorio, no el celular. Se aplica solo con el OK de Jose.

create table if not exists public.v2_domicilios_ejecutivos (
  id bigint generated always as identity primary key,
  correo text not null,
  etiqueta text,
  lat double precision not null check (lat between -19 and 0),
  lng double precision not null check (lng between -82 and -68),
  exactitud text not null default 'aproximado' check (exactitud in ('aproximado', 'exacto')),
  nota text check (char_length(nota) <= 300),
  creado_por text not null,
  creado_en timestamptz not null default now(),
  borrado_por text,
  borrado_en timestamptz
);
alter table public.v2_domicilios_ejecutivos enable row level security;
revoke all on table public.v2_domicilios_ejecutivos from public, anon;
revoke truncate, references, trigger on table public.v2_domicilios_ejecutivos from authenticated;
grant all on table public.v2_domicilios_ejecutivos to service_role;

CREATE OR REPLACE FUNCTION public.v2_domicilios()
 RETURNS TABLE(id bigint, correo text, ejecutivo text, etiqueta text, lat double precision, lng double precision, exactitud text, nota text, creado_por text, creado_en timestamptz)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.v2_puede_escritorio() then raise exception 'Solo el analista ve los domicilios de referencia.'; end if;
  return query
    select d.id, d.correo, coalesce(u.nombre, d.correo), d.etiqueta, d.lat, d.lng, d.exactitud, d.nota, d.creado_por, d.creado_en
    from v2_domicilios_ejecutivos d left join usuarios u on lower(u.correo) = d.correo
    where d.borrado_en is null order by coalesce(u.nombre, d.correo), d.id;
end $function$;

CREATE OR REPLACE FUNCTION public.v2_guardar_domicilio(p_correo text, p_etiqueta text, p_lat double precision, p_lng double precision, p_exactitud text DEFAULT 'aproximado'::text, p_nota text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id bigint; v_correo text := lower(btrim(coalesce(p_correo, '')));
begin
  if not public.v2_puede_escritorio() then raise exception 'Solo el analista guarda los domicilios de referencia.'; end if;
  if not exists (select 1 from usuarios u where lower(u.correo) = v_correo and u.rol = 'Ejecutivo' and u.activo) then
    raise exception 'El domicilio es de un ejecutivo activo.';
  end if;
  if p_lat is null or p_lng is null or p_lat not between -19 and 0 or p_lng not between -82 and -68 then
    raise exception 'Las coordenadas no están en el Perú: revisa que latitud y longitud no estén al revés.';
  end if;
  if p_exactitud not in ('aproximado', 'exacto') then raise exception 'La exactitud es «aproximado» o «exacto».'; end if;
  insert into v2_domicilios_ejecutivos(correo, etiqueta, lat, lng, exactitud, nota, creado_por)
  values (v_correo, nullif(btrim(coalesce(p_etiqueta, '')), ''), p_lat, p_lng, p_exactitud, nullif(btrim(coalesce(p_nota, '')), ''), public.correo_actual())
  returning id into v_id;
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.v2_borrar_domicilio(p_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.v2_puede_escritorio() then raise exception 'Solo el analista borra los domicilios de referencia.'; end if;
  update v2_domicilios_ejecutivos set borrado_en = now(), borrado_por = public.correo_actual() where id = p_id and borrado_en is null;
  if not found then raise exception 'No se encontró ese domicilio.'; end if;
end $function$;

revoke execute on function public.v2_domicilios() from public, anon;
grant execute on function public.v2_domicilios() to authenticated, service_role;
revoke execute on function public.v2_guardar_domicilio(text, text, double precision, double precision, text, text) from public, anon;
grant execute on function public.v2_guardar_domicilio(text, text, double precision, double precision, text, text) to authenticated, service_role;
revoke execute on function public.v2_borrar_domicilio(bigint) from public, anon;
grant execute on function public.v2_borrar_domicilio(bigint) to authenticated, service_role;
