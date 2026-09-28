# CRM v2 · fuente

Reconstruido el 28/09/2026 a partir de lo publicado: celular `fa3f2d` y escritorio `2558f3`. El espacio de trabajo en la nube donde se desarrolló se reinició y se perdió la fuente original. `build.py` vuelve a armar las dos apps idénticas a lo publicado, salvo el número de versión.

```
v2/
  build.py              arma las apps (ver ayuda dentro del archivo)
  celular/              shell.html · estilos.css · app.js
  escritorio/           shell.html · estilos.css (2 bloques) · app.js
  dist/                 salida del build (no se sube)
supabase/migrations/    migraciones versionadas (la primera es la foto del esquema)
v2/qa/                  pruebas con datos inventados
```

## Estado (28/09/2026)

- [x] **Foto del esquema de Supabase:** `supabase/migrations/20260928000000_esquema_inicial.sql`, solo estructura y sin datos.
  - Contiene 38 tablas, 88 funciones, 61 políticas, 41 triggers y 4 vistas.
  - Se verificó que el SQL se lee completo: 711 sentencias.
- [x] **Pruebas mínimas con datos inventados:** `v2/qa/` (ver su README). Pasan en celular (claro y oscuro) y escritorio.
- [ ] **Scripts de ubicación y rutas** (Photon/OpenStreetMap, k-means con capacidad) para los ~2250 leads de Lima que faltan.
  - Están descritos en los docs del proyecto `crm-v2-direcciones-y-rutas-geo.md` y `crm-v2-verificacion-maps-900-leads.md`.
  - Los archivos con datos de comercios se leen desde el OneDrive y no se suben.
- [x] **Tanda 1 de la revisión del 27/09** (`supabase/migrations/20260928100000_permisos_y_reglas_de_visita.sql`): permisos sin `anon`, administradores solo leen visitas y bitácora, reglas de registrar y corregir, y reactivación solo con contacto. Pruebas en `v2/qa/servidor.mjs`.
- [x] **Regla n.º 1: la calidad avisa, no bloquea** (`supabase/migrations/20260928110000_calidad_avisa_no_bloquea.sql`): registrar una visita ya no la rechaza por calidad; lo que no calzó queda en `v2_visitas.datos_observados` y `fecha_lejana`, con su línea en la bitácora.
- [ ] **Señales del escritorio para `datos_observados` y `fecha_lejana`:** «Fecha de volver lejana», «Hora del celular corregida» y «Datos fuera de la lista» (tanda 2).
- [x] **Cola del celular:** una visita rechazada por el servidor queda «pendiente de revisar» con el mensaje y «Corregir y reenviar»; si se vuelve a rechazar, guarda lo corregido.
- [x] **Visitas retenidas** (`supabase/migrations/20260928120000_visitas_retenidas.sql`): el celular avisa a Jose; en su escritorio las ve y, si las descarta, el celular las quita al sincronizar. El respaldo del descarte queda en la fila (`resuelta_por`, `resuelta_en`, `nota`, `payload`), porque `v2_bitacora_visita` exige una visita registrada.
- [ ] **Antes de cargar leads sin ejecutivo, `v2_mi_base` no debe mostrar comercios libres a los ejecutivos.** Hoy los muestra (`a.correo is null`) y no hay ninguno cargado.
- [ ] **Quitar `anon` de las funciones del CRM v1**, cuando Jose confirme si alguien la sigue usando.
- [ ] **Tanda 2 (escritorio):** señales de los hallazgos 3, 5, 6, 7, 9 y 12.
- [ ] **Tanda 3 (celular):** hallazgos 5, 6, 7, 8 y 9 en un solo cambio, después de revisar los números de la semana. Incluye separar «habló con quien decide» de «solo con un trabajador».
- [ ] **Hallazgo 13:** metas 160/40 fijas en el celular; leerlas de `v2_avance`.
