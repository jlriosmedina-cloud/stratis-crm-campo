# Pruebas mínimas del CRM v2

Usan **solo datos inventados** (Customer ID `000000xx`, correos `@ejemplo.com`). Las del celular y el escritorio usan un cliente de Supabase simulado; las del servidor, un Postgres local (PGlite). Nunca tocan la base real.

```
python v2/build.py                 # arma v2/dist/
cd v2/qa
npm install                         # la primera vez
npx playwright install chromium     # la primera vez
npm test                            # celular + escritorio + servidor
```

- **`celular.mjs`**:
  - revisa las 5 opciones de «¿Cómo fue la visita?», comparando lo que se enviaría a `v2_registrar_visita`;
  - revisa el bloqueo de la segunda visita del día;
  - revisa que «Corregir la visita de hoy» llame a `v2_editar_resultado` y no a `v2_registrar_visita`;
  - corre en tema claro y oscuro.
- **`escritorio.mjs`**:
  - revisa «Cómo fue la visita» en la lista;
  - revisa la señal «Revisar marcación»;
  - revisa la base para BBVA con sus 4 tablas dinámicas.
- **`servidor.mjs`**:
  - carga la foto `supabase/migrations/20260928000000_esquema_inicial.sql` y aplica las migraciones posteriores en un Postgres local;
  - revisa permisos (sin sesión, usuario inactivo, ejecutivo, Manager) y las reglas de registrar y corregir visitas;
  - `node servidor.mjs --sin-nuevas` corre las mismas pruebas solo contra la foto, para ver qué detecta cada migración.
- **Errores de consola:** los scripts del celular y del escritorio fallan si aparece uno.
