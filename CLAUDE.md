# CRM de campo Stratis · campaña BBVA Adquirencia

> **Regla n.º 1 · El medidor de visitas no se toca.** Una visita cuenta esté o no abierto el comercio y haya o no contacto. Ninguna regla de calidad puede impedir que se guarde una visita ni descartarla de la cola del celular. Las reglas de calidad **avisan** (señal en el escritorio de Jose), **no bloquean**. Solo se rechaza por seguridad (usuario, comercio de otro ejecutivo), por el plazo del periodo o por un error de captura evidente (fecha de volver anterior a la visita).

Instrucciones para Claude Code en este repositorio. Responde siempre en español, con tono cálido y a detalle. El usuario es **Jose**, que se escribe sin tilde.

## Qué es

Somos Stratis, y en el campo representamos a Openpay (adquirencia por POS) en una campaña de BBVA para reactivar comercios que tienen POS y no lo usan. Hay 900 leads por periodo, 225 por ejecutivo. Los ejecutivos son Alfredo, Anibal, Juan y Vanessa (correo de Vanessa: emelin.perez@).

El CRM tiene dos apps de una sola página, publicadas en GitHub Pages desde la rama `qa` del repo de Stratis:

| App | Fuente | Publicado en | Link | Quién la usa |
|---|---|---|---|---|
| Celular | `v2/celular/` | `index.html` (raíz) | https://crm-bbva-peru-qa.mystratis.com | Ejecutivos en campo |
| Escritorio | `v2/escritorio/` | `escritorio/index.html` | https://crm-bbva-peru-qa.mystratis.com/escritorio/ | **Solo Jose**; los ejecutivos no deben verla |

### Repositorio y ramas (desde el 23/10/2026)

- **Repo:** `mystratis-org/stratis-field-crm-fe-javascript` (interno de Stratis; lo administra Antonio Castañeda, Cloud & DevOps). Es `origin` en la carpeta del CRM. Jose entra con la cuenta **JoseRios-Stratis** (permiso Write, sin Admin), que es la cuenta activa de `gh`.
- **Ramas de Antonio:** `qa` = el link que usan los ejecutivos (Pages); `dev` = desarrollo; `master` = producción (aún sin uso, no tocar). Las sesiones trabajan en su rama `claude/…` creada desde `origin/qa` y abren el PR **hacia `qa`**. Lo fusiona la sesión, con el OK de Jose.
- **`CNAME` en `qa`:** mantiene el dominio `crm-bbva-peru-qa.mystratis.com`. No borrarlo ni moverlo.
- **Repo anterior** `jlriosmedina-cloud/stratis-crm-campo` (remoto `personal`, link `jlriosmedina-cloud.github.io/stratis-crm-campo`): ahí el celular muestra el aviso de mudanza al link nuevo (`URL_NUEVA`), primero envía la cola sin señal y después pide pasar. **No se apaga ni se transfiere** hasta que los 4 ejecutivos estén en el link nuevo y cierre el periodo (18/11); se archiva después de diciembre de 2026.
- **Mientras dure la mudanza, cada publicación sale en los dos links el mismo día:** primero en `qa` (PR) y después en `main` del repo `personal`, con los mismos `v2/`, `index.html` y `escritorio/index.html`, **sin** el `CNAME`. Para empujar al repo personal se usa la cuenta `jlriosmedina-cloud` (`gh auth token --user jlriosmedina-cloud`) sin cambiar la cuenta activa.

- **Datos y reglas:** Supabase (proyecto `xwvpnagvdrjffayzsnke`), tablas y funciones `v2_*`. Las apps solo leen con RPC (`v2_mi_base`, `v2_actividad`, `v2_avance`) y escriben con RPC (`v2_registrar_visita`, `v2_editar_resultado`, `v2_anular_visita`, etc.). Las reglas viven en la base, no en el navegador.
  - **Tope de 1.000 filas por respuesta (API de Supabase):** `v2_mi_base` va ordenada por `customer_id` y el escritorio la pide por tramos de 1.000 con `.range` (desde el 10/11, con 1.124 comercios en el P4). Todo lector nuevo de una lista que pueda pasar de 1.000 filas debe paginar con un orden fijo; si no, se pierden filas sin avisar (así «bajaron» los visitados de 508 a 409). Pendiente de vigilar: `v2_actividad` (una fila por visita; hoy ~580).
- **Versión 1:** la carpeta `v1/`, los SQL `01_…43_` de la raíz y `fuente/` son del CRM anterior. No borrar los datos v1 de Supabase hasta después de diciembre de 2026.

## Cómo se trabaja

- **Revisar** antes de pedirle a Jose el OK para aplicar una migración o publicar: corre el revisor (`/revisar` o el subagente `revisor` de `.claude/agents/`) y muestra su informe junto con la propuesta. Si el revisor marca una decisión de negocio, dilo al inicio.
- **Editar** `v2/<app>/app.js`, `estilos.css` o `shell.html`. Nunca editar a mano `index.html` ni `escritorio/index.html`.
- **Armar** con `python v2/build.py` (en Windows también `py v2/build.py`), que genera `v2/dist/`. BUILD es un hash del contenido, y el celular avisa «versión nueva» cuando cambia.
- **Probar** antes de publicar con `cd v2/qa && npm test` (la primera vez: `npm install` y `npx playwright install chromium`). Las pruebas usan solo datos inventados. Tienen que pasar en claro y en oscuro y sin errores de consola:
  - Playwright con Chromium, con el cliente de Supabase simulado.
  - Las reglas del servidor, en un Postgres local (PGlite) con la foto del esquema y las migraciones nuevas (`servidor.mjs`).
  - Casos mínimos:
    - registrar una visita con cada una de las 5 opciones de «¿Cómo fue la visita?»;
    - corregir la visita de hoy;
    - descargar la base para BBVA (hojas Resumen y Base, modelo de 55 columnas).
- **Publicar** con `python v2/build.py --publicar`, luego commit, push de la rama a `origin` y PR hacia `qa` (después, la copia en el repo personal; ver «Repositorio y ramas»). **Solo con el OK explícito de Jose, cada vez.**
- **Cambios en la base:** una migración en `supabase/migrations/` con nombre descriptivo. Aplicarla solo con el OK de Jose. Si cambia una función que usa el celular, se aplica el mismo día en que se publica la app.
  - Desde el 28/09 las funciones nuevas que crea `postgres` nacen sin EXECUTE para `anon` ni `PUBLIC` (privilegios por defecto); `authenticated` y `service_role` sí lo reciben. Una función que deba usarse sin sesión necesita su `grant` explícito, y hay que justificarlo.
  - Las funciones que escriben datos son `security definer` y dejan su línea en `v2_bitacora_visita`. Las apps no escriben directo en las tablas: los Managers y Analistas solo pueden leer `v2_visitas` y `v2_bitacora_visita`.
  - **Antes de cargar leads sin ejecutivo, `v2_mi_base` no debe mostrar comercios libres a los ejecutivos.**

## Reglas que no se rompen

1. Nada con Customer ID, RUC, nombres de comercios ni datos de visitas en este repositorio. El repositorio es público. Bases, cruces, respaldos y Excel van al OneDrive corporativo de Stratis. Los datos que BBVA marca como TLP no salen de los equipos de trabajo.
2. No hacer commit ni push sin que Jose lo pida.
3. Las claves (Supabase `service_role`, Google Maps, IA) las pega Jose; nunca se piden por chat ni se escriben en el código. La `anon`/publishable que está en las apps es pública por diseño.
4. No inventar números. Todo dato sale de la base o de un archivo que Jose entregó.
5. Revisiones de datos (direcciones, marcaciones) una por una, nunca masivas. No mover un comercio de zona sin la decisión de Jose. No tocar puntos con `geo_calidad = 'visita'`.
6. Toda corrección de datos se aplica con respaldo (tablas `v2_limpieza_marcaciones`, `v2_fb_reorganizacion`) y con una línea en `v2_bitacora_visita`.
7. El dictado con IA del celular queda apagado (`--voz` solo para prototipo).

## Modelo de la visita (desde el 26/09/2026)

**Pregunta única en el celular: «¿Cómo fue la visita?».** Cada opción se guarda así en la base:

| Opción | Se guarda como |
|---|---|
| Hablé con el dueño o el encargado | `Reunión concretada` + decisión (Realizará consumos / Aún no decide / Desiste). Con quién: Dueño o Tercero. Desde el 29/09, fecha para volver opcional en `fecha_reagenda` (sin el feedback «No se encontraba…») |
| No estaba quien decide · quedamos en volver | `Reagendada` + fecha. Siempre con el feedback «No se encontraba la persona que tomaba decisiones» y la acción «Reagendé con quien decide» |
| No estaba quien decide · sin compromiso | `Sin éxito` + «No se encontraba…» |
| No se pudo hacer la visita (antes «No hubo contacto») | `Nadie` · Cerrado (se lee «Cerrado hoy») / Cerró definitivamente / No atendió / Zona insegura / Otro motivo. Con Zona insegura u Otro motivo, `direccion_ok` queda sin dato |
| El comercio no está en esta dirección | `Nadie` · Dirección errada. Si lo encontró en otro lugar, la visita sigue en el mismo registro con `direccion_ok = false` y `comercio_ubicado = true` |

- **Reglas del servidor:**
  - una visita por comercio y día (si hay otra, se corrige la primera);
  - normalización de «Reagendada»;
  - «Reagendé» solo va con «Reagendada».
- **Resultado:** Éxito (realizará consumos) · En proceso (aún no decide o reagendada) · No éxito · No se encontró · Sin contacto (todos los motivos de «No se pudo hacer la visita», menos Dirección errada).
- **Seguimiento remoto (desde el 01/10):** en las visitas sin contacto, el ejecutivo registra después por qué canal contactó al comercio (Llamada, WhatsApp, Correo) y qué respondió (`v2_registrar_seguimiento`, tabla `v2_seguimientos`). No cambia la visita, el estado ni el bono; deja su línea en la bitácora (acción `seguimiento`). Inicio avisa cuántos comercios sin contacto esperan seguimiento. Meta de Jose: que ninguna visita quede sin feedback.
- **Reactivados BBVA vs. comisión (desde el 09/10):** BBVA reporta los reactivados (lo que va a Mastercard y BBVA). Al ejecutivo le cuentan solo si, después de su primera visita válida **con contacto**, el comercio transacciona en 2 días distintos (`v2_dias_trx`). El celular avisa qué reactivados BBVA todavía no cuentan (`v2_mis_reactivados_bbva`) y pide llamarlos o escribirles. El contacto se registra como seguimiento remoto, aunque la visita haya tenido contacto. El escritorio muestra el cuadro «Reactivados BBVA vs. comisión».
- **Recupero del POS (desde el 09/10):** si el comercio desiste del producto, el ejecutivo no recupera el equipo (lo hacen Soporte de Openpay y el comercio), pero registra qué hizo: ① Llamar a Soporte → ② En trámite → ③ Entregado → ✔ Validado por Jose; salidas «Trabado» y «Sigue con el POS» (`v2_avanzar_recupero`, `v2_validar_recupero`, tablas `v2_recuperos` y `v2_recupero_eventos`). El caso nace con la primera acción; antes se deduce de la visita. No cambia la visita ni el bono.
- **Tipificaciones oficiales de BBVA (desde el 01/11, definitivas):** cada una de las 25 frases de feedback de BBVA (texto exacto, idéntico al de BBVA; desde el 10/11 hay una 26.ª agregada por Stratis, «Teléfono del comercio que se comunicó a soporte», con motivo/submotivo/acción propuestos y pendientes de BBVA)  tiene motivo, submotivo y la acción que pide BBVA, en `v2_feedback_tipos` (`motivo_bbva`, `submotivo_bbva`, `accion_bbva`) y en `TIPI_BBVA` del celular y del escritorio, con el texto exacto de BBVA (las tres copias deben coincidir; la del celular no trae «No se encontraba…» ni «Sin observaciones», que no se eligen de la lista). No cambia lo que se guarda: el motivo sale de la frase. En el celular el feedback ya no es un desplegable: arriba las 6 frases más frecuentes y abajo los temas de BBVA, que abren sus frases; en pantalla se lee un texto corto (`FB_CORTO`) y se guarda el oficial. «Qué ofreciste» sigue por rama (el servidor valida las acciones por `grupo`) y desde el 03/11 es opcional. En la Base para BBVA van `Motivo_BBVA` y `Submotivo_BBVA` después de la columna 55.
- **Las 4 fases de BBVA (desde el 03/11):** motivo → submotivo → frase → acción y estado. El ejecutivo marca la frase (el motivo y el submotivo salen de ella); si marca más de una frase con acción, elige la **principal**; y responde «¿Cómo quedó?» lo que pide BBVA para esa frase: **Hecho / En trámite / No se pudo**, con n.º de ticket opcional. Va en `fb_extra` (`fb_principal`, `accion_estado`, `numero_ticket`; validan `v2_fb_extra_obs` y `v2_fb_extra_limpio`). No se pregunta en «Desconfía de la visita» (lo resuelve BBVA) ni es obligatorio al corregir visitas anteriores al 03/11. «Qué ofreciste» pasa a ser **opcional** («¿Algo más que hiciste?»).
- **Mi avance (03/11):** el celular sugiere a cada ejecutivo revisar su Drive individual de BBVA (sus alcances y lo que reporta BBVA). Solo texto, sin enlace.
- **Feedback agregado por Stratis el 29/09:** «Desconfía de la visita (duda que representemos a BBVA)» y «No pidió el POS» (Decisión y necesidad), «Solicitó cambio de equipo» (Equipo y contómetros), «Le falta una función» (Uso del POS).
- **Base para BBVA (Excel del escritorio), modelo «Gestión Stratis» de Jose (desde el 26/10, escritorio 3fd5ec; reemplaza al de KPIs y Base del 30/09):**
  - Tres hojas: **Resumen** (fórmulas por ejecutivo sobre Base, con el estado de lo que pide BBVA), **BBVA** (desde el 03/11: 29 columnas con solo lo que pide BBVA, en su orden; las 4 fases con los nombres de su archivo —Motivo, Submotivo, Feedback literal, Acción original, Estado— en azul; sin el comentario libre ni Reactivado_BBVA / Dias_Con_Trx_Post_Visita, porque ese cruce sale de la plataforma de BBVA; en Base se quedan) y **Base**, el respaldo completo de Stratis. Una fila por comercio de la **base nueva** del periodo. La base anterior y los de «salida» no van.
  - **Base tiene 55 columnas** en el orden que fijó Jose (`BASE55` en `v2/escritorio/app.js`). La llave es **Documento** en la columna A (RUC o DNI como texto; sin documento, el RUC). Numero_Ticket, Estado_Del_Problema, Fecha_Resolucion y Proxima_Accion van en AO–AR, no al final.
  - Las columnas que el celular todavía no captura van vacías, con cabecera naranja (`BASE55_FALTA`): hoy son 6 (nombre y cargo del contacto, celular confirmado, mejor horario, sentir del cliente, punto de dolor y severidad). Se llenan cuando el celular las capture.
  - Lo nuevo va **después de la columna 55**: `Fuente_Feedback` y `Fuente_Que_Lo_Convencio` (Feedback y Que_Lo_Convencio mezclan lo que marcó el ejecutivo con lo inferido del comentario), `Motivo_BBVA` y `Submotivo_BBVA` (un solo valor cuando hay frase principal) y, desde el 03/11, `Feedback_Principal` y `Accion_BBVA` (61 columnas).
  - Desde el 03/11, AO–AR salen del estado de lo que pide BBVA (de la última visita con feedback): Numero_Ticket, Estado_Del_Problema (Hecho / En trámite / No se pudo), Fecha_Resolucion (la visita, si quedó hecho) y Proxima_Accion («Seguimiento hasta la solución» o «Pendiente: …»). Jose le avisa a Gabriel del formato.
  - `Reactivado_BBVA` y `Cuenta_Para_Comision` dicen «Sin dato en el corte» mientras no haya un corte de BBVA dentro del periodo (no «NO»).
  - Un cambio de columnas cambia el archivo que recibe BBVA: avisar a Gabriel y a BBVA.
  - **Celulares del comercio (desde el 11/11):** BBVA envía hasta 3 números por comercio. `v2_comercios.contacto_celular` es el principal y `contacto_celular2` / `contacto_celular3` los otros; `v2_mi_base` los devuelve al final. La ficha del celular los muestra como «Celular 1/2/3» detrás del ojo; sin ninguno dice «Sin número registrado».
  - **Tasas fuera del CRM (desde el 11/11):** ya no se muestran las tasas del comercio ni se captura «Tasa que le cobra» (tasa del competidor). La columna `Tasa_Competidor` se queda en su lugar (no mover las 55 columnas) pero va siempre vacía y con cabecera naranja (`BASE55_FALTA`). Las frases oficiales de BBVA con «tasa» y los datos antiguos de visitas se conservan.
  - `Gestion_Con_Contacto` (SI/NO) y su fecha sirven para el cruce con los volúmenes de BBVA.

## Contexto de negocio

Las decisiones, alertas y análisis están en el proyecto de Claude «Registros de Vistias a clientes - Stratis» (docs `claude/crm-v2-*`). Lo más reciente:

- `crm-v2-limpieza-y-simplificacion.md`
- `crm-v2-alertas-efectividad-visitas.md`
- La propuesta de «20 leads diarios por ejecutivo por zona», que Jose planteó presentar a Gabriel y BBVA el 28/09.
