// Prueba del escritorio: carga sin errores, «Cómo fue la visita», señal «Revisar marcación»,
// visitas retenidas en el celular y la base para BBVA con sus 4 tablas dinámicas. Datos inventados.
// Uso: node v2/qa/escritorio.mjs   (antes: python v2/build.py y npm install en v2/qa)
import { navegador, RAIZ, urlDist, EJECUTIVO, comercio, hoyLima } from './comun.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';

const NM = path.join(RAIZ, 'qa', 'node_modules');
const ANALISTA = { correo: 'analista.prueba@ejemplo.com', nombre: 'Analista Prueba', nombre_corto: 'Analista', rol: 'Analista', activo: true };
const BASE = [1, 2, 3, 4, 5, 6].map(i => comercio(i));
const hoy = hoyLima();
const visita = (i, extra) => Object.assign({
  id: `00000000-0000-0000-0000-00000000000${i}`, periodo: 'PRUEBA', customer_id: String(i).padStart(8, '0'), comercio: `Comercio Prueba ${i}`, razon_social: `COMERCIO DE PRUEBA ${i} SAC`,
  distrito: 'SAN ISIDRO', correo: EJECUTIVO.correo, visitado_en: `${hoy}T15:0${i}:00Z`, recibido_en: `${hoy}T15:0${i}:30Z`, lat: -12.0931, lng: -77.0465, precision_m: 10, distancia_m: 20,
  con: 'Tercero', motivo: null, que: 'Reunión concretada', decision: 'Aún no decide', equipo: null, fecha_reagenda: null, comentario: 'Comentario de prueba suficientemente largo',
  estado_anul: 'activa', validacion: 'validada', validacion_por: 'automática', fuera_plazo: false, plazo_hasta: hoy, direccion_ok: true, comercio_ubicado: null,
  feedback: ['Sin observaciones del comercio'], fb_acciones: null, fb_extra: null, feedback_nota: null, motivos_si: null
}, extra);
const ACT = [
  visita(1),
  visita(2, { que: 'Reagendada', decision: null, fecha_reagenda: hoy, feedback: ['No se encontraba la persona que tomaba decisiones'], fb_acciones: ['Reagendé con quien decide'] }),
  visita(3, { que: 'Sin éxito', decision: null, feedback: ['No se encontraba la persona que tomaba decisiones'] }),
  visita(4, { con: 'Nadie', motivo: 'Cerrado', que: 'Sin éxito', decision: null, feedback: null }),
  visita(5, { con: 'Nadie', motivo: 'Dirección errada', que: 'Sin éxito', decision: null, feedback: null, direccion_ok: false, comercio_ubicado: false }),
  // contradicción a propósito: marcó Dueño pero el comentario dice que el dueño no estaba
  visita(6, { con: 'Dueño', comentario: 'El dueño no se encontraba, regresar más tarde' })
];
const FX = {
  sesion: { user: { email: ANALISTA.correo }, access_token: 'prueba' },
  tablas: { usuarios: [ANALISTA, EJECUTIVO], v2_periodos: { id: 'PRUEBA', ini: '2026-01-01', fin: '2099-12-31' }, v2_cargas: [], v2_bitacora_visita: [], v2_transacciones: [], v2_feedback_inferido: [] },
  rpc: { v2_puede_escritorio: true, v2_actividad: ACT, v2_mi_base: BASE, v2_avance: [],
         v2_retenidas: [{ cliente_uid: 'uid-retenida-prueba', correo: EJECUTIVO.correo, ejecutivo: EJECUTIVO.nombre_corto, customer_id: '00000007', comercio: 'Comercio Prueba 7',
           visitado_en: `${hoy}T15:30:00Z`, mensaje: 'El periodo cerró el 30/09: ya no se reciben visitas de ese periodo.', intentos: 2, payload: { p_con: 'Nadie', p_motivo: 'Cerrado' } }],
         v2_descartar_retenida: null }
};

let fallas = 0;
const { b, ctx } = await navegador({ viewport: { width: 1366, height: 800 } });
await ctx.route(/cdnjs\.cloudflare\.com\/.*leaflet.*\.js$/, r => r.fulfill({ path: path.join(NM, 'leaflet/dist/leaflet.js'), contentType: 'application/javascript' }));
await ctx.route(/cdnjs\.cloudflare\.com\/.*leaflet.*\.css$/, r => r.fulfill({ path: path.join(NM, 'leaflet/dist/leaflet.css'), contentType: 'text/css' }));
await ctx.route(/cdnjs\.cloudflare\.com\/.*xlsx/, r => r.fulfill({ body: '', contentType: 'application/javascript' }));
await ctx.route(/cdn\.jsdelivr\.net\/npm\/exceljs/, r => r.fulfill({ path: path.join(NM, 'exceljs/dist/exceljs.min.js'), contentType: 'application/javascript' }));
await ctx.route(/cdn\.jsdelivr\.net\/npm\/jszip/, r => r.fulfill({ path: path.join(NM, 'jszip/dist/jszip.min.js'), contentType: 'application/javascript' }));
const p = await ctx.newPage(); const errs = [];
p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/net::|fonts|Failed to load resource/.test(m.text())) errs.push(m.text()); });
await p.addInitScript(fx => { window.__FX = fx; }, FX);
await p.goto(urlDist('escritorio')); await p.waitForTimeout(1500);
const prueba = async (nombre, fn) => { try { await fn(); console.log('ok  ' + nombre); } catch (e) { fallas++; console.log(`MAL ${nombre}: ${e.message}`); } };

await prueba('lista con «Cómo fue la visita»', async () => {
  await p.evaluate(() => { S.vista = 'validacion'; S.dia = 'periodo'; S.filtro = 'todos'; pintar(); }); await p.waitForTimeout(400);
  const res = (await p.locator('td.res').allInnerTexts()).join(' | ');
  for (const t of ['Habló con el dueño o encargado', 'No estaba quien decide · quedó en volver', 'No estaba quien decide · sin compromiso', 'No hubo contacto', 'El comercio no está en esta dirección'])
    assert.ok(res.includes(t), 'falta: ' + t);
});
await prueba('señal «Revisar marcación» solo en la visita contradictoria', async () => {
  const n = await p.evaluate(() => S.act.filter(v => revisarMarcacion(v)).map(v => v.customer_id));
  assert.deepEqual(n, ['00000006']);
});
await prueba('visitas retenidas: se ven con el mensaje y Jose las descarta', async () => {
  await p.evaluate(() => { S.vista = 'validacion'; pintar(); }); await p.waitForTimeout(300);
  assert.ok(await p.locator('text=Una visita retenida').count() > 0, 'no aparece el panel');
  assert.ok(await p.locator('text=El periodo cerró el 30/09').count() > 0, 'no aparece el mensaje del servidor');
  if (process.env.CAPTURAS) await p.screenshot({ path: `${process.env.CAPTURAS}/escritorio-retenidas.png` });
  p.once('dialog', d => d.accept('Periodo cerrado, no se recupera'));
  const antes = await p.evaluate(() => window.__llamadas.length);
  await p.evaluate(() => { window.__FX.rpc.v2_retenidas = []; });
  await p.click('[data-descartar-ret="uid-retenida-prueba"]'); await p.waitForTimeout(500);
  const d = (await p.evaluate(n => window.__llamadas.slice(n), antes)).find(x => x[0] === 'v2_descartar_retenida');
  assert.ok(d, 'no llamó a v2_descartar_retenida');
  assert.deepEqual(d[1], { p_cliente_uid: 'uid-retenida-prueba', p_nota: 'Periodo cerrado, no se recupera' });
  assert.equal(await p.locator('text=Una visita retenida').count(), 0, 'el panel no se actualizó');
});
await prueba('base para BBVA con 4 tablas dinámicas', async () => {
  await p.evaluate(() => { S.vista = 'feedback'; pintar(); }); await p.waitForTimeout(400);
  const [d] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), p.click('[data-base-bbva]')]);
  const f = path.join(RAIZ, 'qa', 'salida_base_prueba.xlsx'); await d.saveAs(f);
  const z = await JSZip.loadAsync(fs.readFileSync(f));
  const piv = Object.keys(z.files).filter(n => /^xl\/pivotTables\/pivotTable\d+\.xml$/.test(n));
  assert.equal(piv.length, 4, 'tablas dinámicas: ' + piv.length);
  const wb = await z.file('xl/workbook.xml').async('string');
  for (const h of ['KPIs', 'Base', 'Visitas', 'Feedback_Detalle', 'Diccionario']) assert.ok(wb.includes(`name="${h}"`), 'falta hoja ' + h);
  fs.unlinkSync(f);
});
if (errs.length) { fallas++; console.log('MAL errores de consola:', errs); }
await b.close();
console.log(fallas ? `\n${fallas} prueba(s) fallaron` : '\nTodas las pruebas del escritorio pasaron');
process.exit(fallas ? 1 : 0);
