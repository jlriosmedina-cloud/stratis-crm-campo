/* Dos customer_id, un solo comercio.
 *
 * José, 04/09: BBVA entregó BERYPEZ S.A.C. (25694914) y BERYPEZ II S.A.C.
 * (27016546) como dos comercios de la cartera, y él validó en campo que son el
 * mismo comercio en el mismo local. Vanessa registraba todo dos veces: el
 * 26/08 hay dos visitas presenciales, 11:00 y 11:13, que son la misma visita.
 *
 * Lo que se construyó es un vínculo DERIVADO, no una copia de registros. José
 * pidió «duplicar los registros de manera automática» y el efecto que quería es
 * este, pero copiar filas habría inflado el conteo de GESTIONES —el denominador
 * de la puntualidad, los «911» del acta— y habría dejado en la base una visita
 * presencial con una ubicación que nadie verificó.
 *
 * Esta suite fija las dos mitades de eso:
 *
 *   · lo que el vínculo SÍ arrastra: gestión, efectividad, visita, cobertura, y
 *     la parada de la ruta que ya no hace falta;
 *   · lo que NO arrastra: el número de gestiones registradas, las filas de la
 *     base, y el tamaño del portafolio — los dos comercios siguen siendo dos.
 *
 * Y las dos guardas: no arrastra entre ejecutivos distintos, y no se une nada
 * por parecido de nombre.
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

  /* ---- El escenario ------------------------------------------------------
     A y B son el mismo comercio, del mismo ejecutivo. Solo A tiene gestiones,
     incluida una visita concretada. B no tiene ninguna fila: es el caso puro.
     C y D son de ejecutivos distintos y también están vinculados: la guarda.
     E queda suelto y sin gestión, para que el embudo tenga con qué contrastar. */
  modoDemo();
  const hoy = hoyISO();
  const dia = n => new Date(Date.parse(hoy + 'T00:00:00Z') - n*86400000).toISOString().slice(0,10);
  const V = 'v@x.com', J = 'j@x.com';

  USUARIOS = [{ nombre:'Vanessa Perez', nombreCompleto:'Vanessa Perez', correo:V, rol:'Ejecutivo', activo:true },
              { nombre:'Juan Torres',   nombreCompleto:'Juan Torres',   correo:J, rol:'Ejecutivo', activo:true }];
  S.user = { nombre:'Jose Luis Rios Medina', correo:'a@x.com', rol:'Analista' };

  const com = (id, nom, correo, nombreEj, dist) => ({ customer_id:id, nombre_comercio:nom, rubro:'restaurante',
    distrito:dist || 'LINCE', direccion:'LOS MIRTOS 315', estado:'ACTIVO', tipo_registro:'CARTERA',
    contacto_bbva:'CORREO', resultado_gestion:'PENDIENTE', asignado:nombreEj, asignado_correo:correo,
    creado_en: dia(40) });
  CLIENTES = [
    com('A1','BERYPEZ S.A.C.',    V, 'Vanessa Perez'),
    com('B1','BERYPEZ II S.A.C.', V, 'Vanessa Perez', 'JESUS MARIA'),
    com('C1','CRUZADO UNO',       V, 'Vanessa Perez'),
    com('D1','CRUZADO DOS',       J, 'Juan Torres'),
    com('E1','SUELTO',            V, 'Vanessa Perez')
  ];
  byId = {}; CLIENTES.forEach(c => byId[String(c.customer_id)] = c);

  /* Solo A1 y C1 tienen trabajo. Una visita concretada en cada uno. */
  const g = (cid, correo, nom) => ({ id:'g'+cid, customer_id:cid, correo_stratis:correo, ejecutivo:nom,
    fecha_contacto: dia(2), hora_contacto:'11:00', tipo_contacto:'visita_presencial',
    resultado:'efectivo', con:'CLIENTE', destinatario:'cliente', cumple_visita:'SI',
    ubicacion_verificada:true, creado_en: dia(2)+'T15:00:00Z', inferida:false });
  DB.cargar([ g('A1', V, 'Vanessa Perez'), g('C1', V, 'Vanessa Perez') ]);
  SEGUIMIENTOS = []; AUDITORIA = []; METAS = [];

  VINCULOS = [
    { customer_id_a:'A1', customer_id_b:'B1', motivo:'mismo local', validado_por:'jose.rios@mystratis.com',
      validado_en: dia(0) + 'T10:00:00Z', anulado_en:null },
    /* El que NO debe arrastrar: dos ejecutivos distintos. */
    { customer_id_a:'C1', customer_id_b:'D1', motivo:'prueba', validado_por:'x', anulado_en:null }
  ];
  if (typeof _VIN_GRUPOS !== 'undefined') _VIN_GRUPOS = null;
  CLIENTES.forEach(c => RULES.recomputarBase(c.customer_id));

  const base = cid => byId[cid]._base || RULES.recomputarBase(cid);

  /* ---- Que el escenario sea el que creo --------------------------------- */
  try {
    r['B1 no tiene ninguna gestión propia'] = DB.delCliente('B1').length === 0;
    r['A1 sí tiene una visita concretada'] =
      DB.delCliente('A1').filter(x => x.Cumple_Visita === 'SI').length === 1;
  } catch (e){ falla('el escenario', e); }

  /* ---- Lo que el vínculo SÍ arrastra ------------------------------------ */
  try {
    r['el hermano sin gestiones cuenta como gestionado'] = base('B1')._gestionado === true;
    /* Y se puede decir por qué: sin esto la ficha afirma sin explicar. */
    r['y queda marcado que es por el vínculo, no por trabajo propio'] =
      base('B1')._porVinculo === true && base('A1')._porVinculo === false;
    r['el suelto sin gestión sigue sin gestionar'] = base('E1')._gestionado === false;
  } catch (e){ falla('arrastre de gestión', e); }

  try {
    const f = cadenaEntre(null, hoy);
    r['el embudo cuenta a los dos en Gestión'] = f.gestion.has('A1') && f.gestion.has('B1');
    r['el embudo cuenta a los dos en Efectividad'] = f.efectividad.has('A1') && f.efectividad.has('B1');
    r['el embudo cuenta a los dos en Visitas'] = f.visita.has('A1') && f.visita.has('B1');
    /* La razón de ser de todo esto: DOS comercios, no uno. */
    r['los dos siguen contando por separado, no se funden en uno'] =
      f.visita.size === 3 && f.cart.length === 5;
    r['el embudo no se ensancha hacia abajo'] =
      f.visita.size <= f.efectividad.size && f.efectividad.size <= f.gestion.size;
  } catch (e){ falla('el embudo', e); }

  try {
    const filas = DB.todos().filter(x => x.Cumple_Visita === 'SI');
    r['el contador de visitas por comercio arrastra al hermano'] =
      comerciosConVisita(filas) === 3;   // A1, B1 y C1 — D1 no, es de otro ejecutivo
  } catch (e){ falla('comerciosConVisita', e); }

  /* ---- Lo que NO arrastra ------------------------------------------------ */
  try {
    /* Si esto se rompe es que alguien volvió a la idea de copiar filas, y con
       ella se va el denominador de la puntualidad y el acta del bono. */
    r['no se crearon filas nuevas en la base'] = DB.todos().length === 2;
    r['el hermano sigue sin gestiones propias'] = DB.delCliente('B1').length === 0;
    r['el conteo de gestiones del hermano sigue en cero'] = base('B1')._n === 0;
    const f = cadenaEntre(null, hoy);
    /* `conAlguna` mide fichas con algún intento REGISTRADO: ahí el hermano no
       tiene nada y decir que sí sería mentir sobre el registro. */
    r['las fichas con intento registrado no incluyen al hermano'] = !f.conAlguna.has('B1');
  } catch (e){ falla('lo que no arrastra', e); }

  /* ---- Las dos guardas --------------------------------------------------- */
  try {
    r['no arrastra entre ejecutivos distintos'] = base('D1')._gestionado === false;
    r['y el hermano de otro ejecutivo no entra al embudo'] =
      !cadenaEntre(null, hoy).visita.has('D1');
  } catch (e){ falla('guarda de ejecutivo', e); }

  try {
    /* Nada se une solo: sin fila en VINCULOS no hay grupo, por parecido que sea
       el nombre. «CRUZADO UNO» y «CRUZADO DOS» solo se unen porque hay fila. */
    const antes = hermanosDe('E1').length;
    VINCULOS = []; _VIN_GRUPOS = null;
    CLIENTES.forEach(c => RULES.recomputarBase(c.customer_id));
    r['sin vínculos cargados el CRM cuenta como siempre'] =
      antes === 0 && hermanosDe('A1').length === 0 && base('B1')._gestionado === false;
  } catch (e){ falla('sin vínculos', e); }

  /* ---- Y la ruta no manda dos veces al mismo local ----------------------- */
  try {
    VINCULOS = [{ customer_id_a:'A1', customer_id_b:'B1', motivo:'mismo local',
                  validado_por:'jose.rios@mystratis.com', anulado_en:null }];
    _VIN_GRUPOS = null;
    CLIENTES.forEach(c => RULES.recomputarBase(c.customer_id));
    S.comoEjec = V;
    /* De los cuatro de Vanessa: A1 visitado, C1 visitado, B1 visitado por el
       vínculo. Queda uno solo por visitar. Contra el build viejo quedaban dos,
       y el segundo era un viaje al local donde ya había estado. */
    const ruta = rutasRecomendadas();
    r['la ruta no manda al hermano ya visitado'] = ruta.total === 1;
    const ids = (ruta.grupos || []).flatMap(gr => (gr.tramos || []).flat())
      .map(x => String((x.c || x).customer_id));
    r['y ningún tramo lleva a los dos del mismo local'] = !(ids.includes('A1') && ids.includes('B1'));
  } catch (e){ falla('las rutas', e); }

  /* ---- Y el archivo que va a BBVA cuenta lo mismo que el embudo ---------- */
  try {
    /* Si estas dos se separan, el COUNTIF del banco y nuestro deck dan
       números distintos para el mismo hecho. Es la razón de ser de la
       columna `Cuenta_Como_Gestion`. */
    const i = COLS_DETALLE.indexOf('Cuenta_Como_Gestion');
    const fila = c => { const f = filaComercio(c, false);
      return f ? f[f.length - COLS_DETALLE.length + i] : null; };
    const f = cadenaEntre(null, hoy);
    const filas = CLIENTES.filter(c => !esClienteNuevo(c))
      .map(c => ({ id:String(c.customer_id), enEmbudo: f.gestion.has(String(c.customer_id)), col: fila(c) }))
      .filter(x => x.col !== null);
    r['la columna del banco no contradice al embudo'] = filas.length > 0
      && filas.every(x => (x.col === 'SI') === x.enEmbudo);
    const b1 = filas.find(x => x.id === 'B1');
    r['y el hermano sale con SI en el archivo'] = !!b1 && b1.col === 'SI';
  } catch (e){ falla('la columna del banco', e); }

  /* ---- Y la ficha lo dice ------------------------------------------------ */
  try {
    S.comoEjec = ''; S.tab = 'cartera'; S.cid = 'B1'; render();
    await new Promise(x => setTimeout(x, 450));
    const txt = (document.querySelector('main') || document.body).innerText;
    r['la ficha nombra al comercio vinculado'] = /BERYPEZ S\.A\.C\./.test(txt) && /Mismo comercio/i.test(txt);
    r['la ficha explica que no es trabajo propio'] = /no por gestiones propias/i.test(txt);
    r['y dice quién validó el vínculo'] = /validado por/i.test(txt);
  } catch (e){ falla('la ficha', e); }

  r._n = 'A1 ges=' + base('A1')._gestionado + ' B1 ges=' + base('B1')._gestionado
       + ' filas=' + DB.todos().length;
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
