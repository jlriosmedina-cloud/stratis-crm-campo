// Prueba de la mudanza al link de Stratis (22/10): en la dirección anterior, el celular envía primero las visitas
// guardadas y solo con la cola vacía pide pasar al link nuevo. Con visitas por revisar no pide nada. Datos inventados.
// Uso: node v2/qa/celular-mudanza.mjs   (antes: python v2/build.py)
import { navegador, urlDist, RAIZ, EJECUTIVO, comercio } from './comun.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ANTERIOR = 'https://jlriosmedina-cloud.github.io/stratis-crm-campo/';
const NUEVA = 'https://nuevo.ejemplo.test/crm/';
const html = fs.readFileSync(path.join(RAIZ, 'dist', 'celular', 'index.html'), 'utf8');
// El celular armado lleva el link de Stratis; la prueba lo cambia por uno inventado para no salir a internet.
assert.match(html, /const URL_NUEVA = "https:\/\/crm-bbva-peru-qa\.mystratis\.com\/";/, 'el celular armado debe llevar el link nuevo de Stratis');
const conMudanza = html.replace(/const URL_NUEVA = "[^"]*";/, `const URL_NUEVA = "${NUEVA}";`);

const FX = (extra = {}) => Object.assign({
  sesion: { user: { email: EJECUTIVO.correo }, access_token: 'prueba' },
  tablas: { usuarios: EJECUTIVO, v2_periodos: { id: 'PRUEBA', ini: '2026-01-01', fin: '2099-12-31' } },
  rpc: { v2_mi_base: [comercio(1), comercio(2)], v2_mis_revisiones: [], v2_actividad: [], v2_avance: [], v2_visitas_de: [], v2_mis_seguimientos: [], v2_mis_reactivados_bbva: [], v2_mis_recuperos: [], v2_mis_retenidas: [], v2_registrar_visita: 1, v2_reportar_retenida: 'pendiente' }
}, extra);
const enCola = (i, extra = {}) => Object.assign({ p_cliente_uid: 'uid-prueba-' + i, p_customer_id: String(i).padStart(8, '0'), p_visitado_en: new Date().toISOString(), p_que_paso: 'Nadie', p_motivo: 'Cerrado' }, extra);

let fallas = 0;
const prueba = async (nombre, f) => { try { await f(); console.log(`ok  ${nombre}`); } catch (e) { fallas++; console.log(`MAL ${nombre}: ${e.message}`); } };
for (const tema of ['light', 'dark']) {
  const { b, ctx } = await navegador({ tema });
  await ctx.route(ANTERIOR + '**', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: conMudanza }));
  await ctx.route(NUEVA + '**', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><title>nuevo</title><p>CRM nuevo</p>' }));
  const abrir = async (cola, caido = false, fx = FX()) => {
    const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/net::|fonts|Failed to load resource/.test(m.text())) errs.push(m.text()); });
    await p.addInitScript(([fx, cola, caido]) => { window.__FX = fx; if (caido) fx.rpc.v2_registrar_visita = () => ({ __error: 'Failed to fetch' }); if (location.hostname === 'jlriosmedina-cloud.github.io') localStorage.setItem('stratis-v2-cola', JSON.stringify(cola)); }, [fx, cola, caido]);
    await p.goto(ANTERIOR); await p.waitForTimeout(1200);
    return { p, errs };
  };

  await prueba(`${tema} · cola vacía: pide pasar al link nuevo y lo abre`, async () => {
    const { p, errs } = await abrir([]);
    assert.equal(await p.locator('#avisoMudanza').count(), 1, 'no aparece el aviso de mudanza');
    assert.match(await p.locator('#avisoMudanza').textContent(), /El CRM de campo cambió de link/);
    await Promise.all([p.waitForURL(NUEVA), p.click('[data-ir-nuevo]')]);
    assert.match(await p.textContent('body'), /CRM nuevo/);
    assert.deepEqual(errs, []); await p.close();
  });

  await prueba(`${tema} · visitas guardadas: primero las envía y recién después pide pasar`, async () => {
    const { p, errs } = await abrir([enCola(1), enCola(2)]);
    const enviadas = await p.evaluate(() => window.__llamadas.filter(x => x[0] === 'v2_registrar_visita').length);
    assert.equal(enviadas, 2, 'no envió las visitas de la cola');
    assert.equal(await p.evaluate(() => S.cola.length), 0);
    assert.equal(await p.locator('#avisoMudanza').count(), 1, 'con la cola enviada debe pedir pasar al link nuevo');
    assert.deepEqual(errs, []); await p.close();
  });

  await prueba(`${tema} · sin señal o con el servidor caído: la visita se queda y no pide pasar`, async () => {
    const { p, errs } = await abrir([enCola(3)], true);
    assert.equal(await p.evaluate(() => S.cola.length), 1, 'la visita no debe salir de la cola');
    assert.equal(await p.locator('#avisoMudanza').count(), 0, 'no debe pedir pasar con visitas sin enviar');
    assert.deepEqual(errs, []); await p.close();
  });

  await prueba(`${tema} · visita por revisar: sigue en el celular y no pide pasar`, async () => {
    const { p, errs } = await abrir([enCola(4, { _rechazo: { msg: 'Prueba de rechazo', en: new Date().toISOString(), avisada: true } })]);
    assert.equal(await p.evaluate(() => S.cola.length), 1);
    assert.equal(await p.locator('#avisoMudanza').count(), 0);
    assert.deepEqual(errs, []); await p.close();
  });

  await prueba(`${tema} · si la cola se vacía con un formulario abierto, espera a que termine`, async () => {
    const { p, errs } = await abrir([enCola(5)], true);
    await p.evaluate(() => nuevoRegistro('00000001')); await p.waitForTimeout(150);
    await p.evaluate(async () => { window.__FX.rpc.v2_registrar_visita = 1; await vaciarCola(); }); await p.waitForTimeout(300);
    assert.equal(await p.evaluate(() => S.cola.length), 0, 'no envió la visita guardada');
    assert.equal(await p.locator('#avisoMudanza').count(), 0, 'interrumpe un registro a medias');
    await p.evaluate(() => { S.reg = null; pintar(); }); await p.waitForTimeout(150);
    assert.equal(await p.locator('#avisoMudanza').count(), 1);
    assert.deepEqual(errs, []); await p.close();
  });

  await prueba(`${tema} · sin señal y con la cola vacía: no pide pasar y deja registrar`, async () => {
    const { p, errs } = await abrir([]);
    assert.equal(await p.locator('#avisoMudanza').count(), 1);
    await ctx.setOffline(true); await p.waitForTimeout(300);
    assert.equal(await p.locator('#avisoMudanza').count(), 0, 'sin señal el aviso bloquea el registro');
    await p.evaluate(() => nuevoRegistro('00000001')); await p.waitForTimeout(150);
    assert.equal(await p.evaluate(() => !!S.reg), true);
    await p.evaluate(() => { S.reg = null; pintar(); });
    await ctx.setOffline(false); await p.waitForTimeout(3600);
    assert.equal(await p.locator('#avisoMudanza').count(), 1, 'al volver la señal debe pedir pasar otra vez');
    assert.deepEqual(errs, []); await p.close();
  });

  await prueba(`${tema} · «Todavía no puedo entrar»: lo aparta una hora, aunque recargue, y deja registrar`, async () => {
    const { p, errs } = await abrir([]);
    await p.click('[data-mudanza-luego]'); await p.waitForTimeout(300);
    assert.equal(await p.locator('#avisoMudanza').count(), 0);
    assert.match(await p.textContent('body'), /En una hora te lo volvemos a pedir/);
    const luego = await p.evaluate(() => Number(localStorage.getItem('stratis-v2-mudanza-luego')) - Date.now());
    assert.ok(luego > 59 * 60 * 1000 && luego <= 60 * 60 * 1000, 'debe apartarlo una hora');
    await p.reload(); await p.waitForTimeout(1200);
    assert.equal(await p.locator('#avisoMudanza').count(), 0, 'recargar lo vuelve a mostrar antes de la hora');
    await p.evaluate(() => nuevoRegistro('00000001')); await p.waitForTimeout(150);
    assert.equal(await p.evaluate(() => !!S.reg), true, 'no deja registrar');
    await p.evaluate(() => { S.reg = null; localStorage.setItem('stratis-v2-mudanza-luego', String(Date.now() - 1000)); pintar(); }); await p.waitForTimeout(150);
    assert.equal(await p.locator('#avisoMudanza').count(), 1, 'pasada la hora debe volver a pedirlo');
    assert.deepEqual(errs, []); await p.close();
  });

  await prueba(`${tema} · si el link nuevo no responde, se queda en el anterior`, async () => {
    const { p, errs } = await abrir([]);
    await p.route(NUEVA + '**', r => r.abort());
    await p.click('[data-ir-nuevo]'); await p.waitForTimeout(500);
    assert.equal(new URL(p.url()).hostname, 'jlriosmedina-cloud.github.io', 'dejó el link anterior sin que el nuevo responda');
    assert.equal(await p.locator('#avisoMudanza').count(), 0);
    assert.match(await p.textContent('body'), /El link nuevo no responde ahora/);
    assert.deepEqual(errs, []); await p.close();
  });

  await prueba(`${tema} · fuera de la dirección anterior (link nuevo o archivo local) no hace nada`, async () => {
    const p = await ctx.newPage(); await p.addInitScript(fx => { window.__FX = fx; }, FX());
    await p.goto(urlDist('celular')); await p.waitForTimeout(1000);
    assert.equal(await p.evaluate(() => MUDANZA), false);
    assert.equal(await p.locator('#avisoMudanza').count(), 0); await p.close();
  });
  await b.close();
}
if (fallas) { console.log(`\n${fallas} prueba(s) fallaron`); process.exit(1); }
console.log('\nmudanza del celular: todo bien');
