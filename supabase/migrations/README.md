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
| `20260928120000_visitas_retenidas.sql` | 27/09/2026, con el OK de Jose | `20260927214009` |
| `20260928140000_sin_truncate_ni_anon_en_tablas.sql` | 28/09/2026, con el OK de Jose | `20260928195803` |

### Privilegios de tablas (desde el 28/09/2026)

- En `usuarios` y las tablas `v2_*`, `anon` no tiene nada. `authenticated` no tiene TRUNCATE, REFERENCES ni TRIGGER, y conserva SELECT/INSERT/UPDATE/DELETE, que siguen sujetos a RLS. Las secuencias `v2_*` no tienen UPDATE (`setval`) para `authenticated` ni nada para `anon`.
- Las tablas y secuencias nuevas que crea `postgres` en `public` nacen igual. Las que cree `supabase_admin` todavía nacen abiertas, porque sus privilegios por defecto no se pueden cambiar como `postgres`: revisar sus permisos si alguna vez aparece una.
- **Si algo se rompe**, la inversa devuelve solo lo que se quitó, **nunca con `grant all`**, porque eso reabre TRUNCATE: `grant truncate, references, trigger on <tabla> to authenticated`, `grant update on sequence <secuencia> to authenticated` y, solo en la tabla que lo necesite y con justificación, el grant puntual a `anon`.

Las pruebas `v2/qa/servidor.mjs` aplican, sobre la foto, los archivos posteriores a ella en orden de nombre.
