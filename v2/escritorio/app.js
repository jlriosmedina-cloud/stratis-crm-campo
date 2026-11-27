
/* =========================================================================
   Stratis · CRM de campo v2 — Escritorio del analista
   Valida gestiones en tiempo real, audita y carga transacciones.
   Lee v2_actividad / v2_mi_base / v2_avance; escribe solo por RPC.
   ========================================================================= */
"use strict";
const SUPABASE_URL = "https://xwvpnagvdrjffayzsnke.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_-WtGPS_yJYllxVMR0RCDQg_kQHLHSPq";   // publicable por diseño
const BUILD = "{{BUILD}}";
var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth:{ persistSession:true, autoRefreshToken:true, storageKey:"stratis-v2-sesion" } });

/* ---------- reglas de las señales (umbrales) ---------- */
const REGLA = { cerca:150, lejos:500, precision:60, jornadaIni:8, jornadaFin:20, retrasoMin:30, comentarioMin:12, ritmoMin:8 };
// Feedback de la visita: mismos textos y grupos que el celular (y que v2_feedback_tipos en la base)
const FB_NINGUNO = "Sin observaciones del comercio";
// Árbol del 26/09/2026: rama → detalle → qué ofreció el ejecutivo (v2_feedback_acciones)
const FEEDBACK = [
  ["Competencia y otros medios de cobro", ["Usa POS de otra marca", "Cobra con Yape o Plin para no pagar comisión", "Solo acepta efectivo"]],
  ["Tasa y abonos", ["Pide una tasa más baja", "POS no cuenta con la tarifa acordada", "POS problema con abonos", "Los abonos le llegan con demora"]],
  ["Equipo y contómetros", ["POS no enciende", "Mala Señal en el POS", "POS no tiene señal y no puedo cobrar", "POS queda procesando el pago , se demora", "El cobro a través del POS tarda demasiado cuando existe alta demanda", "POS rechaza los pagos con tarjeta", "No tiene contómetros o le quedan pocos", "Solicitó cambio de equipo"]],
  ["Uso del POS", ["Le parece complicado usar el POS", "No sabe revisar sus ventas o abonos", "Le falta una función"]],
  ["Atención y soporte", ["Soporte no ayudó al comercio", "Su funcionario de BBVA no responde", "Teléfono del comercio que se comunicó a soporte"]],
  ["Decisión y necesidad", ["No se encontraba la persona que tomaba decisiones", "No necesitaba los POS", "Desconfía de la visita (duda que representemos a BBVA)", "No pidió el POS"]],
];
const ACCIONES = ["Evaluar mejora de tasa", "Expliqué cómo y cuándo abona Openpay", "Ofrecí evaluación de préstamo BBVA", "Mostré los beneficios de cobrar con tarjeta",
  "Revisar la tarifa acordada con BBVA", "Validé el estado del equipo", "Descarté errores en sitio (reinicio, chip, batería)", "Solicité reposición de contómetros",
  "Solicité cambio de equipo (sin costo)", "Solicité cambio de equipo (con costo)", "Capacitación en el momento", "Capacitación programada", "Llamé a soporte", "Generé ticket de atención", "Seguimiento del caso",
  "Derivé a postventa", "Derivé a BBVA con urgencia", "Reagendé con quien decide", "Otra acción"];
function iaDistinto(v){
  const p = (v.ia_propuesta || {}).propuesta; if (!p) return "";
  const igual = (x, y) => JSON.stringify([].concat(x || []).slice().sort()) === JSON.stringify([].concat(y || []).slice().sort());
  const c = [];
  if ((p.con || null) !== (v.con || null)) c.push("con quién habló");
  if ((p.que || null) !== (v.con === "Nadie" ? null : v.que || null) && v.con !== "Nadie") c.push("qué pasó");
  if ((p.decision || null) !== (v.decision || null)) c.push("la decisión");
  if (!igual(p.feedback, v.feedback)) c.push("el feedback");
  if (!igual(p.acciones, v.fb_acciones)) c.push("qué ofreció");
  return c.join(", ");
}
function demoraTxt(x){
  if (!x || (x.dias_demora_abono == null && !x.banco_abono)) return "";
  return [x.dias_demora_abono != null ? x.dias_demora_abono + " día" + (Number(x.dias_demora_abono) === 1 ? "" : "s") : "", x.banco_abono ? "le abonan en " + (x.banco_abono === "BBVA" ? "BBVA" : "otro banco") : ""].filter(Boolean).join(" · ");
}
function competidorTxt(x){
  if (!x || !(x.competidores || []).length) return "";
  return x.competidores.map(c => c === "Otro" && x.competidor_otro ? x.competidor_otro : c).join(", ");
}
const OBS_MOTIVOS = ["Comentario insuficiente","Comercio repetido en el día","Hora fuera de jornada","El resultado no coincide con el comentario","Otro"];
const ANU_MOTIVOS = ["Comercio equivocado","Visita duplicada","Registro de prueba","No hubo visita presencial","Otro"];
const COLORES = ["var(--ej1)","var(--ej2)","var(--ej3)","var(--ej4)","var(--ej5)","var(--ej6)"];
// color real (para Leaflet, que no entiende var())
const colorCss = v => { const m = /^var\((--[\w-]+)\)$/.exec(v || ""); return m ? getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim() : v; };

/* ---------- utilidades ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const TZ = "America/Lima";
const D = x => x instanceof Date ? x : new Date(x);
const hh = d => d ? D(d).toLocaleTimeString("en-GB",{ timeZone:TZ, hour:"2-digit", minute:"2-digit", hour12:false }) : "—";
const dd = d => d ? D(d).toLocaleDateString("en-GB",{ timeZone:TZ, day:"2-digit", month:"2-digit" }) : "—";
const ddhh = d => d ? `${dd(d)} ${hh(d)}` : "—";
const iso = d => D(d).toLocaleDateString("en-CA",{ timeZone:TZ });
const horaLima = d => Number(D(d).toLocaleTimeString("en-GB",{ timeZone:TZ, hour:"2-digit", hour12:false }).slice(0,2));
const fISO = s => s ? String(s).split("-").reverse().slice(0,2).join("/") : "—";
const pNum = id => { const m = /^(\d{4})-(\d{2})$/.exec(String(id || "")); return m ? (Number(m[1]) - 2026) * 12 + Number(m[2]) - 7 : null; };
const pNom = p => { const n = pNum(p && p.id); return n && n > 0 ? "P" + n : String(p && p.id || ""); };
const pRango = p => p && p.ini && p.fin ? fISO(p.ini) + " – " + fISO(p.fin) : "";
const hoyISO = () => new Date().toLocaleDateString("en-CA",{ timeZone:TZ });
const ayerISO = () => { const d = new Date(hoyISO() + "T12:00:00Z"); d.setUTCDate(d.getUTCDate()-1); return d.toISOString().slice(0,10); };
const mDist = m => m == null ? "sin ubicación" : m < 1000 ? `${m} m` : `${(m/1000).toFixed(1).replace(".",",")} km`;
const claseDist = v => v.distancia_m == null ? "no" : v.distancia_m <= REGLA.cerca ? "ok" : v.distancia_m <= REGLA.lejos ? "med" : "mal";
const nombreCorto = n => String(n || "").split(" ")[0];
const num = n => Number(n || 0).toLocaleString("es-PE");
// Ojo de privacidad (base 2026-11): cerrado al entrar y sin recordar el estado. Oculta montos, potenciales,
// volúmenes, celulares y correos en pantalla. Lo descargable (Base para BBVA, presentación, PDF) no cambia.
const OCULTO = `<span class="oculto" title="Abre el ojo para verlo">••••</span>`;
const priv = txt => S.ver ? txt : OCULTO;
const S = { sesion:null, yo:null, admin:false, periodo:null, cargando:true, error:"",
  vista:"directorio", filtro:"todos", ej:"todos", ver:false, verCel:null, dia:"hoy", soloSenal:false, sel:null, marcadas:new Set(), accion:null, ocupado:false,
  act:[], actEn:null, base:[], baseMap:{}, docMap:{}, ejecutivos:[], bit:{}, trx:{}, nuevas:new Set(), pausa:false, ultimaRecep:null,
  tab:"traza", traza:null, busca:"", carga:{ tipo:"diario", archivo:null, filas:null, hecho:false, resultado:null }, cargas:[], avance:null, avanceErr:"", retenidas:[] };

const ICON = {
  resumen:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
  cartera:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>',
  reporte:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/></svg>',
  mas:'<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
  cierre:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  pq:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h9M4 12h6M4 18h9"/><path d="M16 8l2 2 4-4"/><path d="M16 15l5 5M21 15l-5 5"/></svg>',
  fb:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M9 10h6M9 14h4"/></svg>',
  cola:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
  aud:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/><path d="M11 8v3l2 2"/></svg>',
  carga:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/></svg>',
  mapa:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3L3 6v15l6-3 6 3 6-3V3l-6 3-6-3z"/><path d="M9 3v15"/><path d="M15 6v15"/></svg>',
  ind:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 14l4-4 4 4 5-6"/></svg>',
  ok:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
  lupa:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
  equipo:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  luna:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
  sol:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>',
  ruta:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7"/></svg>',
  bloques:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="7" rx="1.5"/><rect x="3" y="13" width="18" height="7" rx="1.5"/><path d="M7 7.5h4M7 16.5h7"/></svg>',
  ojo:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  ojoNo:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.9 17.9A10.8 10.8 0 0 1 12 19C5 19 1 12 1 12a19.6 19.6 0 0 1 5.1-5.9M9.9 5.2A9.9 9.9 0 0 1 12 5c7 0 11 7 11 7a19.7 19.7 0 0 1-2.2 3.2M14.1 14.1a3 3 0 1 1-4.2-4.2"/><path d="M1 1l22 22"/></svg>',
  cel:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/></svg>',
  salir:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>',
};

/* ---------- tema ---------- */
const temaActual = () => document.documentElement.dataset.theme === "dark" ? "dark" : "light";
function cambiarTema(){
  const t = temaActual() === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem("stratis-esc-tema", t); } catch(e){}
  pintar();
}

/* ---------- ejecutivos y avatares ---------- */
function ejDe(correo){
  let e = S.ejecutivos.find(x => x.correo === correo);
  if (!e){
    const v = S.act.find(x => x.correo === correo);
    e = { correo, nombre: v ? v.ejecutivo : correo, ini: iniciales(v ? v.ejecutivo : correo), color: COLORES[S.ejecutivos.length % COLORES.length] };
    S.ejecutivos.push(e);
  }
  return e;
}
const iniciales = n => String(n || "?").split(/[\s.@]+/).filter(Boolean).slice(0,2).map(p => p[0].toUpperCase()).join("");
const AVATAR = e => `<span class="avatar" style="background:${e.color}">${esc(e.ini)}</span>`;
const nomDe = correo => { if (!correo) return "—"; if (S.yo && correo === S.yo.correo) return `${nombreCorto(S.yo.nombre_corto || S.yo.nombre)} (tú)`; const e = S.ejecutivos.find(x => x.correo === correo); return e ? e.nombre : correo.split("@")[0]; };

/* ---------- lectura de una visita ---------- */
const estadoDe = v => v.estado_anul === "anulada" ? "anu" : v.validacion === "validada" ? "val" : v.validacion === "observada" ? "obs" : "pend";
const ESTADO = { pend:["pend","Por validar"], val:["val","Validada"], obs:["obs","Observada"], anu:["anu","Anulada"] };
const pill = v => { const k = estadoDe(v); return `<span class="pill ${ESTADO[k][0]}">${ESTADO[k][1]}</span>`; };
const esHoy = v => iso(v.visitado_en) === hoyISO();
const esAyer = v => iso(v.visitado_en) === ayerISO();
// Cómo fue la visita, con las mismas palabras que el ejecutivo elige en el celular (desde el 26/09).
// Devuelve [qué eligió, detalle]. Los datos de la base (Con_Quien, Que_Paso) no cambian.
// «No se pudo hacer la visita» (29/09): «Cerrado» se guarda igual que antes y se lee «Cerrado hoy»
const MOTIVO_TXT = { "Cerrado":"Cerrado hoy", "Cerró definitivamente":"Cerró definitivamente", "No atendió":"Nadie atendió", "Zona insegura":"Zona insegura",
  "Otro motivo":"Otro motivo", "No estaba":"No estaba (registro anterior)" };
function comoFue(v){
  if (v.con === "Nadie") return v.motivo === "Dirección errada"
    ? ["El comercio no está en esta dirección", v.comercio_ubicado === true ? "Lo ubicó en otra dirección" : "No lo ubicó"]
    : ["No se pudo hacer la visita", MOTIVO_TXT[v.motivo] || v.motivo || "Sin motivo"];
  const otra = v.direccion_ok === false && v.comercio_ubicado === true ? "Lo ubicó en otra dirección · " : "";
  if (v.que === "Reagendada") return ["No estaba quien decide · quedó en volver", otra + (v.fecha_reagenda ? "Vuelve el " + fISO(v.fecha_reagenda) : "Sin fecha anotada")];
  if (v.que === "Sin éxito") return ["No estaba quien decide · sin compromiso", otra + "No dio información ni fecha"];
  return ["Habló con el dueño o encargado", otra + `${v.con === "Dueño" ? "Dueño" : "Encargado"} · ${v.decision || "sin decisión"}${v.equipo ? " · equipo recuperado: " + v.equipo : ""}${v.fecha_reagenda ? " · vuelve el " + fISO(v.fecha_reagenda) : ""}`];
}
// Comentario que contradice lo marcado (red de seguridad; sobre las 147 visitas limpias del 26/09 no marca ninguna)
function revisarMarcacion(v){
  const c = String(v.comentario || "").toLowerCase();
  if (v.con === "Dueño" && /(due[ñn][oa]|propietari[oa]|titular)\s+no\s+(se\s+)?(encontraba|encuentra|estaba|est[aá])/.test(c)) return "marcó Dueño, pero el comentario dice que no estaba";
  if (v.decision === "Realizará consumos" && /(conversar[aá]|consultar[aá]|hablar[aá])\s+con/.test(c)) return "marcó «Realizará consumos», pero el comentario dice que lo consultará";
  if (v.que === "Sin éxito" && v.con !== "Nadie" && /reprograma|volver a visitar|regres(e|ar)|venga|pasar (posteriormente|luego|ma[ñn]ana)|estar[aá] ma[ñn]ana|vuelvan? a llamar/.test(c)) return "el comentario dice que quedaron en volver";
  if (v.con === "Nadie" && v.motivo !== "Dirección errada" && /vivienda|otro negocio|nadie da raz[oó]n|no conocen|no hay comercio|no se encuentra comercio/.test(c)) return "el comentario dice que el comercio no está en esa dirección";
  return null;
}
const resumenRes = v => { const [t, d] = comoFue(v); return `${esc(t)}<small title="${esc(d)}">${esc(d)}</small>`; };
function repetidaHoy(v){ const d = iso(v.visitado_en); return S.act.some(x => x.id !== v.id && x.customer_id === v.customer_id && x.correo === v.correo && iso(x.visitado_en) === d && x.estado_anul !== "anulada"); }
const MOTIVOS_REVISAR = ["Zona insegura", "Otro motivo"];
function senales(v){
  const s = [];
  // Desde el 25/09 no se valida la dirección ni la distancia: la visita vale como la registra el ejecutivo.
  if (v.lat == null) s.push(["r", "Sin GPS"]);
  const h = horaLima(v.visitado_en); if (h < REGLA.jornadaIni || h >= REGLA.jornadaFin) s.push(["r","Fuera de jornada"]);
  if (repetidaHoy(v)) s.push(["","Repetida hoy"]);
  if (revisarMarcacion(v) && v.estado_anul !== "anulada") s.push(["", "Revisar marcación"]);
  // 29/09: motivos que no dejan rastro del comercio; la visita cuenta igual, solo se revisa el comentario
  if (v.con === "Nadie" && MOTIVOS_REVISAR.includes(v.motivo) && v.estado_anul !== "anulada") s.push(["", "Revisar motivo: " + v.motivo.toLowerCase()]);
  if (v.ubicacion_editada_en) s.push(["i","Ubicación actualizada después"]);
  if (v.resultado_editado_en) s.push(["i","Resultado corregido"]);
  if (v.comentario_editado_en) s.push(["i","Comentario corregido"]);
  if (v.fuera_plazo && v.estado_anul !== "anulada") s.push(["r", `Fuera de plazo (tenía hasta el ${fISO(v.plazo_hasta)})`]);
  if (v.estado_anul === "pendiente") s.push(["r","Pide anulación"]);
  if ((v.comentario || "").trim().length < REGLA.comentarioMin) s.push(["","Comentario corto"]);
  const lag = (D(v.recibido_en) - D(v.visitado_en))/60000; if (lag > REGLA.retrasoMin) s.push(["", `Llegó ${Math.round(lag)} min después`]);
  return s;
}

/* =========================================================================
   Datos
   ========================================================================= */
async function cargar(){
  S.cargando = true; S.error = ""; pintar();
  try {
    const hoy = hoyISO();
    const [u, p] = await Promise.all([
      sb.from("usuarios").select("correo,nombre,nombre_corto,rol,activo").eq("correo", S.sesion.user.email.toLowerCase()).maybeSingle(),
      sb.from("v2_periodos").select("*").lte("ini", hoy).gte("fin", hoy).maybeSingle(),
    ]);
    if (u.error) throw u.error;
    if (!u.data || !u.data.activo) throw new Error("Tu usuario no está activo en el CRM.");
    // Quién entra lo decide la base (tabla v2_acceso_escritorio), no el rol: por ahora, solo Jose.
    const acc = await sb.rpc("v2_puede_escritorio");
    if (acc.error) throw acc.error;
    if (acc.data !== true){ S.denegado = true; S.nuevaClave = null; await sb.auth.signOut().catch(() => {}); S.sesion = null; throw new Error("La vista de escritorio todavía no está habilitada para tu usuario. Tu CRM de campo sigue en el celular, igual que siempre."); }
    S.yo = u.data; S.admin = true;
    S.periodo = p.data || null;
    const us = await sb.from("usuarios").select("correo,nombre,nombre_corto,rol,activo").eq("activo", true).order("nombre");
    S.ejecutivos = (us.data || []).filter(x => x.rol === "Ejecutivo").map((x, i) => ({ correo:x.correo, nombre:x.nombre_corto || x.nombre, ini:iniciales(x.nombre_corto || x.nombre), color:COLORES[i % COLORES.length] }));
    await Promise.all([cargarActividad(true), cargarBase(), cargarAvance(), cargarFbInferido(), cargarMsiInferido(), cargarRetenidas()]);
  } catch(e){ S.error = e.message || String(e); }
  S.cargando = false; pintar();
  if (!S.error) escuchar();
}
// La API corta en 1.000 filas por respuesta y v2_actividad no pagina: si una respuesta llega al tope, se parte el rango de fechas en dos
// hasta que cada parte quepa (así no se pierden visitas sin avisar). Un solo día con más de 1.000 visitas no se puede partir.
async function leerActividad(d1, d2){
  const { data, error } = await sb.rpc("v2_actividad", { p_desde:d1, p_hasta:d2 });
  if (error) return { data:null, error };
  if ((data || []).length >= 1000 && d1 >= d2){ console.warn("v2_actividad: el día " + d1 + " llegó al tope de 1.000 visitas; pueden faltar filas"); if (typeof toast === "function") toast("El día " + fISO(d1) + " tiene 1.000 visitas o más: puede faltar alguna en la pantalla."); }
  if ((data || []).length < 1000 || d1 >= d2) return { data:data || [], error:null };
  const dias = Math.round((new Date(d2 + "T12:00:00Z") - new Date(d1 + "T12:00:00Z")) / 86400000);
  const m = new Date(d1 + "T12:00:00Z"); m.setUTCDate(m.getUTCDate() + Math.floor(dias / 2));
  const s2 = new Date(m); s2.setUTCDate(s2.getUTCDate() + 1);
  const [a, b] = await Promise.all([leerActividad(d1, m.toISOString().slice(0, 10)), leerActividad(s2.toISOString().slice(0, 10), d2)]);
  if (a.error || b.error) return { data:null, error:a.error || b.error };
  const vistos = new Set(), todo = [];
  a.data.concat(b.data).forEach(v => { if (!vistos.has(v.id)){ vistos.add(v.id); todo.push(v); } });
  return { data: todo.sort((x, y) => D(y.visitado_en) - D(x.visitado_en)), error:null };
}
async function cargarActividad(silencio){
  if (S._actCargando) return; S._actCargando = true;
  const desde = (S.periodo && S.periodo.ini) || ayerISO();
  const [{ data, error }] = await Promise.all([leerActividad(desde, hoyISO()), cargarRetenidas()]);
  S._actCargando = false;
  if (error){ if (!silencio) toast("No se pudo actualizar: " + error.message); return; }
  const firma = JSON.stringify(data || []);
  if (silencio && firma === S._firma){ S.actEn = new Date(); const el = $("#ahora"); if (el) el.textContent = hh(S.actEn); return; }
  S._firma = firma;
  const antes = new Set(S.act.map(v => v.id));
  const nuevas = (data || []).filter(v => !antes.has(v.id));
  S.act = data || [];
  S.actEn = new Date();
  const ult = S.act.reduce((m, v) => v.recibido_en > m ? v.recibido_en : m, "");
  S.ultimaRecep = ult ? new Date(ult) : null;
  if (antes.size && nuevas.length){
    nuevas.forEach(v => S.nuevas.add(v.id));
    const v = nuevas[0]; toast(`${nuevas.length === 1 ? "Nueva visita" : nuevas.length + " visitas nuevas"} · ${ejDe(v.correo).nombre}: ${v.comercio}${senales(v).length ? " · con señales" : ""}`);
    setTimeout(() => { nuevas.forEach(v => S.nuevas.delete(v.id)); }, 2500);
  }
  // se invalidan las bitácoras cargadas, por si hubo cambios
  if (!silencio){ S.bit = {}; S.rutasBit = null; }
  pintar();
}
// Visitas retenidas en los celulares: el servidor las rechazó y el ejecutivo no puede corregirlas. Decide Jose.
async function cargarRetenidas(){
  const { data, error } = await sb.rpc("v2_retenidas");
  if (!error) S.retenidas = data || [];
}
// 10/11/2026: v2_mi_base devuelve ya más de 1.000 filas al analista (1.124 con el bloque 2) y la API corta en 1.000: se pide por
// tramos (la función va ordenada por customer_id, migración 20261110230000) hasta que un tramo venga incompleto.
async function leerBasePorTramos(periodo){
  const todo = [];
  for (let i = 0; ; i += 1000){
    const { data, error } = await sb.rpc("v2_mi_base", periodo ? { p_periodo:periodo } : {}).range(i, i + 999);
    if (error) return { data:null, error };
    todo.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return { data: todo, error:null };
}
// Comercios aparte de la base (26/11, decisión de Jose): siguen asignados y con sus visitas (el celular no cambia), pero el escritorio los
// trata como «base anterior»: se ven aparte y no suman a la cartera, a la meta ni a la Base para BBVA. Si la función aún no existe, no pasa nada.
async function cargarApartes(){
  try {
    const { data, error } = await sb.rpc("v2_apartes");
    if (error) { S.apartes = S.apartes || {}; return; }
    const o = {}; (data || []).forEach(r => { (o[r.periodo] ||= new Set()).add(r.customer_id); }); S.apartes = o;
  } catch(e){ S.apartes = S.apartes || {}; }
}
// Con comercios aparte en el periodo, el resto pasa a «base nueva» (en el celular y en v2_avance un origen vacío ya cuenta como nueva).
function aplicarAparte(rows, perId){
  const ap = (S.apartes || {})[perId]; if (!ap || !ap.size) return rows;
  return rows.map(c => ap.has(c.customer_id) ? { ...c, origen:"base_anterior" } : c.origen ? c : { ...c, origen:"base_nueva" });
}
async function cargarBase(){
  await cargarApartes();
  let { data, error } = await leerBasePorTramos();
  if (error){ toast("No se pudo leer la base: " + error.message); return; }
  data = aplicarAparte(data || [], S.periodo && S.periodo.id);
  // Base 2026-11: los de «salida» siguen en v2_asignaciones (regla n.º 1), pero ya no son cartera salvo que reciban una visita.
  // baseMap guarda todos, para leer el comercio de cualquier visita.
  S.base = (data || []).filter(enCartera); S.baseMap = {}; S.docMap = {};
  (data || []).forEach(c => { if (c.documento) S.docMap[c.documento] = c.customer_id; });
  S.hayOrigen = (data || []).some(c => c.origen); (data || []).forEach(c => { S.baseMap[c.customer_id] = c; });
}
// Identificador visible (Jose, 22/10): el documento de BBVA (RUC o DNI) si el comercio lo tiene; si no (base anterior), el Customer ID.
// Los comercios que ya existían conservan su Customer ID antiguo, que no es el que manejan BBVA y Jose.
const docDe = cid => (S.baseMap[cid] || {}).documento || "";
const idTxt = cid => docDe(cid) ? "Doc. BBVA " + docDe(cid) : "Customer ID " + (cid || "—");
const enCartera = c => c.origen !== "salida" || (c.visitas || 0) > 0;
// Comercio que suma a la meta de visitados (Jose, 21/10): solo la base nueva, igual que v2_avance. La base anterior va aparte.
// En un periodo sin bloques (sin origen) cuenta todo, como antes.
// Comercios de la base anterior con visita válida: van aparte, se muestran al lado del total
const notaAnterior = act => { if (!S.hayOrigen) return ""; const n = new Set(act.filter(v => v.estado_anul !== "anulada" && v.lat != null && !v.fuera_plazo && (S.baseMap[v.customer_id] || {}).origen === "base_anterior").map(v => v.customer_id)).size; return n ? ` · ${n} fuera de la base nueva, aparte` : ""; };
const sumaMeta = cid => { const c = S.baseMap[cid]; return !S.hayOrigen || (!!c && c.origen === "base_nueva"); };
// Selector de ejecutivo (base 2026-11): todas las vistas se leen con el ejecutivo elegido o con el equipo.
// Solo filtra mientras se pinta; las descargas y las acciones siempre usan los datos completos.
function elegirEj(correo){
  S.ej = correo || "todos"; S.mEj = S.ej; S.fbEj = S.pqEj = S.ej === "todos" ? "" : S.ej;
  S.sel = null; S.mDist = null; S.mVista = null;
}
function conEj(fn){
  if (S.ej === "todos") return fn();
  const de = l => Array.isArray(l) ? l.filter(x => x.correo === S.ej) : l;
  const g = { act:S.act, base:S.base, ejecutivos:S.ejecutivos, avance:S.avance, retenidas:S.retenidas, recups:S.recups, recupSigue:S.recupSigue };
  Object.keys(g).forEach(k => { S[k] = de(g[k]); });
  try { return fn(); } finally { Object.assign(S, g); }
}
async function bitacora(id){
  if (S.bit[id]) return S.bit[id];
  const { data } = await sb.from("v2_bitacora_visita").select("*").eq("visita_id", id).order("en");
  S.bit[id] = data || []; pintar(); return S.bit[id];
}
async function transacciones(cid){
  if (S.trx[cid]) return S.trx[cid];
  const { data } = await sb.from("v2_transacciones").select("fecha_corte,mes,formato,trx,vol").eq("customer_id", cid).order("fecha_corte");
  S.trx[cid] = data || []; pintar(); return S.trx[cid];
}
async function cargarCargas(){
  const { data } = await sb.from("v2_cargas").select("*").order("en", { ascending:false }).limit(30);
  S.cargas = data || []; pintar();
}
async function cargarAvance(){
  S.avanceErr = "";
  const { data, error } = await sb.rpc("v2_avance");
  if (error) S.avanceErr = error.message; else S.avance = data || [];
  pintar();
}
function escuchar(){
  // Tiempo real si el proyecto lo permite; sondeo como red de seguridad.
  try {
    sb.channel("escritorio-visitas").on("postgres_changes", { event:"*", schema:"public", table:"v2_visitas" }, () => { clearTimeout(S._rt); S._rt = setTimeout(() => cargarActividad(true), 800); }).subscribe();
  } catch(e){}
  setInterval(() => { if (!S.pausa && document.visibilityState === "visible") cargarActividad(true); }, 30000);
  setInterval(() => { const el = $("#vivoTxt"); if (el && !S.pausa) el.textContent = textoVivo(); }, 5000);
  setInterval(revisarVersion, 5 * 60000); setTimeout(revisarVersion, 60000);
}
// Si se publicó una versión nueva del escritorio, avisa para recargar (una pestaña abierta de ayer no la toma sola).
async function revisarVersion(){
  try {
    const t = await fetch(location.pathname + "?v=" + Date.now(), { cache:"no-store" }).then(r => r.ok ? r.text() : "");
    const m = t.match(/BUILD = "([a-f0-9]+)"/);
    if (m && m[1] !== BUILD && !document.getElementById("avisoVersion")){
      document.body.insertAdjacentHTML("beforeend", `<div id="avisoVersion" class="aviso-version" role="status">Hay una versión nueva del CRM de escritorio. <button class="btn p" onclick="location.replace(location.pathname + '?v=${m[1]}.' + Date.now() + location.hash)">Recargar</button></div>`);
    }
  } catch(e){}
}
function textoVivo(){
  if (!S.ultimaRecep) return "En vivo · sin visitas todavía";
  const seg = Math.max(0, Math.round((Date.now() - S.ultimaRecep)/1000));
  return `En vivo · última recepción hace ${seg < 60 ? seg + " s" : seg < 3600 ? Math.round(seg/60) + " min" : Math.round(seg/3600) + " h"}`;
}

/* =========================================================================
   Acciones
   ========================================================================= */
async function accion(id, tipo, motivo, nota){
  if (S.ocupado) return; S.ocupado = true; pintar();
  const v = S.act.find(x => x.id === id);
  try {
    let r;
    if (tipo === "val") r = await sb.rpc("v2_validar_visita", { p_visita_id:id, p_estado:"validada", p_nota:nota || null });
    else if (tipo === "obs") r = await sb.rpc("v2_validar_visita", { p_visita_id:id, p_estado:"observada", p_motivo:motivo, p_nota:nota || null });
    else if (tipo === "cola") r = await sb.rpc("v2_validar_visita", { p_visita_id:id, p_estado:"validada", p_nota:nota || null });
    else if (tipo === "anu") r = v && v.estado_anul === "pendiente" ? await sb.rpc("v2_resolver_anulacion", { p_visita_id:id, p_aprobar:true, p_nota:[motivo, nota].filter(Boolean).join(" · ") }) : await sb.rpc("v2_anular_visita", { p_visita_id:id, p_motivo:motivo, p_nota:nota || null });
    else if (tipo === "rest") r = await sb.rpc("v2_restituir_visita", { p_visita_id:id, p_nota:nota || null });
    else if (tipo === "rech") r = await sb.rpc("v2_resolver_anulacion", { p_visita_id:id, p_aprobar:false, p_nota:nota || null });
    if (r && r.error) throw r.error;
    delete S.bit[id];
    S.accion = null;
    await cargarActividad(true);
    return true;
  } catch(e){ toast("No se pudo: " + (e.message || e)); return false; }
  finally { S.ocupado = false; pintar(); }
}

/* =========================================================================
   Pintado
   ========================================================================= */
function toast(txt){ const t = $("#toast"); if (!t) return; $("#toastTxt").textContent = txt; t.classList.add("on"); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove("on"), 4200); }
// Orden del prototipo 4.0: primero la supervisión (Directorio, Equipo, Mapa de calor, Cartera, Actividad, Ubicación, Cierres) y, aparte, las herramientas de gestión.
const VISTAS = [
  ["directorio","Directorio", ICON.ind, null],
  ["resumen","Resumen", ICON.resumen, null],
  ["equipo","Equipo", ICON.equipo, null],
  ["mapa","Mapa", ICON.mapa, null],
  ["cartera","Cartera", ICON.cartera, null],
  ["seguimiento","Seguimiento", ICON.fb, null],
  ["validacion","Actividad", ICON.cola, () => S.act.filter(v => v.estado_anul === "pendiente" || estadoDe(v) === "pend").length + (S.retenidas || []).length],
  ["tiempos","Tiempos", ICON.aud, null],
  ["cierres","Cierres", ICON.cierre, null],
  ["reporte","Reporte", ICON.reporte, null],
  ["--","Herramientas"],
  ["indicadores","Indicadores", ICON.ind, null],
  ["cargas","Cargas", ICON.carga, null],
  ["auditoria","Auditoría", ICON.aud, null],
];
// Jose (26/11): el menú queda solo con las pestañas del prototipo; las herramientas siguen en el código y se abren por su dirección (#cargas, #rutas…).
const NAV_VISTAS = VISTAS.slice(0, VISTAS.findIndex(v => v[0] === "--"));
// Vista del ejecutivo (26/11): el interruptor de arriba deja la pantalla como la ve un ejecutivo (Jose y Gabriel); solo lee, no escribe nada.
const NAV_EJE = [["avance","Mi avance",ICON.equipo],["cartera","Mi cartera",ICON.cartera],["actividad","Mi actividad",ICON.cola],["alertas","Mis alertas",ICON.cola],["mapa","Mi mapa",ICON.mapa]];
function claveEje(){ return S.vista === "miavance" ? "avance" : S.vista === "cartera" ? "cartera" : S.vista === "validacion" ? "actividad" : S.vista === "mapa" ? (S.muTab === "ale" ? "alertas" : "mapa") : ""; }
function pintarNav(){
  $("#nav").innerHTML = S.modo === "eje" ? NAV_EJE.map(([k,t,i]) => `<button class="${claveEje()===k?"on":""}" data-eje="${k}">${i}${t}</button>`).join("") : NAV_VISTAS.map(([k,t,i,c]) => k === "--" ? `<div class="sec">${t}</div>` : `<button class="${S.vista===k?"on":""}" data-vista="${k}">${i}${t}${c ? `<span class="cnt">${c()}</span>` : ""}</button>`).join("");
  const p = S.periodo;
  $("#pieRail").innerHTML = p ? `<b>Periodo ${esc(pNom(p))} · ${fISO(p.ini)} – ${fISO(p.fin)}</b>${S.base.length} comercios · ${S.ejecutivos.length} ejecutivos · build ${BUILD}` : `<b>Sin periodo abierto</b>build ${BUILD}`;
}
// Franja de cifras del periodo en curso (prototipo 4.0): las mismas medidas del Directorio, sin números nuevos.
function cabKpis(){
  const k = $("#cabKpis"); if (!k) return;
  if (!S.periodo){ k.innerHTML = ""; return; }
  cargarPeriodos();
  const L = (S.periodos || []).filter(p => String(p.ini) <= hoyISO()), cur = S.periodo.id;
  const per = L.find(p => p.id === S.dirPer) || L.find(p => p.id === cur) || { id:cur };
  let T = null; try { const d = datosPeriodo(per); if (d && !d.cargando && !d.err && d.act) T = statsDir(d); } catch(e){}
  const it = (n, t, cls) => `<div class="ck ${cls || ""}"><b class="num">${n}</b><span>${t}</span></div>`;
  cargarSegs(per.id); const nSeg = S.segs && S.segs[per.id] ? S.segs[per.id].length : null;
  // el selector manda sobre Directorio, Mapa de calor y Ubicación (cada una guardaba su periodo; ahora se cambian juntos)
  const sel = L.length > 1 ? `<label class="ck-sel">Periodo <select id="cabPer" aria-label="Periodo">${L.map(p => `<option value="${esc(p.id)}" ${p.id === per.id ? "selected" : ""}>${esc(pNom(p))} · ${esc(pRango(p))}${p.id === cur ? " · en curso" : ""}</option>`).join("")}</select></label>` : `<span class="ck-per">Periodo ${esc(pNom(per))}</span>`;
  k.innerHTML = it(T ? T.asig : "…", "cartera asignada") + it(T ? T.vis : "…", "visitados únicos", "or") + it(T ? T.reg : "…", "visitas realizadas", "vd") + it(T ? T.con : "…", "con contacto") + it("—", "reactivados BBVA · sin corte") + it(nSeg == null ? "…" : nSeg, "seguimientos") + sel;
}
function pintar(){
  const app = $("#app");
  if (S.nuevaClave){ app.innerHTML = vistaNuevaClave(); return; }
  if (!S.sesion && !S.denegado){ app.innerHTML = vistaLogin(); return; }
  if (S.cargando){ app.innerHTML = `<div class="cargando"><span class="spin"></span>Cargando el CRM…</div>`; return; }
  if (S.error){ app.innerHTML = `<div class="login"><div class="caja"><div class="marca">STRATIS</div><h1>${S.denegado ? "Esta vista no es para tu usuario" : "No se pudo entrar"}</h1><p>${esc(S.error)}</p>${S.denegado ? `<a class="btn p" href="../" style="text-decoration:none">Ir al CRM de campo</a><button class="btn" data-otro-usuario style="margin-top:8px">Entrar con otro usuario</button>` : `<button class="btn" data-salir>${ICON.salir} Salir</button>`}</div></div>`; return; }
  if (!app.querySelector(".rail")) app.innerHTML = cascaron();
  if (S.modo === "eje"){
    if (S.ej === "todos" && S.ejecutivos.length) elegirEj(S.ejecutivos[0].correo);
    if (!["miavance","cartera","validacion","mapa"].includes(S.vista)) S.vista = "miavance";
  }
  pintarNav();
  $("#vivoTxt").textContent = S.pausa ? "Actualización en pausa" : textoVivo();
  $("#vivo").classList.toggle("pausa", S.pausa);
  $("#btnPausa").textContent = S.pausa ? "Reanudar" : "Pausar";
  $("#ahora").textContent = S.actEn ? hh(S.actEn) : "—";
  $("#quien").title = (S.yo.nombre || "") + " · " + S.yo.rol.toLowerCase(); $("#quien").innerHTML = `<span class="avatar" style="background:var(--naranja)">${esc(iniciales(S.yo.nombre_corto || S.yo.nombre))}</span>${esc(nombreCorto(S.yo.nombre_corto || S.yo.nombre))} · ${esc(S.yo.rol.toLowerCase())}`;
  cabKpis();
  const c = $("#contenido");
  const T = { miavance:["Mi avance","Cómo va el ejecutivo elegido contra su meta del periodo y qué le queda pendiente. Es la pantalla tal como la ve él."],
              seguimiento:["Seguimiento","Qué hace cada ejecutivo para que los comercios visitados se reactiven: sus check-ins contra los comercios que BBVA reporta reactivados."],
              resumen:["Resumen de gestión","Cartera, visitas y contacto del equipo en el periodo, y cómo va cada ejecutivo."],
              tiempos:["Consulta de tiempos","A qué hora registra visitas cada ejecutivo: por día, acumulado del periodo, por franjas y el detalle de los registros."],
              reporte:["Reporte de gestión del equipo","Resumen del periodo, gestión por ejecutivo con su ventana de trabajo y las franjas del día."],
              validacion:["Actividad","Las visitas se aceptan como las registra el ejecutivo, sin validar la dirección. Si ves algo puntual puedes observarla (el ejecutivo la ve «en revisión» y la corrige) o anularla (deja de contar)."],
              cartera:["Cartera","Los comercios del periodo con su última visita y lo que sigue: visitar, volver a visitar o validar la dirección."],
              directorio:["Directorio","Cobertura, contacto y dirección errada de cada periodo, por ejecutivo y por distrito. Elige el periodo arriba: los cerrados se leen tal como quedaron."],
              equipo:["Equipo","Comercios visitados por día contra la meta diaria, y cómo terminó cada gestión. Haz clic en un día para ver sus visitas."],
              mapa:["Mapa","Distribución por distrito, visitas, comercios por visitar, distancia del registro al comercio y alertas, todo en un solo mapa."],
              auditoria:["Modo auditoría","Trazabilidad de cada registro, patrones por ejecutivo y cruce con la data de BBVA."],
              cargas:["Cargas","Carga la data que envía BBVA: transacciones y resultados de reactivación. La base y la presentación para BBVA se descargan con los botones de arriba."],
              indicadores:["Indicadores del equipo","La misma medición que ve cada ejecutivo en «Mi avance», comparada."],
              cierres:["Cierres de periodo","Lo que se aprobó y pagó en cada periodo cerrado, congelado como se firmó, en % del sueldo base. Elige un ejecutivo arriba para ver su evolutivo."] };
  $("#titulo").textContent = T[S.vista][0]; $("#subtitulo").textContent = T[S.vista][1];
  $("#btnModo").textContent = S.modo === "eje" ? "Volver a supervisión" : "Ver como ejecutivo"; $("#btnModo").setAttribute("aria-pressed", String(S.modo === "eje"));
  $("#gEj").innerHTML = `${S.modo === "eje" ? "" : '<option value="todos">Equipo completo</option>'}${S.ejecutivos.map(e => `<option value="${esc(e.correo)}" ${S.ej === e.correo ? "selected" : ""}>${esc(e.nombre)}</option>`).join("")}`;
  $("#gEj").disabled = S.vista === "cargas" || S.vista === "directorio"; $("#gEj").title = S.vista === "cargas" ? "Las cargas son de todo el equipo" : S.vista === "directorio" ? "El directorio es de todo el equipo" : "Ver todas las vistas de un ejecutivo o del equipo";
  $("#btnCel").hidden = S.ej === "todos";
  $("#btnOjo").innerHTML = S.ver ? `${ICON.ojo} Ocultar datos` : `${ICON.ojoNo} Ver datos`;
  $("#btnOjo").setAttribute("aria-pressed", String(S.ver)); $("#btnOjo").classList.toggle("cerrado", !S.ver);
  $("#btnTema").innerHTML = temaActual() === "dark" ? `${ICON.sol} Claro` : `${ICON.luna} Oscuro`;
  if (S._mapa){ try { S._mapa.off(); S._mapa.stop && S._mapa.stop(); S._mapa.remove(); } catch(e){} S._mapa = null; }
  if (S._mapa2){ try { S._mapa2.off(); S._mapa2.stop && S._mapa2.stop(); S._mapa2.remove(); } catch(e){} S._mapa2 = null; }
  if (S._mapaUnico){ try { S._mapaUnico.off(); S._mapaUnico.stop && S._mapaUnico.stop(); S._mapaUnico.remove(); } catch(e){} S._mapaUnico = null; }
  const ae = document.activeElement, foco = ae && ae.id && c.contains(ae) ? { id:ae.id, s:ae.selectionStart, e:ae.selectionEnd } : null;
  const campos = {}; ["mSel","mNota","qTraza"].forEach(id => { const el = document.getElementById(id); if (el) campos[id] = el.value; });
  const mismo = S._pinto && S._pinto.vista === S.vista && S._pinto.sel === S.sel && S._pinto.tab === S.tab;
  const scrolls = mismo ? [".tabla-wrap",".ficha .cuerpo",".lista",".contenido"].map(q => { const el = c.querySelector(q) || (q === ".contenido" ? c : null); return [q, el ? el.scrollTop : 0]; }) : [];
  // Las cargas son de todo el equipo: ahí no se filtra por ejecutivo
  c.innerHTML = S.vista === "cargas" ? vistaCargas() : S.vista === "directorio" ? vistaDirectorio() : S.vista === "mapa" ? vistaMapaUnico() : conEj(() => S.vista === "miavance" ? vistaMiAvance() : S.vista === "seguimiento" ? conPeriodoElegido(vistaSeguimiento) : S.vista === "validacion" ? vistaValidacion() : S.vista === "cartera" ? vistaCartera() : S.vista === "equipo" ? equipoPeriodo() : S.vista === "resumen" ? conPeriodoElegido(vistaResumen) : S.vista === "tiempos" ? conPeriodoElegido(vistaTiempos) : S.vista === "reporte" ? conPeriodoElegido(vistaReporte) : S.vista === "auditoria" ? vistaAuditoria() : S.vista === "cierres" ? vistaCierres() : vistaIndicadores());
  Object.entries(campos).forEach(([id, v]) => { const el = document.getElementById(id); if (el && el.value !== v && !(id === "mSel" && ![...el.options].some(o => o.value === v))) el.value = v; });
  scrolls.forEach(([q, t]) => { const el = q === ".contenido" ? c : c.querySelector(q); if (el) el.scrollTop = t; });
  if (foco){ const el = document.getElementById(foco.id); if (el){ el.focus(); try { if (foco.s != null) el.setSelectionRange(foco.s, foco.e); } catch(e){} } }
  S._pinto = { vista:S.vista, sel:S.sel, tab:S.tab };
  despuesDePintar();
}
function despuesDePintar(){ const el = document.getElementById("mapaVisita"); if (el) montarMapa(el);
  const mun = document.getElementById("mapaUnico"); if (mun) muPeriodo(() => conEj(() => montarMapaUnico(mun))); }
function cascaron(){
  return `<div class="app">
  <aside class="rail">
    <div class="marca">STRATIS</div>
    <div class="prod">CRM de campo<small>Escritorio · vista del analista</small></div>
    <nav class="nav" id="nav"></nav>
    <div class="pie" id="pieRail"></div>
  </aside>
  <div class="main">
    <header class="top">
      <div><h1 id="titulo"></h1><div class="sub" id="subtitulo"></div></div>
      <div class="der">
        <button class="btn" id="btnModo" aria-pressed="false" title="Ver la pantalla como la ve un ejecutivo (solo para mirar)">Ver como ejecutivo</button>
        <select class="sel" id="gEj" aria-label="Ejecutivo"></select>
        <button class="btn" id="btnCel" title="Abrir su celular tal como lo ve él, solo para mirar" hidden>${ICON.cel} Ver su celular</button>
        <button class="btn ojo" id="btnOjo" aria-pressed="false" title="Mostrar u ocultar montos, potenciales, volúmenes, celulares y correos"></button>
        <span class="vivo" id="vivo"><i></i><span id="vivoTxt"></span></span>
        <button class="btn" data-refrescar title="Volver a leer la actividad">Actualizar</button>
        <button class="btn" data-base-bbva title="Excel del periodo para enviar a BBVA: hojas Resumen y Base, modelo Gestión Stratis de 55 columnas (una fila por comercio de la base nueva; llave: Documento)">Base para BBVA</button>
        <details class="opmenu" id="opmenu"><summary class="btn" aria-label="Más opciones" aria-haspopup="true" title="Más opciones">${ICON.mas}</summary>
          <div class="opmenu-menu">
            <button class="btn" id="btnPausa" title="Pausar la actualización automática">Pausar</button>
            <button class="btn" id="btnTema" title="Cambiar entre tema claro y oscuro"></button>
            <button class="btn" data-nueva-clave title="Cambiar tu contraseña">Mi clave</button>
            <button class="btn" data-salir title="Cerrar sesión">${ICON.salir} Cerrar sesión</button>
            <div class="opmenu-pie">Leído a las <b id="ahora"></b></div>
          </div>
        </details>
        <span class="usuario" id="quien"></span>
      </div>
    </header>
    <div class="cab-kpis" id="cabKpis"></div>
    <div class="contenido" id="contenido"></div>
  </div></div>
  <div class="toast" id="toast"><i></i><span id="toastTxt"></span></div>`;
}
function vistaLogin(){
  return `<div class="login"><form class="caja" id="fLogin">
    <div class="marca">STRATIS</div><h1>CRM de campo · escritorio</h1><p>La misma cuenta del celular. Solo entran el analista y el manager.</p>
    <label for="lCorreo">Correo</label><input id="lCorreo" type="email" autocomplete="username" placeholder="nombre@mystratis.com" required>
    <label for="lClave">Contraseña</label><input id="lClave" type="password" autocomplete="current-password" required>
    <button class="btn p" type="submit" id="bEntrar">Entrar</button>
    <div id="lErr"></div>
    <button class="btn" type="button" data-olvide style="margin-top:8px;background:none;border:0;color:var(--azul-txt);font-weight:600;padding:4px 0">¿Olvidaste tu contraseña?</button>
  </form></div>`;
}
// Nueva contraseña: al abrir el enlace de recuperación, o desde «Cambiar contraseña» con la sesión abierta. Solo cambia la clave del propio usuario.
function vistaNuevaClave(){
  const n = S.nuevaClave, correo = S.sesion && S.sesion.user && S.sesion.user.email;
  if (n.lista) return `<div class="login"><div class="caja"><div class="marca">STRATIS</div><h1>Tu contraseña nueva quedó guardada</h1><p>Desde ahora entras al CRM con tu correo${correo ? " <b>" + esc(correo) + "</b>" : ""} y esa contraseña.</p><button class="btn p" data-clave-seguir>Entrar al CRM</button></div></div>`;
  return `<div class="login"><form class="caja" id="fClave"><div class="marca">STRATIS</div><h1>Crea tu contraseña nueva</h1><p>${correo ? "Para la cuenta <b>" + esc(correo) + "</b>. " : ""}Usa al menos 8 caracteres.</p>
    <label for="cClave1">Contraseña nueva</label><input id="cClave1" type="password" autocomplete="new-password" required>
    <label for="cClave2">Repite la contraseña</label><input id="cClave2" type="password" autocomplete="new-password" required>
    ${n.error ? `<div class="aviso mal err" role="alert">${esc(n.error)}</div>` : ""}
    <button class="btn p" type="submit" id="bClave" ${n.enviando ? "disabled" : ""}>${n.enviando ? "Guardando…" : "Guardar contraseña"}</button>
    ${S.sesion && S.yo ? `<button class="btn" type="button" data-clave-cancelar style="margin-top:8px">Cancelar</button>` : ""}</form></div>`;
}

/* =========================================================================
   1 · Validación
   ========================================================================= */
function filtradas(){
  return S.act.filter(v => {
    if (S.filtro !== "todos" && estadoDe(v) !== S.filtro) return false;
    if (S.ej !== "todos" && v.correo !== S.ej) return false;
    if (S.dia === "hoy" && !esHoy(v)) return false;
    if (S.dia === "ayer" && !esAyer(v)) return false;
    if (/^\d{4}-/.test(S.dia) && iso(v.visitado_en) !== S.dia) return false;
    if (S.soloSenal && senales(v).length === 0) return false;
    return true;
  });
}
function panelRetenidas(){
  const l = S.retenidas || [];
  if (!l.length) return "";
  return `<div class="panel" style="margin-bottom:14px;border-color:var(--rojo)"><div class="barra"><b>${l.length === 1 ? "Una visita retenida" : l.length + " visitas retenidas"} en el celular</b><span class="lbl">El servidor las rechazó y todavía no están registradas. El ejecutivo puede corregirlas y reenviarlas; si la descartas, su celular la quita al sincronizar.</span></div>
    <div class="tabla-wrap"><table class="datos"><thead><tr><th>Ejecutivo</th><th>Comercio</th><th>Visita</th><th>Qué respondió el servidor</th><th class="n">Intentos</th><th class="n">Días retenida</th><th></th></tr></thead><tbody>
    ${l.map(r => `<tr><td>${esc(r.ejecutivo || r.correo)}</td><td>${esc(r.comercio || "—")}<br><small class="muted">${esc(idTxt(r.customer_id))}</small></td>
      <td>${r.visitado_en ? ddhh(r.visitado_en) : "—"}<br><small class="muted">${esc(r.payload && r.payload.p_con === "Nadie" ? (r.payload.p_motivo === "Dirección errada" ? "El comercio no está en esta dirección" : "No se pudo hacer la visita") : r.payload && r.payload.p_que || "")}</small></td>
      <td>${esc(r.mensaje)}</td><td class="n num">${r.intentos}</td><td class="n num">${Math.max(0, Math.floor((Date.now() - new Date(r.reportada_en || Date.now())) / 86400000))}</td>
      <td><button class="btn" data-descartar-ret="${esc(r.cliente_uid)}">Descartar</button></td></tr>`).join("")}
    </tbody></table></div></div>`;
}
function vistaValidacion(){
  const hoy = S.act.filter(esHoy);
  const obs = S.act.filter(v => estadoDe(v) === "obs");
  const sinGps = hoy.filter(v => v.estado_anul !== "anulada" && v.lat == null).length;
  const pedidos = S.act.filter(v => v.estado_anul === "pendiente").length;
  const validas = S.act.filter(v => estadoDe(v) === "val").length, cuentan = S.act.filter(v => v.estado_anul !== "anulada").length;
  const comerciosVis = new Set(S.act.filter(v => v.estado_anul !== "anulada" && v.lat != null && !v.fuera_plazo && sumaMeta(v.customer_id)).map(v => v.customer_id)).size;
  const cnt = k => S.act.filter(v => (k === "todos" || estadoDe(v) === k) && (S.dia !== "hoy" || esHoy(v)) && (S.dia !== "ayer" || esAyer(v)) && (!/^\d{4}-/.test(S.dia) || iso(v.visitado_en) === S.dia) && (S.ej === "todos" || v.correo === S.ej)).length;
  const lista = filtradas();
  if (S.sel && !S.act.find(v => v.id === S.sel)) S.sel = null;
  if (!S.sel && lista.length) S.sel = lista[0].id;
  const sel = S.act.find(v => v.id === S.sel);
  const metaEq = ((S.avance && S.avance[0] && S.avance[0].meta_visitas) || 160) * Math.max(1, S.ejecutivos.length);
  // Zona insegura u otro motivo, por ejecutivo, sobre sus visitas no anuladas del periodo (señal que no bloquea)
  const activas = S.act.filter(v => v.estado_anul !== "anulada"), esRev = v => v.con === "Nadie" && MOTIVOS_REVISAR.includes(v.motivo);
  const porEj = S.ejecutivos.map(e => { const l = activas.filter(v => v.correo === e.correo), n = l.filter(esRev).length; return { e, n, t:l.length, p:l.length ? Math.round(n * 100 / l.length) : 0 }; })
    .filter(x => x.t).sort((a, b) => b.p - a.p || b.n - a.n);
  const nRev = activas.filter(esRev).length, eje = S.modo === "eje";
  return `${eje ? "" : panelRetenidas()}
  <div class="resumen">
    <div class="tile"><div class="k">Visitas hoy</div><div class="v num">${hoy.length}</div><div class="d">${S.ejecutivos.map(e => `${esc(e.ini)} ${hoy.filter(v => v.correo === e.correo).length}`).join(" · ") || "sin ejecutivos"}</div></div>
    <div class="tile ${obs.length ? "warn" : ""}"><div class="k">Observadas</div><div class="v num">${obs.length}</div><div class="d">el ejecutivo las ve «en revisión»</div></div>
    <div class="tile ${sinGps ? "bad" : "ok"}"><div class="k">Sin GPS hoy</div><div class="v num">${sinGps}</div><div class="d">sin ubicación no cuentan como visita</div></div>
    <div class="tile ${nRev ? "warn" : ""}" title="Visitas con «Zona insegura» u «Otro motivo» sobre todas las visitas no anuladas del periodo de cada ejecutivo, incluidas las sin GPS o fuera de plazo (no es la misma base que «Comercios visitados»). Cuentan como visita; solo es para revisar el comentario."><div class="k">Zona insegura u otro motivo</div><div class="v num">${nRev}</div><div class="d">${porEj.map(x => `${esc(x.e.ini)} ${x.p} %`).join(" · ") || "sin visitas"}</div></div>
    ${eje ? "" : `<div class="tile ${pedidos ? "warn" : ""}"><div class="k">Pedidos de anulación</div><div class="v num">${pedidos}</div><div class="d">esperan tu decisión</div></div>`}
    <div class="tile acc"><div class="k">Comercios visitados</div><div class="v num">${comerciosVis}<small> / ${metaEq}</small></div><div class="d">${cuentan} visitas en el periodo · ${validas} validadas${notaAnterior(S.act)}</div></div>
  </div>
  <div class="split">
    <div class="panel">
      <div class="barra">
        <div class="chips">
          ${[["todos","Todas"],["obs","Observadas"],["anu","Anuladas"]].concat(cnt("pend") ? [["pend","Por validar"]] : []).map(([k,t]) => `<button class="chip ${S.filtro===k?"on":""}" data-filtro="${k}">${t}<span class="c num">${cnt(k)}</span></button>`).join("")}
        </div>
        <div class="der">
          <select class="sel" id="fDia"><option value="hoy" ${S.dia==="hoy"?"selected":""}>Hoy ${fISO(hoyISO())}</option><option value="ayer" ${S.dia==="ayer"?"selected":""}>Ayer ${fISO(ayerISO())}</option><option value="periodo" ${S.dia==="periodo"?"selected":""}>Todo el periodo</option>${diasPeriodo().filter(d => d.iso !== hoyISO() && d.iso !== ayerISO()).reverse().map(d => `<option value="${d.iso}" ${S.dia===d.iso?"selected":""}>${DOW[d.dow]} ${fISO(d.iso)}</option>`).join("")}</select>
          <label class="lbl"><input type="checkbox" id="fSenal" ${S.soloSenal?"checked":""}> Solo con señales</label>
        </div>
      </div>
      ${!eje && S.marcadas.size ? `<div class="barra" style="background:var(--azul-t)"><b class="num">${S.marcadas.size} seleccionadas</b><span class="lbl">en bloque solo se validan las que no tienen señales</span><div class="der"><button class="btn v" id="valBloque">${ICON.ok} Validar ${[...S.marcadas].filter(id => { const v = S.act.find(x=>x.id===id); return v && senales(v).length===0; }).length} sin señales</button><button class="btn" id="limpiarSel">Quitar selección</button></div></div>` : ""}
      <div class="tabla-wrap">
      ${lista.length ? `<table class="cola"><thead><tr>${eje ? "" : `<th class="chk"></th>`}<th>Hora</th><th>Ejecutivo</th><th>Comercio</th><th>Resultado</th><th>Señales</th>${S.filtro === "todos" ? "<th>Estado</th>" : ""}</tr></thead><tbody>
        ${lista.slice(0, 400).map(v => { const e = ejDe(v.correo), sn = senales(v); return `
        <tr class="f ${S.sel===v.id?"sel":""} ${S.nuevas.has(v.id)?"nueva":""}" data-sel="${v.id}">
          ${eje ? "" : `<td class="chk"><input type="checkbox" data-marca="${v.id}" ${S.marcadas.has(v.id)?"checked":""} ${estadoDe(v)!=="pend"?"disabled":""} aria-label="Seleccionar"></td>`}
          <td class="num"><b>${hh(v.visitado_en)}</b>${esHoy(v) ? "" : `<br><small style="color:var(--muted)">${dd(v.visitado_en)}</small>`}</td>
          <td title="${esc(e.nombre)}"><span class="ej">${AVATAR(e)}<span class="ej-n">${esc(nombreCorto(e.nombre))}</span></span></td>
          <td class="com"><b title="${esc(v.comercio)}">${esc(v.comercio)}</b><small>${esc(idTxt(v.customer_id))} · ${esc(v.distrito || "sin distrito")}</small></td>
          <td class="res">${resumenRes(v)}</td>
          <td class="sn">${sn.length ? `<div class="sn-l" style="margin-top:0">${sn.map(([k,t]) => `<span class="senal ${k}">${esc(t)}</span>`).join("")}</div>` : `<span class="muted" style="font-size:12px">—</span>`}</td>
          ${S.filtro === "todos" ? `<td>${pill(v)}</td>` : ""}
        </tr>`; }).join("")}
      </tbody></table>${lista.length > 400 ? `<div class="ver-mas">Se muestran 400 de ${lista.length}. Afina el filtro.</div>` : ""}` : `<div class="vacio">No hay visitas con ese filtro.${S.filtro === "pend" ? " La cola está al día." : ""}</div>`}
      </div>
      <div class="atajos">${eje ? "<kbd>↑</kbd> <kbd>↓</kbd> moverse entre visitas" : "<kbd>↑</kbd> <kbd>↓</kbd> moverse · <kbd>V</kbd> validar · <kbd>O</kbd> observar · <kbd>A</kbd> anular · <kbd>Esc</kbd> cancelar"}</div>
    </div>
    ${sel ? ficha(sel) : `<div class="panel ficha"><div class="vacio">Elige una visita para verla completa.</div></div>`}
  </div>`;
}

function puntoRef(v){
  if (v.ref_lat != null) return { lat:v.ref_lat, lng:v.ref_lng, cal:v.ref_calidad, nota:v.ref_nota };
  if (v.geo_lat != null) return { lat:v.geo_lat, lng:v.geo_lng, cal:v.geo_calidad, nota:"punto actual del comercio" };
  return null;
}
const CAL_TXT = { numero:"dirección con número", calle:"dirección a nivel de calle", comercio:"el local ubicado por nombre", distrito:"solo el distrito (aproximado)", lugar:"un lugar de referencia", visita:"el GPS de otra visita", sunat:"la dirección fiscal de SUNAT", sin_ubicar:"sin ubicar" };
const gmaps = (lat, lng) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
function mapa(v){
  const r = puntoRef(v);
  const regla = `<span>Referencia: la dirección no se valida; la visita vale como la registró el ejecutivo.</span>`;
  if (v.lat == null) return `<div class="mapa"><div class="vacio" style="padding:22px">La visita llegó sin ubicación. No se puede comparar con el punto del comercio.</div>${r ? `<div class="pie"><span></span><a href="${gmaps(r.lat, r.lng)}" target="_blank" rel="noopener">Ver el comercio en Google Maps ↗</a></div>` : ""}</div>`;
  const col = claseDist(v);
  const actualDistinto = v.geo_lat != null && r && v2m(v.geo_lat, v.geo_lng, r.lat, r.lng) > 15 && v2m(v.geo_lat, v.geo_lng, v.lat, v.lng) > 15;
  const anclado = v.geo_lat != null && r && v2m(v.geo_lat, v.geo_lng, v.lat, v.lng) <= 3 && v2m(r.lat, r.lng, v.lat, v.lng) > 15;
  return `<div class="mapa">
    <div id="mapaVisita" class="mapa-real" data-id="${v.id}"></div>
    <div class="leyenda">
      <span><i class="pt ref"></i><b>Comercio</b> · ${r ? esc(r.nota || CAL_TXT[r.cal] || "punto de la base") : "sin punto"}${r && r.cal && CAL_TXT[r.cal] && r.nota !== CAL_TXT[r.cal] ? ` <em>(${esc(CAL_TXT[r.cal])})</em>` : ""}</span>
      <span><i class="pt vis ${col}"></i><b>Visita</b> · ${esc(nombreCorto(ejDe(v.correo).nombre))} a las ${hh(v.visitado_en)} · GPS ±${Math.round(Number(v.precision_m) || 0)} m · <b class="dist ${col}" style="display:inline">${mDist(v.distancia_m)}</b> del comercio</span>
      ${actualDistinto ? `<span><i class="pt act"></i><b>Punto actual del comercio</b> · ${esc(CAL_TXT[v.geo_calidad] || v.geo_calidad || "")}</span>` : ""}
      ${anclado ? `<span class="nota-mapa">La ficha del comercio quedó anclada a este GPS después de la visita, por eso el punto de comparación es el que tenía antes.</span>` : ""}
    </div>
    <div class="pie">${regla}<span class="links">${r ? `<a href="${gmaps(r.lat, r.lng)}" target="_blank" rel="noopener">Comercio ↗</a>` : ""}<a href="${gmaps(v.lat, v.lng)}" target="_blank" rel="noopener">Visita ↗</a>${r && (v.distancia_m || 0) > 10 ? `<a href="https://www.google.com/maps/dir/?api=1&origin=${v.lat},${v.lng}&destination=${r.lat},${r.lng}&travelmode=walking" target="_blank" rel="noopener">Ruta entre ambos ↗</a>` : ""}</span></div>
  </div>`;
}
function v2m(a1, o1, a2, o2){ if ([a1,o1,a2,o2].some(x => x == null)) return null; const dy = (a1-a2)*111320, dx = (o1-o2)*111320*Math.cos((a1+a2)/2*Math.PI/180); return Math.round(Math.sqrt(dx*dx+dy*dy)); }
function montarMapa(el){
  const v = S.act.find(x => x.id === el.dataset.id); if (!v) return;
  if (!window.L){ el.innerHTML = `<div class="vacio" style="padding:22px">No se pudo cargar el mapa. Usa los enlaces de abajo.</div>`; return; }
  const r = puntoRef(v);
  const css = getComputedStyle(document.documentElement);
  const color = k => css.getPropertyValue(k).trim();
  const colVis = { ok:color("--verde"), med:color("--ambar"), mal:color("--rojo"), no:color("--muted") }[claseDist(v)];
  const m = L.map(el, { zoomControl:true, attributionControl:true, scrollWheelZoom:false });
  m.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom:19, attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' }).addTo(m);
  const pts = [];
  const vis = [v.lat, v.lng]; pts.push(vis);
  L.circle(vis, { radius:Math.max(3, Number(v.precision_m) || 3), color:colVis, weight:1, fillColor:colVis, fillOpacity:.12 }).addTo(m);
  if (r){
    const ref = [r.lat, r.lng]; pts.push(ref);
    L.polyline([vis, ref], { color:colVis, weight:2, dashArray:"5 5" }).addTo(m);
    L.circleMarker(ref, { radius:8, color:"#fff", weight:2, fillColor:color("--navy-2") || "#232C86", fillOpacity:1 }).addTo(m)
      .bindTooltip("Comercio", { permanent:true, direction:"bottom", offset:[0,8], className:"etq" });
  }
  if (v.geo_lat != null && r && v2m(v.geo_lat, v.geo_lng, r.lat, r.lng) > 15 && v2m(v.geo_lat, v.geo_lng, v.lat, v.lng) > 15){
    const act = [v.geo_lat, v.geo_lng]; pts.push(act);
    L.circleMarker(act, { radius:6, color:"#fff", weight:2, fillColor:color("--muted"), fillOpacity:1 }).addTo(m).bindTooltip("Punto actual", { direction:"right", className:"etq" });
  }
  L.circleMarker(vis, { radius:7, color:"#fff", weight:2, fillColor:colVis, fillOpacity:1 }).addTo(m)
    .bindTooltip(`Visita ${hh(v.visitado_en)} · ${mDist(v.distancia_m)}`, { permanent:true, direction:"top", offset:[0,-8], className:"etq" });
  if (pts.length > 1 && v2m(pts[0][0], pts[0][1], pts[1][0], pts[1][1]) > 25) m.fitBounds(pts, { padding:[36, 36], maxZoom:19 });
  else m.setView(vis, 18);
  S._mapa = m;
}

const BIT_CLASE = { registro:"reg", comentario:"ed", resultado:"ed", traslado:"tr", pedido:"anu", aprobado:"anu", rechazado:"val", validada:"val", observada:"obs", revision:"reg", anulada:"anu", restituida:"val", ubicacion:"ed", seguimiento:"reg", recupero:"reg" };
const BIT_TIT = { recupero:"Recupero del POS (no cambia la visita)", seguimiento:"Seguimiento remoto del ejecutivo (no cambia la visita)", ubicacion:"Ubicación actualizada por el ejecutivo (la anterior quedó aquí)", comentario:"Comentario corregido", resultado:"Resultado corregido", traslado:"Trasladada a otro comercio", pedido:"El ejecutivo pidió anular la visita", aprobado:"Anulación aprobada", rechazado:"Pedido de anulación rechazado", validada:"Validada", observada:"Observada · el ejecutivo la ve en revisión", revision:"Vuelve a la cola", anulada:"Anulada por el analista", restituida:"Restituida · vuelve a contar" };
function eventos(v){
  const b = S.bit[v.id];
  const base = [{ accion:"registro", por:v.correo, en:v.recibido_en, antes:null, despues:`${comoFue(v).join(" · ")} · ${v.lat == null ? "sin GPS" : "GPS ±" + Math.round(v.precision_m) + " m"}` }];
  return base.concat(b || []).sort((a, c) => D(a.en) - D(c.en));
}
function lineaTiempo(v){
  if (!S.bit[v.id]) bitacora(v.id);
  return `<div class="linea-t">${eventos(v).map(b => `<div class="ev ${BIT_CLASE[b.accion]||""}"><i></i><div><b>${esc(b.accion === "registro" ? "Visita registrada" : (BIT_TIT[b.accion] || b.accion))}</b><small>${esc(nomDe(b.por))} · ${ddhh(b.en)}</small>${b.antes ? `<div class="ad"><span><em>antes</em>${esc(b.antes)}</span><span><em>después</em>${esc(b.despues)}</span></div>` : b.despues ? `<small>${esc(b.despues)}</small>` : ""}</div></div>`).join("")}${!S.bit[v.id] ? `<div class="ver-mas"><span class="spin"></span>cargando la bitácora</div>` : ""}</div>`;
}

function ficha(v){
  const e = ejDe(v.correo), sn = senales(v), c = S.baseMap[v.customer_id] || {};
  const lag = Math.round((D(v.recibido_en) - D(v.visitado_en))/60000);
  const prev = S.act.filter(x => x.customer_id === v.customer_id && x.id !== v.id);
  const puede = v.estado_anul !== "anulada", k = estadoDe(v);
  return `<div class="panel ficha">
    <div class="cab">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start"><h2>${esc(v.comercio)}</h2>${pill(v)}</div>
      <div class="meta">${esc(v.razon_social || "")}${v.ruc && v.ruc !== docDe(v.customer_id) ? " · RUC " + esc(v.ruc) : ""} · ${docDe(v.customer_id) ? "Doc. BBVA" : "Customer ID"} <b>${esc(docDe(v.customer_id) || v.customer_id)}</b><br>${esc(v.direccion || "sin dirección")}${v.distrito ? ", " + esc(v.distrito) : ""}${v.ruta ? ` · ${esc(v.ruta)}${v.orden ? " orden " + v.orden : ""}` : ""}${v.terminales ? ` · ${v.terminales} terminal${v.terminales>1?"es":""}` : ""}${c.estado ? ` · en el CRM: ${esc(c.estado)}` : ""}</div>
    </div>
    <div class="cuerpo">
      ${v.estado_anul === "pendiente" && S.modo !== "eje" ? `<div class="aviso warn"><b>${esc(nomDe(v.anul_pedida_por))} pide anular esta visita</b> (${ddhh(v.anul_pedida_en)}): «${esc(v.anul_motivo || "")}». Si la anulas, deja de contar; si rechazas el pedido, sigue contando.</div>` : ""}
      ${k === "obs" ? `<div class="aviso warn"><b>Observada</b> por ${esc(nomDe(v.validacion_por))} el ${ddhh(v.validacion_en)}: ${esc(v.validacion_motivo || "")}. ${esc(v.validacion_nota || "")} El ejecutivo la ve «en revisión» en su celular${v.puede_editar ? ` y puede corregirla hasta el ${fISO(v.limite_edicion)}` : "; su plazo de corrección ya venció"}. Sigue contando hasta que decidas.</div>` : ""}
      ${k === "val" ? (v.validacion_por === "automática" || !v.validacion_por ? `<div class="aviso ok"><b>Aceptada</b> como la registró el ejecutivo.${v.validacion_nota ? " " + esc(v.validacion_nota) : ""}</div>` : `<div class="aviso ok"><b>Validada</b> por ${esc(nomDe(v.validacion_por))} el ${ddhh(v.validacion_en)}.${v.validacion_nota ? " " + esc(v.validacion_nota) : ""}</div>`) : ""}
      ${k === "anu" ? `<div class="aviso mal"><b>Anulada</b>: ${esc(v.anul_motivo || "")}${v.anul_nota ? " · " + esc(v.anul_nota) : ""}. No cuenta.</div>` : ""}
      ${revisarMarcacion(v) && k !== "anu" ? `<div class="aviso warn"><b>Revisar marcación</b>: ${esc(revisarMarcacion(v))}. Lee el comentario; si no calza con lo marcado, obsérvala para que el ejecutivo la corrija.</div>` : ""}
      ${k === "pend" && v.validacion_nota ? `<div class="aviso">${esc(v.validacion_nota)}</div>` : ""}
      ${v.fuera_plazo && k !== "anu" ? `<div class="aviso mal"><b>Fuera de plazo</b>: la visita es del ${fISO(iso(v.visitado_en))} y llegó el ${ddhh(v.recibido_en)}; tenía hasta el ${fISO(v.plazo_hasta)}. Queda en el historial pero <b>no cuenta</b> como comercio visitado ni abre reactivación, aunque la valides.</div>` : ""}
      <div>
        <h3>La visita</h3>
        <div class="hechos">
          <div><small>Ejecutivo</small><b><span class="ej">${AVATAR(e)}${esc(e.nombre)}</span></b></div>
          <div><small>Hora declarada · recibida</small><b class="num">${hh(v.visitado_en)} · ${iso(v.recibido_en) !== iso(v.visitado_en) ? fISO(iso(v.recibido_en)) + " " : ""}${hh(v.recibido_en)}${lag > 0 ? ` <span style="color:var(--muted);font-weight:400">(+${lag} min)</span>` : ""}</b></div>
          <div><small>Plazo para registrarla</small><b style="color:${v.fuera_plazo ? "var(--rojo-txt)" : "inherit"}">${v.plazo_hasta ? "hasta el " + fISO(v.plazo_hasta) + (v.fuera_plazo ? " · llegó fuera de plazo" : " · llegó a tiempo") : "—"}</b></div>
          <div><small>Cómo fue la visita</small><b>${esc(comoFue(v)[0])}</b></div>
          <div><small>Detalle</small><b>${esc(comoFue(v)[1])}</b></div>
          <div><small>Cómo queda en la base de BBVA</small><b style="font-weight:500">Con_Quien ${esc(v.con)} · Que_Paso ${esc(v.que)}${v.motivo ? " · " + esc(v.motivo) : ""}${v.decision ? " · " + esc(v.decision) : ""}</b></div>
          <div><small>¿La dirección de la base es correcta?</small><b style="color:${v.direccion_ok === false ? "var(--rojo-txt)" : v.direccion_ok === true ? "var(--verde-txt)" : "inherit"}">${v.direccion_ok === true ? "Sí, según el ejecutivo" : v.direccion_ok === false ? "No, según el ejecutivo" : "No se preguntó (registro anterior al 24/09)"}</b></div>
          ${v.direccion_ok === false ? `<div><small>¿Ubicó el comercio?</small><b style="color:${v.comercio_ubicado === true ? "var(--verde-txt)" : v.comercio_ubicado === false ? "var(--rojo-txt)" : "inherit"}">${v.comercio_ubicado === true ? "Sí, en otra dirección" : v.comercio_ubicado === false ? "No lo encontró" : "No se preguntó (registro anterior al 25/09)"}</b></div>` : ""}
          
        </div>
      </div>
      <div><h3>Comentario del ejecutivo</h3><div class="coment">${esc(v.comentario) || "<i>sin comentario</i>"}${v.editado_en ? `<div class="ed">Corregido el ${ddhh(v.editado_en)}. El texto anterior está en la bitácora.</div>` : ""}</div>
        ${v.ia_propuesta ? `<div class="fb-crit">Dictado y prellenado con IA${v.ia_propuesta.modelo ? " (" + esc(v.ia_propuesta.modelo) + ")" : ""}; el ejecutivo revisó antes de guardar.${iaDistinto(v) ? " Cambió: " + esc(iaDistinto(v)) + "." : " Guardó lo que propuso la IA."}</div>` : ""}
        ${v.comentario_voz && v.comentario_voz.trim() !== (v.comentario || "").trim() ? `<div class="coment" style="margin-top:8px"><small class="muted" style="display:block;font-size:11px;margin-bottom:2px">Dictado original</small>${esc(v.comentario_voz)}</div>` : ""}</div>
      <div><h3>Feedback de la visita</h3>${fichaFeedback(v)}</div>
      <div><h3>Ubicación · ${sn.length ? `${sn.length} señal${sn.length>1?"es":""}` : "sin señales"}</h3>
        ${sn.length ? `<div style="margin-bottom:8px">${sn.map(([k2,t]) => `<span class="senal ${k2}">${esc(t)}</span>`).join("")}</div>` : ""}
        ${mapa(v)}</div>
      ${prev.length ? `<div><h3>Otras visitas a este comercio en el periodo</h3><div class="hist">${prev.map(p => `<div><span class="num">${ddhh(p.visitado_en)} · ${esc(nombreCorto(ejDe(p.correo).nombre))}</span><span>${esc(comoFue(p)[0])} · ${esc(comoFue(p)[1])}</span>${pill(p)}</div>`).join("")}</div></div>` : ""}
      <div><h3>Bitácora</h3>${lineaTiempo(v)}</div>
    </div>
    <div class="motivo ${S.accion && S.modo !== "eje" ? "on" : ""}" id="motivo">
      ${S.modo !== "eje" && S.accion === "obs" ? `<label for="mSel">Motivo de la observación (el ejecutivo lo ve en su celular)</label><select id="mSel">${OBS_MOTIVOS.map(m=>`<option>${m}</option>`).join("")}</select><label for="mNota">Nota para el ejecutivo</label><textarea id="mNota" rows="2" placeholder="Qué debe corregir o confirmar"></textarea><div class="fila"><button class="btn" data-cancelar>Cancelar</button><button class="btn a" data-confirmar="obs">Observar</button></div>` : ""}
      ${S.modo !== "eje" && S.accion === "anu" ? `<label for="mSel">Motivo de la anulación</label><select id="mSel">${ANU_MOTIVOS.map(m=>`<option>${m}</option>`).join("")}</select><label for="mNota">Nota (queda en la bitácora)</label><textarea id="mNota" rows="2"></textarea><div class="fila"><button class="btn" data-cancelar>Cancelar</button><button class="btn r" data-confirmar="anu">Anular · deja de contar</button></div>` : ""}
    </div>
    ${S.modo === "eje" ? "" : `<div class="acciones ${S.ocupado ? "cargando-btn" : ""}">
      ${puede && k !== "val" ? `<button class="btn v" data-accion="val">${ICON.ok} Validar<kbd>V</kbd></button>` : ""}
      ${puede && k !== "obs" ? `<button class="btn a" data-accion="obs">Observar<kbd>O</kbd></button>` : ""}
      ${puede && k === "obs" ? `<button class="btn" data-accion="cola">Levantar la observación</button>` : ""}
      ${puede ? `<button class="btn r" data-accion="anu">Anular<kbd>A</kbd></button>` : `<button class="btn" data-accion="rest">Restituir</button>`}
      ${v.estado_anul === "pendiente" ? `<button class="btn" data-accion="rech">Rechazar el pedido</button>` : ""}
      <button class="btn q" data-ir-traza="${v.id}" style="margin-left:auto">Ver en auditoría</button>
    </div>`}
  </div>`;
}
function siguientePendiente(actual){
  const l = filtradas(); const i = l.findIndex(v => v.id === actual);
  const sig = l[i+1] || l[i-1]; if (sig) S.sel = sig.id;
}

/* =========================================================================
   1b · Por ejecutivo y día
   ========================================================================= */
const DOW = ["dom","lun","mar","mié","jue","vie","sáb"];
// Días hábiles sin trabajo dentro del periodo: no cuentan como hábiles y la meta total no cambia (Jose, 25/11/2026)
const FERIADOS = ["2026-12-08"];
function diasPeriodo(){
  const p = S.periodo; if (!p) return [];
  const fin = hoyISO() < p.fin ? hoyISO() : p.fin;
  const out = []; const d = new Date(p.ini + "T12:00:00Z");
  while (d.toISOString().slice(0,10) <= fin){ const s2 = d.toISOString().slice(0,10), dow = d.getUTCDay(); out.push({ iso:s2, dow, habil: dow >= 1 && dow <= 5 && !FERIADOS.includes(s2) }); d.setUTCDate(d.getUTCDate() + 1); }
  return out.filter(x => x.dow !== 0 || S.act.some(v => iso(v.visitado_en) === x.iso));
}
function habiles(){
  const p = S.periodo; if (!p) return { total:0, antes:0, hastaHoy:0 };
  let total = 0, antes = 0, hastaHoy = 0; const hoy = hoyISO(); const d = new Date(p.ini + "T12:00:00Z");
  while (d.toISOString().slice(0,10) <= p.fin){ const s2 = d.toISOString().slice(0,10), dow = d.getUTCDay();
    if (dow >= 1 && dow <= 5 && !FERIADOS.includes(s2)){ total++; if (s2 < hoy) antes++; if (s2 <= hoy) hastaHoy++; } d.setUTCDate(d.getUTCDate() + 1); }
  return { total, antes, hastaHoy };
}
// Nueva = primera visita que cuenta del comercio en el periodo; las siguientes son revisitas: no suman a la meta, pero se registran con su resultado.
// Solo entran las visitas que cuentan (no anuladas, con ubicación y a tiempo): una primera visita sin ubicación o fuera de plazo no vuelve revisita a la siguiente.
function marcarRevisitas(act){
  const rev = new Map(), ant = new Map(), n = {}, ult = {};
  act.filter(v => v.estado_anul !== "anulada" && v.lat != null && !v.fuera_plazo).sort((a, b) => D(a.visitado_en) - D(b.visitado_en)).forEach(v => {
    const k = v.correo + "|" + v.customer_id; rev.set(v.id, n[k] || 0); if (n[k]) ant.set(v.id, ult[k]); n[k] = (n[k] || 0) + 1; ult[k] = v; });
  return { rev, ant };
}
// «Avanzó»: pasó de sin contacto a hablar con alguien, o de «aún no decide» a «realizará consumos»
const avanceRev = (v, p) => !!p && ((p.con === "Nadie" && v.con !== "Nadie") || (p.decision === "Aún no decide" && v.decision === "Realizará consumos"));
/* =========================================================================
   Ubicación (entrega 3, 26/11): ¿se registraron las visitas en el comercio? + alertas de registro + validación, plazo y anulaciones.
   Todo avisa, nada bloquea ni descarta visitas (Regla n.º 1). Los domicilios son un dato restringido: viven en v2_domicilios_ejecutivos
   y solo los lee el analista del escritorio (RPC v2_domicilios).
   ========================================================================= */
const hav = (a, b, c, d) => { const R = 6371000, p = Math.PI / 180, x = (c - a) * p, y = (d - b) * p, h = Math.sin(x / 2) ** 2 + Math.cos(a * p) * Math.cos(c * p) * Math.sin(y / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
async function cargarDomicilios(forzar){
  if ((S.domicilios && !forzar) || S._domCarg) return; S._domCarg = true;
  const { data, error } = await sb.rpc("v2_domicilios");
  S._domCarg = false; S.domicilios = error ? [] : (data || []); S.domErr = error ? error.message : ""; pintar();
}
// Comercios distintos registrados a 30 m o menos entre sí, el mismo día y dentro de 90 minutos. Nivel por la distancia de cada registro a su comercio.
function alertasMismoPunto(){
  const porDia = {};
  S.act.filter(v => v.estado_anul !== "anulada" && v.lat != null).sort((a, b) => D(a.visitado_en) - D(b.visitado_en)).forEach(v => { (porDia[v.correo + "|" + iso(v.visitado_en)] ||= []).push(v); });
  const grupos = [];
  Object.values(porDia).forEach(l => {
    const par = l.map((_, i) => i), f = i => par[i] === i ? i : (par[i] = f(par[i]));
    for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++){
      if (D(l[j].visitado_en) - D(l[i].visitado_en) > 90 * 60000) break;
      if (l[i].customer_id !== l[j].customer_id && hav(l[i].lat, l[i].lng, l[j].lat, l[j].lng) <= 30) par[f(i)] = f(j); }
    const g = {}; l.forEach((v, i) => { (g[f(i)] ||= []).push(v); });
    Object.values(g).forEach(m => { if (new Set(m.map(x => x.customer_id)).size < 2) return;
      const md = Math.max(0, ...m.map(x => x.distancia_m == null ? 0 : x.distancia_m));
      grupos.push({ visitas:m, md, nivel: md > REGLA.lejos ? "alta" : md > REGLA.cerca ? "media" : "info" }); });
  });
  const ord = { alta:0, media:1, info:2 };
  return grupos.sort((a, b) => ord[a.nivel] - ord[b.nivel] || D(b.visitas[0].visitado_en) - D(a.visitas[0].visitado_en));
}
// Visitas registradas cerca del domicilio del ejecutivo con el comercio lejos. Alta: a 150 m o menos y comercio a más de 500 m; media: a 500 m o menos y comercio a más de 1 km.
// Validación con la dirección cargada (Jose, 26/11): si el punto de la dirección del comercio (el de Google/dirección, no el tomado de otra visita) cae a 500 m o menos
// del domicilio, el comercio sí está ahí y la visita no es alerta. Si el comercio solo tiene un punto tomado de una visita, no se puede validar y la alerta se mantiene.
const DOM_R = { alta:150, media:500, comAlta:500, comMedia:1000 };   // alerta de domicilio: radio y distancia al comercio, en metros
const puntoDireccion = v => v.ref_lat != null && v.ref_calidad !== "visita" ? { lat:v.ref_lat, lng:v.ref_lng, cal:v.ref_calidad }
  : v.geo_lat != null && v.geo_calidad !== "visita" ? { lat:v.geo_lat, lng:v.geo_lng, cal:v.geo_calidad } : null;
function alertasDomicilio(){
  const mejor = {}; let descartadas = 0;
  (S.domicilios || []).forEach(d => S.act.forEach(v => {
    if (v.correo !== d.correo || v.estado_anul === "anulada" || v.lat == null || v.distancia_m == null) return;
    const m = Math.round(hav(v.lat, v.lng, d.lat, d.lng)), nivel = m <= DOM_R.alta && v.distancia_m > DOM_R.comAlta ? "alta" : m <= DOM_R.media && v.distancia_m > DOM_R.comMedia ? "media" : null;
    if (!nivel) return;
    const pd = puntoDireccion(v), mc = pd ? Math.round(hav(pd.lat, pd.lng, d.lat, d.lng)) : null;
    if (pd && mc <= DOM_R.media){ descartadas++; return; }
    if (!mejor[v.id] || m < mejor[v.id].m) mejor[v.id] = { v, d, m, nivel, pd, mc }; }));
  const ord = { alta:0, media:1 }, out = Object.values(mejor).sort((a, b) => ord[a.nivel] - ord[b.nivel] || D(b.v.visitado_en) - D(a.v.visitado_en));
  out.descartadas = descartadas; return out;
}
const NIVEL_TXT = { alta:["Alta", "n-alta"], media:["Media", "n-media"], info:["Informativa", "n-info"] };
function panelValidacion(){
  const por = S.ejecutivos.map(e => { const t = S.act.filter(v => v.correo === e.correo);
    return { e, reg:t.length, val:t.filter(v => estadoDe(v) === "val").length, pend:t.filter(v => estadoDe(v) === "pend").length, obs:t.filter(v => estadoDe(v) === "obs").length,
      anu:t.filter(v => v.estado_anul === "anulada").length, tarde:t.filter(v => v.fuera_plazo).length, pedidas:t.filter(v => v.estado_anul === "pendiente").length }; });
  const sum = k => por.reduce((a, f) => a + f[k], 0), anul = S.act.filter(v => v.estado_anul === "anulada").sort((a, b) => D(b.visitado_en) - D(a.visitado_en));
  return `<div class="panel" style="margin-bottom:16px"><div class="barra"><b>Validación, plazo y anulaciones</b><span class="lbl">las visitas se validan solas: las señales avisan, no bloquean · solo se rechaza por seguridad, por el plazo o por un error de captura evidente</span></div>
    <table class="datos"><thead><tr><th>Ejecutivo</th><th class="n">Registradas</th><th class="n">Validadas</th><th class="n">Por validar</th><th class="n">Observadas</th><th class="n">Anuladas</th><th class="n">Anulación pedida</th><th class="n">Fuera de plazo</th></tr></thead>
    <tbody>${por.map(f => `<tr><td><span class="ej">${AVATAR(f.e)}${esc(f.e.nombre)}</span></td><td class="n num">${f.reg}</td><td class="n num">${f.val}</td><td class="n num">${f.pend}</td><td class="n num">${f.obs}</td><td class="n num">${f.anu}</td><td class="n num">${f.pedidas}</td><td class="n num ${f.tarde ? "mal" : ""}">${f.tarde}</td></tr>`).join("")}
    <tr class="total"><td><b>Equipo</b></td><td class="n num">${sum("reg")}</td><td class="n num">${sum("val")}</td><td class="n num">${sum("pend")}</td><td class="n num">${sum("obs")}</td><td class="n num">${sum("anu")}</td><td class="n num">${sum("pedidas")}</td><td class="n num">${sum("tarde")}</td></tr></tbody></table>
    ${anul.length ? `<div class="barra" style="border-top:1px solid var(--linea)"><b>Anulaciones y su motivo</b></div><div class="eq-dias"><table class="datos"><thead><tr><th>Cuándo</th><th>Ejecutivo</th><th>Comercio</th><th>Motivo</th></tr></thead><tbody>${anul.map(v => `<tr><td>${fISO(iso(v.visitado_en))} ${hh(v.visitado_en)}</td><td>${esc(nombreCorto(ejDe(v.correo).nombre))}</td><td>${esc(v.comercio)}</td><td>${esc(String(v.anul_motivo || "(sin motivo)").slice(0, 220))}</td></tr>`).join("")}</tbody></table></div>` : `<div class="atajos">No hay visitas anuladas en el periodo.</div>`}</div>`;
}
function panelDomicilios(){
  const L = S.domicilios || [];
  return `<div class="panel" style="margin-bottom:16px"><div class="barra"><b>Domicilios de referencia</b><span class="lbl">dato restringido: lo ven solo quienes tienen acceso al escritorio, nunca los ejecutivos · sirve para la alerta «en el domicilio»</span></div>
    ${S.domErr ? `<div class="vacio">Todavía no están habilitados (${esc(S.domErr)}).</div>` : `<table class="datos"><thead><tr><th>Ejecutivo</th><th>Etiqueta</th><th>Punto</th><th>Exactitud</th><th>Nota</th><th></th></tr></thead><tbody>${L.map(d => `<tr><td>${esc(d.ejecutivo)}</td><td>${esc(d.etiqueta || "—")}</td><td><a href="${gmaps(d.lat, d.lng)}" target="_blank" rel="noopener">${d.lat.toFixed(5)}, ${d.lng.toFixed(5)} ↗</a></td><td>${esc(d.exactitud)}</td><td>${esc(d.nota || "")}</td><td class="n"><button class="btn q" data-dom-borrar="${d.id}">Borrar</button></td></tr>`).join("") || `<tr><td colspan="6" class="muted">Todavía no hay domicilios de referencia.</td></tr>`}</tbody></table>
    <div class="dom-form"><select id="domEj" aria-label="Ejecutivo">${(S.muTodos || S.ejecutivos).map(e => `<option value="${esc(e.correo)}">${esc(e.nombre)}</option>`).join("")}</select>
      <input id="domEt" placeholder="Etiqueta (opcional)" aria-label="Etiqueta"><input id="domLat" placeholder="Latitud, ej. -12.0931" aria-label="Latitud" inputmode="decimal"><input id="domLng" placeholder="Longitud, ej. -77.0465" aria-label="Longitud" inputmode="decimal">
      <select id="domEx" aria-label="Exactitud"><option value="aproximado">Aproximado (calle o zona)</option><option value="exacto">Exacto</option></select><input id="domNota" placeholder="Nota (opcional)" aria-label="Nota" maxlength="300">
      <button class="btn" data-dom-guardar>Guardar domicilio</button></div>
    <div class="atajos">Para el punto exacto: en Google Maps, clic derecho sobre el lugar y «copiar coordenadas». Los domicilios se cargan aquí, nunca en un archivo del repositorio.</div>`}</div>`;
}
async function guardarDomicilio(){
  if (S._domGuardando) return;
  const num = id => Number(String(document.getElementById(id).value).replace(",", ".").trim());
  const a = { p_correo:document.getElementById("domEj").value, p_etiqueta:document.getElementById("domEt").value, p_lat:num("domLat"), p_lng:num("domLng"), p_exactitud:document.getElementById("domEx").value, p_nota:document.getElementById("domNota").value };
  if (!Number.isFinite(a.p_lat) || !Number.isFinite(a.p_lng) || document.getElementById("domLat").value.trim() === "" || document.getElementById("domLng").value.trim() === ""){ toast("Escribe la latitud y la longitud como números, por ejemplo -12.0931 y -77.0465."); return; }
  S._domGuardando = true;
  const { error } = await sb.rpc("v2_guardar_domicilio", a);
  S._domGuardando = false;
  if (error){ toast(error.message); return; }
  toast("Domicilio guardado."); S.domicilios = null; cargarDomicilios(true);
}
async function borrarDomicilio(id){
  if (!confirm("¿Borrar este domicilio de referencia? Quedará anotado quién y cuándo.")) return;
  const { error } = await sb.rpc("v2_borrar_domicilio", { p_id:Number(id) });
  if (error){ toast(error.message); return; }
  toast("Domicilio borrado."); S.domicilios = null; cargarDomicilios(true);
}
document.addEventListener("keydown", ev => { if (ev.key !== "Enter" && ev.key !== " ") return; const t = ev.target.closest && ev.target.closest("tr[data-mu-v],tr[data-mu-g],tr[data-mu-dis]"); if (t && ev.target === t){ ev.preventDefault(); t.click(); } });
document.addEventListener("click", ev => {
  const t = ev.target.closest("[data-dom-guardar],[data-dom-borrar]"); if (!t) return;
  if (t.hasAttribute("data-dom-guardar")){ guardarDomicilio(); return; }
  if (t.dataset.domBorrar){ borrarDomicilio(t.dataset.domBorrar); }
});
/* =========================================================================
   Directorio · vista para directorio: cobertura, contacto y dirección errada, con selector de periodo (P1 a P5).
   Los periodos cerrados no se tocan: se leen con sus mismas funciones. Reactivados e incentivo solo existen en los cerrados (los informa BBVA).
   ========================================================================= */
async function cargarPeriodos(){
  if (S.periodos || S._perCarg) return; S._perCarg = true;
  const { data, error } = await sb.from("v2_periodos").select("*").order("ini");
  S._perCarg = false; S.periodos = error ? [] : (data || []); pintar();
}
function datosPeriodo(per){
  if (S.periodo && per.id === S.periodo.id) return { act:S.act, base:S.base, baseMap:S.baseMap, hayOrigen:S.hayOrigen };
  S.dirDatos = S.dirDatos || {};
  if (!S.dirDatos[per.id]){ S.dirDatos[per.id] = { cargando:true }; cargarDatosPeriodo(per); }
  return S.dirDatos[per.id];
}
async function cargarDatosPeriodo(per){
  const [a, b] = await Promise.all([leerActividad(per.ini, per.fin), leerBasePorTramos(per.id)]);
  if (a.error || b.error){ S.dirDatos[per.id] = { err:(a.error || b.error).message }; pintar(); return; }
  if (!S.apartes) await cargarApartes();
  const todo = aplicarAparte(b.data || [], per.id), baseMap = {}; todo.forEach(c => { baseMap[c.customer_id] = c; });
  S.dirDatos[per.id] = { act:a.data || [], base:todo.filter(enCartera), baseMap, hayOrigen:todo.some(c => c.origen) }; pintar();
}
function statsDir(d, correo){
  const sm = cid => { const c = d.baseMap[cid]; return !d.hayOrigen || (!!c && c.origen === "base_nueva"); };
  const act = d.act.filter(v => v.estado_anul !== "anulada" && (!correo || v.correo === correo));
  const base = d.base.filter(c => c.correo && (!correo || c.correo === correo) && (!d.hayOrigen || c.origen === "base_nueva"));
  const asig = base.length, vis = new Set(act.filter(v => v.lat != null && !v.fuera_plazo && sm(v.customer_id)).map(v => v.customer_id)).size;
  const reg = act.length, con = act.filter(v => v.con !== "Nadie").length, err = act.filter(v => v.con === "Nadie" && v.motivo === "Dirección errada").length;
  return { asig, vis, reg, con, err, cob: asig ? vis / asig : null, pcon: reg ? con / reg : null, perr: reg ? err / reg : null };
}
function vistaDirectorio(){
  cargarPeriodos(); cargarCierres();
  const L = (S.periodos || []).filter(p => String(p.ini) <= hoyISO());
  if (!L.length) return `<div class="panel"><div class="vacio">Leyendo los periodos…</div></div>`;
  const per = L.find(p => p.id === S.dirPer) || L.find(p => S.periodo && p.id === S.periodo.id) || L[L.length - 1];
  const chips = "";
  const d = datosPeriodo(per);
  if (d.cargando) return chips + `<div class="panel"><div class="vacio"><span class="spin"></span> Leyendo el periodo ${esc(per.id)}…</div></div>`;
  if (d.err) return chips + `<div class="panel"><div class="vacio">No se pudo leer el periodo: ${esc(d.err)}<br><button class="btn" data-dirper="${esc(per.id)}" style="margin-top:10px">Reintentar</button></div></div>`;
  const enCurso = !!(S.periodo && per.id === S.periodo.id), T = statsDir(d);
  const ci = ((S.cierres && S.cierres.l) || []).filter(r => r.periodo === per.id), cerrado = ci.length > 0;
  const rea = ci.reduce((n, r) => n + Number(r.reactivados_lista || 0), 0);
  const ant = L[L.indexOf(per) - 1], da = ant ? datosPeriodo(ant) : null, Ta = da && da.act ? statsDir(da) : null;
  const pc = x => x == null ? "—" : Math.round(x * 100) + " %", pts = (x, y) => x == null || y == null ? "" : `${x >= y ? "▲" : "▼"} ${Math.abs(Math.round((x - y) * 100))} pts frente a ${esc(ant.id)}`;
  const tile = (k, v, d2, cls) => `<div class="tile ${cls || ""}"><div class="k">${k}</div><div class="v num">${v}</div><div class="d">${d2}</div></div>`;
  const kp = `<div class="resumen">
    ${tile("Cobertura", pc(T.cob), `${T.vis} de ${T.asig} comercios asignados visitados${enCurso ? " · periodo en curso" : ""}`, "acc")}
    ${tile("Contacto", pc(T.pcon), `${T.con} de ${T.reg} visitas hablaron con el comercio${Ta ? " · " + pts(T.pcon, Ta.pcon) : ""}`)}
    ${tile("Dirección errada", pc(T.perr), `${T.err} de ${T.reg} visitas no ubicaron el comercio${Ta ? " · " + pts(T.perr, Ta.perr) : ""}`)}
    ${tile("Reactivados BBVA", cerrado ? numPE(rea) : "—", cerrado ? "reportados por BBVA al cierre del periodo" : "los informa BBVA: se conoce al cierre del periodo")}
  </div>`;
  const ejs = S.ejecutivos.map(e => ({ e, t:statsDir(d, e.correo), c:ci.find(r => r.correo === e.correo) }));
  // línea vertical: lo esperado a hoy según la meta diaria (solo en el periodo en curso). Esperado = meta acumulada hasta hoy ÷ comercios asignados, tope 100 %.
  const Hd = enCurso ? habiles() : null, metaE = (S.avance && S.avance[0] && S.avance[0].meta_visitas) || 160;
  const esperado = t => Hd && Hd.total && t && t.asig ? Math.min(1, (metaE * (Hd.hastaHoy || 0) / Hd.total) / t.asig) : null;
  const barra = (x, t) => { const e = t ? esperado(t) : null; return `<div class="barrita"><i style="width:${Math.round((x || 0) * 100)}%"></i>${e != null ? `<b class="esp" style="left:${Math.round(e * 100)}%" title="Esperado a hoy: ${Math.round(e * 100)} %"></b>` : ""}</div>`; };
  const tEj = `<div class="panel" style="margin-bottom:16px"><div class="barra"><b>Efectividad por ejecutivo</b><span class="lbl">medidas de gestión de cada ejecutivo${enCurso ? " · la línea vertical marca lo esperado a hoy según la meta diaria" : ""} · los reactivados y el incentivo solo existen en periodos cerrados</span></div>
    <table class="datos"><thead><tr><th>Ejecutivo</th><th class="n">Asignados</th><th class="n">Visitados</th><th class="n">Cobertura</th><th class="n">Contacto</th><th class="n">Dirección errada</th><th class="n">Reactivados</th><th class="n">Incentivo</th></tr></thead>
    <tbody>${ejs.map(({ e, t, c }) => `<tr><td><span class="ej">${AVATAR(e)}${esc(e.nombre)}</span></td><td class="n num">${t.asig}</td><td class="n num">${t.vis}</td>
      <td class="n num">${pc(t.cob)}${barra(t.cob, t)}</td><td class="n num">${pc(t.pcon)}${barra(t.pcon)}</td><td class="n num">${pc(t.perr)}${barra(t.perr)}</td>
      <td class="n num">${c ? numPE(c.reactivados_lista) : "—"}</td><td class="n num">${c ? pctC(c.incentivo_pct) : "—"}</td></tr>`).join("")}</tbody></table></div>`;
  // distritos con más comercios asignados
  const m = {}; const g = k => m[k] ||= { asig:0, vis:new Set(), reg:0, con:0, err:0 };
  d.base.filter(c => c.correo && (!d.hayOrigen || c.origen === "base_nueva")).forEach(c => { g(c.distrito || "Sin distrito").asig++; });
  d.act.filter(v => v.estado_anul !== "anulada").forEach(v => { const o = g(v.distrito || "Sin distrito"); o.reg++; if (v.con !== "Nadie") o.con++; if (v.con === "Nadie" && v.motivo === "Dirección errada") o.err++;
    if (v.lat != null && !v.fuera_plazo && (!d.hayOrigen || (d.baseMap[v.customer_id] || {}).origen === "base_nueva")) o.vis.add(v.customer_id); });
  const todos = Object.entries(m).sort((a, b) => b[1].asig - a[1].asig), ds = todos.filter(([k, o]) => o.asig >= 10 && k !== "Sin distrito").slice(0, 12);
  const resto = todos.filter(x => !ds.includes(x)).reduce((r, [, o]) => { r.asig += o.asig; r.reg += o.reg; r.con += o.con; r.err += o.err; o.vis.forEach(c => r.vis.add(c)); return r; }, { asig:0, vis:new Set(), reg:0, con:0, err:0 });
  if (resto.asig || resto.reg) ds.push(["Otros distritos y sin distrito", resto]);
  const tDis = `<div class="panel"><div class="barra"><b>Distritos con más comercios asignados</b><span class="lbl">los 12 mayores (10 comercios o más) y el resto sumado en la última fila · el mapa de distritos tiene el detalle de cada uno</span></div>
    <table class="datos"><thead><tr><th>Distrito</th><th class="n">Asignados</th><th class="n">Visitados</th><th class="n">Cobertura</th><th class="n">Contacto</th><th class="n">Dirección errada</th></tr></thead>
    <tbody>${ds.map(([k, o]) => `<tr><td><b>${esc(k)}</b></td><td class="n num">${o.asig}</td><td class="n num">${o.vis.size}</td><td class="n num">${pc(o.asig ? o.vis.size / o.asig : null)}${barra(o.asig ? o.vis.size / o.asig : 0)}</td>
      <td class="n num">${pc(o.reg ? o.con / o.reg : null)}</td><td class="n num">${pc(o.reg ? o.err / o.reg : null)}</td></tr>`).join("") || `<tr><td colspan="6" class="muted">Sin comercios asignados.</td></tr>`}</tbody></table></div>`;
  return chips + kp + tEj + tDis + `<details class="ayuda"><summary>Cómo se calcula</summary><div class="ayuda-txt">Cobertura = comercios distintos con una visita válida ÷ comercios asignados (en un periodo por bloques, solo la base nueva). Contacto = visitas en que habló con alguien ÷ visitas. Dirección errada = visitas donde no se ubicó el comercio ÷ visitas. Los reactivados y el incentivo los define BBVA y se muestran solo en los periodos cerrados; en el periodo en curso quedan «—». Los periodos cerrados se leen tal como quedaron: no se modifican.</div></details>`;
}

// Equipo con el periodo que se eligió arriba: en un periodo cerrado se leen sus visitas y su base, y los días y la meta salen de ese periodo.
function conPeriodoElegido(vista){
  cargarPeriodos();
  const p = (S.periodos || []).find(x => x.id === S.dirPer);
  if (!p || !S.periodo || p.id === S.periodo.id) return vista();
  const d = datosPeriodo(p);
  if (d.cargando) return `<div class="panel"><div class="vacio"><span class="spin"></span> Leyendo el periodo ${esc(p.id)}…</div></div>`;
  if (d.err) return `<div class="panel"><div class="vacio">No se pudo leer el periodo: ${esc(d.err)}<br><button class="btn" data-dirper="${esc(p.id)}" style="margin-top:10px">Reintentar</button></div></div>`;
  const g = { periodo:S.periodo, avance:S.avance };
  try { return conPeriodoId(p.id, () => { S.periodo = p; S.avance = null; return vista(); }); } finally { Object.assign(S, g); }
}
/* =========================================================================
   Resumen, Tiempos y Reporte de supervisión (prototipo 4.0, 26/11/2026)
   Todo sale de las visitas con GPS del CRM y de la base asignada: no hay cifras nuevas ni escritura. Las visitas anuladas no cuentan.
   ========================================================================= */
const horaMin = v => { const [h, m] = hh(v.visitado_en).split(":").map(Number); return h * 60 + m; };
const minTxt = m => m == null ? "—" : (m >= 60 ? Math.floor(m / 60) + " h " + String(Math.round(m % 60)).padStart(2, "0") + " min" : Math.round(m) + " min");
const relojTxt = m => m == null ? "—" : String(Math.floor(m / 60) % 24).padStart(2, "0") + ":" + String(Math.round(m % 60)).padStart(2, "0");
const vivas = () => S.act.filter(v => v.estado_anul !== "anulada" && v.visitado_en && !isNaN(D(v.visitado_en)));
const FRANJAS_REP = [["Mañana · hasta 12:00", 0, 720, "#8F99FF"], ["Mediodía · 12:00 a 14:00", 720, 840, "#F86F35"], ["Tarde · 14:00 a 18:00", 840, 1080, "#3B43FB"], ["Noche · desde las 18:00", 1080, 1500, "#0C1137"]];
// por ejecutivo y día: primera y última visita (la «ventana» del día) y el promedio entre visitas
function jornadas(correo){
  const m = {};
  vivas().filter(v => !correo || v.correo === correo).forEach(v => { (m[v.correo + "|" + iso(v.visitado_en)] ||= { correo:v.correo, dia:iso(v.visitado_en), min:[] }).min.push(horaMin(v)); });
  return Object.values(m).map(j => { j.min.sort((a, b) => a - b); j.n = j.min.length; j.ini = j.min[0]; j.fin = j.min[j.n - 1]; j.ventana = j.n >= 2 ? j.fin - j.ini : null; j.prom = j.n >= 2 ? j.ventana / (j.n - 1) : null; return j; });
}
function vistaResumen(){
  const H = habiles(), hoy = hoyISO(), metaEj = (S.avance && S.avance[0] && S.avance[0].meta_visitas) || 160, meta = metaEj * S.ejecutivos.length;
  const T0 = { act:S.act, base:S.base, baseMap:S.baseMap, hayOrigen:S.hayOrigen }, T = statsDir(T0);
  const hastaHoy = H.hastaHoy || 0, ritmo = hastaHoy ? T.vis / hastaHoy : null, metaDia = H.total ? meta / H.total : null;
  const tile = (v, t, sub) => `<div class="tile"><div class="v num">${v}${sub ? ` <small class="muted">${sub}</small>` : ""}</div><div class="d">${t}</div></div>`;
  const kp = `<div class="resumen">${tile(T.asig, "cartera asignada")}${tile(T.vis, "comercios visitados" + (meta ? ` · ${Math.round(T.vis * 100 / meta)} % de la meta` : ""), "/ " + meta)}${tile(hastaHoy, "días hábiles transcurridos", "de " + H.total)}${tile(ritmo == null ? "—" : ritmo.toFixed(1).replace(".", ","), "ritmo por día" + (metaDia ? ` · meta ${metaDia.toFixed(1).replace(".", ",")} por día` : ""))}${tile(T.reg, "visitas realizadas (incluye sin contacto)")}${tile(T.con, "visitas con contacto")}${tile("—", "reactivados BBVA · sin corte conectado")}</div>`;
  const esp = esperadoA(metaEj, hoy);
  const filas = S.ejecutivos.map(e => { const t = statsDir(T0, e.correo);
    return `<tr><td><span class="ej">${AVATAR(e)}${esc(e.nombre)}</span></td><td class="n num">${t.asig}</td><td class="n num">${t.vis}</td><td class="n num">${t.reg}</td><td class="n num">${t.con}</td><td><b>${t.vis}</b><span class="muted"> / ${metaEj}</span><span class="muted"> · esperado ${Math.round(esp)}</span><div class="barrita"><i style="width:${Math.min(100, Math.round(t.vis * 100 / metaEj))}%"></i><u style="left:${Math.min(100, Math.round(esp * 100 / metaEj))}%" title="dónde debería ir hoy"></u></div></td><td class="n num">—</td></tr>`; }).join("");
  const hoyN = vivas().filter(v => iso(v.visitado_en) === hoy).length;
  const perId = (S.dirPer || (S.periodo || {}).id), sg = (S.segs && S.segs[perId]) || [], sgL = sg.filter(r => S.ej === "todos" || r.correo === S.ej);
  const segPanel = `<div class="panel" style="margin-bottom:16px"><div class="barra"><b>Seguimiento remoto del periodo</b><span class="lbl">${sgL.length} contacto${sgL.length === 1 ? "" : "s"} por llamada, WhatsApp o correo a comercios sin contacto en la visita · no cambia la visita ni el bono</span></div>
    <div class="eq-dias"><table class="datos"><thead><tr><th>Cuándo</th><th>Ejecutivo</th><th>Comercio</th><th>Canal</th><th>Qué respondió</th></tr></thead><tbody>${sgL.map(r => { const c = S.baseMap[r.customer_id] || {}, ej = ejDe(r.correo);
      return `<tr><td>${fISO(iso(r.hecho_en))} ${hh(r.hecho_en)}</td><td><span class="ej">${AVATAR(ej)}${esc(nombreCorto(ej.nombre))}</span></td><td><b>${esc(c.nombre_comercial || c.razon_social || r.customer_id)}</b></td><td>${esc(r.canal)}</td><td>${esc(r.resultado)}${r.nota ? `<small class="muted" style="display:block">${esc(r.nota)}</small>` : ""}</td></tr>`; }).join("") || `<tr><td colspan="5" class="muted">${S.segs && S.segs[perId] === null ? "Leyendo…" : "Todavía no hay seguimientos remotos en el periodo."}</td></tr>`}</tbody></table></div></div>`;
  return `<div class="panel" style="margin-bottom:16px"><div class="barra"><b>Gestión del equipo${S.periodo ? " · " + esc(pNom(S.periodo)) : ""}</b><span class="lbl">cada cifra sale de las visitas con GPS del CRM</span></div><div style="padding:10px">${kp}</div></div>
  <div class="panel" style="margin-bottom:16px"><div class="barra"><b>Gestión por ejecutivo</b></div><table class="datos"><thead><tr><th>Ejecutivo</th><th class="n">Asignados</th><th class="n">Visitados únicos</th><th class="n">Visitas</th><th class="n">Con contacto</th><th>Avance de comercios nuevos contra lo esperado</th><th class="n">Reactivados BBVA</th></tr></thead><tbody>${filas}</tbody></table></div>
  ${segPanel}
  ${S.periodo && hoy >= S.periodo.ini && hoy <= S.periodo.fin ? `<div class="panel"><div class="barra"><b>Hoy · ${fISO(hoy)}</b></div><div style="padding:10px"><div class="resumen">${tile(hoyN, "visitas registradas hoy")}</div><div class="muted" style="font-size:12px;margin-top:8px">El incentivo y los reactivados de cada periodo están en Cierres.</div></div></div>` : ""}`;
}
function vistaTiempos(){
  const tab = S.tTab || "dia", dia = S.tDia || hoyISO();
  const tabs = [["dia", "Resumen diario"], ["acum", "Acumulado del periodo"], ["rangos", "Rangos horarios"], ["det", "Detalle de registros"]];
  const ctl = `<div class="panel" style="margin-bottom:16px"><div class="barra"><b>Consulta de tiempos</b></div><div style="padding:10px;display:flex;gap:12px;align-items:center;flex-wrap:wrap"><span class="tm-dia"><button class="btn" data-tdia-mas="-1" aria-label="Día anterior" title="Día anterior">‹</button><input type="date" id="tDia" value="${esc(dia)}" aria-label="Día"><button class="btn" data-tdia-mas="1" aria-label="Día siguiente" title="Día siguiente">›</button></span><div class="chips" role="group" aria-label="Vista de tiempos" style="margin:0">${tabs.map(([k, t]) => `<button class="chip ${tab === k ? "on" : ""}" data-ttab="${k}" aria-pressed="${tab === k}">${t}</button>`).join("")}</div></div></div>`;
  const vs = vivas().filter(v => tab === "acum" || tab === "rangos" ? true : iso(v.visitado_en) === dia);
  const hs = vs.map(v => Math.floor(horaMin(v) / 60)), horas = []; for (let h = Math.min(8, ...hs); h <= Math.max(21, ...hs); h++) horas.push(h);   // 8 a 22 h; si hay visitas fuera de ese rango, se amplía para que el total cuadre
  let cuerpo;
  if (tab === "dia" || tab === "acum"){
    const filas = S.ejecutivos.map(e => { const l = vs.filter(v => v.correo === e.correo), por = horas.map(h => l.filter(v => Math.floor(horaMin(v) / 60) === h).length), n = l.length, pico = n ? horas[por.indexOf(Math.max(...por))] : null;
      return { e, por, n, pico, activas:por.filter(x => x).length }; });
    const max = Math.max(1, ...filas.flatMap(f => f.por)), colH = horas.map((h, i) => filas.reduce((s, f) => s + f.por[i], 0));
    const tabla = `<div class="panel"><div class="barra"><b>Visitas por hora · ${tab === "dia" ? fISO(dia) : "todo el periodo"}</b><span class="lbl">cada celda cuenta las visitas de esa hora (8–9, 9–10…) · más oscuro = más visitas</span></div>
      <div class="eq-dias"><table class="datos tiempos"><thead><tr><th>Ejecutivo</th>${horas.map(h => `<th class="n">${h}–${h + 1}</th>`).join("")}<th class="n">Total</th><th class="n">Hora pico</th><th class="n">Horas activas</th></tr></thead><tbody>${filas.map(f => `<tr><td><span class="ej">${AVATAR(f.e)}${esc(f.e.nombre)}</span><small class="muted" style="display:block">${f.n ? f.n + " visitas" : "sin visitas"}</small></td>${f.por.map(x => `<td class="n num"><span class="cel" style="--i:${(x / max).toFixed(2)}">${x || ""}</span></td>`).join("")}<td class="n num"><b>${f.n}</b></td><td class="n num">${f.pico == null ? "—" : f.pico + "–" + (f.pico + 1)}</td><td class="n num">${f.activas} de ${horas.length}</td></tr>`).join("")}
      <tr class="total"><td><b>Equipo</b></td>${colH.map(x => `<td class="n num"><b>${x || ""}</b></td>`).join("")}<td class="n num"><b>${filas.reduce((s, f) => s + f.n, 0)}</b></td><td></td><td></td></tr></tbody></table></div></div>`;
    if (tab === "acum") cuerpo = tabla;
    else {
      // Resumen diario (26/11, rediseño): una tarjeta por ejecutivo con sus visitas del día, cuándo empezó y terminó, cada cuánto registró y su hora pico.
      const J = jornadas(), jd = c => J.find(j => j.correo === c && j.dia === dia), maxC = Math.max(1, ...colH);
      const fila = (k, v) => `<div class="tm-fila"><span>${k}</span><b>${v}</b></div>`;
      const tarjeta = (nombre, avatar, n, por, j, pico) => `<div class="tm-card${n ? "" : " vacia"}"><div class="tm-top"><span class="ej">${avatar}${esc(nombre)}</span><span class="tm-n"><b class="num">${n}</b><small>visita${n === 1 ? "" : "s"}</small></span></div>
        <div class="tm-bars" role="img" aria-label="Visitas por hora del día">${por.map((x, i) => `<i class="${x ? "on" : ""}" style="height:${x ? Math.max(12, Math.round(x * 100 / Math.max(1, ...por))) : 5}%" title="${horas[i]}–${horas[i] + 1} h: ${x}"></i>`).join("")}</div>
        <div class="tm-ejeh"><span>${horas[0]} h</span><span>${horas[horas.length - 1] + 1} h</span></div>
        ${n ? fila("Primera visita", relojTxt(j ? j.ini : null)) + fila("Última visita", relojTxt(j ? j.fin : null)) + fila("Ventana del día", j && j.ventana != null ? minTxt(j.ventana) : "—") + fila("Registra cada", j && j.prom != null ? minTxt(j.prom) : "—") + fila("Hora pico", pico == null ? "—" : pico + "–" + (pico + 1) + " h") : `<div class="tm-vacio">Sin visitas este día</div>`}</div>`;
      const todas = J.filter(j => j.dia === dia), totN = filas.reduce((a, f) => a + f.n, 0);
      const jt = todas.length ? { ini: Math.min(...todas.map(j => j.ini)), fin: Math.max(...todas.map(j => j.fin)) } : null;
      const picoT = totN ? horas[colH.indexOf(Math.max(...colH))] : null;
      cuerpo = `<div class="tm-cards">${filas.map(f => tarjeta(f.e.nombre, AVATAR(f.e), f.n, f.por, jd(f.e.correo), f.pico)).join("")}
        <div class="tm-card eq"><div class="tm-top"><span class="ej"><b>Equipo</b></span><span class="tm-n"><b class="num">${totN}</b><small>visita${totN === 1 ? "" : "s"}</small></span></div>
          <div class="tm-bars" role="img" aria-label="Visitas del equipo por hora">${colH.map((x, i) => `<i class="${x ? "on" : ""}" style="height:${x ? Math.max(12, Math.round(x * 100 / maxC)) : 5}%" title="${horas[i]}–${horas[i] + 1} h: ${x}"></i>`).join("")}</div>
          <div class="tm-ejeh"><span>${horas[0]} h</span><span>${horas[horas.length - 1] + 1} h</span></div>
          ${totN ? fila("Primera del equipo", relojTxt(jt && jt.ini)) + fila("Última del equipo", relojTxt(jt && jt.fin)) + fila("Hora pico", picoT == null ? "—" : picoT + "–" + (picoT + 1) + " h") : `<div class="tm-vacio">Sin visitas este día</div>`}</div></div>
        <details class="mu-det" style="margin-top:14px"><summary>Ver la tabla de visitas por hora</summary>${tabla}</details>`;
    }
  } else if (tab === "rangos"){
    cuerpo = `<div class="panel"><div class="barra"><b>Rangos horarios del periodo</b><span class="lbl">qué parte de sus visitas hace cada ejecutivo en cada franja del día</span></div><div style="padding:10px">${barrasFranjas()}</div></div>`;
  } else {
    const l = vs.slice().sort((a, b) => D(a.visitado_en) - D(b.visitado_en));
    cuerpo = `<div class="panel"><div class="barra"><b>Detalle de registros · ${fISO(dia)}</b><span class="lbl">${l.length} visitas, por hora</span></div><div class="eq-dias"><table class="datos"><thead><tr><th>Hora</th><th>Ejecutivo</th><th>Comercio</th><th>Distrito</th><th>Resultado</th></tr></thead><tbody>${l.map(v => `<tr><td class="num">${hh(v.visitado_en)}</td><td><span class="ej">${AVATAR(ejDe(v.correo))}${esc(nombreCorto(ejDe(v.correo).nombre))}</span></td><td>${esc(v.comercio)}</td><td>${esc(v.distrito || "—")}</td><td>${esc(v.con === "Nadie" ? "Sin contacto" : "Con contacto")}</td></tr>`).join("") || `<tr><td colspan="5" class="muted">Sin visitas ese día.</td></tr>`}</tbody></table></div></div>`;
  }
  return ctl + cuerpo + `<details class="ayuda"><summary>Cómo se calcula</summary><div class="ayuda-txt">Los intervalos no representan inactividad. La ventana (primera a última visita del día) no equivale a horas efectivas de trabajo. Con menos de dos visitas no se calculan ventana ni intervalos. Hora Perú.</div></details>`;
}
function barrasFranjas(){
  const fil = S.ejecutivos.map(e => { const l = vivas().filter(v => v.correo === e.correo), n = l.length; return { e, n, p:FRANJAS_REP.map(([, a, b]) => n ? l.filter(v => { const m = horaMin(v); return m >= a && m < b; }).length * 100 / n : 0) }; });
  return fil.map(f => `<div class="franja"><span class="ej">${AVATAR(f.e)}${esc(f.e.nombre)}</span><div class="fbar">${f.p.map((x, i) => x ? `<i style="width:${x}%;background:${FRANJAS_REP[i][3]}" title="${esc(FRANJAS_REP[i][0])}">${Math.round(x)} %</i>` : "").join("")}</div><span class="muted">${f.n} visitas</span></div>`).join("")
    + `<div class="muted" style="font-size:12px;margin-top:8px">${FRANJAS_REP.map(([t, , , c]) => `<span style="display:inline-block;width:10px;height:10px;background:${c};border-radius:2px;margin:0 4px 0 10px"></span>${esc(t)}`).join("")}</div>`;
}
function vistaReporte(){
  const T0 = { act:S.act, base:S.base, baseMap:S.baseMap, hayOrigen:S.hayOrigen }, T = statsDir(T0), per = S.periodo;
  const jj = jornadas(), ventanaTot = jj.reduce((s, j) => s + (j.ventana || 0), 0);
  const prom = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
  const filas = S.ejecutivos.map(e => { const t = statsDir(T0, e.correo), j = jornadas(e.correo), cv = j.filter(x => x.ventana != null);
    return `<tr><td><b>${esc(e.nombre)}</b></td><td class="n num">${t.asig}</td><td class="n num">${t.vis}</td><td class="n num">${t.reg}</td><td class="n num">${t.con}</td><td class="n num">${j.length}</td><td class="n num"><b>${minTxt(cv.reduce((s, x) => s + x.ventana, 0) || null)}</b></td><td class="n num">${minTxt(prom(cv.map(x => x.ventana)))}</td><td class="n num">${relojTxt(prom(cv.map(x => x.ini)))}</td><td class="n num">${relojTxt(prom(cv.map(x => x.fin)))}</td></tr>`; }).join("");
  const kpi = (t, v, s) => `<div class="tile"><div class="k">${t}</div><div class="v num">${v}</div><div class="d">${s}</div></div>`;
  return `<div class="panel"><div class="barra"><b>Reporte de gestión del equipo</b><span class="lbl">Campaña BBVA Adquirencia${per ? " · " + esc(pNom(per)) : ""} · visitas con GPS del CRM de campo · cartera de ${T.asig} comercios</span></div><div style="padding:10px">
    <h3 style="margin:6px 0">1 · Resumen del periodo</h3><div class="resumen">${kpi("Visitas", T.reg, T.vis + " comercios distintos")}${kpi("Con contacto", T.con, (T.reg ? Math.round(T.con * 100 / T.reg) : 0) + " % de las visitas")}${kpi("Ventana acumulada", minTxt(ventanaTot || null), jj.length + " días-ejecutivo con gestión")}</div>
    <h3 style="margin:16px 0 6px">2 · Gestión por ejecutivo</h3><div class="eq-dias"><table class="datos"><thead><tr><th>Ejecutivo</th><th class="n">Asignados</th><th class="n">Visitados únicos</th><th class="n">Visitas</th><th class="n">Con contacto</th><th class="n">Días</th><th class="n">Ventana acumulada</th><th class="n">Ventana diaria</th><th class="n">Inicio prom.</th><th class="n">Cierre prom.</th></tr></thead><tbody>${filas}</tbody></table></div><div class="muted" style="font-size:12px;margin-top:6px">Ventana, inicio y cierre promedio cuentan solo los días con dos o más visitas.</div>
    <h3 style="margin:16px 0 6px">3 · Franjas del día</h3>${barrasFranjas()}</div></div>`;
}
/* Avance acumulado contra lo esperado (26/11): cuántos comercios nuevos lleva cada ejecutivo y dónde debería ir hoy según la meta (la línea naranja sube día hábil a día hábil). */
function esperadoA(metaEj, iso0){
  const p = S.periodo; if (!p) return 0; const H = habiles(); if (!H.total) return 0;
  let n = 0; const d = new Date(p.ini + "T12:00:00Z");
  while (d.toISOString().slice(0, 10) <= iso0){ const s2 = d.toISOString().slice(0, 10), dow = d.getUTCDay(); if (dow >= 1 && dow <= 5 && !FERIADOS.includes(s2)) n++; d.setUTCDate(d.getUTCDate() + 1); }
  return Math.min(metaEj, metaEj * n / H.total);
}
function graficoAcumulado(filas, metaEj){
  // Estilo de la presentación semanal: por día hábil, barras del acumulado del equipo (azul) y de los comercios nuevos del día (naranja),
  // y la línea de lo esperado (meta del equipo repartida por día hábil). Las barras llegan hasta hoy; la línea, hasta el cierre del periodo.
  const p = S.periodo; if (!p) return "";
  const todos = []; { const d = new Date(p.ini + "T12:00:00Z"); while (d.toISOString().slice(0, 10) <= p.fin && todos.length < 40){ const s2 = d.toISOString().slice(0, 10), dow = d.getUTCDay(); if (dow >= 1 && dow <= 5 && !FERIADOS.includes(s2)) todos.push(s2); d.setUTCDate(d.getUTCDate() + 1); } }
  const Ht = todos.length, hoy = hoyISO(), dias = todos.filter(d => d <= hoy), N = dias.length; if (!N) return "";
  const metaT = metaEj * filas.length, espDe = i => metaT * (i + 1) / Ht;
  const acuHasta = iso0 => filas.reduce((t, f) => t + Object.keys(f.porDia).filter(k => k <= iso0).reduce((u, k) => u + f.porDia[k].nuevas, 0), 0);
  const acu = dias.map((d, i) => acuHasta(i === N - 1 ? (hoy < p.fin ? hoy : p.fin) : d)), nue = dias.map((d, i) => acu[i] - (i ? acu[i - 1] : 0)), pasado = dias.map(d => d <= hoy);
  const W = 700, Hc = 340, pl = 40, pr = 16, pt = 28, pb = 44, tope = Math.max(...acu, espDe(N - 1)) * 1.18, unidad = tope > 300 ? 50 : tope > 120 ? 20 : 10, ymax = Math.max(unidad * 2, Math.ceil(tope / unidad) * unidad);
  const gw = (W - pl - pr) / N, bw = Math.max(5, Math.min(28, gw * .36)), y = v => pt + (Hc - pt - pb) * (1 - v / ymax), cx = i => pl + gw * i + gw / 2;
  const paso = ymax > 300 ? 100 : ymax > 120 ? 50 : ymax > 60 ? 20 : 10, ticks = []; for (let t = 0; t <= ymax; t += paso) ticks.push(t);
  const rej = ticks.map(t => `<line x1="${pl}" y1="${y(t).toFixed(1)}" x2="${W - pr}" y2="${y(t).toFixed(1)}" stroke="var(--linea)" ${t ? 'stroke-dasharray="2 4"' : ""}/><text x="${pl - 8}" y="${(y(t) + 3.5).toFixed(1)}" text-anchor="end" font-size="11" fill="var(--muted)">${t}</text>`).join("");
  const etiq = gw >= 28;
  const barras = dias.map((d, i) => { const x1 = cx(i) - bw - 1, x2 = cx(i) + 1, tip = `${fISO(d)}: acumulado ${acu[i]} · nuevos del día ${nue[i]} · esperado ${Math.round(espDe(i))}`;
    return `<g><title>${esc(tip)}</title><rect x="${x1.toFixed(1)}" y="${y(acu[i]).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0, y(0) - y(acu[i])).toFixed(1)}" rx="3" fill="var(--navy-2)"/>`
      + (nue[i] ? `<rect x="${x2.toFixed(1)}" y="${y(nue[i]).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(2, y(0) - y(nue[i])).toFixed(1)}" rx="3" fill="var(--naranja)"/>` : "")
      + (etiq ? `<text x="${(x1 + bw / 2).toFixed(1)}" y="${(y(acu[i]) - 5).toFixed(1)}" text-anchor="middle" font-size="10.5" font-weight="700" fill="var(--ink)">${acu[i]}</text>` + (nue[i] ? `<text x="${(x2 + bw / 2).toFixed(1)}" y="${(y(nue[i]) - 5).toFixed(1)}" text-anchor="middle" font-size="10.5" font-weight="700" fill="var(--naranja)">${nue[i]}</text>` : "") : "") + `</g>`; }).join("");
  const ejeX = dias.map((d, i) => `<text x="${cx(i).toFixed(1)}" y="${Hc - 22}" text-anchor="middle" font-size="11" fill="${d === hoy ? "var(--naranja)" : "var(--muted)"}" font-weight="${d === hoy ? 700 : 400}">${fISO(d)}</text>`).join("");
  const lin = dias.map((d, i) => `${i ? "L" : "M"}${cx(i).toFixed(1)},${y(espDe(i)).toFixed(1)}`).join(" ");
  const hi = dias.indexOf(hoy);
  return `<div class="acu-pie">Meta del equipo en el periodo: <b>${metaT}</b> comercios nuevos en ${Ht} días hábiles · van ${N} · quedan ${Ht - N}.</div><svg class="graf-acu" viewBox="0 0 ${W} ${Hc}" role="img" aria-label="Comercios nuevos por día hábil: acumulado del equipo, nuevos del día y lo esperado según la meta">${rej}${ejeX}${hi >= 0 ? `<text x="${cx(hi).toFixed(1)}" y="${Hc - 6}" text-anchor="middle" font-size="10" font-weight="700" fill="var(--naranja)">hoy</text>` : ""}${barras}<path d="${lin}" fill="none" stroke="var(--naranja)" stroke-width="2.4" stroke-dasharray="7 5" stroke-linejoin="round"/><circle cx="${cx(N - 1).toFixed(1)}" cy="${y(espDe(N - 1)).toFixed(1)}" r="4" fill="var(--naranja)"/><text x="${(cx(N - 1) + 10).toFixed(1)}" y="${(y(espDe(N - 1)) - 8).toFixed(1)}" text-anchor="${N > 3 ? "end" : "start"}" font-size="11" font-weight="700" fill="var(--naranja)">esperado ${Math.round(espDe(N - 1))}</text></svg>`;
}
function equipoPeriodo(){ return conPeriodoElegido(vistaEquipo); }
function vistaEquipo(){
  const dias = diasPeriodo(), H = habiles();
  const metaEj = (S.avance && S.avance[0] && S.avance[0].meta_visitas) || 160;
  const metaDia = H.total ? metaEj / H.total : 8;
  const hoy = hoyISO(), RV = marcarRevisitas(S.act);
  const esNueva = v => RV.rev.get(v.id) === 0 && v.lat != null && !v.fuera_plazo && sumaMeta(v.customer_id);
  const filas = S.ejecutivos.map(e => {
    const todas = S.act.filter(v => v.correo === e.correo), vs = todas.filter(v => v.estado_anul !== "anulada"), porDia = {};
    vs.forEach(v => { const k = iso(v.visitado_en); const o = porDia[k] ||= { nuevas:0, rev:0, n:0, pend:0, tarde:0 }; o.n++;
      if (RV.rev.get(v.id) > 0) o.rev++; else if (esNueva(v)) o.nuevas++; if (estadoDe(v) === "pend") o.pend++; if (v.fuera_plazo) o.tarde++; });
    const nuevas = vs.filter(esNueva), com = nuevas.length, revs = vs.filter(v => RV.rev.get(v.id) > 0);
    const restantes = Math.max(1, H.total - H.antes);
    return { e, porDia, com, reg:vs.length, revs, avance:revs.filter(v => avanceRev(v, RV.ant.get(v.id))).length,
      val: vs.filter(v => estadoDe(v) === "val").length, pend: vs.filter(v => estadoDe(v) === "pend").length, obs: vs.filter(v => estadoDe(v) === "obs").length, anu: todas.length - vs.length,
      contacto: vs.filter(v => v.con !== "Nadie").length, comContacto: new Set(vs.filter(v => v.con !== "Nadie" && v.lat != null && !v.fuera_plazo && sumaMeta(v.customer_id)).map(v => v.customer_id)).size,
      consumos: vs.filter(v => v.decision === "Realizará consumos").length, tarde: vs.filter(v => v.fuera_plazo).length,
      ritmo: H.hastaHoy ? com / H.hastaHoy : 0, necesario: Math.max(0, metaEj - com) / restantes, esperado: metaDia * H.hastaHoy };
  });
  const sum = k => filas.reduce((a, f) => a + f[k], 0);
  const T = { com:sum("com"), reg:sum("reg"), rev:filas.reduce((a, f) => a + f.revs.length, 0), avance:sum("avance") };
  const metaEq = metaEj * filas.length, metaDiaEq = metaDia * filas.length;
  const espHoy = Math.round(esperadoA(metaEj, hoyISO()));
  const ritmoEq = H.hastaHoy ? T.com / H.hastaHoy : 0, necEq = Math.max(0, metaEq - T.com) / Math.max(1, H.total - H.antes);
  const pct = (a, b) => b ? Math.round(a / b * 100) : 0, c1 = x => x.toFixed(1).replace(".", ",");
  const totDia = dias.map(d => filas.reduce((a, f) => a + (f.porDia[d.iso] ? f.porDia[d.iso].nuevas : 0), 0));
  // gráfico: comercios nuevos por día, una barra por ejecutivo contra su meta diaria; la parte clara son las revisitas
  const nEj = Math.max(1, filas.length), pl = 34, pr = 12, pt = 18, pb = 50, Hc = 250;
  const gw = Math.max(92, nEj * 20 + 28), W = 1100, step = (W - pl - pr) / Math.max(1, dias.length);
  const bw = Math.max(1.5, Math.min(30, (step * .74 - (nEj - 1) * 3) / nEj));
  const vmax = Math.max(metaDia, ...filas.flatMap(f => dias.map(d => { const o = f.porDia[d.iso]; return o ? o.nuevas + o.rev : 0; })), 1);
  const ymax = Math.ceil(vmax * 1.18 / 4) * 4, y = n => pt + (Hc - pt - pb) * (1 - n / ymax);
  const ticks = []; for (let t = 0; t <= ymax; t += ymax > 24 ? 8 : 4) ticks.push(t);
  const rejilla = ticks.map(t => `<line x1="${pl}" y1="${y(t).toFixed(1)}" x2="${W - pr}" y2="${y(t).toFixed(1)}" stroke="var(--linea)" stroke-width="1" ${t ? 'stroke-dasharray="2 4"' : ""}/><text x="${pl - 8}" y="${(y(t) + 3.5).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--muted)">${t}</text>`).join("");
  const barras = dias.map((d, i) => { const x0 = pl + step * i + (step - (nEj * bw + (nEj - 1) * 3)) / 2, cx = pl + step * i + step / 2;
    const bs = filas.map((f, k) => { const o = f.porDia[d.iso], n = o ? o.nuevas : 0, r = o ? o.rev : 0, x = x0 + k * (bw + 3);
      const tip = `${f.e.nombre} · ${fISO(d.iso)}: ${n} comercio${n === 1 ? "" : "s"} nuevo${n === 1 ? "" : "s"}${r ? ` + ${r} revisita${r === 1 ? "" : "s"}` : ""} · meta ${Math.round(metaDia)}`;
      const hn = n ? Math.max(2, y(0) - y(n)) : 0, hr = r ? Math.max(2, y(0) - y(r)) : 0;
      return `<g class="b"><rect x="${(x - 1).toFixed(1)}" y="${pt}" width="${(bw + 2).toFixed(1)}" height="${(y(0) - pt).toFixed(1)}" fill="transparent"><title>${esc(tip)}</title></rect>`
        + (n ? `<rect x="${x.toFixed(1)}" y="${(y(0) - hn).toFixed(1)}" width="${bw.toFixed(1)}" height="${hn.toFixed(1)}" rx="3" fill="${f.e.color}" pointer-events="none"/>` : "")
        + (r ? `<rect x="${x.toFixed(1)}" y="${(y(0) - hn - hr).toFixed(1)}" width="${bw.toFixed(1)}" height="${hr.toFixed(1)}" rx="3" fill="${f.e.color}" fill-opacity=".32" stroke="${f.e.color}" stroke-dasharray="3 2" pointer-events="none"/>` : "")
        + ((n || r) && bw >= 11 ? `<text x="${(x + bw / 2).toFixed(1)}" y="${(y(0) - hn - hr - 5).toFixed(1)}" text-anchor="middle" font-size="10.5" font-weight="700" fill="var(--ink)" pointer-events="none">${n}${r ? "+" + r : ""}</text>` : "") + `</g>`; }).join("");
    return `${bs}<text x="${cx.toFixed(1)}" y="${Hc - 32}" text-anchor="middle" font-size="11" fill="${d.iso === hoy ? "var(--naranja)" : "var(--muted)"}" font-weight="${d.iso === hoy ? 700 : 400}">${fISO(d.iso)} ${DOW[d.dow]}</text>
      <text x="${cx.toFixed(1)}" y="${Hc - 16}" text-anchor="middle" font-size="10" fill="var(--muted)">equipo ${totDia[i]} / ${Math.round(metaDiaEq)}</text>`; }).join("");
  const grafico = `<svg class="graf-ej" viewBox="0 0 ${W} ${Hc}" role="img" aria-label="Comercios nuevos por día, una barra por ejecutivo, con la meta diaria de ${Math.round(metaDia)}">
    ${rejilla}<line x1="${pl}" y1="${y(metaDia).toFixed(1)}" x2="${W - pr}" y2="${y(metaDia).toFixed(1)}" stroke="var(--naranja)" stroke-width="2" stroke-dasharray="6 4"/>${barras}</svg>`;
  const celda = (f, d) => { const o = f.porDia[d.iso], n = o ? o.nuevas : 0, r = o ? o.rev : 0; const k = !o ? "c0" : n === 0 ? "c0" : n < metaDia * .5 ? "c1" : n < metaDia ? "c2" : "c3";
    const tip = o ? `${n} nuevos${r ? ` · ${r} revisitas` : ""} · ${o.n} registros${o.pend ? ` · ${o.pend} por validar` : ""}${o.tarde ? ` · ${o.tarde} fuera de plazo (no cuentan)` : ""}` : "sin visitas";
    return `<td class="dia ${k}${d.habil ? "" : " finde"}${d.iso === hoy ? " hoy" : ""}"><button data-ir-dia="${d.iso}" data-ir-ej="${esc(f.e.correo)}" title="${esc(tip)}" ${o ? "" : "disabled"}>${n || (r ? 0 : "·")}${r ? `<small class="rv">+${r} rev.</small>` : ""}${o && o.pend ? `<i class="pd" aria-label="por validar"></i>` : ""}</button></td>`; };
  const filasDia = dias.slice().reverse().map((d, i) => { const ti = dias.length - 1 - i, tr = filas.reduce((a, f) => a + (f.porDia[d.iso] ? f.porDia[d.iso].rev : 0), 0);
    return `<tr><td class="fecha${d.iso === hoy ? " hoy" : ""}${d.habil ? "" : " finde"}"><b>${DOW[d.dow]} ${fISO(d.iso)}</b></td>${filas.map(f => celda(f, d)).join("")}<td class="dia tot${d.iso === hoy ? " hoy" : ""}"><b>${totDia[ti] || "·"}</b>${tr ? `<small class="rv">+${tr} rev.</small>` : ""}</td></tr>`; }).join("");
  const todasRev = filas.flatMap(f => f.revs).sort((a, b) => D(b.visitado_en) - D(a.visitado_en));
  const filaRev = v => { const p = RV.ant.get(v.id), ej = ejDe(v.correo);
    return `<tr><td>${fISO(iso(v.visitado_en))} ${hh(v.visitado_en)}</td><td><span class="ej">${AVATAR(ej)}${esc(nombreCorto(ej.nombre))}</span></td><td>${esc(v.comercio)}<small class="muted" style="display:block">revisita ${RV.rev.get(v.id) + 1}</small></td>
      <td>${p ? esc(comoFue(p)[0]) : "—"}<small class="muted" style="display:block">luego</small>${esc(comoFue(v)[0])}${avanceRev(v, p) ? ` <span class="pill val">avanzó</span>` : ""}</td></tr>`; };
  return `
  <div class="resumen">
    <div class="tile acc"><div class="k">Comercios nuevos visitados</div><div class="v num">${T.com}<small> / ${metaEq}</small></div><div class="d">${pct(T.com, metaEq)} % de la meta del periodo · ${T.reg} registros${notaAnterior(S.act)}</div></div>
    <div class="tile"><div class="k">Días hábiles</div><div class="v num">${H.hastaHoy}<small> de ${H.total}</small></div><div class="d">${pct(H.hastaHoy, H.total)} % del periodo corrido, contando hoy${FERIADOS.some(f => S.periodo && f >= S.periodo.ini && f <= S.periodo.fin) ? " · sin feriados" : ""}</div></div>
    <div class="tile ${ritmoEq >= metaDiaEq ? "ok" : "warn"}"><div class="k">Ritmo del equipo</div><div class="v num">${c1(ritmoEq)}<small> por día</small></div><div class="d">meta ${c1(metaDiaEq)} por día hábil (${c1(metaDia)} por ejecutivo)</div></div>
    <div class="tile ${necEq > metaDiaEq ? "bad" : ""}"><div class="k">Para cerrar en meta</div><div class="v num">${c1(necEq)}<small> por día</small></div><div class="d">en los ${Math.max(0, H.total - H.antes)} días hábiles que quedan, contando hoy</div></div>
    <div class="tile"><div class="k">Revisitas</div><div class="v num">${T.rev}</div><div class="d">${T.avance} lograron avance (contacto o decisión)</div></div>
  </div>
  <div class="panel" style="margin-bottom:16px">
    <div class="barra"><b>Avance acumulado contra lo esperado</b><span class="lbl">comercios nuevos por día hábil · la línea naranja es dónde debería ir el equipo según la meta de ${metaEj} por ejecutivo</span>
      <div class="der leyenda-ej"><span><i style="background:var(--navy-2)"></i>acumulado del equipo</span><span><i style="background:var(--naranja)"></i>nuevos del día</span><span><i class="meta"></i>esperado</span></div></div>
    <div class="acu-fila"><div class="acu-graf">${graficoAcumulado(filas, metaEj)}</div><div class="acu-ej"><div class="acu-tit">Cada ejecutivo contra lo esperado a hoy</div>${filas.map(f => { const esp = espHoy, dif = f.com - esp; return `<span class="chip-ej"><i style="background:${f.e.color}"></i><b>${esc(nombreCorto(f.e.nombre))}</b> ${f.com} <small class="${dif >= 0 ? "ok" : "mal"}">${dif >= 0 ? "+" : "−"}${Math.abs(dif)} vs esperado ${esp}</small></span>`; }).join("")}</div></div>
  </div>
  <details class="mu-det"><summary>Comercios nuevos por día y por ejecutivo</summary><div class="panel" style="margin:0">
    <div class="barra"><b>Comercios nuevos por día y por ejecutivo</b><span class="lbl">solo visitas con ubicación, no anuladas y registradas a tiempo; un comercio es nuevo la primera vez que se visita en el periodo · la parte clara de cada barra son las revisitas</span>
      <div class="der leyenda-ej"><span><i class="meta"></i>meta diaria · ${Math.round(metaDia)} por ejecutivo</span>${filas.map(f => `<span><i style="background:${f.e.color}"></i>${esc(nombreCorto(f.e.nombre))}</span>`).join("")}</div></div>
    <div style="padding:6px 12px 2px;overflow-x:auto">${grafico}</div>
  </div></details>
  <div class="panel" style="margin-bottom:16px">
    <div class="barra"><b>Resumen por ejecutivo</b><span class="lbl">comercios nuevos, ritmo contra la meta, revisitas, contacto y estado de validación</span></div>
    <table class="datos eq-res">
      <thead><tr><th>Ejecutivo</th><th class="n">Comercios nuevos</th><th class="n">Ritmo<br>por día</th><th class="n">Necesita<br>por día</th><th class="n">Revisitas</th><th class="n">Visitas con<br>contacto</th><th class="n">Comercios con<br>contacto</th><th class="n">Realizará<br>consumos</th><th class="n">Fuera de<br>plazo</th><th>Validación</th></tr></thead>
      <tbody>${filas.map(f => `<tr>
        <td><button class="ej-btn" data-ir-dia="periodo" data-ir-ej="${esc(f.e.correo)}"><span class="ej">${AVATAR(f.e)}${esc(f.e.nombre)}</span></button></td>
        <td class="n num"><b>${f.com}</b> <span class="muted">/ ${metaEj}</span><div class="barrita"><i style="width:${Math.min(100, pct(f.com, metaEj))}%"></i><u style="left:${Math.min(100, pct(f.esperado, metaEj))}%" title="donde debería ir hoy"></u></div></td>
        <td class="n num ${f.ritmo >= metaDia ? "ok" : "warn"}">${c1(f.ritmo)}</td><td class="n num ${f.necesario > metaDia ? "mal" : ""}">${c1(f.necesario)}</td>
        <td class="n num">${f.revs.length}<small class="muted" style="display:block">${f.avance} con avance</small></td>
        <td class="n num">${f.contacto}<span class="muted"> / ${f.reg}</span></td><td class="n num">${f.comContacto}</td><td class="n num">${f.consumos}</td>
        <td class="n num ${f.tarde ? "mal" : ""}">${f.tarde}</td>
        <td><span class="mini-estados"><span class="pill val">${f.val}</span><span class="pill pend">${f.pend}</span>${f.obs ? `<span class="pill obs">${f.obs}</span>` : ""}${f.anu ? `<span class="pill anu">${f.anu}</span>` : ""}</span></td></tr>`).join("")}
      <tr class="total"><td><b>Equipo</b></td><td class="n num"><b>${T.com}</b> <span class="muted">/ ${metaEq}</span></td><td class="n num">${c1(ritmoEq)}</td><td class="n num">${c1(necEq)}</td><td class="n num">${T.rev}<small class="muted" style="display:block">${T.avance} con avance</small></td>
        <td class="n num">${sum("contacto")}<span class="muted"> / ${T.reg}</span></td><td class="n num">${sum("comContacto")}</td><td class="n num">${sum("consumos")}</td><td class="n num">${sum("tarde")}</td>
        <td><span class="mini-estados"><span class="pill val">${sum("val")}</span><span class="pill pend">${sum("pend")}</span></span></td></tr></tbody></table>
  </div>
  <details class="mu-det"><summary>Detalle por día y revisitas</summary><div class="eq-2" style="padding:10px">
    <div class="panel">
      <div class="barra"><b>Por día</b><span class="lbl">comercios nuevos de cada día (las revisitas, aparte) · verde: llegó a la meta diaria (${Math.round(metaDia)}) · ámbar: más de la mitad · naranja: menos de la mitad · el punto naranja marca visitas por validar</span></div>
      <div class="eq-dias"><table class="datos matriz"><thead><tr><th>Día</th>${filas.map(f => `<th class="dia">${esc(nombreCorto(f.e.nombre))}</th>`).join("")}<th class="dia">Equipo</th></tr></thead><tbody>${filasDia}</tbody></table></div>
    </div>
    <div class="panel">
      <div class="barra"><b>Revisitas: qué gestión hicieron</b><span class="lbl">${T.rev} en el periodo · el resultado de la visita anterior y el de la revisita</span></div>
      <div class="eq-dias"><table class="datos"><thead><tr><th>Cuándo</th><th>Ejecutivo</th><th>Comercio</th><th>Resultado</th></tr></thead><tbody>${todasRev.map(filaRev).join("") || `<tr><td colspan="4" class="muted">Todavía no hay revisitas en el periodo.</td></tr>`}</tbody></table></div>
    </div>
  </div></details>
  <details class="ayuda"><summary>Cómo se calcula</summary><div class="ayuda-txt">Comercios nuevos = comercios distintos con una visita válida que se hace por primera vez en el periodo, con o sin contacto (el indicador contra ${metaEj}); en un periodo por bloques suma solo la base nueva (igual que el bono). Revisita = una visita posterior a un comercio ya visitado en el periodo: no suma a la meta, pero se registra con su resultado; «avanzó» es pasar de sin contacto a hablar con alguien, o de «aún no decide» a «realizará consumos». Ritmo = comercios nuevos ÷ días hábiles corridos (contando hoy); los feriados no cuentan. Necesita = lo que falta para ${metaEj} ÷ días hábiles que quedan. Visitas con contacto = visitas en que habló con dueño o tercero, sobre todas sus visitas. Fuera de plazo = visitas que llegaron después del siguiente día hábil: se ven, pero no suman. Validación: validadas · por validar · observadas · anuladas.</div></details>`;
}

/* =========================================================================
   Base y bloques · periodo 2026-11 (ESPEC_nueva_estructura_2026-11, sección 3)
   225 comercios por ejecutivo y periodo (origen 'base_nueva') en dos bloques quincenales.
   'base_anterior' va aparte: no es pendiente, pero cuenta si BBVA lo reactiva.
   ========================================================================= */
const GRUPO_UB = { 1:["val","Ubicado al 100 %"], 2:["obs","Rango cercano"], 3:["anu","Requiere búsqueda"] };
async function cargarCierres(){
  if (S.cierres && (!S.cierres.err || Date.now() - (S.cierres.t || 0) < 4000)) return;   // una lectura que falló se vuelve a pedir
  S.cierres = { cargando:true, l:[], cuadre:{} };
  const { data, error } = await sb.rpc("v2_cierres_equipo");
  S.cierres = error ? { err:error.message, l:[], cuadre:{}, t:Date.now() } : { l:data || [], cuadre:{} };
  pintar();
}
async function cargarCuadre(per){
  const C = S.cierres; if (!C || C.cuadre[per]) return;
  C.cuadre[per] = { cargando:true };
  const { data, error } = await sb.rpc("v2_cierre_cuadre", { p_periodo:per });
  C.cuadre[per] = error ? { err:error.message } : { m:new Map((data || []).map(r => [r.correo, r])) };
  pintar();
}
const pctC = v => v == null ? "—" : priv((Math.round(Number(v) * 100) / 100).toFixed(2).replace(".", ",").replace(/,?0+$/, "") + " %");
const solesC = v => v == null ? "—" : priv("S/ " + Number(v).toFixed(2).replace(".", ","));
const alcancesC = r => (r.alcances || []).map(a => `<div class="ci-lin"><span>${esc(a.k)}</span><b>${esc(a.v)}</b></div>`).join("");
function vistaCierres(){
  cargarCierres();
  const C = S.cierres || { cargando:true, l:[] };
  if (C.cargando) return `<div class="panel"><div class="vacio">Leyendo los cierres…</div></div>`;
  if (C.err) return `<div class="panel"><div class="vacio">No se pudieron leer los cierres: ${esc(C.err)}<br><button class="btn" data-reintentar-cierres style="margin-top:10px">Reintentar</button></div></div>`;
  if (!C.l.length) return `<div class="panel"><div class="vacio">Todavía no hay periodos cerrados cargados.</div></div>`;
  const pers = [...new Map(C.l.map(r => [r.periodo, r])).values()].sort((a, b) => String(a.ini).localeCompare(String(b.ini)));
  const enCurso = S.periodo && !pers.some(p => p.periodo === S.periodo.id) ? S.periodo : null;
  const de = (correo, per) => C.l.find(r => r.correo === correo && r.periodo === per);
  const ejs = S.ejecutivos.filter(e => C.l.some(r => r.correo === e.correo));
  const bolsa = correo => C.l.filter(r => r.correo === correo).reduce((n, r) => n + Number(r.retenido_pct || 0), 0);
  const pagado = correo => C.l.filter(r => r.correo === correo).reduce((n, r) => n + Number(r.pagado_pct || 0), 0);
  const fechas = p => `${fISO(p.ini)} al ${fISO(p.fin)}`;
  const nomEj = e => `<span class="ej">${AVATAR(e)}${esc(e.nombre)}</span>`;
  const pieCurso = enCurso ? `<div class="ci-per curso"><span class="t">Periodo en curso</span><span class="f">${fechas(enCurso)} · <span class="pill obs">en curso</span></span><span class="big">—</span><div class="ci-lin"><span>Su avance</span><b>en «Por ejecutivo» e «Indicadores»</b></div></div>` : "";
  // ----- evolutivo de un ejecutivo -----
  if (S.ej !== "todos"){
    const e = S.ejecutivos[0], mios = pers.map(p => de(e && e.correo, p.periodo)).filter(Boolean);
    if (!e || !mios.length) return `<div class="panel"><div class="vacio">Este ejecutivo todavía no tiene periodos cerrados.</div></div>`;
    const mx = Math.max(30, ...mios.map(r => Number(r.incentivo_pct)));
    return `<div class="ci-grid">
      <div class="panel"><div class="barra"><b>El recorrido de ${esc(e.nombre)}, periodo por periodo</b></div><div class="ci-linea">
      ${mios.map(r => `<div class="ci-per"><span class="t">${esc(r.nombre)}</span><span class="f">${fechas(r)} · <span class="pill val">cerrado</span></span>
        <span class="big">${pctC(r.incentivo_pct)}</span><div class="ci-lin"><span>pagado / retenido</span><b>${pctC(r.pagado_pct)} / ${pctC(r.retenido_pct)}</b></div>${alcancesC(r)}
        ${r.detalle && r.detalle.ajuste ? `<div class="ci-nota">${priv(esc(r.detalle.ajuste))}</div>` : ""}</div>`).join("")}${pieCurso}</div>
      <div class="ci-pie">Los indicadores cambian de un periodo a otro cuando cambió el modelo de incentivo: cada periodo se muestra con lo que se midió en su acta.</div></div>
      <div class="panel"><div class="barra"><b>Incentivo y bolsa retenida</b></div><div class="ci-cuerpo">
        <div class="ci-barras">${mios.map(r => `<div class="c"><span class="v">${pctC(r.incentivo_pct)}</span><div class="b r" style="height:${S.ver ? Number(r.retenido_pct) / mx * 130 : 0}px"></div><div class="b" style="height:${S.ver ? Number(r.pagado_pct) / mx * 130 : 0}px"></div><span class="e">${esc(String(r.nombre).split(" ")[0])}</span></div>`).join("")}</div>
        <div class="ci-kpis"><div><b>${pctC(pagado(e.correo))}</b><span>pagado con la remuneración</span></div><div><b>${pctC(bolsa(e.correo))}</b><span>bolsa retenida al cierre del proyecto</span></div></div>
        <div class="ci-pie"><span class="ci-cuad"></span> pagado en el mes &nbsp; <span class="ci-cuad r"></span> retenido · todo en % del sueldo base</div></div></div>
    </div>`;
  }
  // ----- equipo: histórico o detalle de un periodo -----
  const tab = S.cTab || "hist";
  const tabs = `<div class="chips" style="margin-bottom:12px"><button class="chip ${tab === "hist" ? "on" : ""}" data-ctab="hist" aria-pressed="${tab === "hist"}">Histórico del equipo</button>${pers.map(p => `<button class="chip ${tab === p.periodo ? "on" : ""}" data-ctab="${esc(p.periodo)}" aria-pressed="${tab === p.periodo}">${esc(p.nombre)}</button>`).join("")}</div>`;
  if (tab === "hist"){
    const modelos = pers.map(p => { const notas = [...new Set(C.l.filter(r => r.periodo === p.periodo && r.detalle && r.detalle.nota_periodo).map(r => r.detalle.nota_periodo))];
      return `<tr><td><b>${esc(p.nombre)}</b><span class="ci-sub">${fechas(p)}</span></td><td>${esc(p.modelo)}</td><td>${notas.length ? priv(notas.map(esc).join("<br>")) : "—"}</td><td class="n">${p.aprobado_en ? fISO(p.aprobado_en) : "—"}</td></tr>`; }).join("");
    return tabs + `<div class="panel" style="margin-bottom:16px"><div class="barra"><b>Incentivo por periodo · % del sueldo base</b><span class="lbl">arriba el total; abajo pagado / retenido</span></div><div class="tabla-wrap"><table class="datos">
      <thead><tr><th>Ejecutivo</th>${pers.map(p => `<th class="n">${esc(p.nombre)}<span class="ci-sub">${fechas(p)}</span></th>`).join("")}${enCurso ? `<th class="n">En curso<span class="ci-sub">${fechas(enCurso)}</span></th>` : ""}<th class="n">Bolsa retenida</th></tr></thead>
      <tbody>${ejs.map(e => `<tr><td>${nomEj(e)}</td>${pers.map(p => { const r = de(e.correo, p.periodo);
        return `<td class="n num">${r ? `<b>${pctC(r.incentivo_pct)}</b><span class="ci-sub">${pctC(r.pagado_pct)} / ${pctC(r.retenido_pct)}</span>` : "—"}</td>`; }).join("")}${enCurso ? `<td class="n"><span class="pill obs">en curso</span></td>` : ""}<td class="n num"><b>${pctC(bolsa(e.correo))}</b></td></tr>`).join("")}</tbody></table></div>
      <div class="ci-pie">Cada celda es el incentivo firmado en el acta. La bolsa retenida suma lo retenido de cada cierre y se liquida al cerrar el proyecto.</div></div>
      <div class="panel"><div class="barra"><b>Cómo se midió cada periodo</b></div><div class="tabla-wrap"><table class="datos"><thead><tr><th>Periodo</th><th>Modelo</th><th>Ajustes y notas del periodo</th><th class="n">Aprobado</th></tr></thead><tbody>${modelos}</tbody></table></div></div>`;
  }
  const P = pers.find(p => p.periodo === tab) || pers[pers.length - 1], filas = ejs.map(e => ({ e, r:de(e.correo, P.periodo) })).filter(x => x.r);
  const conCuadre = filas.some(x => x.r.detalle && x.r.detalle.visitas_desde);
  if (conCuadre) cargarCuadre(P.periodo);
  const Q = (C.cuadre || {})[P.periodo] || {};
  const cuadra = (crm, acta) => crm == null || acta == null ? `<span class="muted">—</span>` : crm === Number(acta) ? `${crm} · ${acta} <span class="ci-ok" title="Cuadra con el acta">✓<span class="sr">cuadra</span></span>` : `${crm} · ${acta} <span class="ci-dif" title="El registro de hoy no coincide con el acta">≠<span class="sr">no cuadra</span></span>`;
  return tabs + `<div class="panel"><div class="barra"><b>${esc(P.nombre)} · ${fechas(P)}</b><span class="pill val">cerrado${P.aprobado_en ? " · aprobado el " + fISO(P.aprobado_en) : ""}</span>${P.enviado_en ? `<span class="pill">enviado el ${fISO(P.enviado_en)}</span>` : ""}<span class="lbl">${esc(P.modelo)}</span></div><div class="tabla-wrap"><table class="datos">
    <thead><tr><th>Ejecutivo</th><th>Alcances del acta</th>${conCuadre ? `<th class="n">Visitados<br>CRM · acta</th><th class="n">Con contacto<br>CRM · acta</th><th class="n">Reactivados<br>en la lista</th>` : ""}<th class="n">Incentivo</th><th class="n">Pagado / retenido</th><th class="n">Viáticos por reembolsar</th></tr></thead>
    <tbody>${filas.map(({ e, r }) => { const d = r.detalle || {}, q = Q.m ? Q.m.get(e.correo) : null;
      return `<tr><td>${nomEj(e)}${d.ajuste ? `<span class="ci-sub">${priv(esc(d.ajuste))}</span>` : ""}</td><td class="ci-alc">${alcancesC(r)}</td>
      ${conCuadre ? `<td class="n num">${Q.cargando ? "…" : cuadra(q ? q.visitados : null, d.visitados)}</td><td class="n num">${Q.cargando ? "…" : cuadra(q ? q.con_contacto : null, d.con_contacto)}</td><td class="n num">${r.reactivados_lista || "—"}${r.reactivados_ya_facturaban ? `<span class="ci-sub">${r.reactivados_ya_facturaban} ya facturaban</span>` : ""}</td>` : ""}
      <td class="n num"><b>${pctC(r.incentivo_pct)}</b></td><td class="n num">${pctC(r.pagado_pct)} / ${pctC(r.retenido_pct)}</td><td class="n num">${d.viaticos_por_reembolsar == null ? "—" : solesC(d.viaticos_por_reembolsar)}</td></tr>`; }).join("")}</tbody></table></div>
    ${conCuadre ? `<div class="ci-pie">Visitados y con contacto se vuelven a contar en el registro de visitas, con la misma ventana del acta (${fISO(filas[0].r.detalle.visitas_desde)} al ${fISO(filas[0].r.detalle.visitas_hasta)}). Los reactivados no se recalculan: el cierre guarda la lista aprobada, comercio por comercio.${Q.err ? " No se pudo hacer el cuadre: " + esc(Q.err) : ""}</div>` : `<div class="ci-pie">Periodo medido con el CRM anterior: las cifras son las del acta firmada.</div>`}</div>`;
}
document.addEventListener("click", ev => {
  const t = ev.target.closest("[data-ctab]"); if (!t) return;
  S.cTab = t.dataset.ctab; pintar();
});

/* ---------- Ver su celular tal como lo ve él (solo lectura; el celular lo resuelve con ?como=) ---------- */
function abrirCelular(correo){
  cerrarCelular(); if (!correo) return;
  const e = ejDe(correo); S.verCel = correo;
  document.body.insertAdjacentHTML("beforeend", `<div class="velo" id="veloCel" data-cerrar-cel>
    <div class="cel-marco" role="dialog" aria-modal="true" aria-label="Celular de ${esc(e.nombre)}">
      <div class="cel-cab"><span class="ej">${AVATAR(e)}<b>Celular de ${esc(nombreCorto(e.nombre))}</b></span><span class="lbl">tal como lo ve él · solo para mirar, no registra visitas</span><button class="btn q" data-cerrar-cel title="Cerrar">Cerrar</button></div>
      <iframe src="../index.html?como=${encodeURIComponent(correo)}" title="Celular de ${esc(e.nombre)}"></iframe>
    </div></div>`);
  document.querySelector("#veloCel .cel-cab button").focus();
}
function cerrarCelular(){ const v = document.getElementById("veloCel"); if (v) v.remove(); S.verCel = null; }
document.addEventListener("click", ev => {
  const t = ev.target.closest("#btnOjo,#btnCel,[data-ver-cel],[data-cerrar-cel]"); if (!t) return;
  if (t.id === "btnOjo"){ S.ver = !S.ver; pintar(); return; }
  if (t.id === "btnCel"){ abrirCelular(S.ej !== "todos" ? S.ej : null); return; }
  if (t.dataset.verCel){ abrirCelular(t.dataset.verCel); return; }
  if (t.hasAttribute("data-cerrar-cel") && (t.tagName === "BUTTON" || ev.target === t)) cerrarCelular();
});
document.addEventListener("keydown", ev => { if (ev.key === "Escape" && S.verCel) cerrarCelular(); });

/* =========================================================================
   2 · Auditoría
   ========================================================================= */
function vistaAuditoria(){
  return `<div class="tabs">${[["traza","Trazabilidad por visita"],["patrones","Patrones por ejecutivo"],["bbva","Cruce con la data de BBVA"],["recupero","Recupero del POS"]].map(([k,t])=>`<button class="${S.tab===k?"on":""}" data-tab="${k}">${t}</button>`).join("")}</div>
  ${S.tab === "traza" ? traza() : S.tab === "patrones" ? patrones() : S.tab === "recupero" ? cuadroRecupero() : cruceBBVA()}`;
}
function traza(){
  const q = S.busca.trim().toLowerCase();
  const lista = S.act.filter(v => !q || (v.comercio||"").toLowerCase().includes(q) || v.customer_id.includes(q) || docDe(v.customer_id).includes(q) || (v.ruc||"").includes(q) || (v.ejecutivo||"").toLowerCase().includes(q) || (v.distrito||"").toLowerCase().includes(q)).slice(0, 80);
  if (!S.traza || !S.act.find(v=>v.id===S.traza)) S.traza = lista[0]?.id || null;
  const v = S.act.find(x => x.id === S.traza);
  return `<div class="grid2">
    <div class="panel">
      <div class="barra"><div class="buscar" style="flex:1">${ICON.lupa}<input id="qTraza" placeholder="Comercio, documento BBVA, Customer ID, RUC, distrito o ejecutivo" value="${esc(S.busca)}"></div></div>
      <div class="lista" style="max-height:calc(100vh - 300px);overflow:auto">${lista.map(x => `<button class="${S.traza===x.id?"on":""}" data-traza="${x.id}">${AVATAR(ejDe(x.correo))}<div class="t"><b>${esc(x.comercio)}</b><small class="num">${ddhh(x.visitado_en)} · ${esc(docDe(x.customer_id) || x.customer_id)}</small></div>${pill(x)}</button>`).join("") || `<div class="vacio">Sin resultados</div>`}</div>
    </div>
    ${v ? trazaDetalle(v) : `<div class="card"><div class="vacio">Elige una visita.</div></div>`}
  </div>`;
}
function trazaDetalle(v){
  const e = ejDe(v.correo);
  if (!S.trx[v.customer_id]) transacciones(v.customer_id);
  const trx = (S.trx[v.customer_id] || []).filter(t => t.fecha_corte > iso(v.visitado_en) && t.trx > 0);
  const dias = new Set(trx.map(t=>t.fecha_corte)).size;
  const lag = Math.round((D(v.recibido_en) - D(v.visitado_en))/60000);
  const ev = eventos(v); const corr = ev.filter(b => ["resultado","comentario","traslado","ubicacion"].includes(b.accion)).length;
  const c = S.baseMap[v.customer_id] || {};
  const texto = [`Visita ${v.id} · ${v.comercio} (${idTxt(v.customer_id)})`, `Ejecutivo: ${e.nombre}`, `Declarada ${ddhh(v.visitado_en)} · recibida ${ddhh(v.recibido_en)} (+${lag} min)`, `GPS: ${v.lat==null?"sin ubicación":`${v.lat.toFixed(5)}, ${v.lng.toFixed(5)} ±${Math.round(v.precision_m)} m · a ${mDist(v.distancia_m)} del comercio`}`, `Cómo fue: ${comoFue(v).join(" · ")} (base: ${v.con}${v.motivo?" · "+v.motivo:""} · ${v.que}${v.decision?" · "+v.decision:""})`, `Comentario: ${v.comentario||""}`, `Estado: ${ESTADO[estadoDe(v)][1]}${v.validacion_motivo ? " · " + v.validacion_motivo : ""}${v.fuera_plazo ? " · FUERA DE PLAZO (tenía hasta el " + fISO(v.plazo_hasta) + "), no cuenta" : ""}`, "", "Bitácora:", ...ev.map(b => `- ${ddhh(b.en)} · ${b.accion} · ${nomDe(b.por)}${b.antes?` · antes: ${b.antes} · después: ${b.despues}`:b.despues?` · ${b.despues}`:""}`)].join("\n");
  return `<div class="card">
    <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap">
      <div><h2>${esc(v.comercio)} ${pill(v)}</h2><div class="sub">${esc(idTxt(v.customer_id))}${docDe(v.customer_id) ? " · Customer ID " + esc(v.customer_id) : ""}${v.ruc && v.ruc !== docDe(v.customer_id) ? " · RUC " + esc(v.ruc) : ""} · ${esc(v.distrito || "")} · ${esc(e.nombre)}${c.estado ? " · en el CRM: " + esc(c.estado) : ""}</div></div>
      <div style="display:flex;gap:8px"><button class="btn" data-copiar>Copiar como texto</button><button class="btn q" data-ir-cola="${v.id}">Abrir en validación</button></div>
    </div>
    <div class="mini" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">
      <div class="${lag>REGLA.retrasoMin?"med":"ok"}"><b class="num">+${lag} min</b><small>entre la hora declarada (${hh(v.visitado_en)}) y la recepción en el servidor (${hh(v.recibido_en)})</small></div>
      <div class="${claseDist(v)==="ok"?"ok":claseDist(v)==="med"?"med":"mal"}"><b class="num">${mDist(v.distancia_m)}</b><small>del punto del comercio (${esc(v.geo_calidad || "sin punto")}) · GPS ±${v.precision_m != null ? Math.round(v.precision_m) : "—"} m</small></div>
      <div class="${corr?"med":"ok"}"><b class="num">${corr}</b><small>correcciones después del registro</small></div>
      <div class="${dias>=2?"ok":dias===1?"med":""}"><b class="num">${S.trx[v.customer_id] ? dias : "…"}</b><small>día${dias===1?"":"s"} distinto${dias===1?"":"s"} con transacciones después de la visita${c.dias_trx != null ? ` · el CRM cuenta ${c.dias_trx}` : ""}</small></div>
    </div>
    <h3 style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:6px 0 8px">Línea de tiempo completa</h3>
    ${lineaTiempo(v)}
    ${trx.length ? `<h3 style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:10px 0 6px">Transacciones del comercio después de la visita</h3><table class="datos"><thead><tr><th>Fecha de corte</th><th>Formato</th><th class="n">Transacciones</th><th class="n">Volumen S/</th></tr></thead><tbody>${trx.map(t=>`<tr><td class="num">${fISO(t.fecha_corte)}</td><td>${esc(t.formato)}</td><td class="n num">${num(t.trx)}</td><td class="n num">${priv(num(t.vol))}</td></tr>`).join("")}</tbody></table>` : `<div class="aviso" style="margin-top:8px">${S.trx[v.customer_id] ? "Sin transacciones cargadas después de esta visita." : "Buscando transacciones…"} ${v.decision==="Realizará consumos"?"El comercio dijo que consumiría: vale seguirlo en el próximo corte.":""}</div>`}
    <textarea id="trazaTxt" style="position:absolute;left:-9999px" aria-hidden="true">${esc(texto)}</textarea>
  </div>`;
}

function patrones(){
  if (!S.ejecutivos.length) return `<div class="vacio">Sin ejecutivos activos.</div>`;
  return `<div class="cards">${S.ejecutivos.map(e => {
    const vs = S.act.filter(v => v.correo === e.correo && v.estado_anul !== "anulada");
    const hoy = vs.filter(esHoy);
    const dists = vs.map(v=>v.distancia_m).filter(x=>x!=null).sort((a,b)=>a-b);
    const med = dists.length ? dists[Math.floor(dists.length/2)] : null;
    const prec = vs.map(v=>v.precision_m).filter(x=>x!=null).map(Number); const precP = prec.length ? Math.round(prec.reduce((a,b)=>a+b,0)/prec.length) : null;
    const lejos = vs.filter(v=>v.distancia_m==null||v.distancia_m>REGLA.lejos).length;
    const distintos = new Set(vs.map(v=>v.customer_id)).size;
    const porDia = {}; vs.forEach(v => { (porDia[iso(v.visitado_en)] ||= []).push(v); });
    const gaps = []; Object.values(porDia).forEach(l => { l.sort((a,b)=>D(a.visitado_en)-D(b.visitado_en)); for (let i=1;i<l.length;i++) gaps.push(Math.round((D(l[i].visitado_en)-D(l[i-1].visitado_en))/60000)); });
    const gs = gaps.slice().sort((a,b)=>a-b); const gapMin = gs.length ? gs[0] : null, gapMed = gs.length ? gs[Math.floor(gs.length/2)] : null;
    const horas = new Array(14).fill(0); vs.forEach(v => { const h = horaLima(v.visitado_en); if (h>=7 && h<21) horas[h-7]++; });
    const fuera = vs.filter(v => { const h = horaLima(v.visitado_en); return h<REGLA.jornadaIni || h>=REGLA.jornadaFin; }).length;
    const corr = vs.filter(v => v.resultado_editado_en || v.comentario_editado_en).length;
    const obs = vs.filter(v=>estadoDe(v)==="obs").length, val = vs.filter(v=>estadoDe(v)==="val").length;
    const mx = Math.max(1, ...horas);
    const flags = [];
    if (gapMin != null && gapMin < REGLA.ritmoMin) flags.push(["r", `Dos visitas con ${gapMin} min de diferencia. Difícil que sean dos comercios distintos.`]);
    if (lejos) flags.push(["", `${lejos} visita${lejos>1?"s":""} a más de ${REGLA.lejos} m del punto del comercio o sin GPS.`]);
    if (precP != null && precP > 40) flags.push(["", `Precisión promedio del GPS de ±${precP} m. Conviene pedirle que active la ubicación precisa.`]);
    if (vs.length - distintos > 0) flags.push(["", `${vs.length - distintos} registro${vs.length-distintos>1?"s":""} sobre comercios ya visitados (cada comercio cuenta una sola vez).`]);
    if (fuera) flags.push(["", `${fuera} visita${fuera>1?"s":""} fuera de la jornada (antes de las ${REGLA.jornadaIni}:00 o después de las ${REGLA.jornadaFin}:00).`]);
    if (corr) flags.push(["", `${corr} visita${corr>1?"s":""} con corrección después del registro.`]);
    if (!vs.length) flags.push(["", "Sin visitas en el periodo."]);
    if (!flags.length) flags.push(["ok","Sin patrones que revisar. Ritmo y ubicaciones consistentes."]);
    return `<div class="card">
      <h2>${AVATAR(e)}${esc(e.nombre)}</h2><div class="sub">${vs.length} visitas en el periodo, ${hoy.length} hoy · ${val} validada${val===1?"":"s"} · ${obs} observada${obs===1?"":"s"}</div>
      <div class="mini">
        <div class="${med==null?"":med<=REGLA.cerca?"ok":med<=REGLA.lejos?"med":"mal"}"><b class="num">${med==null?"—":mDist(med)}</b><small>distancia mediana al comercio</small></div>
        <div class="${precP==null?"":precP<=20?"ok":precP<=REGLA.precision?"med":"mal"}"><b class="num">±${precP ?? "—"} m</b><small>precisión GPS promedio</small></div>
        <div class="${gapMin==null?"":gapMin<REGLA.ritmoMin?"mal":gapMin<15?"med":"ok"}"><b class="num">${gapMin ?? "—"} min</b><small>mínimo entre visitas (mediana ${gapMed ?? "—"})</small></div>
        <div class="${lejos?"med":"ok"}"><b class="num">${distintos}</b><small>comercios distintos de ${vs.length} registros</small></div>
      </div>
      <div class="hist-h"><svg viewBox="0 0 320 70" role="img" aria-label="Visitas por hora del día">
        ${horas.map((n,i) => { const x = 8 + i*22, h = n ? Math.max(3, n/mx*40) : 0; const fuera2 = i+7 < REGLA.jornadaIni || i+7 >= REGLA.jornadaFin; return `<rect x="${x}" y="${48-h}" width="16" height="${h}" rx="2" fill="${fuera2 && n ? "var(--rojo)" : e.color}" fill-opacity="${n?1:0}"/><rect x="${x}" y="46" width="16" height="2" fill="var(--linea)"/>${n?`<text x="${x+8}" y="${44-h}" text-anchor="middle" font-size="9" fill="var(--texto)">${n}</text>`:""}${i%2===0?`<text x="${x+8}" y="62" text-anchor="middle" font-size="9" fill="var(--muted)">${i+7}h</text>`:""}`; }).join("")}
      </svg></div>
      <div class="flags">${flags.map(([k,t])=>`<div class="${k}"><i></i><span>${esc(t)}</span></div>`).join("")}</div>
    </div>`; }).join("")}</div>`;
}

/* Reactivados BBVA vs. comisión (09/10/2026). BBVA reporta el comercio reactivado; al ejecutivo le cuenta solo si, después de su
   primera visita válida con contacto, transacciona en 2 días distintos (v2_dias_trx, que da c.dias_trx). Sin data diaria se separa
   «Por confirmar» (se movió en el corte que incluye el día de la visita) de «Solo antes de la visita». */
const diaLimaE = x => D(x).toLocaleDateString("en-CA", { timeZone:"America/Lima" });
async function cargarComision(){
  S.trxCom = [];
  const meses = S.periodo ? [...new Set([S.periodo.ini, S.periodo.fin].map(d => String(d).slice(0, 7)))] : null;
  let q = sb.from("v2_transacciones").select("customer_id,fecha_corte,mes,formato,trx"); if (meses) q = q.in("mes", meses);
  const [t] = await Promise.all([q, S.seg ? null : cargarSeguimientos()]);
  S.trxCom = t && !t.error ? (t.data || []) : []; pintar();
}
function clasificarComision(c, d1, cortes){
  if (!d1) return "sincontacto";
  if ((c.dias_trx || 0) >= 2) return "cuenta";
  if (c.dias_trx === 1) return "uno";
  if (!cortes.length) return "sindata";
  const grupos = {}; cortes.forEach(t => { const k = t.mes + "|" + t.formato; (grupos[k] = grupos[k] || []).push(t); });
  let antes = false;
  for (const l of Object.values(grupos)){
    l.sort((a, b) => String(a.fecha_corte).localeCompare(String(b.fecha_corte)));
    l.forEach((t, i) => {
      const diario = t.formato === "diario";
      const prev = diario ? diaLimaE(Date.parse(t.fecha_corte + "T12:00:00Z") - 864e5) : i ? l[i - 1].fecha_corte : diaLimaE(Date.parse(t.mes + "-01T12:00:00Z") - 864e5);
      const delta = diario ? t.trx : t.trx - (i ? l[i - 1].trx : 0);
      if (delta <= 0) return;
      if (prev < d1 && d1 <= t.fecha_corte) t._conf = true; else if (t.fecha_corte < d1) antes = true;
    });
    if (l.some(t => t._conf)) return "confirmar";
  }
  return antes ? "antes" : "sindata";
}
function filasComision(){
  const pv = {};   // primera visita válida con contacto
  (S.act || []).forEach(v => { if (v.estado_anul === "anulada" || v.con === "Nadie" || v.lat == null || v.fuera_plazo) return;
    const d = diaLimaE(v.visitado_en); if (!pv[v.customer_id] || d < pv[v.customer_id]) pv[v.customer_id] = d; });
  const trx = {}; (S.trxCom || []).forEach(t => { (trx[t.customer_id] = trx[t.customer_id] || []).push(t); });
  return (S.base || []).filter(c => c.bbva_reactivado).map(c => {
    const d1 = pv[c.customer_id] || null;
    return { c, d1, est: clasificarComision(c, d1, trx[c.customer_id] || []), cont: (S.seg || []).some(x => x.customer_id === c.customer_id && /^Respondió/.test(x.resultado || "") && diaLimaE(x.hecho_en) >= c.bbva_reactivado) };
  });
}
function cuadroComision(){
  if (S.trxCom === undefined){ cargarComision(); return `<div class="panel"><div class="barra"><b>Reactivados BBVA vs. comisión</b><span class="lbl">Cargando transacciones…</span></div></div>`; }
  const fs = filasComision(); if (!fs.length) return "";
  const COL = [["cuenta","Cuentan"],["uno","Falta 1 día"],["confirmar","Por confirmar"],["antes","Solo antes de la visita"],["sincontacto","Sin visita con contacto"],["sindata","Sin data"]];
  const PILL = { cuenta:"val", uno:"obs", confirmar:"obs", antes:"pend", sincontacto:"anu", sindata:"pend" };
  const fila = (nom, l) => `<tr><td>${nom}</td><td class="n num">${l.length}</td>${COL.map(([k]) => `<td class="n num">${l.filter(f => f.est === k).length}</td>`).join("")}<td class="n num">${l.filter(f => f.cont).length}</td></tr>`;
  const ejs = [...new Set(fs.map(f => f.c.correo))].sort();
  const det = [...fs].sort((a, b) => COL.findIndex(x => x[0] === a.est) - COL.findIndex(x => x[0] === b.est));
  return `<div class="panel"><div class="barra"><b>Reactivados BBVA vs. comisión</b><span class="lbl">BBVA reporta el reactivado; para la comisión cuenta si transacciona en 2 días distintos después de la primera visita válida con contacto.</span></div>
  <div style="overflow:auto"><table class="datos"><thead><tr><th>Ejecutivo</th><th class="n">Reactivados BBVA</th>${COL.map(([, t]) => `<th class="n">${t}</th>`).join("")}<th class="n">Contactados</th></tr></thead><tbody>
    ${ejs.map(e => fila(`<span class="ej">${AVATAR(ejDe(e))}${esc(nombreCorto(ejDe(e).nombre))}</span>`, fs.filter(f => f.c.correo === e))).join("")}
    ${fila("<b>Total</b>", fs)}
  </tbody></table></div>
  <details style="margin-top:8px"><summary>Detalle por comercio (${fs.length})</summary><div style="overflow:auto"><table class="datos"><thead><tr><th>Comercio</th><th>Ejecutivo</th><th>Primera visita con contacto</th><th class="n">Días con trx</th><th>Estado</th><th>Contactado</th></tr></thead><tbody>
    ${det.map(f => `<tr><td class="com"><b>${esc(f.c.nombre_comercial || f.c.razon_social || "")}</b><small>${esc(idTxt(f.c.customer_id))}</small></td><td>${esc(nombreCorto(ejDe(f.c.correo).nombre))}</td><td class="num">${fISO(f.d1)}</td><td class="n num">${f.c.dias_trx || 0}</td><td><span class="pill ${PILL[f.est]}">${COL.find(x => x[0] === f.est)[1]}</span></td><td>${f.cont ? "Sí" : "—"}</td></tr>`).join("")}
  </tbody></table></div></details></div>`;
}
/* Recupero del POS (09/10/2026): lo que hizo cada ejecutivo con los comercios que desistieron. Jose valida u observa. */
async function cargarRecupero(){
  S.recups = []; S.recupSigue = []; S.recupErr = "";
  const [a, b] = await Promise.all([sb.rpc("v2_mis_recuperos", S.periodo ? { p_periodo: S.periodo.id } : {}), (() => { let q = sb.from("v2_recuperos").select("customer_id,correo,paso,validado_en").eq("paso", "sigue"); if (S.periodo) q = q.eq("periodo", S.periodo.id); return q; })()]);
  S.recupErr = a && a.error ? a.error.message : ""; S.recups = a && !a.error ? (a.data || []) : []; S.recupSigue = b && !b.error ? (b.data || []).filter(x => x.validado_en) : [];   // los que siguen con el POS ya validados (los por validar vienen en v2_mis_recuperos) pintar();
}
const RECUP_COL = [["llamar","Llamar a Soporte"],["tramite","En trámite"],["entregado","Entregado (por validar)"],["validado","Validado"],["trabado","Trabado"]];
const RECUP_NOM = Object.assign(Object.fromEntries(RECUP_COL), { sigue:"Sigue con el POS (por validar)", cambio:"Cerrado por cambio de visita" });
const recupLento = x => ["llamar","tramite","trabado"].includes(x.paso) && Date.now() - D(x.actualizado_en) > 7 * 864e5;
function cuadroRecupero(){
  if (S.recups === undefined){ cargarRecupero(); return `<div class="panel"><div class="barra"><b>Recupero del POS</b><span class="lbl">Cargando…</span></div></div>`; }
  const l = S.recups || [], sg = S.recupSigue || [];
  const ejs = [...new Set(l.map(x => x.correo).concat(sg.map(x => x.correo)))].sort();
  const fila = (nom, xs, ss) => `<tr><td>${nom}</td><td class="n num">${xs.length + ss.length}</td>${RECUP_COL.map(([k]) => `<td class="n num">${xs.filter(x => x.paso === k).length}</td>`).join("")}<td class="n num">${xs.filter(x => x.paso === "sigue").length + ss.length}</td><td class="n num">${xs.filter(x => x.paso === "cambio").length}</td><td class="n num">${xs.filter(recupLento).length}</td></tr>`;
  const ord = { trabado:0, entregado:1, sigue:2, llamar:3, tramite:4, cambio:5, validado:6 };
  const det = [...l].sort((a, b) => (ord[a.paso] - ord[b.paso]) || (D(a.actualizado_en) - D(b.actualizado_en)));
  const nom = cid => { const c = S.baseMap[cid] || {}; return c.nombre_comercial || c.razon_social || (l.find(x => x.customer_id === cid) || {}).comercio || ""; };
  // Validar / Observar actúan sobre el periodo en curso: mirando un periodo anterior, solo se lee
  const hoy = diaLimaE(Date.now()), enCurso = !S.periodo || (String(S.periodo.ini) <= hoy && hoy <= String(S.periodo.fin));
  const dias = x => Math.floor((Date.now() - D(x.actualizado_en)) / 864e5);
  return `<div class="panel"><div class="barra"><b>Recupero del POS</b><span class="lbl">Comercios que desistieron. El ejecutivo no recoge el equipo: llama a Soporte de Openpay y marca cada paso. Tú validas la entrega.</span></div>
  <div style="overflow:auto"><table class="datos"><thead><tr><th>Ejecutivo</th><th class="n">Casos</th>${RECUP_COL.map(([, t]) => `<th class="n">${t}</th>`).join("")}<th class="n">Sigue con el POS</th><th class="n">Cerrado por cambio de visita</th><th class="n">Más de 7 días sin avance</th></tr></thead><tbody>
    ${ejs.map(e => fila(`<span class="ej">${AVATAR(ejDe(e))}${esc(nombreCorto(ejDe(e).nombre))}</span>`, l.filter(x => x.correo === e), sg.filter(x => x.correo === e))).join("")}
    ${fila("<b>Total</b>", l, sg)}
  </tbody></table></div>
  ${det.length ? `<div style="overflow:auto;margin-top:10px"><table class="datos"><thead><tr><th>Comercio</th><th>Ejecutivo</th><th>Paso</th><th class="n">Días sin avance</th><th class="n">Llamadas sin respuesta</th><th>Caso de Soporte</th><th>Lo último</th><th></th></tr></thead><tbody>
    ${det.map(x => { const u = (x.historial || []).at(-1); return `<tr><td class="com"><b>${esc(nom(x.customer_id))}</b><small>${esc(idTxt(x.customer_id))}</small></td><td>${esc(nombreCorto(ejDe(x.correo).nombre))}</td>
      <td><span class="pill ${x.paso === "validado" ? "val" : x.paso === "trabado" || x.paso === "cambio" ? "anu" : x.paso === "entregado" || x.paso === "sigue" ? "obs" : "pend"}">${RECUP_NOM[x.paso] || x.paso}</span></td>
      <td class="n num ${recupLento(x) ? "mal" : ""}">${dias(x)}</td><td class="n num">${x.intentos || 0}</td><td>${esc(x.caso_soporte || "—")}</td>
      <td>${u ? `${fISO(diaLimaE(u.en))} · ${esc(u.detalle || u.accion)}${u.nota ? " · " + esc(u.nota) : ""}` : "Sin acciones todavía"}</td>
      <td>${enCurso && (x.paso === "entregado" || x.paso === "sigue") ? `<button class="btn mini" data-recup-validar="${esc(x.customer_id)}">Validar</button> <button class="btn mini sec" data-recup-observar="${esc(x.customer_id)}">Observar</button>` : ""}</td></tr>`; }).join("")}
  </tbody></table></div>` : `<div class="aviso" style="margin-top:8px">${S.recupErr ? "No se pudo leer el recupero: " + esc(S.recupErr) : "No hay comercios en recupero en el periodo."}</div>`}</div>`;
}
async function validarRecupero(cid, valido){
  let nota = null;
  if (!valido){ nota = prompt("¿Por qué observas este recupero? Si estaba entregado vuelve a «En trámite»; si seguía con el POS, vuelve a «Llamar a Soporte» (mínimo 10 caracteres):", ""); if (nota === null) return; nota = nota.trim(); }
  const { error } = await sb.rpc("v2_validar_recupero", { p_customer_id: cid, p_valido: valido, p_nota: nota });
  if (error){ toast("No se guardó: " + error.message); return; }
  toast(valido ? "Recupero validado." : "Recupero observado: vuelve al ejecutivo."); cargarRecupero();
}
function cruceBBVA(){
  const cand = S.act.filter(v => v.estado_anul !== "anulada" && v.con !== "Nadie" && v.que === "Reunión concretada").sort((a,b)=>D(a.visitado_en)-D(b.visitado_en));
  const hayTrx = S.base.some(c => c.dias_trx != null && c.dias_trx > 0);
  const ultCarga = S.cargas.find(g => g.tipo === "transacciones");
  const filas = cand.map(v => { const c = S.baseMap[v.customer_id] || {}; const dias = c.dias_trx || 0; const est = c.estado === "rea" || dias >= 2 ? "conf" : dias === 1 ? "cand" : c.estado === "can" ? "can" : "sin"; return { v, dias, est, c }; });
  const cnt = k => filas.filter(f=>f.est===k).length;
  const PILL = { conf:`<span class="pill val">Reactivado confirmado</span>`, cand:`<span class="pill obs">Candidato · falta 1 día</span>`, sin:`<span class="pill pend">Sin transacciones</span>`, can:`<span class="pill anu">Cancelado</span>` };
  return `${cuadroComision()}<div class="resumen" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr))">
    <div class="tile ok"><div class="k">Reactivados confirmados</div><div class="v num">${cnt("conf")}</div><div class="d">POS con 2 días distintos después de la visita</div></div>
    <div class="tile warn"><div class="k">Candidatos</div><div class="v num">${cnt("cand")}</div><div class="d">un día con transacciones, falta el segundo</div></div>
    <div class="tile"><div class="k">Sin transacciones</div><div class="v num">${cnt("sin")}</div><div class="d">reunión concretada, el POS no se movió</div></div>
    <div class="tile ${hayTrx ? "" : "bad"}"><div class="k">Data de BBVA</div><div class="v">${hayTrx ? "cargada" : "sin cargar"}</div><div class="d">${ultCarga ? `última carga ${ddhh(ultCarga.en)} · corte ${fISO(ultCarga.fecha_corte)}` : "no hay transacciones del periodo: nadie puede reactivar"}</div></div>
  </div>
  <div class="panel"><div class="barra"><b>Reuniones concretadas y lo que hizo el POS después</b><span class="lbl">Reactivado = transacciona en dos días distintos después de la visita. Lo confirma la data, no el ejecutivo.</span></div>
  <div style="overflow:auto"><table class="datos"><thead><tr><th>Visita</th><th>Ejecutivo</th><th>Comercio</th><th>Lo que dijo</th><th class="n">Días con trx</th><th>Estado</th></tr></thead><tbody>
    ${filas.map(f => `<tr><td class="num">${ddhh(f.v.visitado_en)}</td><td><span class="ej">${AVATAR(ejDe(f.v.correo))}${esc(nombreCorto(ejDe(f.v.correo).nombre))}</span></td><td class="com"><b>${esc(f.v.comercio)}</b><small>${esc(idTxt(f.v.customer_id))}</small></td><td>${esc(f.v.decision||"—")}</td><td class="n"><span class="puntos"><i class="${f.dias>=1?(f.dias>=2?"on":"mid"):""}"></i><i class="${f.dias>=2?"on":""}"></i></span> <span class="num">${f.dias}</span></td><td>${PILL[f.est]}</td></tr>`).join("") || `<tr><td colspan="6" class="vacio">Todavía no hay reuniones concretadas en el periodo.</td></tr>`}
  </tbody></table></div></div>`;
}

/* =========================================================================
   3 · Cargas
   ========================================================================= */
const TIPOS = {
  diario: { t:"Transacciones diarias", d:"Una fila por comercio y día: cuántas transacciones hubo ese día. Es la carga que confirma las reactivaciones.", ej:"2026-09-24,41000123,4,312.50" },
  acumulado_mes: { t:"Acumulado del mes por corte", d:"Una fila por comercio y fecha de corte con el acumulado del mes. El CRM cuenta un día cuando el acumulado sube.", ej:"2026-09-24,41000123,38,4120.00" },
  totales_bbva: { t:"Totales de BBVA por corte", d:"Lo que ves en el drive de BBVA: reactivados, facturación y transacciones por grupo. Se tipea, sin archivo. Es lo que usa la presentación.", ej:"" },
  resultados_bbva: { t:"Resultados de BBVA (reactivación)", d:"Tu Excel de BBVA: una fila por comercio (RUC, DNI o Customer ID) con gestión con contacto, reactivado y, si lo tienes, el monto facturado. Solo lo ves tú.", ej:"00000001,Si,Si,12500.00" },
};
const COLS = ["fecha_corte","customer_id","trx","vol"];
const ALIAS = { fecha_corte:["fecha_corte","fecha","fecha corte","corte","date","fec_corte"], customer_id:["customer_id","customer id","customerid","cid","cliente","codigo","código","id","documento","documento_bbva2","ruc","dni","nro_documento","nro documento","numero_documento","ruc_dni","ruc/dni"], trx:["trx","transacciones","nro_trx","n_trx","cantidad","operaciones","txs"], vol:["vol","volumen","monto","importe","facturacion","facturación","venta","amount"] };
function vistaCargas(){
  if (!S.cargas.length && !S._cargasPedidas){ S._cargasPedidas = true; cargarCargas(); }
  const c = S.carga, tp = TIPOS[c.tipo];
  const paso = c.hecho ? 3 : c.filas ? 2 : 1, tot = c.tipo === "totales_bbva";
  return `
  <div class="barra-sec">Cargar data de BBVA</div>
  ${tot ? "" : `<div class="pasos"><span class="${paso>1?"ok":"on"}"><i>1</i> Elegir el formato y subir el archivo</span>› <span class="${paso===2?"on":paso>2?"ok":""}"><i>2</i> Revisar la validación</span>› <span class="${paso===3?"on":""}"><i>3</i> Cargar y ver el efecto</span></div>`}
  <div class="tipos">${Object.entries(TIPOS).map(([k,t]) => `<button class="tipo ${c.tipo===k?"on":""}" data-tipo="${k}"><span class="ico">${ICON.carga}</span><span><b>${t.t}</b><small>${t.d}</small></span></button>`).join("")}</div>
  ${tot ? formTotales() : ""}
  ${!tot && paso === 1 ? `
  <div class="drop" id="drop"><input type="file" id="archivo" accept=".csv,.txt,.xlsx,.xls"><b>Arrastra aquí el archivo de ${tp.t.toLowerCase()}</b>CSV o Excel. Nada se escribe en la base hasta que confirmes en el paso 3.<div style="margin-top:12px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap"><button class="btn p" id="elegir">Elegir archivo</button></div>
    <div class="formato">${c.tipo === "resultados_bbva" ? COLS_BBVA.map(col => `<div><code>${col}</code>${FORMATO_BBVA[col]}</div>`).join("")
      : COLS.map(col => `<div><code>${col}</code>${({fecha_corte:"AAAA-MM-DD (también DD/MM/AAAA)",customer_id:"RUC (11 dígitos), DNI o Customer ID de BBVA; si Excel quitó los ceros de la izquierda, se completan",trx:"entero",vol:"decimal con punto (opcional)"})[col]}</div>`).join("")}</div>
    <div style="margin-top:10px;font-size:11.5px;color:var(--muted)">La primera fila lleva los nombres de columna. Se aceptan sinónimos (fecha, cliente, transacciones, monto…). Ejemplo: <code style="font-family:ui-monospace,Menlo,Consolas,monospace">${tp.ej}</code></div></div>` : ""}
  ${!tot && paso === 2 ? (c.tipo === "resultados_bbva" ? previaBBVA() : previa()) : ""}
  ${!tot && paso === 3 ? (c.tipo === "resultados_bbva" ? resultadoBBVA() : resultadoCarga()) : ""}
  <div class="panel" style="margin-top:16px"><div class="barra"><b>Historial de cargas</b><span class="lbl">cada carga queda con quién, cuándo y qué cambió</span></div>
  <div style="overflow:auto"><table class="datos"><thead><tr><th>Fecha</th><th>Tipo</th><th>Archivo</th><th>Formato</th><th class="n">Filas</th><th>Corte</th><th>Por</th><th>Notas</th></tr></thead><tbody>
  ${S.cargas.map(g => `<tr><td class="num">${ddhh(g.en)}</td><td>${esc(g.tipo)}</td><td><code style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11.5px">${esc(g.archivo || "")}</code></td><td>${esc(g.formato || "—")}</td><td class="n num">${num(g.filas)}</td><td class="num">${g.fecha_corte ? fISO(g.fecha_corte) : "—"}</td><td>${esc((g.por||"").split("@")[0])}</td><td style="font-size:11.5px;color:var(--muted)">${esc(g.notas || "")}</td></tr>`).join("") || `<tr><td colspan="8" class="vacio">Sin cargas todavía.</td></tr>`}
  </tbody></table></div></div>`;
}
function normalizar(h){ return String(h || "").trim().toLowerCase().replace(/^﻿/, "").replace(/[\s\-]+/g, "_"); }
function mapear(cab){
  const ix = {};
  COLS.forEach(col => { ix[col] = cab.findIndex(h => ALIAS[col].map(normalizar).includes(normalizar(h))); });
  return ix;
}
function fechaNorm(s){
  s = String(s || "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);
  let m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/); if (m) return `${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  if (/^\d{5}$/.test(s)){ const d = new Date(Date.UTC(1899, 11, 30) + Number(s)*86400000); return d.toISOString().slice(0,10); }
  return s;
}
function validar(cab, filas){
  const ix = mapear(cab);
  const faltan = COLS.filter(c => c !== "vol" && ix[c] < 0);
  const vistos = new Set(); const res = [];
  const per = S.periodo;
  filas.forEach((f, n) => {
    const err = [];
    const id = idDeBBVA(f[ix.customer_id]), cid = id.cid || String(f[ix.customer_id] ?? "").trim(), doc = id.doc || null;
    const fecha = fechaNorm(f[ix.fecha_corte]);
    const trx = String(f[ix.trx] ?? "").trim().replace(/\.0$/, "");
    const vol = ix.vol >= 0 ? String(f[ix.vol] ?? "").trim().replace(",", ".") : "";
    if (ix.customer_id >= 0 && id.err) err.push("documento o customer_id " + id.err);
    if (ix.fecha_corte >= 0){ if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || isNaN(Date.parse(fecha))) err.push("fecha_corte no es una fecha"); else if (per && (fecha < per.ini || fecha > hoyISO())) err.push(fecha > hoyISO() ? "fecha futura" : `fecha anterior al periodo (${fISO(per.ini)})`); }
    if (ix.trx >= 0 && !/^\d+$/.test(trx)) err.push("trx no es un entero");
    if (vol !== "" && isNaN(parseFloat(vol))) err.push("vol no es numérico");
    const llave = `${fecha}|${cid}`; if (vistos.has(llave)) err.push("fila duplicada (mismo comercio y fecha)"); vistos.add(llave);
    res.push({ n:n+2, cid, doc, fecha, trx, vol, err });
  });
  return { faltan, ix, cab, res, ok: res.filter(r=>!r.err.length).length };
}
function previa(){
  const c = S.carga, tp = TIPOS[c.tipo], v = c.filas;
  const malas = v.res.filter(r => r.err.length);
  const tipos = {}; malas.forEach(r => r.err.forEach(e => { tipos[e] = (tipos[e]||0)+1; }));
  return `<div class="panel previa"><div class="barra"><b>${esc(c.archivo)}</b><span class="lbl">${tp.t} · ${v.res.length} filas leídas · columnas: ${v.cab.map(esc).join(", ")}</span><div class="der"><button class="btn" id="otroArchivo">Elegir otro archivo</button><button class="btn p ${S.ocupado?"cargando-btn":""}" id="cargar" ${v.ok===0||v.faltan.length?"disabled":""}>Cargar ${v.ok} filas válidas</button></div></div>
    <div style="padding:12px">
    ${v.faltan.length ? `<div class="aviso mal">No encuentro las columnas <b>${v.faltan.join(", ")}</b>. Revisa la primera fila del archivo (se aceptan sinónimos como fecha, cliente, transacciones).</div>` : ""}
    <div class="checks">
      <div class="check ok"><i>✓</i><div><b class="num">${v.ok}</b><small>filas válidas</small></div></div>
      <div class="check ${malas.length?"mal":"ok"}"><i>${malas.length?"!":"✓"}</i><div><b class="num">${malas.length}</b><small>filas con error (no se cargan)</small></div></div>
      ${Object.entries(tipos).map(([e,n]) => `<div class="check warn"><i>${n}</i><div><b style="font-size:12px">${esc(e)}</b><small>filas afectadas</small></div></div>`).join("")}
    </div>
    <div class="aviso">Formato <b>${c.tipo === "diario" ? "diario" : "acumulado del mes"}</b>. Si una fila ya existía para el mismo comercio y fecha de corte, se reemplaza. Al terminar se recalculan los reactivados y los ejecutivos lo ven en «Mi avance».</div>
    <div style="overflow:auto;margin-top:12px"><table class="datos"><thead><tr><th>Fila</th>${COLS.map(k=>`<th>${k}</th>`).join("")}<th>Problema</th></tr></thead><tbody>
      ${[...malas, ...v.res.filter(r=>!r.err.length).slice(0,8)].slice(0,40).map(r => `<tr class="${r.err.length?"err":""}"><td class="num">${r.n}</td><td class="num">${esc(r.fecha)}</td><td class="num">${esc(r.cid)}</td><td class="num">${esc(r.trx)}</td><td class="num">${esc(r.vol)}</td><td style="color:${r.err.length?"var(--rojo-txt)":"var(--verde-txt)"}">${r.err.length?esc(r.err.join(" · ")):"ok"}</td></tr>`).join("")}
    </tbody></table></div>
    <div style="font-size:11.5px;color:var(--muted);margin-top:6px">Primero las filas con error (hasta 40) y luego una muestra de las válidas.</div>
    </div></div>`;
}
function resultadoCarga(){
  const c = S.carga, r = c.resultado || {}, tp = TIPOS[c.tipo];
  const det = r.detalle || [];
  return `<div class="panel"><div style="padding:22px;display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap">
    <div class="check ok" style="border:0;padding:0"><i style="width:40px;height:40px;font-size:18px">✓</i></div>
    <div style="flex:1;min-width:240px"><h2 style="font-size:16px">Carga hecha: ${num(r.insertadas)} filas nuevas y ${num(r.actualizadas)} actualizadas de ${tp.t.toLowerCase()}</h2>
      <div class="sub" style="margin:4px 0 10px">${esc(c.archivo)} · carga n.º ${r.carga_id} · corte ${r.fecha_corte ? fISO(r.fecha_corte) : "—"} · ${num(r.rechazadas)} rechazadas por la base.</div>
      <div class="aviso ok">Los reactivados ya se recalcularon. Revisa el cruce con BBVA para ver quién confirmó.</div>
      ${det.length ? `<div style="overflow:auto;margin-top:10px"><table class="datos"><thead><tr><th>Fila</th><th>Motivo</th></tr></thead><tbody>${det.slice(0,50).map(d=>`<tr class="err"><td class="num">${d.fila}</td><td>${esc(d.motivo)}</td></tr>`).join("")}</tbody></table></div>` : ""}
      <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn p" id="otraCarga">Nueva carga</button><button class="btn" data-vista="auditoria" data-tab="bbva">Ver el cruce con BBVA</button></div>
    </div></div></div>`;
}
function leerArchivo(f){
  const tipo = S.carga.tipo;
  const fin = (cab, filas) => { S.carga = { tipo, archivo:f.name, filas:tipo === "resultados_bbva" ? validarBBVA(cab, filas) : validar(cab, filas), hecho:false, resultado:null,
    corte:ayerISO(), facturadoTotal:"" }; pintar(); };
  if (/\.xlsx?$/i.test(f.name)){
    if (!window.XLSX){ toast("No se pudo leer el Excel en este navegador. Exporta la hoja como CSV."); return; }
    const r = new FileReader(); r.onload = () => { const wb = XLSX.read(new Uint8Array(r.result), { type:"array" }); const ws = wb.Sheets[wb.SheetNames[0]]; const rows = XLSX.utils.sheet_to_json(ws, { header:1, raw:false, defval:"" }).filter(x => x.some(c => String(c).trim() !== "")); fin(rows[0].map(String), rows.slice(1)); }; r.readAsArrayBuffer(f);
  } else {
    const r = new FileReader(); r.onload = () => { const p = parseCSV(String(r.result)); fin(p.cab, p.filas); }; r.readAsText(f);
  }
}
function parseCSV(txt){
  const lineas = txt.split(/\r?\n/).filter(l => l.trim());
  const sep = (lineas[0].match(/;/g)||[]).length > (lineas[0].match(/,/g)||[]).length ? ";" : (lineas[0].includes("\t") ? "\t" : ",");
  const cel = l => l.split(sep).map(s => s.trim().replace(/^"|"$/g,""));
  return { cab: cel(lineas[0]), filas: lineas.slice(1).map(cel) };
}
async function cargarFilas(){
  const c = S.carga, v = c.filas;
  const filas = v.res.filter(r => !r.err.length).map(r => ({ fecha_corte:r.fecha, documento:r.doc, customer_id:r.cid, trx:r.trx, vol: r.vol === "" ? null : r.vol }));
  S.ocupado = true; pintar();
  try {
    const { data, error } = await sb.rpc("v2_cargar_transacciones", { p_archivo:c.archivo, p_formato:c.tipo, p_filas:filas, p_notas:`${v.res.length} filas en el archivo, ${v.res.length - v.ok} descartadas antes de cargar` });
    if (error) throw error;
    c.resultado = data; c.hecho = true; S.trx = {};
    await Promise.all([cargarBase(), cargarCargas()]);
    toast("Carga hecha.");
  } catch(e){ toast("No se pudo cargar: " + (e.message || e)); }
  S.ocupado = false; pintar();
}

// Base 2026-11: BBVA reporta por RUC o DNI. Hace lo mismo que v2_comercio_de_id en el servidor: 11 dígitos = RUC;
// hasta 8 = se completa con ceros (Excel quita el cero del DNI) y se busca como Customer ID o como DNI; lo ambiguo no se adivina.
function idDeBBVA(bruto){
  const v = String(bruto ?? "").trim().replace(/[.,]0+$/, "");
  if (!/^\d{1,11}$/.test(v) || v.length === 9 || v.length === 10) return { err:"no es un Customer ID, un DNI (8 dígitos) ni un RUC (11 dígitos)" };
  if (v.length === 11) return S.docMap[v] ? { cid:S.docMap[v], doc:v } : { doc:v, err:"el RUC no está en la base" };
  const k = v.padStart(8, "0"), a = S.baseMap[k] ? k : null, b = S.docMap[k] || null;
  if (a && b && a !== b) return { doc:k, err:"coincide con un Customer ID y con el DNI de otro comercio: revisar a mano" };
  return a || b ? { cid:a || b, doc:k } : { doc:k, err:"no está en la base" };
}
/* ---------- Resultados de BBVA (29/09): el Excel mínimo que Jose arma desde el entorno de BBVA ---------- */
const COLS_BBVA = ["customer_id", "gestion_con_contacto", "reactivado", "facturado", "fecha_reactivacion"];
const FORMATO_BBVA = { customer_id:"RUC (11 dígitos), DNI o Customer ID de BBVA; si Excel quitó los ceros de la izquierda, se completan", gestion_con_contacto:"Si o No",
  reactivado:"Si, No o En proceso", facturado:"monto en soles del comercio (opcional; también puedes poner solo el total al cargar)", fecha_reactivacion:"fecha en que BBVA reporta la reactivación (opcional)" };
const ALIAS_BBVA = { customer_id:["customer_id", "customer id", "customerid", "cid", "cliente", "codigo", "código", "id", "documento", "documento_bbva2", "ruc", "dni", "nro_documento", "nro documento", "numero_documento", "ruc_dni", "ruc/dni"],
  gestion_con_contacto:["gestion_con_contacto", "gestión con contacto", "gestion con contacto", "contacto", "gestion", "gestión"],
  reactivado:["reactivado", "reactivo", "reactivó", "cuenta", "consumio", "consumió", "consumo"], facturado:["facturado", "facturacion", "facturación", "monto", "monto facturado", "importe", "vol", "volumen"],
  fecha_reactivacion:["fecha_reactivacion", "fecha reactivacion", "fecha de reactivacion", "fecha_react", "reactivado_el", "fecha reactivación", "fecha de reactivación"] };
// Fecha del archivo: AAAA-MM-DD, DD/MM/AAAA, serie de Excel o m/d/aa (el formato por defecto de Excel). Vacía = ""; no válida = null.
const fechaReac = v => { const s = String(v ?? "").trim(); if (!s) return ""; let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/); if (m){ const mm = +m[1] > 12 ? +m[2] : +m[1], dd = +m[1] > 12 ? +m[1] : +m[2]; const f2 = `20${m[3]}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`; return isNaN(Date.parse(f2)) || new Date(f2 + "T12:00:00Z").getUTCDate() !== dd ? null : f2; }
  const f = fechaNorm(s); return /^\d{4}-\d{2}-\d{2}$/.test(f) && !isNaN(Date.parse(f)) ? f : null; };
const siNo = v => { const t = String(v ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); return ["si", "s", "1", "true", "x"].includes(t) ? true : ["no", "n", "0", "false", ""].includes(t) ? false : null; };
const reacNorm = v => { const t = String(v ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); return t === "en proceso" || t === "proceso" ? "En proceso" : siNo(v) === true ? "Si" : siNo(v) === false && t !== "" ? "No" : null; };
// Sugerencia para un ID que no está en la base: el de la base que difiere en un dígito, o al que le falta uno
function idParecido(cid){
  const dif = (a, b) => { let d = 0; for (let i = 0; i < 8; i++) if (a[i] !== b[i]) d++; return d; };
  const ids = S.base.map(c => c.customer_id), uno = ids.filter(k => dif(k, cid) === 1);
  if (uno.length === 1) return uno[0];
  const corto = cid.replace(/^0+/, ""); if (corto.length === 7){ const m = ids.filter(k => [...Array(8).keys()].some(i => k.slice(0, i) + k.slice(i + 1) === corto)); if (m.length === 1) return m[0]; }
  return null;
}
function validarBBVA(cab, filas){
  const ix = {}; COLS_BBVA.forEach(col => { ix[col] = cab.findIndex(h => ALIAS_BBVA[col].map(normalizar).includes(normalizar(h))); });
  const faltan = COLS_BBVA.filter(c => !["facturado", "gestion_con_contacto", "fecha_reactivacion"].includes(c) && ix[c] < 0), vistos = new Set(), res = [];
  filas.forEach((f, n) => { const err = [];
    const bruto = String(f[ix.customer_id] ?? "").trim().replace(/[.,]0+$/, ""), id = idDeBBVA(bruto), cid = id.cid || id.doc || bruto, doc = id.doc || null;
    // sin columna de gestión, la calcula el CRM con sus visitas (aquí para la vista previa; el servidor la vuelve a calcular)
    const gc = ix.gestion_con_contacto < 0 ? S.act.some(v => v.customer_id === (idDeBBVA(String(f[ix.customer_id] ?? "").trim().replace(/[.,]0+$/, "")).cid) && v.estado_anul !== "anulada" && v.con !== "Nadie") : siNo(f[ix.gestion_con_contacto]), re = reacNorm(f[ix.reactivado]);
    const fr = ix.fecha_reactivacion >= 0 ? fechaReac(f[ix.fecha_reactivacion]) : "";
    const fac = ix.facturado >= 0 ? String(f[ix.facturado] ?? "").trim().replace(/[S\/\s]/g, "").replace(/,(?=\d{3}\b)/g, "").replace(",", ".") : "";
    let sug = null;
    if (id.err){ err.push("documento o customer_id " + id.err); if (/^\d{8}$/.test(cid) && !id.cid) sug = idParecido(cid); }
    if (gc === null) err.push("gestion_con_contacto no es Si o No");
    if (!re) err.push("reactivado no es Si, No o En proceso");
    if (fr === null) err.push("fecha de reactivación no válida (usa AAAA-MM-DD o DD/MM/AAAA)");
    if (fac !== "" && !/^\d+(\.\d+)?$/.test(fac)) err.push("facturado no es un monto");
    if (vistos.has(cid)) err.push("comercio repetido en el archivo"); vistos.add(cid);
    res.push({ n:n + 2, bruto, cid, doc, gc, re, fac, fr: fr || "", sug, err }); });
  return { faltan, ix, cab, res, ok:res.filter(r => !r.err.length).length };
}
// Primera visita válida (con ubicación, a tiempo, no anulada) de cada comercio en el periodo, hasta la fecha C
function visitadosAlCorte(C){
  const o = {}, per = S.periodo && S.periodo.id; (S.act || []).forEach(v => { if (v.estado_anul === "anulada" || v.periodo !== per || v.lat == null || v.fuera_plazo) return;
    const k = iso(v.visitado_en); if (k <= C && (!o[v.customer_id] || k < o[v.customer_id])) o[v.customer_id] = k; });
  return o;
}
// Regla única de «cuenta» (Jose, 29/09): volvió a transaccionar según BBVA (Reactivado = Si), con gestión con contacto según BBVA,
// con visita válida de Stratis hasta el corte y en la cartera asignada. La usan la vista previa de la carga y la presentación.
const cuentaBBVA = (r, primera) => r.reactivado === "Si" && !!r.gestion_con_contacto && !!primera[r.customer_id] && !!(S.baseMap[r.customer_id] || {}).correo;
function previaBBVA(){
  const c = S.carga, v = c.filas, malas = v.res.filter(r => r.err.length), buenas = v.res.filter(r => !r.err.length);
  const primera = visitadosAlCorte(c.corte || hoyISO());
  const reac = buenas.filter(r => r.re === "Si"), cuentan = reac.filter(r => cuentaBBVA({ reactivado:r.re, gestion_con_contacto:r.gc, customer_id:r.cid }, primera)), fac = cuentan.reduce((a, r) => a + (r.fac === "" ? 0 : Number(r.fac)), 0);
  const conFac = buenas.some(r => r.fac !== "");
  return `<div class="panel previa"><div class="barra"><b>${esc(c.archivo)}</b><span class="lbl">Resultados de BBVA · ${v.res.length} filas leídas · columnas: ${v.cab.map(esc).join(", ")}</span><div class="der"><button class="btn" id="otroArchivo">Elegir otro archivo</button><button class="btn p ${S.ocupado?"cargando-btn":""}" id="cargar" ${v.ok===0||v.faltan.length?"disabled":""}>Cargar ${v.ok} filas válidas</button></div></div>
    <div style="padding:12px">
    ${v.faltan.length ? `<div class="aviso mal">No encuentro las columnas <b>${v.faltan.join(", ")}</b>. La primera fila debe traer los nombres (por ejemplo: RUC/DNI o customer ID, Gestion_Con_Contacto, Reactivado).</div>` : ""}
    <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:12px">
      <label class="lbl">Fecha de corte de la data de BBVA <input type="date" id="bbvaCorte" value="${esc(c.corte || "")}" max="${hoyISO()}" class="sel"></label>
      <label class="lbl">Total facturado de los que cuentan (S/, opcional) <input type="text" id="bbvaTotal" value="${esc(c.facturadoTotal || "")}" placeholder="${conFac ? "se suma de la columna facturado" : "ej.: 2600000"}" class="sel" style="width:170px"></label>
    </div>
    <div class="checks">
      <div class="check ok"><i>✓</i><div><b class="num">${v.ok}</b><small>filas válidas</small></div></div>
      <div class="check ${malas.length?"mal":"ok"}"><i>${malas.length?"!":"✓"}</i><div><b class="num">${malas.length}</b><small>filas que no se cargan</small></div></div>
      <div class="check ok"><i>${reac.length}</i><div><b style="font-size:12px">reactivados según BBVA</b><small>${cuentan.length} cuentan: con gestión con contacto y visita de Stratis del periodo hasta el corte</small></div></div>
      ${conFac ? `<div class="check ok"><i>S/</i><div><b class="num">${priv(fac.toLocaleString("es-PE", { maximumFractionDigits:0 }))}</b><small>facturado de los que cuentan</small></div></div>` : ""}
    </div>
    <div class="aviso">Se guarda como el corte del <b>${c.corte ? fISO(c.corte) : "—"}</b>. Si ya había un corte con esa fecha, se reemplaza completo. No cambia visitas ni el medidor, y los ejecutivos no lo ven.</div>
    ${malas.length ? `<div style="overflow:auto;margin-top:12px"><table class="datos"><thead><tr><th>Fila</th><th>RUC, DNI o Customer ID en tu archivo</th><th>Problema</th><th>¿Quisiste decir?</th></tr></thead><tbody>
      ${malas.slice(0, 80).map(r => `<tr class="err"><td class="num">${r.n}</td><td class="num">${esc(r.bruto)}</td><td>${esc(r.err.join(" · "))}</td><td class="num">${r.sug ? esc(r.sug) + ` <small class="muted">${esc((S.baseMap[r.sug] || {}).distrito || "")}</small>` : "—"}</td></tr>`).join("")}
    </tbody></table><div style="font-size:11.5px;color:var(--muted);margin-top:6px">Corrige esos números en tu Excel y vuelve a cargarlo: el corte se reemplaza completo. La sugerencia es el ID de la base que difiere en un dígito.</div></div>` : ""}
    </div></div>`;
}
function resultadoBBVA(){
  const c = S.carga, r = c.resultado || {}, det = r.detalle || [];
  return `<div class="panel"><div style="padding:22px;display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap">
    <div class="check ok" style="border:0;padding:0"><i style="width:40px;height:40px;font-size:18px">✓</i></div>
    <div style="flex:1;min-width:240px"><h2 style="font-size:16px">Corte del ${r.corte ? fISO(r.corte) : "—"} cargado: ${num(r.cargadas)} comercios${r.reemplazo ? " (reemplaza el corte anterior de esa fecha)" : ""}</h2>
      <div class="sub" style="margin:4px 0 10px">${esc(c.archivo)} · carga n.º ${r.carga_id} · ${num(r.reactivados)} reactivados según BBVA, ${num(r.con_contacto)} de ellos con gestión con contacto · ${num(r.rechazadas)} rechazadas por la base.</div>
      <div class="aviso ok">La presentación para BBVA ya toma este corte para la reactivación y la facturación.</div>
      ${det.length ? `<div style="overflow:auto;margin-top:10px"><table class="datos"><thead><tr><th>Fila</th><th>Documento o Customer ID</th><th>Motivo</th></tr></thead><tbody>${det.slice(0, 50).map(d => `<tr class="err"><td class="num">${d.fila}</td><td class="num">${esc(d.customer_id || "")}</td><td>${esc(d.motivo)}</td></tr>`).join("")}</tbody></table></div>` : ""}
      <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn p" id="otraCarga">Nueva carga</button></div>
    </div></div></div>`;
}
async function cargarBBVA(){
  const c = S.carga, v = c.filas, ce = $("#bbvaCorte"), tt = $("#bbvaTotal");
  if (ce) c.corte = ce.value; if (tt) c.facturadoTotal = tt.value;
  if (!c.corte || c.corte > hoyISO()){ toast("Indica la fecha de corte de la data de BBVA (no puede ser futura)."); return; }
  const total = String(c.facturadoTotal || "").replace(/[S\/\s]/g, "").replace(/,(?=\d{3}\b)/g, "").replace(",", ".");
  if (total !== "" && !/^\d+(\.\d+)?$/.test(total)){ toast("El total facturado no es un monto."); return; }
  const conGestion = v.ix.gestion_con_contacto >= 0;   // sin esa columna, el servidor la calcula con las visitas del periodo hasta el corte
  const filas = v.res.filter(r => !r.err.length).map(r => ({ documento:r.doc, customer_id:r.cid, ...(conGestion ? { gestion_con_contacto:r.gc } : {}), reactivado:r.re, facturado:r.fac === "" ? null : r.fac, ...(r.fr ? { fecha_reactivacion:r.fr } : {}) }));
  S.ocupado = true; pintar();
  try {
    const { data, error } = await sb.rpc("v2_cargar_resultados_bbva", { p_archivo:c.archivo, p_corte:c.corte, p_filas:filas, p_facturado_total:total === "" ? null : total,
      p_notas:`${v.res.length} filas en el archivo, ${v.res.length - v.ok} descartadas antes de cargar` });
    if (error) throw error;
    c.resultado = data; c.hecho = true; S.resBBVA = null;
    await cargarCargas(); toast("Resultados de BBVA cargados.");
  } catch(e){ toast("No se pudo cargar: " + (e.message || e)); }
  S.ocupado = false; pintar();
}
/* Totales de BBVA por corte (30/09): la reactivación vive en el drive de BBVA y no se descarga por comercio. Jose tipea
   los totales por grupo y el CRM pone los comercios de cada grupo al mismo corte (las columnas Visitado y Gestion_Con_Contacto
   de la hoja Base). «Reactivado que cuenta» = reactivado según BBVA y visitado con contacto según el CRM. */
const GRUPOS_TOT = [["cc", "Visitados con contacto"], ["sc", "Visitados sin contacto"], ["nv", "No visitados"]];
const CAMPOS_TOT = [["reac", "Reactivados"], ["fac", "Facturación (S/)"], ["trx", "Transacciones"]];
// Montos como se escriben en el drive: 1.234.567,89 · 1234567.89 · 12.345 · 12345
function leerMonto(t){
  let x = String(t == null ? "" : t).replace(/S\/|\s/g, "");
  if (x === "") return null;
  const uc = x.lastIndexOf(","), up = x.lastIndexOf(".");
  if (uc >= 0 && up >= 0) x = uc > up ? x.replace(/\./g, "").replace(",", ".") : x.replace(/,/g, "");
  else if (uc >= 0) x = /^\d{1,3}(,\d{3})+$/.test(x) ? x.replace(/,/g, "") : x.replace(",", ".");
  else if (up >= 0 && /^\d{1,3}(\.\d{3})+$/.test(x)) x = x.replace(/\./g, "");
  return /^\d+(\.\d+)?$/.test(x) ? Number(x) : NaN;
}
// Grupos del CRM al corte K, sobre la cartera asignada: los mismos que la hoja Base (Visitado y Gestion_Con_Contacto)
function gruposCRM(K){
  const cartera = S.base.filter(c => c.correo), enC = new Set(cartera.map(c => c.customer_id)), per = S.periodo && S.periodo.id;
  const primera = visitadosAlCorte(K), conC = new Set(), des = {}, nv = {}; let visitas = 0;
  (S.act || []).slice().sort((a, b) => a.visitado_en < b.visitado_en ? -1 : 1).forEach(v => {
    if (v.estado_anul === "anulada" || v.periodo !== per || iso(v.visitado_en) > K || !enC.has(v.customer_id)) return;
    visitas++; if (v.decision === "Desiste del producto") des[v.customer_id] = v.equipo || "";
    if (v.lat != null && !v.fuera_plazo){ nv[v.customer_id] = (nv[v.customer_id] || 0) + 1; if (v.con !== "Nadie") conC.add(v.customer_id); } });
  const vis = Object.keys(primera).filter(c => enC.has(c)).length, rec = Object.keys(des).length;
  return { universo:cartera.length, visitas, vis, cc:conC.size, sc:vis - conC.size, nv:cartera.length - vis, recupero:rec, equipoRec:Object.values(des).filter(e => e === "Sí").length, repetidos:Object.values(nv).filter(n => n > 1).length };
}
// Cuadro completo (como la tabla de Jose) a partir de los totales t y los grupos g; errores = controles de coherencia
function cuadroTotales(t, g){
  const G = {}; GRUPOS_TOT.forEach(([k, nom]) => { G[k] = { nom, n:g[k], reac:Number(t[k + "_reac"]), fac:Number(t[k + "_fac"]), trx:Number(t[k + "_trx"]) }; });
  const suma = (ks, nom, n) => ({ nom, n, reac:ks.reduce((a, k) => a + G[k].reac, 0), fac:ks.reduce((a, k) => a + G[k].fac, 0), trx:ks.reduce((a, k) => a + G[k].trx, 0) });
  const tv = suma(["cc", "sc"], "Total visitados", g.vis), tu = suma(["cc", "sc", "nv"], "Total universo", g.universo);
  const errores = [];
  GRUPOS_TOT.forEach(([k, nom]) => { if (G[k].reac > G[k].n) errores.push(`${nom}: ${numPE(G[k].reac)} reactivados y las visitas de Stratis tienen ${numPE(G[k].n)} comercios en ese grupo`); });
  if (g.cc + g.sc !== g.vis || g.vis + g.nv !== g.universo) errores.push("Los grupos de visitas de Stratis no suman el universo");
  return { G, tv, tu, errores };
}
const pct2 = (a, b) => b ? (100 * a / b).toFixed(2).replace(".", ",") + " %" : "—";
const montoPE = (x, d = 2) => x == null || isNaN(x) ? "—" : Number(x).toLocaleString("de-DE", { minimumFractionDigits:d, maximumFractionDigits:d });
function totalesDelForm(){
  const v = S.carga.tot.v, t = {}, faltan = [], malos = [];
  GRUPOS_TOT.forEach(([g, gn]) => CAMPOS_TOT.forEach(([c, cn]) => { const k = `${g}_${c}`, n = leerMonto(v[k]);
    if (n == null) faltan.push(`${gn} · ${cn}`); else if (isNaN(n) || (c !== "fac" && n !== Math.trunc(n))) malos.push(`${gn} · ${cn}`); else t[k] = n; }));
  return { t, faltan, malos };
}
function previaTotales(){
  const tt = S.carga.tot, K = tt.corte, { t, faltan, malos } = totalesDelForm();
  if (!K) return `<div class="aviso">Elige la fecha de corte de la data de BBVA.</div>`;
  const g = gruposCRM(K);
  if (faltan.length || malos.length) return `<div class="aviso ${malos.length ? "mal" : ""}">${malos.length ? `No es un número válido: <b>${malos.map(esc).join(", ")}</b>. ` : ""}${faltan.length ? `Faltan ${faltan.length} de 9 valores.` : ""} El CRM al ${fISO(K)}: ${numPE(g.cc)} visitados con contacto, ${numPE(g.sc)} sin contacto y ${numPE(g.nv)} no visitados (universo ${numPE(g.universo)}).</div>`;
  const q = cuadroTotales(t, g), fila = (o, b) => `<tr${b ? ' style="font-weight:700"' : ""}><td>${esc(o.nom)}</td><td class="n num">${numPE(o.n)}</td><td class="n num">${numPE(o.reac)}</td><td class="n num">${priv(montoPE(o.fac))}</td><td class="n num">${numPE(o.trx)}</td><td class="n num">${pct2(o.fac, q.tu.fac)}</td><td class="n num">${o.trx ? priv(montoPE(o.fac / o.trx)) : "—"}</td><td class="n num">${pct2(o.reac, o.n)}</td></tr>`;
  return `<div style="overflow:auto"><table class="datos"><thead><tr><th>Grupo</th><th class="n">Comercios (CRM)</th><th class="n">Reactivados</th><th class="n">Facturación (S/)</th><th class="n">Transacciones</th><th class="n">% facturación</th><th class="n">Ticket prom. (S/)</th><th class="n">% alcance</th></tr></thead><tbody>
    ${fila(q.G.cc)}${fila(q.G.sc)}${fila(q.tv, true)}${fila(q.G.nv)}${fila(q.tu, true)}</tbody></table></div>
    <div class="aviso ${q.errores.length ? "mal" : "ok"}" style="margin-top:10px">${q.errores.length ? "Control de coherencia: " + q.errores.map(esc).join(" · ") : `Control de coherencia OK · reactivados que cuentan (con visita, con o sin contacto): <b>${numPE(q.tv.reac)}</b> · conversión ${pct2(q.tv.reac, g.vis)} de ${numPE(g.vis)} visitados.`}</div>`;
}
function formTotales(){
  if (!S.totBBVA && !S._totPedidos){ S._totPedidos = true; cargarTotalesBBVA().catch(e => { S.totBBVA = []; toast("No se pudieron leer los totales guardados: " + (e.message || e)); }).then(() => { if (S.vista === "cargas") pintar(); }); }
  const c = S.carga;
  if (!c.tot){ const u = (S.totBBVA || [])[0]; c.tot = { corte:u ? u.corte : ayerISO(), v:{}, notas:"" }; if (u) prellenarTotales(u); }
  const tt = c.tot, { faltan, malos } = totalesDelForm(), q = tt.corte && !faltan.length && !malos.length ? cuadroTotales(totalesDelForm().t, gruposCRM(tt.corte)) : null;
  return `<div class="panel" style="padding:16px 18px">
    <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-end;margin-bottom:12px">
      <label class="lbl">Fecha de corte de la data de BBVA <input type="date" id="totCorte" value="${esc(tt.corte || "")}" max="${hoyISO()}" class="sel"></label>
      <label class="lbl" style="flex:1;min-width:240px">Nota (opcional) <input type="text" id="totNotas" value="${esc(tt.notas || "")}" class="sel" style="width:100%" placeholder="Ej.: capturado del drive de BBVA el 30/09"></label></div>
    <div style="overflow:auto"><table class="datos"><thead><tr><th>Grupo</th>${CAMPOS_TOT.map(([, cn]) => `<th>${cn}</th>`).join("")}</tr></thead><tbody>
      ${GRUPOS_TOT.map(([g, gn]) => `<tr><td><b>${gn}</b></td>${CAMPOS_TOT.map(([cc]) => `<td><input type="${S.ver || cc !== "fac" ? "text" : "password"}" inputmode="decimal" class="sel" style="width:150px;text-align:right" data-tot="${g}_${cc}" value="${esc(tt.v[`${g}_${cc}`] || "")}" placeholder="${cc === "fac" ? "1.234.567,89" : cc === "trx" ? "12.345" : "12"}"></td>`).join("")}</tr>`).join("")}
    </tbody></table></div>
    <div style="font-size:11.5px;color:var(--muted);margin:6px 0 12px">Copia los números como los ves en el drive de BBVA (con puntos de miles y coma decimal, o sin separadores). Los comercios de cada grupo los pone el CRM al mismo corte, igual que la hoja Base.</div>
    <div id="totPrevia">${previaTotales()}</div>
    <div style="margin-top:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap"><button class="btn p ${S.ocupado ? "cargando-btn" : ""}" id="guardarTotales" ${q && !q.errores.length ? "" : "disabled"}>Guardar los totales del ${tt.corte ? fISO(tt.corte) : "corte"}</button>
      <span class="lbl">Si el corte ya tenía totales, se reemplazan. No cambia visitas ni el medidor.</span></div>
    ${(S.totBBVA || []).length ? `<div style="overflow:auto;margin-top:16px"><table class="datos"><thead><tr><th>Corte</th><th class="n">Reactivados con contacto</th><th class="n">Sin contacto</th><th class="n">No visitados</th><th class="n">Facturación total (S/)</th><th>Por</th><th>Guardado</th></tr></thead><tbody>
      ${S.totBBVA.map(u => `<tr><td class="num">${fISO(u.corte)}</td><td class="n num">${numPE(u.cc_reac)}</td><td class="n num">${numPE(u.sc_reac)}</td><td class="n num">${numPE(u.nv_reac)}</td><td class="n num">${priv(montoPE(Number(u.cc_fac) + Number(u.sc_fac) + Number(u.nv_fac)))}</td><td>${esc((u.por || "").split("@")[0])}</td><td class="num">${ddhh(u.en)}</td></tr>`).join("")}</tbody></table></div>` : ""}
  </div>`;
}
function prellenarTotales(u){ const tt = S.carga.tot; tt.corte = u.corte; tt.notas = u.notas || "";
  GRUPOS_TOT.forEach(([g]) => CAMPOS_TOT.forEach(([c]) => { const n = Number(u[`${g}_${c}`]); tt.v[`${g}_${c}`] = c === "fac" ? montoPE(n) : numPE(n); })); }
function refrescarTotales(){ const p = $("#totPrevia"), b = $("#guardarTotales"); if (!p) return;
  p.innerHTML = previaTotales(); const { t, faltan, malos } = totalesDelForm(), tt = S.carga.tot;
  if (b) b.disabled = !(tt.corte && !faltan.length && !malos.length && !cuadroTotales(t, gruposCRM(tt.corte)).errores.length); }
async function cargarTotalesBBVA(){
  const { data, error } = await sb.from("v2_totales_bbva").select("*").order("corte", { ascending:false });
  if (error) throw error;
  S.totBBVA = data || []; return S.totBBVA;
}
async function guardarTotales(){
  const tt = S.carga.tot, { t, faltan, malos } = totalesDelForm();
  if (!tt.corte || tt.corte > hoyISO()){ toast("Indica la fecha de corte de la data de BBVA (no puede ser futura)."); return; }
  if (faltan.length || malos.length){ toast("Completa los 9 valores con números válidos."); return; }
  if (cuadroTotales(t, gruposCRM(tt.corte)).errores.length){ toast("Revisa el control de coherencia antes de guardar."); return; }
  S.ocupado = true; pintar();
  try {
    const { data, error } = await sb.rpc("v2_guardar_totales_bbva", { p_corte:tt.corte, p_totales:t, p_notas:tt.notas || null });
    if (error) throw error;
    await Promise.all([cargarTotalesBBVA(), cargarCargas()]);
    toast(`Totales del ${fISO(tt.corte)} guardados${data && data.reemplazo ? " (reemplazan los anteriores)" : ""}. La presentación ya los usa.`);
  } catch(e){ toast("No se pudieron guardar: " + (e.message || e)); }
  S.ocupado = false; pintar();
}

async function cargarGeo(){
  if (S.geo || S._geoCargando) return; S._geoCargando = true; S.geoErr = "";
  const { data, error } = await sb.from("v2_geo_distritos").select("clave,nombre,provincia,geometria");
  S._geoCargando = false;
  if (error) S.geoErr = error.message; else S.geo = data || [];
  pintar();
}
function porVisitarMapa(){
  const vis = new Set(S.act.filter(v => v.estado_anul !== "anulada" && v.lat != null && !v.fuera_plazo).map(v => v.customer_id));
  return S.base.filter(c => c.correo && c.geo_lat != null && c.geo_lng != null && (!S.hayOrigen || c.origen === "base_nueva") && !vis.has(c.customer_id) && (!S.mEj || S.mEj === "todos" || c.correo === S.mEj));
}
function conPeriodoId(id, fn){
  const p = (S.periodos || []).find(x => x.id === id);
  if (!p || !id || (S.periodo && id === S.periodo.id)) return fn();
  const d = datosPeriodo(p); if (d.cargando || d.err) return fn();
  const g = { act:S.act, base:S.base, baseMap:S.baseMap, hayOrigen:S.hayOrigen };
  Object.assign(S, { act:d.act, base:d.base, baseMap:d.baseMap, hayOrigen:d.hayOrigen });
  try { return fn(); } finally { Object.assign(S, g); }
}
/* =========================================================================
   Mapa único (26/11/2026): reemplaza «Mapa de calor» y «Ubicación». Un solo mapa con la distribución por distrito, las visitas, los comercios por
   visitar (puntos grises), la distancia del registro al comercio y las alertas. Solo lectura: las señales avisan, no bloquean ni descartan visitas.
   Sigue el periodo elegido arriba (S.dirPer) y el ejecutivo del selector (S.ej).
   ========================================================================= */
const MU_MODOS = [["ej", "Ejecutivo"], ["cob", "Cobertura"], ["err", "Dirección errada"]];
const esErr = v => v.con === "Nadie" && v.motivo === "Dirección errada";
function muStats(){
  const m = {}, get = k => m[k] ||= { k, asig:0, vis:new Set(), reg:0, con:0, err:0, porEj:{} };
  S.base.forEach(c => { if (!c.distrito || !c.correo || (S.hayOrigen && c.origen !== "base_nueva")) return; const o = get(c.distrito); o.asig++; o.porEj[c.correo] = (o.porEj[c.correo] || 0) + 1; });
  S.act.forEach(v => { if (v.estado_anul === "anulada") return; const o = get(v.distrito || "SIN DISTRITO"); o.reg++; if (v.con !== "Nadie") o.con++; if (esErr(v)) o.err++;
    if (v.lat != null && !v.fuera_plazo && sumaMeta(v.customer_id)) o.vis.add(v.customer_id); });
  Object.values(m).forEach(o => { o.v = o.vis.size; o.cob = o.asig ? o.v / o.asig : null; o.pcon = o.reg ? o.con / o.reg : null; o.perr = o.reg ? o.err / o.reg : null; o.ej = Object.entries(o.porEj).sort((a, b) => b[1] - a[1]).map(x => x[0])[0] || null; });
  return m;
}
const nomDis = k => { const g = (S.geo || []).find(x => x.clave === k); return g ? g.nombre : String(k || "").toLowerCase().replace(/(^|\s)(\S)/g, (a, b, c) => b + c.toUpperCase()); };
const muRampa = c => c == null || c === 0 ? "#E4E8FB" : c < .25 ? "#B7C0F5" : c < .5 ? "#7F8CEF" : c < .75 ? "#4F5CF3" : "#1b1f8f";
const muRampaErr = c => c == null || c === 0 ? "#E4E8FB" : c < .1 ? "#FBD5B8" : c < .25 ? "#F7A66B" : c < .5 ? "#F86F35" : "#B4491B";
function muPeriodo(fn){ cargarPeriodos(); return conPeriodoId(S.dirPer, fn); }
/* Cartera (26/11): los comercios del periodo con su última visita y su próxima acción. Solo lectura. */
const CAR_EST = [["", "Todos los estados"], ["por", "Por visitar"], ["vis", "Visitados"], ["con", "Con contacto"], ["sin", "Sin contacto"], ["err", "No se encontró el comercio"]];
/* Seguimiento (26/11, check-in): cruza lo que registra cada ejecutivo (v2_seguimientos) con los comercios que BBVA reporta reactivados (último corte del
   periodo en v2_resultados_bbva). Solo lee; no cambia la visita, el estado ni el bono. Sin corte de reactivados, muestra los check-ins y avisa qué cargar. */
async function cargarReactivados(per){
  S.reac ||= {}; if (!per || S.reac[per] !== undefined) return; S.reac[per] = null;
  const p = (S.periodos || []).find(x => x.id === per) || S.periodo; if (!p){ S.reac[per] = { corte:null, ids:new Set() }; return; }
  try {
    const k = await sb.from("v2_cortes_bbva").select("corte").gte("corte", p.ini).lte("corte", p.fin).order("corte", { ascending:false }).limit(1);
    if (k && k.error) throw k.error;
    const corte = k && k.data && k.data[0] ? k.data[0].corte : null;
    if (!corte){ S.reac[per] = { corte:null, ids:new Set() }; pintar(); return; }
    const ids = new Set(), fechas = {};   // por tramos de 1.000 con orden fijo (tope de la API)
    let cols = "customer_id,fecha_reactivacion";
    for (let i = 0; ; i += 1000){
      let r = await sb.from("v2_resultados_bbva").select(cols).eq("corte", corte).eq("reactivado", "Si").order("customer_id").range(i, i + 999);
      if (r && r.error && cols.includes("fecha_reactivacion")){ cols = "customer_id"; r = await sb.from("v2_resultados_bbva").select(cols).eq("corte", corte).eq("reactivado", "Si").order("customer_id").range(i, i + 999); }   // aún sin la columna de fecha
      if (r && r.error) throw r.error;
      const d = (r && r.data) || []; d.forEach(x => { ids.add(x.customer_id); if (x.fecha_reactivacion) fechas[x.customer_id] = String(x.fecha_reactivacion).slice(0, 10); });
      if (d.length < 1000) break;
    }
    S.reac[per] = { corte, ids, fechas };
  } catch(e){ S.reac[per] = { error: (e && e.message) || "No se pudo leer" }; }
  pintar();
}
function vistaSeguimiento(){
  const perId = S.dirPer || (S.periodo || {}).id; cargarSegs(perId); cargarReactivados(perId);
  const sg = (S.segs && S.segs[perId]) || [], rv = S.reac && S.reac[perId];
  const ult = {}; S.act.filter(v => v.estado_anul !== "anulada").sort((x, y) => D(x.visitado_en) - D(y.visitado_en)).forEach(v => { ult[v.customer_id] = v; });
  const base = S.base.filter(c => c.correo && (!S.hayOrigen || c.origen === "base_nueva"));
  // caso de seguimiento: la última visita quedó abierta (sin contacto, «aún no decide» o quedaron en volver)
  const esCaso = v => v && (v.con === "Nadie" ? v.motivo !== "Dirección errada" : (v.que === "Reagendada" || v.decision === "Aún no decide"));
  const segDe = {}; sg.forEach(r => { (segDe[r.customer_id] ||= []).push(r); });
  const hayCorte = !!(rv && rv.corte), ids = hayCorte ? rv.ids : new Set(), refDe = cid => (hayCorte && rv.fechas && rv.fechas[cid]) || (hayCorte ? rv.corte : ""), enBase = new Set(base.map(c => c.customer_id)), fuera = hayCorte ? [...ids].filter(id => !enBase.has(id)).length : 0, corteTxt = hayCorte ? fISO(rv.corte) : null;
  const filas = S.ejecutivos.map(e => {
    const mios = base.filter(c => c.correo === e.correo), casos = mios.filter(c => esCaso(ult[c.customer_id])), conSeg = casos.filter(c => (segDe[c.customer_id] || []).some(r => r.correo === e.correo)).length;
    const reac = mios.filter(c => ids.has(c.customer_id)), reacSeg = reac.filter(c => (segDe[c.customer_id] || []).some(r => r.correo === e.correo && iso(r.hecho_en) <= refDe(c.customer_id))).length;
    return { e, casos:casos.length, conSeg, checkins:sg.filter(r => r.correo === e.correo).length, reac:reac.length, reacSeg, reacSin:reac.length - reacSeg };
  });
  const T = filas.reduce((a, f) => { ["casos", "conSeg", "checkins", "reac", "reacSeg", "reacSin"].forEach(k => { a[k] += f[k]; }); return a; }, { casos:0, conSeg:0, checkins:0, reac:0, reacSeg:0, reacSin:0 });
  const pc = (a, b) => b ? Math.round(a * 100 / b) + " %" : "—";
  const tile = (k, v, d, cls) => `<div class="tile ${cls || ""}"><div class="k">${k}</div><div class="v num">${v}</div><div class="d">${d}</div></div>`;
  const aviso = rv === undefined || rv === null ? `<div class="aviso">Leyendo los reactivados de BBVA…</div>` : rv.error ? `<div class="aviso mal">No se pudo leer la lista de reactivados: ${esc(rv.error)} <button class="btn" data-reac-reintentar="${esc(perId)}" style="margin-left:8px">Reintentar</button></div>` : !hayCorte ? `<div class="aviso warn"><b>Todavía no hay una lista de reactivados dentro de este periodo.</b> Cuando cargues los comercios reactivados en <b>Cargas</b> (resultados de reactivación, por documento), este cuadro los cruza con los check-ins de cada ejecutivo. Mientras tanto ves los check-ins y los casos abiertos.</div>` : `<div class="aviso ok">Reactivados según BBVA al corte del <b>${corteTxt}</b>. «Con check-in» = el ejecutivo registró un seguimiento del comercio antes o el día de su reactivación (si el archivo no trae la fecha, hasta el corte).${fuera ? ` ${fuera} reactivado${fuera === 1 ? "" : "s"} de la lista no ${fuera === 1 ? "está" : "están"} en la base nueva de este periodo y no se cruza${fuera === 1 ? "" : "n"}.` : ""}</div>`;
  const tiles = `<div class="resumen" style="margin-bottom:14px">${tile("Casos para seguimiento", T.casos, "visita sin contacto, «aún no decide» o quedaron en volver")}${tile("Con check-in", T.conSeg + '<small> / ' + T.casos + '</small>', pc(T.conSeg, T.casos) + " de los casos tiene un seguimiento registrado", T.casos && T.conSeg < T.casos ? "warn" : "ok")}${tile("Check-ins del periodo", T.checkins, "llamada, WhatsApp o correo")}${tile("Reactivados BBVA", hayCorte ? T.reac : "—", hayCorte ? `al corte del ${corteTxt}` : "sin lista cargada")}${tile("Reactivados con check-in", hayCorte ? T.reacSeg + '<small> / ' + T.reac + '</small>' : "—", hayCorte ? pc(T.reacSeg, T.reac) + " tuvo gestión del ejecutivo" : "se calcula con la lista", hayCorte && T.reacSin ? "warn" : "")}${tile("Reactivados sin check-in", hayCorte ? T.reacSin : "—", hayCorte ? "reactivaron sin un seguimiento registrado" : "se calcula con la lista")}</div>`;
  const tEj = `<div class="panel" style="margin-bottom:16px"><div class="barra"><b>Check-ins por ejecutivo</b><span class="lbl">casos abiertos, cuántos tienen seguimiento y, con la lista de BBVA, cuántos reactivados tuvieron gestión</span></div><div class="eq-dias"><table class="datos"><thead><tr><th>Ejecutivo</th><th class="n">Casos</th><th class="n">Con check-in</th><th class="n">Cobertura</th><th class="n">Check-ins</th><th class="n">Reactivados</th><th class="n">Con check-in</th><th class="n">Sin check-in</th></tr></thead><tbody>${filas.map(f => `<tr><td><span class="ej">${AVATAR(f.e)}${esc(f.e.nombre)}</span></td><td class="n num">${f.casos}</td><td class="n num">${f.conSeg}</td><td class="n num">${pc(f.conSeg, f.casos)}</td><td class="n num">${f.checkins}</td><td class="n num">${hayCorte ? f.reac : "—"}</td><td class="n num">${hayCorte ? f.reacSeg : "—"}</td><td class="n num">${hayCorte ? f.reacSin : "—"}</td></tr>`).join("") || `<tr><td colspan="8" class="muted">Sin ejecutivos.</td></tr>`}</tbody></table></div></div>`;
  const lista = hayCorte ? base.filter(c => ids.has(c.customer_id)).map(c => { const v = ult[c.customer_id], l = (segDe[c.customer_id] || []).filter(r => r.correo === c.correo).sort((a, b) => D(b.hecho_en) - D(a.hecho_en)), antes = l.filter(r => iso(r.hecho_en) <= refDe(c.customer_id)); return { c, v, l, antes, ref: rv.fechas && rv.fechas[c.customer_id] }; }).sort((a, b) => a.antes.length - b.antes.length || String(a.c.nombre_comercial).localeCompare(String(b.c.nombre_comercial))) : [];
  const tRea = hayCorte ? `<div class="panel"><div class="barra"><b>Comercios reactivados · ${lista.length}</b><span class="lbl">primero los que reactivaron sin check-in registrado · fecha de reactivación según tu archivo</span></div><div class="eq-dias"><table class="datos"><thead><tr><th>Ejecutivo</th><th>Comercio</th><th>Última visita</th><th>Check-ins</th><th>Último check-in</th><th>Reactivó</th><th>¿Gestión antes de reactivar?</th></tr></thead><tbody>${lista.slice(0, 300).map(({ c, v, l, antes, ref }) => { const ej = ejDe(c.correo), u = l[0];
    return `<tr><td><span class="ej">${AVATAR(ej)}${esc(nombreCorto(ej.nombre))}</span></td><td><b>${esc(c.nombre_comercial || c.razon_social || c.customer_id)}</b><small class="muted" style="display:block">${esc(c.distrito || "—")}</small></td><td>${v && !isNaN(D(v.visitado_en)) ? fISO(iso(v.visitado_en)) + `<small class="muted" style="display:block">${esc(comoFue(v)[0])}</small>` : "—"}</td><td class="n num">${l.length}</td><td>${u ? fISO(iso(u.hecho_en)) + " · " + esc(u.canal) + `<small class="muted" style="display:block">${esc(u.resultado)}</small>` : "—"}</td><td>${ref ? fISO(ref) : `<span class="muted">al corte</span>`}</td><td>${antes.length ? `<span class="pill p-ok">Sí</span>` : l.length ? `<span class="pill p-md">Solo después de reactivar</span>` : `<span class="pill p-no">Sin check-in</span>`}</td></tr>`; }).join("") || `<tr><td colspan="7" class="muted">Ningún comercio de la base está en la lista de reactivados.</td></tr>`}</tbody></table></div></div>` : "";
  return aviso + tiles + tEj + tRea;
}
/* Mi avance (vista del ejecutivo): sus pendientes y, debajo, su avance contra la meta (la misma pantalla de Equipo, con un solo ejecutivo). */
function vistaMiAvance(){
  const e = S.ejecutivos[0]; if (!e) return `<div class="panel"><div class="vacio">No hay un ejecutivo para mostrar.</div></div>`;
  const ult = {}; S.act.filter(v => v.estado_anul !== "anulada").sort((x, y) => D(x.visitado_en) - D(y.visitado_en)).forEach(v => { ult[v.customer_id] = v; });
  const base = S.base.filter(c => c.correo && (!S.hayOrigen || c.origen === "base_nueva"));
  const por = base.filter(c => !ult[c.customer_id]).length, err = base.filter(c => ult[c.customer_id] && esErr(ult[c.customer_id])).length, volver = base.filter(c => { const v = ult[c.customer_id]; return v && !esErr(v) && v.con === "Nadie"; }).length;
  const tiles = `<div class="resumen" style="margin-bottom:14px">
    <div class="tile acc"><div class="k">Mi cartera · ${esc(nombreCorto(e.nombre))}</div><div class="v num">${base.length}</div><div class="d">${base.length - por} con visita · ${por} por visitar</div></div>
    <div class="tile ${por ? "warn" : "ok"}"><div class="k">Por visitar</div><div class="v num">${por}</div><div class="d">comercios de mi base sin visita en el periodo</div></div>
    <div class="tile ${volver ? "warn" : "ok"}"><div class="k">Volver a visitar</div><div class="v num">${volver}</div><div class="d">la última visita fue sin contacto</div></div>
    <div class="tile ${err ? "warn" : "ok"}"><div class="k">Validar dirección</div><div class="v num">${err}</div><div class="d">no se encontró el comercio en la dirección</div></div></div>`;
  return tiles + equipoPeriodo().replace("Ritmo del equipo", "Mi ritmo");
}
function vistaCartera(){
  const ult = {}; S.act.filter(v => v.estado_anul !== "anulada").sort((x, y) => D(x.visitado_en) - D(y.visitado_en)).forEach(v => { ult[v.customer_id] = v; });
  const q = norm0(S.carQ || ""), est = S.carEst || "";
  const filas = S.base.filter(c => c.correo && (!S.hayOrigen || c.origen === "base_nueva")).map(c => { const v = ult[c.customer_id]; return { c, v, k: !v ? "por" : esErr(v) ? "err" : v.con === "Nadie" ? "sin" : "con" }; });
  const L = filas.filter(r => (!est || (est === "vis" ? r.k !== "por" : r.k === est)) && (!q || norm0(r.c.nombre_comercial + " " + r.c.razon_social + " " + (r.c.distrito || "")).includes(q)));
  const prox = r => r.k === "por" ? "Visitar" : r.k === "err" ? "Validar dirección" : r.k === "sin" ? "Volver a visitar" : "—";
  const cuerpo = L.map(r => { const ej = ejDe(r.c.correo);
    return `<tr><td><span class="ej">${AVATAR(ej)}${esc(nombreCorto(ej.nombre))}</span></td><td><b>${esc(r.c.nombre_comercial || r.c.razon_social)}</b></td><td>${esc(r.c.distrito || "—")}</td><td>${r.v ? fISO(iso(r.v.visitado_en)) : "—"}</td><td>${r.v ? `<span class="pill ${r.k === "con" ? "p-ok" : r.k === "err" ? "p-md" : "p-no"}">${esc(comoFue(r.v)[0])}</span>` : "—"}</td><td>${prox(r)}</td></tr>`; }).join("");
  return `<div class="panel panel-llena"><div class="barra"><b>Comercios del periodo · ${L.length} de ${filas.length}</b><span class="lbl">${filas.filter(r => r.k !== "por").length} con visita · ${filas.filter(r => r.k === "por").length} por visitar</span>
      <div class="der"><input class="sel" id="carQ" type="search" placeholder="Buscar comercio o distrito" value="${esc(S.carQ || "")}" aria-label="Buscar"><select class="sel" id="carEst" aria-label="Estado">${CAR_EST.map(([k, t]) => `<option value="${k}" ${est === k ? "selected" : ""}>${t}</option>`).join("")}</select></div></div>
    <div class="eq-dias llena"><table class="datos"><thead><tr><th>Ejecutivo</th><th>Comercio</th><th>Distrito</th><th>Última visita</th><th>Resultado</th><th>Próxima acción</th></tr></thead><tbody>${cuerpo || `<tr><td colspan="6" class="muted">Ningún comercio con estos filtros.</td></tr>`}</tbody></table></div></div>`;
}
const norm0 = s => String(s || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
function vistaMapaUnico(){
  cargarGeo(); cargarDomicilios(); S.muTodos = S.ejecutivos;   // la lista completa, antes de filtrar por ejecutivo
  const L = (S.periodos || []).filter(p => String(p.ini) <= hoyISO()), per = L.find(p => p.id === S.dirPer) || null, cur = S.periodo && S.periodo.id, enCurso = !per || per.id === cur;
  if (per && !enCurso){ const d = datosPeriodo(per);
    if (d.cargando) return `<div class="panel"><div class="vacio"><span class="spin"></span> Leyendo el periodo ${esc(per.id)}…</div></div>`;
    if (d.err) return `<div class="panel"><div class="vacio">No se pudo leer el periodo: ${esc(d.err)}<br><button class="btn" data-dirper="${esc(per.id)}" style="margin-top:10px">Reintentar</button></div></div>`; }
  return muPeriodo(() => conEj(() => cuerpoMapaUnico(enCurso)));
}
function cuerpoMapaUnico(enCurso){
  const modo = S.muModo || "ej", tab = S.muTab || "dis", vs = S.act.filter(v => v.estado_anul !== "anulada");
  const ejs = `<div class="mu-g"><small>Ejecutivo</small><select class="sel" id="muEj" aria-label="Ejecutivo">${S.modo === "eje" ? "" : '<option value="todos">Equipo completo</option>'}${S.muTodos.map(e => `<option value="${esc(e.correo)}" ${S.ej === e.correo ? "selected" : ""}>${esc(e.nombre)}</option>`).join("")}</select></div>`;
  const mod = `<div class="mu-g"><small>Colorear distritos por</small>${MU_MODOS.map(([k, t]) => `<button class="chip ${modo === k ? "on" : ""}" data-mu-modo="${k}">${t}</button>`).join("")}</div>`;
  const cap = enCurso ? `<div class="mu-g"><small>Capas</small><label class="tog"><input type="checkbox" id="muVis" ${S.muVis !== false ? "checked" : ""}> Visitas</label><label class="tog"><input type="checkbox" id="muPen" ${S.muPen !== false ? "checked" : ""}> <i class="negro"></i> Por visitar (${porVisitarMapa().length})</label><label class="tog"><input type="checkbox" id="muAle" ${S.muAle !== false ? "checked" : ""}> Alertas</label></div>` : "";
  const lejos = vs.filter(v => v.lat != null && (v.distancia_m || 0) > REGLA.lejos).length, alt = alertasMismoPunto().filter(g => g.nivel !== "info").length;
  const nAl = alt + (S.domErr ? 0 : alertasDomicilio().length), nErr = vs.filter(esErr).length;
  const T = [["dis", "Distritos", ""], ["reg", "Registros", enCurso ? vs.length : ""], ["ale", "Alertas", enCurso ? nAl : "", "al"], ["sin", "Sin ubicar", enCurso ? nErr : ""]];
  const tabs = T.map(([k, t, n, c]) => `<button class="tab ${tab === k ? "on" : ""} ${c || ""}" data-mu-tab="${k}">${t}${n !== "" ? `<em>${n}</em>` : ""}</button>`).join("");
  return `<div class="mu-barra">${ejs}${mod}${cap}</div>
  <div class="mu-main">
    <div class="panel mu-mapa-card">${enCurso ? "" : `<div class="aviso" style="margin:0;border-radius:0">Periodo cerrado: se ve la distribución por distrito tal como quedó. Las visitas, los puntos por visitar y las alertas son del periodo en curso.</div>`}
      ${S.geoErr ? `<div class="vacio" style="padding:30px">No se pudieron cargar los límites de los distritos: ${esc(S.geoErr)}</div>` : !S.geo ? `<div class="vacio" style="padding:30px"><span class="spin"></span> Cargando el mapa…</div>` : `<div id="mapaUnico" class="mapa-dist"></div>`}
      <div class="mu-ley">${muLeyenda(modo, enCurso)}</div></div>
    <div class="panel mu-panel"><div class="mu-tabs">${tabs}</div><div class="mu-cuerpo">${muPanel(tab, enCurso)}</div></div>
  </div>
  <div class="muted" style="font-size:12px;margin:8px 2px 14px">Toca una fila para verla en el mapa: se dibuja el punto donde se registró y la línea hasta el comercio. Las alertas avisan, no bloquean ni descartan visitas. Lejos: más de ${REGLA.lejos} m del comercio · Cerca: ${REGLA.cerca} a ${REGLA.lejos} m.</div>
  <details class="mu-det"><summary>Validación, plazo y anulaciones</summary>${panelValidacion()}</details>
  <details class="mu-det"><summary>Domicilios de referencia <small>dato restringido</small></summary>${panelDomicilios()}</details>`;
}
function muLeyenda(modo, enCurso){
  const li = (c, t, r) => `<span><i style="background:${c};${r ? "border-radius:3px" : ""}"></i>${t}</span>`;
  const m = modo === "ej" ? S.muTodos.map(e => li(e.color, nombreCorto(e.nombre) + " (distritos)", true)).join("") : modo === "cob" ? [["#E4E8FB", "0 %"], ["#B7C0F5", "1–24 %"], ["#7F8CEF", "25–49 %"], ["#4F5CF3", "50–74 %"], ["#1b1f8f", "75 % o más"]].map(([c, t]) => li(c, t, true)).join("") : [["#FBD5B8", "menos de 10 %"], ["#F7A66B", "10–24 %"], ["#F86F35", "25–49 %"], ["#B4491B", "50 % o más"]].map(([c, t]) => li(c, t, true)).join("");
  return m + (enCurso ? `<span><i class="pto"></i>visita (color del ejecutivo)</span><span><i class="negro"></i>comercio por visitar</span><span><i class="aro"></i>alerta</span>` : "");
}
function muPanel(tab, enCurso){
  const av = c => AVATAR(ejDe(c)), pcx = x => x == null ? "—" : Math.round(x * 100) + " %";
  if (tab === "dis"){
    const st = muStats(), L = Object.values(st).filter(o => o.asig && o.k !== "SIN DISTRITO").sort((a, b) => b.asig - a.asig);
    return `<table class="datos"><thead><tr><th>Distrito</th><th class="n">Asig.</th><th class="n">Visit.</th><th>Cobertura</th><th class="n">Contacto</th><th class="n">Dir. err.</th></tr></thead><tbody>${L.map(o => `<tr class="mu-f ${S.muDis === o.k ? "on" : ""}" data-mu-dis="${esc(o.k)}" tabindex="0"><td><span class="ej">${o.ej ? av(o.ej) : ""}<b>${esc(nomDis(o.k))}</b></span></td><td class="n num">${o.asig}</td><td class="n num">${o.v}</td><td>${pcx(o.cob)}<div class="barrita"><i style="width:${Math.round((o.cob || 0) * 100)}%"></i></div></td><td class="n num">${pcx(o.pcon)}</td><td class="n num">${pcx(o.perr)}</td></tr>`).join("") || `<tr><td colspan="6" class="muted">Sin comercios asignados.</td></tr>`}</tbody></table>`;
  }
  if (!enCurso) return `<div class="vacio" style="padding:26px">Este detalle es del periodo en curso. Elige el periodo en curso arriba para verlo.</div>`;
  const vs = S.act.filter(v => v.estado_anul !== "anulada");
  if (tab === "reg"){
    const f = S.muFil || "", con = vs.filter(v => v.lat != null), base = vs.map(v => ({ v, c: v.lat == null ? "no" : claseDist(v) })), cnt = k => base.filter(x => !k || x.c === k).length;
    const L = base.filter(x => !f || x.c === f).sort((a, b) => (b.v.distancia_m == null ? -1 : b.v.distancia_m) - (a.v.distancia_m == null ? -1 : a.v.distancia_m));
    return `<div class="mu-sub">${[["", "Todas"], ["ok", "En el comercio"], ["med", "Cerca"], ["mal", "Lejos"], ["no", "Sin referencia"]].map(([k, t]) => `<button class="chip ${f === k ? "on" : ""}" data-mu-fil="${k}">${t} · ${cnt(k)}</button>`).join("")}</div>
      <table class="datos"><thead><tr><th>Cuándo</th><th>Comercio</th><th class="n">Distancia</th></tr></thead><tbody>${L.map(({ v, c }) => `<tr class="mu-f ${S.muSel && S.muSel.t === "v" && S.muSel.id === v.id ? "on" : ""}" data-mu-v="${esc(v.id)}" tabindex="0"><td>${fISO(iso(v.visitado_en))} ${hh(v.visitado_en)}<div>${av(v.correo)}</div></td><td><b>${esc(v.comercio)}</b><small class="muted" style="display:block">${esc(v.distrito || "")}</small></td><td class="n"><span class="pill ${c === "ok" ? "p-ok" : c === "med" ? "p-md" : c === "mal" ? "p-mal" : "p-no"}">${v.lat == null || v.distancia_m == null ? "sin referencia" : mDist(v.distancia_m)}</span></td></tr>`).join("") || `<tr><td colspan="3" class="muted">Nada con este filtro.</td></tr>`}</tbody></table>`;
  }
  if (tab === "ale"){
    const gs = alertasMismoPunto().map((g, i) => ({ g, i })).filter(({ g }) => g.nivel !== "info"), dm = S.domErr ? [] : alertasDomicilio();
    return `<div class="mu-sub"><b>Comercios en el mismo punto</b> · distintos comercios a 30 m o menos, el mismo día</div>
      <table class="datos"><tbody>${gs.map(({ g, i }) => `<tr class="mu-f ${S.muSel && S.muSel.t === "g" && S.muSel.id === i ? "on" : ""}" data-mu-g="${i}" tabindex="0"><td>${fISO(iso(g.visitas[0].visitado_en))} ${hh(g.visitas[0].visitado_en)}<div>${av(g.visitas[0].correo)}</div></td><td>${[...new Set(g.visitas.map(v => v.comercio))].map(esc).join(" · ")}<small class="muted" style="display:block">${g.visitas.length} registros juntos</small></td><td class="n"><span class="pill ${g.nivel === "alta" ? "p-mal" : "p-md"}">${NIVEL_TXT[g.nivel][0]}</span></td></tr>`).join("") || `<tr><td class="muted">Ninguna.</td></tr>`}</tbody></table>
      <div class="mu-sub" style="border-top:1px solid var(--linea)"><b>Registros cerca del domicilio del ejecutivo</b> · con el comercio lejos (dato restringido)</div>
      ${S.domErr ? `<div class="vacio" style="padding:14px">Los domicilios de referencia todavía no están habilitados.</div>` : `<table class="datos"><thead><tr><th>Cuándo</th><th>Comercio</th><th class="n">Cerca del domicilio</th><th class="n">De la dirección real</th></tr></thead><tbody>${dm.map(o => `<tr class="mu-f ${S.muSel && S.muSel.t === "v" && S.muSel.id === o.v.id ? "on" : ""}" data-mu-v="${esc(o.v.id)}" tabindex="0"><td>${fISO(iso(o.v.visitado_en))} ${hh(o.v.visitado_en)}<div>${av(o.v.correo)}</div></td><td><b>${esc(o.v.comercio)}</b></td><td class="n"><span class="pill p-md">a ${mDist(o.m)}</span></td><td class="n"><span class="pill p-mal">a ${mDist(o.v.distancia_m)}</span></td></tr>`).join("") || `<tr><td colspan="4" class="muted">${(S.domicilios || []).length ? "Ninguna." : "Todavía no hay domicilios de referencia cargados."}</td></tr>`}</tbody></table>`}`;
  }
  const L = vs.filter(esErr).sort((a, b) => D(b.visitado_en) - D(a.visitado_en));
  return `<div class="mu-sub">Visitas en las que no se ubicó el comercio en la dirección cargada</div><table class="datos"><thead><tr><th>Cuándo</th><th>Comercio</th><th>Distrito</th></tr></thead><tbody>${L.map(v => `<tr class="mu-f ${S.muSel && S.muSel.t === "v" && S.muSel.id === v.id ? "on" : ""}" data-mu-v="${esc(v.id)}" tabindex="0"><td>${fISO(iso(v.visitado_en))} ${hh(v.visitado_en)}<div>${av(v.correo)}</div></td><td><b>${esc(v.comercio)}</b></td><td>${esc(v.distrito || "—")}</td></tr>`).join("") || `<tr><td colspan="3" class="muted">Ninguna.</td></tr>`}</tbody></table>`;
}
function montarMapaUnico(el){
  if (!window.L || !S.geo) return;
  const modo = S.muModo || "ej", st = muStats(), oscuro = temaActual() === "dark", enCurso = !S.dirPer || !S.periodo || S.dirPer === S.periodo.id;
  const m = L.map(el, { zoomControl:true, scrollWheelZoom:true, zoomSnap:.25, preferCanvas:false });
  m.setView(S.muVista ? S.muVista.c : [-12.06, -77.03], S.muVista ? S.muVista.z : 11);   // la vista primero: sin ella Leaflet no puede dibujar las capas
  m.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom:18, opacity:oscuro ? .55 : .5, attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' }).addTo(m);
  const borde = colorCss("var(--tarjeta)"), pts = [];
  const zoomFill = () => { const z = m.getZoom(); m.eachLayer(g => { if (g.eachLayer) g.eachLayer(q => { if (q.options && q.options._base != null) q.setStyle({ fillOpacity: z >= 14 ? Math.min(q.options._base, .1) : q.options._base }); }); }); };
  S.geo.forEach(g => { const o = st[g.clave], tiene = !!(o && o.asig), base = tiene ? (modo === "ej" ? .34 : .72) : .03;
    const fill = !tiene ? "#ffffff" : modo === "ej" ? colorCss(ejDe(o.ej).color) : modo === "cob" ? muRampa(o.cob) : muRampaErr(o.perr);
    const capa = L.geoJSON({ type:"Feature", geometry:g.geometria }, { style:{ color:tiene ? borde : colorCss("var(--muted)"), weight:tiene ? 1.4 : .7, opacity:tiene ? 1 : .5, fillColor:fill, fillOpacity:base, _base:base } }).addTo(m);
    capa.bindTooltip(`<b>${esc(g.nombre)}</b>${tiene ? `<br>${o.asig} asignados · ${o.v} visitados · ${Math.round((o.cob || 0) * 100)} % cobertura` : "<br>sin comercios asignados"}`, { sticky:true });
    capa.on("click", () => { S.muTab = "dis"; S.muDis = g.clave; S.muVista = null; S.muEnfocar = g.clave; pintar(); });
    if (tiene && modo !== "ej") L.marker(capa.getBounds().getCenter(), { interactive:false, icon:L.divIcon({ className:"lbl-dist", iconSize:null, html:`<span>${Math.round(((modo === "cob" ? o.cob : o.perr) || 0) * 100)} %</span>` }) }).addTo(m);
    if (S.muEnfocar === g.clave){ m.fitBounds(capa.getBounds(), { padding:[30, 30], maxZoom:14, animate:false }); S.muEnfocar = null; S.muVista = { c:[m.getCenter().lat, m.getCenter().lng], z:m.getZoom() }; } });
  const vs = S.act.filter(v => v.estado_anul !== "anulada" && v.lat != null);
  if (enCurso){
    if (S.muPen !== false) porVisitarMapa().forEach(c => L.circleMarker([c.geo_lat, c.geo_lng], { radius:3.5, color:"#ffffff", weight:.6, fillColor:"#0B0F26", fillOpacity:.9 })
      .bindTooltip(`<b>${esc(c.nombre_comercial || c.razon_social)}</b><br>${esc(nombreCorto((ejDe(c.correo) || {}).nombre))} · por visitar${c.distrito ? " · " + esc(c.distrito) : ""}`, { className:"etq-mapa", direction:"top", offset:[0, -3] }).addTo(m));
    if (S.muVis !== false) vs.forEach(v => L.circleMarker([v.lat, v.lng], { radius:5, color:borde, weight:1.5, fillColor:colorCss(ejDe(v.correo).color), fillOpacity:1 })
      .bindTooltip(`<b>${esc(v.comercio)}</b><br>${esc(ejDe(v.correo).nombre)} · ${fISO(iso(v.visitado_en))} ${hh(v.visitado_en)}<br>${v.distancia_m != null ? "a " + mDist(v.distancia_m) + " del comercio" : "sin referencia"}`, { className:"etq-mapa", direction:"top", offset:[0, -4] })
      .on("click", () => { S.muTab = "reg"; S.muSel = { t:"v", id:v.id }; pintar(); }).addTo(m));
    if (S.muAle !== false){
      alertasMismoPunto().filter(g => g.nivel !== "info").forEach(g => g.visitas.forEach(v => L.circleMarker([v.lat, v.lng], { radius:9, color:"#D6455D", weight:2, fill:false, interactive:false }).addTo(m)));
      vs.filter(v => (v.distancia_m || 0) > REGLA.lejos).forEach(v => L.circleMarker([v.lat, v.lng], { radius:8, color:"#D6455D", weight:2, dashArray:"3 3", fill:false, interactive:false }).addTo(m)); }
    const sel = S.muSel, lista = !sel ? [] : sel.t === "g" ? ((alertasMismoPunto()[sel.id] || {}).visitas || []) : S.act.filter(v => v.id === sel.id);
    lista.forEach(v => { if (v.lat == null) return; const p = [v.lat, v.lng], r = puntoRef(v); pts.push(p);
      L.circleMarker(p, { radius:8, color:colorCss("var(--ink)"), weight:3, fillColor:colorCss(ejDe(v.correo).color), fillOpacity:1 }).addTo(m);
      if (r){ pts.push([r.lat, r.lng]); L.polyline([p, [r.lat, r.lng]], { color:colorCss("var(--ink)"), weight:2, dashArray:"5 5" }).addTo(m);
        L.marker([r.lat, r.lng], { icon:L.divIcon({ className:"", html:`<div class="mu-rombo"></div>`, iconSize:[14, 14], iconAnchor:[7, 7] }) }).bindTooltip(`Comercio: ${esc(v.comercio)}`).addTo(m); } });
  }
  if (pts.length){ m.fitBounds(L.latLngBounds(pts).pad(.5), { maxZoom:15, animate:false }); }
  else if (S.muVista) m.setView(S.muVista.c, S.muVista.z);
  else { const todos = enCurso ? [...vs.map(v => [v.lat, v.lng]), ...porVisitarMapa().map(c => [c.geo_lat, c.geo_lng])] : []; if (todos.length > 3) m.fitBounds(L.latLngBounds(todos).pad(-.05), { padding:[10, 10], maxZoom:12, animate:false }); else m.setView([-12.06, -77.03], 11); }
  m.on("zoomend", zoomFill); zoomFill();
  m.on("moveend", () => { if (!S.muSel) S.muVista = { c:[m.getCenter().lat, m.getCenter().lng], z:m.getZoom() }; });
  S._mapaUnico = m;
}
document.addEventListener("click", ev => {
  const t = ev.target.closest("[data-mu-ej],[data-mu-modo],[data-mu-tab],[data-mu-dis],[data-mu-fil],[data-mu-v],[data-mu-g]"); if (!t) return; const d = t.dataset;
  if (d.muEj !== undefined){ S.muSel = null; S.muVista = null; elegirEj(d.muEj); return; }
  if (d.muModo){ S.muModo = d.muModo; pintar(); return; }
  if (d.muTab){ S.muTab = d.muTab; pintar(); return; }
  if (d.muDis){ S.muDis = d.muDis; S.muEnfocar = d.muDis; S.muSel = null; pintar(); return; }
  if (d.muFil !== undefined){ S.muFil = d.muFil; pintar(); return; }
  if (d.muV){ S.muSel = { t:"v", id:d.muV }; pintar(); return; }
  if (d.muG !== undefined){ S.muSel = { t:"g", id:+d.muG }; pintar(); return; }
});
document.addEventListener("change", ev => { const i = ev.target.id; if (i === "muVis") S.muVis = ev.target.checked; else if (i === "muPen") S.muPen = ev.target.checked; else if (i === "muAle") S.muAle = ev.target.checked; else return; pintar(); });

async function cargarFbInferido(){
  const r = await sb.from("v2_feedback_inferido").select("visita_id,tipos,fuera_de_lista,confianza,criterio");
  if (r && r.error){ S.fbInfErr = r.error.message; return; }
  S.fbInf = {}; ((r && r.data) || []).forEach(x => { S.fbInf[x.visita_id] = x; });
}
// Qué feedback cuenta para una visita: lo que marcó el ejecutivo; si no marcó nada, lo inferido del comentario.
// Si el ejecutivo solo marcó «Sin observaciones» o «No se encontraba…» y el comentario sí trae un reclamo, se suma lo
// inferido (Jose, 01/10: que ninguna visita quede sin feedback); «delComentario» dice qué se sumó.
const FB_SIN_RECLAMO = [FB_NINGUNO, "No se encontraba la persona que tomaba decisiones"];
function fbDe(v){
  if (v.con === "Nadie") return null;
  const inf = (S.fbInf || {})[v.id];
  if ((v.feedback || []).length){
    const sumar = inf && v.feedback.every(t => FB_SIN_RECLAMO.includes(t)) && ((inf.tipos || []).length || (inf.fuera_de_lista || []).length);
    if (sumar) return { fuente:"ejecutivo", tipos:v.feedback.filter(t => t !== FB_NINGUNO).concat((inf.tipos || []).filter(t => !v.feedback.includes(t))), fuera:inf.fuera_de_lista || [],
      nota:v.feedback_nota || "", acc:v.fb_acciones || [], ext:v.fb_extra || null, inf, delComentario:(inf.tipos || []).concat(inf.fuera_de_lista || []) };
    return { fuente:"ejecutivo", tipos:v.feedback, fuera:[], nota:v.feedback_nota || "", acc:v.fb_acciones || [], ext:v.fb_extra || null, inf }; }
  if (inf) return { fuente:"inferido", tipos:inf.tipos || [], fuera:inf.fuera_de_lista || [], confianza:inf.confianza, criterio:inf.criterio, inf };
  return { fuente:null, tipos:[], fuera:[] };
}
const tagsFb = (l, cls) => l.map(t => `<span class="fb-tag ${cls || ""} ${t === FB_NINGUNO ? "ninguno" : ""}">${esc(t)}</span>`).join("");
const FUENTE_TXT = { ejecutivo:"Marcado por el ejecutivo", inferido:"Inferido por Stratis del comentario" };
function fichaFeedback(v){
  const f = fbDe(v);
  if (!f) return `<div class="muted" style="font-size:12.5px">No aplica: no hubo contacto con el comercio.</div>`;
  if (!f.fuente) return `<div class="muted" style="font-size:12.5px">Sin feedback todavía.</div>`;
  let h = `<div class="fb-fuente ${f.fuente}">${FUENTE_TXT[f.fuente]}${f.confianza ? ` · confianza ${esc(f.confianza.toLowerCase())}` : ""}</div>`;
  h += f.tipos.length ? `<div class="fb-tags">${tagsFb(f.tipos)}</div>` : (f.fuera.length ? "" : `<div class="muted" style="font-size:12.5px">El comentario no dice qué opina el comercio del POS.</div>`);
  if (f.fuera.length) h += `<div class="fb-sub">Fuera de la lista de BBVA</div><div class="fb-tags">${tagsFb(f.fuera, "fuera")}</div>`;
  if (f.ext && competidorTxt(f.ext)) h += `<div class="fb-sub">POS de otra marca</div><div style="font-size:13px">${esc(competidorTxt(f.ext))}${(f.ext.prefiere_por || []).length ? ` · lo prefiere por ${esc(f.ext.prefiere_por.join(", ").toLowerCase())}` : ""}</div>`;
  if (f.ext && demoraTxt(f.ext)) h += `<div class="fb-sub">Demora de los abonos</div><div style="font-size:13px">${esc(demoraTxt(f.ext))}</div>`;
  if (f.ext && f.ext.no_necesita_por) h += `<div class="fb-sub">Por qué no necesita el POS</div><div style="font-size:13px">${esc(f.ext.no_necesita_por)}</div>`;
  if (f.fuente === "ejecutivo") h += (f.acc || []).length ? `<div class="fb-sub">Qué ofreció el ejecutivo</div><div class="fb-tags">${tagsFb(f.acc, "acc")}</div>` : (f.tipos.some(t => t !== FB_NINGUNO) ? `<div class="fb-crit">Sin «qué ofreció»: registro anterior al 26/09.</div>` : "");
  if (f.criterio) h += `<div class="fb-crit">${esc(f.criterio)}</div>`;
  if (f.nota) h += `<div class="coment" style="margin-top:8px"><small class="muted" style="display:block;font-size:11px;margin-bottom:2px">Feedback adicional del ejecutivo</small>${esc(f.nota)}</div>`;
  if (f.delComentario) h += `<div class="fb-crit">El ejecutivo marcó «${esc(v.feedback.join(" · "))}»; Stratis sumó del comentario: ${esc(f.delComentario.join(" · "))}${f.inf.criterio ? ` (${esc(f.inf.criterio)})` : ""}</div>`;
  else if (f.fuente === "ejecutivo" && f.inf && f.inf.tipos.length) h += `<div class="fb-crit">Antes, Stratis lo había inferido del comentario como: ${esc(f.inf.tipos.join(" · "))}</div>`;
  return h;
}
const RESULTADOS = [
  ["exito", "Éxito", "Realizará consumos"],
  ["proceso", "En proceso", "Aún no decide o reagendada"],
  ["no", "No éxito", "Desiste del producto, o hubo contacto sin éxito"],
  ["noenc", "No se encontró", "Dirección errada y sin contacto"],
  ["sincon", "Sin contacto", "Cerrado hoy, cerró definitivamente, nadie atendió, zona insegura u otro motivo"],
];
const RES_TXT = Object.fromEntries(RESULTADOS.map(r => [r[0], r[1]]));
function resultadoDe(v){
  if (v.con === "Nadie") return v.motivo === "Dirección errada" ? "noenc" : "sincon";
  if (v.que === "Reunión concretada") return v.decision === "Realizará consumos" ? "exito" : v.decision === "Desiste del producto" ? "no" : "proceso";
  if (v.que === "Reagendada") return "proceso";
  return "no";
}
// Motivos del sí inferidos por Stratis del comentario (tabla v2_motivo_si_inferido, solo escritorio).
// Seguimiento remoto de las visitas sin contacto (01/10). Si la tabla aún no existe o falla, la presentación sigue sin él.
async function cargarSegs(per){
  S.segs ||= {}; if (!per || S.segs[per] !== undefined) return; S.segs[per] = null;
  const r = await sb.from("v2_seguimientos").select("customer_id,correo,canal,resultado,nota,hecho_en").eq("periodo", per).order("hecho_en", { ascending:false });
  S.segs[per] = r && !r.error ? (r.data || []) : []; pintar();
}
async function cargarSeguimientos(){
  let q = sb.from("v2_seguimientos").select("visita_id,customer_id,canal,resultado,hecho_en"); if (S.periodo) q = q.eq("periodo", S.periodo.id);
  const r = await q;
  S.seg = r && !r.error ? (r.data || []) : [];
}
async function cargarMsiInferido(){
  const r = await sb.from("v2_motivo_si_inferido").select("visita_id,motivos,confianza,criterio");
  if (r && r.error){ S.msiInfErr = r.error.message; return; }
  S.msiInf = {}; ((r && r.data) || []).forEach(x => { S.msiInf[x.visita_id] = x; });
}
// Qué lo convenció: lo que marcó el ejecutivo; si no marcó nada, lo inferido del comentario.
function msiDe(v){
  if (v.decision !== "Realizará consumos") return null;
  if ((v.motivos_si || []).length) return { fuente:"ejecutivo", motivos:v.motivos_si };
  const i = (S.msiInf || {})[v.id];
  if (i) return { fuente:"inferido", motivos:i.motivos || [], confianza:i.confianza, criterio:i.criterio };
  return { fuente:null, motivos:[] };
}
function vistaIndicadores(){
  if (!S.avance && !S.avanceErr){ cargarAvance(); return `<div class="cargando"><span class="spin"></span>Calculando…</div>`; }
  if (S.avanceErr) return `<div class="aviso mal">${esc(S.avanceErr)}</div>`;
  const filas = S.avance.filter(a => a.rol === "Ejecutivo" || !["Analista","Manager"].includes(a.rol));
  const p = filas[0] || {};
  const pct1 = x => x == null ? "—" : Number(x).toFixed(1).replace(".", ",") + " %";
  return `${p.sin_parametros ? `<div class="aviso warn" style="margin-bottom:12px">El periodo no tiene parámetros cargados: se cuentan los indicadores pero no hay puntos ni bono.</div>` : ""}
  ${p.hay_transacciones === false ? `<div class="aviso warn" style="margin-bottom:12px">Sin transacciones cargadas: los reactivados están en cero para todos. Carga la data diaria de BBVA en «Cargas».</div>` : ""}
  <div class="panel"><div class="barra"><b>Equipo · periodo ${esc(p.periodo || "")}</b><span class="lbl">pesos ${p.peso_reactivados ?? "—"} · ${p.peso_visitas ?? "—"} · ${p.peso_conversion ?? "—"} · bono desde ${p.puntos_min ?? "—"} puntos</span></div>
  <div style="overflow:auto"><table class="datos"><thead><tr><th>Ejecutivo</th><th class="n">Base</th><th class="n">Visitados</th><th class="n">Reactivados</th><th class="n">Conversión</th><th class="n">Puntos</th><th class="n">Bono</th><th class="n">Paga · retiene</th><th>Objetivo BBVA</th></tr></thead><tbody>
    ${filas.map(a => { const e = ejDe(a.correo); return `<tr><td><span class="ej">${AVATAR(e)}${esc(a.nombre || e.nombre)}</span></td><td class="n num">${num(a.base)}</td><td class="n num">${num(a.visitados)}</td><td class="n num">${num(a.reactivados)}</td><td class="n num">${pct1(a.conversion)}</td><td class="n num"><b>${a.puntos == null ? "—" : Number(a.puntos).toFixed(1).replace(".", ",")}</b></td><td class="n num">${a.bono_pct == null ? "—" : pct1(a.bono_pct)}</td><td class="n num">${a.bono_pagado == null ? "—" : pct1(a.bono_pagado) + " · " + pct1(a.bono_retenido)}</td><td>${a.objetivo_bbva ? `<span class="pill val">cumplido</span>` : `<span class="pill pend">pendiente</span>`}</td></tr>`; }).join("")}
  </tbody></table></div>
  <div class="atajos">Solo cuentan las visitas no anuladas, una por comercio. Los reactivados salen de la data de BBVA cargada, no de lo que declara el ejecutivo.</div></div>`;
}

/* =========================================================================
   Base para BBVA (Excel) · modelo «Gestión Stratis» de 55 columnas (Jose, 26/10/2026)
   Reemplaza al modelo del 30/09 (KPIs · Base). Dos hojas: Resumen (fórmulas sobre Base) · Base, una fila por comercio de la
   base nueva del periodo, con Documento como llave en la columna A. Mismo orden y nombres que
   Escritorio\Gestion_Stratis_visitados_base_nueva_corte_23-10-2026.xlsx. Las columnas en naranja son las que el celular todavía
   no captura: van vacías hasta el rediseño del celular.
   ========================================================================= */
const FB_29 = ["Desconfía de la visita (duda que representemos a BBVA)", "No pidió el POS", "Solicitó cambio de equipo", "Le falta una función"];
const BBVA_ORDEN = ["No se encontraba la persona que tomaba decisiones", "No necesitaba los POS", "POS no enciende", "Soporte no ayudó al comercio",
  "Mala Señal en el POS", "POS no tiene señal y no puedo cobrar", "POS no cuenta con la tarifa acordada", "POS problema con abonos",
  "POS queda procesando el pago , se demora", "El cobro a través del POS tarda demasiado cuando existe alta demanda", "POS rechaza los pagos con tarjeta",
  // agregados por Stratis (árbol del 26/09)
  "Usa POS de otra marca", "Pide una tasa más baja", "Los abonos le llegan con demora", "Cobra con Yape o Plin para no pagar comisión", "Solo acepta efectivo",
  "No tiene contómetros o le quedan pocos", "Le parece complicado usar el POS", "No sabe revisar sus ventas o abonos", "Su funcionario de BBVA no responde",
  // agregados por Stratis (tipificaciones del 29/09, aprobadas por Gabriel)
  ...FB_29,
  // agregada por Stratis el 10/11/2026 (pedido de Jose)
  "Teléfono del comercio que se comunicó a soporte"];
const BASE55 = ["Documento","Customer_ID","Nombre_Comercial","Razon_Social","Distrito","Periodo","Bloque","Origen","Ejecutivo","Grupo_Ubicacion",
  "Visitado","Fecha_Primera_Visita","Fecha_Ultima_Visita","Visitas_Validas","Como_Fue_La_Visita","Motivo_Sin_Visita","Direccion_Correcta",
  "Gestion_Con_Contacto","Fecha_Primera_Gestion_Con_Contacto","Con_Quien","Nombre_Cargo_Contacto","Celular_Confirmado","Mejor_Horario",
  "Decision","Que_Lo_Convencio","Sentir_Del_Cliente","Resultado","Feedback","Rama_Feedback","Punto_De_Dolor_Principal","Severidad",
  "POS_Otra_Marca","Tasa_Competidor","Prefiere_Competidor_Por","Dias_Demora_Abono","Banco_Abono","Por_Que_No_Necesita","Comentario",
  "Que_Ofrecio","Derivado_A","Numero_Ticket","Estado_Del_Problema","Fecha_Resolucion","Proxima_Accion","Fecha_Volver","Seguimiento_Canal",
  "Seguimiento_Resultado","Fecha_Seguimiento","Recupero_Paso","Caso_Soporte","Reactivado_BBVA","Dias_Con_Trx_Post_Visita",
  "Cuenta_Para_Comision","Validacion","Fuera_De_Plazo",
  // 26/10 (Jose): Feedback y Que_Lo_Convencio mezclan lo marcado y lo inferido del comentario; la fuente va después de la columna 55
  "Fuente_Feedback","Fuente_Que_Lo_Convencio",
  // 01/11 (Jose): tipificación oficial de BBVA de cada frase de Feedback, después de la columna 55 sin mover las de antes
  "Motivo_BBVA","Submotivo_BBVA",
  // 03/11 (Jose): las 4 fases de BBVA. La frase principal y la acción que pide BBVA para ella; el estado va en AO–AR
  "Feedback_Principal","Accion_BBVA"];
// Lo que el celular todavía no captura: cabecera naranja y celda vacía (regla de ausencia: vacío = no consta, no «no tiene»)
// 03/11: Numero_Ticket, Estado_Del_Problema, Fecha_Resolucion y Proxima_Accion ya salen del estado de lo que pide BBVA
const BASE55_FALTA = new Set(["Tasa_Competidor","Nombre_Cargo_Contacto","Celular_Confirmado","Mejor_Horario","Sentir_Del_Cliente","Punto_De_Dolor_Principal","Severidad"]);
const BASE55_ANCHO = [12,14,19,15,12,13,13,13,13,18,12,23,22,18,21,20,21,23,30,12,24,21,16,12,19,21,12,40,16,27,12,17,18,26,20,14,22,40,13,13,16,22,19,17,15,20,24,20,16,15,18,27,23,13,17,22,22,30,34,30,50];
// Opción que marcó el ejecutivo, con el texto exacto del celular (pregunta única «¿Cómo fue la visita?», 26/09). comoFue() es la
// versión del escritorio («Habló con…», con detalle), por eso aquí va aparte: el modelo de Jose usa las palabras del celular.
function comoFueTexto(v){
  if (v.con === "Nadie") return v.motivo === "Dirección errada" ? "El comercio no está en esta dirección" : "No se pudo hacer la visita";
  // Dirección errada pero lo encontró en otro lugar: la visita sigue con contacto y el modelo lo anota al final
  const otra = v.direccion_ok === false && v.comercio_ubicado === true ? " (lo encontré en otro lugar)" : "";
  if (v.que === "Reunión concretada") return "Hablé con el dueño o el encargado" + otra;
  if (v.que === "Reagendada") return "No estaba quien decide · quedamos en volver" + otra;
  if (v.que === "Sin éxito") return "No estaba quien decide · sin compromiso" + otra;
  return v.que || "";
}
// Derivado_A sale de lo que marcó el ejecutivo en «qué ofreció»
// Tipificaciones oficiales de BBVA (01/11/2026, definitivas): frase → [motivo, submotivo, acción]. Igual que v2_feedback_tipos
// (migración 20261101100000) y que el celular. Incluye las dos que no se eligen de la lista.
const TIPI_BBVA = {
  "Usa POS de otra marca":["Preferencia por competencia","Utiliza POS de otro adquirente (marca adquirente)","Identificar el adquirente utilizado y consultar los motivos de preferencia por la competencia."],
  "Cobra con Yape o Plin para no pagar comisión":["Mala venta - falta de necesidad","Prefiere exclusivamente otros medios de pago","Antes realizar una útlima recuperación y en todo caso de no ser efectiva generar la baja por teléfono"],
  "Solo acepta efectivo":["Mala venta - falta de necesidad","No acepta pagos con tarjeta (solo efectivo / transferencia)","Realizar intentos comerciales y campañas para comprometer al uso , en todo caso de no ser posible realicemos la baja por teléfono"],
  "No necesitaba los POS":["Mala venta - falta de necesidad","Negocio / rubro no requiere POS","Realizar intentos comerciales y campañas para comprometer al uso , en todo caso de no ser posible realicemos la baja por teléfono"],
  "No pidió el POS":["Mala venta - falta de necesidad","Negocio / rubro no requiere POS","¿ Cuál fue la necesidad de adquirir el POS ? Protocolo de baja por teléfono"],
  "Pide una tasa más baja":["Condiciones comerciales","Condiciones comerciales poco atractivas","Brindar información de campañas actuales ( si aplica ) y confirmar uso"],
  "POS no cuenta con la tarifa acordada":["Mala venta - expectativa comercial incorrecta","Condiciones comerciales informadas incorrectamente","Informar sobre la nueva campaña y en todo caso derivar con su ejecutivo de BBVA"],
  "POS problema con abonos":["Liquidaciones / abonos","Problemas con liquidación de pagos","Si tiene problemas, derivar a la mesa para su atención."],
  "Los abonos le llegan con demora":["Liquidaciones / abonos","Problemas con liquidación de pagos","Si tiene problemas, derivar a la mesa para su atención."],
  "POS no enciende":["Problema técnico","POS no enciende","Validar alimentación eléctrica, batería y funcionamiento del equipo. Gestionar soporte técnico o reemplazo si corresponde."],
  "Mala Señal en el POS":["Problema técnico","POS lento o falla de conexión","Generar avería para solución"],
  "POS no tiene señal y no puedo cobrar":["Problema técnico","POS lento o falla de conexión","Generar avería para solución"],
  "POS queda procesando el pago , se demora":["Problema técnico","POS lento o falla de conexión","Generar avería para solución"],
  "El cobro a través del POS tarda demasiado cuando existe alta demanda":["Problema técnico","POS lento o falla de conexión","Generar avería para solución"],
  "POS rechaza los pagos con tarjeta":["Problema técnico","POS rechaza pagos con tarjeta","Realizar diagnóstico técnico del POS, validar conectividad . Escalar a soporte técnico si corresponde."],
  "Solicitó cambio de equipo":["Problema técnico","Problemas técnicos previos","Confirmar solución. Si tiene problemas, derivar a la mesa para su atención."],
  "No tiene contómetros o le quedan pocos":["Barrera operativa del comercio","No tiene contómetro","Realizar solicitud de envío de contómetros"],
  "Le parece complicado usar el POS":["Adopción / conocimiento","No sabe usar el POS","Programar capacitación, agendar sesión y enviar mail confirmando sesión"],
  "No sabe revisar sus ventas o abonos":["Adopción / conocimiento","No sabe usar el POS","Programar capacitación, agendar sesión y enviar mail confirmando sesión"],
  "Le falta una función":["Producto / funcionalidad","Identificar la funcionalidad faltante","Identificar la funcionalidad requerida, validar su disponibilidad y comunicar alternativas o gestionar el requerimiento."],
  "Teléfono del comercio que se comunicó a soporte":["Problema técnico","Comercio se comunicó a soporte","Registrar el teléfono con el que el comercio se comunicó a soporte y confirmar con Soporte que el caso fue atendido."],
  "Soporte no ayudó al comercio":["Disconformidad con el servicio","Atención al cliente insatisfactoria","Confirmar solución. Si tiene problemas, derivar a la mesa para su atención."],
  "Su funcionario de BBVA no responde":["Disconformidad con el servicio","Atención al cliente insatisfactoria","Confirmar solución. Si tiene problemas, derivar a la mesa para su atención."],
  "Desconfía de la visita (duda que representemos a BBVA)":["Validación de identidad","Desconfianza de representante en visita","Soporte ya cuenta con las credenciales de los ejecutivos en campo"],
  "No se encontraba la persona que tomaba decisiones":["Contacto pendiente","Decisor ausente en visita","Realizar segunda visita acorde a agenda asegurando fecha y hora con compromiso"],
  "Sin observaciones del comercio":["Sin causa identificada","Sin observaciones registradas","Levantar información adicional para identificar el motivo de no uso del POS."] };
const DERIVA_A = { "Llamé a soporte":"Soporte Openpay", "Generé ticket de atención":"Soporte Openpay", "Derivé a postventa":"Postventa", "Derivé a BBVA con urgencia":"BBVA" };
function cargarScript(src){ return new Promise((ok, mal) => { const e = document.createElement("script"); e.src = src; e.onload = ok; e.onerror = () => mal(new Error("No se pudo cargar " + src)); document.head.appendChild(e); }); }
async function baseBBVA(){
  if (S._bajandoBase) return; S._bajandoBase = true; toast("Armando la base para BBVA…");
  try {
    if (!window.ExcelJS) await cargarScript("https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js");
    const per = S.periodo ? S.periodo.id : null;
    // Último corte de la lista de BBVA: si no hay ninguno dentro del periodo, Reactivado_BBVA dice «Sin dato en el corte» (no «NO»)
    const corteQ = sb.from("v2_resultados_bbva").select("corte").order("corte", { ascending:false }).limit(1);
    const recQ = sb.rpc("v2_mis_recuperos", per ? { p_periodo: per } : {});
    // 19/11/2026: los comercios que salen de la base del periodo (retiro con motivo «Fuera de la base…») no van en el Excel para BBVA,
    // salvo que ya tengan una visita (Regla n.º 1). Los retiros temporales de otro tipo siguen yendo, como siempre.
    const fueraQ = per ? sb.from("v2_retiros_temporales").select("customer_id,motivo").eq("periodo", per).is("restituido_en", null).like("motivo", "Fuera de la base%") : Promise.resolve({ data: [] });
    const [, , , , , rc, rr, fq] = await Promise.all([cargarActividad(true), cargarBase(), cargarFbInferido(), cargarMsiInferido(), cargarSeguimientos(), corteQ, recQ, fueraQ]);
    const fueraBase = new Set(((fq && !fq.error && fq.data) || []).map(x => x.customer_id));
    const ultCorte = rc && !rc.error && rc.data && rc.data[0] ? rc.data[0].corte : null;
    const hayCorte = !!(ultCorte && (!S.periodo || ultCorte >= S.periodo.ini));
    const recPor = {}; ((rr && !rr.error && rr.data) || []).forEach(x => { recPor[x.customer_id] = x; });
    const segPor = {}; (S.seg || []).forEach(x => { const u = segPor[x.customer_id]; if (!u || x.hecho_en > u.hecho_en) segPor[x.customer_id] = x; });
    const fecha = s => { if (!s) return null; const [y, m, d] = String(s).slice(0, 10).split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
    const vs = S.act.filter(v => v.estado_anul !== "anulada" && (!per || v.periodo === per)).sort((a, b) => a.visitado_en < b.visitado_en ? -1 : 1);
    const valida = v => v.lat != null && !v.fuera_plazo;
    const porCid = {}; vs.forEach(v => (porCid[v.customer_id] ||= []).push(v));
    // Filas: solo la base nueva del periodo (Jose, 26/10). La base anterior (visitas del 19 y 20/10) fue el cierre del periodo
    // anterior, ampliado por excepción, y no va. En un periodo sin bloques (sin origen) van todos los comercios en cartera.
    const ejN = c => c.correo ? ejDe(c.correo).nombre : "";
    const base = S.base.filter(c => (!c.origen || c.origen === "base_nueva") && (!fueraBase.has(c.customer_id) || (porCid[c.customer_id] || []).length)).map(c => ({ c, l:porCid[c.customer_id] || [] }))
      .sort((a, b) => ejN(a.c).localeCompare(ejN(b.c)) || (a.l.length ? 0 : 1) - (b.l.length ? 0 : 1)
        || String(a.l[0] ? a.l[0].visitado_en : "").localeCompare(String(b.l[0] ? b.l[0].visitado_en : "")) || String(a.c.documento || a.c.customer_id).localeCompare(String(b.c.documento || b.c.customer_id)));
    const RAMA = t => (FEEDBACK.find(g => g[1].includes(t)) || [])[0] || "";
    const TIPOS = BBVA_ORDEN.concat(FB_NINGUNO);
    const filas = base.map(({ c, l }) => {
      const ult = l[l.length - 1], gc = l.find(v => valida(v) && v.con !== "Nadie"), uc = l.filter(v => v.con !== "Nadie").pop();
      const fb = new Set(), acc = new Set(), comp = [], pref = new Set(), fuentes = new Set(); let tasa = null, dias = null, banco = "", noNec = "";
      l.forEach(v => { const f = fbDe(v); if (!f || !f.fuente) return; f.tipos.forEach(t => fb.add(t));
        if (f.tipos.length) fuentes.add(f.fuente === "ejecutivo" ? "Ejecutivo" : "Inferido del comentario"); if (f.delComentario) fuentes.add("Inferido del comentario"); (f.acc || []).forEach(a => acc.add(a));
        const x = f.ext; if (!x) return;
        (x.competidores || []).forEach(k => { const n = k === "Otro" && x.competidor_otro ? x.competidor_otro : k; if (!comp.includes(n)) comp.push(n); });
        (x.prefiere_por || []).forEach(p => pref.add(p));
        if (x.tasa_competidor != null) tasa = Number(x.tasa_competidor); if (x.dias_demora_abono != null) dias = Number(x.dias_demora_abono);
        if (x.banco_abono) banco = x.banco_abono; if (x.no_necesita_por) noNec = x.no_necesita_por; });
      if (fb.has(FB_NINGUNO) && fb.size > 1) fb.delete(FB_NINGUNO);
      const tipos = TIPOS.filter(t => fb.has(t)), ramas = FEEDBACK.map(g => g[0]).filter(r => tipos.some(t => RAMA(t) === r));
      // 03/11: frase principal y estado de lo que pide BBVA, de la última visita con feedback (lo marcó el ejecutivo): si esa
      // visita ya no trae principal, no se arrastra la de una visita anterior. Sin principal marcada (visitas anteriores al
      // 03/11), es la única frase con acción si hay una sola.
      const uf = l.filter(v => v.con !== "Nadie" && (v.feedback || []).length).pop();
      const pv = uf && uf.fb_extra && TIPI_BBVA[uf.fb_extra.fb_principal] ? uf : null, px = pv ? pv.fb_extra : null;
      const ufT = uf ? ((fbDe(uf) || {}).tipos || uf.feedback || []) : [];
      const conAcc = ufT.filter(t => TIPI_BBVA[t] && t !== FB_NINGUNO && t !== "No se encontraba la persona que tomaba decisiones");
      const princ = px ? px.fb_principal : conAcc.length === 1 ? conAcc[0] : "", est = px ? px.accion_estado || "" : "";
      const accP = princ ? TIPI_BBVA[princ][2] : "";
      const m = uc ? msiDe(uc) : null, s = segPor[c.customer_id], r = recPor[c.customer_id];
      const deriva = [...new Set(ACCIONES.filter(a => acc.has(a) && DERIVA_A[a]).map(a => DERIVA_A[a]))];
      const reac = c.bbva_reactivado ? "SI" : hayCorte ? "NO" : "Sin dato en el corte";
      const val = {
        Documento: c.documento || c.ruc || "", Customer_ID: c.customer_id, Nombre_Comercial: c.nombre_comercial || "", Razon_Social: c.razon_social || "",
        Distrito: c.distrito || "", Periodo: per || "", Bloque: c.bloque != null ? Number(c.bloque) : "", Origen: c.origen === "base_nueva" ? "Base nueva" : (c.origen || ""),
        Ejecutivo: ejN(c), Grupo_Ubicacion: GRUPO_UB[c.grupo_ubicacion] ? GRUPO_UB[c.grupo_ubicacion][1] : "",
        Visitado: l.some(valida) ? "SI" : "NO", Fecha_Primera_Visita: l.length ? fecha(iso(l[0].visitado_en)) : null, Fecha_Ultima_Visita: ult ? fecha(iso(ult.visitado_en)) : null,
        Visitas_Validas: l.filter(valida).length, Como_Fue_La_Visita: ult ? comoFueTexto(ult) : "",
        Motivo_Sin_Visita: ult && ult.con === "Nadie" ? (MOTIVO_TXT[ult.motivo] || ult.motivo || "") : "",
        Direccion_Correcta: ult ? (ult.direccion_ok === true ? "SI" : ult.direccion_ok === false ? "NO" : "Sin dato") : "",
        Gestion_Con_Contacto: gc ? "SI" : "NO", Fecha_Primera_Gestion_Con_Contacto: gc ? fecha(iso(gc.visitado_en)) : null, Con_Quien: uc ? uc.con : "",
        Decision: uc ? uc.decision || "" : "", Que_Lo_Convencio: m ? m.motivos.join("; ") : "",
        Resultado: ult ? RES_TXT[resultadoDe(ult)] : "Sin visita", Feedback: tipos.join("; "), Rama_Feedback: ramas.join("; "),
        POS_Otra_Marca: comp.join("; "), Tasa_Competidor: "", Prefiere_Competidor_Por: [...pref].join("; "),
        Dias_Demora_Abono: dias != null ? dias : "", Banco_Abono: banco, Por_Que_No_Necesita: noNec,
        Comentario: ult ? String(ult.comentario || "").replace(/\s+/g, " ").trim() : "", Que_Ofrecio: ACCIONES.filter(a => acc.has(a)).join("; "),
        Derivado_A: deriva.join("; "), Fecha_Volver: ult && ult.fecha_reagenda ? fecha(ult.fecha_reagenda) : null,
        Seguimiento_Canal: s ? s.canal || "" : "", Seguimiento_Resultado: s ? s.resultado || "" : "", Fecha_Seguimiento: s ? fecha(iso(s.hecho_en)) : null,
        Recupero_Paso: r ? RECUP_NOM[r.paso] || r.paso || "" : "", Caso_Soporte: r ? r.caso_soporte || "" : "",
        Reactivado_BBVA: reac, Dias_Con_Trx_Post_Visita: c.dias_trx || 0, Cuenta_Para_Comision: c.bbva_reactivado && (c.dias_trx || 0) >= 2 ? "SI" : hayCorte ? "NO" : "Sin dato en el corte",
        Validacion: ult ? ult.validacion || "" : "", Fuera_De_Plazo: l.length ? (l.some(v => v.fuera_plazo) ? "SI" : "NO") : "",
        // Con frase principal, un solo motivo y submotivo (lo que mide BBVA); sin ella, los de todas las frases, como antes
        Motivo_BBVA: princ ? TIPI_BBVA[princ][0] : [...new Set(tipos.map(t => (TIPI_BBVA[t] || [])[0]).filter(Boolean))].join("; "),
        Submotivo_BBVA: princ ? TIPI_BBVA[princ][1] : [...new Set(tipos.map(t => (TIPI_BBVA[t] || [])[1]).filter(Boolean))].join("; "),
        Feedback_Principal: princ, Accion_BBVA: accP,
        Numero_Ticket: px && px.numero_ticket ? px.numero_ticket : "", Estado_Del_Problema: est,
        Fecha_Resolucion: est === "Hecho" ? fecha(iso(pv.visitado_en)) : null,
        Proxima_Accion: est === "En trámite" ? "Seguimiento hasta la solución" : est === "No se pudo" ? "Pendiente: " + accP : "",
        Fuente_Feedback: tipos.length ? [...fuentes].sort().join(" + ") : "", Fuente_Que_Lo_Convencio: m && m.motivos.length ? (m.fuente === "ejecutivo" ? "Ejecutivo" : "Inferido del comentario") : "" };
      return BASE55.map(h => BASE55_FALTA.has(h) ? "" : val[h] == null ? null : val[h]); });
    const wb = new ExcelJS.Workbook(); wb.creator = "Stratis"; wb.created = new Date();
    const AZ = "FF0C1137", NA = "FFF86F35", GR = "FF5A607A";
    const res = wb.addWorksheet("Resumen"), wsV = wb.addWorksheet("BBVA"), wsB = wb.addWorksheet("Base");
    // Base: cabecera azul, las que faltan capturar en naranja; Documento y Customer_ID como texto (no pierden ceros)
    wsB.addRow(BASE55); filas.forEach(f => wsB.addRow(f));
    const h1 = wsB.getRow(1); h1.height = 40;
    BASE55.forEach((h, i) => { const x = h1.getCell(i + 1); x.font = { name:"Arial", bold:true, size:10, color:{ argb:"FFFFFFFF" } };
      x.fill = { type:"pattern", pattern:"solid", fgColor:{ argb: BASE55_FALTA.has(h) ? NA : AZ } }; x.alignment = { wrapText:true, vertical:"middle" }; });
    wsB.eachRow((row, n) => { if (n > 1) row.eachCell({ includeEmpty:true }, c => c.font = { name:"Arial", size:10 }); });
    BASE55_ANCHO.forEach((w, i) => wsB.getColumn(i + 1).width = w);
    [1, 2].forEach(i => wsB.getColumn(i).numFmt = "@");
    ["Fecha_Primera_Visita","Fecha_Ultima_Visita","Fecha_Primera_Gestion_Con_Contacto","Fecha_Volver","Fecha_Seguimiento","Fecha_Resolucion"].forEach(h => wsB.getColumn(BASE55.indexOf(h) + 1).numFmt = "dd/mm/yyyy");
    wsB.views = [{ state:"frozen", xSplit:1, ySplit:1 }];
    wsB.autoFilter = { from:{ row:1, column:1 }, to:{ row:1, column:BASE55.length } };
    // 03/11 (Jose): hoja «BBVA» con solo lo que BBVA necesita, en su orden: comercio, visita, las 4 fases de su tipificación
    // (con los nombres de su archivo) y su resultado. «Base» queda igual, como respaldo completo de Stratis. Sin el comentario libre
    // (puede traer nombres o teléfonos): va solo en Base (Jose, 03/11). Sin Reactivado_BBVA ni Dias_Con_Trx_Post_Visita: ese cruce
    // sale de la plataforma de BBVA (Jose, 04/11); en Base se quedan.
    const BBVA_COLS = ["Documento","Customer_ID","Nombre_Comercial","Razon_Social","Distrito","Periodo","Ejecutivo",
      "Visitado","Fecha_Primera_Visita","Fecha_Ultima_Visita","Visitas_Validas","Como_Fue_La_Visita","Motivo_Sin_Visita","Direccion_Correcta",
      "Gestion_Con_Contacto","Fecha_Primera_Gestion_Con_Contacto","Con_Quien","Decision","Resultado",
      "Motivo_BBVA","Submotivo_BBVA","Feedback_Principal","Accion_BBVA","Estado_Del_Problema","Numero_Ticket","Fecha_Resolucion","Proxima_Accion",
      "POS_Otra_Marca","Fecha_Volver"];
    const BBVA_NOM = { Motivo_BBVA:"Motivo", Submotivo_BBVA:"Submotivo", Feedback_Principal:"Feedback literal", Accion_BBVA:"Acción original", Estado_Del_Problema:"Estado" };
    const AZB = "FF3B43FB", fasesV = new Set(["Motivo_BBVA","Submotivo_BBVA","Feedback_Principal","Accion_BBVA","Estado_Del_Problema","Numero_Ticket","Fecha_Resolucion","Proxima_Accion"]);
    wsV.addRow(BBVA_COLS.map(h => BBVA_NOM[h] || h)); filas.forEach(f => wsV.addRow(BBVA_COLS.map(h => f[BASE55.indexOf(h)])));
    const hv = wsV.getRow(1); hv.height = 40;
    BBVA_COLS.forEach((h, i) => { const x = hv.getCell(i + 1); x.font = { name:"Arial", bold:true, size:10, color:{ argb:"FFFFFFFF" } };
      x.fill = { type:"pattern", pattern:"solid", fgColor:{ argb: fasesV.has(h) ? AZB : AZ } }; x.alignment = { wrapText:true, vertical:"middle" };
      wsV.getColumn(i + 1).width = BASE55_ANCHO[BASE55.indexOf(h)];
      if (["Fecha_Primera_Visita","Fecha_Ultima_Visita","Fecha_Primera_Gestion_Con_Contacto","Fecha_Resolucion","Fecha_Volver"].includes(h)) wsV.getColumn(i + 1).numFmt = "dd/mm/yyyy"; });
    wsV.eachRow((row, n) => { if (n > 1) row.eachCell({ includeEmpty:true }, c => c.font = { name:"Arial", size:10 }); });
    [1, 2].forEach(i => wsV.getColumn(i).numFmt = "@");
    wsV.views = [{ state:"frozen", xSplit:1, ySplit:1 }];
    wsV.autoFilter = { from:{ row:1, column:1 }, to:{ row:1, column:BBVA_COLS.length } };
    // Resumen: fórmulas sobre la hoja Base (se recalculan en Excel)
    const nB = Math.max(filas.length + 1, 2), L = n => { let s = ""; while (n > 0){ const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
    const RB = h => `Base!$${L(BASE55.indexOf(h) + 1)}$2:$${L(BASE55.indexOf(h) + 1)}$${nB}`;
    const put = (r, c, v, st) => { const x = res.getCell(r, c); x.value = v; x.font = Object.assign({ name:"Arial", size:10 }, st || {}); return x; };
    const ahora = new Date().toLocaleString("en-GB", { timeZone:TZ, day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit", hour12:false }).replace(",", "");
    put(1, 1, "Comercios de la base nueva · periodo " + (per || ""), { size:15, bold:true, color:{ argb:AZ } });
    put(2, 1, `Corte: ${ahora} (hora de Lima). Fuente: CRM de campo (Supabase). Una fila por comercio: la hoja BBVA trae lo que pide BBVA (en azul, las 4 fases de su tipificación) y la hoja Base, las 55 columnas del modelo completo; la llave es el Documento (columna A). Las columnas en naranja son las del modelo que el CRM todavía no captura: van vacías.`, { color:{ argb:GR } });
    // 03/11: cómo quedó lo que pide BBVA para la frase principal (Estado_Del_Problema)
    const ESTADOS_ACC = ["Hecho","En trámite","No se pudo"];
    const cab = ["Ejecutivo","Comercios en la base","Comercios visitados","Con contacto","Éxito","En proceso","No éxito","No se encontró","Sin contacto"]
      .concat(ESTADOS_ACC.map(t => "Lo que pide BBVA: " + t.toLowerCase()));
    cab.forEach((t, i) => { const x = put(4, i + 1, t, { bold:true, color:{ argb:"FFFFFFFF" } }); x.fill = { type:"pattern", pattern:"solid", fgColor:{ argb:AZ } }; x.alignment = { wrapText:true, vertical:"middle" }; });
    const ejs = [...new Set(base.map(o => ejN(o.c)).filter(Boolean))].sort();
    ejs.forEach((e, i) => { const r = 5 + i, q = `${RB("Ejecutivo")},$A${r}`; put(r, 1, e);
      put(r, 2, { formula:`COUNTIF(${q})` }); put(r, 3, { formula:`COUNTIFS(${q},${RB("Visitado")},"SI")` }); put(r, 4, { formula:`COUNTIFS(${q},${RB("Gestion_Con_Contacto")},"SI")` });
      ["Éxito","En proceso","No éxito","No se encontró","Sin contacto"].forEach((t, j) => put(r, 5 + j, { formula:`COUNTIFS(${q},${RB("Resultado")},"${t}")` }));
      ESTADOS_ACC.forEach((t, j) => put(r, 10 + j, { formula:`COUNTIFS(${q},${RB("Estado_Del_Problema")},"${t}")` })); });
    const rt = 5 + ejs.length; put(rt, 1, "Total", { bold:true });
    if (ejs.length) cab.slice(1).forEach((_, j) => { const C = L(j + 2); put(rt, j + 2, { formula:`SUM(${C}5:${C}${rt - 1})` }, { bold:true }); });
    put(rt + 2, 1, "Ojo: el comentario libre puede traer nombres o teléfonos; revísalo antes de compartir el archivo fuera de Stratis. Archivo con datos de comercios: solo en el OneDrive de Stratis.", { size:9, color:{ argb:NA } });
    res.getColumn(1).width = 22; for (let i = 2; i <= cab.length; i++) res.getColumn(i).width = 14; res.getRow(4).height = 30; res.views = [{ showGridLines:false }];
    const buf = await wb.xlsx.writeBuffer();
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([buf], { type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    a.download = `Base_BBVA_Periodo${per ? "_" + per : ""}_${hoyISO().replace(/-/g, "")}.xlsx`; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    toast(`Base para BBVA descargada: ${filas.length} comercios de la base nueva, hojas Resumen, BBVA (29 columnas) y Base (55 columnas del modelo + fuente del feedback y tipificación de BBVA).`);
  } catch(e){ toast("No se pudo armar la base: " + (e.message || e)); }
  S._bajandoBase = false;
}

/* =========================================================================
   Eventos
   ========================================================================= */
document.addEventListener("click", ev => {
  if (!ev.target.closest("[data-otro-usuario]")) return;
  S.denegado = false; S.error = ""; S.sesion = null; pintar();
});
document.addEventListener("submit", async ev => {
  if (ev.target.id === "fClave"){ ev.preventDefault();
    const c1 = $("#cClave1").value, c2 = $("#cClave2").value, n = S.nuevaClave;
    if (c1.length < 8){ n.error = "La contraseña debe tener al menos 8 caracteres."; return pintar(); }
    if (c1 !== c2){ n.error = "Las dos contraseñas no coinciden. Escríbelas de nuevo."; return pintar(); }
    n.error = ""; n.enviando = true; pintar();
    let error = null; try { ({ error } = await sb.auth.updateUser({ password:c1 })); } catch(e){ error = e; }
    n.enviando = false;
    if (error && (error.code === "same_password" || /different|same/i.test(error.message || ""))){ n.error = "Esa es tu contraseña actual: elige una distinta."; return pintar(); }
    if (error){ n.error = "No se guardó (" + (error.message || "error desconocido") + "). Pide un enlace nuevo con «¿Olvidaste tu contraseña?»."; return pintar(); }
    n.lista = true; pintar(); return; }
  if (ev.target.id !== "fLogin") return; ev.preventDefault();
  const b = $("#bEntrar"); b.disabled = true; b.textContent = "Entrando…"; $("#lErr").innerHTML = "";
  const { data, error } = await sb.auth.signInWithPassword({ email:$("#lCorreo").value.trim().toLowerCase(), password:$("#lClave").value });
  if (error){ $("#lErr").innerHTML = `<div class="aviso mal err">${esc(/invalid/i.test(error.message) ? "Correo o contraseña incorrectos." : error.message)}</div>`; b.disabled = false; b.textContent = "Entrar"; return; }
  S.sesion = data.session; cargar();
});
document.addEventListener("click", async ev => {
  const o = ev.target.closest("[data-olvide],[data-nueva-clave],[data-clave-seguir],[data-clave-cancelar]");
  if (o){
    if (o.hasAttribute("data-nueva-clave")){ S.nuevaClave = {}; pintar(); return; }
    if (o.hasAttribute("data-clave-cancelar") || o.hasAttribute("data-clave-seguir")){ S.nuevaClave = null; try { history.replaceState(null, "", location.pathname + location.search); } catch(e){} if (S.sesion && !S.yo && !S.cargando && !S.error) cargar(); else pintar(); return; }
    const correo = ($("#lCorreo") || {}).value ? $("#lCorreo").value.trim().toLowerCase() : "";
    if (!correo){ $("#lErr").innerHTML = `<div class="aviso mal err">Escribe tu correo arriba y vuelve a tocar «¿Olvidaste tu contraseña?».</div>`; return; }
    try { await sb.auth.resetPasswordForEmail(correo, { redirectTo: location.origin + location.pathname }); } catch(e){}
    $("#lErr").innerHTML = `<div class="aviso">Si ese correo tiene acceso, te enviamos un enlace para crear tu contraseña. Dura 60 minutos.</div>`; return; }
  const t = ev.target.closest("[data-recup-validar],[data-recup-observar],[data-descartar-ret],[data-base-bbva],[data-ir-dia],[data-mdist],#btnTema,#btnModo,[data-reac-reintentar],[data-eje],[data-vista],[data-filtro],[data-sel],[data-accion],[data-cancelar],[data-confirmar],[data-tab],[data-traza],[data-copiar],[data-ir-cola],[data-ir-traza],[data-tipo],[data-salir],[data-refrescar],#elegir,#otroArchivo,#cargar,#guardarTotales,#otraCarga,#valBloque,#limpiarSel,#btnPausa");
  if (!t) return;
  if (t.hasAttribute("data-recup-validar")){ validarRecupero(t.dataset.recupValidar, true); return; }
  if (t.hasAttribute("data-recup-observar")){ validarRecupero(t.dataset.recupObservar, false); return; }
  if (t.hasAttribute("data-descartar-ret")){
    const uid = t.dataset.descartarRet, r = (S.retenidas || []).find(x => x.cliente_uid === uid); if (!r) return;
    const nota = prompt(`¿Descartar la visita retenida de ${r.ejecutivo || r.correo} en ${r.comercio || idTxt(r.customer_id)}? Su celular la quita al sincronizar.\n\nNota (opcional):`, "");
    if (nota === null) return;
    const { error } = await sb.rpc("v2_descartar_retenida", { p_cliente_uid: uid, p_nota: nota.trim() || null });
    if (error){ toast("No se descartó: " + error.message); return; }
    await cargarRetenidas(); toast("Descartada. El celular la quita al sincronizar."); pintar(); return;
  }
  if (t.hasAttribute("data-base-bbva")){ baseBBVA(); return; }
  if (t.hasAttribute("data-salir")){ await sb.auth.signOut(); location.reload(); return; }
  if (t.hasAttribute("data-refrescar")){ S.bit = {}; await cargarActividad(); await cargarBase(); await cargarFbInferido(); await cargarMsiInferido(); toast("Actualizado."); pintar(); return; }
  if (t.id === "btnPausa"){ S.pausa = !S.pausa; pintar(); return; }
  if (t.id === "btnTema"){ cambiarTema(); return; }
  if (t.dataset.irDia){ S.vista = "validacion"; S.filtro = "todos"; S.dia = t.dataset.irDia; elegirEj(t.dataset.irEj || "todos"); S.accion = null; try { history.replaceState(null, "", "#validacion"); } catch(e){} pintar(); return; }
  if (t.dataset.reacReintentar){ if (S.reac) delete S.reac[t.dataset.reacReintentar]; pintar(); return; }
  if (t.id === "btnModo"){ S.sel = null; S.muSel = null; S.accion = null;
    if (S.modo !== "eje"){ S._antesEje = { vista: S.vista, ej: S.ej, filtro: S.filtro, dia: S.dia }; S.modo = "eje"; S.vista = "miavance"; }
    else { const a = S._antesEje || { vista: "directorio", ej: "todos" }; S.modo = "sup"; S.vista = a.vista; if (a.filtro) S.filtro = a.filtro; if (a.dia) S.dia = a.dia; elegirEj(a.ej); }
    pintar(); return; }
  if (t.dataset.eje){ const k = t.dataset.eje; S.vista = k === "avance" ? "miavance" : k === "cartera" ? "cartera" : k === "actividad" ? "validacion" : "mapa"; if (k === "actividad"){ S.filtro = "todos"; S.dia = "periodo"; S.accion = null; } if (k === "alertas") S.muTab = "ale"; else if (k === "mapa") S.muTab = "dis"; S.muSel = null; S.sel = null; pintar(); return; }
  if (t.dataset.vista){ S.vista = t.dataset.vista; if (t.dataset.tab) S.tab = t.dataset.tab; S.accion = null; try { history.replaceState(null, "", "#" + S.vista); } catch(e){} pintar(); return; }
  if (t.dataset.filtro){ S.filtro = t.dataset.filtro; S.sel = null; S.accion = null; pintar(); return; }
  if (t.dataset.sel){ if (ev.target.closest("input")) return; S.sel = t.dataset.sel; S.accion = null; pintar(); return; }
  if (t.dataset.accion){
    const a = t.dataset.accion, id = S.sel;
    if (a === "val" || a === "rest" || a === "rech" || a === "cola"){
      const ok = await accion(id, a);
      if (ok){ toast(a === "val" ? "Validada." : a === "rest" ? "Restituida. Vuelve a contar." : a === "rech" ? "Pedido rechazado. La visita sigue contando." : "Observación levantada. Vuelve a la cola."); if (a === "val" && S.filtro === "pend") siguientePendiente(id); pintar(); }
    } else { S.accion = a; pintar(); $("#mSel")?.focus(); }
    return;
  }
  if (t.hasAttribute("data-cancelar")){ S.accion = null; pintar(); return; }
  if (t.dataset.confirmar){ const id = S.sel; const m = $("#mSel").value, n = $("#mNota").value.trim(); const tipo = t.dataset.confirmar;
    if ((m === "Otro" && n.length < 5) || (tipo === "obs" && n.length === 0 && m === "Otro")){ toast("Con el motivo «Otro» escribe en la nota qué hay que revisar."); $("#mNota").focus(); return; } const ok = await accion(id, tipo, m, n); if (ok){ toast(tipo === "obs" ? "Observada. El ejecutivo la ve en revisión." : "Anulada. Ya no cuenta."); if (S.filtro === "pend") siguientePendiente(id); pintar(); } return; }
  if (t.id === "valBloque"){ let n = 0; for (const id of [...S.marcadas]){ const v = S.act.find(x=>x.id===id); if (v && estadoDe(v) === "pend" && senales(v).length === 0){ const r = await sb.rpc("v2_validar_visita", { p_visita_id:id, p_estado:"validada" }); if (!r.error) n++; } } S.marcadas.clear(); await cargarActividad(true); toast(`${n} visitas validadas en bloque.`); pintar(); return; }
  if (t.id === "limpiarSel"){ S.marcadas.clear(); pintar(); return; }
  if (t.dataset.tab){ S.tab = t.dataset.tab; pintar(); return; }
  if (t.dataset.traza){ S.traza = t.dataset.traza; pintar(); return; }
  if (t.dataset.irTraza){ S.vista = "auditoria"; S.tab = "traza"; S.traza = t.dataset.irTraza; S.busca = ""; pintar(); return; }
  if (t.dataset.irCola){ S.vista = "validacion"; S.filtro = "todos"; S.dia = "periodo"; if (S.ej !== "todos" && (S.act.find(v => v.id === t.dataset.irCola) || {}).correo !== S.ej) elegirEj("todos"); S.sel = t.dataset.irCola; pintar(); return; }
  if (t.hasAttribute("data-copiar")){ const txt = $("#trazaTxt").value; (navigator.clipboard?.writeText(txt) || Promise.reject()).then(() => toast("Trazabilidad copiada como texto.")).catch(() => { const ta = $("#trazaTxt"); ta.style.position = "static"; ta.select(); toast("Selecciona y copia el texto."); }); return; }
  if (t.dataset.tipo){ S.carga = { tipo:t.dataset.tipo, archivo:null, filas:null, hecho:false, resultado:null }; pintar(); return; }
  if (t.id === "elegir"){ $("#archivo").click(); return; }
  if (t.id === "otroArchivo" || t.id === "otraCarga"){ S.carga = { tipo:S.carga.tipo, archivo:null, filas:null, hecho:false, resultado:null }; pintar(); return; }
  if (t.id === "guardarTotales"){ if (!S.ocupado) guardarTotales(); return; }
  if (t.id === "cargar"){ if (!S.ocupado) (S.carga.tipo === "resultados_bbva" ? cargarBBVA() : cargarFilas()); return; }
});
document.addEventListener("change", ev => {
  if (ev.target.id === "bbvaCorte" && S.carga){ S.carga.corte = ev.target.value; pintar(); return; }
  if (ev.target.id === "totCorte" && S.carga && S.carga.tot){ const u = (S.totBBVA || []).find(x => x.corte === ev.target.value);
    if (u) prellenarTotales(u); else S.carga.tot.corte = ev.target.value; pintar(); return; }
  const t = ev.target;
  if (t.id === "gEj"){ elegirEj(t.value); pintar(); }
  if (t.id === "fDia"){ S.dia = t.value; S.sel = null; pintar(); }
  if (t.id === "fSenal"){ S.soloSenal = t.checked; S.sel = null; pintar(); }
  if (t.dataset.marca){ if (t.checked) S.marcadas.add(t.dataset.marca); else S.marcadas.delete(t.dataset.marca); pintar(); }
  if (t.id === "archivo" && t.files[0]) leerArchivo(t.files[0]);
});
document.addEventListener("input", ev => { if (ev.target.id === "bbvaTotal" && S.carga){ S.carga.facturadoTotal = ev.target.value; return; }
  if (ev.target.dataset && ev.target.dataset.tot && S.carga && S.carga.tot){ S.carga.tot.v[ev.target.dataset.tot] = ev.target.value; refrescarTotales(); return; }
  if (ev.target.id === "totNotas" && S.carga && S.carga.tot){ S.carga.tot.notas = ev.target.value; return; } if (ev.target.id === "qTraza"){ S.busca = ev.target.value; S.traza = null; const pos = ev.target.selectionStart; pintar(); const q = $("#qTraza"); q.focus(); q.setSelectionRange(pos, pos); } });
document.addEventListener("dragover", ev => { const d = ev.target.closest("#drop"); if (d){ ev.preventDefault(); d.classList.add("over"); } });
document.addEventListener("dragleave", ev => { const d = ev.target.closest("#drop"); if (d) d.classList.remove("over"); });
document.addEventListener("drop", ev => { const d = ev.target.closest("#drop"); if (!d) return; ev.preventDefault(); d.classList.remove("over"); const f = ev.dataTransfer.files[0]; if (f) leerArchivo(f); });
document.addEventListener("keydown", ev => {
  if (!S.sesion || S.vista !== "validacion" || ["INPUT","TEXTAREA","SELECT"].includes(document.activeElement.tagName)) return;
  const l = filtradas(); const i = l.findIndex(v => v.id === S.sel);
  if (ev.key === "ArrowDown" && l[i+1]){ S.sel = l[i+1].id; S.accion = null; pintar(); ev.preventDefault(); }
  if (ev.key === "ArrowUp" && l[i-1]){ S.sel = l[i-1].id; S.accion = null; pintar(); ev.preventDefault(); }
  if (S.modo === "eje") return;
  if (ev.key.toLowerCase() === "v" && S.sel){ const v = S.act.find(x=>x.id===S.sel); if (v && estadoDe(v) !== "anu" && estadoDe(v) !== "val") accion(S.sel, "val").then(ok => { if (ok){ toast("Validada."); if (S.filtro === "pend") siguientePendiente(S.sel); pintar(); } }); }
  if (ev.key.toLowerCase() === "o" && S.sel){ S.accion = "obs"; pintar(); $("#mSel")?.focus(); }
  if (ev.key.toLowerCase() === "a" && S.sel){ S.accion = "anu"; pintar(); $("#mSel")?.focus(); }
  if (ev.key === "Escape" && S.accion){ S.accion = null; pintar(); }
});

document.addEventListener("click", ev => {
  const b = ev.target.closest("[data-dirper]"); if (b){ const id = b.dataset.dirper; if (S.dirDatos && S.dirDatos[id] && S.dirDatos[id].err) delete S.dirDatos[id]; S.dirPer = id; pintar(); } });
/* ---------- arranque ---------- */
(async function(){
  try { const h = location.hash.replace("#",""); if (["directorio","resumen","tiempos","reporte","validacion","cartera","seguimiento","bloques","equipo","mapa","cierres","cargas"].includes(h)) S.vista = h; } catch(e){}
  if (/type=recovery/.test(location.hash)) S.nuevaClave = {};   // llega por el enlace del correo de recuperación
  const { data } = await sb.auth.getSession();
  S.sesion = data.session || null;
  sb.auth.onAuthStateChange((ev, ses) => { if (ev === "PASSWORD_RECOVERY"){ S.sesion = ses || S.sesion; S.nuevaClave = S.nuevaClave || {}; pintar(); } else if (ev === "SIGNED_OUT"){ S.sesion = null; S.yo = null; pintar(); } else if (ses) S.sesion = ses; });
  if (S.sesion) cargar(); else { S.cargando = false; pintar(); }
})();

// Presentación y reporte para directorio: eliminados (Jose, 26/11/2026). Quedan en el historial de git.
const numPE = x => Number(x || 0).toLocaleString("de-DE");   // punto de miles y coma decimal, como el Excel de Jose
document.addEventListener("click", ev => { const t = ev.target.closest("[data-ttab]"); if (!t) return; S.tTab = t.dataset.ttab; pintar(); });
document.addEventListener("change", ev => { if (ev.target.id === "tDia" && ev.target.value){ S.tDia = ev.target.value; pintar(); } });
document.addEventListener("click", ev => { const m = document.getElementById("opmenu"); if (m && m.open && ev.target.closest(".opmenu-menu .btn")) m.querySelector("summary").focus(); if (m && m.open && (!ev.target.closest("#opmenu") || ev.target.closest(".opmenu-menu .btn"))) m.open = false; });
document.addEventListener("keydown", ev => { const m = document.getElementById("opmenu"); if (ev.key === "Escape" && m && m.open){ m.open = false; m.querySelector("summary").focus(); } });
document.addEventListener("click", ev => { const t = ev.target.closest("[data-tdia-mas]"); if (!t) return; const d = new Date((S.tDia || hoyISO()) + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + Number(t.dataset.tdiaMas)); S.tDia = d.toISOString().slice(0, 10); pintar(); });
document.addEventListener("change", ev => { if (ev.target.id !== "cabPer") return; const id = ev.target.value;
  if (S.dirDatos && S.dirDatos[id] && S.dirDatos[id].err) delete S.dirDatos[id];
  S.dirPer = id; S.mPer = id; S.uPer = id; S.mDist = null; S.mVista = null; S.mEnfocar = null; S.mDia = ""; S.mFr = ""; S.muSel = null; S.muVista = null; S.uSel = null; S.alSel = null;
  if (S.periodo && id !== S.periodo.id) S.mRango = "periodo"; pintar(); });
document.addEventListener("change", ev => { if (ev.target.id !== "muEj") return; S.muSel = null; S.muVista = null; elegirEj(ev.target.value); });
document.addEventListener("change", ev => { const i = ev.target.id; if (i === "carEst") S.carEst = ev.target.value; else if (i === "carQ") S.carQ = ev.target.value; else return; pintar(); });
document.addEventListener("click", ev => { if (!ev.target.closest("[data-reintentar-cierres]")) return; if (S.cierres) S.cierres.t = 0; cargarCierres(); pintar(); });
