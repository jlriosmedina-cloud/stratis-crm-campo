/* La hoja «Avance de la campaña».
 *
 * José, 04/09: la pidió a nivel proyecto para que Mastercard tenga visibilidad.
 * Eso cambia lo que puede y no puede decir, y por eso esta suite mira DOS
 * cosas distintas:
 *
 *   1 · Que los números sean los mismos que muestra el CRM en pantalla. La
 *       hoja no recalcula nada: llama a `cadenaEntre`, a `comerciosConVisita` y
 *       a `repTrabajadosEntre`. Si alguien mañana mete una segunda definición
 *       acá, la hoja y el Tablero empiezan a decir cosas distintas del mismo
 *       hecho, que es el error que este proyecto lleva persiguiendo desde el
 *       26/08.
 *
 *   2 · Que el TEXTO DEL PDF ya generado no lleve nada que no pueda salir de
 *       casa: nombres de ejecutivos, correos, la herramienta con la que se
 *       registra, ni una palabra de bono, incentivo o comisión. Se revisa el
 *       archivo, no el código, porque lo que importa es lo que va a leer quien
 *       lo reciba.
 */
import { chromium } from 'playwright';
import { promises as fs } from 'fs';

const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ acceptDownloads:true });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e.message)));
await p.goto('file:///home/claude/crm/Stratis_CRM_Supabase.html', { waitUntil:'domcontentloaded' });
await p.waitForTimeout(1200);
/* El CDN de jsPDF no se alcanza desde acá; la copia local entra por el mismo
   `window.jspdf` que usa producción, así que se prueba el mismo camino. */
await p.addScriptTag({ path:'/home/claude/crm/node_modules/jspdf/dist/jspdf.umd.min.js' });
await p.evaluate(await fs.readFile('/home/claude/crm/fixture_embudo.js', 'utf8'));

const R = await p.evaluate(async () => {
  const r = {};
  const falla = (n, e) => { r[n] = false; r._rotas = (r._rotas || []).concat(n + ': ' + e.message); };

  /* ---- El botón, donde José lo pidió ------------------------------------ */
  try {
    S.tab = 'reporte'; S.comoEjec = ''; render();
    await new Promise(x => setTimeout(x, 450));
    const bs = [...document.querySelectorAll('.rep-acc button')].map(x => x.textContent.trim());
    r['el botón existe en el Reporte'] = bs.includes('Avance de la campaña');
    r['y va a la izquierda del deck de directorio'] =
      bs.indexOf('Avance de la campaña') === bs.indexOf('Deck de directorio') - 1;
  } catch (e){ falla('el botón', e); }

  /* ---- Una definición, un número ---------------------------------------- */
  try {
    const D = datosFichaProyecto();
    const A = cadenaEntre(null, hoyISO());
    r['la cobertura sale del mismo embudo del Tablero'] = D.embudo[1].n === A.gestion.size;
    r['la efectividad también'] = D.embudo[2].n === A.efectividad.size;
    r['las visitas también'] = D.embudo[3].n === A.visita.size;
    r['las retenciones también'] = D.embudo[4].n === A.objetivo.size;
    r['el portafolio es la cartera sin ventas nuevas'] =
      D.portafolio === CLIENTES.filter(c => !esClienteNuevo(c)).length;
    /* El embudo no puede ensancharse hacia abajo en ningún escalón. */
    r['el embudo no se ensancha hacia abajo'] =
      D.embudo.every((e, i) => i === 0 || e.n <= D.embudo[i-1].n);
  } catch (e){ falla('los números', e); }

  /* ---- Lo que se afirma se calcula -------------------------------------- */
  try {
    const D = datosFichaProyecto();
    /* Las semanas son las del periodo, cortadas el domingo. */
    r['la serie empieza donde empieza el periodo'] = D.serie[0].desde === D.ventana.ini;
    r['la última semana llega hasta hoy'] = D.serie[D.serie.length-1].hasta === hoyISO();
    r['la semana en curso no figura como cerrada'] = D.serie[D.serie.length-1].cerrada === false;
    /* Sin facturación cargada no se dice que va en 0%. */
    const fEje = D.objetivos.find(o => o.rot === 'FACTURACIÓN');
    r['sin facturación cargada el eje no afirma un 0%'] =
      D.fact.crec !== null || fEje.txt === 'sin dato';
  } catch (e){ falla('lo que se afirma', e); }

  return r;
});

/* ---- Y el archivo, que es lo que se entrega ----------------------------- */
const dl = p.waitForEvent('download', { timeout: 40000 });
await p.click('#repFicha');
await (await dl).saveAs('/tmp/qa_ficha_proyecto.pdf');
await p.close(); await b.close();

const { execFileSync } = await import('child_process');
const texto = execFileSync('pdftotext', ['/tmp/qa_ficha_proyecto.pdf', '-']).toString();

const PROHIBIDO = [
  [/\bCRM\b/i,                                        'menciona la herramienta interna'],
  [/incentivo|\bbono\b|comisi[oó]n/i,                 'menciona la retribución del equipo'],
  [/@[a-z0-9.\-]+\.[a-z]{2,}/i,                       'lleva un correo'],
  [/Torres|Arrascue|Reyes|P[eé]rez|Vanessa|An[ií]bal|Alfredo|Emelin/i, 'nombra a un ejecutivo'],
  [/puntualidad del registro/i,                       'expone un mínimo del acuerdo interno'],
  [/llave de (acceso|gesti[oó]n)/i,                   'menciona la llave del incentivo'],
  [/Ajustes\s*›|Se carga en/i,                        'instruye sobre la herramienta interna'],
];
const R2 = {};
PROHIBIDO.forEach(([re, m]) => { R2['el PDF no ' + m] = !re.test(texto); });
R2['el PDF trae contenido'] = texto.length > 600;
R2['el PDF nombra la campaña'] = /Adquirencia/i.test(texto);

const todo = Object.assign({}, R, R2);
const det = R._n, rotas = R._rotas || [];
['_n','_rotas'].forEach(k => delete todo[k]);
const ok  = Object.entries(todo).filter(([, v]) => v).map(([k]) => k);
const mal = Object.entries(todo).filter(([, v]) => !v).map(([k]) => k);
ok.forEach(n => console.log('  ok   ' + n));
mal.forEach(n => console.log('  MAL  ' + n));
rotas.forEach(n => console.log('  ROTA ' + n));
console.log(`\n${ok.length}/${ok.length + mal.length} · errores JS: ${errs.length ? errs.join(' | ') : 'ninguno'}`);
process.exit(mal.length ? 1 : 0);
