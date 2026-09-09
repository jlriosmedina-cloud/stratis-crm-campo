-- =========================================================================
-- 43 · Apuntes del ejecutivo en la ficha del comercio
--
-- José, 09/09/2026: «en cada comercio agregaremos un campo debajo de datos
-- del comercio en donde el ejecutivo pueda escribir datos para el mismo, como
-- comentario del mismo ejecutivo o apuntes, los cuales no tendrán relevancia
-- pero servirá para anotar cosas que le sirvan a él y se podrá editar cuando
-- este lo desee».
--
-- Es un bloc de notas, no un dato del proyecto: no cuenta como gestión, no
-- entra en ningún indicador, no sale en ningún archivo (las hojas tienen la
-- lista de columnas escrita a mano y esta no está), y a propósito NO se suma
-- al trigger de auditoría —anotar y borrar apuntes es lo normal y llenaría la
-- bitácora de ruido—. Lo edita el dueño del comercio o supervisión, que es lo
-- que ya permite la política de UPDATE de clientes.
-- =========================================================================

alter table public.clientes
  add column if not exists apuntes text;

comment on column public.clientes.apuntes is 'Bloc de notas del ejecutivo sobre el comercio. Sin relevancia para indicadores ni archivos; no se audita.';
