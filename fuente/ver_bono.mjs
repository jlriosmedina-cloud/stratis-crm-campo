import { chromium } from 'playwright';
const tema = process.argv[2] || 'light';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport:{ width:1420, height:1500 }, deviceScaleFactor:2 });
const errs=[]; p.on('pageerror', e=>errs.push(String(e.message)));
await p.goto('file:///home/claude/crm/Stratis_CRM_Supabase.html', { waitUntil:'domcontentloaded' });
await p.waitForTimeout(1200);
await p.evaluate(t => {
  document.documentElement.dataset.theme = t;
  modoDemo();
  const P = periodoHoy(), v = ventanaPeriodo(P), d = v.ini, C='juan@x.com';
  USUARIOS=[{nombre:'Juan Torres',nombreCompleto:'Juan Torres',correo:C,rol:'Ejecutivo',activo:true}];
  S.user={nombre:'Jose Luis Rios Medina',correo:'a@x.com',rol:'Analista'};
  CLIENTES=[];
  for(let i=0;i<100;i++) CLIENTES.push({customer_id:'C'+(200000+i),nombre_comercio:'COMERCIO '+i,rubro:'bodega',
    distrito:'LINCE',direccion:'x',estado:'ACTIVO',tipo_registro:'CARTERA',contacto_bbva:'CORREO',
    resultado_gestion: i<3?'RETENIDO':'PENDIENTE', cerrado_en: i<3?d:null,
    asignado:'Juan Torres',asignado_correo:C,creado_en:d});
  for(let i=0;i<2;i++) CLIENTES.push({customer_id:'NUEVO-2010000000'+i,ruc:'2010000000'+i,nombre_comercio:'VENDIDA '+i,
    tipo_registro:'NUEVO',estado:'ACTIVO',resultado_gestion:'VENTA',asignado:'Juan Torres',asignado_correo:C,creado_en:d,cerrado_en:d});
  for(let i=0;i<30;i++) CLIENTES.push({customer_id:'NUEVO-2020000000'+i,ruc:'2020000000'+i,nombre_comercio:'PROSPECTO '+i,
    tipo_registro:'NUEVO',estado:'ACTIVO',resultado_gestion:'PENDIENTE',asignado:'Juan Torres',asignado_correo:C,creado_en:d});
  byId={}; CLIENTES.forEach(c=>byId[String(c.customer_id)]=c);
  DB.cargar([]); SEGUIMIENTOS=[]; AUDITORIA=[]; METAS=[];
  CLIENTES.forEach(c=>RULES.recomputarBase(c.customer_id));
  FACT_BASE=[{correo:C,monto:1000000}];
  FACTURACION=[{periodo:P,correo:C,monto_inicial:null,monto_final:1100000}];
  PARAMS=[{vigente_desde:'2026-01',valor:{metas:{reactivacion_pp:20,facturacion_pct:15,ventas_mes:7},
    curva:{reactivacion_pp:[0,5,10,15,20],facturacion_pct:[0,0,5,10,15]},
    pesos:{reactivacion:30,facturacion:50,venta:20},escala:[[80,15],[110,30]],base_incumple_uno:15,pago_mensual:80}}];
  BONO=paramsDe(P);
  S.tab='bono'; S.pBono=P; S.comoEjec=''; render();
}, tema);
await p.waitForTimeout(600);
console.log(await p.evaluate(() => {
  const t = e => e ? e.textContent.trim().replace(/\s+/g,' ') : '(no)';
  return [...document.querySelectorAll('.bn-obj tbody tr')].map(t).join('\n')
    + '\n--- cierre ---\n' + [...document.querySelectorAll('.bn-cierre .bn-num')].map(t).join('\n');
}));
console.log('errores JS: ' + (errs.length?errs.join(' | '):'ninguno'));
await p.screenshot({ path:`/home/claude/crm/bono-${tema}.png`, fullPage:true });
await b.close();
