-- ===========================================================================
--  Contar las gestiones antes de que se las lleve el borrado
--
--  El disparador de auditoría del comercio corría DESPUÉS del DELETE, y para
--  entonces el borrado en cascada ya se había llevado sus gestiones: la
--  bitácora decía "se llevó 0 gestiones" aunque hubieran sido cinco.
--
--  Se parte en dos: la edición se sigue auditando después (necesita el valor
--  nuevo), y la eliminación se audita antes, cuando todavía hay qué contar.
-- ===========================================================================

drop trigger if exists tg_auditar_cliente on public.clientes;

create trigger tg_auditar_cliente
  after update on public.clientes
  for each row execute function public.fn_auditar_cliente();

create trigger tg_auditar_cliente_borrado
  before delete on public.clientes
  for each row execute function public.fn_auditar_cliente();

comment on function public.fn_auditar_cliente is
  'Auditoría del comercio. En UPDATE corre después (necesita el valor nuevo); en DELETE corre antes, para contar las gestiones que el borrado se va a llevar.';
