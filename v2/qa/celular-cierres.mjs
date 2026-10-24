// Prueba de «Mis cierres» (24/10): en «Mi avance», el ejecutivo ve sus periodos cerrados con alcances, incentivo
// (pagado / retenido) y su bolsa retenida, en % del sueldo base. El ojo de privacidad los tapa. Datos inventados.
// Uso: node v2/qa/celular-cierres.mjs   (antes: python v2/build.py)
import { navegador, urlDist, EJECUTIVO, comercio } from './comun.mjs';
import assert from 'node:assert/strict';

const CIERRES = [
  { periodo: '2099-01', nombre: 'P1 · enero', ini: '2098-12-19', fin: '2099-01-18', modelo: 'Prueba', aprobado_en: '2099-01-20', incentivo_pct: 15, pagado_pct: 12, retenido_pct: 3, alcances: [{ k: 'Llave', v: '2 de 3' }] },
  { periodo: '2099-02', nombre: 'P2 · febrero', ini: '2099-01-19', fin: '2099-02-18', modelo: 'Prueba', aprobado_en: '2099-02-20', incentivo_pct: 21.4, pagado_pct: 17.12, retenido_pct: 4.28, alcances: [{ k: 'Comercios visitados', v: '150 / 160' }, { k: 'Reactivados', v: '38 / 40' }] }
];
const FX = (extra = {}) => Object.assign({
  sesion: { user: { email: EJECUTIVO.correo }, access_token: 'prueba' },
  tablas: { usuarios: EJECUTIVO, v2_periodos: { id: 'PRUEBA', ini: '2026-01-01', fin: '2099-12-31' } },
  rpc: { v2_mi_base: [comercio(1)], v2_mis_revisiones: [], v2_actividad: [], v2_avance: [], v2_visitas_de: [], v2_mis_seguimientos: [], v2_mis_reactivados_bbva: [], v2_mis_recuperos: [], v2_mis_cierres: CIERRES }
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

  await prueba(`${tema} · Mi avance tiene «Este periodo» y «Mis cierres»; los cierres se piden solo al abrirlos`, async () => {
    await p.evaluate(() => { S.vista = 'avance'; pintar(); }); await p.waitForTimeout(200);
    assert.equal(await p.locator('[data-av-tab]').count(), 2);
    assert.equal((await p.evaluate(() => window.__llamadas.filter(x => x[0] === 'v2_mis_cierres').length)), 0);
    await p.click('[data-av-tab="cierres"]'); await p.waitForTimeout(400);
    assert.deepEqual(await p.evaluate(() => window.__llamadas.filter(x => x[0] === 'v2_mis_cierres').map(x => x[1])), [{}], 'el ejecutivo pide los de otro');
  });

  await prueba(`${tema} · con el ojo cerrado no se ven los porcentajes; abierto sí, con la bolsa sumada`, async () => {
    let t = await texto();
    assert.match(t, /P2 · febrero/); assert.match(t, /150 \/ 160/); assert.match(t, /Mi bolsa retenida/);
    assert.ok(!/21,4|17,12|7,28/.test(t), 'el ojo cerrado deja ver el incentivo');
    await p.click('[data-ojo]'); await p.waitForTimeout(200);
    t = await texto();
    assert.match(t, /21,4 %/); assert.match(t, /17,12 % \/ 4,28 %/); assert.match(t, /7,28 %/, 'la bolsa no suma lo retenido');
    // el más reciente va primero
    assert.ok(t.indexOf('P2 · febrero') < t.indexOf('P1 · enero'));
    await p.click('[data-ojo]');
  });

  await prueba(`${tema} · sin cierres, o si la base falla, lo dice y deja reintentar`, async () => {
    await p.evaluate(() => { window.__FX.rpc.v2_mis_cierres = []; S.misCierres = undefined; pintar(); }); await p.waitForTimeout(300);
    assert.match(await texto(), /Todavía no tienes periodos cerrados/);
    await p.evaluate(() => { window.__FX.rpc.v2_mis_cierres = () => ({ __error: 'falla de prueba' }); S.misCierres = undefined; pintar(); }); await p.waitForTimeout(300);
    assert.match(await texto(), /No se pudieron leer tus cierres/);
    await p.evaluate(rows => { window.__FX.rpc.v2_mis_cierres = rows; }, CIERRES);
    await p.click('[data-reintentar-cierres]'); await p.waitForTimeout(300);
    assert.match(await texto(), /P1 · enero/);
    await p.click('[data-av-tab="periodo"]'); await p.waitForTimeout(200);
    assert.ok(!/Mi bolsa retenida/.test(await texto()));
  });
  if (errs.length) { fallas++; console.log(`MAL ${tema} · errores de consola:`, errs); }
  await b.close();
}
if (fallas) { console.log(`\n${fallas} prueba(s) fallaron`); process.exit(1); }
console.log('\nmis cierres del celular: todo bien');
