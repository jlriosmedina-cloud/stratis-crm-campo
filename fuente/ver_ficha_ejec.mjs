/* La ficha del ejecutivo, generada desde el CRM y mirada de verdad. */
import { chromium } from 'playwright';
import { promises as fs } from 'fs';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ acceptDownloads:true });
const p = await ctx.newPage();
const errs=[]; p.on('pageerror', e=>errs.push(String(e.message)));
await p.goto('file:///home/claude/crm/Stratis_CRM_Supabase.html', { waitUntil:'domcontentloaded' });
await p.waitForTimeout(1200);
await p.addScriptTag({ path:'/home/claude/crm/node_modules/jspdf/dist/jspdf.umd.min.js' });
await p.evaluate(await fs.readFile('/home/claude/crm/fixture_embudo.js', 'utf8'));
await p.evaluate(() => { S.tab='reporte'; S.comoEjec=''; render(); });
await p.waitForTimeout(400);
console.log('botones: ' + await p.evaluate(() =>
  [...document.querySelectorAll('.rep-acc button')].map(b=>b.textContent.trim()).join(' | ')));
await p.click('#repEquipo'); await p.waitForTimeout(400);
console.log('filas del modal:\n' + await p.evaluate(() =>
  [...document.querySelectorAll('.fq-fila')].map(e=>'  '+e.textContent.trim().replace(/\s+/g,' ')).join('\n')));
const dl = p.waitForEvent('download', { timeout:40000 });
await p.click('[data-ficha]');
const d = await dl; await d.saveAs('/home/claude/crm/ejec_crm.pdf');
console.log('descargado: ' + d.suggestedFilename());
console.log('errores JS: ' + (errs.length?errs.join(' | '):'ninguno'));
await b.close();
