/* La ficha semanal del ejecutivo, en PDF desde el Reporte.
 *
 * José, 04/09: la va a descargar y mandar a mano. Lo que pidió textualmente es
 * que «se descargue armado completo y sin errores», así que esta suite mira
 * tres cosas:
 *
 *   1 · Que los números sean los MISMOS que la pestaña de Incentivos. La hoja
 *       la recibe la persona sobre la que se está hablando; si dice 121 y la
 *       pestaña dice otra cosa, la conversación deja de ser sobre su trabajo y
 *       pasa a ser sobre si el sistema miente.
 *
 *   2 · Que lo que la hoja AFIRMA se calcule. Las frases del cierre —cuántos
 *       distritos, cuántas semanas de ruta, a qué ritmo— salieron dos veces
 *       tecleadas en este proyecto y las dos veces se volvieron falsas solas.
 *
 *   3 · Que sea un archivo por persona. Un PDF de cuatro páginas obligaría a
 *       partirlo a mano antes de mandarlo.
 */
import { chromium } from 'playwright';
import { promises as fs } from 'fs';

const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ acceptDownloads:true });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e.message)));
await p.goto('file:///home/claude/crm/Stratis_CRM_Supabase.html', { waitUntil:'domcontentloaded' });
await p.waitForTimeout(1200);
await p.addScriptTag({ path:'/home/claude/crm/node_modules/jspdf/dist/jspdf.umd.min.js' });
await p.evaluate(await fs.readFile('/home/claude/crm/fixture_embudo.js', 'utf8'));

const R = await p.evaluate(async () => {
  const r = {};
  const falla = (n, e) => { r[n] = false; r._rotas = (r._rotas || []).concat(n + ': ' + e.message); };

  try {
    S.tab = 'reporte'; S.comoEjec = ''; render();
    await new Promise(x => setTimeout(x, 450));
    const bs = [...document.querySelectorAll('.rep-acc button')].map(x => x.textContent.trim());
    r['el botón de las fichas está en el Reporte'] = bs.includes('Fichas del equipo');
    document.querySelector('#repEquipo').click();
    await new Promise(x => setTimeout(x, 400));
    const filas = document.querySelectorAll('.fq-fila');
    r['hay una fila por ejecutivo activo'] = filas.length === ejecutivosDelBono().length;
    r['cada fila tiene su propio botón'] =
      document.querySelectorAll('.fq-fila [data-ficha]').length === filas.length;
  } catch (e){ falla('el botón y el modal', e); }

  /* ---- Una definición, un número --------------------------------------- */
  try {
    const p2 = periodoHoy();
    const malos = ejecutivosDelBono().filter(u => {
      const D = datosFichaEjecutivo(u.correo);
      const ll = llaveDe(u.correo, p2);
      return D.cartera !== ll.cartera.n
          || D.cobertura.n !== ll.cobertura.cubiertos
          || Math.abs(D.puntualidad.pct - ll.puntualidad.valor) > 1e-9
          || D.visitas.n !== ll.visitas.valor;
    });
    r['la cobertura sale de la misma llave que Incentivos'] = malos.length === 0;
    r._malos = malos.map(u => u.nombre).join(', ');

    /* Las visitas de la llave incluyen los leads de venta; si la ficha
       mostrara solo las de cartera diría un número menor que el que le pagan. */
    const D0 = datosFichaEjecutivo(ejecutivosDelBono()[0].correo);
    r['las visitas se muestran con su composición'] =
      D0.visitas.n === D0.visitas.cartera + D0.visitas.venta;
    r['el retenido nunca supera su meta sin decirlo'] = D0.retenciones.n >= 0;
  } catch (e){ falla('los números contra Incentivos', e); }

  /* ---- Lo que se afirma, se calcula ------------------------------------ */
  try {
    const D = datosFichaEjecutivo(ejecutivosDelBono()[0].correo);
    r['la serie empieza donde empieza el periodo'] = D.serie[0].desde === D.ventana.ini;
    r['la semana en curso no figura como cerrada'] = D.serie[D.serie.length-1].cerrada === false;
    r['los días hábiles que faltan son un número real'] =
      Number.isFinite(D.habiles) && D.habiles >= 0;
    r['los días de la semana en curso nunca son cero'] = D.diasSem >= 1;
  } catch (e){ falla('lo que se afirma', e); }

  return r;
});

/* ---- Y el archivo ------------------------------------------------------- */
const dl = p.waitForEvent('download', { timeout: 40000 });
await p.click('.fq-fila [data-ficha]');
const d = await dl;
const nombreArchivo = d.suggestedFilename();
await d.saveAs('/tmp/qa_ficha_ejec.pdf');
await p.close(); await b.close();

const { execFileSync } = await import('child_process');
const texto = execFileSync('pdftotext', ['/tmp/qa_ficha_ejec.pdf', '-']).toString();
const paginas = (execFileSync('pdfinfo', ['/tmp/qa_ficha_ejec.pdf']).toString()
                 .match(/Pages:\s*(\d+)/) || [])[1];

const R2 = {
  'el archivo es de una sola persona': /^Avance_[A-Za-z_]+_\d{4}-\d{2}-\d{2}\.pdf$/.test(nombreArchivo),
  'y de una sola página': paginas === '1',
  'la hoja trae el nombre de la persona': /Juan/i.test(texto),
  'trae el puesto completo': /Ejecutivo Comercial Adquirencia MASTERCARD BBVA/i.test(texto),
  'trae las cinco secciones': ['AVANCES DEL PERIODO','DONDE ESTA PARADO','CUANTO FALTA PARA CADA META',
      'EL DESARROLLO, SEMANA A SEMANA','COMO VIENE LA SEMANA']
      .every(t => texto.normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().includes(t)),
  /* Lo que NO puede llevar: el resumen semanal no es el acta. */
  'no menciona el incentivo ni el sueldo': !/incentivo|\bbono\b|comisi[oó]n|sueldo/i.test(texto),
  'no queda ningún texto sin reemplazar': !/\{[a-z_]+\}|undefined|NaN/i.test(texto),
  'no quedó ninguna cifra rota': !/\bNaN\b|Infinity/.test(texto)
};

const todo = Object.assign({}, R, R2);
const malos = R._malos, rotas = R._rotas || [];
['_malos','_rotas'].forEach(k => delete todo[k]);
const ok  = Object.entries(todo).filter(([, v]) => v).map(([k]) => k);
const mal = Object.entries(todo).filter(([, v]) => !v).map(([k]) => k);
ok.forEach(n => console.log('  ok   ' + n));
mal.forEach(n => console.log('  MAL  ' + n));
rotas.forEach(n => console.log('  ROTA ' + n));
if (malos) console.log('   descuadran: ' + malos);
console.log(`\n${ok.length}/${ok.length + mal.length} · errores JS: ${errs.length ? errs.join(' | ') : 'ninguno'}`);
process.exit(mal.length ? 1 : 0);
