// Prueba del celular con la ruta propia (21/10): «Mover a otra ruta» en la ficha y «Armar mi ruta de hoy» en Rutas.
// La ruta recomendada (ruta, orden) no se pierde; la propia llega en ruta_propia y orden_propio. Datos inventados.
// Uso: node v2/qa/celular-rutas.mjs   (antes: python v2/build.py)
import { navegador, urlDist, EJECUTIVO, comercio } from './comun.mjs';
import assert from 'node:assert/strict';

const BASE = [
  comercio(1, { ruta: 'Ruta 01 · Prueba', orden: 1 }), comercio(2, { ruta: 'Ruta 01 · Prueba', orden: 2 }), comercio(3, { ruta: 'Ruta 01 · Prueba', orden: 3 }),
  comercio(4, { ruta: 'Ruta 02 · Prueba', orden: 1 }), comercio(5, { ruta: 'Ruta 02 · Prueba', orden: 2 }),
  // recomendado en la Ruta 02, el ejecutivo ya lo pasó a la Ruta 01
  comercio(6, { ruta: 'Ruta 02 · Prueba', orden: 3, ruta_propia: 'Ruta 01 · Prueba', orden_propio: 4, ruta_propia_en: '2026-01-02T15:00:00Z' }),
  // de salida con visita: se ve, pero no se mueve ni entra al armar la ruta (el servidor lo rechazaría)
  comercio(8, { ruta: 'Ruta 01 · Prueba', orden: 9, origen: 'salida', visitas: 1, visitas_validas: 1, estado: 'vis', ultima_visita: '2026-01-02T15:00:00Z', ultima_que: 'Sin éxito', ultima_motivo: 'Cerrado' }),
  // de otro ejecutivo: no se ofrece
  comercio(7, { ruta: 'Ruta 03 · Prueba', orden: 1, correo: 'otro.prueba@ejemplo.com' })
];
const FX = (extra = {}) => Object.assign({
  sesion: { user: { email: EJECUTIVO.correo }, access_token: 'prueba' },
  tablas: { usuarios: EJECUTIVO, v2_periodos: { id: 'PRUEBA', ini: '2026-01-01', fin: '2099-12-31' } },
  rpc: { v2_mi_base: BASE, v2_mis_revisiones: [], v2_actividad: [], v2_avance: [], v2_visitas_de: [], v2_mis_seguimientos: [], v2_mis_reactivados_bbva: [], v2_mis_recuperos: [], v2_armar_ruta: 1 }
}, extra);

let fallas = 0;
const prueba = async (nombre, f) => { try { await f(); console.log(`ok  ${nombre}`); } catch (e) { fallas++; console.log(`MAL ${nombre}: ${e.message}`); } };
for (const tema of ['light', 'dark']) {
  const { b, ctx } = await navegador({ tema });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/net::|fonts|Failed to load resource|URL scheme "file" is not supported/.test(m.text())) errs.push(m.text()); });
  await p.addInitScript(fx => { window.__FX = fx; }, FX());
  await p.goto(urlDist('celular')); await p.waitForTimeout(1200);
  const texto = () => p.evaluate(() => document.querySelector('#pantalla').textContent);
  const armadas = () => p.evaluate(() => window.__llamadas.filter(x => x[0] === 'v2_armar_ruta').map(x => x[1]));
  const ficha = async cid => { await p.evaluate(c => { S.ficha = c; S.mover = null; pintar(); }, cid); await p.waitForTimeout(200); };

  await prueba(`${tema} · la ruta propia manda en el celular y la recomendada se ve en la ficha`, async () => {
    const r = await p.evaluate(() => rutas().map(r => [r.nombre, r.cs.map(c => c.customer_id)]));
    assert.deepEqual(r.find(x => x[0] === 'Ruta 01 · Prueba')[1], ['00000001', '00000002', '00000003', '00000006', '00000008']);
    assert.deepEqual(r.find(x => x[0] === 'Ruta 02 · Prueba')[1], ['00000004', '00000005']);
    await ficha('00000006');
    const t = await texto();
    assert.match(t, /Ruta · armada por ti/); assert.match(t, /Ruta 01 · Prueba · parada 4/); assert.match(t, /Recomendada: Ruta 02 · Prueba · parada 3/);
    await ficha('00000008');
    assert.equal(await p.locator('[data-mover]').count(), 0, 'deja mover un comercio de salida');
  });

  await prueba(`${tema} · ficha: «Mover a otra ruta» lo deja al final de la ruta elegida`, async () => {
    await ficha('00000004');
    assert.ok(!(await texto()).includes('Recomendada:'), 'un comercio sin ruta propia no muestra la recomendada aparte');
    await p.click('[data-mover]'); await p.waitForTimeout(150);
    const opciones = await p.$$eval('#moverA option', os => os.map(o => o.textContent));
    assert.deepEqual(opciones, ['Elige la ruta', 'Ruta 01 · Prueba', 'Una ruta nueva…'], 'ofrece la propia ruta o rutas de otro ejecutivo');
    await p.click('[data-mover-guardar]'); await p.waitForTimeout(150);
    assert.match(await texto(), /Elige la ruta\./);
    await p.selectOption('#moverA', 'Ruta 01 · Prueba'); await p.waitForTimeout(150);
    await p.click('[data-mover-guardar]'); await p.waitForTimeout(400);
    assert.deepEqual((await armadas()).at(-1), { p_ruta: 'Ruta 01 · Prueba', p_customer_ids: ['00000001', '00000002', '00000003', '00000006', '00000004'] });
    assert.match(await texto(), /Movido a Ruta 01 · Prueba\./);
    assert.equal(await p.evaluate(() => S.mover), null);
  });

  await prueba(`${tema} · ficha: ruta nueva, error del servidor y volver a la recomendada`, async () => {
    await ficha('00000005');
    await p.click('[data-mover]'); await p.waitForTimeout(100);
    await p.selectOption('#moverA', '__nueva'); await p.waitForTimeout(150);
    await p.click('[data-mover-guardar]'); await p.waitForTimeout(150);
    assert.match(await texto(), /Escribe el nombre de la ruta nueva\./);
    await p.fill('#moverNueva', 'Mi ruta del jueves');
    await p.evaluate(() => { window.__FX.rpc.v2_armar_ruta = () => ({ __error: 'Solo puedes mover comercios de tu base de este periodo.' }); });
    await p.click('[data-mover-guardar]'); await p.waitForTimeout(300);
    assert.match(await texto(), /No se movió: Solo puedes mover comercios de tu base de este periodo\./);
    await p.evaluate(() => { window.__FX.rpc.v2_armar_ruta = 1; });
    await p.click('[data-mover-guardar]'); await p.waitForTimeout(400);
    assert.deepEqual((await armadas()).at(-1), { p_ruta: 'Mi ruta del jueves', p_customer_ids: ['00000005'] });
    await ficha('00000006');
    await p.click('[data-mover]'); await p.waitForTimeout(100);
    await p.click('[data-mover-volver]'); await p.waitForTimeout(400);
    assert.deepEqual((await armadas()).at(-1), { p_ruta: null, p_customer_ids: ['00000006'] });
    await p.evaluate(() => { S.ficha = null; S.vista = 'inicio'; pintar(); });
  });

  await prueba(`${tema} · Rutas: «Armar mi ruta de hoy» ordena, suma un comercio y guarda`, async () => {
    await p.evaluate(() => { S.vista = 'rutas'; S.armar = null; pintar(); }); await p.waitForTimeout(150);
    let t = await texto();
    assert.match(t, /Tu ruta de hoy\s*Ruta 01 · Prueba/); assert.match(t, /5 comercios · armada por ti/);
    await p.click('[data-armar]'); await p.waitForTimeout(150);
    assert.equal(await p.locator('[data-armar-guardar][disabled]').count(), 1, 'deja guardar sin cambios');
    assert.equal(await p.locator('[data-armar-volver]').count(), 1, 'falta deshacer: la ruta tiene un comercio movido');
    await p.click('[data-armar-bajar="0"]'); await p.waitForTimeout(100);
    const agregar = await p.$$eval('#armarAgregar option', os => os.map(o => o.value));
    assert.deepEqual(agregar, ['', '00000004', '00000005'], 'ofrece comercios de otro ejecutivo o que ya están en la ruta');
    await p.selectOption('#armarAgregar', '00000005'); await p.waitForTimeout(150);
    assert.match(await texto(), /Viene de Ruta 02 · Prueba/);
    await p.click('[data-armar-subir="4"]'); await p.waitForTimeout(100);
    assert.equal(await p.locator('[data-armar-volver]').count(), 0, 'deshacer con cambios sin guardar confunde');
    await p.click('[data-armar-guardar]'); await p.waitForTimeout(400);
    assert.deepEqual((await armadas()).at(-1), { p_ruta: 'Ruta 01 · Prueba', p_customer_ids: ['00000002', '00000001', '00000003', '00000005', '00000006'] });
    assert.match(await texto(), /Tu ruta quedó guardada\./);
  });

  await prueba(`${tema} · Rutas: quitar lo sumado, cambiar de ruta y deshacer`, async () => {
    await p.click('[data-armar]'); await p.waitForTimeout(150);
    await p.selectOption('#armarAgregar', '00000004'); await p.waitForTimeout(150);
    await p.click('[data-armar-quitar="4"]'); await p.waitForTimeout(100);
    assert.deepEqual(await p.evaluate(() => S.armar.ids), ['00000001', '00000002', '00000003', '00000006']);
    await p.selectOption('#armarRuta', 'Ruta 02 · Prueba'); await p.waitForTimeout(150);
    assert.deepEqual(await p.evaluate(() => [S.armar.ids, S.armar.cambiado]), [['00000004', '00000005'], false]);
    await p.selectOption('#armarRuta', 'Ruta 01 · Prueba'); await p.waitForTimeout(150);
    await p.click('[data-armar-volver]'); await p.waitForTimeout(400);
    assert.deepEqual((await armadas()).at(-1), { p_ruta: null, p_customer_ids: ['00000006'] });
    await p.evaluate(() => { S.vista = 'inicio'; pintar(); });
  });
  if (errs.length) { fallas++; console.log(`MAL ${tema} · errores de consola:`, errs); }
  await b.close();
}

// Vista «como» de Jose: solo lectura, sin mover ni armar rutas
{
  const JOSE = { correo: 'jose.prueba@ejemplo.com', nombre: 'Jose Prueba', nombre_corto: 'Jose', rol: 'Analista', activo: true };
  const { b, ctx } = await navegador({});
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(fx => { window.__FX = fx; }, FX({ sesion: { user: { email: JOSE.correo }, access_token: 'prueba' }, tablas: { usuarios: JOSE, v2_periodos: { id: 'PRUEBA', ini: '2026-01-01', fin: '2099-12-31' } } }));
  await p.goto(urlDist('celular') + '?como=' + encodeURIComponent(EJECUTIVO.correo)); await p.waitForTimeout(1200);
  await prueba('como · Jose ve las rutas del ejecutivo sin poder moverlas', async () => {
    await p.evaluate(() => { S.vista = 'rutas'; pintar(); }); await p.waitForTimeout(150);
    assert.equal(await p.locator('[data-armar]').count(), 0, 'deja armar la ruta');
    await p.evaluate(() => { S.ficha = '00000004'; pintar(); }); await p.waitForTimeout(150);
    assert.equal(await p.locator('[data-mover]').count(), 0, 'deja mover el comercio');
    const r = await p.evaluate(() => sb.rpc('v2_armar_ruta', { p_ruta: 'x', p_customer_ids: [] }));
    assert.ok(r.error && /no se guardan/.test(r.error.message), 'deja escribir por rpc');
  });
  if (errs.length) { fallas++; console.log('MAL como · errores:', errs); }
  await b.close();
}
console.log(fallas ? `\n${fallas} prueba(s) fallaron` : '\nTodas las pruebas de las rutas del celular pasaron');
process.exit(fallas ? 1 : 0);
