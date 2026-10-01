// Prueba del celular: las 5 opciones de «¿Cómo fue la visita?», el bloqueo de la segunda visita del día
// la corrección de la visita de hoy y la cola: una visita rechazada por el servidor queda «pendiente de revisar».
// Uso: node v2/qa/celular.mjs   (antes: python v2/build.py)
import { navegador, RAIZ, urlDist, EJECUTIVO, comercio, hoyLima, mananaLima } from './comun.mjs';
import assert from 'node:assert/strict';

const DEC = 'No se encontraba la persona que tomaba decisiones', REAG = 'Reagendé con quien decide', SINOBS = 'Sin observaciones del comercio';
const HACE_UN_MINUTO = new Date(Date.now() - 60e3).toISOString();
const BASE = [1, 2, 3, 4, 5, 7, 8, 9, 10].map(i => comercio(i)).concat([comercio(6, { visitas: 1, visitas_validas: 1, estado: 'seg', ultima_visita: HACE_UN_MINUTO }),
  // quedó en volver con el dueño (29/09): sigue en «Aún no decide», pero entra al filtro «Reagendados»
  comercio(11, { visitas: 1, visitas_validas: 1, estado: 'seg', ultima_visita: '2026-01-02T15:00:00Z', volver_el: mananaLima() }),
  // BBVA lo reporta reactivado (30/09): informativo, no cambia el estado
  comercio(12, { visitas: 1, visitas_validas: 1, estado: 'seg', ultima_visita: '2026-01-02T15:00:00Z', bbva_reactivado: '2026-01-02' }),
  // visita sin contacto (01/10): espera el seguimiento remoto
  comercio(13, { visitas: 1, visitas_validas: 1, estado: 'vis', ultima_visita: '2026-01-03T15:00:00Z', ultima_que: 'Sin éxito', ultima_motivo: 'Cerrado' })]);
const NOPIDIO = 'No pidió el POS';
// La visita de hoy del comercio 6, tal como la devuelve v2_visitas_de: habló con el dueño y aún no decide.
const VISITA_HOY = { id: 'visita-hoy-prueba', periodo: 'PRUEBA', customer_id: '00000006', visitado_en: HACE_UN_MINUTO, recibido_en: HACE_UN_MINUTO,
  correo: EJECUTIVO.correo, ejecutivo: EJECUTIVO.nombre_corto, con: 'Dueño', motivo: null, que: 'Reunión concretada', decision: 'Aún no decide',
  equipo: null, fecha_reagenda: null, comentario: 'Comentario de prueba de la visita de hoy', lat: -12.0931, lng: -77.0465, precision_m: 12, distancia_m: 10,
  estado_anul: 'activa', puede_editar: true, limite_edicion: mananaLima(), es_mia: true, validacion: 'validada', direccion_ok: true,
  fuera_plazo: false, feedback: [SINOBS], fb_acciones: null, fb_extra: null, motivos_si: null };
const FX = {
  sesion: { user: { email: EJECUTIVO.correo }, access_token: 'prueba' },
  tablas: { usuarios: EJECUTIVO, v2_periodos: { id: 'PRUEBA', ini: '2026-01-01', fin: '2099-12-31' } },
  rpc: { v2_mi_base: BASE, v2_mis_revisiones: [], v2_actividad: [], v2_avance: [], v2_registrar_visita: () => 'id-prueba',
         v2_visitas_de: [VISITA_HOY], v2_editar_resultado: null, v2_mis_seguimientos: [], v2_registrar_seguimiento: () => 1 }
};

const CASOS = [
  { cid: '00000001', modo: 'hable', pasos: async p => { await p.click('[data-op=conQuien][data-val=Dueño]'); await p.click('[data-op=decision][data-val="Aún no decide"]');
      await p.click('[data-fb-toggle]'); await p.click(`[data-fb="${SINOBS}"]`); await p.click('.fb-pie [data-fb-toggle]'); },
    ok: v => { assert.equal(v.p_con, 'Dueño'); assert.equal(v.p_que, 'Reunión concretada'); assert.equal(v.p_decision, 'Aún no decide'); assert.deepEqual(v.p_feedback, [SINOBS]); assert.equal(v.p_fecha_reagenda, null); } },
  // 29/09: con el dueño se puede anotar la fecha para volver (opcional) y marcar el feedback nuevo
  { cid: '00000008', modo: 'hable', nombre: 'hable · quedaron en volver con el dueño', pasos: async p => { await p.click('[data-op=conQuien][data-val=Dueño]'); await p.click('[data-op=decision][data-val="Aún no decide"]');
      await p.fill('#fechaNueva', mananaLima()); await p.dispatchEvent('#fechaNueva', 'change');
      await p.click('[data-fb-toggle]'); await p.click(`[data-fb="${NOPIDIO}"]`); await p.click('.fb-pie [data-fb-toggle]');
      await p.click('[data-fb-acc="Mostré los beneficios de cobrar con tarjeta"]'); },
    ok: v => { assert.equal(v.p_que, 'Reunión concretada'); assert.equal(v.p_decision, 'Aún no decide'); assert.equal(v.p_fecha_reagenda, mananaLima());
      assert.deepEqual(v.p_feedback, [NOPIDIO]); assert.deepEqual(v.p_fb_acciones, ['Mostré los beneficios de cobrar con tarjeta'], 'no debe marcar «' + REAG + '»'); } },
  { cid: '00000002', modo: 'volver', pasos: async p => { await p.fill('#fechaNueva', mananaLima()); await p.dispatchEvent('#fechaNueva', 'input'); await p.dispatchEvent('#fechaNueva', 'change'); },
    ok: v => { assert.equal(v.p_con, 'Tercero'); assert.equal(v.p_que, 'Reagendada'); assert.equal(v.p_fecha_reagenda, mananaLima()); assert.ok(v.p_feedback.includes(DEC)); assert.ok((v.p_fb_acciones || []).includes(REAG)); } },
  { cid: '00000003', modo: 'sin', pasos: async () => {},
    ok: v => { assert.equal(v.p_con, 'Tercero'); assert.equal(v.p_que, 'Sin éxito'); assert.ok(v.p_feedback.includes(DEC)); assert.ok(!(v.p_fb_acciones || []).includes(REAG)); } },
  { cid: '00000004', modo: 'nadie', pasos: async p => { await p.click('[data-op=motivo][data-val=Cerrado]'); },
    ok: v => { assert.equal(v.p_con, 'Nadie'); assert.equal(v.p_motivo, 'Cerrado'); assert.equal(v.p_feedback, null); assert.equal(v.p_direccion_ok, true); } },
  { cid: '00000009', modo: 'nadie', nombre: 'nadie · zona insegura', pasos: async p => { await p.click('[data-op=motivo][data-val="Zona insegura"]'); },
    ok: v => { assert.equal(v.p_con, 'Nadie'); assert.equal(v.p_motivo, 'Zona insegura'); assert.equal(v.p_direccion_ok, null, 'con zona insegura no se sabe la dirección'); } },
  { cid: '00000010', modo: 'nadie', nombre: 'nadie · otro motivo', pasos: async p => { await p.click('[data-op=motivo][data-val="Otro motivo"]');
      assert.ok(await p.locator('text=Cuenta en el comentario qué impidió la visita').count() > 0, 'no pide contarlo en el comentario'); },
    ok: v => { assert.equal(v.p_motivo, 'Otro motivo'); assert.equal(v.p_direccion_ok, null); } },
  { cid: '00000005', modo: 'noesta', pasos: async p => { await p.click('[data-op=ubicado][data-val=no]'); },
    ok: v => { assert.equal(v.p_con, 'Nadie'); assert.equal(v.p_motivo, 'Dirección errada'); assert.equal(v.p_direccion_ok, false); assert.equal(v.p_comercio_ubicado, false); } }
];

let fallas = 0;
for (const tema of ['light', 'dark']) {
  const { b, ctx } = await navegador({ tema });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/net::|fonts|Failed to load resource|URL scheme "file" is not supported/.test(m.text())) errs.push(m.text()); });
  await p.addInitScript(fx => { window.__FX = fx; }, FX);
  await p.goto(urlDist('celular')); await p.waitForTimeout(1200);
  for (const c of CASOS) {
    try {
      await p.evaluate(id => nuevoRegistro(id), c.cid); await p.waitForTimeout(600);
      await p.click(`[data-op=modo][data-val=${c.modo}]`); await p.waitForTimeout(100);
      await c.pasos(p);
      await p.fill('#coment', `Comentario de prueba para ${c.modo}`); await p.dispatchEvent('#coment', 'input');
      const antes = await p.evaluate(() => window.__llamadas.length);
      await p.click('[data-guardar-visita]'); await p.waitForTimeout(700);
      const llam = await p.evaluate(n => window.__llamadas.slice(n), antes);
      const reg = llam.find(x => x[0] === 'v2_registrar_visita');
      if (!reg) { const falta = await p.locator('.falta-caja').innerText().catch(() => ''); throw new Error('no se envió: ' + falta); }
      c.ok(reg[1]); console.log(`ok  ${tema} · ${c.nombre || c.modo}`);
    } catch (e) { fallas++; console.log(`MAL ${tema} · ${c.nombre || c.modo}: ${e.message}`); await p.evaluate(() => { S.reg = null; pintar(); }); }
  }
  // Reactivado según BBVA (30/09): se ve en la tarjeta, en el filtro y en Inicio, sin cambiar el estado
  try {
    const r = await p.evaluate(() => { S.filtroEstado = 'bbva'; S.filtroVisita = 'todos'; const ids = filtrar().map(c => c.customer_id); S.filtroEstado = 'todos';
      S.vista = 'inicio'; S.ficha = null; pintar(); return { ids, estado:S.base.find(c => c.customer_id === '00000012').estado }; });
    if (JSON.stringify(r.ids) !== '["00000012"]') throw new Error('filtro BBVA: ' + JSON.stringify(r.ids));
    if (r.estado !== 'seg') throw new Error('cambió el estado');
    if (!(await p.locator('text=como reactivado').count())) throw new Error('no aparece el aviso en Inicio');
    await p.evaluate(() => { S.vista = 'base'; S.filtroEstado = 'bbva'; pintar(); }); await p.waitForTimeout(200);
    if (!(await p.locator('.bbva-rea').count())) throw new Error('la tarjeta no muestra «Reactivado según BBVA»');
    await p.evaluate(() => { S.filtroEstado = 'todos'; S.vista = 'inicio'; pintar(); });
    console.log(`ok  ${tema} · reactivado según BBVA (informativo)`);
  } catch (e) { fallas++; console.log(`MAL ${tema} · reactivado según BBVA: ${e.message}`); }
  // Seguimiento remoto (01/10): Inicio avisa, el filtro lo encuentra y la visita sin contacto lo registra sin tocar la visita
  try {
    const r = await p.evaluate(() => { S.filtroEstado = 'sinseg'; S.filtroVisita = 'todos'; const ids = filtrar().map(c => c.customer_id); S.filtroEstado = 'todos';
      S.vista = 'inicio'; S.ficha = null; pintar(); return ids; });
    assert.deepEqual(r, ['00000013']);
    if (!(await p.locator('.seg-card').count())) throw new Error('no aparece el aviso en Inicio');
    await p.evaluate(v => { S.vista = 'base'; S.hist['00000013'] = [Object.assign({}, v, { id:'visita-sin-contacto', customer_id:'00000013', con:'Nadie', motivo:'Cerrado', que:'Sin éxito', decision:null, feedback:null })];
      S.ficha = '00000013'; pintar(); }, VISITA_HOY); await p.waitForTimeout(200);
    await p.click('[data-seg="visita-sin-contacto"]');
    await p.click('[data-seg-enviar]');
    if (!(await p.locator('text=Elige el canal').count())) throw new Error('debía pedir el canal y la respuesta');
    await p.click('[data-seg-canal="WhatsApp"]'); await p.click('[data-seg-res="No respondió"]'); await p.fill('#segNota', 'Le escribí al número de la base');
    await p.click('[data-seg-enviar]'); await p.waitForTimeout(300);
    const ll = await p.evaluate(() => window.__llamadas.filter(x => x[0] === 'v2_registrar_seguimiento').map(x => x[1]));
    assert.deepEqual(ll.at(-1), { p_visita_id:'visita-sin-contacto', p_canal:'WhatsApp', p_resultado:'No respondió', p_nota:'Le escribí al número de la base' });
    // en una visita con contacto no aparece
    await p.evaluate(v => { S.hist['00000013'] = [v]; pintar(); }, VISITA_HOY); await p.waitForTimeout(150);
    if (await p.locator('[data-seg]').count()) throw new Error('ofrece seguimiento en una visita con contacto');
    await p.evaluate(() => { S.ficha = null; delete S.hist['00000013']; S.vista = 'inicio'; pintar(); });
    console.log(`ok  ${tema} · seguimiento remoto de la visita sin contacto`);
  } catch (e) { fallas++; console.log(`MAL ${tema} · seguimiento remoto: ${e.message}`); }
  // «Reagendados» incluye al que quedó en volver con el dueño, y la tarjeta muestra la fecha
  try {
    const ids = await p.evaluate(() => { S.filtroEstado = 'rag'; S.filtroVisita = 'todos'; const r = filtrar().map(c => c.customer_id); S.filtroEstado = 'todos'; return r; });
    assert.deepEqual(ids, ['00000011']);
    const t = await p.evaluate(() => tarjeta(S.base.find(c => c.customer_id === '00000011')));
    assert.ok(t.includes('Vuelves el'), 'la tarjeta no muestra la fecha para volver');
    const tc = await p.evaluate(() => tarjeta(Object.assign({}, S.base[0], { estado: 'sin', ultima_motivo: 'Cerró definitivamente', visitas: 1, visitas_validas: 1 })));
    assert.ok(tc.includes('Cerró definitivamente'), 'la tarjeta no detalla que cerró definitivamente');
    // la ruta sugerida toma solo los regresos de hoy o vencidos, no uno de mañana
    const ruta = await p.evaluate(() => { const b = S.base, c11 = b.find(c => c.customer_id === '00000011');
      const hoyC = Object.assign({}, b[0], { customer_id: '00000099', estado: 'seg', volver_el: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' }), geo_lat: -12.5555 });
      return { url: decodeURIComponent(urlRuta([c11, hoyC])), lat11: String(c11.geo_lat) }; });
    assert.ok(ruta.url.includes('-12.5555'), 'la ruta no incluye el regreso de hoy');
    assert.ok(!ruta.url.includes(ruta.lat11), 'la ruta incluye un regreso de mañana');
    console.log(`ok  ${tema} · «Reagendados» incluye volver con el dueño`);
  } catch (e) { fallas++; console.log(`MAL ${tema} · filtro Reagendados: ${e.message}`); }
  // Segunda visita del día: la hoja avisa y ofrece corregir la de hoy
  try {
    await p.evaluate(() => nuevoRegistro('00000006')); await p.waitForTimeout(600);
    assert.ok(await p.locator('text=Ya registraste este comercio hoy').count() > 0, 'no aparece el aviso');
    assert.ok(await p.locator('[data-corregir-hoy]').count() > 0, 'no aparece «Corregir la visita de hoy»');
    console.log(`ok  ${tema} · bloqueo de la segunda visita del día`);
  } catch (e) { fallas++; console.log(`MAL ${tema} · bloqueo: ${e.message}`); }
  // Corregir la visita de hoy a «quedamos en volver»: va por v2_editar_resultado, nunca por v2_registrar_visita
  try {
    const antes = await p.evaluate(() => window.__llamadas.length);
    await p.click('[data-corregir-hoy]'); await p.waitForTimeout(600);
    await p.click('[data-cop=modo][data-val=volver]'); await p.waitForTimeout(100);
    await p.fill('#corrFecha', mananaLima()); await p.dispatchEvent('#corrFecha', 'change');
    await p.click('[data-corr-enviar]'); await p.waitForTimeout(700);
    const llam = await p.evaluate(n => window.__llamadas.slice(n), antes);
    const ed = llam.find(x => x[0] === 'v2_editar_resultado');
    if (!ed) { const falta = await p.locator('.acc-panel .falta').innerText().catch(() => ''); throw new Error('no llamó a v2_editar_resultado: ' + falta); }
    const v = ed[1];
    assert.equal(v.p_visita_id, VISITA_HOY.id);
    assert.equal(v.p_con, 'Tercero'); assert.equal(v.p_que, 'Reagendada'); assert.equal(v.p_fecha_reagenda, mananaLima());
    assert.equal(v.p_decision, null);
    assert.ok((v.p_feedback || []).includes(DEC), 'falta «' + DEC + '»');
    assert.ok(!(v.p_feedback || []).includes(SINOBS), '«' + SINOBS + '» no se combina con quedamos en volver');
    assert.ok((v.p_fb_acciones || []).includes(REAG), 'falta «' + REAG + '»');
    assert.ok(!llam.some(x => x[0] === 'v2_registrar_visita'), 'llamó a v2_registrar_visita');
    console.log(`ok  ${tema} · corregir la visita de hoy a «quedamos en volver»`);
  } catch (e) { fallas++; console.log(`MAL ${tema} · corrección: ${e.message}`); }
  // Cola: sin señal se guarda; si el servidor la rechaza, no sale de la cola; se corrige y se reenvía con el mismo identificador
  try {
    await p.evaluate(() => { window.__FX.rpc.v2_registrar_visita = () => ({ __error: 'Failed to fetch' }); });
    await p.evaluate(() => nuevoRegistro('00000007')); await p.waitForTimeout(600);
    await p.click('[data-op=modo][data-val=nadie]'); await p.click('[data-op=motivo][data-val=Cerrado]');
    await p.fill('#coment', 'Comentario de prueba para la cola'); await p.dispatchEvent('#coment', 'input');
    await p.click('[data-guardar-visita]'); await p.waitForTimeout(600);
    let cola = await p.evaluate(() => S.cola);
    assert.equal(cola.length, 1, 'sin señal no quedó en la cola');
    const uid = cola[0].p_cliente_uid, hora = cola[0].p_visitado_en;
    // vuelve la señal y el servidor la rechaza
    await p.evaluate(() => { window.__FX.rpc.v2_registrar_visita = () => ({ __error: 'Mensaje de prueba del servidor' }); window.__FX.rpc.v2_reportar_retenida = () => 'pendiente'; });
    const antesRep = await p.evaluate(() => window.__llamadas.length);
    await p.evaluate(() => vaciarCola()); await p.waitForTimeout(600);
    const rep = (await p.evaluate(n => window.__llamadas.slice(n), antesRep)).find(x => x[0] === 'v2_reportar_retenida');
    assert.ok(rep, 'no avisó al analista');
    assert.equal(rep[1].p_cliente_uid, uid); assert.equal(rep[1].p_mensaje, 'Mensaje de prueba del servidor');
    assert.ok(!('_rechazo' in rep[1].p_payload) && rep[1].p_payload.p_cliente_uid === uid, 'el aviso no lleva la visita limpia');
    cola = await p.evaluate(() => S.cola);
    assert.equal(cola.length, 1, 'la visita rechazada salió de la cola');
    assert.equal(cola[0]._rechazo.msg, 'Mensaje de prueba del servidor');
    assert.deepEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('stratis-v2-cola')).map(v => !!v._rechazo)), [true], 'no quedó guardada en el celular');
    await p.evaluate(() => { S.toast = null; S.ficha = null; S.corr = null; S.vista = 'inicio'; pintar(); });
    assert.ok(await p.locator('text=Pendiente de revisar').count() > 0, 'no aparece «Pendiente de revisar»');
    assert.ok(await p.locator('text=Mensaje de prueba del servidor').count() > 0, 'no aparece el mensaje del servidor');
    assert.ok(await p.locator('text=Tu analista ya fue avisado').count() > 0, 'no dice que el analista fue avisado');
    if (process.env.CAPTURAS) await p.screenshot({ path: `${process.env.CAPTURAS}/cola-pendiente-${tema}.png`, fullPage: false });
    // «Enviar ahora» no la reintenta sola
    const n0 = await p.evaluate(() => window.__llamadas.filter(x => x[0] === 'v2_registrar_visita').length);
    await p.evaluate(() => vaciarCola()); await p.waitForTimeout(300);
    assert.equal(await p.evaluate(() => window.__llamadas.filter(x => x[0] === 'v2_registrar_visita').length), n0, 'reintentó sola una visita pendiente de revisar');
    // corregir y reenviar
    await p.click(`[data-corregir-cola="${uid}"]`); await p.waitForTimeout(400);
    assert.ok(await p.locator('.hoja >> text=Mensaje de prueba del servidor').count() > 0, 'la hoja no muestra el mensaje del servidor');
    assert.equal(await p.locator('text=Ya registraste este comercio hoy').count(), 0, 'la hoja la bloquea como segunda visita del día');
    if (process.env.CAPTURAS) await p.screenshot({ path: `${process.env.CAPTURAS}/cola-corregir-${tema}.png`, fullPage: false });
    // el servidor vuelve a rechazarla: la cola guarda lo que el ejecutivo corrigió, no la versión original
    await p.evaluate(() => { window.__FX.rpc.v2_registrar_visita = () => ({ __error: 'Segundo rechazo de prueba' }); });
    await p.click('[data-op=motivo][data-val="No atendió"]');
    await p.fill('#coment', 'Comentario corregido para la cola'); await p.dispatchEvent('#coment', 'input');
    await p.click('[data-guardar-visita]'); await p.waitForTimeout(600);
    cola = await p.evaluate(() => S.cola);
    assert.equal(cola.length, 1, 'el segundo rechazo sacó la visita de la cola');
    assert.equal(cola[0].p_motivo, 'No atendió', 'la cola no guardó lo corregido');
    assert.equal(cola[0].p_comentario, 'Comentario corregido para la cola');
    assert.equal(cola[0]._rechazo.msg, 'Segundo rechazo de prueba');
    assert.equal(cola[0].p_cliente_uid, uid); assert.equal(cola[0].p_visitado_en, hora);
    await p.evaluate(() => { window.__FX.rpc.v2_registrar_visita = () => 'id-prueba'; });
    const antes = await p.evaluate(() => window.__llamadas.length);
    await p.click('[data-guardar-visita]'); await p.waitForTimeout(700);
    const reg = (await p.evaluate(n => window.__llamadas.slice(n), antes)).find(x => x[0] === 'v2_registrar_visita');
    assert.ok(reg, 'no se reenvió');
    assert.equal(reg[1].p_cliente_uid, uid, 'cambió el identificador de la visita');
    assert.equal(reg[1].p_visitado_en, hora, 'cambió la hora de la visita');
    assert.equal(reg[1].p_motivo, 'No atendió');
    assert.ok(!('_rechazo' in reg[1]), 'mandó al servidor la marca interna de la cola');
    assert.equal((await p.evaluate(() => S.cola)).length, 0, 'la visita reenviada sigue en la cola');
    console.log(`ok  ${tema} · cola: rechazada queda pendiente de revisar y se reenvía corregida`);
  } catch (e) { fallas++; console.log(`MAL ${tema} · cola: ${e.message}`); }
  // Cola: Jose descarta una retenida desde su escritorio y el celular la quita al sincronizar
  try {
    await p.evaluate(() => {
      S.cola = [{ p_customer_id: '00000007', p_visitado_en: new Date(Date.now() - 86400e3).toISOString(), p_con: 'Nadie', p_motivo: 'Cerrado', p_que: 'Sin éxito', p_comentario: 'Comentario de prueba retenida',
                  p_cliente_uid: 'uid-descartada-prueba', p_lat: -12.0931, p_lng: -77.0465, p_precision: 12, _rechazo: { msg: 'El periodo cerró el 30/09', en: new Date().toISOString(), avisada: true } }];
      guardarCola(); window.__FX.rpc.v2_mis_retenidas = [{ cliente_uid: 'uid-descartada-prueba', estado: 'descartada', resuelta_en: new Date().toISOString(), nota: null }];
      S.vista = 'inicio'; pintar(); });
    assert.ok(await p.locator('text=Pendiente de revisar').count() > 0, 'no aparece la retenida');
    await p.evaluate(() => vaciarCola()); await p.waitForTimeout(500);
    assert.equal((await p.evaluate(() => S.cola)).length, 0, 'la descartada sigue en el celular');
    assert.deepEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('stratis-v2-cola'))), [], 'la descartada sigue guardada');
    assert.ok(await p.locator('text=El analista descartó').count() > 0, 'no avisa que el analista la descartó');
    assert.equal(await p.locator('text=Pendiente de revisar').count(), 0);
    console.log(`ok  ${tema} · cola: la retenida que descarta el analista sale del celular`);
  } catch (e) { fallas++; console.log(`MAL ${tema} · cola descartada: ${e.message}`); }
  if (errs.length) { fallas++; console.log(`MAL ${tema} · errores de consola:`, errs); }
  await b.close();
}
console.log(fallas ? `\n${fallas} prueba(s) fallaron` : '\nTodas las pruebas del celular pasaron');
process.exit(fallas ? 1 : 0);
