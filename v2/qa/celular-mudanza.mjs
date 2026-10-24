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
assert.match(html, /const URL_NUEVA = "[^"]*";/, 'el celular armado debe llevar la constante URL_NUEVA');
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

  await prueba(`${tema} · una sola salida: no hay «Todavía no puedo entrar»`, async () => {
    const { p, errs } = await abrir([]);
    assert.equal(await p.locator('#avisoMudanza [data-ir-nuevo]').count(), 1);
    assert.equal(await p.locator('#avisoMudanza [data-mudanza-luego]').count(), 0);
    assert.ok(!/Todavía no puedo entrar/.test(await p.locator('#avisoMudanza').textContent()));
    assert.deepEqual(errs, []); await p.close();
  });

  await prueba(`${tema} · «No recuerdo mi clave»: valida, guarda la clave nueva y lleva al link nuevo`, async () => {
    const { p, errs } = await abrir([]);
    await p.click('[data-mudanza-clave]'); await p.waitForTimeout(150);
    assert.match(await p.locator('#avisoMudanza').textContent(), /Crea tu clave nueva/);
    assert.match(await p.locator('#avisoMudanza').textContent(), /ejecutivo\.prueba@ejemplo\.com/);
    const llamadas = () => p.evaluate(() => window.__llamadas.filter(x => x[0] === 'auth.updateUser'));
    await p.fill('#muClave1', 'corta'); await p.fill('#muClave2', 'corta'); await p.click('[data-mudanza-form] button[type=submit]'); await p.waitForTimeout(150);
    assert.match(await p.locator('#avisoMudanza').textContent(), /al menos 8 caracteres/);
    await p.fill('#muClave1', 'claveprueba1'); await p.fill('#muClave2', 'claveprueba2'); await p.click('[data-mudanza-form] button[type=submit]'); await p.waitForTimeout(150);
    assert.match(await p.locator('#avisoMudanza').textContent(), /no coinciden/);
    assert.equal((await llamadas()).length, 0, 'guardó una clave que no pasó la validación');
    // un repintado de la app no corta el formulario
    await p.evaluate(() => pintar()); await p.waitForTimeout(100);
    assert.equal(await p.locator('#muClave1').count(), 1, 'un repintado borró el formulario');
    await p.fill('#muClave1', 'claveprueba1'); await p.fill('#muClave2', 'claveprueba1'); await p.click('[data-mudanza-form] button[type=submit]'); await p.waitForTimeout(300);
    assert.deepEqual(await llamadas(), [['auth.updateUser', { largo: 12 }]]);
    assert.match(await p.locator('#avisoMudanza').textContent(), /Tu clave nueva quedó guardada/);
    await Promise.all([p.waitForURL(NUEVA), p.click('[data-ir-nuevo]')]);
    assert.deepEqual(errs, []); await p.close();
  });

  await prueba(`${tema} · si Supabase no guarda la clave, lo dice y deja seguir registrando aquí`, async () => {
    const { p, errs } = await abrir([]);
    await p.evaluate(() => { window.__FX.claveError = 'Password is too weak'; });
    await p.click('[data-mudanza-clave]'); await p.waitForTimeout(100);
    await p.fill('#muClave1', 'claveprueba1'); await p.fill('#muClave2', 'claveprueba1'); await p.click('[data-mudanza-form] button[type=submit]'); await p.waitForTimeout(300);
    assert.match(await p.locator('#avisoMudanza').textContent(), /No se guardó tu clave \(Password is too weak\)/);
    // sin clave no queda trabado: puede seguir registrando aquí mientras Jose se la cambia
    await p.click('[data-mudanza-aqui]'); await p.waitForTimeout(200);
    assert.equal(await p.locator('#avisoMudanza').count(), 0);
    await p.evaluate(() => nuevoRegistro('00000001')); await p.waitForTimeout(150);
    assert.equal(await p.evaluate(() => !!S.reg), true, 'no deja registrar');
    await p.evaluate(() => { S.reg = null; pintar(); });
    // una excepción tampoco deja el botón trabado
    await p.evaluate(() => { localStorage.removeItem('stratis-v2-mudanza-luego'); window.__FX.claveError = null; sb.auth.updateUser = () => Promise.reject(new Error('sin red')); pintar(); }); await p.waitForTimeout(150);
    await p.click('[data-mudanza-clave]'); await p.waitForTimeout(100);
    await p.fill('#muClave1', 'claveprueba1'); await p.fill('#muClave2', 'claveprueba1'); await p.click('[data-mudanza-form] button[type=submit]'); await p.waitForTimeout(300);
    assert.match(await p.locator('#avisoMudanza').textContent(), /No se guardó tu clave \(sin red\)/);
    assert.equal(await p.locator('[data-mudanza-form] button[type=submit][disabled]').count(), 0, 'el botón quedó trabado');
    assert.deepEqual(errs, []); await p.close();
  });

  await prueba(`${tema} · sin sesión no ofrece crear clave`, async () => {
    const { p, errs } = await abrir([], false, FX({ sesion: null }));
    assert.equal(await p.locator('#avisoMudanza').count(), 1);
    assert.equal(await p.locator('[data-mudanza-clave]').count(), 0);
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
