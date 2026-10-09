# Reactivados BBVA vs. comisión · plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar, junto a los reactivados de BBVA, cuáles cuentan para la comisión del ejecutivo (2 días distintos con transacciones después de la visita), y pedirle al ejecutivo que contacte a los que todavía no cuentan.

**Architecture:**
- La regla ya existe: `v2_dias_trx` y los estados `rea`/`uno` de `v2_mi_base`. No se cambia ni el esquema de datos ni `v2_mi_base`.
- Una migración amplía `v2_registrar_seguimiento` para los reactivados BBVA que aún no cuentan.
- El celular muestra etiquetas, el mensaje y una tarjeta de Inicio. El escritorio agrega el cuadro «vs» por ejecutivo.
- Los datos (6 cortes acumulados y la lista de los 88) los carga Jose desde «Cargas».

**Tech Stack:** Supabase/Postgres (plpgsql). Apps de una página en JS sin framework. Pruebas con Playwright (cliente simulado) y PGlite (`v2/qa`).

**Spec:** `docs/superpowers/specs/2026-10-09-reactivados-comision-design.md`

## Global Constraints

- Regla n.º 1: el seguimiento no cambia la visita, el estado, el avance ni el bono.
- Nada de Customer ID, RUC ni datos de comercios en el repositorio. Las pruebas usan solo datos inventados (`000000xx`).
- No hacer commit ni push sin el OK de Jose. Los pasos «Commit» de las tareas quedan como «dejar listo para commit».
- La migración se aplica solo con el OK de Jose, el mismo día que se publica el celular.
- Las pruebas pasan en claro y en oscuro y sin errores de consola (`cd v2/qa && npm test`).
- Regla confirmada por Jose (09/10): cuenta desde la primera visita válida **con contacto** (`v2_dias_trx` vigente, sin cambios).
- El texto del mensaje es fijo: «Este comercio ya usa el POS, pero para que cuente necesita transacciones en 2 días distintos después de tu visita. Llámalo o escríbele.»
- Mensaje para los que no tienen visita con contacto: «Este comercio ya usa el POS, pero tu visita fue sin contacto. Para que cuente necesitas volver y conversar con el comercio, y que después transaccione en 2 días distintos. Llámalo o escríbele para coordinar.»
- Etiquetas fijas:
  - «Reactivado · cuenta»
  - «Reactivado BBVA · falta 1 día»
  - «Reactivado BBVA · falta transacción después de tu visita»
  - «Reactivado BBVA · falta visita con contacto»
- El KPI se llama «Reactivados que cuentan».
- Las columnas del escritorio son: Reactivados BBVA · Cuentan · Falta 1 día · Por confirmar · Solo antes de la visita · Sin visita con contacto · Contactados.
- Nunca usar «CRM», «GPS» ni «ticket» en textos para BBVA o Mastercard. Esto no afecta a estas pantallas internas, pero no se agregan esas palabras al Excel de la base.

## Review Focus

1. **Comercio reactivado BBVA con varias visitas:** el seguimiento se ofrece y se acepta solo en su **última** visita no anulada. En una visita anterior se rechaza.
2. **Comercio reactivado BBVA que ya cuenta** (`dias_trx` ≥ 2): no aparece en «por contactar», y el servidor rechaza el seguimiento si su visita tuvo contacto.
3. **Corte de BBVA de otro periodo:** un comercio que figura como reactivado en un corte fuera del periodo en curso no se trata como reactivado BBVA. Se usa el mismo `kb` de `v2_mi_base`: el último corte dentro de `ini..fin`.
4. **Sin seguimientos cargados** (falla `v2_mis_seguimientos`, `S.seg == null`): la tarjeta de Inicio no aparece y la app no se rompe, igual que hoy.
5. **Comercio reactivado BBVA sin ninguna transacción cargada:** el escritorio lo clasifica como «Solo antes de la visita» o «Por confirmar» solo si hay cortes. Si no hay ninguno, va en una columna aparte «sin data» que suma al total, en lugar de desaparecer.

---

### Task 1: Migración · seguimiento para los reactivados BBVA que aún no cuentan

**Files:**
- Create: `supabase/migrations/20261009100000_seguimiento_reactivados_bbva.sql`
- Modify: `supabase/migrations/README.md` (fila «pendiente de aplicar»), `CLAUDE.md` (párrafo «Seguimiento remoto»: agregar los reactivados BBVA que no cuentan)
- Test: `v2/qa/servidor.mjs` (casos nuevos al final)

**Interfaces:**
- Produces:
  - `public.v2_reactivado_por_contactar(p_cid text, p_periodo text) returns boolean`. Es `stable security definer`, con `search_path public` y `execute` solo para `authenticated` y `service_role`. Devuelve true si el comercio figura con `reactivado = 'Si'` en el último corte de `v2_cortes_bbva` dentro del periodo **y** `v2_dias_trx(p_cid, p_periodo) < 2`.
  - `v2_registrar_seguimiento(uuid, text, text, text)` mantiene la firma. Ahora acepta la visita si `con = 'Nadie'`, **o** si la visita es la última no anulada del comercio en su periodo y `v2_reactivado_por_contactar(customer_id, periodo)` es true. El nuevo mensaje de rechazo es «El seguimiento remoto es para las visitas sin contacto o para los reactivados BBVA que aún no cuentan.», que sigue conteniendo «sin contacto».
  - `public.v2_mis_reactivados_bbva(p_periodo text default null) returns table(customer_id text, dias_trx int, con_contacto boolean, ultima_visita_id uuid)`. Es `stable security definer`, con el mismo permiso. Devuelve los comercios propios (un admin, todos) con `reactivado = 'Si'` en el último corte del periodo y al menos una visita no anulada en él. `con_contacto` indica si hay una visita válida con contacto.
  - `v2_mis_seguimientos` no cambia.

- [ ] **Step 1: Escribir los casos que fallan** en `v2/qa/servidor.mjs`, con comercios nuevos `00000073` a `00000076` creados en el caso, como en «retiro temporal».

```js
caso('seguimiento: reactivado BBVA que aún no cuenta, aunque la visita tuvo contacto', async () => {
  // 73: reactivado BBVA en el último corte del periodo, sin transacciones después → se acepta en su última visita
  // 74: reactivado BBVA con 2 días de trx después de la visita (dias_trx = 2) → se rechaza /sin contacto/
  // 75: no reactivado → se rechaza /sin contacto/
  // 73 con una visita anterior además de la última → la anterior se rechaza /sin contacto/
  // 76: reactivado solo en un corte de otro periodo → se rechaza /sin contacto/
  // v2_mis_reactivados_bbva(): EJ ve 73 y 74 (con dias_trx y con_contacto), no 75 ni 76; OTRO no los ve; anon → permission denied
  // el seguimiento aceptado no cambia con/que/decision/motivo de la visita y deja bitácora 'seguimiento'
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd v2/qa && node servidor.mjs`
Expected: MAL en el caso nuevo con «sin contacto» para el comercio 73.

- [ ] **Step 3: Escribir la migración.** Va con `create or replace` de las dos funciones, `revoke ... from public, anon` y `grant ... to authenticated, service_role`. El encabezado explica la decisión de Jose del 09/10 y dice «se aplica el mismo día que se publica el celular».

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd v2/qa && node servidor.mjs`
Expected: todos `ok`, incluidos los dos casos existentes de «seguimiento remoto».

- [ ] **Step 5: Dejar listo para commit** (sin commit hasta el OK de Jose).

---

### Task 2: Celular · etiquetas, mensaje, KPI, tarjeta de Inicio, filtro y contacto

**Files:**
- Modify: `v2/celular/app.js`:
  - `ESTADOS` (línea ~20)
  - `metricas` (~340)
  - Inicio (~408-424)
  - filtro de Mi base (~458, ~487)
  - lista y ficha (~473, ~542)
  - `bloqueSeguimiento` (~616)
- Modify: `v2/celular/estilos.css` (clase `.rea-card`, copiando `.seg-card`)
- Test: `v2/qa/celular.mjs`

**Interfaces:**
- Consumes: `v2_registrar_seguimiento` y `v2_mis_reactivados_bbva` de la Task 1. De `v2_mi_base`, el campo `estado`.
- Produces (en `app.js`):
  - `S.rbbva`: un Map `customer_id → fila de v2_mis_reactivados_bbva`, o `null` si la RPC falla. Lo carga `cargarReactivadosBBVA()` junto con `cargarSeguimientos()`.
  - `porContactar(c) -> boolean`: `esMio(c) && S.rbbva?.has(c.customer_id) && fila.dias_trx < 2`.
  - `contactadoDesde(c) -> boolean`: hay un seguimiento de `c.customer_id` con `hecho_en` igual o posterior a `c.bbva_reactivado`.
  - `etiquetaComision(c) -> {t, c, ayuda} | null`:
    - con `rea` → «Reactivado · cuenta»;
    - si es `porContactar` y `estado === "uno"` → «Reactivado BBVA · falta 1 día»;
    - si es `porContactar` y `!fila.con_contacto` → «Reactivado BBVA · falta visita con contacto» (con su mensaje);
    - si es `porContactar` en otro estado → «Reactivado BBVA · falta transacción después de tu visita»;
    - en cualquier otro caso → `null`.
    - `ayuda` lleva el mensaje fijo.

- [ ] **Step 1: Pruebas que fallan** en `celular.mjs`, sobre el fixture existente:
  - Agregar el comercio 13: `bbva_reactivado`, estado `uno`, última visita **con** contacto.
  - Agregar el comercio 14: `bbva_reactivado`, estado `rea`.
  - Agregar el comercio 15: reactivado BBVA sin visita con contacto (`con_contacto: false`).
  - El fixture de `v2_mis_reactivados_bbva` lleva 12, 13, 14 y 15.
  - El 12 ya existe: `bbva_reactivado`, estado `seg`.
  - Asserts:
    - la lista muestra «Reactivado BBVA · falta 1 día» (13), «Reactivado BBVA · falta transacción después de tu visita» (12) y «Reactivado · cuenta» (14);
    - Inicio muestra «3 reactivados por contactar», con el 13 primero;
    - el KPI dice «Reactivados que cuentan»;
    - el filtro «Reactivados BBVA · por contactar» deja 12, 13 y 15; el 15 muestra «Reactivado BBVA · falta visita con contacto»;
    - la ficha del 13 ofrece `[data-seg]` en su última visita aunque `con !== 'Nadie'`, y al guardar llama a `v2_registrar_seguimiento` con esa visita;
    - el 14 no ofrece `[data-seg]`;
    - ya no aparece el texto «pendiente de validación».
  - Todo en claro y en oscuro.

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd v2/qa && node celular.mjs`
Expected: MAL en los asserts nuevos.

- [ ] **Step 3: Implementar.** Lo que pide cada parte:
  - **`bloqueSeguimiento(v)`:** se muestra si `v.con === "Nadie"`, o si el comercio de la visita cumple `porContactar` y `v.id === fila.ultima_visita_id`.
  - **Panel de la segunda variante:** dice «Ya usa el POS: contáctalo para que vuelva a transaccionar después de tu visita» en lugar de «No hubo contacto en la visita…».
  - **Tarjeta de Inicio:** se oculta para admin y cuando `S.seg == null`. Cuenta los comercios con `porContactar(c) && !contactadoDesde(c)`, y su botón aplica el filtro.
  - **Reemplazos:** el texto «pendiente de validación» de la tarjeta BBVA, de la lista y de la ficha se reemplaza por la etiqueta y el mensaje.

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd v2/qa && node celular.mjs`
Expected: todo `ok` en claro y oscuro, sin errores de consola.

- [ ] **Step 5: Dejar listo para commit.**

---

### Task 3: Escritorio · cuadro «Reactivados BBVA vs. comisión»

**Files:**
- Modify: `v2/escritorio/app.js`:
  - `cruceBBVA()` (~816): el cuadro va arriba de lo existente.
  - carga de datos de la vista: leer `v2_transacciones` del mes o meses del periodo y `v2_seguimientos`, que ya se leen en ~1552.
- Test: `v2/qa/escritorio.mjs`

**Interfaces:**
- Consumes: de `S.base` (vía `v2_mi_base`), los campos `estado`, `dias_trx` y `bbva_reactivado`; la primera visita válida de `S.act` (`lat` no nulo, sin `fuera_plazo`, no anulada); y las filas de `v2_transacciones` `{fecha_corte, mes, formato, trx}`.
- Produces: `clasificarComision(c, d1, cortes) -> "cuenta" | "uno" | "confirmar" | "antes" | "sindata"`. Cada estado sale así:
  - `"cuenta"`: si `dias_trx` ≥ 2.
  - `"uno"`: si `dias_trx` = 1.
  - `"confirmar"`: si algún bloque `(prev_corte, fecha_corte]` con trx nuevas contiene `d1`.
  - `"antes"`: si hay trx nuevas solo en bloques que terminan antes de `d1`.
  - `"sindata"`: si no hay cortes.
  - `"sincontacto"`: va antes que todo lo anterior, si no hay visita válida con contacto (`d1` = primera visita válida **con contacto**).
  - `prev_corte` y el delta se calculan igual que en `v2_dias_trx`: el corte anterior del mismo mes y formato, o el último día del mes anterior.

- [ ] **Step 1: Prueba que falla** en `escritorio.mjs`. Fixture con 5 comercios reactivados BBVA de dos ejecutivos, con un caso de cada estado: `cuenta`, `uno`, `confirmar`, `antes`, `sindata` y `sincontacto` (6 comercios). Uno de ellos tiene un seguimiento posterior al corte. Asserts:
  - el cuadro muestra los encabezados fijos;
  - las cifras por ejecutivo y el total (6 = 1 + 1 + 1 + 1 + 1 + 1, más la columna «sin data»);
  - «Contactados» = 1;
  - el detalle por comercio muestra la fecha de la primera visita.

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd v2/qa && node escritorio.mjs`
Expected: MAL en «Reactivados BBVA vs. comisión».

- [ ] **Step 3: Implementar `clasificarComision` y el cuadro**, con las clases de tabla existentes (`datos`, `pill`).

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd v2/qa && node escritorio.mjs`
Expected: todo `ok` y la descarga de la base para BBVA sin cambios (KPIs y Base).

- [ ] **Step 5: Dejar listo para commit.**

---

### Task 4: Armado, pruebas completas y revisor

- [ ] **Step 1:** `python v2/build.py`. Expected: genera `v2/dist/` con el BUILD nuevo.
- [ ] **Step 2:** `cd v2/qa && npm test`. Expected: todas las pruebas `ok` en claro y oscuro.
- [ ] **Step 3:** Correr el subagente `revisor` sobre el diff y la migración sin aplicar. Entregarle a Jose su informe tal cual; si marca una DECISIÓN DE NEGOCIO, decirlo en la primera línea.
- [ ] **Step 4:** Pedirle a Jose el OK para: commit, aplicar la migración, publicar (`python v2/build.py --publicar`), push y PR.

---

### Task 5: Datos de BBVA (fuera del repositorio) y salida a producción

Se hace el día de la publicación, solo con el OK de Jose.

- [ ] **Step 1:** Generar en `C:\Users\Jose Rios\OneDrive - STRATIS\Documents\Cargas BBVA\`, fuera del repositorio, dos archivos a partir de `Reactivados_88_activacion_por_bloques.xlsx`:
  - **`transacciones_acumulado_2026-09.csv`:** con columnas `fecha_corte,customer_id,trx`, 88 × 6 filas, cortes del 21, 22, 23, 28, 29 y 30/09.
  - **`resultados_bbva_88.csv`:** con columnas `customer_id,gestion_con_contacto,reactivado,facturado`. `gestion_con_contacto` sale de las visitas; `reactivado` es `Si`; `facturado` va vacío.
- [ ] **Step 2:** Verificar los archivos contra el análisis del 09/10 (cifras por estado en el OneDrive, no en el repositorio), con la misma lógica que `v2_dias_trx` desde la visita con contacto.
- [ ] **Step 3:** Con el OK de Jose: aplicar la migración y publicar el celular y el escritorio, el mismo día.
- [ ] **Step 4:** Jose carga los dos archivos desde «Cargas» del escritorio. Los resultados de BBVA van con **corte 06/10**.
- [ ] **Step 5:** Comprobar en la base que `v2_mi_base` da los `rea` y `uno` del análisis, y que el cuadro «vs» del escritorio da las cifras del Step 2.
