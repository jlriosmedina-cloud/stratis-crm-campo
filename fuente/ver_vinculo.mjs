import { chromium } from 'playwright';
const tema = process.argv[2] || 'light';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport:{ width:1100, height:1300 }, deviceScaleFactor:2 });
const errs=[]; p.on('pageerror', e=>errs.push(String(e.message)));
await p.goto('file:///home/claude/crm/Stratis_CRM_Supabase.html', { waitUntil:'domcontentloaded' });
await p.waitForTimeout(1100);
await p.evaluate(t => {
  document.documentElement.dataset.theme = t;
  modoDemo();
  const hoy = hoyISO(), dia = n => new Date(Date.parse(hoy+'T00:00:00Z')-n*86400000).toISOString().slice(0,10);
  const V='v@x.com';
  USUARIOS=[{nombre:'Vanessa Perez',nombreCompleto:'Vanessa Perez',correo:V,rol:'Ejecutivo',activo:true}];
  S.user={nombre:'Jose Luis Rios Medina',correo:'a@x.com',rol:'Analista'};
  const com=(id,nom,dist,dir)=>({customer_id:id,nombre_comercio:nom,rubro:'restaurante',distrito:dist,
    direccion:dir,estado:'ACTIVO',tipo_registro:'CARTERA',contacto_bbva:'CORREO',resultado_gestion:'PENDIENTE',
    asignado:'Vanessa Perez',asignado_correo:V,creado_en:dia(40)});
  CLIENTES=[com('25694914','BERYPEZ S.A.C.','JESUS MARIA','FUNDO OYAGUE MAXIMO ABRIL 529'),
            com('27016546','BERYPEZ II S.A.C.','LINCE','LOS MIRTOS 315')];
  byId={}; CLIENTES.forEach(c=>byId[String(c.customer_id)]=c);
  DB.cargar([{id:'g1',customer_id:'25694914',correo_stratis:V,ejecutivo:'Vanessa Perez',
    fecha_contacto:dia(9),hora_contacto:'11:00',tipo_contacto:'visita_presencial',resultado:'efectivo',
    con:'CLIENTE',destinatario:'cliente',cumple_visita:'SI',ubicacion_verificada:true,
    creado_en:dia(9)+'T15:00:00Z',inferida:false}]);
  SEGUIMIENTOS=[]; AUDITORIA=[]; METAS=[];
  VINCULOS=[{customer_id_a:'25694914',customer_id_b:'27016546',
    motivo:'Mismo comercio en el mismo local con dos customer_id en la base de BBVA.',
    validado_por:'jose.rios@mystratis.com', validado_en: dia(0)+'T10:00:00Z', anulado_en:null}];
  _VIN_GRUPOS=null;
  CLIENTES.forEach(c=>RULES.recomputarBase(c.customer_id));
  S.tab='cartera'; S.cid='27016546'; render();
}, tema);
await p.waitForTimeout(600);
console.log(await p.evaluate(() => {
  const kv = [...document.querySelectorAll('.kv')].find(e => /Mismo comercio/i.test(e.textContent));
  return kv ? kv.textContent.trim().replace(/\s+/g,' ') : '(no aparece el bloque)';
}));
console.log('errores JS: ' + (errs.length?errs.join(' | '):'ninguno'));
await p.screenshot({ path:`/home/claude/crm/vinculo-${tema}.png`, fullPage:true });
await b.close();
