/* Generar la ficha de proyecto en el navegador y mirarla de verdad. */
import { chromium } from 'playwright';
import { promises as fs } from 'fs';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ acceptDownloads:true });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e.message)));
await p.goto('file:///home/claude/crm/Stratis_CRM_Supabase.html', { waitUntil:'domcontentloaded' });
await p.waitForTimeout(1200);
/* El CDN de jsPDF está bloqueado en este entorno, así que se inyecta la copia
   local ANTES de pedir el PDF. `cargarJsPDF` ve window.jspdf ya puesto y no
   sale a la red: se prueba exactamente el mismo camino que en producción. */
await p.addScriptTag({ path: '/home/claude/crm/node_modules/jspdf/dist/jspdf.umd.min.js' });
await p.evaluate(await fs.readFile('/home/claude/crm/fixture_embudo.js', 'utf8'));
await p.evaluate(() => { S.tab = 'reporte'; S.comoEjec=''; render(); });
await p.waitForTimeout(500);
const hay = await p.evaluate(() => !!document.querySelector('#repFicha'));
console.log('botón presente: ' + hay);
console.log('orden de botones: ' + await p.evaluate(() =>
  [...document.querySelectorAll('.rep-acc button')].map(b => b.textContent.trim()).join(' | ')));
const dl = p.waitForEvent('download', { timeout: 30000 });
await p.click('#repFicha');
const d = await dl;
await d.saveAs('/home/claude/crm/proyecto_crm.pdf');
console.log('descargado: ' + d.suggestedFilename());
console.log('errores JS: ' + (errs.length ? errs.join(' | ') : 'ninguno'));
await b.close();
