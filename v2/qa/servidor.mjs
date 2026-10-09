// Prueba de las reglas del servidor en un Postgres local (PGlite): carga la foto del esquema, aplica las
// migraciones posteriores y revisa permisos y reglas con usuarios y comercios inventados (nunca reales).
// Uso: node v2/qa/servidor.mjs            (con todas las migraciones)
//      node v2/qa/servidor.mjs --sin-nuevas   (solo la foto: sirve para ver qué pruebas fallarían sin la migración)
//      node v2/qa/servidor.mjs --hasta=20260928100000_permisos_y_reglas_de_visita.sql   (solo hasta esa migración)
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
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;`);
// (las dos últimas líneas replican los privilegios por defecto que Supabase tiene en public)
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
// Parte del catálogo de feedback que ya existe en la base antes de las migraciones (la del 29/09 ubica ahí las opciones nuevas)
await db.exec(`insert into v2_feedback_tipos(texto, grupo, orden, bbva) values ('No necesitaba los POS', 'Decisión y necesidad', 100, true),
  ('POS no enciende', 'Equipo y contómetros', 110, true), ('Le parece complicado usar el POS', 'Uso del POS', 120, false);`);
const HASTA = (process.argv.find(a => a.startsWith('--hasta=')) || '').slice(8);
if (!SIN_NUEVAS) for (const f of fs.readdirSync(MIG).filter(f => f.endsWith('.sql') && f > FOTO && (!HASTA || f <= HASTA)).sort()) await db.exec(fs.readFileSync(path.join(MIG, f), 'utf8'));

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
  select lpad(i::text, 8, '0'), 'COMERCIO DE PRUEBA ' || i || ' SAC', -12.09 + i * 0.0001, -77.04, 'numero' from generate_series(1, 20) i;
insert into v2_asignaciones(periodo, customer_id, correo)
  select '2099-01', lpad(i::text, 8, '0'), case when i = 12 then null when i = 11 then '${OTRO}' else '${EJ}' end from generate_series(1, 20) i;
insert into v2_feedback_tipos(texto, grupo, orden) values
  ('Sin observaciones del comercio', 'Sin observaciones', 0), ('No se encontraba la persona que tomaba decisiones', 'Decisión y necesidad', 10);
insert into v2_feedback_tipos(texto, grupo, orden) values ('Usa POS de otra marca', 'Competencia', 20), ('Los abonos le llegan con demora', 'Abonos', 30);
insert into v2_feedback_acciones(texto, ramas, orden) values ('Reagendé con quien decide', array['Decisión y necesidad'], 10),
  ('Ofrecí evaluar una mejora de tasa', array['Competencia'], 20), ('Expliqué los plazos de abono', array['Abonos'], 30);
insert into v2_motivo_si_tipos(texto, orden) values ('Sus clientes le piden pagar con tarjeta', 10);
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
const registrar = (correo, a) => como(correo, `select public.v2_registrar_visita(p_customer_id => $1, p_visitado_en => coalesce($10::timestamptz, now()), p_lat => -12.09, p_lng => -77.04, p_precision => 10,
    p_con => $2, p_motivo => $3, p_que => $4, p_decision => $5, p_equipo => null, p_fecha_reagenda => $6::date, p_comentario => 'Comentario de prueba', p_cliente_uid => $7,
    p_direccion_ok => $8, p_feedback => $9::text[], p_fb_acciones => $11::text[], p_fb_extra => $12::jsonb, p_motivos_si => $13::text[],
    p_feedback_nota => $14, p_comentario_voz => $15, p_comercio_ubicado => $16, p_direccion_nueva => $17) id`,
  [a.cid, a.con, a.motivo ?? null, a.que ?? 'Sin éxito', a.decision ?? null, a.fecha ?? null, 'uid-' + Math.random(), a.dok ?? null, a.feedback ?? null,
   a.visitado ?? null, a.acciones ?? null, a.extra ? JSON.stringify(a.extra) : null, a.msi ?? null, a.nota ?? null, a.voz ?? null, a.ubi ?? null, a.dnu ?? null]).then(r => r.rows[0].id);
const bitacora = async id => (await db.query(`select por, antes, despues from v2_bitacora_visita where visita_id = $1 order by en, antes`, [id])).rows;
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
  assert.ok(ids.includes('00000012'), 'falta el libre'); assert.ok(!ids.includes('00000011'), 've la base de otro ejecutivo'); assert.equal(ids.length, 19);
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
caso('registrar: «No estaba» no rechaza la visita: se guarda como «No atendió» con línea en la bitácora', async () => {
  const id = await registrar(EJ, { cid: '00000002', con: 'Nadie', motivo: 'No estaba' });
  const v = await visita(id); assert.equal(v.con, 'Nadie'); assert.equal(v.motivo, 'No atendió');
  const b = (await db.query(`select por, antes, despues from v2_bitacora_visita where visita_id = $1`, [id])).rows;
  assert.equal(b.length, 1, 'falta la línea en la bitácora'); assert.match(b[0].antes, /No estaba/); assert.match(b[0].despues, /No atendió/);
  const otra = await registrar(OTRO, { cid: '00000011', con: 'Nadie', motivo: 'Cerrado' });
  assert.equal((await visita(otra)).motivo, 'Cerrado');
  assert.equal((await db.query(`select count(*)::int n from v2_bitacora_visita where visita_id = $1`, [otra])).rows[0].n, 0, 'dejó bitácora en una visita normal');
});
caso('registrar: la fecha de volver lejana no rechaza la visita: se guarda y queda marcada', async () => {
  const tope = await habil(hoy, 10), pasado = (await db.query(`select ($1::date + 1)::text d`, [tope])).rows[0].d;
  const id = await registrar(EJ, { cid: '00000003', con: 'Tercero', que: 'Reagendada', fecha: pasado });
  let v = await visita(id); assert.equal(v.fecha_reagenda.toISOString().slice(0, 10), pasado); assert.equal(v.fecha_lejana, true);
  const id2 = await registrar(EJ, { cid: '00000012', con: 'Tercero', que: 'Reagendada', fecha: tope });
  v = await visita(id2); assert.equal(v.fecha_lejana, false, 'marcó como lejana una fecha dentro del tope');
  const act = (await como(ANA, 'select id, fecha_lejana from public.v2_actividad($1::date, $1::date)', [hoy])).rows;
  assert.equal(act.find(x => x.id === id)?.fecha_lejana, true, 'v2_actividad no devuelve fecha_lejana');
  await falla(registrar(EJ, { cid: '00000007', con: 'Tercero', que: 'Reagendada', fecha: await diaMas(-1) }), /anterior a la visita/);
});
caso('corregir: la fecha anterior a la visita se rechaza; la lejana se guarda marcada', async () => {
  const id = await registrar(EJ, { cid: '00000004', con: 'Tercero', que: 'Sin éxito', feedback: ['No se encontraba la persona que tomaba decisiones'] });
  const fb = ['No se encontraba la persona que tomaba decisiones'];
  await falla(editar(EJ, id, { con: 'Tercero', que: 'Reagendada', fecha: await diaMas(-1), feedback: fb }), /anterior a la visita/);
  const tope = await habil(hoy, 10), pasado = (await db.query(`select ($1::date + 1)::text d`, [tope])).rows[0].d;
  await editar(EJ, id, { con: 'Tercero', que: 'Reagendada', fecha: pasado, feedback: fb });
  let v = await visita(id); assert.equal(v.que, 'Reagendada'); assert.equal(v.fecha_lejana, true); assert.ok(v.fb_acciones.includes('Reagendé con quien decide'));
  await editar(EJ, id, { con: 'Tercero', que: 'Reagendada', fecha: await diaMas(1), feedback: fb });
  v = await visita(id); assert.equal(v.fecha_lejana, false, 'la marca no se quitó al corregir la fecha');
});
caso('sin sesión (anon) no puede leer v2_actividad', async () => {
  await falla(como(null, 'select * from public.v2_actividad()'), /permission denied/);
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
  await falla(editar(EJ, nueva, { con: 'Nadie', motivo: 'No estaba' }), /Elige por qué no se pudo hacer la visita/);
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

caso('A: feedback fuera de la lista no rechaza: se guarda lo válido y se anota lo demás', async () => {
  const id = await registrar(EJ, { cid: '00000013', con: 'Dueño', que: 'Reunión concretada', decision: 'Aún no decide',
    feedback: ['Usa POS de otra marca', 'Opción que ya no existe'], acciones: ['Ofrecí evaluar una mejora de tasa'] });
  const v = await visita(id);
  assert.deepEqual(v.feedback, ['Usa POS de otra marca']); assert.deepEqual(v.fb_acciones, ['Ofrecí evaluar una mejora de tasa']);
  assert.deepEqual(v.datos_observados, { feedback: ['Opción que ya no existe'] });
  const b = await bitacora(id); assert.equal(b.length, 1); assert.match(b[0].antes, /Opción que ya no existe/); assert.equal(b[0].por, 'automática');
});
caso('A: «Qué ofreciste» fuera de la lista o de otra rama no rechaza: se anota', async () => {
  const id = await registrar(EJ, { cid: '00000014', con: 'Dueño', que: 'Reunión concretada', decision: 'Aún no decide',
    feedback: ['Usa POS de otra marca'], acciones: ['Ofrecí evaluar una mejora de tasa', 'Expliqué los plazos de abono', 'Acción inventada'] });
  const v = await visita(id);
  assert.deepEqual(v.fb_acciones, ['Ofrecí evaluar una mejora de tasa']);
  assert.deepEqual(v.datos_observados, { fb_acciones: ['Acción inventada', 'Expliqué los plazos de abono'] });
  assert.equal((await bitacora(id)).length, 1);
});
caso('A: «Qué lo convenció» fuera de la lista no rechaza: se anota', async () => {
  const id = await registrar(EJ, { cid: '00000015', con: 'Dueño', que: 'Reunión concretada', decision: 'Realizará consumos',
    feedback: ['Sin observaciones del comercio'], msi: ['Sus clientes le piden pagar con tarjeta', 'Motivo inventado'] });
  const v = await visita(id);
  assert.deepEqual(v.motivos_si, ['Sus clientes le piden pagar con tarjeta']); assert.deepEqual(v.datos_observados, { motivos_si: ['Motivo inventado'] });
});
caso('A: «Sin observaciones» combinado con otra opción: se queda la otra y se anota', async () => {
  const id = await registrar(EJ, { cid: '00000016', con: 'Dueño', que: 'Reunión concretada', decision: 'Aún no decide',
    feedback: ['Sin observaciones del comercio', 'Usa POS de otra marca'], acciones: ['Ofrecí evaluar una mejora de tasa'] });
  const v = await visita(id);
  assert.deepEqual(v.feedback, ['Usa POS de otra marca']); assert.deepEqual(v.datos_observados, { sin_observaciones_combinado: true });
  assert.equal((await bitacora(id)).length, 1);
});
caso('B: datos del detalle fuera de rango no rechazan: se guarda lo válido y se anota lo demás', async () => {
  const id = await registrar(EJ, { cid: '00000017', con: 'Dueño', que: 'Reunión concretada', decision: 'Aún no decide',
    feedback: ['Usa POS de otra marca', 'Los abonos le llegan con demora'], acciones: ['Ofrecí evaluar una mejora de tasa', 'Expliqué los plazos de abono'],
    extra: { competidores: ['Niubiz', 'Otro'], competidor_otro: 'X'.repeat(70), tasa_competidor: '25', dias_demora_abono: 'tres', banco_abono: 'BBVA' } });
  const v = await visita(id);
  assert.deepEqual(v.fb_extra, { competidores: ['Niubiz', 'Otro'], banco_abono: 'BBVA' });
  assert.deepEqual(v.datos_observados, { fb_extra: { competidor_otro: 'X'.repeat(70), tasa_competidor: '25', dias_demora_abono: 'tres' } });
  assert.equal((await bitacora(id)).length, 1);
});
caso('C: textos largos no rechazan: se recortan y el texto completo queda en la bitácora', async () => {
  const nota = 'N'.repeat(350), voz = 'V'.repeat(4100), dnu = 'D'.repeat(250);
  const id = await registrar(EJ, { cid: '00000018', con: 'Dueño', que: 'Reunión concretada', decision: 'Aún no decide', feedback: ['Sin observaciones del comercio'],
    nota, voz, dok: false, ubi: true, dnu });
  const v = await visita(id);
  assert.equal(v.feedback_nota.length, 300); assert.equal(v.comentario_voz.length, 4000); assert.equal(v.direccion_nueva.length, 200);
  assert.equal(v.datos_observados, null);
  const b = await bitacora(id); assert.equal(b.length, 3);
  assert.ok(b.some(x => x.antes.includes(nota) && /350 caracteres/.test(x.antes)), 'falta el feedback adicional completo');
  assert.ok(b.some(x => x.antes.includes(voz)), 'falta el dictado completo'); assert.ok(b.some(x => x.antes.includes(dnu)), 'falta la dirección completa');
});
caso('F: hora del celular adelantada no rechaza: se guarda con la hora del servidor y se anota', async () => {
  const futura = (await db.query(`select (now() + interval '2 hours')::text t`)).rows[0].t;
  const id = await registrar(EJ, { cid: '00000019', con: 'Nadie', motivo: 'Cerrado', visitado: futura });
  const v = await visita(id), ahora = Date.now();
  assert.ok(Math.abs(v.visitado_en.getTime() - ahora) < 60e3, 'no usó la hora del servidor');
  assert.equal(new Date(v.datos_observados.hora_celular).getTime(), new Date(futura).getTime());
  const b = await bitacora(id); assert.equal(b.length, 1); assert.match(b[0].antes, /Hora del celular/); assert.match(b[0].despues, /Hora del servidor/);
  const act = (await como(ANA, 'select id, datos_observados from public.v2_actividad($1::date, $1::date)', [hoy])).rows.find(x => x.id === id);
  assert.ok(act && act.datos_observados && act.datos_observados.hora_celular, 'v2_actividad no devuelve datos_observados');
});
caso('una visita sin nada observado no deja datos_observados ni bitácora', async () => {
  const id = await registrar(EJ, { cid: '00000020', con: 'Dueño', que: 'Reunión concretada', decision: 'Aún no decide',
    feedback: ['Usa POS de otra marca'], acciones: ['Ofrecí evaluar una mejora de tasa'], extra: { competidores: ['Izipay'], tasa_competidor: '2,8' } });
  const v = await visita(id);
  assert.equal(v.datos_observados, null); assert.deepEqual(v.fb_extra, { competidores: ['Izipay'], tasa_competidor: 2.8 });
  assert.equal((await bitacora(id)).length, 0);
});
caso('retenidas: el ejecutivo avisa, Jose la ve y la descarta, y el celular se entera', async () => {
  const uid = 'uid-retenida-1', payload = { p_customer_id: '00000005', p_visitado_en: new Date().toISOString(), p_con: 'Nadie', p_motivo: 'Cerrado', p_cliente_uid: uid };
  const visitasAntes = (await db.query('select count(*)::int n from v2_visitas')).rows[0].n;
  await falla(como(null, `select public.v2_reportar_retenida($1, $2::jsonb, 'x')`, [uid, JSON.stringify(payload)]), /permission denied/);
  assert.equal((await como(EJ, `select public.v2_reportar_retenida($1, $2::jsonb, 'El periodo cerró el 30/09')  e`, [uid, JSON.stringify(payload)])).rows[0].e, 'pendiente');
  assert.equal((await db.query('select count(*)::int n from v2_visitas')).rows[0].n, visitasAntes, 'avisar una retenida cambió las visitas');
  // otro ejecutivo no puede tocarla ni verla; el ejecutivo no puede descartarla ni escribir directo en la tabla
  await falla(como(OTRO, `select public.v2_reportar_retenida($1, $2::jsonb, 'x')`, [uid, JSON.stringify(payload)]), /otro ejecutivo/);
  assert.equal((await como(OTRO, 'select * from v2_visitas_retenidas')).rows.length, 0);
  await falla(como(EJ, `select public.v2_descartar_retenida($1)`, [uid]), /Solo el analista/);
  await falla(como(EJ, `insert into v2_visitas_retenidas(cliente_uid, correo, payload, mensaje) values ('uid-directo', $1, '{}', 'x')`, [EJ]), /row-level security/);
  // el Manager sin acceso al escritorio no la ve; Jose (Analista con acceso) sí
  assert.equal((await como(MAN, 'select * from public.v2_retenidas()')).rows.length, 0);
  let r = (await como(ANA, 'select * from public.v2_retenidas()')).rows;
  assert.equal(r.length, 1); assert.equal(r[0].mensaje, 'El periodo cerró el 30/09'); assert.equal(r[0].comercio, 'COMERCIO DE PRUEBA 5 SAC');
  // un nuevo intento actualiza lo último que corrigió el ejecutivo
  await como(EJ, `select public.v2_reportar_retenida($1, $2::jsonb, 'Segundo intento')`, [uid, JSON.stringify({ ...payload, p_motivo: 'No atendió' })]);
  r = (await como(ANA, 'select * from public.v2_retenidas()')).rows;
  assert.equal(r[0].intentos, 2); assert.equal(r[0].payload.p_motivo, 'No atendió'); assert.equal(r[0].mensaje, 'Segundo intento');
  // Jose la descarta
  await como(ANA, `select public.v2_descartar_retenida($1, 'Periodo cerrado, no se recupera')`, [uid]);
  assert.equal((await como(ANA, 'select * from public.v2_retenidas()')).rows.length, 0);
  const m = (await como(EJ, 'select * from public.v2_mis_retenidas()')).rows.find(x => x.cliente_uid === uid);
  assert.equal(m.estado, 'descartada'); assert.equal(m.nota, 'Periodo cerrado, no se recupera');
  const fila = (await db.query('select resuelta_por from v2_visitas_retenidas where cliente_uid = $1', [uid])).rows[0];
  assert.equal(fila.resuelta_por, ANA);
  // una descartada no se reabre con otro aviso
  await como(EJ, `select public.v2_reportar_retenida($1, $2::jsonb, 'Tercer intento')`, [uid, JSON.stringify(payload)]);
  assert.equal((await como(EJ, 'select * from public.v2_mis_retenidas()')).rows.find(x => x.cliente_uid === uid).estado, 'descartada');
  // si igual entró al servidor (el ejecutivo la reenvió justo antes), manda «registrada»
  await visitaPasada('00000005', 4, 'Nadie').then(id => db.query('update v2_visitas set cliente_uid = $1 where id = $2', [uid, id]));
  assert.equal((await como(EJ, 'select * from public.v2_mis_retenidas()')).rows.find(x => x.cliente_uid === uid).estado, 'registrada');
  // un aviso demasiado grande se rechaza (la visita sigue en el celular)
  await falla(como(EJ, `select public.v2_reportar_retenida('uid-grande', $1::jsonb, 'x')`, [JSON.stringify({ p_comentario: 'x'.repeat(70000) })]), /demasiado grandes/);
});
caso('retenidas: si el ejecutivo la corrige y entra al servidor, se resuelve sola', async () => {
  const uid = 'uid-retenida-2';
  await como(EJ, `select public.v2_reportar_retenida($1, $2::jsonb, 'Mensaje de prueba')`, [uid, JSON.stringify({ p_customer_id: '00000008', p_cliente_uid: uid })]);
  assert.equal((await como(ANA, 'select * from public.v2_retenidas()')).rows.filter(x => x.cliente_uid === uid).length, 1);
  await visitaPasada('00000008', 3, 'Nadie').then(id => db.query('update v2_visitas set cliente_uid = $1 where id = $2', [uid, id]));
  assert.equal((await como(ANA, 'select * from public.v2_retenidas()')).rows.filter(x => x.cliente_uid === uid).length, 0, 'Jose sigue viendo una visita que ya entró');
  assert.equal((await como(EJ, 'select * from public.v2_mis_retenidas()')).rows.find(x => x.cliente_uid === uid).estado, 'registrada');
  await falla(como(ANA, `select public.v2_descartar_retenida($1)`, [uid]), /ya entró al servidor/);
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
// ---------- tipificaciones del 29/09 ----------
// Comercios nuevos para no chocar con la regla de una visita por comercio y día
async function nuevoComercio(n){
  const cid = String(n).padStart(8, '0');
  await db.query(`insert into v2_comercios(customer_id, razon_social, geo_lat, geo_lng, geo_calidad) values ($1, 'COMERCIO DE PRUEBA ' || $2 || ' SAC', -12.09, -77.04, 'numero')`, [cid, n]);
  await db.query(`insert into v2_asignaciones(periodo, customer_id, correo) values ('2099-01', $1, $2)`, [cid, EJ]);
  return cid;
}
caso('«No se pudo hacer la visita»: los motivos nuevos se guardan y cuentan como visita', async () => {
  const zona = await registrar(EJ, { cid: await nuevoComercio(21), con: 'Nadie', motivo: 'Zona insegura', dok: true });
  let v = await visita(zona); assert.equal(v.motivo, 'Zona insegura'); assert.equal(v.que, 'Sin éxito'); assert.equal(v.direccion_ok, null, 'con zona insegura no se sabe la dirección');
  const cerro = await registrar(EJ, { cid: await nuevoComercio(22), con: 'Nadie', motivo: 'Cerró definitivamente', dok: true });
  assert.equal((await visita(cerro)).direccion_ok, true);
  const otro = await registrar(EJ, { cid: await nuevoComercio(23), con: 'Nadie', motivo: 'Otro motivo', dok: true });
  assert.equal((await visita(otro)).direccion_ok, null);
  const mb = (await como(EJ, `select customer_id, visitas_validas from public.v2_mi_base() where customer_id in ('00000021','00000022','00000023') order by 1`)).rows;
  assert.deepEqual(mb.map(x => x.visitas_validas), [1, 1, 1], 'los motivos nuevos no cuentan como visita');
  // corregir entre motivos, y un motivo que no existe se rechaza
  await editar(EJ, otro, { con: 'Nadie', motivo: 'Cerró definitivamente' });
  assert.equal((await visita(otro)).motivo, 'Cerró definitivamente');
  // no pasa a Cancelado: la visita cuenta y el estado lo detalla (decisión de Jose, 29/09)
  const cer = (await como(EJ, `select estado, ultima_motivo, visitas_validas from public.v2_mi_base() where customer_id = '00000023'`)).rows[0];
  assert.deepEqual(cer, { estado: 'sin', ultima_motivo: 'Cerró definitivamente', visitas_validas: 1 });
  await editar(EJ, cerro, { con: 'Nadie', motivo: 'Zona insegura' });
  v = await visita(cerro); assert.equal(v.motivo, 'Zona insegura'); assert.equal(v.direccion_ok, null);
  await falla(editar(EJ, zona, { con: 'Nadie', motivo: 'Motivo inventado' }), /Elige por qué no se pudo hacer la visita/);
});
caso('con el dueño o el encargado se puede anotar la fecha para volver (opcional)', async () => {
  const fb = ['Usa POS de otra marca'], acc = ['Ofrecí evaluar una mejora de tasa'];
  const manana = await diaMas(1);
  const id = await registrar(EJ, { cid: await nuevoComercio(24), con: 'Dueño', que: 'Reunión concretada', decision: 'Aún no decide', fecha: manana, feedback: fb, acciones: acc });
  let v = await visita(id);
  assert.equal(v.fecha_reagenda.toISOString().slice(0, 10), manana); assert.equal(v.fecha_lejana, false);
  assert.deepEqual(v.feedback, fb, 'no debe agregar «No se encontraba la persona que tomaba decisiones»');
  assert.deepEqual(v.fb_acciones, acc, 'no debe agregar «Reagendé con quien decide»');
  let mb = (await como(EJ, `select estado, volver_el::text from public.v2_mi_base() where customer_id = '00000024'`)).rows[0];
  assert.equal(mb.estado, 'seg', 'el estado no cambia'); assert.equal(mb.volver_el, manana);
  // sin fecha sigue igual que antes
  const sin = await registrar(EJ, { cid: await nuevoComercio(25), con: 'Tercero', que: 'Reunión concretada', decision: 'Realizará consumos', feedback: ['Sin observaciones del comercio'] });
  assert.equal((await visita(sin)).fecha_reagenda, null);
  // lejana: se guarda marcada; anterior a la visita: se rechaza (error de captura)
  const tope = await habil(hoy, 10), pasado = (await db.query(`select ($1::date + 1)::text d`, [tope])).rows[0].d;
  const lej = await registrar(EJ, { cid: await nuevoComercio(26), con: 'Dueño', que: 'Reunión concretada', decision: 'Realizará consumos', fecha: pasado, feedback: fb });
  assert.equal((await visita(lej)).fecha_lejana, true);
  await falla(registrar(EJ, { cid: await nuevoComercio(27), con: 'Dueño', que: 'Reunión concretada', decision: 'Aún no decide', fecha: await diaMas(-1), feedback: fb }), /anterior a la visita/);
  // corregir: se puede quitar la fecha y volver a ponerla; con «Sin éxito» no se guarda
  await editar(EJ, id, { con: 'Dueño', que: 'Reunión concretada', decision: 'Aún no decide', feedback: fb, acciones: acc });
  assert.equal((await visita(id)).fecha_reagenda, null, 'no quitó la fecha');
  await editar(EJ, id, { con: 'Dueño', que: 'Reunión concretada', decision: 'Aún no decide', fecha: manana, feedback: fb, acciones: acc });
  assert.equal((await visita(id)).fecha_reagenda.toISOString().slice(0, 10), manana);
  await editar(EJ, id, { con: 'Tercero', que: 'Sin éxito', fecha: manana, feedback: ['No se encontraba la persona que tomaba decisiones'] });
  assert.equal((await visita(id)).fecha_reagenda, null, '«Sin éxito» no lleva fecha');
});
caso('las cuatro opciones nuevas de feedback se guardan sin marcarse como fuera de la lista', async () => {
  const nuevas = ['Desconfía de la visita (duda que representemos a BBVA)', 'No pidió el POS', 'Solicitó cambio de equipo', 'Le falta una función'];
  const t = (await db.query(`select texto, grupo, bbva from v2_feedback_tipos where texto = any($1) order by texto`, [nuevas])).rows;
  assert.equal(t.length, 4, 'faltan opciones en v2_feedback_tipos');
  assert.ok(t.every(x => x.bbva === false), 'las agregó Stratis, no BBVA');
  assert.deepEqual(Object.fromEntries(t.map(x => [x.texto, x.grupo])), { 'Desconfía de la visita (duda que representemos a BBVA)': 'Decisión y necesidad',
    'Le falta una función': 'Uso del POS', 'No pidió el POS': 'Decisión y necesidad', 'Solicitó cambio de equipo': 'Equipo y contómetros' });
  const id = await registrar(EJ, { cid: await nuevoComercio(28), con: 'Dueño', que: 'Reunión concretada', decision: 'Aún no decide', feedback: nuevas });
  const v = await visita(id);
  assert.deepEqual(v.feedback.slice().sort(), nuevas.slice().sort()); assert.equal(v.datos_observados, null);
});

// ---------- resultados de BBVA por corte (29/09) ----------
caso('resultados de BBVA: solo el analista carga, se completan los ceros y un corte se reemplaza completo', async () => {
  const corte = await diaMas(-1);
  const filas = [{ customer_id: '1', gestion_con_contacto: true, reactivado: 'Si', facturado: '1500.50' },
                 { customer_id: '00000002', gestion_con_contacto: false, reactivado: 'Si', facturado: null },
                 { customer_id: '00000003', gestion_con_contacto: true, reactivado: 'En proceso', facturado: null },
                 { customer_id: '99999999', gestion_con_contacto: true, reactivado: 'Si', facturado: null }];
  const cargar = (u, f, c = corte, total = null) => como(u, `select public.v2_cargar_resultados_bbva('prueba.xlsx', $1::date, $2::jsonb, $3::numeric) r`, [c, JSON.stringify(f), total]).then(x => x.rows[0].r);
  await falla(cargar(EJ, filas), /Solo el analista/);
  await falla(cargar(null, filas), /permission denied/);
  await falla(cargar(ANA, filas, await diaMas(1)), /no puede ser futura/);
  const r = await cargar(ANA, filas);
  assert.equal(r.cargadas, 3); assert.equal(r.rechazadas, 1); assert.equal(r.reactivados, 2); assert.equal(r.con_contacto, 1); assert.equal(r.reemplazo, false);
  assert.match(r.detalle[0].motivo, /no está en la base/);
  assert.equal((await db.query(`select customer_id from v2_resultados_bbva where corte = $1 and facturado = 1500.50`, [corte])).rows[0].customer_id, '00000001', 'no completó los ceros');
  // lo ve el analista, no el ejecutivo; anon nada
  assert.equal((await como(ANA, 'select * from v2_resultados_bbva')).rows.length, 3);
  assert.equal((await como(EJ, 'select * from v2_resultados_bbva')).rows.length, 0, 'el ejecutivo ve los resultados de BBVA');
  assert.equal((await como(EJ, 'select * from v2_cortes_bbva')).rows.length, 0);
  await falla(como(null, 'select * from v2_resultados_bbva'), /permission denied/);
  await falla(como(ANA, `insert into v2_cortes_bbva(corte) values ('2026-01-01')`), /permission denied/);
  // el mismo corte se reemplaza completo, con su total
  const r2 = await cargar(ANA, [filas[0]], corte, 2600000);
  assert.equal(r2.reemplazo, true); assert.equal(r2.cargadas, 1);
  assert.equal((await db.query('select count(*)::int n from v2_resultados_bbva where corte = $1', [corte])).rows[0].n, 1);
  assert.equal(Number((await db.query('select facturado_total from v2_cortes_bbva where corte = $1', [corte])).rows[0].facturado_total), 2600000);
  // si ninguna fila entra, no se toca el corte que ya estaba
  await falla(cargar(ANA, [filas[3]], corte), /Ninguna fila se pudo cargar/);
  await falla(cargar(ANA, [{ customer_id: '123456789', gestion_con_contacto: true, reactivado: 'Si' }], corte), /Ninguna fila/);
  assert.equal((await db.query('select count(*)::int n from v2_resultados_bbva where corte = $1', [corte])).rows[0].n, 1, 'una carga fallida borró el corte');
  const g = (await db.query(`select tipo, filas, fecha_corte::text from v2_cargas where tipo = 'resultados_bbva' order by id`)).rows;
  assert.equal(g.length, 2); assert.equal(g[1].fecha_corte, corte);
});

// ---------- totales de BBVA por corte (30/09): Jose los tipea desde el drive de BBVA ----------
caso('totales de BBVA: solo el analista guarda, valida los números y un corte se reemplaza', async () => {
  const corte = await diaMas(-1);
  const T = { cc_reac: 12, cc_fac: 1234567.89, cc_trx: 12345, sc_reac: 7, sc_fac: 234567.8, sc_trx: 2345, nv_reac: 30, nv_fac: 3456789.01, nv_trx: 34567 };
  const guardar = (u, t, c = corte) => como(u, `select public.v2_guardar_totales_bbva($1::date, $2::jsonb, 'prueba') r`, [c, JSON.stringify(t)]).then(x => x.rows[0].r);
  await falla(guardar(EJ, T), /Solo el analista/);
  await falla(guardar(null, T), /permission denied/);
  await falla(guardar(ANA, T, await diaMas(1)), /no puede ser futura/);
  await falla(guardar(ANA, Object.assign({}, T, { cc_reac: -1 })), /negativo/);
  await falla(guardar(ANA, Object.assign({}, T, { sc_trx: 10.5 })), /entero/);
  await falla(guardar(ANA, Object.assign({}, T, { nv_fac: '3456789.01' })), /no es un número: nv_fac/);
  const { nv_trx, ...sinUno } = T; await falla(guardar(ANA, sinUno), /Falta o no es un número: nv_trx/);
  const r = await guardar(ANA, T);
  assert.equal(r.reemplazo, false);
  // lo ve el analista, no el ejecutivo; anon nada; nadie escribe directo
  const fila = (await como(ANA, 'select * from v2_totales_bbva')).rows[0];
  assert.equal(fila.cc_reac, 12); assert.equal(Number(fila.cc_fac), 1234567.89); assert.equal(Number(fila.nv_trx), 34567);
  assert.equal((await como(EJ, 'select * from v2_totales_bbva')).rows.length, 0, 'el ejecutivo ve los totales de BBVA');
  await falla(como(null, 'select * from v2_totales_bbva'), /permission denied/);
  await falla(como(ANA, `update v2_totales_bbva set cc_reac = 1`), /permission denied/);
  // el mismo corte se reemplaza
  const r2 = await guardar(ANA, Object.assign({}, T, { cc_reac: 15 }));
  assert.equal(r2.reemplazo, true);
  assert.equal((await db.query('select count(*)::int n, max(cc_reac) m from v2_totales_bbva')).rows[0].m, 15);
  const g = (await db.query(`select filas, fecha_corte::text, notas from v2_cargas where tipo = 'totales_bbva' order by id`)).rows;
  assert.equal(g.length, 2); assert.equal(g[1].fecha_corte, corte); assert.match(g[1].notas, /reemplaza/);
  assert.match(g[1].notas, /"cc_reac": 12/, 'no guardó los valores anteriores'); assert.match(g[1].notas, /"nv_fac": 3456789.01/);
});

// ---------- reactivados de BBVA en la base del ejecutivo (30/09): informativo, solo con visita ----------
caso('mi base: el reactivado de BBVA se ve solo si el comercio tiene visita válida, y no cambia el estado', async () => {
  const conVisita = await nuevoComercio(41), sinVisita = await nuevoComercio(42);
  await registrar(EJ, { cid: conVisita, con: 'Dueño', que: 'Reunión concretada', decision: 'Aún no decide' });
  const corte = await diaMas(0);
  await db.query(`delete from v2_cortes_bbva`);
  await como(ANA, `select public.v2_cargar_resultados_bbva('prueba.xlsx', $1::date, $2::jsonb)`, [corte, JSON.stringify([
    { customer_id: conVisita, gestion_con_contacto: true, reactivado: 'Si' }, { customer_id: sinVisita, gestion_con_contacto: false, reactivado: 'Si' }])]);
  const mb = (await como(EJ, `select customer_id, bbva_reactivado::text r, estado from public.v2_mi_base() where customer_id in ($1, $2) order by 1`, [conVisita, sinVisita])).rows;
  assert.deepEqual(mb.map(x => [x.customer_id, x.r]), [[conVisita, corte], [sinVisita, null]], 'el reactivado de BBVA sin visita no debe verse');
  assert.equal(mb[0].estado, 'seg', 'el reactivado de BBVA no debe cambiar el estado (el bono sigue con las transacciones)');
  // otro ejecutivo no ve esos comercios
  assert.equal((await como(OTRO, `select 1 from public.v2_mi_base() where customer_id = $1`, [conVisita])).rows.length, 0);
  await falla(como(null, `select * from public.v2_mi_base()`), /permission denied/);
});

// Estos van al final: sin la migración, el TRUNCATE sí vacía las tablas.
const TABLAS_APP = `select c.oid::regclass::text t from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p') and (c.relname like 'v2\\_%' or c.relname = 'usuarios') order by 1`;
caso('permisos de tablas: anon no tiene nada y authenticated no tiene TRUNCATE, REFERENCES ni TRIGGER', async () => {
  const mal = (await db.query(`select t, string_agg(p, ',') filter (where has_table_privilege('anon', t, p)) anon,
      string_agg(p, ',') filter (where p in ('TRUNCATE', 'REFERENCES', 'TRIGGER') and has_table_privilege('authenticated', t, p)) auth,
      bool_or(p = 'SELECT' and has_table_privilege('authenticated', t, p)) lee
    from (${TABLAS_APP}) x cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p group by t`)).rows
    .filter(r => r.anon || r.auth || !r.lee);
  assert.deepEqual(mal.map(r => `${r.t}: anon=${r.anon} auth=${r.auth} lee=${r.lee}`), []);
  const seq = (await db.query(`select s.relname from pg_class s join pg_namespace n on n.oid = s.relnamespace where n.nspname = 'public' and s.relkind = 'S'
    and s.relname like 'v2\\_%' and (has_sequence_privilege('anon', s.oid, 'USAGE') or has_sequence_privilege('authenticated', s.oid, 'UPDATE'))`)).rows;
  assert.deepEqual(seq, [], 'hay secuencias que anon usa o que authenticated puede mover con setval');
});
caso('las lecturas de las apps siguen funcionando con sesión', async () => {
  assert.equal((await como(EJ, `select correo from usuarios where correo = $1`, [EJ])).rows.length, 1, 'el ejecutivo no lee su usuario');
  assert.equal((await como(EJ, `select id from v2_periodos where ini <= $1::date and fin >= $1::date`, [hoy])).rows.length, 1, 'el ejecutivo no lee el periodo');
  assert.ok((await como(EJ, 'select id from v2_visitas')).rows.length > 0, 'el ejecutivo no lee sus visitas (tiempo real)');
  for (const t of ['usuarios', 'v2_periodos', 'v2_bitacora_visita', 'v2_transacciones', 'v2_cargas', 'v2_geo_distritos', 'v2_feedback_inferido', 'v2_motivo_si_inferido', 'v2_visitas'])
    await como(ANA, `select * from ${t} limit 1`);
});
caso('sin sesión (anon) no lee ni vacía tablas', async () => {
  for (const t of ['usuarios', 'v2_visitas', 'v2_bitacora_visita', 'v2_feriados', 'v2_parametros', 'v2_visitas_retenidas']){
    await falla(como(null, `select * from ${t} limit 1`), /permission denied/);
    await falla(como(null, `truncate ${t} cascade`), /permission denied/);
  }
  await falla(como(null, `select setval('v2_bitacora_visita_id_seq', 1)`), /permission denied/);
});
caso('nadie con sesión puede vaciar las visitas, las asignaciones ni la bitácora (TRUNCATE salta RLS)', async () => {
  const cuenta = async () => (await db.query(`select (select count(*) from v2_visitas) + (select count(*) from v2_asignaciones) + (select count(*) from v2_bitacora_visita) n`)).rows[0].n;
  const antes = await cuenta();
  for (const u of [EJ, MAN, ANA]) for (const t of ['v2_visitas', 'v2_asignaciones', 'v2_bitacora_visita', 'v2_visitas_retenidas'])
    await falla(como(u, `truncate ${t} cascade`), /permission denied/);
  assert.equal(await cuenta(), antes, 'se borraron filas');
  // tampoco puede regresar el contador de la bitácora (las RPC fallarían por llave duplicada)
  await falla(como(MAN, `select setval('v2_bitacora_visita_id_seq', 1)`), /permission denied/);
  const id = await registrar(EJ, { cid: '00000009', con: 'Nadie', motivo: 'No estaba' });
  assert.equal((await bitacora(id)).length >= 1, true, 'registrar ya no deja su línea en la bitácora');
});
caso('seguimiento remoto: el ejecutivo lo registra en su visita sin contacto, deja bitácora y no toca la visita', async () => {
  const id = await visitaPasada('00000013', 6, 'Nadie', { motivo: 'Cerrado' });
  const antes = await visita(id);
  const sid = (await como(EJ, `select public.v2_registrar_seguimiento($1, 'WhatsApp', 'Respondió: usará el POS', '  Le escribí al dueño  ') s`, [id])).rows[0].s;
  await como(EJ, `select public.v2_registrar_seguimiento($1, 'Llamada', 'No respondió') s`, [id]);
  const l = (await como(EJ, `select * from public.v2_mis_seguimientos()`)).rows.filter(r => r.visita_id === id);
  assert.equal(l.length, 2, 'se pueden registrar varios intentos');
  assert.equal(l[0].nota, 'Le escribí al dueño');
  const despues = await visita(id);
  for (const k of ['con', 'que', 'motivo', 'decision', 'fuera_plazo', 'validacion', 'anulada_en']) assert.deepEqual(despues[k], antes[k], 'cambió la visita: ' + k);
  // despues es texto con el JSON
  const b = (await bitacora(id)).filter(x => x.despues === 'WhatsApp · Respondió: usará el POS · Le escribí al dueño');
  assert.equal(b.length, 1, 'falta la línea de la bitácora: '); assert.equal(b[0].por, EJ);
  // el otro ejecutivo no ve ni registra seguimientos de visitas ajenas
  assert.equal((await como(OTRO, `select * from public.v2_mis_seguimientos()`)).rows.filter(r => r.visita_id === id).length, 0);
  await falla(como(OTRO, `select public.v2_registrar_seguimiento($1, 'Llamada', 'No respondió')`, [id]), /Solo el ejecutivo/);
  // el analista lo ve desde el escritorio; el ejecutivo no lee la tabla directo ni escribe en ella
  assert.ok((await como(ANA, `select * from v2_seguimientos where visita_id = $1`, [id])).rows.length >= 2);
  assert.equal((await como(EJ, `select * from v2_seguimientos`)).rows.length, 0);
  await falla(como(EJ, `insert into v2_seguimientos(visita_id, customer_id, periodo, correo, por, canal, resultado) values ($1, '00000013', '2099-01', $2, $2, 'Llamada', 'No respondió')`, [id, EJ]), /permission denied/);
  await falla(como(null, `select public.v2_mis_seguimientos()`), /permission denied/);
});
caso('seguimiento remoto: solo visitas sin contacto, con canal y resultado de la lista', async () => {
  const conC = await visitaPasada('00000014', 6, 'Dueño', { que: 'Reunión concretada' });
  await falla(como(EJ, `select public.v2_registrar_seguimiento($1, 'Llamada', 'No respondió')`, [conC]), /sin contacto/);
  const sinC = await visitaPasada('00000015', 6, 'Nadie', { motivo: 'No atendió' });
  await falla(como(EJ, `select public.v2_registrar_seguimiento($1, 'Paloma mensajera', 'No respondió')`, [sinC]), /check/);
  await falla(como(EJ, `select public.v2_registrar_seguimiento($1, 'Llamada', 'Quién sabe')`, [sinC]), /check/);
  await falla(como(EJ, `select public.v2_registrar_seguimiento($1, 'Llamada', 'No respondió', repeat('x', 301))`, [sinC]), /300/);
  await falla(como(INA, `select public.v2_registrar_seguimiento($1, 'Llamada', 'No respondió')`, [sinC]), /no está activo/);
  const anul = await visitaPasada('00000016', 6, 'Nadie', { motivo: 'Cerrado' });
  await db.query(`update v2_visitas set anulada_en = now(), anulada_por = $2 where id = $1`, [anul, ANA]);
  await falla(como(EJ, `select public.v2_registrar_seguimiento($1, 'Llamada', 'No respondió')`, [anul]), /anulada/);
  const vieja = await visitaPasada('00000017', 6, 'Nadie', { motivo: 'Cerrado' });
  await db.query(`insert into v2_periodos(id, ini, fin) values ('2098-12', '2098-12-01', '2098-12-31') on conflict do nothing`);
  await db.query(`update v2_visitas set periodo = '2098-12' where id = $1`, [vieja]);
  await falla(como(EJ, `select public.v2_registrar_seguimiento($1, 'Llamada', 'No respondió')`, [vieja]), /periodo cerrado/);
});
caso('retiro temporal: el ejecutivo deja de ver el comercio; el analista lo sigue viendo; al restituirlo vuelve', async () => {
  // comercios propios de este caso, sin visitas de los casos anteriores
  await db.exec(`insert into v2_comercios(customer_id, razon_social, geo_lat, geo_lng, geo_calidad) values ('00000071', 'COMERCIO DE PRUEBA 71 SAC', -12.09, -77.04, 'numero'), ('00000072', 'COMERCIO DE PRUEBA 72 SAC', -12.09, -77.04, 'numero');
    insert into v2_asignaciones(periodo, customer_id, correo) values ('2099-01', '00000071', '${EJ}'), ('2099-01', '00000072', '${EJ}');`);
  const ve = async (u, cid) => (await como(u, `select customer_id from public.v2_mi_base('2099-01') where customer_id = $1`, [cid])).rows.length;
  assert.equal(await ve(EJ, '00000071'), 1);
  await db.query(`insert into v2_retiros_temporales(periodo, customer_id, motivo, retirado_por) values ('2099-01', '00000071', 'Ya factura según BBVA y no tiene visita', $1)`, [ANA]);
  assert.equal(await ve(EJ, '00000071'), 0, 'el ejecutivo todavía lo ve');
  assert.equal(await ve(ANA, '00000071'), 1, 'el analista debe seguir viéndolo (universo de los reportes)');
  assert.equal(await ve(EJ, '00000072'), 1, 'se ocultó otro comercio');
  // las apps no escriben en la tabla y el ejecutivo no la lee
  await falla(como(EJ, `insert into v2_retiros_temporales(periodo, customer_id, motivo, retirado_por) values ('2099-01', '00000072', 'Prueba de escritura directa', $1)`, [EJ]), /permission denied/);
  assert.equal((await como(EJ, `select * from v2_retiros_temporales`)).rows.length, 0);
  assert.equal((await como(ANA, `select * from v2_retiros_temporales`)).rows.length >= 1, true);
  await falla(como(null, `select * from v2_retiros_temporales`), /permission denied/);
  // un solo retiro vigente por comercio
  await falla(db.query(`insert into v2_retiros_temporales(periodo, customer_id, motivo, retirado_por) values ('2099-01', '00000071', 'Retiro duplicado de prueba', $1)`, [ANA]), /duplicate|unique/);
  // si igual recibe una visita (por ejemplo, desde la cola de un celular con la base vieja), vuelve a verlo y le suma
  await db.query(`insert into v2_retiros_temporales(periodo, customer_id, motivo, retirado_por) values ('2099-01', '00000072', 'Ya factura según BBVA y no tiene visita', $1)`, [ANA]);
  assert.equal(await ve(EJ, '00000072'), 0);
  await visitaPasada('00000072', 6, 'Nadie', { motivo: 'Cerrado' });
  assert.equal(await ve(EJ, '00000072'), 1, 'un retirado con visita debe volver a verse');
  const n19 = (await como(EJ, `select visitas from public.v2_mi_base('2099-01') where customer_id = '00000072'`)).rows[0];
  assert.equal(Number(n19.visitas), 1, 'la visita no se cuenta en su base');
  await db.query(`update v2_retiros_temporales set restituido_en = now(), restituido_por = $1 where customer_id = '00000071'`, [ANA]);
  assert.equal(await ve(EJ, '00000071'), 1, 'al restituirlo debe volver');
});
// ---------- reactivados de BBVA que aún no cuentan para la comisión (09/10) ----------
caso('seguimiento: reactivado BBVA que aún no cuenta, aunque la visita tuvo contacto; los demás no', async () => {
  const [c73, c74, c75, c76] = [await nuevoComercio(73), await nuevoComercio(74), await nuevoComercio(75), await nuevoComercio(76)];
  const previa73 = await visitaPasada(c73, 8, 'Dueño', { que: 'Reunión concretada' });
  const ult73 = await visitaPasada(c73, 5, 'Tercero', { que: 'Reunión concretada' });
  const v74 = await visitaPasada(c74, 6, 'Dueño', { que: 'Reunión concretada' });
  for (const d of [4, 2]) { const f = await diaMas(-d); await db.query(`insert into v2_transacciones(fecha_corte, customer_id, mes, formato, trx) values ($1::date, $2, to_char($1::date, 'YYYY-MM'), 'diario', 3)`, [f, c74]); }
  const v75 = await visitaPasada(c75, 6, 'Dueño', { que: 'Reunión concretada' });
  const v76 = await visitaPasada(c76, 6, 'Dueño', { que: 'Reunión concretada' });
  await db.query(`delete from v2_cortes_bbva`);
  const cargar = (c, l) => como(ANA, `select public.v2_cargar_resultados_bbva('prueba.xlsx', $1::date, $2::jsonb)`, [c, JSON.stringify(l.map(x => ({ customer_id: x, gestion_con_contacto: true, reactivado: 'Si' })))]);
  await cargar(await diaMas(-60), [c76]);   // corte de otro periodo
  await cargar(await diaMas(0), [c73, c74]);
  const antes = await visita(ult73);
  await como(EJ, `select public.v2_registrar_seguimiento($1, 'Llamada', 'Respondió: usará el POS') s`, [ult73]);
  const despues = await visita(ult73);
  for (const k of ['con', 'que', 'motivo', 'decision', 'fuera_plazo', 'validacion', 'anulada_en']) assert.deepEqual(despues[k], antes[k], 'cambió la visita: ' + k);
  assert.equal((await bitacora(ult73)).filter(x => x.despues === 'Llamada · Respondió: usará el POS').length, 1, 'falta la línea de la bitácora');
  await falla(como(EJ, `select public.v2_registrar_seguimiento($1, 'Llamada', 'No respondió')`, [previa73]), /sin contacto/);   // no es su última visita
  await falla(como(EJ, `select public.v2_registrar_seguimiento($1, 'Llamada', 'No respondió')`, [v74]), /sin contacto/);       // ya cuenta (2 días)
  await falla(como(EJ, `select public.v2_registrar_seguimiento($1, 'Llamada', 'No respondió')`, [v75]), /sin contacto/);       // no es reactivado BBVA
  await falla(como(EJ, `select public.v2_registrar_seguimiento($1, 'Llamada', 'No respondió')`, [v76]), /sin contacto/);       // reactivado en otro periodo
  // lo que lee el celular: solo los propios, con días después de la visita con contacto y su última visita
  const l = (await como(EJ, `select customer_id, dias_trx, con_contacto, ultima_visita_id from public.v2_mis_reactivados_bbva() where customer_id in ($1, $2, $3, $4) order by 1`, [c73, c74, c75, c76])).rows;
  assert.deepEqual(l.map(x => [x.customer_id, x.dias_trx, x.con_contacto, x.ultima_visita_id]), [[c73, 0, true, ult73], [c74, 2, true, v74]]);
  assert.equal((await como(OTRO, `select * from public.v2_mis_reactivados_bbva() where customer_id in ($1, $2)`, [c73, c74])).rows.length, 0, 'otro ejecutivo ve reactivados ajenos');
  await falla(como(null, `select * from public.v2_mis_reactivados_bbva()`), /permission denied/);
});
caso('mis reactivados BBVA: sin visita con contacto se marca con_contacto = false y el seguimiento sigue en su visita sin contacto', async () => {
  const c77 = await nuevoComercio(77);
  const v77 = await visitaPasada(c77, 5, 'Nadie', { motivo: 'Cerrado' });
  await como(ANA, `select public.v2_cargar_resultados_bbva('prueba.xlsx', $1::date, $2::jsonb)`, [await diaMas(0), JSON.stringify([{ customer_id: c77, gestion_con_contacto: false, reactivado: 'Si' }])]);
  const r = (await como(EJ, `select dias_trx, con_contacto, ultima_visita_id from public.v2_mis_reactivados_bbva() where customer_id = $1`, [c77])).rows;
  assert.deepEqual(r.map(x => [x.dias_trx, x.con_contacto, x.ultima_visita_id]), [[0, false, v77]]);
  await como(EJ, `select public.v2_registrar_seguimiento($1, 'WhatsApp', 'No respondió')`, [v77]);
});
caso('mis reactivados BBVA: solo con visita válida (como v2_mi_base) y la consulta interna no se llama directo', async () => {
  const c78 = await nuevoComercio(78);
  const v78 = await visitaPasada(c78, 5, 'Dueño', { que: 'Reunión concretada' });
  await db.query(`update v2_visitas set lat = null where id = $1`, [v78]);   // sin ubicación: no es visita válida
  await como(ANA, `select public.v2_cargar_resultados_bbva('prueba.xlsx', $1::date, $2::jsonb)`, [await diaMas(0), JSON.stringify([{ customer_id: c78, gestion_con_contacto: true, reactivado: 'Si' }])]);
  assert.equal((await como(EJ, `select * from public.v2_mis_reactivados_bbva() where customer_id = $1`, [c78])).rows.length, 0, 'aparece un reactivado sin visita válida');
  await falla(como(EJ, `select public.v2_reactivado_por_contactar($1, '2099-01')`, [c78]), /permission denied/);
});
// ---------- recupero del POS (09/10): lo que hizo el ejecutivo cuando el comercio desiste ----------
async function desiste(n, equipo, dias = 6){
  const cid = await nuevoComercio(n);
  const id = await visitaPasada(cid, dias, 'Dueño', { que: 'Reunión concretada' });
  await db.query(`update v2_visitas set decision = 'Desiste del producto', equipo = $2 where id = $1`, [id, equipo]);
  return { cid, id };
}
const recup = async (u, cid) => (await como(u, `select * from public.v2_mis_recuperos() where customer_id = $1`, [cid])).rows[0];
const avanzar = (u, cid, acc, det, caso = null, nota = null) => como(u, `select public.v2_avanzar_recupero($1, $2, $3, $4, $5) p`, [cid, acc, det, caso, nota]).then(r => r.rows[0].p);
caso('recupero: el paso sale de la visita, avanza paso a paso, Jose valida u observa y la visita no cambia', async () => {
  const a = await desiste(91, 'No'), b = await desiste(92, 'Sí');
  assert.equal((await recup(EJ, a.cid)).paso, 'llamar');
  assert.equal((await recup(EJ, b.cid)).paso, 'entregado', 'si en la visita marcó que se recuperó, queda entregado por validar');
  const antes = await visita(a.id);
  assert.equal(await avanzar(EJ, a.cid, 'llame_soporte', 'No contestaron, vuelvo a llamar'), 'llamar');
  assert.equal((await recup(EJ, a.cid)).intentos, 1);
  await falla(avanzar(EJ, a.cid, 'entregado', null), /no corresponde/);
  await falla(avanzar(EJ, a.cid, 'llame_soporte', 'Me mandaron a otro lado'), /Elige/);
  assert.equal(await avanzar(EJ, a.cid, 'llame_soporte', 'Me dieron un número de caso', ' CAS-123 '), 'tramite');
  assert.equal((await recup(EJ, a.cid)).caso_soporte, 'CAS-123');
  assert.equal(await avanzar(EJ, a.cid, 'entregado', null), 'entregado');
  await falla(como(EJ, `select public.v2_validar_recupero($1, true)`, [a.cid]), /Solo el analista/);
  await falla(como(ANA, `select public.v2_validar_recupero($1, false, 'corta')`, [a.cid]), /nota/);
  assert.equal((await como(ANA, `select public.v2_validar_recupero($1, false, 'Openpay no registra la devolución') p`, [a.cid])).rows[0].p, 'tramite');
  assert.equal(await avanzar(EJ, a.cid, 'entregado', null, null, 'Lo dejó en la agencia'), 'entregado');
  assert.equal((await como(ANA, `select public.v2_validar_recupero($1, true) p`, [a.cid])).rows[0].p, 'validado');
  const r = await recup(EJ, a.cid);
  assert.equal(r.paso, 'validado'); assert.ok(r.historial.length >= 6, 'falta el historial');
  const despues = await visita(a.id);
  for (const k of ['con', 'que', 'decision', 'equipo', 'fuera_plazo', 'validacion', 'anulada_en']) assert.deepEqual(despues[k], antes[k], 'cambió la visita: ' + k);
  assert.ok((await db.query(`select count(*)::int n from v2_bitacora_visita where visita_id = $1 and accion = 'recupero'`, [a.id])).rows[0].n >= 6, 'falta la bitácora');
  // el entregado de la visita se valida directo
  assert.equal((await como(ANA, `select public.v2_validar_recupero($1, true) p`, [b.cid])).rows[0].p, 'validado');
});
caso('recupero: problemas, quién puede avanzar y quién deja de aparecer', async () => {
  const c = await desiste(93, 'Pendiente'), d = await desiste(94, 'No'), e = await desiste(95, 'No', 8);
  assert.equal(await avanzar(EJ, c.cid, 'problema', 'No quiere entregar el equipo'), 'trabado');
  assert.equal(await avanzar(EJ, c.cid, 'llame_soporte', 'Programaron el recojo'), 'tramite', 'desde trabado se retoma llamando a Soporte');
  // «Cambió de opinión» pide nota y queda por validar en el escritorio (Jose, 09/10)
  await falla(avanzar(EJ, d.cid, 'problema', 'Cambió de opinión: seguirá usando el POS'), /nota/);
  assert.equal(await avanzar(EJ, d.cid, 'problema', 'Cambió de opinión: seguirá usando el POS', null, 'El dueño lo usará en la campaña de fin de mes'), 'sigue');
  assert.equal((await recup(EJ, d.cid)).paso, 'sigue', 'sigue por validar debe verse');
  await falla(avanzar(EJ, d.cid, 'llame_soporte', 'Programaron el recojo'), /no corresponde/);
  assert.equal((await como(ANA, `select public.v2_validar_recupero($1, true) p`, [d.cid])).rows[0].p, 'sigue');
  assert.equal(await recup(EJ, d.cid), undefined, 'el que sigue con el POS, ya validado, sale de la lista');
  const g = await desiste(96, 'No');
  await avanzar(EJ, g.cid, 'problema', 'Cambió de opinión: seguirá usando el POS', null, 'Dice que lo usará pero no convence');
  assert.equal((await como(ANA, `select public.v2_validar_recupero($1, false, 'No hay transacciones: insistir') p`, [g.cid])).rows[0].p, 'llamar', 'observar «sigue» lo devuelve a llamar');
  // el Manager solo lee; el Analista (escritorio) sí puede avanzar un caso ajeno
  await falla(avanzar(MAN, c.cid, 'entregado', null), /Solo el ejecutivo/);
  assert.equal(await avanzar(ANA, g.cid, 'llame_soporte', 'No contestaron, vuelvo a llamar'), 'llamar');
  await falla(avanzar(OTRO, c.cid, 'entregado', null), /Solo el ejecutivo/);
  await falla(avanzar(null, c.cid, 'entregado', null), /permission denied/);
  await falla(avanzar(EJ, c.cid, 'entregado', null, null, repeat300()), /300/);
  const ev = (await db.query(`select por from v2_recupero_eventos e join v2_recuperos r on r.id = e.recupero_id where r.customer_id = $1 order by e.en desc limit 1`, [c.cid])).rows[0];
  assert.equal(ev.por, EJ);
  // sin caso: una visita posterior que ya no desiste lo saca de la lista
  await visitaPasada(e.cid, 2, 'Dueño', { que: 'Reunión concretada' });
  assert.equal(await recup(EJ, e.cid), undefined);
  assert.equal((await como(OTRO, `select * from public.v2_mis_recuperos() where customer_id in ($1, $2)`, [c.cid, e.cid])).rows.length, 0, 'otro ejecutivo ve recuperos ajenos');
  await falla(como(null, `select * from public.v2_mis_recuperos()`), /permission denied/);
  await falla(como(EJ, `insert into v2_recuperos(periodo, customer_id, correo, visita_id, paso) values ('2099-01', $1, $2, $3, 'validado')`, [c.cid, EJ, c.id]), /permission denied/);
  await falla(como(EJ, `select * from public.v2_recuperos_del_periodo('2099-01')`), /permission denied/);
  await falla(como(EJ, `select public.v2_recupero_para_escribir($1)`, [c.cid]), /permission denied/);
});
caso('recupero: si la visita cambia, el caso se cierra solo; los casos abiertos pasan al periodo siguiente', async () => {
  // con caso creado: una visita posterior en que ya no desiste lo cierra («cambio») y no se puede avanzar
  const h = await desiste(97, 'No', 8);
  assert.equal(await avanzar(EJ, h.cid, 'llame_soporte', 'Programaron el recojo'), 'tramite');
  const otra = await visitaPasada(h.cid, 2, 'Dueño', { que: 'Reunión concretada' });
  await db.query(`update v2_visitas set decision = 'Aún no decide' where id = $1`, [otra]);
  assert.equal((await recup(EJ, h.cid)).paso, 'cambio');
  await falla(avanzar(EJ, h.cid, 'entregado', null), /cambió la visita/);
  // la visita del desiste se anula: también se cierra
  const k = await desiste(98, 'No');
  await avanzar(EJ, k.cid, 'llame_soporte', 'Programaron el recojo');
  await db.query(`update v2_visitas set anulada_en = now(), anulada_por = $2 where id = $1`, [k.id, ANA]);
  assert.equal((await recup(EJ, k.cid)).paso, 'cambio');
  // caso abierto de un periodo anterior: sigue en la lista y se puede avanzar
  const cid = await nuevoComercio(99);
  await db.query(`insert into v2_periodos(id, ini, fin) values ('2098-12', '2098-12-01', '2098-12-31') on conflict do nothing`);
  const vv = await visitaPasada(cid, 50, 'Dueño', { que: 'Reunión concretada' });
  await db.query(`update v2_visitas set periodo = '2098-12', decision = 'Desiste del producto', equipo = 'No' where id = $1`, [vv]);
  await db.query(`insert into v2_recuperos(periodo, customer_id, correo, visita_id, paso) values ('2098-12', $1, $2, $3, 'tramite')`, [cid, EJ, vv]);
  assert.equal((await recup(EJ, cid)).paso, 'tramite', 'el caso abierto del periodo anterior no aparece');
  assert.equal(await avanzar(EJ, cid, 'entregado', null), 'entregado');
  assert.equal((await como(ANA, `select public.v2_validar_recupero($1, true) p`, [cid])).rows[0].p, 'validado');
  assert.equal(await recup(EJ, cid), undefined, 'un caso cerrado de otro periodo no debe seguir en la lista');
  // deducido de un periodo anterior (nadie lo tocó): también pasa, con el nombre del comercio, y se puede avanzar
  const cid2 = await nuevoComercio(100);
  const v2 = await visitaPasada(cid2, 50, 'Dueño', { que: 'Reunión concretada' });
  await db.query(`update v2_visitas set periodo = '2098-12', decision = 'Desiste del producto', equipo = 'No' where id = $1`, [v2]);
  const x = await recup(EJ, cid2);
  assert.equal(x && x.paso, 'llamar', 'el deducido del periodo anterior no pasó');
  assert.equal(x.comercio, 'COMERCIO DE PRUEBA 100 SAC');
  assert.equal(await avanzar(EJ, cid2, 'llame_soporte', 'Programaron el recojo'), 'tramite');
  // un «cambio» de un periodo anterior ya no se arrastra
  const cid3 = await nuevoComercio(101);
  const v3 = await visitaPasada(cid3, 50, 'Dueño', { que: 'Reunión concretada' });
  await db.query(`update v2_visitas set periodo = '2098-12', decision = 'Desiste del producto', equipo = 'No', anulada_en = now(), anulada_por = $2 where id = $1`, [v3, ANA]);
  await db.query(`insert into v2_recuperos(periodo, customer_id, correo, visita_id, paso) values ('2098-12', $1, $2, $3, 'llamar')`, [cid3, EJ, v3]);
  assert.equal(await recup(EJ, cid3), undefined, 'el «cambio» de otro periodo se sigue arrastrando');
  // caso abierto de un periodo anterior y el comercio vuelve a desistir en este: un solo caso, el viejo
  const cid4 = await nuevoComercio(102);
  const v4 = await visitaPasada(cid4, 50, 'Dueño', { que: 'Reunión concretada' });
  await db.query(`update v2_visitas set periodo = '2098-12', decision = 'Desiste del producto', equipo = 'No' where id = $1`, [v4]);
  await db.query(`insert into v2_recuperos(periodo, customer_id, correo, visita_id, paso) values ('2098-12', $1, $2, $3, 'tramite')`, [cid4, EJ, v4]);
  const v4b = await visitaPasada(cid4, 3, 'Dueño', { que: 'Reunión concretada' });
  await db.query(`update v2_visitas set decision = 'Desiste del producto', equipo = 'No' where id = $1`, [v4b]);
  const l4 = (await como(EJ, `select paso from public.v2_mis_recuperos() where customer_id = $1`, [cid4])).rows;
  assert.deepEqual(l4.map(x => x.paso), ['tramite'], 'el caso sale dos veces');
});
const repeat300 = () => 'x'.repeat(301);
caso('las tablas nuevas nacen sin TRUNCATE para authenticated y sin nada para anon', async () => {
  await db.exec(`create table public.v2_tabla_de_prueba(id bigserial primary key)`);
  const r = (await db.query(`select has_table_privilege('anon', 'public.v2_tabla_de_prueba', 'SELECT') anon_lee,
      has_table_privilege('anon', 'public.v2_tabla_de_prueba', 'TRUNCATE') anon_vacia,
      has_table_privilege('authenticated', 'public.v2_tabla_de_prueba', 'SELECT') auth_lee,
      has_table_privilege('authenticated', 'public.v2_tabla_de_prueba', 'TRUNCATE') auth_vacia,
      has_sequence_privilege('anon', 'public.v2_tabla_de_prueba_id_seq', 'USAGE') anon_seq,
      has_sequence_privilege('authenticated', 'public.v2_tabla_de_prueba_id_seq', 'UPDATE') auth_setval`)).rows[0];
  await db.exec('drop table public.v2_tabla_de_prueba');
  assert.deepEqual(r, { anon_lee: false, anon_vacia: false, auth_lee: true, auth_vacia: false, anon_seq: false, auth_setval: false });
});

let fallas = 0;
for (const [n, fn] of CASOS){
  try { await fn(); console.log(`ok  ${n}`); }
  catch (e) { fallas++; console.log(`MAL ${n}: ${e.message}`); }
}
console.log(fallas ? `\n${fallas} prueba(s) del servidor fallaron` : '\nTodas las pruebas del servidor pasaron');
process.exit(fallas ? 1 : 0);
