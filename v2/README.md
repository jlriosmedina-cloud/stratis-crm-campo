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
