-- ===========================================================================
--  Fuera los viáticos
--
--  Los viáticos pasaron a gestionarse en otra plataforma. La captura ya se
--  quitó de la aplicación; acá se borra lo que quedaba guardado: cuatro montos
--  por S/ 84.00 en total. Las fotos de los cuatro comprobantes ya se
--  eliminaron del bucket «evidencias» —solo esas cuatro; las 89 evidencias de
--  gestión siguen intactas, y ninguna compartía ruta con un comprobante—.
--
--  Las columnas gasto_total y gastos_paths se quedan vacías en su sitio. No se
--  eliminan porque crear_venta_nueva() todavía las recibe como parámetros, y
--  cambiarle la firma a la función que da de alta un comercio con su venta es
--  un riesgo que este cambio no justifica. Quedan como plomería inerte: la
--  aplicación no las escribe ni las muestra en ninguna parte.
--
--  Lo que se borra es irreversible y se hace a pedido expreso de Jose Rios.
--  El respaldo del dato —fecha, ejecutivo, comercio y monto— se le entregó
--  aparte antes de ejecutar esto.
-- ===========================================================================

-- Queda constancia en la bitácora de cuánto se borró y por qué. Se escribe
-- antes de vaciar, para que el detalle no salga ya en cero.
insert into public.auditoria (tabla, accion, registro_id, detalle)
select 'interacciones', 'editar', 'viaticos',
       jsonb_build_object(
         '_nota', format(
           'Se retiraron los viáticos del CRM: %s gestiones, S/ %s en total, y sus comprobantes. Pasan a gestionarse en otra plataforma.',
           count(*), to_char(coalesce(sum(gasto_total),0), 'FM999990.00')))
from public.interacciones
where gasto_total is not null and gasto_total > 0;

update public.interacciones
   set gasto_total  = null,
       gastos_paths = '{}'
 where gasto_total is not null
    or (gastos_paths is not null and array_length(gastos_paths, 1) > 0);

comment on column public.interacciones.gasto_total is
  'Sin uso desde el 10/08/2026: los viaticos se gestionan en otra plataforma. La aplicacion no escribe esta columna.';
comment on column public.interacciones.gastos_paths is
  'Sin uso desde el 10/08/2026: los viaticos se gestionan en otra plataforma. La aplicacion no escribe esta columna.';
