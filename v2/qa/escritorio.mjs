// Prueba del escritorio: carga sin errores, «Cómo fue la visita», señal «Revisar marcación»,
// visitas retenidas en el celular y la base para BBVA (modelo de 55 columnas: Resumen y Base). Datos inventados.
// Uso: node v2/qa/escritorio.mjs   (antes: python v2/build.py y npm install en v2/qa)
import { navegador, RAIZ, urlDist, EJECUTIVO, comercio, hoyLima } from './comun.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';

const NM = path.join(RAIZ, 'qa', 'node_modules');
const ANALISTA = { correo: 'analista.prueba@ejemplo.com', nombre: 'Analista Prueba', nombre_corto: 'Analista', rol: 'Analista', activo: true };
const BASE = [1, 2, 3, 4, 5, 6].map(i => comercio(i, i === 1 ? { documento: '00999001' } : i === 2 ? { ruc: '20999000002' } : {}));
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
await ctx.route(/cdnjs\.cloudflare\.com\/.*jspdf/, r => r.fulfill({ path: path.join(NM, 'jspdf/dist/jspdf.umd.min.js'), contentType: 'application/javascript' }));
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
await prueba('identificador visible: documento de BBVA si lo tiene, Customer ID si no; Trazabilidad busca por documento', async () => {
  await p.evaluate(() => { S.vista = 'validacion'; S.dia = 'periodo'; S.filtro = 'todos'; pintar(); }); await p.waitForTimeout(300);
  const t = (await p.locator('td.com small').allInnerTexts()).join(' | ');
  assert.ok(t.includes('Doc. BBVA 00999001') && t.includes('Customer ID 00000002'), 'tabla de visitas: ' + t);
  await p.evaluate(() => { S.vista = 'auditoria'; S.tab = 'traza'; S.busca = '00999001'; S.traza = null; pintar(); }); await p.waitForTimeout(300);
  const l = await p.locator('.lista button').allInnerTexts();
  assert.equal(l.length, 1, 'la búsqueda por documento no encontró una sola visita'); assert.ok(l[0].includes('Comercio Prueba 1'));
  await p.evaluate(() => { S.busca = ''; S.vista = 'validacion'; pintar(); });
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
await prueba('base para BBVA: modelo Gestión Stratis de 55 columnas (Resumen y Base), Documento como llave', async () => {
  await p.evaluate(() => { S.vista = 'feedback'; pintar(); }); await p.waitForTimeout(400);
  const [d] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), p.click('[data-base-bbva]')]);
  const f = path.join(RAIZ, 'qa', 'salida_base_prueba.xlsx'); await d.saveAs(f);
  const ExcelJS = (await import('exceljs')).default, xw = new ExcelJS.Workbook(); await xw.xlsx.readFile(f);
  assert.deepEqual(xw.worksheets.map(w => w.name), ['Resumen', 'Base']);
  const b = xw.getWorksheet('Base'), cb = b.getRow(1).values.slice(1).map(String);
  // 26/10: las 55 columnas del modelo de Jose, en su orden (Gestion_Stratis_visitados_base_nueva_corte_23-10-2026.xlsx)
  assert.equal(cb.length, 57, 'Base debe tener las 55 columnas del modelo más las 2 de fuente');
  assert.deepEqual(cb.slice(0, 10), ['Documento','Customer_ID','Nombre_Comercial','Razon_Social','Distrito','Periodo','Bloque','Origen','Ejecutivo','Grupo_Ubicacion']);
  assert.deepEqual(cb.slice(50, 55), ['Reactivado_BBVA','Dias_Con_Trx_Post_Visita','Cuenta_Para_Comision','Validacion','Fuera_De_Plazo']);
  // la fuente del feedback va después de la columna 55 (Jose, 26/10)
  assert.deepEqual(cb.slice(55), ['Fuente_Feedback','Fuente_Que_Lo_Convencio']);
  assert.equal(cb[26], 'Resultado', 'Resultado debe ir en la columna AA'); assert.equal(cb[40], 'Numero_Ticket', 'Numero_Ticket debe ir en la columna AO');
  assert.equal(b.getColumn(1).numFmt, '@', 'Documento debe ir como texto'); assert.equal(b.getColumn(2).numFmt, '@', 'Customer_ID debe ir como texto');
  const v = (fila, col) => b.getCell(fila, cb.indexOf(col) + 1).value;
  assert.equal(v(2, 'Documento'), '00999001', 'Documento con su cero a la izquierda');
  assert.equal(v(3, 'Documento'), '20999000002', 'sin documento, debe ir el RUC');
  assert.equal(v(4, 'Documento') || '', '', 'sin documento ni RUC, la celda queda vacía');
  assert.equal(v(2, 'Customer_ID'), '00000001');
  assert.equal(v(2, 'Como_Fue_La_Visita'), 'Hablé con el dueño o el encargado');
  assert.equal(v(3, 'Como_Fue_La_Visita'), 'No estaba quien decide · quedamos en volver');
  assert.equal(v(5, 'Como_Fue_La_Visita'), 'No se pudo hacer la visita'); assert.equal(v(5, 'Motivo_Sin_Visita'), 'Cerrado hoy');
  assert.equal(v(6, 'Como_Fue_La_Visita'), 'El comercio no está en esta dirección'); assert.equal(v(6, 'Direccion_Correcta'), 'NO');
  assert.equal(v(3, 'Rama_Feedback'), 'Decisión y necesidad'); assert.equal(v(3, 'Fuente_Feedback'), 'Ejecutivo'); assert.equal(v(3, 'Que_Ofrecio'), 'Reagendé con quien decide');
  assert.ok(v(3, 'Fecha_Volver') instanceof Date, 'Fecha_Volver debe ser fecha');
  // Las que el celular todavía no captura van vacías y con cabecera naranja
  for (const h of ['Nombre_Cargo_Contacto','Sentir_Del_Cliente','Punto_De_Dolor_Principal','Numero_Ticket','Proxima_Accion']){
    assert.equal(v(2, h) || '', '', h + ' debe ir vacía');
    assert.equal(b.getCell(1, cb.indexOf(h) + 1).fill.fgColor.argb, 'FFF86F35', h + ' debe ir en naranja'); }
  assert.equal(b.getCell(1, 1).fill.fgColor.argb, 'FF0C1137');
  // Sin corte de BBVA en el periodo no se afirma «NO»
  assert.equal(v(2, 'Reactivado_BBVA'), 'Sin dato en el corte'); assert.equal(v(2, 'Cuenta_Para_Comision'), 'Sin dato en el corte');
  // Resumen: fórmulas sobre la hoja Base, por ejecutivo
  const r = xw.getWorksheet('Resumen'), formulas = [];
  r.eachRow(row => row.eachCell(c => { if (c.value && c.value.formula) formulas.push(c.value.formula); }));
  assert.ok(formulas.length >= 9 && formulas.every(x => /Base!|SUM\(/.test(x)), 'el Resumen debe salir de la hoja Base');
  assert.ok(formulas.some(x => /COUNTIFS\(Base!\$I\$2:\$I\$\d+,\$A5,Base!\$K\$2:\$K\$\d+,"SI"\)/.test(x)), 'falta Comercios visitados por ejecutivo (columnas I y K)');
  fs.unlinkSync(f);
});
await prueba('base para BBVA: solo la base nueva, y con corte de BBVA en el periodo dice SI o NO', async () => {
  // Periodo con bloques: 1-3 base nueva, 4 base anterior, 5 salida. Corte de BBVA dentro del periodo; el 1 reactivado con 2 días de trx.
  await p.evaluate(() => { const fx = window.__FX; fx._base = fx.rpc.v2_mi_base;
    fx.rpc.v2_mi_base = fx._base.slice(0, 5).map((c, i) => Object.assign({}, c, { origen: i < 3 ? 'base_nueva' : i === 3 ? 'base_anterior' : 'salida', bloque: 1, visitas: 1 },
      i === 0 ? { bbva_reactivado: '2026-02-01', dias_trx: 2 } : {}));
    fx.tablas.v2_resultados_bbva = [{ corte: '2026-02-01' }]; S.vista = 'feedback'; pintar(); }); await p.waitForTimeout(400);
  const [d] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), p.click('[data-base-bbva]')]);
  const f = path.join(RAIZ, 'qa', 'salida_base_prueba_bloques.xlsx'); await d.saveAs(f);
  const ExcelJS = (await import('exceljs')).default, xw = new ExcelJS.Workbook(); await xw.xlsx.readFile(f);
  const b = xw.getWorksheet('Base'), cb = b.getRow(1).values.slice(1).map(String), v = (fila, col) => b.getCell(fila, cb.indexOf(col) + 1).value;
  const cids = []; for (let r = 2; r <= b.rowCount; r++) cids.push(v(r, 'Customer_ID'));
  assert.deepEqual(cids, ['00000001', '00000002', '00000003'], 'solo deben ir los de la base nueva');
  assert.equal(v(2, 'Origen'), 'Base nueva');
  assert.equal(v(2, 'Reactivado_BBVA'), 'SI'); assert.equal(v(2, 'Cuenta_Para_Comision'), 'SI');
  assert.equal(v(3, 'Reactivado_BBVA'), 'NO'); assert.equal(v(3, 'Cuenta_Para_Comision'), 'NO');
  fs.unlinkSync(f);
  await p.evaluate(() => { const fx = window.__FX; fx.rpc.v2_mi_base = fx._base; delete fx.tablas.v2_resultados_bbva; });
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
  assert.deepEqual(ll[1].p_filas, [{ documento: '00000001', customer_id: '00000001', gestion_con_contacto: true, reactivado: 'Si', facturado: '1500' },
    { documento: '00000002', customer_id: '00000002', gestion_con_contacto: false, reactivado: 'Si', facturado: null }, { documento: '00000003', customer_id: '00000003', gestion_con_contacto: true, reactivado: 'En proceso', facturado: null }]);
  assert.ok(await p.locator('text=cargado: 3 comercios').count() > 0, 'no muestra el resultado de la carga');
});
await prueba('presentación para BBVA: 10 láminas con el corte elegido, sin mapa ni rutas', async () => {
  p.once('dialog', d => d.accept(hoy.split('-').reverse().join('/')));
  const [d] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), p.click('[data-ppt-bbva]')]);
  assert.match(d.suggestedFilename(), new RegExp('^Mastercard_Campaña_BBVA_Adquirencia_' + hoy.replace(/-/g, '') + '\\.pptx$'));
  const f = path.join(RAIZ, 'qa', 'salida_presentacion_prueba.pptx'); await d.saveAs(f);
  const z = await JSZip.loadAsync(fs.readFileSync(f));
  const lams = Object.keys(z.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n));
  assert.equal(lams.length, 10, 'láminas: ' + lams.length);
  const txt = (await Promise.all(lams.map(n => z.file(n).async('string')))).join(' ');
  for (const t of ['Resumen ejecutivo', 'Avance por zona', 'Evolución semanal', 'Reactivación confirmada por BBVA', 'La voz del comercio', 'Próximos pasos', 'pendientes de confirmación de BBVA'])
    assert.ok(txt.includes(t), 'falta en la presentación: ' + t);
  for (const t of ['Rutas y distritos abordados', 'Cobertura territorial', 'realizarán consumos']) assert.ok(!txt.includes(t), 'no debería ir en el reporte: ' + t);
  assert.ok(!/CRM/.test(txt), 'la presentación dice «CRM»');
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
  assert.ok(!txt.includes('pendientes de confirmación de BBVA'), 'sigue diciendo pendiente con un corte cargado');
  const notas = Object.keys(z.files).filter(n => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n));
  const tn = (await Promise.all(notas.map(n => z.file(n).async('string')))).join(' ');
  assert.ok(!/Citas candidatas|Revisar las cifras|Texto base armado/.test(tn), 'el archivo lleva notas internas');
  fs.unlinkSync(f);
  await p.evaluate(() => { delete window.__FX.tablas.v2_cortes_bbva; delete window.__FX.tablas.v2_resultados_bbva; });
});
await prueba('totales de BBVA: se tipean con puntos de miles, el CRM pone los grupos y se controla la coherencia', async () => {
  await p.evaluate(h => { window.__FX.rpc.v2_guardar_totales_bbva = a => ({ carga_id: 9, corte: a.p_corte, reemplazo: false });
    S.vista = 'cargas'; S.totBBVA = []; S.carga = { tipo: 'totales_bbva', archivo: null, filas: null, hecho: false, resultado: null, tot: { corte: h, v: {}, notas: '' } }; pintar(); }, hoy); await p.waitForTimeout(300);
  const V = { cc_reac: '2', cc_fac: '1.500,50', cc_trx: '30', sc_reac: '5', sc_fac: '800', sc_trx: '10', nv_reac: '0', nv_fac: '0', nv_trx: '0' };
  for (const [k, v] of Object.entries(V)) await p.fill(`[data-tot="${k}"]`, v);
  // el CRM tiene 2 visitados sin contacto: 5 reactivados no cuadra
  assert.ok(await p.locator('text=Control de coherencia: Visitados sin contacto').count() > 0, 'no marca el grupo que no cuadra');
  assert.ok(await p.locator('#guardarTotales').isDisabled(), 'deja guardar con el control en rojo');
  await p.fill('[data-tot="sc_reac"]', '1');
  assert.ok(await p.locator('text=Control de coherencia OK').count() > 0, 'no da OK con los números correctos');
  // con el ojo cerrado (así abre) la facturación no se ve; con el ojo abierto, sí
  assert.ok(!(await p.locator('#totPrevia').innerText()).includes('1.500,50'), 'con el ojo cerrado se ve la facturación');
  await p.evaluate(() => { S.ver = true; refrescarTotales(); });
  const prev = await p.locator('#totPrevia').innerText();
  await p.evaluate(() => { S.ver = false; });
  for (const t of ['1.500,50', '2.300,50', '65,22 %', '50,00 %', 'con visita, con o sin contacto']) assert.ok(prev.includes(t), 'falta en la vista previa: ' + t);
  const antes = await p.evaluate(() => window.__llamadas.length);
  await p.click('#guardarTotales'); await p.waitForTimeout(400);
  const ll = (await p.evaluate(n => window.__llamadas.slice(n), antes)).find(x => x[0] === 'v2_guardar_totales_bbva');
  assert.ok(ll, 'no llamó a v2_guardar_totales_bbva');
  assert.equal(ll[1].p_corte, hoy);
  assert.deepEqual(ll[1].p_totales, { cc_reac: 2, cc_fac: 1500.5, cc_trx: 30, sc_reac: 1, sc_fac: 800, sc_trx: 10, nv_reac: 0, nv_fac: 0, nv_trx: 0 });
});
await prueba('presentación con totales de BBVA: 11 láminas, cuentan los reactivados con visita y su detalle', async () => {
  await p.evaluate(h => { window.__FX.tablas.v2_totales_bbva = [{ corte: h, cc_reac: 2, cc_fac: 1500.5, cc_trx: 30, sc_reac: 1, sc_fac: 800, sc_trx: 10, nv_reac: 0, nv_fac: 0, nv_trx: 0, por: 'analista.prueba@ejemplo.com', en: h + 'T12:00:00Z' }]; }, hoy);
  p.once('dialog', d => d.accept(hoy.split('-').reverse().join('/')));
  const [d] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), p.click('[data-ppt-bbva]')]);
  const f = path.join(RAIZ, 'qa', 'salida_presentacion_totales.pptx'); await d.saveAs(f);
  const z = await JSZip.loadAsync(fs.readFileSync(f));
  const lams = Object.keys(z.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n));
  assert.equal(lams.length, 11, 'láminas: ' + lams.length);
  const txt = (await Promise.all(lams.map(n => z.file(n).async('string')))).join(' ');
  for (const t of ['Reactivación en comercios visitados · cuenta', 'Detalle de los 3 reactivados con visita', '1.500,50', '2.300,50', '50,00 %', 'Control de coherencia: OK', 'qué pasó en la visita y qué hizo el ejecutivo', 'Reclamo o comentario del comercio', 'comercios con respuesta', 'Volumen', 'Reactivados de la base', 'Comercios reactivados', 'visitas de Stratis al corte de la data de BBVA'])
    assert.ok(txt.includes(t), 'falta en la presentación: ' + t);
  assert.ok(!/CRM/.test(txt), 'la presentación dice «CRM»');
  assert.ok(!/ticket/i.test(txt), 'la presentación muestra el ticket promedio');
  for (const t of ['Reactivación sin visita', 'No visitados', 'Total universo']) assert.ok(!txt.includes(t), 'la presentación muestra lo que no cuenta: ' + t);
  fs.unlinkSync(f);
  await p.evaluate(() => { delete window.__FX.tablas.v2_totales_bbva; S.totBBVA = null; });
});
await prueba('presentación: los comercios del sábado se reparten entre los días hábiles de su semana sin cambiar el total', async () => {
  const r = await p.evaluate(() => { const act0 = S.act, av0 = S.avance;
    const v = (i, d) => ({ id:'x' + i, periodo:S.periodo.id, customer_id:String(i).padStart(8, '0'), correo:S.base[0].correo, visitado_en:d + 'T15:00:00Z', lat:-12.09, lng:-77.04, fuera_plazo:false, estado_anul:'activa', con:'Tercero', que:'Reunión concretada', decision:'Aún no decide', comentario:'Comentario de prueba suficientemente largo' });
    S.act = [v(1, '2026-09-22'), v(2, '2026-09-22'), v(3, '2026-09-23'), v(4, '2026-09-26'), v(5, '2026-09-26'), v(6, '2026-09-26')];
    S.avance = [{ meta_visitas:160, meta_reactivados:40, meta_conversion:25 }];
    try { const D = datosPresentacion('2026-09-29', null, null), sp = D.serieP.filter(x => x.dia >= '2026-09-21' && x.dia <= '2026-09-29');
      return { dias:sp.map(x => [x.dia, x.nuevos]), acum:sp[sp.length - 1].acum, sab:D.serieP.some(x => x.dia === '2026-09-26'), finde:D.finde.length, visitados:D.visitados, diasCampo:D.diasCampo };
    } finally { S.act = act0; S.avance = av0; } });
  assert.equal(r.sab, false, 'el sábado sigue en la serie');
  assert.equal(r.finde, 1); assert.equal(r.visitados, 6); assert.equal(r.acum, 6, 'el acumulado cambió');
  assert.deepEqual(r.dias.filter(([, n]) => n), [['2026-09-22', 4], ['2026-09-23', 2]]);
  assert.equal(r.diasCampo, 2, 'el ritmo no usa los días con campo de la serie repartida');
});
await prueba('presentación: en «La voz del comercio» cada comercio cuenta una vez y las filas suman el total', async () => {
  const r = await p.evaluate(() => { const act0 = S.act, av0 = S.avance;
    const v = (i, fb, acc) => ({ id:'y' + i, periodo:S.periodo.id, customer_id:String(i).padStart(8, '0'), correo:S.base[0].correo, visitado_en:'2026-09-22T15:00:00Z', lat:-12.09, lng:-77.04, fuera_plazo:false, estado_anul:'activa',
      con:'Dueño', que:'Reunión concretada', decision:'Realizará consumos', feedback:fb, fb_acciones:acc, comentario:'Comentario de prueba suficientemente largo' });
    S.act = [v(1, ['Pide una tasa más baja', 'Usa POS de otra marca'], ['Evaluar mejora de tasa']), v(2, ['Pide una tasa más baja'], ['Evaluar mejora de tasa', 'Seguimiento del caso']),
      v(3, ['Usa POS de otra marca'], []), v(4, ['Sin observaciones del comercio'], []), v(5, ['POS no enciende'], ['Validé el estado del equipo'])];
    S.avance = [{ meta_visitas:160, meta_reactivados:40, meta_conversion:25 }];
    try { const DL = datosPresentacion('2026-09-29', null, null).dolores; const sq = o => Object.values(o).reduce((a, n) => a + n, 0);
      return { total:DL.conCompromiso, suma:DL.lista.reduce((a, o) => a + o.n, 0), filas:DL.lista.map(o => [o.t, o.n]), quePaso:sq(DL.quePaso.con) + sq(DL.quePaso.sin), conDolor:DL.conDolorN, sumaDolor:DL.lista.filter(o => !o.sin).reduce((a, o) => a + o.n, 0) }; }
    finally { S.act = act0; S.avance = av0; } });
  assert.equal(r.total, 5); assert.equal(r.suma, 5, 'las filas no suman el total: ' + JSON.stringify(r.filas));
  assert.deepEqual(r.filas.find(x => x[0] === 'Pide una tasa más baja'), ['Pide una tasa más baja', 2]);
  assert.ok(r.filas.some(x => x[0] === 'Sin reclamos: el comercio no reportó problemas' && x[1] === 1));
  assert.equal(r.quePaso, 5, '«qué pasó en la visita» no suma el total'); assert.equal(r.sumaDolor, r.conDolor, 'la tabla de dolores no suma su total');
});
await prueba('presentación: con reactivados de BBVA, «La voz del comercio» suma con y sin contacto y separa a los que no tienen reclamo', async () => {
  const r = await p.evaluate(() => { const act0 = S.act, av0 = S.avance, inf0 = S.fbInf, seg0 = S.seg;
    const v = (i, o) => Object.assign({ id:'z' + i, periodo:S.periodo.id, customer_id:String(i).padStart(8, '0'), correo:S.base[0].correo, visitado_en:'2026-09-22T15:00:00Z', lat:-12.09, lng:-77.04, fuera_plazo:false, estado_anul:'activa',
      con:'Dueño', que:'Reunión concretada', decision:'Realizará consumos', feedback:[], fb_acciones:[], comentario:'' }, o);
    S.act = [v(1, { feedback:['Pide una tasa más baja'], fb_acciones:['Evaluar mejora de tasa'] }), v(2, { feedback:['Sin observaciones del comercio'] }),
      v(3, { con:'Tercero', que:'Reagendada', decision:null, feedback:['No se encontraba la persona que tomaba decisiones'], fb_acciones:['Reagendé con quien decide'] }),
      v(4, { con:'Nadie', que:'Sin éxito', decision:null, motivo:'Cerrado' }), v(5, { con:'Nadie', que:'Sin éxito', decision:null, motivo:'No atendió' }),
      v(6, { feedback:['Sin observaciones del comercio'] })];
    // reclamo fuera de la lista, leído del comentario: cuenta como reclamo aunque el ejecutivo marcó «Sin observaciones»
    S.fbInf = { z6:{ visita_id:'z6', tipos:[], fuera_de_lista:['Equipo dañado de prueba'], confianza:'Media', criterio:'' } };
    // seguimiento remoto de una de las dos sin contacto (01/10); el que es posterior al corte no cuenta
    S.seg = [{ visita_id:'z4', canal:'WhatsApp', resultado:'Respondió: usará el POS', hecho_en:'2026-09-23T15:00:00Z' }, { visita_id:'z5', canal:'Llamada', resultado:'No respondió', hecho_en:'2026-10-05T15:00:00Z' }];
    S.avance = [{ meta_visitas:160, meta_reactivados:40, meta_conversion:25 }];
    const RB = { corte:{ corte:'2026-09-29' }, filas:[1, 2, 3, 4, 5, 6].map(i => ({ customer_id:String(i).padStart(8, '0'), reactivado:'Si', gestion_con_contacto:i < 4, facturado:null })) };
    try { const DL = datosPresentacion('2026-09-29', RB, null).dolores; const sq = o => Object.values(o).reduce((a, n) => a + n, 0);
      return { total:DL.conCompromiso, con:DL.lista.reduce((a, o) => a + o.n, 0), sin:sq(DL.quePaso.sin), filas:DL.lista.map(o => [o.t, o.n]), seg:DL.segSin }; }
    finally { S.act = act0; S.avance = av0; S.fbInf = inf0; S.seg = seg0; } });
  assert.deepEqual(r.seg, { n:1, canales:{ WhatsApp:1 }, respondio:1 }, 'seguimiento remoto: ' + JSON.stringify(r.seg));
  assert.equal(r.total, 6); assert.equal(r.con, 4, 'con contacto: ' + JSON.stringify(r.filas)); assert.equal(r.sin, 2); assert.equal(r.con + r.sin, r.total, 'la tabla no suma el total');
  for (const t of ['Pide una tasa más baja', 'Sin reclamos: el comercio no reportó problemas', 'No estaba quien decide (atendió un tercero)', 'Equipo dañado de prueba'])
    assert.ok(r.filas.some(x => x[0] === t && x[1] === 1), 'falta la fila ' + t + ': ' + JSON.stringify(r.filas));
});
await prueba('reporte para directorio: PDF A4 con los cinco cuadros en el orden del desglose y sin «CRM»', async () => {
  await p.evaluate(h => { window.__FX.tablas.v2_totales_bbva = [{ corte: h, cc_reac: 2, cc_fac: 1500.5, cc_trx: 30, sc_reac: 1, sc_fac: 800, sc_trx: 10, nv_reac: 0, nv_fac: 0, nv_trx: 0, por: 'analista.prueba@ejemplo.com', en: h + 'T12:00:00Z' }]; S.totBBVA = null; }, hoy);
  p.once('dialog', d => d.accept(hoy.split('-').reverse().join('/')));
  const [d] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), p.click('[data-reporte-dir]')]);
  assert.match(d.suggestedFilename(), /^Avance_campana_.+\.pdf$/);
  const f = path.join(RAIZ, 'qa', 'salida_reporte.pdf'); await d.saveAs(f);
  const pdf = fs.readFileSync(f).toString('latin1'); fs.unlinkSync(f);
  assert.ok(pdf.startsWith('%PDF'), 'no es un PDF');
  const orden = ['COMERCIOS VISITADOS', 'CON CONTACTO', 'REACTIVADOS', 'TASA DE CONVERSI', 'VALOR GENERADO'].map(t => pdf.indexOf('(' + t));
  assert.ok(orden.every(i => i > 0) && orden.every((i, k) => !k || i > orden[k - 1]), 'los cuadros no siguen el orden del desglose: ' + orden.join(','));
  assert.ok(!/CRM/.test(pdf), 'el reporte dice «CRM»');
  for (const t of ['De la base al objetivo'.toUpperCase(), 'S/ 0,00 MM', '50,00%', 'al corte de la data de BBVA']) assert.ok(pdf.includes(t), 'falta en el reporte: ' + t);
  await p.evaluate(() => { delete window.__FX.tablas.v2_totales_bbva; S.totBBVA = null; });
});
await prueba('reactivados BBVA vs. comisión: un estado por comercio, cuadro por ejecutivo y contactados', async () => {
  const r = await p.evaluate(({ hoy, ej }) => {
    const v = (cid, con, d) => ({ id: 'vc-' + cid, periodo: 'PRUEBA', customer_id: cid, comercio: 'Comercio ' + cid, correo: ej, visitado_en: d + 'T16:00:00Z', lat: -12.09, lng: -77.04,
      con, motivo: con === 'Nadie' ? 'Cerrado' : null, que: con === 'Nadie' ? 'Sin éxito' : 'Reunión concretada', decision: null, estado_anul: 'activa', fuera_plazo: false });
    const b = (i, extra) => Object.assign({ customer_id: String(i).padStart(8, '0'), razon_social: 'COMERCIO ' + i, correo: ej, visitas: 1, visitas_validas: 1, estado: 'seg', dias_trx: 0, bbva_reactivado: '2026-10-06' }, extra);
    S.base = S.base.concat([b(81, { estado: 'rea', dias_trx: 2 }), b(82, { estado: 'uno', dias_trx: 1 }), b(83), b(84), b(85), b(86)]);
    S.base.forEach(c => { S.baseMap[c.customer_id] = c; });
    S.act = S.act.concat([v('00000081', 'Dueño', '2026-09-25'), v('00000082', 'Dueño', '2026-09-25'), v('00000083', 'Tercero', '2026-09-25'),
      v('00000084', 'Dueño', '2026-09-25'), v('00000085', 'Dueño', '2026-09-25'), v('00000086', 'Nadie', '2026-09-25')]);
    const t = (cid, f, trx) => ({ customer_id: cid, fecha_corte: f, mes: f.slice(0, 7), formato: 'acumulado_mes', trx });
    S.trxCom = [t('00000083', '2026-09-23', 0), t('00000083', '2026-09-28', 3), t('00000084', '2026-09-21', 5), t('00000084', '2026-09-28', 5), t('00000086', '2026-09-28', 9)];
    S.seg = [{ visita_id: 'vc-00000082', customer_id: '00000082', canal: 'Llamada', resultado: 'Respondió: usará el POS', hecho_en: '2026-10-07T15:00:00Z' }];
    const est = Object.fromEntries(filasComision().map(f => [f.c.customer_id, f.est]));
    S.vista = 'auditoria'; S.tab = 'bbva'; pintar();
    return { est, txt: document.querySelector('#contenido, main, body').innerText };
  }, { hoy, ej: EJECUTIVO.correo });
  assert.deepEqual(r.est, { '00000081': 'cuenta', '00000082': 'uno', '00000083': 'confirmar', '00000084': 'antes', '00000085': 'sindata', '00000086': 'sincontacto' });
  for (const t of ['Reactivados BBVA vs. comisión', 'Reactivados BBVA', 'Cuentan', 'Falta 1 día', 'Por confirmar', 'Solo antes de la visita', 'Sin visita con contacto', 'Contactados', '25/09'])
    assert.ok(r.txt.toLowerCase().includes(t.toLowerCase()), 'falta en el cuadro: ' + t);   // los encabezados van en mayúsculas por CSS
  assert.match(r.txt, /Total\s+6\s+1\s+1\s+1\s+1\s+1\s+1\s+1/, 'fila Total: 6 BBVA · 1 por estado · 1 sin data · 1 contactado');
});
await prueba('recupero del POS: cuadro por ejecutivo, días sin avance y Validar / Observar', async () => {
  const viejo = new Date(Date.now() - 9 * 864e5).toISOString(), nuevo = new Date().toISOString();
  const x = (cid, paso, act) => ({ customer_id: cid, correo: EJECUTIVO.correo, visita_id: 'vr' + cid, paso, caso_soporte: paso === 'tramite' ? 'CAS-1' : null, desde: '2026-10-01', actualizado_en: act, intentos: 0, historial: [] });
  await p.evaluate(({ l, s }) => { window.__FX.rpc.v2_validar_recupero = 'validado'; window.__FX.rpc.v2_mis_recuperos = l; window.__FX.tablas.v2_recuperos = s; S.recups = l; S.recupSigue = s; S.vista = 'auditoria'; S.tab = 'recupero'; pintar(); },
    { l: [x('00000091', 'llamar', viejo), x('00000092', 'tramite', nuevo), x('00000093', 'entregado', nuevo), x('00000094', 'validado', nuevo), x('00000095', 'trabado', nuevo),
          x('00000097', 'sigue', nuevo), x('00000098', 'cambio', viejo)], s: [{ customer_id: '00000096', correo: EJECUTIVO.correo, paso: 'sigue', validado_en: '2026-10-08T15:00:00Z' }] });
  await p.waitForTimeout(300);
  const txt = (await p.locator('#contenido').innerText()).toLowerCase();
  for (const t of ['Recupero del POS', 'Casos', 'Llamar a Soporte', 'En trámite', 'Entregado (por validar)', 'Validado', 'Trabado', 'Sigue con el POS', 'Cerrado por cambio de visita', 'Más de 7 días sin avance', 'CAS-1'])
    assert.ok(txt.includes(t.toLowerCase()), 'falta en el cuadro: ' + t);
  assert.match(txt, /total\s+8\s+1\s+1\s+1\s+1\s+1\s+2\s+1\s+1/, 'fila Total: 8 casos · 1 por paso · 2 siguen (1 por validar) · 1 cerrado por cambio · 1 con más de 7 días');
  assert.equal(await p.locator('[data-recup-validar="00000097"]').count(), 1, '«Sigue con el POS» por validar debe tener Validar');
  const antes = await p.evaluate(() => window.__llamadas.length);
  await p.click('[data-recup-validar="00000093"]'); await p.waitForTimeout(300);
  let ll = (await p.evaluate(n => window.__llamadas.slice(n), antes)).filter(c => c[0] === 'v2_validar_recupero');
  assert.deepEqual(ll.at(-1)[1], { p_customer_id: '00000093', p_valido: true, p_nota: null });
  p.once('dialog', d => d.dismiss()); await p.click('[data-recup-observar="00000093"]'); await p.waitForTimeout(200);
  assert.equal((await p.evaluate(n => window.__llamadas.slice(n), antes)).filter(c => c[0] === 'v2_validar_recupero').length, 1, 'observó sin nota');
  p.once('dialog', d => d.accept('Openpay no registra la devolución')); await p.click('[data-recup-observar="00000093"]'); await p.waitForTimeout(300);
  ll = (await p.evaluate(n => window.__llamadas.slice(n), antes)).filter(c => c[0] === 'v2_validar_recupero');
  assert.deepEqual(ll.at(-1)[1], { p_customer_id: '00000093', p_valido: false, p_nota: 'Openpay no registra la devolución' });
  // mirando un periodo anterior no se valida (los botones actúan sobre el periodo en curso)
  const per = await p.evaluate(() => S.periodo);
  await p.evaluate(() => { S.periodo = Object.assign({}, S.periodo, { ini: '2020-01-01', fin: '2020-01-31' }); S.recups = window.__FX.rpc.v2_mis_recuperos; pintar(); });
  assert.equal(await p.locator('[data-recup-validar]').count(), 0, 'en un periodo anterior no debe haber Validar');
  await p.evaluate(pp => { S.periodo = pp; pintar(); }, per);
});
await prueba('base 2026-11: «Base y bloques», selector de ejecutivo, ojo de privacidad y cargas por RUC o DNI', async () => {
  const dia = n => new Date(Date.now() + n * 864e5).toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
  const E2 = 'ejecutivo2.prueba@ejemplo.com', b1 = { bloque: 1, bloque_ini: dia(-1), bloque_fin: dia(10) }, b2 = { bloque: 2, bloque_ini: dia(11), bloque_fin: dia(25) };
  const n = (i, x) => comercio(i, Object.assign({ origen: 'base_nueva' }, b1, x));
  const filas = [n(11, { potencial: 1000, grupo_ubicacion: 1 }), n(12, { potencial: 2000, grupo_ubicacion: 2 }),
    n(13, { potencial: 0, grupo_ubicacion: 3, documento: '20000000013', contacto_celular: '987654321', contacto_correo: 'dueno@ejemplo.com', geo_nota: 'Llamar antes de ir' }),
    n(14, { potencial: 500, grupo_ubicacion: 1, documento: '00999014' }), n(15, Object.assign({ potencial: 0, grupo_ubicacion: 1, documento: '00000012' }, b2)),
    comercio(16, { origen: 'base_anterior', visitas: 1, visitas_validas: 1, bbva_reactivado: dia(-1), dias_trx: 2 }),
    comercio(17, { origen: 'salida', visitas: 0 }),
    n(21, { correo: E2, potencial: 3000, grupo_ubicacion: 1 })];
  const vis = (i, x) => visita(i, Object.assign({ id: `00000000-0000-0000-0000-0000000001${i}`, customer_id: String(i).padStart(8, '0'), comercio: `Comercio Prueba ${i}` }, x));
  const nuevas = [vis(11), vis(12, { con: 'Nadie', motivo: 'Cerrado', que: 'Sin éxito', decision: null }), vis(16), vis(21, { correo: E2 })];
  await p.evaluate(async ([filas, nuevas, E2]) => { window.__FX.rpc.v2_mi_base = filas; await cargarBase();
    S.ejecutivos.push({ correo: E2, nombre: 'Segundo', ini: 'SE', color: 'var(--ej2)' }); S.act = S.act.concat(nuevas);
    elegirEj('todos'); S.ver = false; S.vista = 'bloques'; pintar(); }, [filas, nuevas, E2]);
  await p.waitForTimeout(300);
  assert.equal(await p.evaluate(() => S.base.some(c => c.customer_id === '00000017')), false, 'un comercio de «salida» sin visita sigue en la cartera');
  const tile = async k => (await p.locator('.tile', { hasText: k }).first().innerText()).replace(/\s+/g, ' ');
  assert.match(await tile('Bloque 1 · visitados'), /3 \/ 5/, 'bloque 1 del equipo');
  assert.match(await tile('Periodo · visitados'), /3 \/ 450/, 'periodo del equipo: 225 por ejecutivo');
  assert.match(await tile('Reactivados que cuentan'), /\b1\b.*1 de la base anterior/, 'reactivado de la base anterior');
  assert.match(await tile('Requieren búsqueda'), /\b1\b/);
  // ojo cerrado al entrar: no se ven potenciales, celulares ni correos
  let txt = await p.locator('#contenido').innerText();
  assert.ok(!/6,500|6\.500/.test(txt) && txt.includes('S/ ••••'), 'con el ojo cerrado se ve el potencial');
  assert.ok(txt.includes('••• ••• 321') && txt.includes('d•••@ejemplo.com') && !txt.includes('987654321'), 'con el ojo cerrado se ve el contacto');
  await p.click('#btnOjo'); await p.waitForTimeout(200); txt = await p.locator('#contenido').innerText();
  assert.ok(txt.includes('S/ 6,500') && txt.includes('987654321') && txt.includes('dueno@ejemplo.com'), 'con el ojo abierto no aparecen los datos');
  await p.click('#btnOjo');
  // selector de ejecutivo: todas las vistas se leen con él
  assert.equal(await p.locator('#btnCel').isHidden(), true, '«Ver su celular» solo con un ejecutivo elegido');
  await p.selectOption('#gEj', EJECUTIVO.correo); await p.waitForTimeout(300);
  assert.match(await tile('Bloque 1 · visitados'), /2 \/ 4/, 'bloque 1 del ejecutivo');
  assert.match(await tile('Periodo · visitados'), /2 \/ 225/, 'periodo del ejecutivo');
  // «Por ejecutivo» y Visitas cuentan contra la meta solo la base nueva (Jose, 21/10); la base anterior va aparte
  await p.evaluate(() => { S.vista = 'equipo'; pintar(); }); await p.waitForTimeout(300);
  assert.match((await p.locator('.tile', { hasText: 'Comercios visitados' }).first().innerText()).replace(/\s+/g, ' '), /comercios visitados 2 \/ 160/i, 'Por ejecutivo suma la base anterior o comercios de antes: ' + (await p.locator('.tile', { hasText: 'Comercios visitados' }).first().innerText()));
  await p.evaluate(() => { S.vista = 'validacion'; S.dia = 'periodo'; pintar(); }); await p.waitForTimeout(300);
  assert.match((await p.locator('.tile', { hasText: 'Comercios visitados' }).first().innerText()).replace(/\s+/g, ' '), /comercios visitados 2 \/ 160.*1 de la base anterior, aparte/i, 'Visitas suma la base anterior');
  const coms = (await p.locator('td.com b').allInnerTexts()).join(' | ');
  assert.ok(coms.includes('Comercio Prueba 11') && !coms.includes('Comercio Prueba 21'), 'Visitas no se filtró por ejecutivo: ' + coms);
  await p.click('#btnCel'); await p.waitForTimeout(200);
  assert.match(await p.locator('#veloCel iframe').getAttribute('src'), /\.\.\/index\.html\?como=ejecutivo\.prueba%40ejemplo\.com$/);
  if (process.env.CAPTURAS) await p.screenshot({ path: `${process.env.CAPTURAS}/escritorio-celular.png` });
  await p.keyboard.press('Escape'); assert.equal(await p.locator('#veloCel').count(), 0, 'Esc no cerró el celular');
  // cargas por RUC o DNI (igual que v2_comercio_de_id en el servidor)
  await p.evaluate(() => { S.vista = 'cargas'; pintar(); }); await p.waitForTimeout(200);
  assert.equal(await p.locator('#gEj').isDisabled(), true, 'en Cargas el selector debe estar apagado');
  const r = await p.evaluate(() => ['20000000013', '999014', '999014.0', '12', '123', '1234567890', '20000000099'].map(x => idDeBBVA(x)));
  assert.equal(r[0].cid, '00000013', 'RUC'); assert.equal(r[1].cid, '00000014', 'DNI sin el cero'); assert.equal(r[2].cid, '00000014', 'el «.0» de Excel');
  assert.match(r[3].err || '', /revisar a mano/, 'Customer ID y DNI de otro comercio: no se adivina');
  const fila = await p.evaluate(() => validarBBVA(['RUC', 'Gestion_Con_Contacto', 'Reactivado'], [['20000000013.0', 'Si', 'Si']]).res[0]);
  assert.deepEqual([fila.cid, fila.doc, fila.err], ['00000013', '20000000013', []], 'el RUC de un comercio con Customer ID antiguo no se enlaza');
  assert.match(r[4].err || '', /no está en la base/); assert.match(r[5].err || '', /ni un RUC/); assert.match(r[6].err || '', /RUC no está/);
  await p.evaluate(() => { elegirEj('todos'); S.vista = 'validacion'; pintar(); });
});
await prueba('rutas: la recomendada frente a la del ejecutivo, por correo y ruta, con la ruta de hoy y el historial', async () => {
  // Los dos ejecutivos tienen una «Ruta 01 · Lima» y una «Ruta 99 · Por ubicar»: nunca se mezclan
  const E2 = 'ejecutivo2.prueba@ejemplo.com', R1 = 'Ruta 01 · Lima', R99 = 'Ruta 99 · Por ubicar', en = '2026-10-21T15:00:00Z';
  const r = (i, ruta, orden, x) => comercio(i, Object.assign({ ruta, orden }, x));
  const propia = (ruta_propia, orden_propio) => ({ ruta_propia, orden_propio, ruta_propia_en: en });
  const filas = [
    r(31, R1, 1, { estado: 'seg', visitas: 1, visitas_validas: 1, ultima_visita: '2026-10-21T14:00:00Z' }),   // sigue igual (sin línea: no hubo cambio)
    r(32, R1, 2, propia(R1, 4)), r(33, R1, 3), r(34, R1, 4, propia('Mi ruta de la tarde', 1)), r(35, R1, 5, propia('Mi ruta de la tarde', 2)),
    r(36, R99, 1, propia(R1, 2)), r(37, R99, 2),   // 36 traído de la Ruta 99; 37 se movió y volvió
    r(41, R1, 1, { correo: E2 }), r(42, R1, 2, { correo: E2 }), r(43, R1, 3, { correo: E2 }), r(44, R99, 1, { correo: E2 })];
  const lin = (cid, por, antes, despues, x) => Object.assign({ visita_id: null, periodo: 'PRUEBA', customer_id: String(cid).padStart(8, '0'), accion: 'ruta', por, antes, despues, en }, x);
  const bit = [lin(32, EJECUTIVO.correo, R1 + ' · 2', R1 + ' · 4'), lin(34, EJECUTIVO.correo, R1 + ' · 4', 'Mi ruta de la tarde · 1'), lin(35, EJECUTIVO.correo, R1 + ' · 5', 'Mi ruta de la tarde · 2'),
    lin(36, EJECUTIVO.correo, R99 + ' · 1', R1 + ' · 2'), lin(37, EJECUTIVO.correo, R99 + ' · 2', R1 + ' · 6', { en: '2026-10-20T15:00:00Z' }),
    lin(37, EJECUTIVO.correo, R1 + ' · 6', 'vuelve a la recomendada · ' + R99 + ' · 2', { en: '2026-10-20T16:00:00Z' }),
    lin(41, E2, R1 + ' · 1', R99 + ' · 2'), lin(41, E2, R99 + ' · 2', 'vuelve a la recomendada · ' + R1 + ' · 1', { en: '2026-10-21T16:00:00Z' }),
    lin(33, EJECUTIVO.correo, 'x', 'y', { periodo: 'OTRO' }), lin(33, EJECUTIVO.correo, 'x', 'y', { accion: 'comentario' })];   // de otro periodo y de otra acción: no cuentan
  await p.evaluate(async ([filas, bit, E2]) => { window.__FX.rpc.v2_mi_base = filas; window.__FX.tablas.v2_bitacora_visita = bit; await cargarBase();
    if (!S.ejecutivos.some(e => e.correo === E2)) S.ejecutivos.push({ correo: E2, nombre: 'Segundo', ini: 'SE', color: 'var(--ej2)' });
    S.rutasBit = null; S.rutaHist = null; elegirEj('todos'); S.vista = 'rutas'; pintar(); }, [filas, bit, E2]);
  await p.waitForTimeout(400);
  const tile = async k => (await p.locator('.tile', { hasText: k }).first().innerText()).replace(/\s+/g, ' ');
  assert.match(await tile('Movidos de ruta'), /3 \/ 11/, 'movidos del equipo');
  assert.match(await tile('Otro orden'), /\b1\b/); assert.match(await tile('Volvieron a la recomendada'), /\b2\b/);
  assert.match(await tile('Rutas armadas'), /\b2\b.*1 con un nombre/, 'rutas armadas por correo y ruta');
  assert.match(await tile('Cambios en la bitácora'), /\b8\b/, 'cuenta líneas de otro periodo u otra acción');
  const fila = async t => (await p.locator('table.datos tr', { hasText: t }).first().innerText()).replace(/\s+/g, ' ');
  assert.match(await fila('Prueba'), /Prueba 7 3 1 1 2 \(1 nueva\) 6 21\/10 \d\d:\d\d Ruta 01 · Lima cambiada 3 de 5 de la recomendada · 1 traído · 2 sacados · otro orden/, 'fila del ejecutivo: ' + await fila('Prueba'));
  assert.match(await fila('Segundo'), /Segundo 4 0 0 1 0 2 .*Ruta 01 · Lima la recomendada/, 'la ruta del segundo se mezcló con la del primero: ' + await fila('Segundo'));
  // ruta de hoy lado a lado: la recomendada y la que armó, sin comercios del otro ejecutivo
  const hoy1 = await p.locator('.ruta-hoy', { hasText: 'Prueba · ruta de hoy' }).innerText();
  assert.ok(/Recomendada · 5 comercios/i.test(hoy1) && /La que armó en el celular · 4 comercios/i.test(hoy1), 'ruta de hoy: ' + hoy1);
  assert.ok(/viene de Ruta 99 · Por ubicar · 1/.test(hoy1) && /la sacó · ahora en Mi ruta de la tarde/.test(hoy1) && /antes parada 2/.test(hoy1), 'faltan las marcas de la comparación');
  assert.ok(!hoy1.includes('Comercio Prueba 41'), 'se mezclaron las rutas con el mismo nombre');
  assert.match(await p.locator('.ruta-hoy', { hasText: 'Segundo · ruta de hoy' }).innerText(), /Recomendada · 3 comercios/i);
  // historial de un comercio: se movió y volvió
  await p.click('#contenido td.com [data-ruta-hist="00000037"]'); await p.waitForTimeout(200);
  const h = (await p.locator('#rutaHist').innerText()).replace(/\s+/g, ' ');
  assert.ok(h.includes('Historial de ruta · Comercio Prueba 37') && h.includes('Ruta 99 · Por ubicar · 2 Ruta 01 · Lima · 6') && h.includes('vuelve a la recomendada · Ruta 99 · Por ubicar · 2'), 'historial: ' + h);
  assert.equal(await p.locator('#rutaHist tbody tr').count(), 2);
  if (process.env.CAPTURAS) await p.screenshot({ path: `${process.env.CAPTURAS}/escritorio-rutas.png`, fullPage: true });
  // con el selector, solo el ejecutivo elegido (el historial de otro ejecutivo se cierra)
  await p.selectOption('#gEj', E2); await p.waitForTimeout(300);
  assert.match(await tile('Movidos de ruta'), /0 \/ 4/); assert.match(await tile('Cambios en la bitácora'), /\b2\b/);
  assert.equal(await p.locator('#rutaHist').count(), 0, 'quedó abierto el historial de otro ejecutivo');
  assert.deepEqual((await p.locator('table.datos').first().locator('tbody tr').allInnerTexts()).map(t => t.trim().split(/\s+/)[1]), ['Segundo'], 'con el selector se ve otro ejecutivo');
  assert.ok((await p.locator('#contenido').innerText()).includes('Este ejecutivo todavía no armó rutas') === false, 'el que volvió a la recomendada sí tiene cambios');
  await p.evaluate(() => { window.__FX.tablas.v2_bitacora_visita = []; S.rutasBit = null; elegirEj('todos'); S.vista = 'validacion'; pintar(); });
});
await prueba('Cierres de periodo: histórico, detalle con cuadre, ojo de privacidad y evolutivo del ejecutivo', async () => {
  const c = (periodo, nombre, ini, fin, inc, pag, ret, extra = {}) => Object.assign({ periodo, correo: EJECUTIVO.correo, ejecutivo: EJECUTIVO.nombre, nombre, ini, fin, modelo: 'Modelo de prueba',
    aprobado_en: fin, enviado_en: null, incentivo_pct: inc, pagado_pct: pag, retenido_pct: ret, alcances: [{ k: 'Visitados', v: '10 / 8' }], detalle: {}, reactivados_lista: 0, reactivados_ya_facturaban: 0 }, extra);
  await p.evaluate(rows => { window.__FX.rpc.v2_cierres_equipo = rows; window.__FX.rpc.v2_cierre_cuadre = [{ correo: rows[0].correo, visitados: 12, con_contacto: 7 }];
    S.cierres = null; S.cTab = 'hist'; S.ver = true; elegirEj('todos'); S.vista = 'cierres'; pintar(); },
    [c('2099-01', 'P1 · prueba', '2098-12-19', '2099-01-18', 15, 12, 3, { detalle: { nota_periodo: 'Marcha blanca de prueba' } }),
     c('2099-02', 'P2 · prueba', '2099-01-19', '2099-02-18', 22.5, 18, 4.5, { detalle: { visitas_desde: '2099-01-19', visitas_hasta: '2099-02-18', visitados: 12, con_contacto: 8, viaticos_por_reembolsar: 194.86, ajuste: 'Ajuste de prueba' }, reactivados_lista: 5, reactivados_ya_facturaban: 1 })]);
  await p.waitForTimeout(500);
  let t = await p.locator('#contenido').innerText();
  assert.match(t, /Incentivo por periodo/); assert.match(t, /15 %/); assert.match(t, /22,5 %/); assert.match(t, /18 % \/ 4,5 %/);
  assert.match(t, /7,5 %/, 'la bolsa retenida no suma lo retenido de cada cierre');
  assert.match(t, /Marcha blanca de prueba/);
  // el detalle de un periodo: el cuadre marca lo que cuadra y lo que no
  await p.click('[data-ctab="2099-02"]'); await p.waitForTimeout(500);
  t = await p.locator('#contenido').innerText();
  assert.match(t, /12 · 12/); assert.match(t, /7 · 8/); assert.equal(await p.locator('.ci-ok').count(), 1); assert.equal(await p.locator('.ci-dif').count(), 1);
  assert.match(t, /S\/ 194,86/); assert.match(t, /1 ya facturaban/); assert.match(t, /Ajuste de prueba/);
  assert.ok((await p.evaluate(() => window.__llamadas.filter(x => x[0] === 'v2_cierre_cuadre').map(x => x[1].p_periodo))).includes('2099-02'));
  // con el ojo cerrado no se ven los porcentajes ni los viáticos
  await p.evaluate(() => { S.ver = false; pintar(); }); await p.waitForTimeout(200);
  t = await p.locator('#contenido').innerText();
  assert.ok(!/22,5 %|194,86/.test(t), 'el ojo cerrado deja ver el incentivo o los viáticos');
  // con un ejecutivo elegido: su evolutivo
  await p.evaluate(() => { S.ver = true; pintar(); });
  await p.selectOption('#gEj', EJECUTIVO.correo); await p.waitForTimeout(400);
  t = await p.locator('#contenido').innerText();
  assert.match(t, /El recorrido de/); assert.equal(await p.locator('.ci-per:not(.curso)').count(), 2); assert.match(t, /30 %/, 'falta lo pagado en total'); assert.match(t, /bolsa retenida al cierre del proyecto/);
  await p.evaluate(() => { elegirEj('todos'); S.vista = 'validacion'; pintar(); });
});
if (errs.length) { fallas++; console.log('MAL errores de consola:', errs); }
await b.close();
console.log(fallas ? `\n${fallas} prueba(s) fallaron` : '\nTodas las pruebas del escritorio pasaron');
process.exit(fallas ? 1 : 0);
