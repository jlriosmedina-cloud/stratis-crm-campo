// Prueba de las reglas del servidor en un Postgres local (PGlite): carga la foto del esquema, aplica las
// migraciones posteriores y revisa permisos y reglas con usuarios y comercios inventados (nunca reales).
// Uso: node v2/qa/servidor.mjs            (con todas las migraciones)
//      node v2/qa/servidor.mjs --sin-nuevas   (solo la foto: sirve para ver qué pruebas fallarían sin la migración)
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { RAIZ } from './comun.mjs';

const MIG = path.join(RAIZ, '..', 'supabase', 'migrations');
const FOTO = '20260928000000_esquema_inicial.sql';
const SIN_NUEVAS = process.argv.includes('--sin-nuevas');

// ---------- base local ----------
const db = new PGlite();
// Lo mínimo de Supabase que usa el esquema: roles, auth.jwt() leyendo request.jwt.claims y private.es_supervision()
await db.exec(`create role anon; create role authenticated; create role service_role;
create schema auth; create schema private;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.role() returns text language sql stable as $$ select auth.jwt()->>'role' $$;
create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create function private.es_supervision() returns boolean language sql stable as $$ select false $$;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;`);
// (la última línea replica el privilegio por defecto que Supabase tiene en public)
// La foto está ordenada por tipo de objeto; se carga con las funciones antes que las tablas que las usan por defecto.
const L = fs.readFileSync(path.join(MIG, FOTO), 'utf8').split('\n');
const inicio = t => L.findIndex(l => l.startsWith('-- =====================') && l.includes(t));
const cortes = ['SECUENCIAS', 'TABLAS', 'RESTRICCIONES', 'LLAVES', 'ÍNDICES', 'FUNCIONES', 'VISTAS', 'TRIGGERS', 'POLÍTICAS', 'PERMISOS'].map(t => [t, inicio(t)]);
const seccion = t => { const i = cortes.findIndex(c => c[0] === t); return L.slice(cortes[i][1], i + 1 < cortes.length ? cortes[i + 1][1] : L.length).join('\n'); };
await db.exec('set check_function_bodies = off');
for (const t of ['SECUENCIAS', 'FUNCIONES', 'TABLAS', 'RESTRICCIONES', 'LLAVES', 'ÍNDICES', 'VISTAS', 'TRIGGERS', 'POLÍTICAS', 'PERMISOS']) await db.exec(seccion(t));
// Supabase da acceso a las tablas a anon y authenticated; lo que decide son las reglas RLS.
await db.exec(`grant usage on schema public, auth, private to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;`);
if (!SIN_NUEVAS) for (const f of fs.readdirSync(MIG).filter(f => f.endsWith('.sql') && f > FOTO).sort()) await db.exec(fs.readFileSync(path.join(MIG, f), 'utf8'));

// ---------- datos inventados ----------
const EJ = 'ejecutivo.prueba@ejemplo.com', OTRO = 'otro.prueba@ejemplo.com', MAN = 'manager.prueba@ejemplo.com', ANA = 'analista.prueba@ejemplo.com', INA = 'inactivo.prueba@ejemplo.com';
const hoy = (await db.query(`select (now() at time zone 'America/Lima')::date::text d`)).rows[0].d;
async function diaMas(n){ return (await db.query(`select ($1::date + $2::int)::text d`, [hoy, n])).rows[0].d; }
async function habil(desde, n){ return (await db.query(`select public.v2_limite_habil($1::date, $2)::text d`, [desde, n])).rows[0].d; }
await db.exec(`
insert into usuarios(correo, nombre, nombre_corto, rol, activo) values
  ('${EJ}', 'Ejecutivo Prueba', 'Prueba', 'Ejecutivo', true), ('${OTRO}', 'Otro Prueba', 'Otro', 'Ejecutivo', true),
  ('${MAN}', 'Manager Prueba', 'Manager', 'Manager', true), ('${ANA}', 'Analista Prueba', 'Analista', 'Analista', true),
  ('${INA}', 'Inactivo Prueba', 'Inactivo', 'Ejecutivo', false);
insert into v2_acceso_escritorio(correo) values ('${ANA}');
insert into v2_periodos(id, ini, fin) values ('2099-01', '${hoy}'::date - 40, '${hoy}'::date + 40);
insert into v2_comercios(customer_id, razon_social, geo_lat, geo_lng, geo_calidad)
  select lpad(i::text, 8, '0'), 'COMERCIO DE PRUEBA ' || i || ' SAC', -12.09 + i * 0.0001, -77.04, 'numero' from generate_series(1, 12) i;
insert into v2_asignaciones(periodo, customer_id, correo)
  select '2099-01', lpad(i::text, 8, '0'), case when i = 12 then null when i = 11 then '${OTRO}' else '${EJ}' end from generate_series(1, 12) i;
insert into v2_feedback_tipos(texto, grupo, orden) values
  ('Sin observaciones del comercio', 'Sin observaciones', 0), ('No se encontraba la persona que tomaba decisiones', 'Decisión y necesidad', 10);
insert into v2_feedback_acciones(texto, ramas, orden) values ('Reagendé con quien decide', array['Decisión y necesidad'], 10);
`);

// ---------- ejecutar como un usuario ----------
async function como(correo, sql, params){
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [correo ? JSON.stringify({ email: correo, role: 'authenticated' }) : '{}']);
  await db.exec(correo ? 'set role authenticated' : 'set role anon');
  try { return await db.query(sql, params); } finally { await db.exec('reset role'); }
}
const falla = async (p, re) => { let err = null; try { await p; } catch (e) { err = e; } assert.ok(err, 'debía fallar y no falló'); if (re) assert.match(err.message, re); };
const visita = async id => (await db.query('select * from v2_visitas where id = $1', [id])).rows[0];
// Visita con fecha pasada, cargada directo (como si hubiera llegado a tiempo)
async function visitaPasada(cid, dias, con, extra = {}){
  const f = await diaMas(-dias);
  const r = await db.query(`insert into v2_visitas(periodo, customer_id, correo, visitado_en, recibido_en, lat, lng, precision_m, con, motivo, que, comentario, direccion_ok, comercio_ubicado)
    values ('2099-01', $1, $2, ($3::date + time '11:00') at time zone 'America/Lima', ($3::date + time '11:05') at time zone 'America/Lima', -12.09, -77.04, 10, $4, $5, $6, 'Comentario de prueba', $7, $8) returning id`,
    [cid, extra.correo || EJ, f, con, con === 'Nadie' ? (extra.motivo || 'Cerrado') : null, con === 'Nadie' ? 'Sin éxito' : (extra.que || 'Sin éxito'), extra.dok ?? null, extra.ubi ?? null]);
  return r.rows[0].id;
}
// Registrar desde el celular (mismos argumentos que envía la app)
const registrar = (correo, a) => como(correo, `select public.v2_registrar_visita(p_customer_id => $1, p_visitado_en => now(), p_lat => -12.09, p_lng => -77.04, p_precision => 10,
    p_con => $2, p_motivo => $3, p_que => $4, p_decision => $5, p_equipo => null, p_fecha_reagenda => $6::date, p_comentario => 'Comentario de prueba', p_cliente_uid => $7,
    p_direccion_ok => $8, p_feedback => $9::text[]) id`,
  [a.cid, a.con, a.motivo ?? null, a.que ?? 'Sin éxito', a.decision ?? null, a.fecha ?? null, 'uid-' + Math.random(), a.dok ?? null, a.feedback ?? null]).then(r => r.rows[0].id);
const editar = (correo, id, a) => como(correo, `select public.v2_editar_resultado($1, $2, $3, $4, $5, null, $6::date, $7, $8::text[], null, null, $9::text[], null)`,
  [id, a.con, a.motivo ?? null, a.que ?? 'Sin éxito', a.decision ?? null, a.fecha ?? null, a.comentario ?? 'Comentario de prueba corregido', a.feedback ?? null, a.acciones ?? null]);

// ---------- pruebas ----------
const CASOS = [];
const caso = (nombre, fn) => CASOS.push([nombre, fn]);

caso('sin sesión (anon) no puede leer v2_mi_base', async () => {
  await falla(como(null, 'select * from public.v2_mi_base()'), /permission denied/);
});
caso('sin sesión (anon) no ejecuta las demás funciones que listó la revisión', async () => {
  for (const f of ['v2_avance(null)', 'v2_mis_revisiones(null)', `v2_anular_visita(gen_random_uuid(), 'x')`, `v2_resolver_anulacion(gen_random_uuid(), false)`,
                   `v2_restituir_visita(gen_random_uuid())`, `v2_cargar_transacciones('a', 'diario', '[]')`, `v2_editar_comentario(gen_random_uuid(), 'xxxxx')`, `v2_pedir_anulacion(gen_random_uuid(), 'xxxxxxxxxx')`])
    await falla(como(null, `select public.${f}`), /permission denied/);
});
caso('un usuario inactivo no ve comercios (ni los libres)', async () => {
  const r = await como(INA, 'select customer_id from public.v2_mi_base()');
  assert.equal(r.rows.length, 0);
});
caso('el ejecutivo ve su base y los libres, no la de otro', async () => {
  const ids = (await como(EJ, 'select customer_id from public.v2_mi_base()')).rows.map(x => x.customer_id);
  assert.ok(ids.includes('00000012'), 'falta el libre'); assert.ok(!ids.includes('00000011'), 've la base de otro ejecutivo'); assert.equal(ids.length, 11);
});
caso('el Manager ve todo, pero no puede editar ni borrar visitas ni la bitácora directamente', async () => {
  const id = await visitaPasada('00000010', 1, 'Tercero');
  await db.query(`insert into v2_bitacora_visita(visita_id, accion, por, despues) values ($1, 'comentario', $2, 'línea de prueba')`, [id, EJ]);
  assert.equal((await como(MAN, 'select id from v2_visitas where id = $1', [id])).rows.length, 1, 'el Manager no ve la visita');
  assert.equal((await como(MAN, 'select * from public.v2_actividad($1::date, $2::date)', [await diaMas(-40), hoy])).rows.some(v => v.id === id), true, 'v2_actividad no le muestra la visita');
  const up = await como(MAN, `update v2_visitas set comentario = 'cambiado por fuera' where id = $1`, [id]);
  assert.equal(up.affectedRows, 0, 'pudo editar la visita directamente');
  const del = await como(MAN, 'delete from v2_visitas where id = $1', [id]);
  assert.equal(del.affectedRows, 0, 'pudo borrar la visita directamente');
  const delb = await como(MAN, 'delete from v2_bitacora_visita where visita_id = $1', [id]);
  assert.equal(delb.affectedRows, 0, 'pudo borrar la bitácora');
  assert.equal((await como(MAN, 'select * from v2_bitacora_visita where visita_id = $1', [id])).rows.length, 1, 'el Manager no ve la bitácora');
  assert.equal((await como(ANA, 'select * from v2_bitacora_visita where visita_id = $1', [id])).rows.length, 1, 'el Analista no ve la bitácora');
  assert.equal((await como(OTRO, 'select * from v2_bitacora_visita where visita_id = $1', [id])).rows.length, 0, 'otro ejecutivo ve una bitácora ajena');
  assert.equal((await como(EJ, 'select * from v2_bitacora_visita where visita_id = $1', [id])).rows.length, 1, 'el ejecutivo no ve la bitácora de su visita');
  assert.equal((await visita(id)).comentario, 'Comentario de prueba');
});
caso('las funciones con bitácora siguen funcionando para el analista', async () => {
  const id = await visitaPasada('00000010', 2, 'Tercero');
  await como(ANA, `select public.v2_validar_visita($1, 'observada', 'Revisar el comentario')`, [id]);
  assert.equal((await visita(id)).validacion, 'observada');
});
caso('corregir una visita observada la deja por validar (no validada sola)', async () => {
  const hoyId = await registrar(EJ, { cid: '00000001', con: 'Tercero', que: 'Sin éxito', feedback: ['No se encontraba la persona que tomaba decisiones'] });
  await como(ANA, `select public.v2_validar_visita($1, 'observada', 'No calza con el comentario')`, [hoyId]);
  await como(EJ, `select public.v2_editar_comentario($1, 'Comentario corregido con más detalle')`, [hoyId]);
  const v = await visita(hoyId);
  assert.equal(v.validacion, 'pendiente');
  const b = (await db.query(`select despues from v2_bitacora_visita where visita_id = $1 and accion = 'revision'`, [hoyId])).rows;
  assert.ok(b.some(x => /pendiente/.test(x.despues)), 'la bitácora no dice pendiente');
});
caso('registrar: «No estaba» ya no se acepta', async () => {
  await falla(registrar(EJ, { cid: '00000002', con: 'Nadie', motivo: 'No estaba' }), /Elige por qué no hubo contacto/);
  const id = await registrar(EJ, { cid: '00000002', con: 'Nadie', motivo: 'Cerrado' });
  assert.equal((await visita(id)).motivo, 'Cerrado');
});
caso('registrar: la fecha de volver va hasta 10 días hábiles', async () => {
  const tope = await habil(hoy, 10), pasado = (await db.query(`select ($1::date + 1)::text d`, [tope])).rows[0].d;
  await falla(registrar(EJ, { cid: '00000003', con: 'Tercero', que: 'Reagendada', fecha: pasado }), /hasta el .*anota la real en el comentario/);
  const id = await registrar(EJ, { cid: '00000003', con: 'Tercero', que: 'Reagendada', fecha: tope });
  assert.equal((await visita(id)).fecha_reagenda.toISOString().slice(0, 10), tope);
});
caso('corregir: la fecha de volver no puede ser anterior a la visita ni pasar el tope', async () => {
  const id = await registrar(EJ, { cid: '00000004', con: 'Tercero', que: 'Sin éxito', feedback: ['No se encontraba la persona que tomaba decisiones'] });
  const fb = ['No se encontraba la persona que tomaba decisiones'];
  await falla(editar(EJ, id, { con: 'Tercero', que: 'Reagendada', fecha: await diaMas(-1), feedback: fb }), /anterior a la visita/);
  const tope = await habil(hoy, 10), pasado = (await db.query(`select ($1::date + 1)::text d`, [tope])).rows[0].d;
  await falla(editar(EJ, id, { con: 'Tercero', que: 'Reagendada', fecha: pasado, feedback: fb }), /hasta el/);
  await editar(EJ, id, { con: 'Tercero', que: 'Reagendada', fecha: await diaMas(1), feedback: fb });
  const v = await visita(id);
  assert.equal(v.que, 'Reagendada'); assert.ok(v.fb_acciones.includes('Reagendé con quien decide'));
});
caso('corregir desde «no está en esta dirección» deja la dirección como correcta', async () => {
  const id = await registrar(EJ, { cid: '00000005', con: 'Nadie', motivo: 'Dirección errada' });
  let v = await visita(id); assert.equal(v.direccion_ok, false);
  await editar(EJ, id, { con: 'Nadie', motivo: 'Cerrado' });
  v = await visita(id); assert.equal(v.direccion_ok, true); assert.equal(v.comercio_ubicado, null);
  const b = (await db.query(`select antes, despues from v2_bitacora_visita where visita_id = $1 and accion = 'resultado'`, [id])).rows.at(-1);
  assert.match(b.antes, /Dirección de la base: errada/); assert.match(b.despues, /Dirección de la base: correcta/);
});
caso('corregir desde «no está en esta dirección» a una visita con contacto deja la dirección sin dato', async () => {
  const id = await registrar(EJ, { cid: '00000010', con: 'Nadie', motivo: 'Dirección errada' });
  await editar(EJ, id, { con: 'Tercero', que: 'Sin éxito', feedback: ['No se encontraba la persona que tomaba decisiones'] });
  const v = await visita(id); assert.equal(v.direccion_ok, null); assert.equal(v.comercio_ubicado, null);
});
caso('corregir hacia «no está en esta dirección» marca la dirección errada y no ubicada', async () => {
  const id = await registrar(EJ, { cid: '00000006', con: 'Tercero', que: 'Sin éxito', dok: true, feedback: ['No se encontraba la persona que tomaba decisiones'] });
  await editar(EJ, id, { con: 'Nadie', motivo: 'Dirección errada' });
  const v = await visita(id); assert.equal(v.direccion_ok, false); assert.equal(v.comercio_ubicado, false);
});
caso('corregir: «No estaba» se conserva en una visita antigua, pero no se puede elegir de nuevo', async () => {
  const vieja = await visitaPasada('00000007', 0, 'Nadie', { motivo: 'No estaba' });
  await editar(EJ, vieja, { con: 'Nadie', motivo: 'No estaba', comentario: 'Comentario antiguo corregido' });
  assert.equal((await visita(vieja)).motivo, 'No estaba');
  const nueva = await registrar(EJ, { cid: '00000008', con: 'Nadie', motivo: 'Cerrado' });
  await falla(editar(EJ, nueva, { con: 'Nadie', motivo: 'No estaba' }), /Elige por qué no hubo contacto/);
});
caso('la reactivación solo cuenta desde una visita válida con contacto', async () => {
  const trx = async (cid, dias) => { for (const d of dias){ const f = await diaMas(-d); await db.query(`insert into v2_transacciones(fecha_corte, customer_id, mes, formato, trx) values ($1::date, $2, to_char($1::date, 'YYYY-MM'), 'diario', 3)`, [f, cid]); } };
  const dt = async cid => (await db.query(`select public.v2_dias_trx($1, '2099-01') n`, [cid])).rows[0].n;
  // 00000009: solo «No hubo contacto» y transacciones después → no es reactivación, pero sí cuenta como visita
  await visitaPasada('00000009', 10, 'Nadie'); await trx('00000009', [8, 6]);
  assert.equal(await dt('00000009'), 0, 'se atribuyó reactivación a una visita sin contacto');
  const mb = (await como(EJ, `select visitas_validas, estado from public.v2_mi_base() where customer_id = '00000009'`)).rows[0];
  assert.equal(mb.visitas_validas, 1, '«No hubo contacto» dejó de contar como visita');
  // 00000010: sin contacto el día -20, con contacto el -9; cuentan solo las transacciones después del -9
  await visitaPasada('00000010', 20, 'Nadie'); await visitaPasada('00000010', 9, 'Tercero'); await trx('00000010', [15, 7, 5]);
  assert.equal(await dt('00000010'), 2);
});

caso('las funciones nuevas nacen cerradas para anon y PUBLIC, y abiertas para authenticated', async () => {
  await db.exec(`create function public.v2_funcion_de_prueba() returns int language sql as $$ select 1 $$`);
  const r = (await db.query(`select has_function_privilege('anon', 'public.v2_funcion_de_prueba()', 'EXECUTE') anon,
    has_function_privilege('authenticated', 'public.v2_funcion_de_prueba()', 'EXECUTE') auth,
    exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0) publico
    from pg_proc p where p.proname = 'v2_funcion_de_prueba'`)).rows[0];
  await db.exec('drop function public.v2_funcion_de_prueba()');
  assert.equal(r.anon, false, 'anon puede ejecutarla'); assert.equal(r.publico, false, 'PUBLIC puede ejecutarla'); assert.equal(r.auth, true, 'authenticated no puede ejecutarla');
});

let fallas = 0;
for (const [n, fn] of CASOS){
  try { await fn(); console.log(`ok  ${n}`); }
  catch (e) { fallas++; console.log(`MAL ${n}: ${e.message}`); }
}
console.log(fallas ? `\n${fallas} prueba(s) del servidor fallaron` : '\nTodas las pruebas del servidor pasaron');
process.exit(fallas ? 1 : 0);
