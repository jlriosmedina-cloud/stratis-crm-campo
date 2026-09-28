// Prueba del celular: las 5 opciones de «¿Cómo fue la visita?» y el bloqueo de la segunda visita del día.
// Uso: node v2/qa/celular.mjs   (antes: python3 v2/build.py)
import { navegador, RAIZ, urlDist, EJECUTIVO, comercio, hoyLima, mananaLima } from './comun.mjs';
import assert from 'node:assert/strict';

const DEC = 'No se encontraba la persona que tomaba decisiones', REAG = 'Reagendé con quien decide', SINOBS = 'Sin observaciones del comercio';
const BASE = [1, 2, 3, 4, 5].map(i => comercio(i)).concat([comercio(6, { visitas: 1, visitas_validas: 1, estado: 'seg', ultima_visita: new Date(Date.now() - 3600e3).toISOString() })]);
const FX = {
  sesion: { user: { email: EJECUTIVO.correo }, access_token: 'prueba' },
  tablas: { usuarios: EJECUTIVO, v2_periodos: { id: 'PRUEBA', ini: '2026-01-01', fin: '2099-12-31' } },
  rpc: { v2_mi_base: BASE, v2_mis_revisiones: [], v2_actividad: [], v2_avance: [], v2_registrar_visita: () => 'id-prueba' }
};

const CASOS = [
  { cid: '00000001', modo: 'hable', pasos: async p => { await p.click('[data-op=conQuien][data-val=Dueño]'); await p.click('[data-op=decision][data-val="Aún no decide"]');
      await p.click('[data-fb-toggle]'); await p.click(`[data-fb="${SINOBS}"]`); await p.click('.fb-pie [data-fb-toggle]'); },
    ok: v => { assert.equal(v.p_con, 'Dueño'); assert.equal(v.p_que, 'Reunión concretada'); assert.equal(v.p_decision, 'Aún no decide'); assert.deepEqual(v.p_feedback, [SINOBS]); } },
  { cid: '00000002', modo: 'volver', pasos: async p => { await p.fill('#fechaNueva', mananaLima()); await p.dispatchEvent('#fechaNueva', 'input'); await p.dispatchEvent('#fechaNueva', 'change'); },
    ok: v => { assert.equal(v.p_con, 'Tercero'); assert.equal(v.p_que, 'Reagendada'); assert.equal(v.p_fecha_reagenda, mananaLima()); assert.ok(v.p_feedback.includes(DEC)); assert.ok((v.p_fb_acciones || []).includes(REAG)); } },
  { cid: '00000003', modo: 'sin', pasos: async () => {},
    ok: v => { assert.equal(v.p_con, 'Tercero'); assert.equal(v.p_que, 'Sin éxito'); assert.ok(v.p_feedback.includes(DEC)); assert.ok(!(v.p_fb_acciones || []).includes(REAG)); } },
  { cid: '00000004', modo: 'nadie', pasos: async p => { await p.click('[data-op=motivo][data-val=Cerrado]'); },
    ok: v => { assert.equal(v.p_con, 'Nadie'); assert.equal(v.p_motivo, 'Cerrado'); assert.equal(v.p_feedback, null); } },
  { cid: '00000005', modo: 'noesta', pasos: async p => { await p.click('[data-op=ubicado][data-val=no]'); },
    ok: v => { assert.equal(v.p_con, 'Nadie'); assert.equal(v.p_motivo, 'Dirección errada'); assert.equal(v.p_direccion_ok, false); assert.equal(v.p_comercio_ubicado, false); } }
];

let fallas = 0;
for (const tema of ['light', 'dark']) {
  const { b, ctx } = await navegador({ tema });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/net::|fonts|Failed to load resource/.test(m.text())) errs.push(m.text()); });
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
      c.ok(reg[1]); console.log(`ok  ${tema} · ${c.modo}`);
    } catch (e) { fallas++; console.log(`MAL ${tema} · ${c.modo}: ${e.message}`); await p.evaluate(() => { S.reg = null; pintar(); }); }
  }
  // Segunda visita del día: la hoja avisa y ofrece corregir la de hoy
  try {
    await p.evaluate(() => nuevoRegistro('00000006')); await p.waitForTimeout(600);
    assert.ok(await p.locator('text=Ya registraste este comercio hoy').count() > 0, 'no aparece el aviso');
    assert.ok(await p.locator('[data-corregir-hoy]').count() > 0, 'no aparece «Corregir la visita de hoy»');
    console.log(`ok  ${tema} · bloqueo de la segunda visita del día`);
  } catch (e) { fallas++; console.log(`MAL ${tema} · bloqueo: ${e.message}`); }
  if (errs.length) { fallas++; console.log(`MAL ${tema} · errores de consola:`, errs); }
  await b.close();
}
console.log(fallas ? `\n${fallas} prueba(s) fallaron` : '\nTodas las pruebas del celular pasaron');
process.exit(fallas ? 1 : 0);
