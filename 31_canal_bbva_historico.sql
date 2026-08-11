-- ===========================================================================
--  Canal de contacto con BBVA en los comercios anteriores a la regla
--
--  Estos 72 comercios se registraron antes de que el CRM pidiera el canal de
--  contacto con el ejecutivo de BBVA. No es que alguien lo haya omitido: el
--  campo no existia. Jose confirma que todos se coordinaron por correo.
--
--  Dos cuidados. Se toca solo lo que esta vacio, para no pisar a nadie que ya
--  haya declarado su canal, y solo comercios de cartera: una venta nueva no
--  tiene ejecutivo BBVA de por medio. Y se corre con el correo de Jose puesto
--  en la sesion, porque los disparadores firman con quien hace el cambio.
--
--  Antes de aplicarlo se conto: 72 pedidos, 72 en el CRM, 0 con canal ya
--  declarado, 0 ventas nuevas, 0 que no existieran. Se actualizaron los 72.
-- ===========================================================================
do $$
declare act int;
begin
  perform set_config('request.jwt.claims',
    '{"email":"jose.rios@mystratis.com","role":"authenticated"}', true);

  create temp table _ids(customer_id text primary key) on commit drop;
  insert into _ids select unnest(array['22352241','30236413','27322648','27063195','27026596','23260335','21373857','20837800','24735324','25228485','31844413','32106730','26228575','30525771','24667816','31032756','25691882','21766633','27133016','25344096','32737741','25121228','24711765','31707851','28001155','20726044','22526585','27292149','27850959','22258622','21701363','25000001','26847808','25830006','32713266','31063930','27495176','25137802','29388681','31689957','31037167','31136060','30659259','29350688','29199865','28448500','23259713','26109390','26560821','21831570','28542396','31977781','31329898','28254635','21905836','31904339','23662036','32257300','27602486','31373889','25122381','22912573','28207132','22843380','27976317','22105991','26369257','26053662','25354589','28284070','28511170','22255583']);

  update clientes c
     set contacto_bbva = 'CORREO'
    from _ids i
   where c.customer_id = i.customer_id
     and c.contacto_bbva is null
     and c.tipo_registro = 'CARTERA';
  get diagnostics act = row_count;

  raise notice 'actualizados=%', act;
end $$;
