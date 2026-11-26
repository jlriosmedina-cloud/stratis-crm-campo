// Prueba del escritorio: carga sin errores, «Cómo fue la visita», señal «Revisar marcación»,
// visitas retenidas en el celular y la base para BBVA (modelo de 55 columnas: Resumen y Base). Datos inventados.
// Uso: node v2/qa/escritorio.mjs   (antes: python v2/build.py y npm install en v2/qa)
import { navegador, RAIZ, urlDist, EJECUTIVO, comercio, hoyLima } from './comun.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import JSZip from 'jszip';

const NM = path.join(RAIZ, 'qa', 'node_modules');
// Las descargas de prueba van a la carpeta temporal de Windows, fuera de OneDrive: OneDrive bloquea los archivos mientras los sincroniza (EBUSY).
const SALIDA = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-qa-escritorio-'));
const salida = n => path.join(SALIDA, n);
process.on('exit', () => fs.rmSync(SALIDA, { recursive: true, force: true }));
// Descarga que pide la fecha de corte: espera a que termine la pieza anterior, acepta el corte y quita siempre el manejador del diálogo,
// para que una prueba que falla no deje un manejador colgado que conteste el diálogo de la siguiente.
async function descargarConCorte(p, sel, corte, nombre) {
  await p.waitForFunction(() => !S._armandoPpt && !S._armandoRep, null, { timeout: 30000 });
  await p.waitForTimeout(500);   // deja llegar la descarga de una pieza anterior que haya terminado tarde, antes de escuchar la nuestra
  let contestado = false;   // solo el primer diálogo (la fecha de corte); otro diálogo lo cierra Playwright, como antes
  const alDialogo = d => { if (contestado) return; contestado = true; d.accept(corte.split('-').reverse().join('/')).catch(() => {}); };
  p.on('dialog', alDialogo);
  try {
    const [d] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), p.click(sel, { timeout: 60000 })]);
    if (nombre) assert.match(d.suggestedFilename(), nombre);
    return d;
  } finally { p.off('dialog', alDialogo); }
}
const ANALISTA = { correo: 'analista.prueba@ejemplo.com', nombre: 'Analista Prueba', nombre_corto: 'Analista', rol: 'Analista', activo: true };
const BASE = [1, 2, 3, 4, 5, 6].map(i => comercio(i, i === 1 ? { documento: '00999001' } : i === 2 ? { ruc: '20999000002' } : {}));
const hoy = hoyLima();
const AYER = new Date(Date.parse(hoy + 'T12:00:00Z') - 86400000).toISOString().slice(0, 10);
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
  visita(6, { con: 'Dueño', comentario: 'El dueño no se encontraba, regresar más tarde',
    // 03/11: dos frases; la principal y cómo quedó lo que pide BBVA van en fb_extra
    feedback: ['Usa POS de otra marca', 'Pide una tasa más baja'],
    fb_extra: { competidores: ['Niubiz'], fb_principal: 'Pide una tasa más baja', accion_estado: 'Hecho', numero_ticket: 'T-5' } }),
  // 29/09: zona insegura cuenta como visita, pero lleva la señal «Revisar motivo»
  visita(7, { con: 'Nadie', motivo: 'Zona insegura', que: 'Sin éxito', decision: null, feedback: null, direccion_ok: null })
];
// 03/11: visita anterior del comercio 3 con frase principal (solo para la prueba de la principal; no entra en las demás)
const VISITA_AYER_3 = visita(3, { id: '00000000-0000-0000-0000-000000000031', visitado_en: `${AYER}T15:03:00Z`, recibido_en: `${AYER}T15:03:30Z`, plazo_hasta: AYER,
  feedback: ['Pide una tasa más baja'], fb_extra: { fb_principal: 'Pide una tasa más baja', accion_estado: 'Hecho' } });
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
await prueba('base para BBVA: la principal de una visita anterior no se arrastra si la última con feedback no la trae', async () => {
  await p.evaluate(v => { window.__FX.rpc.v2_actividad = window.__FX.rpc.v2_actividad.concat([v]); S.vista = 'directorio'; pintar(); }, VISITA_AYER_3);
  try {
    await p.waitForTimeout(400);
    const [d] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), p.click('[data-base-bbva]')]);
    const f = salida('salida_base_principal.xlsx'); await d.saveAs(f);
    const ExcelJS = (await import('exceljs')).default, xw = new ExcelJS.Workbook(); await xw.xlsx.readFile(f); fs.unlinkSync(f);
    const b = xw.getWorksheet('Base'), cb = b.getRow(1).values.slice(1).map(String), v = (fila, col) => b.getCell(fila, cb.indexOf(col) + 1).value;
    let fila = 0; b.eachRow((r, n) => { if (r.getCell(cb.indexOf('Customer_ID') + 1).value === '00000003') fila = n; });
    assert.ok(fila > 1, 'no está el comercio 3'); assert.equal(v(fila, 'Visitas_Validas'), 2, 'no tomó la visita de ayer');
    assert.equal(v(fila, 'Feedback_Principal') || '', '', 'arrastró la principal de una visita anterior'); assert.equal(v(fila, 'Estado_Del_Problema') || '', '');
  } finally { await p.evaluate(() => { window.__FX.rpc.v2_actividad = window.__FX.rpc.v2_actividad.filter(x => x.id !== '00000000-0000-0000-0000-000000000031'); }); }
});
await prueba('base para BBVA: modelo Gestión Stratis de 55 columnas (Resumen y Base), Documento como llave', async () => {
  await p.evaluate(() => { S.vista = 'directorio'; pintar(); }); await p.waitForTimeout(400);
  const [d] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), p.click('[data-base-bbva]')]);
  const f = salida('salida_base_prueba.xlsx'); await d.saveAs(f);
  const ExcelJS = (await import('exceljs')).default, xw = new ExcelJS.Workbook(); await xw.xlsx.readFile(f);
  assert.deepEqual(xw.worksheets.map(w => w.name), ['Resumen', 'BBVA', 'Base']);
  // 03/11: hoja BBVA, solo lo que pide BBVA y con los nombres de su archivo en las 4 fases
  const hb = xw.getWorksheet('BBVA'), cv = hb.getRow(1).values.slice(1).map(String);
  assert.equal(cv.length, 29, 'la hoja BBVA debe tener 29 columnas'); assert.ok(!cv.includes('Reactivado_BBVA') && !cv.includes('Dias_Con_Trx_Post_Visita'), 'el cruce de reactivación sale de la plataforma de BBVA'); assert.ok(!cv.includes('Comentario'), 'el comentario libre no va en la hoja BBVA');
  assert.deepEqual(cv.slice(19, 27), ['Motivo','Submotivo','Feedback literal','Acción original','Estado','Numero_Ticket','Fecha_Resolucion','Proxima_Accion']);
  assert.equal(hb.getCell(1, 21).fill.fgColor.argb, 'FF3B43FB', 'las 4 fases van en azul');
  const vb = (fila, col) => hb.getCell(fila, cv.indexOf(col) + 1).value;
  assert.equal(vb(2, 'Documento'), '00999001', 'Documento como texto con su cero'); assert.equal(hb.getColumn(1).numFmt, '@');
  assert.equal(vb(7, 'Feedback literal'), 'Pide una tasa más baja'); assert.equal(vb(7, 'Motivo'), 'Condiciones comerciales');
  assert.equal(vb(7, 'Acción original'), 'Brindar información de campañas actuales ( si aplica ) y confirmar uso'); assert.equal(vb(7, 'Estado'), 'Hecho');
  assert.ok(vb(7, 'Fecha_Resolucion') instanceof Date, 'Fecha_Resolucion debe ser fecha en la hoja BBVA');
  assert.equal(hb.rowCount, xw.getWorksheet('Base').rowCount, 'la hoja BBVA debe tener los mismos comercios que Base');
  const b = xw.getWorksheet('Base'), cb = b.getRow(1).values.slice(1).map(String);
  // 26/10: las 55 columnas del modelo de Jose, en su orden (Gestion_Stratis_visitados_base_nueva_corte_23-10-2026.xlsx)
  assert.equal(cb.length, 61, 'Base debe tener las 55 columnas del modelo, las 2 de fuente y las 4 de tipificación BBVA');
  assert.deepEqual(cb.slice(0, 10), ['Documento','Customer_ID','Nombre_Comercial','Razon_Social','Distrito','Periodo','Bloque','Origen','Ejecutivo','Grupo_Ubicacion']);
  assert.deepEqual(cb.slice(50, 55), ['Reactivado_BBVA','Dias_Con_Trx_Post_Visita','Cuenta_Para_Comision','Validacion','Fuera_De_Plazo']);
  // la fuente del feedback va después de la columna 55 (Jose, 26/10)
  assert.deepEqual(cb.slice(55), ['Fuente_Feedback','Fuente_Que_Lo_Convencio','Motivo_BBVA','Submotivo_BBVA','Feedback_Principal','Accion_BBVA']);
  assert.equal(cb[26], 'Resultado', 'Resultado debe ir en la columna AA'); assert.equal(cb[40], 'Numero_Ticket', 'Numero_Ticket debe ir en la columna AO');
  assert.equal(b.getColumn(1).numFmt, '@', 'Documento debe ir como texto'); assert.equal(b.getColumn(2).numFmt, '@', 'Customer_ID debe ir como texto');
  const v = (fila, col) => b.getCell(fila, cb.indexOf(col) + 1).value;
  // 01/11: tipificación oficial de BBVA de cada frase
  assert.equal(v(2, 'Motivo_BBVA'), 'Sin causa identificada'); assert.equal(v(3, 'Motivo_BBVA'), 'Contacto pendiente');
  assert.equal(v(3, 'Submotivo_BBVA'), 'Decisor ausente en visita');
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
  for (const h of ['Nombre_Cargo_Contacto','Sentir_Del_Cliente','Punto_De_Dolor_Principal']){
    assert.equal(v(2, h) || '', '', h + ' debe ir vacía');
    assert.equal(b.getCell(1, cb.indexOf(h) + 1).fill.fgColor.argb, 'FFF86F35', h + ' debe ir en naranja'); }
  assert.equal(b.getCell(1, 1).fill.fgColor.argb, 'FF0C1137');
  // 03/11: las 4 fases de BBVA. Con frase principal: un solo motivo, la acción que pide BBVA y su estado en AO–AR (ya no van en naranja)
  for (const h of ['Numero_Ticket','Estado_Del_Problema','Fecha_Resolucion','Proxima_Accion']) assert.equal(b.getCell(1, cb.indexOf(h) + 1).fill.fgColor.argb, 'FF0C1137', h + ' ya no va en naranja');
  assert.equal(v(7, 'Feedback'), 'Usa POS de otra marca; Pide una tasa más baja');
  assert.equal(v(7, 'Feedback_Principal'), 'Pide una tasa más baja'); assert.equal(v(7, 'Motivo_BBVA'), 'Condiciones comerciales');
  assert.equal(v(7, 'Submotivo_BBVA'), 'Condiciones comerciales poco atractivas');
  assert.equal(v(7, 'Accion_BBVA'), 'Brindar información de campañas actuales ( si aplica ) y confirmar uso');
  assert.equal(v(7, 'Estado_Del_Problema'), 'Hecho'); assert.equal(v(7, 'Numero_Ticket'), 'T-5');
  assert.ok(v(7, 'Fecha_Resolucion') instanceof Date, 'Fecha_Resolucion debe ser fecha'); assert.equal(v(7, 'Proxima_Accion') || '', '');
  // sin frase con acción (solo «No se encontraba…»), no hay principal ni estado
  assert.equal(v(3, 'Feedback_Principal') || '', ''); assert.equal(v(3, 'Estado_Del_Problema') || '', '');
  // Sin corte de BBVA en el periodo no se afirma «NO»
  assert.equal(v(2, 'Reactivado_BBVA'), 'Sin dato en el corte'); assert.equal(v(2, 'Cuenta_Para_Comision'), 'Sin dato en el corte');
  // Resumen: fórmulas sobre la hoja Base, por ejecutivo
  const r = xw.getWorksheet('Resumen'), formulas = [];
  r.eachRow(row => row.eachCell(c => { if (c.value && c.value.formula) formulas.push(c.value.formula); }));
  assert.ok(formulas.length >= 9 && formulas.every(x => /Base!|SUM\(/.test(x)), 'el Resumen debe salir de la hoja Base');
  assert.ok(formulas.some(x => /COUNTIFS\(Base!\$I\$2:\$I\$\d+,\$A5,Base!\$K\$2:\$K\$\d+,"SI"\)/.test(x)), 'falta Comercios visitados por ejecutivo (columnas I y K)');
  assert.ok(formulas.some(x => /Base!\$AP\$2:\$AP\$\d+,"Hecho"/.test(x)), 'falta «Lo que pide BBVA: hecho» por ejecutivo (columna AP)');
  fs.unlinkSync(f);
});
await prueba('base para BBVA: solo la base nueva, y con corte de BBVA en el periodo dice SI o NO', async () => {
  // Periodo con bloques: 1-3 base nueva, 4 base anterior, 5 salida. Corte de BBVA dentro del periodo; el 1 reactivado con 2 días de trx.
  await p.evaluate(() => { const fx = window.__FX; fx._base = fx.rpc.v2_mi_base;
    fx.rpc.v2_mi_base = fx._base.slice(0, 5).map((c, i) => Object.assign({}, c, { origen: i < 3 ? 'base_nueva' : i === 3 ? 'base_anterior' : 'salida', bloque: 1, visitas: 1 },
      i === 0 ? { bbva_reactivado: '2026-02-01', dias_trx: 2 } : {}));
    fx.tablas.v2_resultados_bbva = [{ corte: '2026-02-01' }]; S.vista = 'directorio'; pintar(); }); await p.waitForTimeout(400);
  const [d] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), p.click('[data-base-bbva]')]);
  const f = salida('salida_base_prueba_bloques.xlsx'); await d.saveAs(f);
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
await prueba('base para BBVA (19/11): los comercios retirados por «Fuera de la base» no van, salvo que ya tengan una visita', async () => {
  await p.evaluate(() => { const fx = window.__FX; fx._base = fx.rpc.v2_mi_base;
    fx.rpc.v2_mi_base = ['ZZ000001', 'ZZ000002'].map(id => Object.assign({}, fx._base[0], { customer_id: id, documento: id, origen: 'base_nueva', bloque: 1, visitas: 0 }));
    fx.tablas.v2_retiros_temporales = [{ customer_id: 'ZZ000002', motivo: 'Fuera de la base final v2 (19/11/2026)' }]; S.vista = 'directorio'; pintar(); }); await p.waitForTimeout(400);
  const [d] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), p.click('[data-base-bbva]')]);
  const f = salida('salida_base_fuera.xlsx'); await d.saveAs(f);
  const ExcelJS = (await import('exceljs')).default, xw = new ExcelJS.Workbook(); await xw.xlsx.readFile(f);
  const b = xw.getWorksheet('Base'), cb = b.getRow(1).values.slice(1).map(String);
  const cids = []; for (let r = 2; r <= b.rowCount; r++) cids.push(b.getCell(r, cb.indexOf('Customer_ID') + 1).value);
  assert.deepEqual(cids, ['ZZ000001'], 'el retirado por salir de la base no debe ir');
  fs.unlinkSync(f);
  await p.evaluate(() => { const fx = window.__FX; fx.rpc.v2_mi_base = fx._base; delete fx.tablas.v2_retiros_temporales; });
  await p.evaluate(() => cargarBase());
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
await prueba('base 2026-11: selector de ejecutivo, «Ver su celular», meta contra la base nueva y cargas por RUC o DNI', async () => {
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
    elegirEj('todos'); S.ver = false; S.vista = 'validacion'; pintar(); }, [filas, nuevas, E2]);
  await p.waitForTimeout(300);
  assert.equal(await p.evaluate(() => S.base.some(c => c.customer_id === '00000017')), false, 'un comercio de «salida» sin visita sigue en la cartera');
  // selector de ejecutivo: todas las vistas se leen con él
  assert.equal(await p.locator('#btnCel').isHidden(), true, '«Ver su celular» solo con un ejecutivo elegido');
  await p.selectOption('#gEj', EJECUTIVO.correo); await p.waitForTimeout(300);
  // «Por ejecutivo» y Visitas cuentan contra la meta solo la base nueva (Jose, 21/10); la base anterior va aparte
  await p.evaluate(() => { S.vista = 'equipo'; pintar(); }); await p.waitForTimeout(300);
  assert.match((await p.locator('.tile', { hasText: 'Comercios nuevos visitados' }).first().innerText()).replace(/\s+/g, ' '), /comercios nuevos visitados 2 \/ 160/i, 'Por ejecutivo suma la base anterior o comercios de antes: ' + (await p.locator('.tile', { hasText: 'Comercios nuevos visitados' }).first().innerText()));
  await p.evaluate(() => { S.vista = 'validacion'; S.dia = 'periodo'; pintar(); }); await p.waitForTimeout(300);
  assert.match((await p.locator('.tile', { hasText: 'Comercios visitados' }).first().innerText()).replace(/\s+/g, ' '), /comercios visitados 2 \/ 160.*1 fuera de la base nueva, aparte/i, 'Visitas suma la base anterior');
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
await prueba('Equipo (25/11): nuevos y revisitas, la revisita no suma a la meta, sin scroll lateral y el feriado no cuenta', async () => {
  const antes = await p.evaluate(() => { S.vista = 'equipo'; elegirEj('todos'); pintar(); return S.act.length; }); await p.waitForTimeout(300);
  const nuevos0 = await p.evaluate(() => Number(document.querySelector('.tile.acc .v').childNodes[0].textContent));
  // segunda visita al comercio 1, más tarde y con otra decisión: es una revisita y avanzó
  const rev = visita(1, { id: '00000000-0000-0000-0000-000000000099', visitado_en: `${hoy}T21:30:00Z`, recibido_en: `${hoy}T21:30:30Z`, decision: 'Realizará consumos' });
  await p.evaluate(v => { S.act = S.act.concat([v]); pintar(); }, rev); await p.waitForTimeout(300);
  const nuevos1 = await p.evaluate(() => Number(document.querySelector('.tile.acc .v').childNodes[0].textContent));
  assert.equal(nuevos1, nuevos0, 'la revisita no debe sumar a los comercios nuevos');
  const t = (await p.locator('.tile', { hasText: 'Revisitas' }).first().innerText()).replace(/\s+/g, ' ');
  assert.match(t, /Revisitas 1/i, 'el cuadro de revisitas no cuenta la nueva revisita: ' + t);
  await p.evaluate(() => document.querySelectorAll('details.mu-det').forEach(d => { d.open = true; }));   // el detalle por día y las revisitas van plegados
  const lista = (await p.locator('.eq-2 .panel').nth(1).innerText()).replace(/\s+/g, ' ');
  assert.ok(/Comercio Prueba 1/.test(lista) && /revisita 2/.test(lista) && /avanzó/.test(lista), 'la lista de revisitas no muestra la gestión: ' + lista);
  assert.ok(await p.locator('table.matriz small.rv').count() > 0, 'la tabla por día no muestra las revisitas');
  // sin scroll hacia la derecha: la página, el resumen y la tabla por día caben en su cuadro
  const ancho = await p.evaluate(() => { const el = document.querySelector('.contenido') || document.body; const t = document.querySelector('table.eq-res'), d = document.querySelector('.eq-dias');
    return { pag: document.documentElement.scrollWidth <= innerWidth + 1, cont: el.scrollWidth <= el.clientWidth + 2, resumen: t.scrollWidth <= t.parentElement.clientWidth + 2, dias: d.scrollWidth <= d.clientWidth + 2 }; });
  assert.deepEqual(ancho, { pag: true, cont: true, resumen: true, dias: true }, 'hay scroll lateral: ' + JSON.stringify(ancho));
  if (process.env.CAPTURAS) await p.screenshot({ path: path.join(process.env.CAPTURAS, 'equipo.png'), fullPage: true });
  // feriado: 19/11 a 18/12 tiene 22 días de lunes a viernes; sin el 8/12 son 21, y la meta total no cambia
  const h = await p.evaluate(() => { const g = S.periodo; S.periodo = { id: 'X', ini: '2026-11-19', fin: '2026-12-18' }; const r = habiles(); S.periodo = g; return r; });
  assert.equal(h.total, 21, 'el 8/12 debe quedar fuera de los días hábiles: ' + h.total);
  await p.evaluate(n => { S.act = S.act.slice(0, n); pintar(); }, antes);
});
await prueba('Equipo: una primera visita sin ubicación no vuelve revisita a la siguiente (cuenta como nueva)', async () => {
  await p.evaluate(() => { window.__ho = S.hayOrigen; S.hayOrigen = false; S.vista = 'equipo'; elegirEj('todos'); pintar(); }); await p.waitForTimeout(300);
  const n0 = await p.evaluate(() => Number(document.querySelector('.tile.acc .v').childNodes[0].textContent));
  const sin = visita(1, { id: '00000000-0000-0000-0000-0000000000b1', customer_id: '00000008', visitado_en: `${hoy}T20:00:00Z`, recibido_en: `${hoy}T20:00:30Z`, lat: null, lng: null });
  const con = visita(1, { id: '00000000-0000-0000-0000-0000000000b2', customer_id: '00000008', visitado_en: `${hoy}T21:00:00Z`, recibido_en: `${hoy}T21:00:30Z` });
  await p.evaluate(v => { window.__act0 = S.act; S.act = S.act.concat(v); pintar(); }, [sin, con]); await p.waitForTimeout(300);
  const n1 = await p.evaluate(() => Number(document.querySelector('.tile.acc .v').childNodes[0].textContent));
  assert.equal(n1, n0 + 1, 'la segunda visita (con ubicación) debe contar como comercio nuevo: ' + n0 + ' -> ' + n1);
  await p.evaluate(() => { S.act = window.__act0; S.hayOrigen = window.__ho; pintar(); });
});
await prueba('Directorio: selector de periodo, cobertura, contacto y dirección errada; reactivados solo en periodos cerrados', async () => {
  const cerrada = visita(1, { id: '00000000-0000-0000-0000-0000000000a1', periodo: 'CERRADO', visitado_en: '2025-01-10T15:00:00Z', recibido_en: '2025-01-10T15:00:30Z', plazo_hasta: '2025-01-11' });
  const cierre = { periodo: 'CERRADO', correo: EJECUTIVO.correo, ejecutivo: EJECUTIVO.nombre, nombre: 'P0 · prueba', ini: '2025-01-01', fin: '2025-01-31', modelo: 'Modelo de prueba', aprobado_en: '2025-01-31', enviado_en: null,
    incentivo_pct: 20, pagado_pct: 16, retenido_pct: 4, alcances: [], detalle: {}, reactivados_lista: 5, reactivados_ya_facturaban: 1 };
  await p.evaluate(({ c, ci, bc }) => { const fx = window.__FX, act = fx.rpc.v2_actividad, base = fx.rpc.v2_mi_base; fx._act = act; fx._base2 = base;
    fx.rpc.v2_actividad = a => a && a.p_desde === '2025-01-01' ? [c] : act; fx.rpc.v2_mi_base = a => a && a.p_periodo === 'CERRADO' ? bc : base;
    fx.rpc.v2_cierres_equipo = [ci]; fx.tablas.v2_periodos = [{ id: 'PRUEBA', ini: '2026-01-01', fin: '2099-12-31' }, { id: 'CERRADO', ini: '2025-01-01', fin: '2025-01-31' }];
    S.cierres = null; S.periodos = null; S.dirPer = null; S.dirDatos = null; fx._ver = S.ver; S.ver = true; S.vista = 'directorio'; elegirEj('todos'); pintar(); }, { c: cerrada, ci: cierre, bc: [comercio(1), comercio(2)] });
  await p.waitForTimeout(600);
  assert.equal(await p.locator('#cabPer option').count(), 2, 'falta el desplegable de periodo');
  const tile = async k => (await p.locator('.tile', { hasText: k }).first().innerText()).replace(/\s+/g, ' ');
  assert.match(await tile('Cobertura'), /Cobertura \d+ %/i, 'cobertura del periodo en curso: ' + await tile('Cobertura'));
  assert.match(await tile('Contacto'), /Contacto \d+ %/i); assert.match(await tile('Dirección errada'), /Dirección errada \d+ %/i);
  assert.match(await tile('Reactivados BBVA'), /Reactivados BBVA — /i, 'el periodo en curso no debe mostrar reactivados: ' + await tile('Reactivados BBVA'));
  await p.selectOption('#cabPer', 'CERRADO'); await p.waitForTimeout(700);
  assert.match(await tile('Reactivados BBVA'), /Reactivados BBVA 5 /i, 'el periodo cerrado muestra los reactivados del cierre: ' + await tile('Reactivados BBVA'));
  assert.match(await tile('Cobertura'), /Cobertura 50 %/i, 'la cobertura del periodo cerrado sale de su propia base (1 de 2): ' + await tile('Cobertura'));
  if (process.env.CAPTURAS) await p.screenshot({ path: path.join(process.env.CAPTURAS, 'directorio.png'), fullPage: true });
  const tabla = (await p.locator('table.datos').first().innerText()).replace(/\s+/g, ' ');
  assert.ok(/20 ?%/.test(tabla), 'el incentivo del cierre no aparece por ejecutivo: ' + tabla);
  // el gráfico de Equipo no se estira ni hace scroll lateral
  await p.evaluate(() => { S.vista = 'equipo'; pintar(); }); await p.waitForTimeout(400);
  const gr = await p.evaluate(() => { const g = document.querySelector('.graf-ej'), c = document.querySelector('#contenido'); return { h: Math.round(g.getBoundingClientRect().height), w: Math.round(g.getBoundingClientRect().width), sc: c.scrollWidth - c.clientWidth }; });
  assert.ok(gr.h <= 300 && gr.w <= 1100 && gr.sc <= 1, 'el gráfico de Equipo es muy grande o hace scroll: ' + JSON.stringify(gr));
  await p.evaluate(() => { S.vista = 'directorio'; pintar(); }); await p.waitForTimeout(300);
  // Equipo sigue el periodo elegido arriba: el cerrado cuenta sus propias visitas (1), no las del periodo en curso
  await p.evaluate(() => { S.vista = 'equipo'; pintar(); }); await p.waitForTimeout(500);
  const eq = (await p.locator('.tile', { hasText: 'Comercios nuevos visitados' }).first().innerText()).replace(/\s+/g, ' ');
  assert.match(eq, /comercios nuevos visitados 1 \/ \d+/i, 'Equipo no usó el periodo cerrado: ' + eq);
  await p.evaluate(() => { S.vista = 'directorio'; pintar(); }); await p.waitForTimeout(300);
  await p.evaluate(() => { const fx = window.__FX; fx.rpc.v2_actividad = fx._act; fx.rpc.v2_mi_base = fx._base2; delete fx.rpc.v2_cierres_equipo; fx.tablas.v2_periodos = { id: 'PRUEBA', ini: '2026-01-01', fin: '2099-12-31' }; S.cierres = null; S.periodos = null; S.dirDatos = null; S.dirPer = null; S.ver = fx._ver; S.vista = 'validacion'; pintar(); });
});
await prueba('Lectura de actividad: más de 1.000 filas se leen partiendo el rango por fechas, sin perder ninguna', async () => {
  const r = await p.evaluate(async () => {
    const fx = window.__FX, ant = fx.rpc.v2_actividad, filas = [];
    for (let i = 0; i < 12; i++) for (let j = 0; j < 100; j++) filas.push({ id: 'x' + i + '-' + j, visitado_en: `2026-02-${String(i + 1).padStart(2, '0')}T15:00:00Z` });
    fx.rpc.v2_actividad = a => filas.filter(f => { const d = f.visitado_en.slice(0, 10); return d >= a.p_desde && d <= a.p_hasta; });
    const out = await leerActividad('2026-02-01', '2026-02-12'); fx.rpc.v2_actividad = ant;
    return { n: out.data.length, error: out.error, ids: new Set(out.data.map(v => v.id)).size, orden: out.data.every((v, i, l) => !i || new Date(l[i - 1].visitado_en) >= new Date(v.visitado_en)) };
  });
  assert.equal(r.error, null); assert.equal(r.n, 1200, 'se perdieron filas: ' + r.n); assert.equal(r.ids, 1200, 'hay filas repetidas'); assert.equal(r.orden, true, 'no queda ordenada de la más reciente a la más antigua');
});
await prueba('Mapa (26/11): registros, alertas de mismo punto y de domicilio, validación y domicilios de referencia', async () => {
  const HOME = [{ id: 1, correo: EJECUTIVO.correo, ejecutivo: EJECUTIVO.nombre, etiqueta: 'Casa de prueba', lat: -12.0931, lng: -77.0465, exactitud: 'aproximado', nota: null, creado_por: ANALISTA.correo, creado_en: `${hoy}T10:00:00Z` }];
  const lejos = visita(1, { id: '00000000-0000-0000-0000-0000000000d1', customer_id: '00000009', comercio: 'Comercio Prueba 9', distancia_m: 2000, visitado_en: `${hoy}T22:00:00Z`, recibido_en: `${hoy}T22:00:30Z`, lat: -12.0932, lng: -77.0466 });
  const mp1 = visita(1, { id: '00000000-0000-0000-0000-0000000000d2', customer_id: '00000010', comercio: 'Comercio Prueba 10', distancia_m: 700, visitado_en: `${hoy}T22:10:00Z`, recibido_en: `${hoy}T22:10:30Z`, lat: -12.0932, lng: -77.0466 });
  const anul = visita(1, { id: '00000000-0000-0000-0000-0000000000d3', customer_id: '00000011', comercio: 'Comercio Prueba 11', estado_anul: 'anulada', anul_motivo: 'Visita duplicada de prueba', visitado_en: `${hoy}T22:20:00Z`, recibido_en: `${hoy}T22:20:30Z` });
  await p.evaluate(({ h, l, m, a }) => { const fx = window.__FX; fx._actU = S.act; fx.rpc.v2_domicilios = h; S.act = S.act.concat([l, m, a]); S.domicilios = null; S.domErr = ''; S.geo = []; S.geoErr = ''; S.muTab = 'reg'; S.muSel = null; S.muFil = ''; S.muVista = null; S.dirPer = null; S.vista = 'mapa'; elegirEj('todos'); pintar(); },
    { h: HOME, l: lejos, m: mp1, a: anul });
  await p.waitForTimeout(800);
  // Registros: de la más lejana a la más cercana, con el conteo por cercanía
  const esp = await p.evaluate(() => { const c = { ok: 0, med: 0, mal: 0, no: 0 }; S.act.filter(v => v.estado_anul !== 'anulada').forEach(v => { c[v.lat == null ? 'no' : claseDist(v)]++; }); return c; });
  assert.ok(esp.mal >= 2, 'debían quedar al menos 2 visitas lejos');
  assert.match(await p.locator('[data-mu-fil="mal"]').innerText(), new RegExp('Lejos · ' + esp.mal), 'contador «Lejos»');
  assert.match(await p.locator('tr[data-mu-v]').first().innerText(), /Comercio Prueba 9/, 'la más lejana debe ir primero');
  // alertas «mismo punto» (nivel alta por el comercio a 700 m) y de «domicilio»
  assert.ok((await p.evaluate(() => alertasMismoPunto().map(g => g.nivel))).includes('alta'), 'falta la alerta alta de «mismo punto»');
  await p.click('[data-mu-tab="ale"]'); await p.waitForTimeout(300);
  let t = await p.locator('.mu-cuerpo').innerText();
  assert.ok(/Comercio Prueba 10/.test(t), 'la alerta de mismo punto no lista los comercios'); assert.ok(/Comercio Prueba 9/.test(t) && /cerca del domicilio/i.test(t), 'falta la alerta de domicilio');
  const dom = await p.evaluate(() => alertasDomicilio().map(o => [o.v.comercio, o.nivel, o.m]));
  assert.ok(dom.some(x => x[0] === 'Comercio Prueba 9' && x[1] === 'alta'), 'falta la alerta de domicilio alta: ' + JSON.stringify(dom));
  assert.ok(!dom.some(x => x[0] === 'Comercio Prueba 1'), 'una visita con el comercio cerca no es alerta de domicilio');
  await p.locator('tr[data-mu-v]').first().click(); await p.waitForTimeout(500);
  assert.ok(await p.evaluate(() => !!S.muSel), 'no seleccionó el registro de la alerta');
  // validación, plazo y anulaciones (sección plegable)
  await p.evaluate(() => document.querySelectorAll('details.mu-det').forEach(d => { d.open = true; }));
  t = await p.locator('#contenido').innerText();
  assert.ok(/Anulaciones y su motivo/.test(t) && /Visita duplicada de prueba/.test(t), 'falta la anulación con su motivo');
  // domicilios: se guardan con coordenadas numéricas y se borran con confirmación; sin números no se llama
  await p.fill('#domLat', 'abc'); await p.fill('#domLng', '-77.05'); await p.evaluate(() => { window.__llamadas.length = 0; });
  await p.click('[data-dom-guardar]'); await p.waitForTimeout(200);
  assert.equal(await p.evaluate(() => window.__llamadas.filter(l => l[0] === 'v2_guardar_domicilio').length), 0, 'no debe guardar con una latitud que no es número');
  await p.fill('#domLat', '-12,1'); await p.fill('#domEt', 'Nuevo'); await p.evaluate(() => { window.__FX.rpc.v2_guardar_domicilio = 5; });
  await p.click('[data-dom-guardar]'); await p.waitForTimeout(400);
  const g = await p.evaluate(() => window.__llamadas.find(l => l[0] === 'v2_guardar_domicilio'));
  assert.ok(g && g[1].p_lat === -12.1 && g[1].p_lng === -77.05 && g[1].p_correo === 'ejecutivo.prueba@ejemplo.com' && g[1].p_exactitud === 'aproximado', 'argumentos de guardar: ' + JSON.stringify(g));
  await p.evaluate(() => document.querySelectorAll('details.mu-det').forEach(d => { d.open = true; }));
  p.once('dialog', d => d.accept().catch(() => {})); await p.evaluate(() => { window.__FX.rpc.v2_borrar_domicilio = null; });
  await p.click('[data-dom-borrar="1"]'); await p.waitForTimeout(400);
  assert.deepEqual(await p.evaluate(() => window.__llamadas.find(l => l[0] === 'v2_borrar_domicilio')), ['v2_borrar_domicilio', { p_id: 1 }]);
  // si la migración todavía no está aplicada, la pestaña avisa y el resto funciona
  await p.evaluate(() => { window.__FX.rpc.v2_domicilios = () => ({ __error: 'function public.v2_domicilios() does not exist' }); S.domicilios = null; S.domErr = ''; S.muTab = 'ale'; pintar(); }); await p.waitForTimeout(600);
  assert.match(await p.locator('.mu-cuerpo').innerText(), /todavía no están habilitados/, 'debe avisar que los domicilios no están habilitados');
  await p.evaluate(() => { const fx = window.__FX; S.act = fx._actU; delete fx.rpc.v2_domicilios; delete fx.rpc.v2_guardar_domicilio; delete fx.rpc.v2_borrar_domicilio; S.domicilios = null; S.domErr = ''; S.muSel = null; S.muTab = 'dis'; S.vista = 'validacion'; pintar(); });
});
await prueba('Alerta de domicilio (26/11): se descarta si la dirección cargada del comercio está en la zona del domicilio; se mantiene si solo hay un punto tomado de una visita', async () => {
  const cerca = { lat: -12.0932, lng: -77.0466, distancia_m: 2000 };
  const A = visita(1, { id: '00000000-0000-0000-0000-0000000000e1', customer_id: '00000021', comercio: 'Comercio A', ...cerca, ref_lat: -12.0931, ref_lng: -77.0465, ref_calidad: 'numero', visitado_en: `${hoy}T23:00:00Z` });
  const B = visita(1, { id: '00000000-0000-0000-0000-0000000000e2', customer_id: '00000022', comercio: 'Comercio B', ...cerca, ref_lat: -12.1300, ref_lng: -77.0100, ref_calidad: 'numero', direccion: 'AV. LEJANA 100', distrito: 'MIRAFLORES', visitado_en: `${hoy}T23:05:00Z` });
  const C = visita(1, { id: '00000000-0000-0000-0000-0000000000e3', customer_id: '00000023', comercio: 'Comercio C', ...cerca, ref_lat: -12.0931, ref_lng: -77.0465, ref_calidad: 'visita', visitado_en: `${hoy}T23:10:00Z` });
  const r = await p.evaluate(({ a, b, c }) => { const ant = S.act; S.act = [a, b, c]; S.domicilios = [{ id: 1, correo: a.correo, ejecutivo: 'Ejecutivo Prueba', etiqueta: 'Casa', lat: -12.0931, lng: -77.0465, exactitud: 'aproximado', nota: null }];
    const o = alertasDomicilio(); const res = { nombres: o.map(x => x.v.comercio).sort(), descartadas: o.descartadas, sinVerificar: o.filter(x => !x.pd).map(x => x.v.comercio), lejos: o.find(x => x.v.comercio === 'Comercio B').mc }; S.act = ant; S.domicilios = null; return res; }, { a: A, b: B, c: C });
  assert.deepEqual(r.nombres, ['Comercio B', 'Comercio C'], 'solo B (comercio lejos de verdad) y C (sin punto verificado) son alerta: ' + JSON.stringify(r));
  assert.equal(r.descartadas, 1, 'A debe descartarse: su dirección está en la zona del domicilio');
  assert.deepEqual(r.sinVerificar, ['Comercio C']); assert.ok(r.lejos > 2000, 'B queda a más de 2 km del domicilio: ' + r.lejos);
});
await prueba('Cierres de periodo: histórico, detalle con cuadre, ojo de privacidad y evolutivo del ejecutivo', async () => {
  const c = (periodo, nombre, ini, fin, inc, pag, ret, extra = {}) => Object.assign({ periodo, correo: EJECUTIVO.correo, ejecutivo: EJECUTIVO.nombre, nombre, ini, fin, modelo: 'Modelo de prueba',
    aprobado_en: fin, enviado_en: null, incentivo_pct: inc, pagado_pct: pag, retenido_pct: ret, alcances: [{ k: 'Visitados', v: '10 / 8' }], detalle: {}, reactivados_lista: 0, reactivados_ya_facturaban: 0 }, extra);
  await p.evaluate(rows => { window.__FX.rpc.v2_cierres_equipo = rows; window.__FX.rpc.v2_cierre_cuadre = [{ correo: rows[0].correo, visitados: 12, con_contacto: 7 }];
    S.cierres = null; S.cTab = 'hist'; S.ver = true; elegirEj('todos'); S.vista = 'cierres'; pintar(); },
    [c('2099-01', 'P1 · prueba', '2098-12-19', '2099-01-18', 15, 12, 3, { detalle: { nota_periodo: 'Marcha blanca de prueba' } }),
     c('2099-02', 'P2 · prueba', '2099-01-19', '2099-02-18', 22.5, 18, 4.5, { detalle: { visitas_desde: '2099-01-19', visitas_hasta: '2099-02-18', visitados: 12, con_contacto: 8, viaticos_por_reembolsar: 194.86, ajuste: 'Ajuste de prueba' }, reactivados_lista: 5, reactivados_ya_facturaban: 1 })]);
  await p.waitForTimeout(500);
  if (process.env.CAPTURAS) await p.screenshot({ path: path.join(process.env.CAPTURAS, 'cierres.png'), fullPage: true });
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
await prueba('10/11: la base de más de 1.000 filas se lee por tramos y no se pierde ningún comercio', async () => {
  // La API corta cada respuesta en 1.000 filas; con el bloque 2 el analista ve 1.124 comercios. La prueba entrega 2.150 filas.
  const r = await p.evaluate(async () => {
    const fx = window.__FX, guardada = fx.rpc.v2_mi_base;
    fx.rpc.v2_mi_base = Array.from({ length: 2150 }, (_, i) => ({ customer_id: 'X' + String(i).padStart(6, '0'), razon_social: 'COMERCIO ' + i, correo: null, origen: 'base_nueva', bloque: 1, visitas: i % 2, visitas_validas: i % 2 }));
    await cargarBase();
    const out = { filas: Object.keys(S.baseMap).length, ultimo: !!S.baseMap['X002149'], primero: !!S.baseMap['X000000'] };
    fx.rpc.v2_mi_base = guardada; await cargarBase();
    return out;
  });
  assert.equal(r.filas, 2150, 'se perdieron comercios al leer la base');
  assert.ok(r.ultimo && r.primero, 'faltan el primero o el último comercio');
});
await prueba('Menú (26/11): orden del prototipo 4.0, entrada en Directorio franja de cifras y sin menú de reportes', async () => {
  assert.deepEqual(await p.evaluate(() => VISTAS.filter(v => v[0] !== '--').map(v => v[0]).slice(0, 9)), ['directorio', 'resumen', 'equipo', 'mapa', 'cartera', 'validacion', 'tiempos', 'cierres', 'reporte'], 'orden del menú');
  assert.equal(await p.locator('#cabKpis .ck').count(), 6, 'la franja de cifras del periodo debe tener 6 datos');
  assert.match(await p.locator('#cabKpis').innerText(), /cartera asignada[\s\S]*visitados únicos[\s\S]*visitas realizadas[\s\S]*con contacto[\s\S]*reactivados BBVA/, 'textos de la franja');
  assert.equal(await p.locator('details.mas').count(), 0, 'ya no hay menú de reportes');
});
await prueba('Resumen, Tiempos y Reporte (26/11): cifras del CRM, mapa de calor por hora y ventana de trabajo', async () => {
  const ir = async v => { await p.evaluate(x => { S.vista = x; S.tTab = null; S.tDia = null; S.dirPer = null; elegirEj('todos'); pintar(); }, v); await p.waitForTimeout(400); };
  const esp = await p.evaluate(() => { const T = statsDir({ act: S.act, base: S.base, baseMap: S.baseMap, hayOrigen: S.hayOrigen }); return { asig: T.asig, vis: T.vis, reg: T.reg, con: T.con, vivas: vivas().length }; });
  await ir('resumen'); if (process.env.CAPTURAS) await p.screenshot({ path: path.join(process.env.CAPTURAS, 'resumen.png') });
  const r = (await p.locator('#contenido').innerText()).replace(/\s+/g, ' ');
  assert.match(r, /cartera asignada/i); assert.match(r, /Gestión por ejecutivo/); assert.ok(new RegExp(esp.asig + ' cartera asignada', 'i').test(r), 'cartera asignada no coincide: ' + r.slice(0, 300));
  assert.ok(new RegExp(esp.reg + ' visitas realizadas', 'i').test(r), 'visitas realizadas no coinciden');
  await ir('tiempos'); await p.evaluate(() => { S.tTab = 'acum'; pintar(); }); await p.waitForTimeout(300); if (process.env.CAPTURAS) await p.screenshot({ path: path.join(process.env.CAPTURAS, 'tiempos.png') });
  const tot = await p.evaluate(() => Number([...document.querySelectorAll('tr.total td')].map(t => t.innerText.trim()).filter(Boolean).slice(-1)[0]));
  const horasOk = await p.evaluate(() => vivas().length);
  assert.equal(tot, horasOk, 'el total del mapa de calor por hora debe sumar todas las visitas');
  for (const t of ['rangos', 'det', 'dia']) { await p.evaluate(x => { S.tTab = x; pintar(); }, t); await p.waitForTimeout(250); assert.ok((await p.locator('#contenido').innerText()).length > 50, 'Tiempos ' + t + ' vacío'); }
  await ir('reporte'); if (process.env.CAPTURAS) await p.screenshot({ path: path.join(process.env.CAPTURAS, 'reporte.png'), fullPage: true });
  const rp = (await p.locator('#contenido').innerText()).replace(/\s+/g, ' ');
  assert.match(rp, /Resumen del periodo/); assert.match(rp, /Franjas del día/); assert.match(rp, /Inicio prom/i); assert.ok(!/NaN/.test(rp), 'el reporte tiene NaN: ' + rp);
  assert.equal(await p.evaluate(() => { const j = jornadas(); return j.every(x => x.ventana == null ? x.n < 2 : x.ventana === x.fin - x.ini); }), true, 'ventana = última - primera visita');
  await p.evaluate(() => { S.vista = 'directorio'; pintar(); });
});
await prueba('Contraseña (26/11): «¿Olvidaste tu contraseña?», cambiar contraseña con validaciones y enlace de recuperación', async () => {
  await p.evaluate(() => { window.__llamadas.length = 0; });
  // desde la sesión abierta
  await p.click('[data-nueva-clave]'); await p.waitForTimeout(200);
  assert.equal(await p.locator('#fClave').count(), 1, 'no abrió la pantalla de contraseña nueva');
  await p.fill('#cClave1', 'corta'); await p.fill('#cClave2', 'corta'); await p.click('#bClave'); await p.waitForTimeout(150);
  assert.match(await p.locator('#fClave').innerText(), /al menos 8 caracteres/); assert.equal(await p.evaluate(() => window.__llamadas.filter(l => l[0] === 'auth.updateUser').length), 0, 'no debe guardar una clave corta');
  await p.fill('#cClave1', 'clave-larga-1'); await p.fill('#cClave2', 'clave-larga-2'); await p.click('#bClave'); await p.waitForTimeout(150);
  assert.match(await p.locator('#fClave').innerText(), /no coinciden/);
  await p.fill('#cClave1', 'clave-larga-1'); await p.fill('#cClave2', 'clave-larga-1'); await p.click('#bClave'); await p.waitForTimeout(300);
  assert.deepEqual(await p.evaluate(() => window.__llamadas.filter(l => l[0] === 'auth.updateUser')), [['auth.updateUser', { largo: 13 }]], 'la clave no se anota, solo su largo');
  assert.match(await p.locator('.login').innerText(), /quedó guardada/);
  await p.click('[data-clave-seguir]'); await p.waitForTimeout(400);
  assert.equal(await p.locator('#fClave').count(), 0); assert.ok(await p.locator('.rail').count() >= 1, 'debe volver al CRM');
  // enlace de recuperación: la pantalla de contraseña nueva aparece sin pasar por el CRM
  await p.evaluate(() => { S.nuevaClave = {}; pintar(); }); await p.waitForTimeout(150);
  assert.equal(await p.locator('#fClave').count(), 1); await p.evaluate(() => { S.nuevaClave = null; pintar(); });
  // en la pantalla de entrada: pide el correo y no revela si existe
  await p.evaluate(() => { window.__guardado = { s: S.sesion, y: S.yo }; S.sesion = null; S.yo = null; pintar(); });
  await p.click('[data-olvide]'); await p.waitForTimeout(150);
  assert.match(await p.locator('#lErr').innerText(), /Escribe tu correo/);
  await p.fill('#lCorreo', 'Alguien@Ejemplo.com'); await p.click('[data-olvide]'); await p.waitForTimeout(250);
  assert.match(await p.locator('#lErr').innerText(), /Si ese correo tiene acceso/);
  const r = await p.evaluate(() => window.__llamadas.find(l => l[0] === 'auth.resetPasswordForEmail'));
  assert.equal(r[1].correo, 'alguien@ejemplo.com'); assert.match(r[1].redirectTo, /\/$|\.html$|\/escritorio\/?$/);
  await p.evaluate(() => { S.sesion = window.__guardado.s; S.yo = window.__guardado.y; pintar(); }); await p.waitForTimeout(200);
});
await prueba('Directorio con la línea vertical de lo esperado (26/11)', async () => {
  await p.evaluate(() => { S.vista = 'directorio'; S.dirPer = null; elegirEj('todos'); pintar(); }); await p.waitForTimeout(500);
  assert.ok(await p.locator('.barrita .esp').count() >= 1, 'falta la línea vertical de lo esperado en el Directorio');
  assert.match(await p.locator('.barrita .esp').first().getAttribute('title'), /Esperado a hoy: \d+ %/);
});
await prueba('Mapa único (26/11): un solo mapa con distritos, visitas, por visitar, registros, alertas y sin ubicar', async () => {
  await p.setViewportSize({ width: 1366, height: 768 });
  await p.evaluate(() => { S.geo = [{ clave: 'SAN ISIDRO', nombre: 'San Isidro', provincia: 'LIMA', geometria: { type: 'Polygon', coordinates: [[[-77.06, -12.08], [-77.03, -12.08], [-77.03, -12.11], [-77.06, -12.11], [-77.06, -12.08]]] } }]; S.geoErr = ''; S.muTab = 'dis'; S.muSel = null; S.muVista = null; S.muModo = 'ej'; S.dirPer = null; S.vista = 'mapa'; elegirEj('todos'); pintar(); }); await p.waitForTimeout(1500);
  assert.equal(await p.locator('#mapaUnico').count(), 1, 'falta el mapa único');
  const nav = (await p.locator('#nav').innerText()); assert.ok(!/Ubicación/.test(nav) && /Mapa/.test(nav) && !/Mapa de calor/.test(nav), 'el menú debe tener un solo «Mapa»: ' + nav);
  // el mapa y el panel caben al lado del menú lateral, sin scroll horizontal
  const caja = await p.evaluate(() => { const m = document.querySelector('.mu-mapa-card').getBoundingClientRect(), q = document.querySelector('.mu-panel').getBoundingClientRect(), c = document.querySelector('#contenido'); return { mw: Math.round(m.width), pw: Math.round(q.width), mh: Math.round(document.querySelector('#mapaUnico').getBoundingClientRect().height), sc: c.scrollWidth - c.clientWidth }; });
  assert.ok(caja.mw >= 520 && caja.pw >= 360, 'mapa o panel demasiado angostos con el menú lateral: ' + JSON.stringify(caja)); assert.ok(caja.mh >= 400 && caja.mh <= 640, 'alto del mapa fuera de rango (debe quedar entre 400 y 640 px): ' + caja.mh); assert.ok(caja.sc <= 1, 'hay scroll horizontal');
  if (process.env.CAPTURAS) await p.screenshot({ path: path.join(process.env.CAPTURAS, 'mapa_unico.png') });
  // el mapa dibuja el distrito, las visitas y los comercios por visitar, y se puede acercar con la rueda
  const dib = await p.evaluate(() => ({ rueda: S._mapaUnico.scrollWheelZoom.enabled(), trazos: document.querySelectorAll('#mapaUnico path.leaflet-interactive').length, esperados: S.act.filter(v => v.estado_anul !== 'anulada' && v.lat != null).length + porVisitarMapa().length + 1 }));
  assert.equal(dib.rueda, true, 'la rueda del mouse debe acercar el mapa'); assert.ok(dib.trazos >= dib.esperados, 'el mapa no dibuja todo: ' + JSON.stringify(dib));
  // el cuadro de la derecha sale completo: sin scroll interno ni tope de alto
  const cuadro = await p.evaluate(() => { const c = document.querySelector('.mu-cuerpo'); return { sh: c.scrollHeight, ch: c.clientHeight, ov: getComputedStyle(c).overflowY }; });
  assert.ok(cuadro.sh <= cuadro.ch + 1 && cuadro.ov !== 'auto' && cuadro.ov !== 'scroll', 'el cuadro tiene scroll interno: ' + JSON.stringify(cuadro));
  for (const k of ['dis', 'reg', 'ale', 'sin']) { await p.click(`[data-mu-tab="${k}"]`); await p.waitForTimeout(250); const corte = await p.evaluate(() => { const c = document.querySelector('.mu-cuerpo'), tb = c.querySelector('table'); return tb ? tb.scrollWidth - c.clientWidth : 0; }); assert.ok(corte <= 1, 'el cuadro "' + k + '" se corta por la derecha: ' + corte + ' px'); }
  for (const t of ['reg', 'ale', 'sin', 'dis']) { await p.click(`[data-mu-tab="${t}"]`); await p.waitForTimeout(400); assert.ok((await p.locator('.mu-cuerpo').innerText()).length > 20, 'pestaña vacía: ' + t); }
  await p.click('[data-mu-tab="reg"]'); await p.waitForTimeout(300);
  const pv = await p.evaluate(() => porVisitarMapa().length);
  assert.equal((await p.locator('label:has(#muPen)').innerText()).trim(), 'Por visitar (' + pv + ')');
  const n = await p.locator('tr[data-mu-v]').count(); assert.ok(n >= 1, 'la lista de registros no muestra visitas');
  await p.locator('tr[data-mu-v]').first().click(); await p.waitForTimeout(800);
  assert.ok(await p.evaluate(() => !!S.muSel && S.muSel.t === 'v'), 'no seleccionó el registro');
  for (let k = 0; k < 4; k++) { await p.evaluate(() => pintar()); await p.waitForTimeout(150); }
  assert.equal(await p.locator('#contenido .leaflet-container').count(), 1, 'cada pintar() debe dejar un solo mapa vivo');
  await p.click('[data-mu-modo="cob"]'); await p.selectOption('#muEj', { index: 1 }); await p.waitForTimeout(500);
  assert.ok(await p.evaluate(() => S.ej !== 'todos'), 'el chip de ejecutivo no filtró');
  await p.evaluate(() => { S.vista = 'directorio'; S.muSel = null; elegirEj('todos'); pintar(); }); await p.waitForTimeout(300);
  await p.setViewportSize({ width: 1500, height: 900 });
});
await prueba('Avance acumulado contra lo esperado en Equipo y en Resumen (26/11)', async () => {
  await p.evaluate(() => { S.vista = 'equipo'; S.dirPer = null; elegirEj('todos'); pintar(); }); await p.waitForTimeout(400);
  if (process.env.CAPTURAS) await p.screenshot({ path: path.join(process.env.CAPTURAS, 'equipo.png') });
  assert.equal(await p.locator('.graf-acu').count(), 1, 'falta el gráfico de avance acumulado en Equipo');
  assert.ok(await p.locator('.graf-acu path[stroke="var(--naranja)"]').count() >= 1, 'falta la línea de lo esperado');
  const g = await p.evaluate(() => { const e = document.querySelector('.graf-acu').getBoundingClientRect(); return { h: Math.round(e.height), w: Math.round(e.width) }; }); assert.ok(g.h <= 350 && g.w <= 720, 'el gráfico acumulado es muy grande: ' + JSON.stringify(g));
  await p.evaluate(() => { S.vista = 'resumen'; pintar(); }); await p.waitForTimeout(400);
  assert.ok(await p.locator('#contenido .barrita u').count() >= 1, 'falta la marca de lo esperado en el Resumen');
  assert.match(await p.locator('#contenido').innerText(), /esperado \d+/);
  await p.evaluate(() => { S.vista = 'directorio'; pintar(); });
});
await prueba('Seguimiento remoto (26/11): conteo en la franja y cuadro en el Resumen', async () => {
  await p.evaluate(() => { window.__FX.tablas.v2_seguimientos = [{ customer_id: S.base[0].customer_id, correo: S.base[0].correo, canal: 'WhatsApp', resultado: 'Respondió: aún no decide', nota: 'Pidió que lo llamen el lunes', hecho_en: new Date().toISOString() }]; S.segs = null; S.dirPer = null; S.vista = 'resumen'; elegirEj('todos'); pintar(); }); await p.waitForTimeout(700);
  assert.match(await p.locator('#cabKpis').innerText(), /1\s+seguimientos/i, 'la franja no cuenta los seguimientos: ' + await p.locator('#cabKpis').innerText());
  const t = await p.locator('#contenido').innerText();
  assert.match(t, /Seguimiento remoto del periodo/); assert.match(t, /WhatsApp/); assert.match(t, /aún no decide/); assert.match(t, /Pidió que lo llamen el lunes/);
  await p.evaluate(() => { delete window.__FX.tablas.v2_seguimientos; S.segs = null; S.vista = 'directorio'; pintar(); });
});
await prueba('Cartera (26/11): los comercios del periodo con su última visita, búsqueda y estado', async () => {
  await p.evaluate(() => { S.vista = 'cartera'; S.carQ = ''; S.carEst = ''; elegirEj('todos'); pintar(); }); await p.waitForTimeout(400);
  const tot = await p.evaluate(() => S.base.filter(c => c.correo && (!S.hayOrigen || c.origen === 'base_nueva')).length);
  assert.equal(await p.locator('#contenido tbody tr').count(), tot, 'la Cartera debe listar todos los comercios del periodo');
  await p.selectOption('#carEst', 'por'); await p.waitForTimeout(300);
  const por = await p.evaluate(() => { const v = new Set(S.act.filter(x => x.estado_anul !== 'anulada').map(x => x.customer_id)); return S.base.filter(c => c.correo && (!S.hayOrigen || c.origen === 'base_nueva') && !v.has(c.customer_id)).length; });
  assert.equal(await p.locator('#contenido tbody tr').count(), por, 'el filtro «Por visitar» no cuadra');
  await p.evaluate(() => { S.carEst = ''; S.vista = 'directorio'; pintar(); });
});
await prueba('Comercios aparte de la base (26/11): se ven aparte, no suman y el resto queda como base nueva; sin la función todo sigue igual', async () => {
  const r = await p.evaluate(async () => {
    const fx = window.__FX, hay0 = S.hayOrigen, cid = S.base.find(c => c.correo).customer_id, per = S.periodo.id, o0 = S.baseMap[cid].origen, nu0 = S.base.filter(c => c.correo && c.origen === 'base_nueva').length;
    fx.rpc.v2_apartes = [{ periodo: per, customer_id: cid }]; await cargarBase();
    const a = { hay: S.hayOrigen, origen: S.baseMap[cid].origen, suma: sumaMeta(cid), otros: S.base.filter(x => x.customer_id !== cid && x.correo).every(x => x.origen), cartera: S.base.filter(c => c.correo && c.origen === 'base_nueva').length, esperada: S.hayOrigen && hay0 ? nu0 - (o0 === 'base_nueva' ? 1 : 0) : S.base.filter(x => x.customer_id !== cid && x.correo).length };
    S.apartes = undefined; fx.rpc.v2_apartes = () => ({ __error: 'function public.v2_apartes() does not exist' }); await cargarBase();
    a.sinFuncion = S.hayOrigen === hay0 && S.baseMap[cid].origen === o0;
    delete fx.rpc.v2_apartes; await cargarBase(); return a; });
  assert.equal(r.hay, true); assert.equal(r.origen, 'base_anterior'); assert.equal(r.suma, false, 'no debe sumar a la meta'); assert.ok(r.otros, 'el resto debe quedar con origen');
  assert.equal(r.cartera, r.esperada, 'la cartera debe quedar sin el comercio aparte'); assert.ok(r.sinFuncion, 'sin la función no debe cambiar nada');
});
await prueba('Tiempos · Resumen diario rediseñado (26/11): una tarjeta por ejecutivo más la del equipo, y día anterior/siguiente', async () => {
  const d0 = await p.evaluate(() => { S.vista = 'tiempos'; S.tTab = 'dia'; S.tDia = iso(S.act[0].visitado_en); elegirEj('todos'); pintar(); return S.tDia; }); await p.waitForTimeout(400);
  const nEj = await p.evaluate(() => S.ejecutivos.length);
  assert.equal(await p.locator('.tm-card').count(), nEj + 1, 'una tarjeta por ejecutivo y la del equipo');
  const t = await p.locator('.tm-cards').innerText(); assert.match(t, /Primera visita/); assert.match(t, /Ventana del día/); assert.match(t, /Hora pico/);
  assert.equal(await p.locator('details.mu-det table.tiempos').count(), 1, 'la tabla por hora queda plegada');
  const n0 = await p.evaluate(() => vivas().filter(v => iso(v.visitado_en) === S.tDia).length);
  assert.equal((await p.locator('.tm-card.eq .tm-n b').innerText()).trim(), String(n0), 'el total del equipo debe cuadrar con las visitas del día');
  await p.click('[data-tdia-mas="1"]'); await p.waitForTimeout(300);
  assert.notEqual(await p.evaluate(() => S.tDia), d0, 'el día debe avanzar'); await p.click('[data-tdia-mas="-1"]'); await p.waitForTimeout(300);
  assert.equal(await p.evaluate(() => S.tDia), d0, 'el día debe volver');
  await p.evaluate(() => { S.vista = 'directorio'; pintar(); });
});
await prueba('Vista del ejecutivo (26/11): interruptor, menú de 4 pestañas, un solo ejecutivo y vuelta a supervisión', async () => {
  await p.evaluate(() => { S.modo = 'sup'; S.vista = 'directorio'; elegirEj('todos'); pintar(); }); await p.waitForTimeout(300);
  assert.equal(await p.locator('#btnModo').innerText(), 'Ver como ejecutivo');
  await p.click('#btnModo'); await p.waitForTimeout(600);
  assert.deepEqual(await p.locator('#nav button').allInnerTexts(), ['Mi avance', 'Mi cartera', 'Mis alertas', 'Mi mapa']);
  assert.notEqual(await p.evaluate(() => S.ej), 'todos', 'debe quedar un ejecutivo elegido');
  assert.equal(await p.locator('#gEj option[value="todos"]').count(), 0, 'en la vista del ejecutivo no hay «Equipo completo»');
  assert.match(await p.locator('#contenido').innerText(), /mi cartera/i); assert.match(await p.locator('#contenido').innerText(), /mi ritmo/i);
  await p.click('[data-eje="cartera"]'); await p.waitForTimeout(400);
  assert.equal(await p.locator('#nav button.on').innerText(), 'Mi cartera');
  await p.click('[data-eje="alertas"]'); await p.waitForTimeout(700);
  assert.equal(await p.locator('#nav button.on').innerText(), 'Mis alertas'); assert.equal(await p.evaluate(() => S.muTab), 'ale');
  assert.equal(await p.locator('#muEj option[value="todos"]').count(), 0, 'el mapa del ejecutivo no ofrece el equipo completo');
  await p.click('[data-eje="mapa"]'); await p.waitForTimeout(500); assert.equal(await p.locator('#nav button.on').innerText(), 'Mi mapa');
  await p.click('#btnModo'); await p.waitForTimeout(500);
  assert.equal(await p.evaluate(() => [S.modo, S.vista, S.ej].join()), 'sup,directorio,todos'); assert.ok(await p.locator('#nav button').count() >= 9, 'debe volver el menú completo');
});
if (errs.length) { fallas++; console.log('MAL errores de consola:', errs); }
await b.close();
console.log(fallas ? `\n${fallas} prueba(s) fallaron` : '\nTodas las pruebas del escritorio pasaron');
process.exit(fallas ? 1 : 0);
