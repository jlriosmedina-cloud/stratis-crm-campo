-- =========================================================================
-- 40 · Dos customer_id, un solo comercio
--
-- José, 04/09/2026. BBVA entregó BERYPEZ S.A.C. (25694914) y BERYPEZ II S.A.C.
-- (27016546) como dos comercios de la cartera. José validó en campo que son el
-- mismo comercio en el mismo local, con un solo dueño y una sola conversación.
-- El efecto en el CRM era que Vanessa tenía que registrar todo dos veces: el
-- 26/08 hay dos visitas presenciales, 11:00 y 11:13, que son la misma visita.
--
-- Lo que esta migración crea es un VÍNCULO, no una fusión. Los dos comercios
-- siguen existiendo, siguen contando por separado en el embudo y en la cartera
-- de 841 —BBVA los asignó por separado y así los mide—, pero una gestión hecha
-- en cualquiera de los dos alcanza a los dos.
--
-- Tres cosas que esta tabla NO hace, a propósito:
--
--   · No copia gestiones. Si se duplicaran las filas, el conteo de gestiones
--     —el denominador de la puntualidad del registro, los «911» del acta— se
--     inflaría con trabajo que nunca ocurrió, y quedaría en `interacciones` un
--     registro de visita con una ubicación que nadie verificó. El arrastre se
--     calcula en la lectura; en la base no se inventa ni una fila.
--
--   · No une automáticamente por nombre parecido. En la cartera hay cuatro
--     grupos de nombre repetido y solo uno es este: «El Turco Stockroom Barber»
--     aparece en cuatro distritos y «Chifa Yue Hao» en dos, y esos son locales
--     distintos con contrato propio. Un automático los uniría mal y bajaría el
--     portafolio de 841 sin que nadie lo hubiera decidido.
--
--   · No cruza ejecutivos. Dos comercios vinculados que pertenecen a personas
--     distintas le acreditarían a una el trabajo de la otra, y eso entra
--     directo al bono. La restricción está abajo y el CRM la respeta también.
-- =========================================================================

create table if not exists public.comercios_vinculados (
  id            uuid primary key default gen_random_uuid(),
  -- Se guarda ordenado (a < b) para que el par sea único en un solo sentido:
  -- sin esto, (A,B) y (B,A) serían dos vínculos del mismo hecho.
  customer_id_a text not null references public.clientes(customer_id) on update cascade on delete cascade,
  customer_id_b text not null references public.clientes(customer_id) on update cascade on delete cascade,
  motivo        text not null,
  validado_por  text not null,
  validado_en   timestamptz not null default now(),
  anulado_en    timestamptz,
  anulado_por   text,
  constraint comercios_vinculados_orden check (customer_id_a < customer_id_b)
);

-- Un mismo par no se vincula dos veces mientras el vínculo esté vivo. Los
-- anulados se conservan: quién los puso y quién los quitó es parte del rastro.
create unique index if not exists comercios_vinculados_par_vivo
  on public.comercios_vinculados (customer_id_a, customer_id_b)
  where anulado_en is null;

-- Las dos direcciones de búsqueda. El CRM arma el grafo leyendo la tabla
-- entera, pero cualquier consulta puntual entra por una de las dos columnas.
create index if not exists comercios_vinculados_a_idx on public.comercios_vinculados (customer_id_a);
create index if not exists comercios_vinculados_b_idx on public.comercios_vinculados (customer_id_b);

alter table public.comercios_vinculados enable row level security;

-- ---- Quién puede leerlo -------------------------------------------------
-- Todos los autenticados. El ejecutivo necesita ver el aviso en su ficha: si
-- el vínculo le cambia la cobertura, tiene derecho a saber por qué.
create policy comercios_vinculados_lectura
  on public.comercios_vinculados for select
  to authenticated
  using (true);

-- ---- Quién puede escribirlo --------------------------------------------
-- Solo supervisión. Un vínculo mueve cobertura, visitas y bono; no es una
-- anotación de campo. La comprobación va envuelta en `select` para que corra
-- una vez por consulta y no una vez por fila.
create or replace function private.es_supervision()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.usuarios u
    where lower(u.correo) = lower(coalesce(public.correo_actual(), ''))
      and u.rol in ('Analista', 'Manager')
      and u.activo
  );
$$;

revoke execute on function private.es_supervision() from public, anon;

create policy comercios_vinculados_escritura
  on public.comercios_vinculados for all
  to authenticated
  using ((select private.es_supervision()))
  with check ((select private.es_supervision()));

-- ---- La regla que no se puede romper por descuido -----------------------
-- Mismo ejecutivo en los dos lados. Se comprueba al escribir, que es cuando
-- hay alguien mirando; si mañana una reasignación los separa, el CRM lo avisa
-- en pantalla en vez de dejar de contar en silencio.
create or replace function public.fn_vinculo_mismo_ejecutivo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a text;
  v_b text;
begin
  if new.anulado_en is not null then return new; end if;
  select asignado_correo into v_a from public.clientes where customer_id = new.customer_id_a;
  select asignado_correo into v_b from public.clientes where customer_id = new.customer_id_b;
  if v_a is distinct from v_b then
    raise exception 'Los dos comercios están asignados a personas distintas (% y %). Un vínculo entre ellos le acreditaría a una el trabajo de la otra.', coalesce(v_a,'sin asignar'), coalesce(v_b,'sin asignar');
  end if;
  return new;
end;
$$;

drop trigger if exists tg_vinculo_mismo_ejecutivo on public.comercios_vinculados;
create trigger tg_vinculo_mismo_ejecutivo
  before insert or update on public.comercios_vinculados
  for each row execute function public.fn_vinculo_mismo_ejecutivo();

-- =========================================================================
-- El caso que motivó todo esto. Se inserta ordenado por customer_id.
-- =========================================================================
insert into public.comercios_vinculados (customer_id_a, customer_id_b, motivo, validado_por)
values ('25694914', '27016546',
        'Mismo comercio en el mismo local con dos customer_id en la base de BBVA. Validado en campo por Jose Rios el 04/09/2026. Las direcciones de la base difieren (Jesus Maria y Lince): una de las dos esta mal cargada por BBVA.',
        'jose.rios@mystratis.com')
on conflict do nothing;

-- Comprobación
select v.customer_id_a, ca.nombre_comercio, v.customer_id_b, cb.nombre_comercio, v.validado_por
from public.comercios_vinculados v
join public.clientes ca on ca.customer_id = v.customer_id_a
join public.clientes cb on cb.customer_id = v.customer_id_b
where v.anulado_en is null;
