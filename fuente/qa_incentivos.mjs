/* La pestaña de incentivos: qué cuenta como venta y qué se ve de la facturación.
 *
 * José, 03/09: subió los cierres de facturación de agosto y al revisar la
 * pestaña encontró cumplimientos ponderados por encima de 100%. Medido en
 * producción, la causa no era la que parecía. El bono contaba como «venta»
 * TODO registro nuevo creado en la ventana —`esClienteNuevo` por `creado_en`—,
 * estuviera en PENDIENTE o no. En septiembre se habían cargado 64 prospectos y
 * solo 6 estaban cerrados como venta: el indicador marcaba 229%, 329% y 271% y
 * arrastraba el ponderado a 114%, 149% y 136% sin que nadie hubiera vendido.
 *
 * En agosto no se notó porque los pocos registros nuevos de ese periodo se
 * cerraron todos: 1, 2, 0 y 3 — los 6 del equipo que dice la lámina 8 del
 * documento de incentivos. Las dos definiciones daban el mismo número y por eso
 * nadie las vio separadas.
 *
 * El resto del CRM ya contaba bien, con `esVentaNueva` por `cerrado_en`. Era el
 * bono el que tenía la otra definición. Misma palabra, dos números: la familia
 * de error que este proyecto persigue desde el 26/08.
 *
 * Lo segundo que prueba esta suite es la lectura de la facturación. El dato del
 * banco llega un periodo tarde —lo que se carga en el periodo del 19/08 al
 * 18/09 es el cierre de AGOSTO— y en los meses sin meta la pantalla tapaba los
 * montos con «sin meta este mes» y el pie decía «falta la facturación». Las dos
 * frases son falsas cuando el dato acaba de subirse.
 *
 * Lo que esta suite NO impone: un tope de 100%. La escala vigente es
 * [[80,15],[110,30]] y `nombreTramo` tiene un tramo «Sobrecumplimiento» entre
 * 100 y el tope. Recortar en 100 dejaría el último tramo inalcanzable. El
 * sobrecumplimiento tiene que seguir siendo posible; lo que no puede es venir
 * de contar prospectos.
 */
import { chromium } from 'playwright';

const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport:{ width:1400, height:1400 } });
const errs = []; p.on('pageerror', e => errs.push(String(e.message)));
await p.goto('file:///home/claude/crm/Stratis_CRM_Supabase.html', { waitUntil:'domcontentloaded' });
await p.waitForTimeout(1200);

const R = await p.evaluate(async () => {
  const r = {};
  const falla = (n, e) => { r[n] = false; r._rotas = (r._rotas || []).concat(n + ': ' + e.message); };

  /* ---- El escenario, calcado del real -----------------------------------
     Un ejecutivo con cartera, dos afiliaciones cerradas y un montón de
     prospectos cargados y sin cerrar. Y la facturación del periodo cargada,
     con el periodo SIN meta de facturación: el mes 2 de la ruta reajustada. */
  modoDemo();
  const P = periodoHoy();
  const v = ventanaPeriodo(P);
  const dentro = v.ini;                        // una fecha dentro de la ventana
  const CORREO = 'juan@x.com';

  USUARIOS = [{ nombre:'Juan Torres', nombreCompleto:'Juan Torres', correo:CORREO,
                rol:'Ejecutivo', activo:true }];
  S.user = { nombre:'Jose Luis Rios Medina', correo:'a@x.com', rol:'Analista' };

  CLIENTES = [];
  for (let i = 0; i < 100; i++)
    CLIENTES.push({ customer_id:'C'+(200000+i), nombre_comercio:'COMERCIO '+i, rubro:'bodega',
      distrito:'LINCE', direccion:'x', estado:'ACTIVO', tipo_registro:'CARTERA',
      contacto_bbva:'CORREO', resultado_gestion:'PENDIENTE',
      asignado:'Juan Torres', asignado_correo:CORREO, creado_en:dentro });

  /* 2 afiliaciones de verdad y 30 prospectos cargados sin cerrar. Con la
     definición vieja esto marcaba 32 ventas; con la buena, 2. */
  const VENDIDAS = 2, PROSPECTOS = 30;
  for (let i = 0; i < VENDIDAS; i++)
    CLIENTES.push({ customer_id:'NUEVO-2010000000'+i, ruc:'2010000000'+i, nombre_comercio:'VENDIDA '+i,
      tipo_registro:'NUEVO', estado:'ACTIVO', resultado_gestion:'VENTA',
      asignado:'Juan Torres', asignado_correo:CORREO, creado_en:dentro, cerrado_en:dentro });
  for (let i = 0; i < PROSPECTOS; i++)
    CLIENTES.push({ customer_id:'NUEVO-2020000000'+i, ruc:'2020000000'+i, nombre_comercio:'PROSPECTO '+i,
      tipo_registro:'NUEVO', estado:'ACTIVO', resultado_gestion:'PENDIENTE',
      asignado:'Juan Torres', asignado_correo:CORREO, creado_en:dentro });

  byId = {}; CLIENTES.forEach(c => byId[String(c.customer_id)] = c);
  DB.cargar([]); SEGUIMIENTOS = []; AUDITORIA = []; METAS = [];
  CLIENTES.forEach(c => RULES.recomputarBase(c.customer_id));

  /* La facturación: base congelada y cierre cargado, creciendo 10%. */
  FACT_BASE   = [{ correo:CORREO, monto: 1000000 }];
  FACTURACION = [{ periodo:P, correo:CORREO, monto_inicial:null, monto_final: 1100000 }];

  /* Los parámetros del mes 2 de la ruta reajustada: la facturación todavía no
     pide nada, y por eso sale del reparto. */
  PARAMS = [{ vigente_desde:'2026-01', valor:{
    metas: { reactivacion_pp:20, facturacion_pct:15, ventas_mes:7 },
    curva: { reactivacion_pp:[0,5,10,15,20], facturacion_pct:[0,0,5,10,15] },
    pesos: { reactivacion:30, facturacion:50, venta:20 },
    escala: [[80,15],[110,30]], base_incumple_uno:15, pago_mensual:80
  } }];
  BONO = paramsDe(P);

  const B  = paramsDe(P);
  const M  = metaPeriodo(P, B);
  const cu = cumplimientoDe(CORREO, P);
  const fila  = k => cu.objetivos.find(o => o.id === k) || {};
  const venta = fila('venta'), fact = fila('fact');

  /* ---- Que el escenario sea el que creo ---------------------------------
     Sin esto, media suite podría pasar por no estar midiendo nada. */
  try {
    r['el periodo de prueba no tiene meta de facturación'] = M.facturacion_pct === 0;
    r['hay más prospectos cargados que ventas cerradas'] = PROSPECTOS > VENDIDAS;
    r['la facturación del periodo está cargada'] = crecimientoFact(CORREO, P) !== null;
  } catch (e){ falla('el escenario se arma', e); }

  /* ---- La venta ---------------------------------------------------------- */
  try {
    r['la venta cuenta afiliaciones cerradas, no prospectos cargados'] =
      venta.logro === VENDIDAS + ' ventas';
    r['un prospecto en PENDIENTE no suma al cumplimiento de venta'] =
      Math.abs(venta.cumpl - VENDIDAS / M.ventas_mes * 100) < 1e-9;
    /* La prueba que le duele al build viejo: 32 sobre una meta de 7 daba 457%. */
    r['cargar prospectos no dispara el cumplimiento de venta'] = venta.cumpl <= 100;
  } catch (e){ falla('la venta cuenta cerradas', e); }

  /* El bono tiene que contar lo mismo que el resto del CRM, que ya usaba
     `esVentaNueva`. Es la comprobación de «una palabra, un número». */
  try {
    const delCrm = CLIENTES.filter(c => esVentaNueva(c) && c.asignado_correo === CORREO
                                     && enVentana(c.cerrado_en || c.creado_en, P)).length;
    r['el bono cuenta las ventas igual que el resto del CRM'] =
      venta.logro === delCrm + ' ventas';
  } catch (e){ falla('el bono cuenta igual que el CRM', e); }

  /* ---- El ponderado ------------------------------------------------------ */
  try {
    /* Con la facturación fuera del reparto, el ponderado es reactivación y
       venta sobre 50 puntos de peso. Que dé lo que dice la aritmética. */
    const esperado = (fila('react').cumpl * 30 + venta.cumpl * 20) / 50;
    r['el ponderado reparte solo entre lo medible'] = Math.abs(cu.total - esperado) < 1e-9;
    r['el ponderado no pasa de 100 por prospectos cargados'] = cu.total <= 100;
    r['la facturación sale del reparto y se dice cuánto peso quedó'] =
      cu.completo === false && cu.pesoMedido === 50;
  } catch (e){ falla('el ponderado', e); }

  /* El tope NO existe, y es a propósito: la escala llega a 110. */
  try {
    r['el sobrecumplimiento sigue siendo alcanzable'] =
      escalaDe(B).slice(-1)[0][0] > 100 && nombreTramo(105, B) === 'Sobrecumplimiento';
    r['pasado el tope no paga más'] =
      tramoIncentivo(500, B) === tramoIncentivo(escalaDe(B).slice(-1)[0][0], B);
  } catch (e){ falla('la escala', e); }

  /* ---- La facturación se ve, aunque no puntúe ---------------------------- */
  try {
    r['la fila de facturación muestra el crecimiento aunque no puntúe'] =
      fact.logro === '+10.0%';
    r['y muestra los montos, no solo el porcentaje'] =
      fact.detalle.includes(soles(1000000)) && fact.detalle.includes(soles(1100000));
    /* Lo que nadie tenía cómo saber leyendo la pantalla: de qué mes es. */
    r['dice de qué mes es el dato cargado'] =
      fact.detalle.includes('cierre de ' + nombreMes(mesAnterior(P)));
    r['dice que está a la vista pero fuera del promedio'] =
      /fuera del promedio/.test(fact.detalle);
    r['no dice que falta un dato que sí está cargado'] =
      !/falta/i.test(fact.detalle);
  } catch (e){ falla('la fila de facturación', e); }

  /* ---- Y la pantalla lo dibuja ------------------------------------------- */
  try {
    S.tab = 'bono'; S.pBono = P; S.comoEjec = ''; render();
    await new Promise(x => setTimeout(x, 450));
    const txt = (document.querySelector('main') || document.body).innerText;
    r['la pestaña se dibuja con la fila de facturación'] = txt.includes('Facturación');
    r['el pie del ponderado no dice que falta la facturación'] =
      txt.includes('todavía no puntúa') && !txt.includes('falta la facturación');
    /* Con `includes` a secas, «32 ventas» contiene «2 ventas» y el build viejo
       pasaba esta comprobación sin merecerlo. */
    r['el número de ventas sale dibujado'] =
      new RegExp('(^|\\D)' + VENDIDAS + ' ventas').test(txt) && !/\d\d ventas/.test(txt);
  } catch (e){ falla('la pantalla', e); }

  r._n = `ventas ${venta.logro} · venta ${Number(venta.cumpl||0).toFixed(1)}%`
       + ` · ponderado ${Number(cu.total||0).toFixed(1)}% · fact "${fact.detalle}"`;
  return r;
});

await p.close(); await b.close();

const det = R._n, rotas = R._rotas || [];
['_n','_rotas'].forEach(k => delete R[k]);
const ok  = Object.entries(R).filter(([, v]) => v).map(([k]) => k);
const mal = Object.entries(R).filter(([, v]) => !v).map(([k]) => k);
ok.forEach(n => console.log('  ok   ' + n));
mal.forEach(n => console.log('  MAL  ' + n));
rotas.forEach(n => console.log('  ROTA ' + n));
if (mal.length) console.log('   ' + det);
console.log(`\n${ok.length}/${ok.length + mal.length} · errores JS: ${errs.length ? errs.join(' | ') : 'ninguno'}`);
process.exit(mal.length ? 1 : 0);
