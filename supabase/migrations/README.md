# Migraciones de Supabase

Una migración por cambio, con fecha y nombre descriptivo (por ejemplo `20260928120000_lista_del_dia.sql`).
La primera será la foto del esquema actual (`supabase db dump --schema public`), pendiente de la primera sesión en Claude Code.
Se aplican solo con el OK de Jose.

## Aplicadas

| Archivo | Aplicada | Versión en Supabase |
|---|---|---|
| `20260928000000_esquema_inicial.sql` | Foto de referencia, no se aplica | — |
| `20260928100000_permisos_y_reglas_de_visita.sql` | 27/09/2026, con el OK de Jose | `20260927204630` |
| `20260928110000_calidad_avisa_no_bloquea.sql` | 27/09/2026, con el OK de Jose | `20260927210956` |

Las pruebas `v2/qa/servidor.mjs` aplican, sobre la foto, los archivos posteriores a ella en orden de nombre.
