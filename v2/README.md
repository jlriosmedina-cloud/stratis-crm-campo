# CRM v2 · fuente

Reconstruido el 28/09/2026 a partir de lo publicado: celular `fa3f2d` y escritorio `2558f3`. El espacio de trabajo en la nube donde se desarrolló se reinició y se perdió la fuente original. `build.py` vuelve a armar las dos apps idénticas a lo publicado, salvo el número de versión.

```
v2/
  build.py              arma las apps (ver ayuda dentro del archivo)
  celular/              shell.html · estilos.css · app.js
  escritorio/           shell.html · estilos.css (2 bloques) · app.js
  dist/                 salida del build (no se sube)
supabase/migrations/    migraciones versionadas (pendiente: foto inicial, ver abajo)
```

## Pendientes de la primera sesión en Claude Code

1. **Foto del esquema de Supabase.** Correr `supabase db dump --schema public -f supabase/migrations/20260928000000_esquema_inicial.sql`. Jose ingresa la contraseña de la base; no se guarda en el repo. Revisar que el dump no traiga datos, solo esquema.
2. **Pruebas mínimas con Playwright.** Rehacer la carpeta `v2/qa/` con el cliente de Supabase simulado y **datos inventados** (nunca reales). Casos:
   - las 5 opciones de «¿Cómo fue la visita?»;
   - el bloqueo de la segunda visita del día y «Corregir la visita de hoy»;
   - la base para BBVA con sus tablas dinámicas.
3. **Scripts de ubicación y rutas** (Photon/OpenStreetMap, k-means con capacidad) para los ~2250 leads de Lima que faltan. Están descritos en los docs del proyecto `crm-v2-direcciones-y-rutas-geo.md` y `crm-v2-verificacion-maps-900-leads.md`. Los archivos con datos de comercios se leen desde el OneDrive y no se suben.
