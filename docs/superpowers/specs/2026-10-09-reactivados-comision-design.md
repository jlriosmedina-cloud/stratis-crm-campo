# Reactivados BBVA vs. comisión de los ejecutivos

Diseño aprobado por Jose el 09/10/2026. Sin Customer ID ni datos de comercios: los archivos de carga van al OneDrive de Stratis.

## Objetivo

BBVA reporta comercios reactivados (88 en el periodo 3, criterio de la presentación del 06/10). Para la **comisión del ejecutivo** el comercio cuenta solo si, **después de su primera visita válida**, transaccionó en **al menos 2 días distintos**. Hay que mostrar las dos medidas lado a lado («vs») y que el ejecutivo reciba un mensaje para **llamar o contactar** a todo reactivado BBVA que todavía no cuenta (decisión de Jose: opción A, todos los que no cuentan).

## Dos medidas

| Medida | Regla | Dónde se ve |
|---|---|---|
| Reactivado BBVA | Lista de BBVA del último corte cargado (`v2_resultados_bbva`, `reactivado = 'Si'`) | Presentación Mastercard/BBVA, escritorio, celular |
| Cuenta para comisión | `v2_dias_trx` ≥ 2: cortes con transacciones nuevas cuyo bloque empieza el día de la **primera visita válida con contacto** o después (criterio estricto; regla vigente desde el 28/09, confirmada por Jose el 09/10) | Escritorio (todos) y celular (cada ejecutivo lo suyo) |

Criterio estricto: el corte que incluye el día de la visita no cuenta, porque no se sabe si la transacción fue antes o después de la visita. Un bloque de varios días sin corte intermedio (por ejemplo, del 24 al 28/09) cuenta como un solo día. Con data diaria de BBVA ambas limitaciones desaparecen sin cambiar nada.

## Estados de un reactivado BBVA

| Estado | Regla | Celular | Escritorio |
|---|---|---|---|
| Cuenta | `dias_trx` ≥ 2 (estado `rea`) | «Reactivado · cuenta» | Cuenta |
| Falta 1 día | `dias_trx` = 1 (estado `uno`) | «Reactivado BBVA · falta 1 día» + mensaje | Falta 1 día |
| Por confirmar | `dias_trx` = 0 y hubo transacciones nuevas en el corte que incluye el día de la visita | «Reactivado BBVA · falta transacción después de tu visita» + mensaje | Por confirmar |
| Solo antes de la visita | `dias_trx` = 0 y todas las transacciones son de cortes anteriores a la visita | igual que «Por confirmar» | Solo antes de la visita |
| Falta visita con contacto | No tiene ninguna visita válida con contacto en el periodo: nunca cuenta, aunque transaccione | «Reactivado BBVA · falta visita con contacto» + mensaje propio | Sin visita con contacto |

Mensaje para «Falta visita con contacto»: «Este comercio ya usa el POS, pero tu visita fue sin contacto. Para que cuente necesitas volver y conversar con el comercio, y que después transaccione en 2 días distintos. Llámalo o escríbele para coordinar.»

Las cifras por estado y por ejecutivo están en el OneDrive de Stratis, no en este repositorio (es público).

Mensaje del celular: «Este comercio ya usa el POS, pero para que cuente necesita transacciones en 2 días distintos después de tu visita. Llámalo o escríbele.»

## Componentes

1. **Datos, sin cambios de esquema.** Jose carga desde el escritorio («Cargas»):
   - Transacciones, formato «Acumulado del mes por corte»: los 88 × 6 cortes de septiembre (21, 22, 23, 28, 29 y 30/09).
   - Resultados de BBVA con los 88, con corte nuevo del 06/10. La carga del 30/09 queda intacta; el CRM usa el último corte del periodo.
   - Los archivos los prepara Claude en el OneDrive de Stratis. La carga se hace el mismo día de la publicación.
2. **Migración** (además: `v2_mis_reactivados_bbva(p_periodo)` para el celular: por comercio propio reactivado BBVA en el último corte del periodo, `dias_trx`, si tiene visita válida con contacto y el id de su última visita) `supabase/migrations/2026101xxxxxxx_seguimiento_reactivados_bbva.sql`: `v2_registrar_seguimiento` acepta también la última visita de un comercio que es reactivado BBVA en el último corte del periodo y tiene `v2_dias_trx` < 2, aunque esa visita haya tenido contacto. Sigue sin tocar la visita, el estado ni el bono; deja su línea en `v2_bitacora_visita` (acción `seguimiento`). Mismas validaciones de usuario, ejecutivo, anulación y periodo.
3. **Celular** (`v2/celular/app.js`, `estilos.css`):
   - KPI «Reactivados que cuentan» (estado `rea`).
   - Etiquetas y mensaje de la tabla anterior en la lista y en la ficha. Reemplazan «pendiente de validación».
   - Tarjeta de Inicio «N reactivados por contactar»: reactivados BBVA que no cuentan, con «falta 1 día» primero.
   - Botón «Registrar contacto» con el formulario del seguimiento remoto.
   - Filtro de «Mi base» «Reactivados BBVA · por contactar».
4. **Escritorio** (`v2/escritorio/app.js`):
   - Cuadro «Reactivados BBVA vs. comisión» por ejecutivo: Reactivados BBVA, Cuentan, Falta 1 día, Por confirmar, Solo antes de la visita, Sin visita con contacto y Contactados (con al menos un seguimiento después de la carga).
   - Detalle por comercio: primera visita válida, transacciones por corte y estado.
   - «Por confirmar» y «Solo antes» se calculan en el escritorio con `v2_transacciones` y la fecha de la primera visita válida.
   - El Excel de la base para BBVA no cambia.

## Lo que no cambia

El medidor de visitas (Regla n.º 1), el bono por visita, la presentación de los 88 para Mastercard y el Excel de la base para BBVA.

## Pruebas

- **Celular:** los tres estados nuevos, en claro y en oscuro; la tarjeta de Inicio con su orden; el filtro; registrar un contacto en un reactivado con visita con contacto.
- **Servidor (PGlite):** el seguimiento se acepta para un reactivado BBVA que no cuenta, aunque la visita haya tenido contacto. Se rechaza si el comercio no es reactivado BBVA, si ya cuenta (`dias_trx` ≥ 2), o si la visita es de otro ejecutivo. Los casos de las visitas sin contacto siguen igual.
- **Escritorio:** el cuadro «vs» con datos inventados que cubran los cuatro estados.
- **Antes de pedir el OK:** el revisor. La migración se aplica el mismo día que se publica el celular.
