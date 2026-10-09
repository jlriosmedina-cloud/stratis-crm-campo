# Recupero del POS · seguimiento de lo que hizo el ejecutivo

Diseño aprobado por Jose el 09/10/2026.

## Objetivo

Medir qué hizo el ejecutivo cuando el comercio no desea el POS Openpay. El ejecutivo no recupera el equipo (lo hacen Soporte de Openpay y el comercio). Lo que sí hace es llamar a Soporte, acompañar el trámite y confirmar la entrega. Jose valida el cierre.

La pantalla tiene que ser simple, porque los ejecutivos no son muy tecnológicos: ven en qué paso va el comercio, una frase de qué hacer y **un solo botón grande** para el siguiente paso.

## Quiénes entran

Los comercios cuya **última visita** del periodo es «Reunión concretada» con «Desiste del producto», más los que ya tienen un caso de recupero abierto. Los que cerraron definitivamente y los «Cancelado» quedan para después, con el mismo flujo.

## Pasos

| Paso (`paso`) | Cuándo | Qué ve el ejecutivo | Botón |
|---|---|---|---|
| `llamar` · ① Llamar a Soporte | Desistió y el equipo quedó en «No» o «Pendiente» | «Llama a Soporte de Openpay para coordinar la devolución del POS.» | «Ya llamé a Soporte» |
| `tramite` · ② En trámite con Soporte | Soporte tomó el caso | «Soporte ya tiene el caso. Confirma con el comercio cuando entregue el equipo.» | «El comercio ya entregó el equipo» |
| `entregado` · ③ Entregado | Lo marca el ejecutivo, o en la visita marcó que el equipo se recuperó («Sí») | «Entregado · falta que Jose lo valide.» | — |
| `validado` · ✔ Recupero cerrado | Jose lo valida en el escritorio | «Recupero cerrado.» | — |
| `trabado` · Trabado | El comercio no quiere entregar o no ubica el equipo | «Jose lo está revisando.» | «Ya llamé a Soporte» (para retomar) |
| `sigue` · Sigue con el POS | El comercio cambió de opinión | Sale del recupero y vuelve a la gestión normal | — |

**«Ya llamé a Soporte»** pide una sola elección:
- «Programaron el recojo»: pasa a `tramite`.
- «Me dieron un número de caso»: pasa a `tramite`. El número es opcional, de hasta 40 caracteres.
- «No contestaron, vuelvo a llamar»: se queda en `llamar` y cuenta como intento.

**«Hay un problema»** es un botón pequeño, disponible en `llamar`, `tramite` y `trabado`:
- «Cambió de opinión: seguirá usando el POS»: pasa a `sigue`.
- «No quiere entregar el equipo»: pasa a `trabado`.
- «No ubica el equipo»: pasa a `trabado`.

**Escritorio:**
- «Validar» funciona solo sobre `entregado` y lo pasa a `validado`.
- «Observar» también va sobre `entregado`. Devuelve el caso a `tramite` con una nota obligatoria de al menos 10 caracteres.

**Nota:** opcional en cada paso del ejecutivo, de hasta 300 caracteres.

## Datos

- **`v2_recuperos`:** un caso por comercio y periodo. Columnas:
  - `periodo`, `customer_id`, `correo` (el ejecutivo de la visita);
  - `visita_id` (la visita del desiste);
  - `paso`, `caso_soporte`, `creado_en`, `actualizado_en`, `validado_por`, `validado_en`.
- **`v2_recupero_eventos`:** el historial. Columnas: `recupero_id`, `paso_antes`, `paso_despues`, `accion`, `detalle`, `nota`, `por`, `en`.
- El caso **se crea solo en la primera acción**: no hay carga masiva ni trigger sobre las visitas. Mientras no tenga caso, el paso se deduce de la visita: `Sí` es `entregado` y lo demás es `llamar`.
- **RLS:** lectura solo con `v2_puede_escritorio()`, y sin escritura directa desde las apps. Escriben solo las funciones `security definer`. Cada acción deja su línea en `v2_bitacora_visita`, sobre la visita del desiste, con la acción nueva `recupero`.

## Funciones

- **`v2_mis_recuperos(p_periodo text default null)`:** devuelve los casos (existentes o deducidos) del ejecutivo; un admin ve todos. Columnas: `customer_id`, `visita_id`, `paso`, `caso_soporte`, `desde` (fecha del desiste o de la creación), `actualizado_en` e `intentos` (llamadas sin respuesta).
- **`v2_avanzar_recupero(p_customer_id text, p_accion text, p_detalle text, p_caso text, p_nota text)`:**
  - **Quién:** solo el ejecutivo de la visita, o un admin, y solo en el periodo en curso.
  - **Acciones válidas:** `llame_soporte`, `entregado`, `problema`.
  - **Rechazo:** cualquier transición que no esté en la tabla de pasos.
- **`v2_validar_recupero(p_customer_id text, p_valido boolean, p_nota text)`:** solo con `v2_puede_escritorio()`.
- **Permisos:** `execute` solo para `authenticated` y `service_role`.

## Pantallas

- **Celular:**
  - **Tarjeta de Inicio:** «N equipos por recuperar». Cuenta los que están en `llamar`, `tramite` y `trabado`; los de `llamar` van primero.
  - **Ficha del comercio:** un bloque «Recupero del POS» con:
    - la barra de 3 pasos, con el actual resaltado;
    - la frase de qué hacer y el botón grande del paso actual;
    - «Hay un problema» y el historial.
  - **Filtro de Mi base:** «Recupero del POS».
- **Escritorio:**
  - **Cuadro por ejecutivo:** casos, Llamar a Soporte, En trámite, Entregado (por validar), Validado, Trabado y Sigue con el POS, más los de más de 7 días sin avance.
  - **Detalle por comercio:** paso, días, intentos, número de caso, historial y botones Validar / Observar.

## Lo que no cambia

- el medidor de visitas, el bono y la visita (Regla n.º 1);
- el Excel de la base para BBVA, cuyas columnas de recupero siguen saliendo de la visita;
- la presentación para Mastercard.

## Pruebas

- **Servidor (PGlite):**
  - cada transición válida y que se rechacen las inválidas, por ejemplo `entregado` desde `llamar`;
  - «No contestaron» deja el caso en `llamar` y suma un intento;
  - solo el ejecutivo de la visita, o un admin, avanza el caso, y solo el escritorio valida;
  - «Observar» exige nota;
  - el paso se deduce de la visita cuando no hay caso;
  - queda la línea en la bitácora;
  - la visita no cambia;
  - sin sesión se rechaza.
- **Celular:** la tarjeta de Inicio, la barra de pasos, los botones de cada paso, «Hay un problema» y el filtro, en claro y en oscuro.
- **Escritorio:** el cuadro por ejecutivo y Validar / Observar.
- **Antes de pedir el OK:** el revisor. La migración se aplica el mismo día que se publica el celular.

## Decisiones de Jose tras la revisión (09/10)

1. **Casos abiertos al cerrar el periodo:** siguen en el periodo siguiente hasta que se validen. Esto vale para `llamar`, `tramite`, `entregado`, `trabado` y `sigue` sin validar.
2. **«Cambió de opinión: seguirá usando el POS»:**
   - va al final de la lista;
   - pide una nota obligatoria de al menos 10 caracteres;
   - queda como `sigue` **por validar** en el escritorio. Si Jose lo valida, se cierra. Si lo observa, vuelve a `llamar`.
3. **Si la visita cambia, el caso se cierra solo.** Pasa si la visita del desiste se anula o se corrige, o si hay una reunión posterior en que ya no desiste. El caso abierto se lee `cambio` («Cerrado por cambio de visita»): ya no aparece en el celular, ya no se puede avanzar y se ve en el escritorio.
4. **Texto de «Trabado»:** «Avísale a Jose y vuelve a llamar a Soporte cuando el comercio acepte.»
5. **Quién avanza un caso:** el ejecutivo de la visita o el analista del escritorio. El Manager solo lee.
6. **Retiro temporal y recupero:** el ejecutivo sigue viendo el recupero aunque el comercio tenga un retiro temporal. El retiro saca al comercio de las rutas de visita, pero el equipo igual hay que devolverlo.
