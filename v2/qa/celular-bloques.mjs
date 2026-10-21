// Prueba del celular con la base 2026-11 en bloques (ESPEC_nueva_estructura_2026-11, sección 2): Inicio por bloque,
// Mi base por potencial con los chips de ubicación, ficha con una sola dirección (la de BBVA), el ojo de privacidad
// y la vista «como» del escritorio (solo lectura). Datos inventados.
// Uso: node v2/qa/celular-bloques.mjs   (antes: python v2/build.py)
import { navegador, urlDist, EJECUTIVO, comercio, hoyLima } from './comun.mjs';
import assert from 'node:assert/strict';

const dia = n => new Date(Date.now() + n * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
const nuevo = (i, extra) => comercio(i, Object.assign({ origen: 'base_nueva', bloque: 1, bloque_ini: dia(-3), bloque_fin: dia(10), grupo_ubicacion: 1,
  potencial: 0, vinculacion: 'Vinculado', vol_092026: 1200, tipo_equipo: 'POS inalámbrico', contacto_celular: '987654321', contacto_correo: 'ana.prueba@ejemplo.com',
  geo_nota: 'Nota de ubicación de prueba' }, extra));
const BASE = [
  nuevo(1, { potencial: 15000 }), nuevo(2, { potencial: 90000, grupo_ubicacion: 2 }), nuevo(3, { potencial: 40000, grupo_ubicacion: 3 }),
  nuevo(4, { potencial: 0, grupo_ubicacion: 3 }), nuevo(5, { potencial: 70000 }), nuevo(6, { potencial: 20000 }), nuevo(7, { potencial: 5000, grupo_ubicacion: 2 }),
  // visitado del bloque: no entra a «Los 5» ni a «Por visitar»
  nuevo(8, { potencial: 99000, visitas: 1, visitas_validas: 1, estado: 'rea', ultima_visita: '2026-01-02T15:00:00Z', ultima_que: 'Reunión concretada' }),
  // base anterior: uno con contacto y otro cerrado (sin contacto)
  comercio(9, { origen: 'base_anterior', visitas: 1, visitas_validas: 1, estado: 'seg', ultima_visita: '2026-01-02T15:00:00Z', ultima_que: 'Reunión concretada' }),
  comercio(10, { origen: 'base_anterior', visitas: 1, visitas_validas: 1, estado: 'vis', ultima_visita: '2026-01-02T15:00:00Z', ultima_que: 'Sin éxito', ultima_motivo: 'Cerrado' })
];
const FX = (extra = {}) => Object.assign({
  sesion: { user: { email: EJECUTIVO.correo }, access_token: 'prueba' },
  tablas: { usuarios: EJECUTIVO, v2_periodos: { id: 'PRUEBA', ini: '2026-01-01', fin: '2099-12-31' } },
  rpc: { v2_mi_base: BASE, v2_mis_revisiones: [], v2_actividad: [], v2_avance: [], v2_visitas_de: [], v2_mis_seguimientos: [], v2_mis_reactivados_bbva: [{ customer_id: '00000009', dias_trx: 2, con_contacto: true, ultima_visita_id: 'v9' }], v2_mis_recuperos: [] }
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

  await prueba(`${tema} · Inicio por bloque: días, KPI sobre 225, los 5 de mayor potencial, base anterior y antes de salir`, async () => {
    const t = await texto();
    assert.match(t, /Bloque 1 de 2 · quedan 1[01] días del bloque/);
    assert.match(t, /1\s*\/8/, 'visitados del bloque');
    assert.match(t, /1\s*\/225/, 'visitados del periodo sobre 225');
    assert.match(t, /\+2 base anterior/, 'no muestra aparte las visitas de la base anterior');
    assert.equal(await p.evaluate(() => metricas().reactivados), 1, 'reactivados que cuentan: lista de BBVA + 2 días (incluye base anterior; no el que solo tiene 2 días)');
    assert.ok(!/Base compartida|libres/i.test(t), 'sigue la base compartida');
    const cinco = await p.$$eval('.card', cs => [...cs.find(c => c.textContent.includes('Los 5 de mayor potencial')).querySelectorAll('[data-ficha]')].map(x => x.dataset.ficha));
    assert.deepEqual(cinco, ['00000002', '00000005', '00000003', '00000006', '00000001'], 'orden por potencial, sin el visitado ni el que no tiene potencial');
    assert.match(t, /2 comercios que visitaste antes de la base nueva/);
    assert.match(t, /1 fue con contacto/);
    assert.match(t, /2 comercios para confirmar por teléfono/, 'antes de salir: los del grupo 3 por visitar');
    const g = await p.$$eval('.grp3 b', bs => bs.map(x => x.textContent));
    assert.deepEqual(g, ['4', '2', '2'], 'resumen 🟢🟡🔴 del bloque');
  });

  await prueba(`${tema} · ojo de privacidad: cerrado al entrar, oculta montos y se abre con un toque`, async () => {
    let t = await texto();
    assert.ok(/S\/\s••••/.test(t), 'no oculta el potencial');
    assert.ok(!/S\/\s90/.test(t), 'muestra un monto con el ojo cerrado');
    await p.click('.bloque-card [data-ojo]'); await p.waitForTimeout(150);
    t = await texto();
    assert.ok(/S\/\s90/.test(t), 'no muestra el monto con el ojo abierto');
    await p.click('.bloque-card [data-ojo]'); await p.waitForTimeout(150);
    assert.ok(!/S\/\s90/.test(await texto()), 'no se vuelve a cerrar');
  });

  await prueba(`${tema} · Mi base: por potencial, chips de ubicación y sin «Falta reactivar» mientras no haga falta`, async () => {
    await p.evaluate(() => { S.vista = 'base'; S.filtroVisita = 'todos'; pintar(); }); await p.waitForTimeout(150);
    const chips = await p.$$eval('.barra-filtros .chips .chip', cs => cs.map(c => c.textContent.replace(/\s+\d+$/, '').trim()));
    assert.deepEqual(chips, ['Por visitar', 'Al 100 %', 'Cercanos', 'Llamar antes', 'Falta reactivar', 'Reactivados', 'Todos']);
    const ids = await p.$$eval('.lista [data-ficha]', xs => xs.map(x => x.dataset.ficha));
    assert.deepEqual(ids.slice(0, 3), ['00000008', '00000002', '00000005'], 'no va ordenada por potencial');
    await p.click('[data-visita=g3]'); await p.waitForTimeout(150);
    assert.deepEqual(await p.$$eval('.lista [data-ficha]', xs => xs.map(x => x.dataset.ficha)), ['00000003', '00000004']);
  });

  await prueba(`${tema} · ficha: una sola dirección (la de BBVA), potencial y contacto enmascarados`, async () => {
    await p.evaluate(() => { S.ficha = '00000003'; pintar(); }); await p.waitForTimeout(250);
    let t = await texto();
    assert.ok(t.includes('Dirección de BBVA') && t.includes('AV. INVENTADA 103'));
    assert.ok(!/SUNAT|Otras direcciones|Segunda dirección|Libre/.test(t), 'siguen las tarjetas que salen');
    assert.ok(t.includes('Llama antes de ir') && t.includes('Nota de ubicación de prueba'));
    assert.equal(await p.locator('.dir-card a[href*="waze.com"]').count(), 1, 'falta Waze');
    assert.ok(t.includes('••••••321') && t.includes('a•••@ejemplo.com'), 'no enmascara el contacto');
    assert.ok(!t.includes('987654321') && !t.includes('ana.prueba@'), 'muestra el contacto con el ojo cerrado');
    await p.click('.card [data-ojo] >> nth=0'); await p.waitForTimeout(150);
    t = await texto();
    assert.ok(t.includes('987654321') && t.includes('ana.prueba@ejemplo.com') && /S\/\s40/.test(t), 'no se ve con el ojo abierto');
    await p.evaluate(() => { S.ver = false; S.ficha = null; S.vista = 'inicio'; pintar(); });
  });

  await prueba(`${tema} · avance: bloque 1, bloque 2 próximo, periodo de 225 y base anterior`, async () => {
    await p.evaluate(() => { S.vista = 'avance'; pintar(); }); await p.waitForTimeout(300);
    const t = await texto();
    assert.match(t, /Bloque 1 · /); assert.match(t, /Bloque 2 · próximo/); assert.match(t, /217 comercios nuevos llegan/);
    assert.match(t, /Comercios visitados\s*1 \/ 225/); assert.match(t, /2 visitados · 1 con contacto/);
    await p.evaluate(() => { S.vista = 'inicio'; pintar(); });
  });
  await prueba(`${tema} · ruta de hoy: los opcionales no la traban y la 98 y la 99 nunca salen`, async () => {
    const r = await p.evaluate(() => {
      const orig = S.base, hoy = () => { const c = [...document.querySelectorAll('.ruta-hoy')].find(x => x.textContent.includes('Tu ruta de hoy')); return c ? c.querySelector('h2').textContent : null; };
      const mk = (id, ruta, orden, vis) => Object.assign({}, orig[0], { customer_id: id, ruta, orden, visitas: vis ? 1 : 0, visitas_validas: vis ? 1 : 0, estado: vis ? 'vis' : 'por',
        ultima_visita: vis ? '2026-01-03T15:00:00Z' : null, ultima_que: vis ? 'Reunión concretada' : null, ultima_motivo: null });
      const ruta = (n, pend) => { const l = []; for (let o = 1; o <= 10; o++) l.push(mk('R1' + o, 'Ruta 01', o, !pend(o))); for (let o = 1; o <= 3; o++) l.push(mk('R2' + o, 'Ruta 02', o, n === 'todo'));
        l.push(mk('R98', 'Ruta 98 · Base anterior · ya visitados', 1, false), mk('R99', 'Ruta 99 · Por ubicar · llamar antes', 1, false)); return l; };
      const out = {};
      S.base = ruta('', o => o > 8); S.vista = 'inicio'; pintar(); out.a = hoy();                       // del día hecho, quedan opcionales
      S.base = ruta('todo', () => false); pintar(); out.b = hoy();                                    // solo quedan la 98 y la 99
      S.base = ruta('', () => true); pintar(); out.c = hoy(); out.opc = document.querySelectorAll('.ruta-hoy .parada.opcional').length;
      S.base = orig; pintar(); return out;
    });
    assert.equal(r.a, 'Ruta 02', 'los opcionales traban la ruta');
    assert.ok(r.b && !/98|99/.test(r.b), 'propone la 98 o la 99: ' + r.b);
    assert.equal(r.c, 'Ruta 01'); assert.equal(r.opc, 2, 'no marca los opcionales');
  });
  if (errs.length) { fallas++; console.log(`MAL ${tema} · errores de consola:`, errs); }
  await b.close();
}

// Vista «como» del escritorio: solo para Jose, filtra al ejecutivo, oculta la salida sin visita y no escribe nada
{
  const JOSE = { correo: 'jose.prueba@ejemplo.com', nombre: 'Jose Prueba', nombre_corto: 'Jose', rol: 'Analista', activo: true };
  const base = BASE.concat([comercio(30, { origen: 'base_nueva', bloque: 1, correo: 'otro.prueba@ejemplo.com' }), comercio(31, { origen: 'salida' }),
    comercio(32, { origen: 'salida', visitas: 1, visitas_validas: 1, estado: 'vis', ultima_visita: '2026-01-02T15:00:00Z', ultima_que: 'Reunión concretada' })]);
  for (const [nombre, usuario, debeFiltrar] of [['Jose', JOSE, true], ['un ejecutivo', EJECUTIVO, false]]) {
    const { b, ctx } = await navegador({});
    const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    const cola = [{ p_customer_id: '00000001', p_cliente_uid: 'uid-cola-jose', p_visitado_en: new Date().toISOString(), p_con: 'Nadie', p_motivo: 'Cerrado' }];
    await p.addInitScript(([fx, cola]) => { window.__FX = fx; localStorage.setItem('stratis-v2-cola', JSON.stringify(cola)); },
      [FX({ sesion: { user: { email: usuario.correo }, access_token: 'prueba' }, tablas: { usuarios: usuario, v2_periodos: { id: 'PRUEBA', ini: '2026-01-01', fin: '2099-12-31' } },
           rpc: Object.assign(FX().rpc, { v2_mi_base: base }) }), cola]);
    await p.goto(urlDist('celular') + '?como=' + encodeURIComponent(EJECUTIVO.correo)); await p.waitForTimeout(1200);
    await prueba(`como · ${nombre}: ${debeFiltrar ? 've el celular del ejecutivo en solo lectura' : 'el parámetro no hace nada'}`, async () => {
      const ids = await p.evaluate(() => S.base.map(c => c.customer_id));
      if (debeFiltrar) {
        assert.ok(!ids.includes('00000030') && !ids.includes('00000031') && ids.includes('00000032'), 'no filtra al ejecutivo o a la salida');
        assert.ok((await p.textContent('#pantalla')).includes('Vista de Jose · celular de'));
        assert.equal(await p.locator('[data-registrar]').count(), 0, 'deja registrar');
        await p.evaluate(() => { S.ficha = '00000001'; pintar(); }); await p.waitForTimeout(200);
        assert.equal(await p.locator('[data-registrar], [data-editar]').count(), 0, 'la ficha deja escribir');
        assert.ok(!(await p.evaluate(() => window.__llamadas.some(x => x[0] === 'v2_registrar_visita'))), 'envió la cola');
        const r = await p.evaluate(() => sb.rpc('v2_registrar_visita', {}));
        assert.ok(r.error && /no se guardan/.test(r.error.message), 'deja escribir por rpc');
        assert.deepEqual((await p.evaluate(() => JSON.parse(localStorage.getItem('stratis-v2-cola')))).map(v => v.p_cliente_uid), ['uid-cola-jose'], 'tocó la cola guardada');
      } else {
        assert.equal(await p.evaluate(() => S.como), null);
        assert.ok(!(await p.textContent('#pantalla')).includes('Vista de Jose'));
      }
    });
    if (errs.length) { fallas++; console.log(`MAL como · ${nombre} · errores:`, errs); }
    await b.close();
  }
}
console.log(fallas ? `\n${fallas} prueba(s) fallaron` : '\nTodas las pruebas del celular con bloques pasaron');
process.exit(fallas ? 1 : 0);
