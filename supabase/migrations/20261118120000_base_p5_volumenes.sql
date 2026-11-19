-- Base P5 (periodo 2026-12, 18/11/2026): volúmenes de octubre y noviembre por comercio.
-- La base nueva de BBVA trae vol_102026 y vol_112026 (hasta ahora v2_comercios solo guardaba vol_092026).
-- Solo estructura: los datos de la base P5 se cargan aparte, con el OK de Jose, con scripts que viven en el
-- OneDrive de Stratis (llevan documentos y nombres de comercios; este repositorio es público).
--
-- No toca visitas, bono, funciones ni v2_mi_base (las columnas nuevas no se devuelven al celular).
-- Se aplica solo con el OK de Jose, antes de la carga de datos del P5.

alter table public.v2_comercios
  add column if not exists vol_102026 numeric,
  add column if not exists vol_112026 numeric;

alter table public.v2_comercios drop constraint if exists v2_comercios_vol_102026_check;
alter table public.v2_comercios add constraint v2_comercios_vol_102026_check check (vol_102026 is null or vol_102026 >= 0);
alter table public.v2_comercios drop constraint if exists v2_comercios_vol_112026_check;
alter table public.v2_comercios add constraint v2_comercios_vol_112026_check check (vol_112026 is null or vol_112026 >= 0);

comment on column public.v2_comercios.vol_102026 is 'Volumen facturado en octubre 2026 según BBVA (soles). Base P5.';
comment on column public.v2_comercios.vol_112026 is 'Volumen facturado en noviembre 2026 (a la fecha de la base) según BBVA (soles). Base P5.';
