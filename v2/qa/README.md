# Pruebas mínimas del CRM v2

Usan **solo datos inventados** (Customer ID `000000xx`, correos `@ejemplo.com`) y un cliente de Supabase simulado. Nunca tocan la base real.

```
python3 v2/build.py                 # arma v2/dist/
cd v2/qa
npm install                         # la primera vez
npx playwright install chromium     # la primera vez
npm test                            # celular + escritorio
```

- **`celular.mjs`**:
  - revisa las 5 opciones de «¿Cómo fue la visita?», comparando lo que se enviaría a `v2_registrar_visita`;
  - revisa el bloqueo de la segunda visita del día;
  - corre en tema claro y oscuro.
- **`escritorio.mjs`**:
  - revisa «Cómo fue la visita» en la lista;
  - revisa la señal «Revisar marcación»;
  - revisa la base para BBVA con sus 4 tablas dinámicas.
- **Errores de consola:** cualquiera de los dos scripts falla si aparece uno.
