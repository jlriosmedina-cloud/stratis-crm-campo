# CRM de campo Stratis · campaña BBVA Adquirencia

> **Regla n.º 1 · El medidor de visitas no se toca.** Una visita cuenta esté o no abierto el comercio y haya o no contacto. Ninguna regla de calidad puede impedir que se guarde una visita ni descartarla de la cola del celular. Las reglas de calidad **avisan** (señal en el escritorio de Jose), **no bloquean**. Solo se rechaza por seguridad (usuario, comercio de otro ejecutivo), por el plazo del periodo o por un error de captura evidente (fecha de volver anterior a la visita).

Instrucciones para Claude Code en este repositorio. Responde siempre en español, con tono cálido y a detalle. El usuario es **Jose**, que se escribe sin tilde.

## Qué es

Somos Stratis, y en el campo representamos a Openpay (adquirencia por POS) en una campaña de BBVA para reactivar comercios que tienen POS y no lo usan. Hay 900 leads por periodo, 225 por ejecutivo. Los ejecutivos son Alfredo, Anibal, Juan y Vanessa (correo de Vanessa: emelin.perez@).

El CRM tiene dos apps de una sola página, publicadas en GitHub Pages:

| App | Fuente | Publicado en | Quién la usa |
|---|---|---|---|
| Celular | `v2/celular/` | `index.html` (raíz) | Ejecutivos en campo |
| Escritorio | `v2/escritorio/` | `escritorio/index.html` | **Solo Jose**; los ejecutivos no deben verla |

- **Datos y reglas:** Supabase (proyecto `xwvpnagvdrjffayzsnke`), tablas y funciones `v2_*`. Las apps solo leen con RPC (`v2_mi_base`, `v2_actividad`, `v2_avance`) y escriben con RPC (`v2_registrar_visita`, `v2_editar_resultado`, `v2_anular_visita`, etc.). Las reglas viven en la base, no en el navegador.
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
    - descargar la base para BBVA (hojas KPIs y Base).
- **Publicar** con `python v2/build.py --publicar`, luego commit y push. **Solo con el OK explícito de Jose, cada vez.**
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
- **Feedback agregado por Stratis el 29/09:** «Desconfía de la visita (duda que representemos a BBVA)» y «No pidió el POS» (Decisión y necesidad), «Solicitó cambio de equipo» (Equipo y contómetros), «Le falta una función» (Uso del POS).
- **Base para BBVA (Excel del escritorio), modelo de Jose del 30/09:** solo dos hojas, KPIs y Base. Todos los KPIs son fórmulas sobre la hoja Base; la columna Ejecutivo (al final de Base) es la asignación del periodo. Sin notas al pie ni fila de subtítulo en KPIs.
  - `Gestion_Con_Contacto` (SI/NO) y su fecha sirven para el cruce con los volúmenes de BBVA.

## Contexto de negocio

Las decisiones, alertas y análisis están en el proyecto de Claude «Registros de Vistias a clientes - Stratis» (docs `claude/crm-v2-*`). Lo más reciente:

- `crm-v2-limpieza-y-simplificacion.md`
- `crm-v2-alertas-efectividad-visitas.md`
- La propuesta de «20 leads diarios por ejecutivo por zona», que Jose planteó presentar a Gabriel y BBVA el 28/09.
