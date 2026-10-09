# Recupero del POS · plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** registrar y medir, paso a paso, lo que hace el ejecutivo en el recupero del POS de los comercios que desisten, con la validación final de Jose.

**Architecture:**
- **Datos:** dos tablas nuevas (`v2_recuperos`, `v2_recupero_eventos`), que solo escriben tres funciones `security definer`.
- **Casos sin acción todavía:** el caso que nadie tocó se deduce de la última visita, con «Desiste del producto».
- **Celular:** muestra la barra de pasos y un botón grande.
- **Escritorio:** muestra el cuadro por ejecutivo y los botones Validar / Observar.

**Tech Stack:** Postgres (plpgsql) en Supabase. Apps JS sin framework. Pruebas con Playwright y PGlite (`v2/qa`).

**Spec:** `docs/superpowers/specs/2026-10-09-recupero-pos-design.md`

## Global Constraints

- Regla n.º 1: no se toca la visita, el medidor ni el bono.
- Sin commit, migración ni publicación sin el OK de Jose.
- Solo datos inventados en las pruebas.
- Pasos: `llamar`, `tramite`, `entregado`, `validado`, `trabado`, `sigue`.
- Acciones: `llame_soporte`, `entregado`, `problema`.
- Detalles de `llame_soporte`: «Programaron el recojo», «Me dieron un número de caso», «No contestaron, vuelvo a llamar».
- Detalles de `problema`: «Cambió de opinión: seguirá usando el POS», «No quiere entregar el equipo», «No ubica el equipo».
- Límites de texto: nota ≤ 300 caracteres; número de caso ≤ 40; la nota de Observar es obligatoria y ≥ 10.
- Bitácora: acción nueva `recupero`, sobre la visita del desiste.
- Textos del celular: los del spec, tal cual.

## Review Focus

1. **El comercio desistió, luego tuvo otra visita y no desiste:** sin caso, sale de la lista. Con caso abierto, sigue en la lista.
2. **Doble toque del botón** (dos llamadas seguidas): la segunda transición inválida se rechaza con un mensaje claro y no duplica el evento.
3. **Ejecutivo distinto al de la visita del desiste:** se rechaza, igual que en el seguimiento.
4. **Un admin avanza un caso:** queda `por` = admin en el evento.
5. **Periodo cerrado:** se rechaza.

---

### Task 1: Migración y pruebas del servidor

**Files:**
- Create: `supabase/migrations/20261010100000_recupero_pos.sql`
- Modify: `supabase/migrations/README.md`, `CLAUDE.md`
- Test: `v2/qa/servidor.mjs`

**Produces:**
- `v2_mis_recuperos(p_periodo text default null) returns table(customer_id text, visita_id uuid, paso text, caso_soporte text, desde date, actualizado_en timestamptz, intentos int, historial jsonb)`
- `v2_avanzar_recupero(p_customer_id text, p_accion text, p_detalle text, p_caso text default null, p_nota text default null) returns text`, que devuelve el paso nuevo.
- `v2_validar_recupero(p_customer_id text, p_valido boolean, p_nota text default null) returns text`

- [ ] Casos que fallan:
  - **Deducido de la visita:** desiste con equipo `No` sale en `llamar`; con `Sí`, en `entregado`.
  - **Flujo completo:** «No contestaron» (queda en `llamar`, intentos 1) → «Programaron el recojo» (pasa a `tramite`) → `entregado` → Observar (exige nota; vuelve a `tramite`) → `entregado` → Validar (`validado`).
  - **Transiciones inválidas:** `entregado` desde `llamar`, y un detalle fuera de la lista.
  - **`problema`:** «No quiere entregar» pasa a `trabado`; desde `trabado`, «Programaron el recojo» pasa a `tramite`; «Cambió de opinión» pasa a `sigue`, que ya no aparece en la lista.
  - **Permisos:** otro ejecutivo, sin sesión, y un ejecutivo intentando validar se rechazan.
  - **Bitácora y visita:** queda la línea `recupero`, y la visita no cambia.
  - **Visita posterior:** un comercio con una visita posterior que no desiste y sin caso sale de la lista.
- [ ] Correr `node v2/qa/servidor.mjs`. Debe fallar.
- [ ] Escribir la migración:
  - tablas con check de `paso` y unique `(periodo, customer_id)`;
  - RLS de lectura escritorio y `revoke` como en `v2_seguimientos`;
  - check de bitácora con `recupero`;
  - las 3 funciones.
- [ ] Correr. Debe pasar todo.

### Task 2: Celular

**Files:** `v2/celular/app.js`, `estilos.css` · **Test:** `v2/qa/celular.mjs`

**Produces:**
- `S.recup`: un Map `customer_id → fila`, o `null` si falla. Lo carga `cargarSeguimientos()`.
- `bloqueRecupero(c)`
- La tarjeta `.recup-card`
- El filtro `recup`

- [ ] Pruebas que fallan, en claro y en oscuro, con un fixture de 3 comercios (`llamar`, `tramite`, `entregado`):
  - la tarjeta muestra «2 equipos por recuperar», con el de `llamar` primero;
  - la ficha en `llamar` muestra la barra de pasos con el paso 1 activo y el botón «Ya llamé a Soporte»;
  - al elegir «Me dieron un número de caso» y escribir el número, se llama a `v2_avanzar_recupero` con `p_accion = 'llame_soporte'`;
  - en `tramite`, el botón llama con `p_accion = 'entregado'`;
  - «Hay un problema» ofrece las 3 opciones;
  - en `entregado` aparece «falta que Jose lo valide» y ningún botón;
  - el filtro «Recupero del POS» trae los 3.
- [ ] Implementar y correr `node v2/qa/celular.mjs` hasta que esté verde.

### Task 3: Escritorio

**Files:** `v2/escritorio/app.js` · **Test:** `v2/qa/escritorio.mjs`

- [ ] Prueba que falla:
  - el cuadro «Recupero del POS» (pestaña de Auditoría) muestra por ejecutivo: Casos, Llamar a Soporte, En trámite, Entregado (por validar), Validado, Trabado, Sigue con el POS y Más de 7 días sin avance;
  - Validar llama a `v2_validar_recupero` con `p_valido = true`;
  - Observar sin nota no llama; con nota, llama con `false`.
- [ ] Implementar. Lee `v2_mis_recuperos()` como admin, y pide la nota de Observar con el patrón de `S.accion` existente o un prompt simple.
- [ ] Correr `node v2/qa/escritorio.mjs` hasta que esté verde.

### Task 4: Cierre

- [ ] `python v2/build.py`
- [ ] `cd v2/qa && npm test`: todo verde.
- [ ] Correr el revisor y entregar su informe tal cual.
- [ ] Pedir el OK de Jose para el commit, la migración y la publicación (el mismo día).
