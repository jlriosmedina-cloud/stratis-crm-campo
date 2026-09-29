-- Privilegios de tablas: nadie desde la app puede vaciar ni alterar tablas, y anon no toca nada.
--
-- Hallazgo del revisor (28/09/2026): Supabase da a anon y authenticated todos los privilegios sobre las tablas
-- de public (arwdDxtm). RLS frena SELECT/INSERT/UPDATE/DELETE, pero TRUNCATE salta RLS: con él se vacía
-- v2_visitas de un golpe (Regla n.º 1, el medidor de visitas). REFERENCES y TRIGGER tampoco los usa nadie.
-- Lo mismo pasa con las secuencias: con UPDATE se puede hacer setval y regresar el contador de
-- v2_bitacora_visita; las RPC que dejan su línea en la bitácora fallarían por llave duplicada.
--
-- Qué NO cambia (lo que hacen las apps):
--   · las apps leen con sesión (authenticated) usuarios, v2_periodos, v2_bitacora_visita, v2_transacciones,
--     v2_cargas, v2_geo_distritos, v2_feedback_inferido y v2_motivo_si_inferido, y escuchan v2_visitas en
--     tiempo real: authenticated conserva SELECT y RLS sigue decidiendo qué filas ve cada uno;
--   · authenticated conserva INSERT/UPDATE/DELETE: RLS ya los frena donde no hay política de escritura, y las
--     políticas de administrador (es_admin) siguen igual;
--   · las RPC que escriben son security definer y corren como postgres: no dependen de estos privilegios.
--   · anon no lee ninguna tabla: las apps solo consultan después de iniciar sesión, y ninguna política de estas
--     tablas deja ver filas a anon.

do $$
declare t record;
begin
  for t in
    select c.oid::regclass as tabla
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and (c.relname like 'v2\_%' or c.relname = 'usuarios')
  loop
    execute format('revoke truncate, references, trigger on table %s from authenticated', t.tabla);
    execute format('revoke all on table %s from anon', t.tabla);
  end loop;

  -- Secuencias de esas tablas: sin UPDATE (setval) para authenticated, que conserva USAGE para nextval
  -- (lo necesita una inserción directa de administrador); nada para anon.
  for t in
    select distinct s.oid::regclass as secuencia
    from pg_class s join pg_namespace n on n.oid = s.relnamespace
    left join pg_depend d on d.objid = s.oid and d.classid = 'pg_class'::regclass and d.deptype in ('a', 'i')
    left join pg_class c on c.oid = d.refobjid
    where n.nspname = 'public' and s.relkind = 'S'
      and (s.relname like 'v2\_%' or c.relname like 'v2\_%' or c.relname = 'usuarios')
  loop
    execute format('revoke update on sequence %s from authenticated', t.secuencia);
    execute format('revoke all on sequence %s from anon', t.secuencia);
  end loop;
end $$;

-- Tablas y secuencias nuevas que cree postgres en public: nacen sin TRUNCATE, REFERENCES ni TRIGGER para
-- authenticated, y sin nada para anon (igual que las funciones desde el 28/09). Si alguna tabla nueva debe
-- leerse sin sesión, necesita su grant explícito y justificado.
alter default privileges for role postgres in schema public revoke truncate, references, trigger on tables from authenticated;
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke update on sequences from authenticated;
