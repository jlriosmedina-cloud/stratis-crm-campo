-- ===========================================================================
--  El modelo de incentivos
--
--  El CRM ya sabe casi todo lo que el bono necesita: cuántos comercios se
--  tocaron, cuántas visitas quedaron efectivas, si la gestión se registró a
--  tiempo, cuántos se retuvieron y cuántas afiliaciones nuevas se cerraron.
--  Lo único que no puede ver es la facturación: ese numero vive en la
--  plataforma de BBVA y solo lo tiene a la vista el Analista. Por eso se
--  carga a mano, periodo por periodo y ejecutivo por ejecutivo, con el monto
--  inicial y el final. El crecimiento lo calcula el CRM.
--
--  Los parámetros del modelo —metas, pesos, tramos— tampoco se clavan en el
--  código: la revisión de octubre estaba prevista desde el principio. Viven
--  en config como un JSON que el Analista y el Manager editan desde Ajustes.
--
--  Nada de esto lo ve un ejecutivo. No es solo que la pestaña no aparezca:
--  las políticas de abajo hacen que la consulta le vuelva vacía aunque llame
--  a la API por fuera del CRM.
-- ===========================================================================

create table if not exists public.facturacion (
  periodo         text not null,                 -- el mes en que cierra y se paga
  correo          text not null,
  monto_inicial   numeric(14,2),
  monto_final     numeric(14,2),
  actualizado_en  timestamptz not null default now(),
  actualizado_por text,
  primary key (periodo, correo)
);

comment on table public.facturacion is
  'Facturacion de la cartera de cada ejecutivo por periodo del bono (19 al 18). Se carga a mano desde el CRM: el dato vive en la plataforma de BBVA.';

-- Un monto negativo no existe, y un final sin inicial no permite calcular nada.
alter table public.facturacion drop constraint if exists ck_facturacion_montos;
alter table public.facturacion add constraint ck_facturacion_montos
  check (coalesce(monto_inicial, 0) >= 0 and coalesce(monto_final, 0) >= 0);

create or replace function public.fn_facturacion_sello()
returns trigger language plpgsql as $fn$
begin
  new.actualizado_en  := now();
  new.actualizado_por := coalesce(public.correo_actual(), new.actualizado_por);
  if tg_op = 'UPDATE' then
    new.periodo := old.periodo;
    new.correo  := old.correo;
  end if;
  return new;
end $fn$;

drop trigger if exists tg_facturacion_sello on public.facturacion;
create trigger tg_facturacion_sello
  before insert or update on public.facturacion
  for each row execute function public.fn_facturacion_sello();

-- ---------------------------------------------------------------------------
--  Solo supervisión, y por la base, no por la pantalla
-- ---------------------------------------------------------------------------
alter table public.facturacion enable row level security;

drop policy if exists p_fact_all on public.facturacion;
create policy p_fact_all on public.facturacion for all
  using (public.es_admin()) with check (public.es_admin());

grant select, insert, update, delete on public.facturacion to authenticated;

-- ---------------------------------------------------------------------------
--  Los parámetros del modelo
--
--  config ya existe y ya guarda la ventana de edición. Se le agrega una fila
--  con el modelo del documento de incentivos, para que el CRM arranque
--  calculando lo mismo que dice el papel aunque nadie toque Ajustes.
-- ---------------------------------------------------------------------------
insert into public.config (clave, nota, valor) values
  ('bono_parametros',
   'Metas, pesos y tramos del modelo de incentivos. Lo edita el Analista desde Ajustes.',
   '{
     "metas":      {"reactivacion_pp":18, "facturacion_pct":15, "ventas_mes":7},
     "pesos":      {"reactivacion":30, "facturacion":50, "venta":20},
     "requisitos": {"cobertura_pct":90, "visitas_semana":25, "puntualidad_pct":95},
     "piso":80, "base_incumple_uno":15, "pago_en_piso":15, "pago_en_meta":25,
     "sobre":110, "tope":30, "pago_mensual":80
   }')
on conflict (clave) do nothing;

-- La escritura de esta fila queda para supervisión. Si config ya tenía una
-- política de escritura, esta se suma sin quitarla.
drop policy if exists p_config_admin on public.config;
create policy p_config_admin on public.config for all
  using (public.es_admin()) with check (public.es_admin());

grant select on public.config to authenticated;
grant insert, update on public.config to authenticated;
