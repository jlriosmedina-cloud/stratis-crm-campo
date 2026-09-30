// Prueba del escritorio: carga sin errores, «Cómo fue la visita», señal «Revisar marcación»,
// visitas retenidas en el celular y la base para BBVA (hojas KPIs y Base). Datos inventados.
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
  // 29/09: habló con el encargado y quedaron en volver
  visita(1, { fecha_reagenda: hoy }),
  visita(2, { que: 'Reagendada', decision: null, fecha_reagenda: hoy, feedback: ['No se encontraba la persona que tomaba decisiones'], fb_acciones: ['Reagendé con quien decide'] }),
  visita(3, { que: 'Sin éxito', decision: null, feedback: ['No se encontraba la persona que tomaba decisiones'] }),
  visita(4, { con: 'Nadie', motivo: 'Cerrado', que: 'Sin éxito', decision: null, feedback: null }),
  visita(5, { con: 'Nadie', motivo: 'Dirección errada', que: 'Sin éxito', decision: null, feedback: null, direccion_ok: false, comercio_ubicado: false }),
  // contradicción a propósito: marcó Dueño pero el comentario dice que el dueño no estaba
  visita(6, { con: 'Dueño', comentario: 'El dueño no se encontraba, regresar más tarde' }),
  // 29/09: zona insegura cuenta como visita, pero lleva la señal «Revisar motivo»
  visita(7, { con: 'Nadie', motivo: 'Zona insegura', que: 'Sin éxito', decision: null, feedback: null, direccion_ok: null })
];
const FX = {
  sesion: { user: { email: ANALISTA.correo }, access_token: 'prueba' },
  tablas: { usuarios: [ANALISTA, EJECUTIVO], v2_periodos: { id: 'PRUEBA', ini: '2026-01-01', fin: '2099-12-31' }, v2_cargas: [], v2_bitacora_visita: [], v2_transacciones: [], v2_feedback_inferido: [] },
  rpc: { v2_puede_escritorio: true, v2_actividad: ACT, v2_mi_base: BASE, v2_avance: [{ meta_visitas: 160, meta_reactivados: 40, meta_conversion: 25 }],
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
await ctx.route(/cdn\.jsdelivr\.net\/npm\/pptxgenjs/, r => r.fulfill({ path: path.join(NM, 'pptxgenjs/dist/pptxgen.bundle.js'), contentType: 'application/javascript' }));
const p = await ctx.newPage(); const errs = [];
p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/net::|fonts|Failed to load resource|URL scheme "file" is not supported/.test(m.text())) errs.push(m.text()); });
await p.addInitScript(fx => { window.__FX = fx; }, FX);
await p.goto(urlDist('escritorio')); await p.waitForTimeout(1500);
const prueba = async (nombre, fn) => { try { await fn(); console.log('ok  ' + nombre); } catch (e) { fallas++; console.log(`MAL ${nombre}: ${e.message}`); } };

await prueba('lista con «Cómo fue la visita»', async () => {
  await p.evaluate(() => { S.vista = 'validacion'; S.dia = 'periodo'; S.filtro = 'todos'; pintar(); }); await p.waitForTimeout(400);
  const res = (await p.locator('td.res').allInnerTexts()).join(' | ');
  for (const t of ['Habló con el dueño o encargado', 'No estaba quien decide · quedó en volver', 'No estaba quien decide · sin compromiso', 'No se pudo hacer la visita', 'El comercio no está en esta dirección'])
    assert.ok(res.includes(t), 'falta: ' + t);
  assert.ok(res.includes('Cerrado hoy'), '«Cerrado» se lee «Cerrado hoy»');
  assert.ok(/Encargado · Aún no decide · vuelve el/.test(res), 'no muestra la fecha para volver con el encargado');
});
await prueba('señal «Revisar motivo» y porcentaje por ejecutivo de zona insegura u otro motivo', async () => {
  const s = await p.evaluate(() => S.act.filter(v => senales(v).some(x => /^Revisar motivo/.test(x[1]))).map(v => v.customer_id));
  assert.deepEqual(s, ['00000007']);
  await p.evaluate(() => { S.vista = 'validacion'; pintar(); }); await p.waitForTimeout(300);
  const t = await p.locator('.tile', { hasText: 'Zona insegura u otro motivo' }).innerText();
  assert.match(t, /14 %/, 'el porcentaje del ejecutivo no es 1 de 7: ' + t);
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
await prueba('base para BBVA: solo KPIs y Base, KPIs desde la hoja Base y sin notas', async () => {
  await p.evaluate(() => { S.vista = 'feedback'; pintar(); }); await p.waitForTimeout(400);
  const [d] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), p.click('[data-base-bbva]')]);
  const f = path.join(RAIZ, 'qa', 'salida_base_prueba.xlsx'); await d.saveAs(f);
  const z = await JSZip.loadAsync(fs.readFileSync(f));
  assert.equal(Object.keys(z.files).filter(n => /^xl\/pivotTables\//.test(n)).length, 0, 'quedaron tablas dinámicas');
  const ExcelJS = (await import('exceljs')).default, xw = new ExcelJS.Workbook(); await xw.xlsx.readFile(f);
  assert.deepEqual(xw.worksheets.map(w => w.name), ['KPIs', 'Base']);
  // tipificaciones del 29/09 al final de Base, sin correr las columnas de antes; después, Comercio_Cerro_Definitivamente y Ejecutivo
  const cb = xw.getWorksheet('Base').getRow(1).values.slice(1).map(String);
  const NUEVAS = ['Desconfía de la visita (duda que representemos a BBVA)', 'No pidió el POS', 'Solicitó cambio de equipo', 'Le falta una función'];
  assert.equal(cb.indexOf('Fuente_Motivos_Si') + 1, 49, 'Base: la última columna de antes se movió');
  assert.deepEqual(cb.slice(49), NUEVAS.concat('Comercio_Cerro_Definitivamente', 'Ejecutivo'));
  assert.equal(xw.getWorksheet('Base').getCell(2, cb.length).value, 'Prueba', 'Base: falta el ejecutivo asignado');
  const txt = (await Promise.all(Object.keys(z.files).filter(n => /^xl\/(sharedStrings|worksheets\/sheet\d+)\.xml$/.test(n)).map(n => z.file(n).async('string')))).join(' ');
  assert.ok(txt.includes('zona insegura u otro motivo'), 'falta «zona insegura» en «Sin contacto»');
  // KPIs: todas las fórmulas sobre la hoja Base, sin la fila 2 ni las notas al pie
  const k = xw.getWorksheet('KPIs'), celdas = [];
  k.eachRow(r => r.eachCell(c => celdas.push(c.value)));
  const formulas = celdas.filter(v => v && v.formula).map(v => v.formula);
  assert.ok(formulas.length > 40 && formulas.every(x => !/Visitas!|Feedback_Detalle!/.test(x)), 'hay KPIs que no salen de la hoja Base');
  assert.equal(k.getCell('A2').value, null, 'la fila 2 no está vacía');
  for (const t of ['Todo sale de la hoja Base', 'Éxito = el comercio declaró', 'Fuente del feedback', 'Reactivación en 0', 'llave: Customer_ID', 'la hoja Base no trae el ejecutivo'])
    assert.ok(!celdas.some(v => typeof v === 'string' && v.includes(t)), 'quedó la nota: ' + t);
  fs.unlinkSync(f);
});
await prueba('carga de resultados de BBVA: completa los ceros, rechaza lo que no está en la base y envía el corte', async () => {
  await p.evaluate(() => { window.__FX.rpc.v2_cargar_resultados_bbva = a => ({ carga_id: 7, corte: a.p_corte, leidas: a.p_filas.length, cargadas: a.p_filas.length, rechazadas: 0, reemplazo: false, reactivados: 2, con_contacto: 1, detalle: [] });
    S.vista = 'cargas'; S.carga = { tipo: 'resultados_bbva', archivo: null, filas: null, hecho: false, resultado: null }; pintar(); }); await p.waitForTimeout(300);
  await p.setInputFiles('#archivo', { name: 'bbva_prueba.csv', mimeType: 'text/csv', buffer: Buffer.from(['customer ID,Gestion_Con_Contacto,Reactivado,Facturado', '1,Si,Si,1500', '00000002,No,Si,', '12345678,Si,No,', '00000003,Sí,En proceso,'].join('\n')) });
  await p.waitForTimeout(400);
  assert.ok(await p.locator('text=customer_id no está en la base').count() > 0, 'no marca el ID que no está en la base');
  await p.fill('#bbvaCorte', hoy); await p.dispatchEvent('#bbvaCorte', 'change'); await p.waitForTimeout(200);
  const antes = await p.evaluate(() => window.__llamadas.length);
  await p.click('#cargar'); await p.waitForTimeout(500);
  const ll = (await p.evaluate(n => window.__llamadas.slice(n), antes)).find(x => x[0] === 'v2_cargar_resultados_bbva');
  assert.ok(ll, 'no llamó a v2_cargar_resultados_bbva');
  assert.equal(ll[1].p_corte, hoy);
  assert.deepEqual(ll[1].p_filas, [{ customer_id: '00000001', gestion_con_contacto: true, reactivado: 'Si', facturado: '1500' },
    { customer_id: '00000002', gestion_con_contacto: false, reactivado: 'Si', facturado: null }, { customer_id: '00000003', gestion_con_contacto: true, reactivado: 'En proceso', facturado: null }]);
  assert.ok(await p.locator('text=cargado: 3 comercios').count() > 0, 'no muestra el resultado de la carga');
});
await prueba('presentación para BBVA: 12 láminas con el corte elegido', async () => {
  p.once('dialog', d => d.accept(hoy.split('-').reverse().join('/')));
  const [d] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), p.click('[data-ppt-bbva]')]);
  assert.match(d.suggestedFilename(), new RegExp('^Mastercard_Campaña_BBVA_Adquirencia_' + hoy.replace(/-/g, '') + '\\.pptx$'));
  const f = path.join(RAIZ, 'qa', 'salida_presentacion_prueba.pptx'); await d.saveAs(f);
  const z = await JSZip.loadAsync(fs.readFileSync(f));
  const lams = Object.keys(z.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n));
  assert.equal(lams.length, 12, 'láminas: ' + lams.length);
  const txt = (await Promise.all(lams.map(n => z.file(n).async('string')))).join(' ');
  for (const t of ['Resumen ejecutivo', 'Avance por zona', 'Rutas y distritos abordados', 'Evolución semanal', 'Cobertura territorial', 'Reactivación confirmada por BBVA', 'La voz del comercio', 'Próximos pasos', 'pendientes de la data de BBVA'])
    assert.ok(txt.includes(t), 'falta en la presentación: ' + t);
  // lámina 3: las barras de nuevos por día suman los comercios visitados del título
  const tot = Number((txt.match(/(\d+) comercios visitados al/) || [])[1]);
  const graf = await Promise.all(Object.keys(z.files).filter(n => /^ppt\/charts\/chart\d+\.xml$/.test(n)).map(n => z.file(n).async('string')));
  const barras = graf.flatMap(x => x.split('<c:ser>')).find(x => x.includes('Nuevos del día'));
  assert.ok(barras, 'falta la serie de nuevos por día');
  const suma = [...barras.matchAll(/<c:val>[\s\S]*?<\/c:val>/g)].flatMap(m => [...m[0].matchAll(/<c:v>([\d.]+)<\/c:v>/g)].map(v => Number(v[1]))).reduce((a, b) => a + b, 0);
  assert.ok(tot > 0 && suma === tot, `las barras suman ${suma} y el título dice ${tot}`);
  fs.unlinkSync(f);
});
await prueba('presentación con un corte de BBVA de más de 1000 filas: cuenta solo lo reactivado, con contacto y con visita; sin notas en el archivo', async () => {
  await p.evaluate(h => { window.__FX.tablas.v2_cortes_bbva = [{ corte: h, filas: 3, facturado_total: null, en: h + 'T12:00:00Z' }];
    // 1: reactivado, con contacto y visitado → cuenta · 2: visitado sin contacto según BBVA · 6: con contacto pero reactivado «No»
    window.__FX.tablas.v2_resultados_bbva = [{ customer_id: '00000001', gestion_con_contacto: true, reactivado: 'Si', facturado: 1500 },
      { customer_id: '00000002', gestion_con_contacto: false, reactivado: 'Si', facturado: 900 }, { customer_id: '00000006', gestion_con_contacto: true, reactivado: 'No', facturado: null }];
    // 1000 filas inventadas fuera de la cartera antes de las 3 de prueba: las que cuentan solo llegan en la segunda página
    window.__FX.tablas.v2_resultados_bbva.unshift(...Array.from({ length: 1000 }, (_, i) => ({ customer_id: String(90000000 + i), gestion_con_contacto: false, reactivado: 'No', facturado: null }))); }, hoy);
  p.once('dialog', d => d.accept(hoy.split('-').reverse().join('/')));
  const [d] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), p.click('[data-ppt-bbva]')]);
  const f = path.join(RAIZ, 'qa', 'salida_presentacion_bbva.pptx'); await d.saveAs(f);
  const z = await JSZip.loadAsync(fs.readFileSync(f));
  const txt = (await Promise.all(Object.keys(z.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).map(n => z.file(n).async('string')))).join(' ');
  assert.ok(txt.includes('1 comercio reactivado cuenta para Stratis'), 'la regla de «cuenta» no da 1');
  assert.ok(txt.includes('S/ 1.500') || txt.includes('S/ 1,500') || txt.includes('S/ 2 mil'), 'no muestra el facturado de los que cuentan');
  assert.ok(!txt.includes('pendientes de la data de BBVA'), 'sigue diciendo pendiente con un corte cargado');
  const notas = Object.keys(z.files).filter(n => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n));
  const tn = (await Promise.all(notas.map(n => z.file(n).async('string')))).join(' ');
  assert.ok(!/Citas candidatas|Revisar las cifras|Texto base armado/.test(tn), 'el archivo lleva notas internas');
  fs.unlinkSync(f);
  await p.evaluate(() => { delete window.__FX.tablas.v2_cortes_bbva; delete window.__FX.tablas.v2_resultados_bbva; });
});
if (errs.length) { fallas++; console.log('MAL errores de consola:', errs); }
await b.close();
console.log(fallas ? `\n${fallas} prueba(s) fallaron` : '\nTodas las pruebas del escritorio pasaron');
process.exit(fallas ? 1 : 0);
