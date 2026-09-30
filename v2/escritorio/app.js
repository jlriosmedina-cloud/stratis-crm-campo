
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
  ["Atención y soporte", ["Soporte no ayudó al comercio", "Su funcionario de BBVA no responde"]],
  ["Decisión y necesidad", ["No se encontraba la persona que tomaba decisiones", "No necesitaba los POS", "Desconfía de la visita (duda que representemos a BBVA)", "No pidió el POS"]],
];
const ACCIONES = ["Evaluar mejora de tasa", "Expliqué cómo y cuándo abona Openpay", "Ofrecí evaluación de préstamo BBVA", "Mostré los beneficios de cobrar con tarjeta",
  "Revisar la tarifa acordada con BBVA", "Validé el estado del equipo", "Descarté errores en sitio (reinicio, chip, batería)", "Solicité reposición de contómetros",
  "Solicité cambio de equipo (sin costo)", "Solicité cambio de equipo (con costo)", "Capacitación en el momento", "Capacitación programada", "Llamé a soporte", "Generé ticket de atención", "Seguimiento del caso",
  "Derivé a postventa", "Derivé a BBVA con urgencia", "Reagendé con quien decide", "Otra acción"];
const COMPETIDORES = ["Niubiz", "Izipay", "Culqi", "Mercado Pago", "Otro"];
// Los 11 textos que envió BBVA; el resto del árbol lo agregó Stratis
const FB_BBVA = new Set(["No se encontraba la persona que tomaba decisiones", "No necesitaba los POS", "POS no enciende", "Soporte no ayudó al comercio",
  "Mala Señal en el POS", "POS no tiene señal y no puedo cobrar", "POS no cuenta con la tarifa acordada", "POS problema con abonos",
  "POS queda procesando el pago , se demora", "El cobro a través del POS tarda demasiado cuando existe alta demanda", "POS rechaza los pagos con tarjeta"]);
// Texto del competidor: «Izipay, Vendemás a 2,9 %»
// Qué cambió el ejecutivo respecto de lo que propuso la IA
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
// Demora de abonos (26/09): «4 días · le abonan en otro banco»
const FB_DEMORA = "Los abonos le llegan con demora";
function demoraTxt(x){
  if (!x || (x.dias_demora_abono == null && !x.banco_abono)) return "";
  return [x.dias_demora_abono != null ? x.dias_demora_abono + " día" + (Number(x.dias_demora_abono) === 1 ? "" : "s") : "", x.banco_abono ? "le abonan en " + (x.banco_abono === "BBVA" ? "BBVA" : "otro banco") : ""].filter(Boolean).join(" · ");
}
function competidorTxt(x){
  if (!x || !(x.competidores || []).length) return "";
  return x.competidores.map(c => c === "Otro" && x.competidor_otro ? x.competidor_otro : c).join(", ") + (x.tasa_competidor != null ? " a " + String(x.tasa_competidor).replace(".", ",") + " %" : "");
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
const hoyISO = () => new Date().toLocaleDateString("en-CA",{ timeZone:TZ });
const ayerISO = () => { const d = new Date(hoyISO() + "T12:00:00Z"); d.setUTCDate(d.getUTCDate()-1); return d.toISOString().slice(0,10); };
const mDist = m => m == null ? "sin ubicación" : m < 1000 ? `${m} m` : `${(m/1000).toFixed(1).replace(".",",")} km`;
const claseDist = v => v.distancia_m == null ? "no" : v.distancia_m <= REGLA.cerca ? "ok" : v.distancia_m <= REGLA.lejos ? "med" : "mal";
const tasa = v => v == null ? "—" : (Number(v)*100).toFixed(2).replace(".",",") + " %";
const nombreCorto = n => String(n || "").split(" ")[0];
const num = n => Number(n || 0).toLocaleString("es-PE");

/* ---------- estado ---------- */
const S = { sesion:null, yo:null, admin:false, periodo:null, cargando:true, error:"",
  vista:"validacion", filtro:"todos", ej:"todos", dia:"hoy", soloSenal:false, sel:null, marcadas:new Set(), accion:null, ocupado:false,
  act:[], actEn:null, base:[], baseMap:{}, ejecutivos:[], bit:{}, trx:{}, nuevas:new Set(), pausa:false, ultimaRecep:null,
  tab:"traza", traza:null, busca:"", carga:{ tipo:"diario", archivo:null, filas:null, hecho:false, resultado:null }, cargas:[], avance:null, avanceErr:"", retenidas:[] };

const ICON = {
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
    if (acc.data !== true){ S.denegado = true; await sb.auth.signOut().catch(() => {}); S.sesion = null; throw new Error("La vista de escritorio todavía no está habilitada para tu usuario. Tu CRM de campo sigue en el celular, igual que siempre."); }
    S.yo = u.data; S.admin = true;
    S.periodo = p.data || null;
    const us = await sb.from("usuarios").select("correo,nombre,nombre_corto,rol,activo").eq("activo", true).order("nombre");
    S.ejecutivos = (us.data || []).filter(x => x.rol === "Ejecutivo").map((x, i) => ({ correo:x.correo, nombre:x.nombre_corto || x.nombre, ini:iniciales(x.nombre_corto || x.nombre), color:COLORES[i % COLORES.length] }));
    await Promise.all([cargarActividad(true), cargarBase(), cargarAvance(), cargarFbInferido(), cargarMsiInferido(), cargarRetenidas()]);
  } catch(e){ S.error = e.message || String(e); }
  S.cargando = false; pintar();
  if (!S.error) escuchar();
}
async function cargarActividad(silencio){
  if (S._actCargando) return; S._actCargando = true;
  const desde = (S.periodo && S.periodo.ini) || ayerISO();
  const [{ data, error }] = await Promise.all([sb.rpc("v2_actividad", { p_desde: desde, p_hasta: hoyISO() }), cargarRetenidas()]);
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
  if (!silencio) S.bit = {};
  pintar();
}
// Visitas retenidas en los celulares: el servidor las rechazó y el ejecutivo no puede corregirlas. Decide Jose.
async function cargarRetenidas(){
  const { data, error } = await sb.rpc("v2_retenidas");
  if (!error) S.retenidas = data || [];
}
async function cargarBase(){
  const { data } = await sb.rpc("v2_mi_base");
  S.base = data || []; S.baseMap = {}; S.base.forEach(c => { S.baseMap[c.customer_id] = c; });
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
const VISTAS = [
  ["validacion","Visitas", ICON.cola, () => S.act.filter(v => v.estado_anul === "pendiente" || estadoDe(v) === "pend").length + (S.retenidas || []).length],
  ["equipo","Por ejecutivo", ICON.equipo, null],
  ["mapa","Mapa de distritos", ICON.mapa, null],
  ["feedback","Feedback", ICON.fb, null],
  ["porque","Por qué sí / no", ICON.pq, null],
  ["auditoria","Auditoría", ICON.aud, null],
  ["cargas","Cargas", ICON.carga, null],
  ["indicadores","Indicadores", ICON.ind, null],
];
function pintarNav(){
  $("#nav").innerHTML = `<div class="sec">Mi trabajo</div>` + VISTAS.map(([k,t,i,c]) => `<button class="${S.vista===k?"on":""}" data-vista="${k}">${i}${t}${c ? `<span class="cnt">${c()}</span>` : ""}</button>`).join("");
  const p = S.periodo;
  $("#pieRail").innerHTML = p ? `<b>Periodo ${esc(p.id)} · ${fISO(p.ini)} – ${fISO(p.fin)}</b>${S.base.length} comercios · ${S.ejecutivos.length} ejecutivos · build ${BUILD}` : `<b>Sin periodo abierto</b>build ${BUILD}`;
}
function pintar(){
  const app = $("#app");
  if (!S.sesion && !S.denegado){ app.innerHTML = vistaLogin(); return; }
  if (S.cargando){ app.innerHTML = `<div class="cargando"><span class="spin"></span>Cargando el CRM…</div>`; return; }
  if (S.error){ app.innerHTML = `<div class="login"><div class="caja"><div class="marca">STRATIS</div><h1>${S.denegado ? "Esta vista no es para tu usuario" : "No se pudo entrar"}</h1><p>${esc(S.error)}</p>${S.denegado ? `<a class="btn p" href="../" style="text-decoration:none">Ir al CRM de campo</a><button class="btn" data-otro-usuario style="margin-top:8px">Entrar con otro usuario</button>` : `<button class="btn" data-salir>${ICON.salir} Salir</button>`}</div></div>`; return; }
  if (!app.querySelector(".rail")) app.innerHTML = cascaron();
  pintarNav();
  $("#vivoTxt").textContent = S.pausa ? "Actualización en pausa" : textoVivo();
  $("#vivo").classList.toggle("pausa", S.pausa);
  $("#btnPausa").textContent = S.pausa ? "Reanudar" : "Pausar";
  $("#ahora").textContent = S.actEn ? hh(S.actEn) : "—";
  $("#quien").innerHTML = `<span class="avatar" style="background:var(--naranja)">${esc(iniciales(S.yo.nombre_corto || S.yo.nombre))}</span>${esc(nombreCorto(S.yo.nombre_corto || S.yo.nombre))} · ${esc(S.yo.rol.toLowerCase())}`;
  const c = $("#contenido");
  const T = { validacion:["Visitas registradas","Las visitas se aceptan como las registra el ejecutivo, sin validar la dirección. Si ves algo puntual puedes observarla (el ejecutivo la ve «en revisión» y la corrige) o anularla (deja de contar)."],
              equipo:["Gestiones por ejecutivo","Comercios visitados por día contra la meta diaria, y cómo terminó cada gestión. Haz clic en un día para ver sus visitas."],
              mapa:["Mapa de distritos","Lima Metropolitana y Callao: qué distritos trabaja cada ejecutivo y cómo va la gestión en cada uno. Haz clic en un distrito para ver su detalle."],
              feedback:["Feedback de la visita","Lo que el comercio le dijo al ejecutivo y qué le ofreció, en el árbol de feedback (los 11 tipos de BBVA más los agregados por Stratis). Marcado por el ejecutivo desde el 24/09; las visitas anteriores, inferidas del comentario."],
              porque:["Por qué sí / por qué no","Por qué tenemos éxito en unas visitas y en otras no: el resultado de cada comercio por su última visita, qué convenció a los que dijeron que sí y qué frenó a los demás."],
              auditoria:["Modo auditoría","Trazabilidad de cada registro, patrones por ejecutivo y cruce con la data de BBVA."],
              cargas:["Cargas","Carga la data que envía BBVA: transacciones y resultados de reactivación. La base y la presentación para BBVA se descargan con los botones de arriba."],
              indicadores:["Indicadores del equipo","La misma medición que ve cada ejecutivo en «Mi avance», comparada."] };
  $("#titulo").textContent = T[S.vista][0]; $("#subtitulo").textContent = T[S.vista][1];
  $("#btnTema").innerHTML = temaActual() === "dark" ? `${ICON.sol} Claro` : `${ICON.luna} Oscuro`;
  if (S._mapa){ try { S._mapa.off(); S._mapa.stop && S._mapa.stop(); S._mapa.remove(); } catch(e){} S._mapa = null; }
  const ae = document.activeElement, foco = ae && ae.id && c.contains(ae) ? { id:ae.id, s:ae.selectionStart, e:ae.selectionEnd } : null;
  const campos = {}; ["mSel","mNota","qTraza"].forEach(id => { const el = document.getElementById(id); if (el) campos[id] = el.value; });
  const mismo = S._pinto && S._pinto.vista === S.vista && S._pinto.sel === S.sel && S._pinto.tab === S.tab;
  const scrolls = mismo ? [".tabla-wrap",".ficha .cuerpo",".lista",".contenido"].map(q => { const el = c.querySelector(q) || (q === ".contenido" ? c : null); return [q, el ? el.scrollTop : 0]; }) : [];
  c.innerHTML = S.vista === "validacion" ? vistaValidacion() : S.vista === "equipo" ? vistaEquipo() : S.vista === "mapa" ? vistaMapa() : S.vista === "feedback" ? vistaFeedback() : S.vista === "porque" ? vistaPorQue() : S.vista === "auditoria" ? vistaAuditoria() : S.vista === "cargas" ? vistaCargas() : vistaIndicadores();
  Object.entries(campos).forEach(([id, v]) => { const el = document.getElementById(id); if (el && el.value !== v && !(id === "mSel" && ![...el.options].some(o => o.value === v))) el.value = v; });
  scrolls.forEach(([q, t]) => { const el = q === ".contenido" ? c : c.querySelector(q); if (el) el.scrollTop = t; });
  if (foco){ const el = document.getElementById(foco.id); if (el){ el.focus(); try { if (foco.s != null) el.setSelectionRange(foco.s, foco.e); } catch(e){} } }
  S._pinto = { vista:S.vista, sel:S.sel, tab:S.tab };
  despuesDePintar();
}
function despuesDePintar(){ const el = document.getElementById("mapaVisita"); if (el) montarMapa(el); const md = document.getElementById("mapaDist"); if (md) montarMapaDistritos(md); }
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
        <span class="vivo" id="vivo"><i></i><span id="vivoTxt"></span></span>
        <button class="btn" id="btnPausa" title="Pausar la actualización automática">Pausar</button>
        <button class="btn" data-refrescar title="Volver a leer la actividad">Actualizar</button>
        <button class="btn" data-base-bbva title="Excel del periodo para enviar a BBVA: hoja KPIs y hoja Base (una fila por Customer ID)">Base para BBVA</button>
        <button class="btn" data-ppt-bbva title="PowerPoint semanal para BBVA y Mastercard, con los datos al corte que elijas">Presentación BBVA</button>
        <button class="btn" id="btnTema" title="Cambiar entre tema claro y oscuro"></button>
        <span class="per">leído a las <b id="ahora"></b></span>
        <span class="usuario" id="quien"></span>
        <button class="btn q" data-salir title="Cerrar sesión">${ICON.salir}</button>
      </div>
    </header>
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
  </form></div>`;
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
    ${l.map(r => `<tr><td>${esc(r.ejecutivo || r.correo)}</td><td>${esc(r.comercio || "—")}<br><small class="muted">ID ${esc(r.customer_id || "—")}</small></td>
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
  const comerciosVis = new Set(S.act.filter(v => v.estado_anul !== "anulada" && v.lat != null && !v.fuera_plazo).map(v => v.customer_id)).size;
  const cnt = k => S.act.filter(v => (k === "todos" || estadoDe(v) === k) && (S.dia !== "hoy" || esHoy(v)) && (S.dia !== "ayer" || esAyer(v)) && (!/^\d{4}-/.test(S.dia) || iso(v.visitado_en) === S.dia) && (S.ej === "todos" || v.correo === S.ej)).length;
  const lista = filtradas();
  if (S.sel && !S.act.find(v => v.id === S.sel)) S.sel = null;
  if (!S.sel && lista.length) S.sel = lista[0].id;
  const sel = S.act.find(v => v.id === S.sel);
  const metaEq = 160 * Math.max(1, S.ejecutivos.length);
  // Zona insegura u otro motivo, por ejecutivo, sobre sus visitas no anuladas del periodo (señal que no bloquea)
  const activas = S.act.filter(v => v.estado_anul !== "anulada"), esRev = v => v.con === "Nadie" && MOTIVOS_REVISAR.includes(v.motivo);
  const porEj = S.ejecutivos.map(e => { const l = activas.filter(v => v.correo === e.correo), n = l.filter(esRev).length; return { e, n, t:l.length, p:l.length ? Math.round(n * 100 / l.length) : 0 }; })
    .filter(x => x.t).sort((a, b) => b.p - a.p || b.n - a.n);
  const nRev = activas.filter(esRev).length;
  return `${panelRetenidas()}
  <div class="resumen">
    <div class="tile"><div class="k">Visitas hoy</div><div class="v num">${hoy.length}</div><div class="d">${S.ejecutivos.map(e => `${esc(e.ini)} ${hoy.filter(v => v.correo === e.correo).length}`).join(" · ") || "sin ejecutivos"}</div></div>
    <div class="tile ${obs.length ? "warn" : ""}"><div class="k">Observadas</div><div class="v num">${obs.length}</div><div class="d">el ejecutivo las ve «en revisión»</div></div>
    <div class="tile ${sinGps ? "bad" : "ok"}"><div class="k">Sin GPS hoy</div><div class="v num">${sinGps}</div><div class="d">sin ubicación no cuentan como visita</div></div>
    <div class="tile ${nRev ? "warn" : ""}" title="Visitas con «Zona insegura» u «Otro motivo» sobre todas las visitas no anuladas del periodo de cada ejecutivo, incluidas las sin GPS o fuera de plazo (no es la misma base que «Comercios visitados»). Cuentan como visita; solo es para revisar el comentario."><div class="k">Zona insegura u otro motivo</div><div class="v num">${nRev}</div><div class="d">${porEj.map(x => `${esc(x.e.ini)} ${x.p} %`).join(" · ") || "sin visitas"}</div></div>
    <div class="tile ${pedidos ? "warn" : ""}"><div class="k">Pedidos de anulación</div><div class="v num">${pedidos}</div><div class="d">esperan tu decisión</div></div>
    <div class="tile acc"><div class="k">Comercios visitados</div><div class="v num">${comerciosVis}<small> / ${metaEq}</small></div><div class="d">${cuentan} visitas en el periodo · ${validas} validadas</div></div>
  </div>
  <div class="split">
    <div class="panel">
      <div class="barra">
        <div class="chips">
          ${[["todos","Todas"],["obs","Observadas"],["anu","Anuladas"]].concat(cnt("pend") ? [["pend","Por validar"]] : []).map(([k,t]) => `<button class="chip ${S.filtro===k?"on":""}" data-filtro="${k}">${t}<span class="c num">${cnt(k)}</span></button>`).join("")}
        </div>
        <div class="der">
          <select class="sel" id="fEj"><option value="todos">Todos los ejecutivos</option>${S.ejecutivos.map(e=>`<option value="${esc(e.correo)}" ${S.ej===e.correo?"selected":""}>${esc(e.nombre)}</option>`).join("")}</select>
          <select class="sel" id="fDia"><option value="hoy" ${S.dia==="hoy"?"selected":""}>Hoy ${fISO(hoyISO())}</option><option value="ayer" ${S.dia==="ayer"?"selected":""}>Ayer ${fISO(ayerISO())}</option><option value="periodo" ${S.dia==="periodo"?"selected":""}>Todo el periodo</option>${diasPeriodo().filter(d => d.iso !== hoyISO() && d.iso !== ayerISO()).reverse().map(d => `<option value="${d.iso}" ${S.dia===d.iso?"selected":""}>${DOW[d.dow]} ${fISO(d.iso)}</option>`).join("")}</select>
          <label class="lbl"><input type="checkbox" id="fSenal" ${S.soloSenal?"checked":""}> Solo con señales</label>
        </div>
      </div>
      ${S.marcadas.size ? `<div class="barra" style="background:var(--azul-t)"><b class="num">${S.marcadas.size} seleccionadas</b><span class="lbl">en bloque solo se validan las que no tienen señales</span><div class="der"><button class="btn v" id="valBloque">${ICON.ok} Validar ${[...S.marcadas].filter(id => { const v = S.act.find(x=>x.id===id); return v && senales(v).length===0; }).length} sin señales</button><button class="btn" id="limpiarSel">Quitar selección</button></div></div>` : ""}
      <div class="tabla-wrap">
      ${lista.length ? `<table class="cola"><thead><tr><th class="chk"></th><th>Hora</th><th>Ejecutivo</th><th>Comercio</th><th>Resultado</th><th>Señales</th>${S.filtro === "todos" ? "<th>Estado</th>" : ""}</tr></thead><tbody>
        ${lista.slice(0, 400).map(v => { const e = ejDe(v.correo), sn = senales(v); return `
        <tr class="f ${S.sel===v.id?"sel":""} ${S.nuevas.has(v.id)?"nueva":""}" data-sel="${v.id}">
          <td class="chk"><input type="checkbox" data-marca="${v.id}" ${S.marcadas.has(v.id)?"checked":""} ${estadoDe(v)!=="pend"?"disabled":""} aria-label="Seleccionar"></td>
          <td class="num"><b>${hh(v.visitado_en)}</b>${esHoy(v) ? "" : `<br><small style="color:var(--muted)">${dd(v.visitado_en)}</small>`}</td>
          <td title="${esc(e.nombre)}"><span class="ej">${AVATAR(e)}<span class="ej-n">${esc(nombreCorto(e.nombre))}</span></span></td>
          <td class="com"><b title="${esc(v.comercio)}">${esc(v.comercio)}</b><small>${esc(v.customer_id)} · ${esc(v.distrito || "sin distrito")}</small></td>
          <td class="res">${resumenRes(v)}</td>
          <td class="sn">${sn.length ? `<div class="sn-l" style="margin-top:0">${sn.map(([k,t]) => `<span class="senal ${k}">${esc(t)}</span>`).join("")}</div>` : `<span class="muted" style="font-size:12px">—</span>`}</td>
          ${S.filtro === "todos" ? `<td>${pill(v)}</td>` : ""}
        </tr>`; }).join("")}
      </tbody></table>${lista.length > 400 ? `<div class="ver-mas">Se muestran 400 de ${lista.length}. Afina el filtro.</div>` : ""}` : `<div class="vacio">No hay visitas con ese filtro.${S.filtro === "pend" ? " La cola está al día." : ""}</div>`}
      </div>
      <div class="atajos"><kbd>↑</kbd> <kbd>↓</kbd> moverse · <kbd>V</kbd> validar · <kbd>O</kbd> observar · <kbd>A</kbd> anular · <kbd>Esc</kbd> cancelar</div>
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

const BIT_CLASE = { registro:"reg", comentario:"ed", resultado:"ed", traslado:"tr", pedido:"anu", aprobado:"anu", rechazado:"val", validada:"val", observada:"obs", revision:"reg", anulada:"anu", restituida:"val", ubicacion:"ed" };
const BIT_TIT = { ubicacion:"Ubicación actualizada por el ejecutivo (la anterior quedó aquí)", comentario:"Comentario corregido", resultado:"Resultado corregido", traslado:"Trasladada a otro comercio", pedido:"El ejecutivo pidió anular la visita", aprobado:"Anulación aprobada", rechazado:"Pedido de anulación rechazado", validada:"Validada", observada:"Observada · el ejecutivo la ve en revisión", revision:"Vuelve a la cola", anulada:"Anulada por el analista", restituida:"Restituida · vuelve a contar" };
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
      <div class="meta">${esc(v.razon_social || "")}${v.ruc ? " · RUC " + esc(v.ruc) : ""} · Customer ID <b>${esc(v.customer_id)}</b><br>${esc(v.direccion || "sin dirección")}${v.distrito ? ", " + esc(v.distrito) : ""}${v.ruta ? ` · ${esc(v.ruta)}${v.orden ? " orden " + v.orden : ""}` : ""}${v.terminales ? ` · ${v.terminales} terminal${v.terminales>1?"es":""}` : ""}${v.tasa_debito != null ? ` · débito ${tasa(v.tasa_debito)} · crédito ${tasa(v.tasa_credito)}` : ""}${c.estado ? ` · en el CRM: ${esc(c.estado)}` : ""}</div>
    </div>
    <div class="cuerpo">
      ${v.estado_anul === "pendiente" ? `<div class="aviso warn"><b>${esc(nomDe(v.anul_pedida_por))} pide anular esta visita</b> (${ddhh(v.anul_pedida_en)}): «${esc(v.anul_motivo || "")}». Si la anulas, deja de contar; si rechazas el pedido, sigue contando.</div>` : ""}
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
    <div class="motivo ${S.accion ? "on" : ""}" id="motivo">
      ${S.accion === "obs" ? `<label for="mSel">Motivo de la observación (el ejecutivo lo ve en su celular)</label><select id="mSel">${OBS_MOTIVOS.map(m=>`<option>${m}</option>`).join("")}</select><label for="mNota">Nota para el ejecutivo</label><textarea id="mNota" rows="2" placeholder="Qué debe corregir o confirmar"></textarea><div class="fila"><button class="btn" data-cancelar>Cancelar</button><button class="btn a" data-confirmar="obs">Observar</button></div>` : ""}
      ${S.accion === "anu" ? `<label for="mSel">Motivo de la anulación</label><select id="mSel">${ANU_MOTIVOS.map(m=>`<option>${m}</option>`).join("")}</select><label for="mNota">Nota (queda en la bitácora)</label><textarea id="mNota" rows="2"></textarea><div class="fila"><button class="btn" data-cancelar>Cancelar</button><button class="btn r" data-confirmar="anu">Anular · deja de contar</button></div>` : ""}
    </div>
    <div class="acciones ${S.ocupado ? "cargando-btn" : ""}">
      ${puede && k !== "val" ? `<button class="btn v" data-accion="val">${ICON.ok} Validar<kbd>V</kbd></button>` : ""}
      ${puede && k !== "obs" ? `<button class="btn a" data-accion="obs">Observar<kbd>O</kbd></button>` : ""}
      ${puede && k === "obs" ? `<button class="btn" data-accion="cola">Levantar la observación</button>` : ""}
      ${puede ? `<button class="btn r" data-accion="anu">Anular<kbd>A</kbd></button>` : `<button class="btn" data-accion="rest">Restituir</button>`}
      ${v.estado_anul === "pendiente" ? `<button class="btn" data-accion="rech">Rechazar el pedido</button>` : ""}
      <button class="btn q" data-ir-traza="${v.id}" style="margin-left:auto">Ver en auditoría</button>
    </div>
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
function diasPeriodo(){
  const p = S.periodo; if (!p) return [];
  const fin = hoyISO() < p.fin ? hoyISO() : p.fin;
  const out = []; const d = new Date(p.ini + "T12:00:00Z");
  while (d.toISOString().slice(0,10) <= fin){ const s2 = d.toISOString().slice(0,10), dow = d.getUTCDay(); out.push({ iso:s2, dow, habil: dow >= 1 && dow <= 5 }); d.setUTCDate(d.getUTCDate() + 1); }
  return out.filter(x => x.dow !== 0 || S.act.some(v => iso(v.visitado_en) === x.iso));
}
function habiles(){
  const p = S.periodo; if (!p) return { total:0, antes:0, hastaHoy:0 };
  let total = 0, antes = 0, hastaHoy = 0; const hoy = hoyISO(); const d = new Date(p.ini + "T12:00:00Z");
  while (d.toISOString().slice(0,10) <= p.fin){ const s2 = d.toISOString().slice(0,10), dow = d.getUTCDay();
    if (dow >= 1 && dow <= 5){ total++; if (s2 < hoy) antes++; if (s2 <= hoy) hastaHoy++; } d.setUTCDate(d.getUTCDate() + 1); }
  return { total, antes, hastaHoy };
}
function vistaEquipo(){
  const dias = diasPeriodo(), H = habiles();
  const metaEj = (S.avance && S.avance[0] && S.avance[0].meta_visitas) || 160;
  const metaDia = H.total ? metaEj / H.total : 8;
  const hoy = hoyISO();
  const filas = S.ejecutivos.map(e => {
    const todas = S.act.filter(v => v.correo === e.correo);
    const vs = todas.filter(v => v.estado_anul !== "anulada");
    const porDia = {};
    vs.forEach(v => { const k = iso(v.visitado_en); const o = porDia[k] ||= { com:new Set(), n:0, h1:null, h2:null, obs:0, pend:0 }; o.n++; if (v.lat != null && !v.fuera_plazo) o.com.add(v.customer_id); if (v.fuera_plazo) o.tarde = (o.tarde || 0) + 1; const t = D(v.visitado_en); if (!o.h1 || t < o.h1) o.h1 = t; if (!o.h2 || t > o.h2) o.h2 = t; if (estadoDe(v) === "obs") o.obs++; if (estadoDe(v) === "pend") o.pend++; });
    const com = new Set(vs.filter(v => v.lat != null && !v.fuera_plazo).map(v => v.customer_id)).size;
    const restantes = Math.max(1, H.total - H.antes);
    return { e, porDia, com, reg:vs.length,
      val: vs.filter(v => estadoDe(v) === "val").length, pend: vs.filter(v => estadoDe(v) === "pend").length, obs: vs.filter(v => estadoDe(v) === "obs").length, anu: todas.length - vs.length,
      contacto: vs.filter(v => v.con !== "Nadie").length, comContacto: new Set(vs.filter(v => v.con !== "Nadie" && v.lat != null && !v.fuera_plazo).map(v => v.customer_id)).size, reunion: vs.filter(v => v.que === "Reunión concretada").length, consumos: vs.filter(v => v.decision === "Realizará consumos").length,
      lejos: vs.filter(v => v.distancia_m == null || v.distancia_m > REGLA.lejos).length, tarde: vs.filter(v => v.fuera_plazo).length,
      ritmo: H.hastaHoy ? com / H.hastaHoy : 0, necesario: Math.max(0, metaEj - com) / restantes, esperado: metaDia * H.hastaHoy };
  });
  const T = { com: filas.reduce((a,f) => a + f.com, 0), reg: filas.reduce((a,f) => a + f.reg, 0) };
  const metaEq = metaEj * filas.length, metaDiaEq = metaDia * filas.length;
  const ritmoEq = H.hastaHoy ? T.com / H.hastaHoy : 0, necEq = Math.max(0, metaEq - T.com) / Math.max(1, H.total - H.antes);
  const celda = (o, d, correo) => {
    const n = o ? o.com.size : 0; const k = n === 0 ? "c0" : n < metaDia * .5 ? "c1" : n < metaDia ? "c2" : "c3";
    const tip = o ? `${n} comercios · ${o.n} registros · de ${hh(o.h1)} a ${hh(o.h2)}${o.pend ? ` · ${o.pend} por validar` : ""}${o.obs ? ` · ${o.obs} observadas` : ""}${o.tarde ? ` · ${o.tarde} fuera de plazo (no cuentan)` : ""}` : "sin visitas";
    return `<td class="dia ${k}${d.habil ? "" : " finde"}${d.iso === hoy ? " hoy" : ""}"><button data-ir-dia="${d.iso}" data-ir-ej="${esc(correo)}" title="${esc(tip)}" ${o ? "" : "disabled"}>${n || "·"}${o && o.pend ? `<i class="pd" aria-label="por validar"></i>` : ""}</button></td>`;
  };
  // gráfico: comercios por día, una barra por ejecutivo (lado a lado) contra su meta diaria
  const tot = dias.map(d => filas.reduce((a,f) => a + (f.porDia[d.iso] ? f.porDia[d.iso].com.size : 0), 0));
  const nEj = Math.max(1, filas.length), pl = 34, pr = 12, pt = 18, pb = 50, Hc = 250;
  const gw = Math.max(92, nEj * 20 + 28), W = Math.max(920, pl + pr + dias.length * gw), step = (W - pl - pr) / Math.max(1, dias.length);
  const bw = Math.min(30, (step * .74 - (nEj - 1) * 3) / nEj);
  const vmax = Math.max(metaDia, ...filas.flatMap(f => dias.map(d => f.porDia[d.iso] ? f.porDia[d.iso].com.size : 0)), 1);
  const ymax = Math.ceil(vmax * 1.18 / 4) * 4;
  const y = n => pt + (Hc - pt - pb) * (1 - n / ymax);
  const ticks = []; for (let t = 0; t <= ymax; t += ymax > 24 ? 8 : 4) ticks.push(t);
  const rejilla = ticks.map(t => `<line x1="${pl}" y1="${y(t).toFixed(1)}" x2="${W - pr}" y2="${y(t).toFixed(1)}" stroke="var(--linea)" stroke-width="1" ${t ? 'stroke-dasharray="2 4"' : ""}/><text x="${pl - 8}" y="${(y(t) + 3.5).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--muted)">${t}</text>`).join("");
  const barras = dias.map((d, i) => { const x0 = pl + step * i + (step - (nEj * bw + (nEj - 1) * 3)) / 2, cx = pl + step * i + step / 2;
    const bs = filas.map((f, k) => { const o = f.porDia[d.iso], n = o ? o.com.size : 0, x = x0 + k * (bw + 3);
      const tip = `${f.e.nombre} · ${fISO(d.iso)}: ${n} comercio${n === 1 ? "" : "s"}${o ? ` · ${o.n} registro${o.n === 1 ? "" : "s"}` : ""} · meta ${Math.round(metaDia)}`;
      const h = n ? Math.max(2, y(0) - y(n)) : 0;
      return `<g class="b"><rect x="${(x - 1).toFixed(1)}" y="${pt}" width="${(bw + 2).toFixed(1)}" height="${(y(0) - pt).toFixed(1)}" fill="transparent"><title>${esc(tip)}</title></rect>${n ? `<path d="M${x.toFixed(1)},${y(0).toFixed(1)} v${(-h + 4).toFixed(1)} q0,-4 4,-4 h${(bw - 8).toFixed(1)} q4,0 4,4 v${(h - 4).toFixed(1)} z" fill="${f.e.color}" pointer-events="none"/>` : ""}${n && bw >= 11 ? `<text x="${(x + bw / 2).toFixed(1)}" y="${(y(n) - 5).toFixed(1)}" text-anchor="middle" font-size="10.5" font-weight="700" fill="var(--ink)" pointer-events="none">${n}</text>` : ""}</g>`; }).join("");
    return `${bs}<text x="${cx.toFixed(1)}" y="${Hc - 32}" text-anchor="middle" font-size="11" fill="${d.iso === hoy ? "var(--naranja)" : "var(--muted)"}" font-weight="${d.iso === hoy ? 700 : 400}">${fISO(d.iso)} ${DOW[d.dow]}</text>
      <text x="${cx.toFixed(1)}" y="${Hc - 16}" text-anchor="middle" font-size="10" fill="var(--muted)">equipo ${tot[i]} / ${Math.round(metaDiaEq)}</text>`; }).join("");
  const grafico = `<svg class="graf-ej" viewBox="0 0 ${W} ${Hc}"${W > 920 ? ` width="${W}" style="width:${W}px;max-width:none"` : ""} role="img" aria-label="Comercios visitados por día, una barra por ejecutivo, con la meta diaria de ${Math.round(metaDia)}">
    ${rejilla}
    <line x1="${pl}" y1="${y(metaDia).toFixed(1)}" x2="${W - pr}" y2="${y(metaDia).toFixed(1)}" stroke="var(--naranja)" stroke-width="2" stroke-dasharray="6 4"/>
    <text x="${W - pr}" y="${(y(metaDia) - 6).toFixed(1)}" text-anchor="end" font-size="10.5" font-weight="700" fill="var(--naranja)">meta ${Math.round(metaDia)} por ejecutivo</text>
    ${barras}</svg>`;
  const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
  return `
  <div class="resumen">
    <div class="tile acc"><div class="k">Comercios visitados</div><div class="v num">${T.com}<small> / ${metaEq}</small></div><div class="d">${pct(T.com, metaEq)} % de la meta del periodo · ${T.reg} registros</div></div>
    <div class="tile"><div class="k">Días hábiles</div><div class="v num">${H.hastaHoy}<small> de ${H.total}</small></div><div class="d">${pct(H.hastaHoy, H.total)} % del periodo corrido, contando hoy</div></div>
    <div class="tile ${ritmoEq >= metaDiaEq ? "ok" : "warn"}"><div class="k">Ritmo del equipo</div><div class="v num">${ritmoEq.toFixed(1).replace(".", ",")}<small> por día</small></div><div class="d">meta ${Math.round(metaDiaEq)} por día hábil (${Math.round(metaDia)} por ejecutivo)</div></div>
    <div class="tile ${necEq > metaDiaEq ? "bad" : ""}"><div class="k">Para cerrar en meta</div><div class="v num">${necEq.toFixed(1).replace(".", ",")}<small> por día</small></div><div class="d">en los ${Math.max(0, H.total - H.antes)} días hábiles que quedan, contando hoy</div></div>
  </div>
  <div class="panel" style="margin-bottom:16px">
    <div class="barra"><b>Comercios visitados por día y por ejecutivo</b><span class="lbl">solo visitas con ubicación, no anuladas y registradas a tiempo; un comercio cuenta una vez por día · pasa el mouse por una barra para ver el detalle</span>
      <div class="der leyenda-ej"><span><i class="meta"></i>meta diaria · ${Math.round(metaDia)} por ejecutivo</span>${filas.map(f => `<span><i style="background:${f.e.color}"></i>${esc(nombreCorto(f.e.nombre))}</span>`).join("")}</div></div>
    <div style="padding:6px 12px 2px;overflow-x:auto">${grafico}</div>
  </div>
  <div class="panel">
    <div class="barra"><b>Por ejecutivo y por día</b><span class="lbl">verde: llegó a la meta diaria (${Math.round(metaDia)}) · ámbar: a más de la mitad · rojo: menos de la mitad · el punto naranja marca visitas por validar</span></div>
    <div style="overflow-x:auto"><table class="datos matriz">
      <thead><tr><th>Ejecutivo</th>${dias.map(d => `<th class="dia${d.iso === hoy ? " hoy" : ""}${d.habil ? "" : " finde"}">${DOW[d.dow]}<br>${fISO(d.iso)}</th>`).join("")}<th class="n">Comercios</th><th class="n">Ritmo<br>por día</th><th class="n">Necesita<br>por día</th><th class="n">Visitas con<br>contacto</th><th class="n">Comercios con<br>contacto</th><th class="n">Reunión</th><th class="n">Realizará<br>consumos</th><th class="n">Fuera de<br>plazo</th><th>Validación</th></tr></thead>
      <tbody>${filas.map(f => `<tr>
        <td><button class="ej-btn" data-ir-dia="periodo" data-ir-ej="${esc(f.e.correo)}"><span class="ej">${AVATAR(f.e)}${esc(f.e.nombre)}</span></button></td>
        ${dias.map(d => celda(f.porDia[d.iso], d, f.e.correo)).join("")}
        <td class="n num"><b>${f.com}</b> <span class="muted">/ ${metaEj}</span><div class="barrita"><i style="width:${Math.min(100, pct(f.com, metaEj))}%"></i><u style="left:${Math.min(100, pct(f.esperado, metaEj))}%" title="donde debería ir hoy"></u></div></td>
        <td class="n num ${f.ritmo >= metaDia ? "ok" : "warn"}">${f.ritmo.toFixed(1).replace(".", ",")}</td>
        <td class="n num ${f.necesario > metaDia ? "mal" : ""}">${f.necesario.toFixed(1).replace(".", ",")}</td>
        <td class="n num">${f.contacto}<span class="muted"> / ${f.reg}</span></td>
        <td class="n num">${f.comContacto}<span class="muted"> / ${f.com}</span></td>
        <td class="n num">${f.reunion}</td>
        <td class="n num">${f.consumos}</td>
        <td class="n num ${f.tarde ? "mal" : ""}">${f.tarde}</td>
        <td><span class="mini-estados"><span class="pill val">${f.val}</span><span class="pill pend">${f.pend}</span>${f.obs ? `<span class="pill obs">${f.obs}</span>` : ""}${f.anu ? `<span class="pill anu">${f.anu}</span>` : ""}</span></td>
      </tr>`).join("")}
      <tr class="total"><td><b>Equipo</b></td>${dias.map((d, i) => `<td class="dia tot${d.iso === hoy ? " hoy" : ""}"><b>${tot[i] || "·"}</b></td>`).join("")}
        <td class="n num"><b>${T.com}</b> <span class="muted">/ ${metaEq}</span></td><td class="n num">${ritmoEq.toFixed(1).replace(".", ",")}</td><td class="n num">${necEq.toFixed(1).replace(".", ",")}</td>
        <td class="n num">${filas.reduce((a,f)=>a+f.contacto,0)}<span class="muted"> / ${T.reg}</span></td><td class="n num">${filas.reduce((a,f)=>a+f.comContacto,0)}<span class="muted"> / ${T.com}</span></td><td class="n num">${filas.reduce((a,f)=>a+f.reunion,0)}</td><td class="n num">${filas.reduce((a,f)=>a+f.consumos,0)}</td><td class="n num">${filas.reduce((a,f)=>a+f.tarde,0)}</td>
        <td><span class="mini-estados"><span class="pill val">${filas.reduce((a,f)=>a+f.val,0)}</span><span class="pill pend">${filas.reduce((a,f)=>a+f.pend,0)}</span></span></td></tr>
      </tbody></table></div>
    <div class="atajos">Comercios = comercios distintos con visita válida, con o sin contacto (el indicador contra 160). Visitas con contacto = visitas en que habló con dueño o tercero, sobre todas sus visitas. Comercios con contacto = comercios visitados en que habló con alguien. Ritmo = comercios visitados ÷ días hábiles corridos (contando hoy). Necesita = lo que falta para ${metaEj} ÷ días hábiles que quedan. Fuera de plazo = visitas que llegaron después del siguiente día hábil: se ven, pero no suman comercios. La raya en la barrita marca dónde debería ir hoy. Validación: validadas · por validar · observadas · anuladas.</div>
  </div>`;
}

/* =========================================================================
   2 · Auditoría
   ========================================================================= */
function vistaAuditoria(){
  return `<div class="tabs">${[["traza","Trazabilidad por visita"],["patrones","Patrones por ejecutivo"],["bbva","Cruce con la data de BBVA"]].map(([k,t])=>`<button class="${S.tab===k?"on":""}" data-tab="${k}">${t}</button>`).join("")}</div>
  ${S.tab === "traza" ? traza() : S.tab === "patrones" ? patrones() : cruceBBVA()}`;
}
function traza(){
  const q = S.busca.trim().toLowerCase();
  const lista = S.act.filter(v => !q || (v.comercio||"").toLowerCase().includes(q) || v.customer_id.includes(q) || (v.ruc||"").includes(q) || (v.ejecutivo||"").toLowerCase().includes(q) || (v.distrito||"").toLowerCase().includes(q)).slice(0, 80);
  if (!S.traza || !S.act.find(v=>v.id===S.traza)) S.traza = lista[0]?.id || null;
  const v = S.act.find(x => x.id === S.traza);
  return `<div class="grid2">
    <div class="panel">
      <div class="barra"><div class="buscar" style="flex:1">${ICON.lupa}<input id="qTraza" placeholder="Comercio, Customer ID, RUC, distrito o ejecutivo" value="${esc(S.busca)}"></div></div>
      <div class="lista" style="max-height:calc(100vh - 300px);overflow:auto">${lista.map(x => `<button class="${S.traza===x.id?"on":""}" data-traza="${x.id}">${AVATAR(ejDe(x.correo))}<div class="t"><b>${esc(x.comercio)}</b><small class="num">${ddhh(x.visitado_en)} · ${esc(x.customer_id)}</small></div>${pill(x)}</button>`).join("") || `<div class="vacio">Sin resultados</div>`}</div>
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
  const texto = [`Visita ${v.id} · ${v.comercio} (Customer ID ${v.customer_id})`, `Ejecutivo: ${e.nombre}`, `Declarada ${ddhh(v.visitado_en)} · recibida ${ddhh(v.recibido_en)} (+${lag} min)`, `GPS: ${v.lat==null?"sin ubicación":`${v.lat.toFixed(5)}, ${v.lng.toFixed(5)} ±${Math.round(v.precision_m)} m · a ${mDist(v.distancia_m)} del comercio`}`, `Cómo fue: ${comoFue(v).join(" · ")} (base: ${v.con}${v.motivo?" · "+v.motivo:""} · ${v.que}${v.decision?" · "+v.decision:""})`, `Comentario: ${v.comentario||""}`, `Estado: ${ESTADO[estadoDe(v)][1]}${v.validacion_motivo ? " · " + v.validacion_motivo : ""}${v.fuera_plazo ? " · FUERA DE PLAZO (tenía hasta el " + fISO(v.plazo_hasta) + "), no cuenta" : ""}`, "", "Bitácora:", ...ev.map(b => `- ${ddhh(b.en)} · ${b.accion} · ${nomDe(b.por)}${b.antes?` · antes: ${b.antes} · después: ${b.despues}`:b.despues?` · ${b.despues}`:""}`)].join("\n");
  return `<div class="card">
    <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap">
      <div><h2>${esc(v.comercio)} ${pill(v)}</h2><div class="sub">Customer ID ${esc(v.customer_id)}${v.ruc ? " · RUC " + esc(v.ruc) : ""} · ${esc(v.distrito || "")} · ${esc(e.nombre)}${c.estado ? " · en el CRM: " + esc(c.estado) : ""}</div></div>
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
    ${trx.length ? `<h3 style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:10px 0 6px">Transacciones del comercio después de la visita</h3><table class="datos"><thead><tr><th>Fecha de corte</th><th>Formato</th><th class="n">Transacciones</th><th class="n">Volumen S/</th></tr></thead><tbody>${trx.map(t=>`<tr><td class="num">${fISO(t.fecha_corte)}</td><td>${esc(t.formato)}</td><td class="n num">${num(t.trx)}</td><td class="n num">${num(t.vol)}</td></tr>`).join("")}</tbody></table>` : `<div class="aviso" style="margin-top:8px">${S.trx[v.customer_id] ? "Sin transacciones cargadas después de esta visita." : "Buscando transacciones…"} ${v.decision==="Realizará consumos"?"El comercio dijo que consumiría: vale seguirlo en el próximo corte.":""}</div>`}
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

function cruceBBVA(){
  const cand = S.act.filter(v => v.estado_anul !== "anulada" && v.con !== "Nadie" && v.que === "Reunión concretada").sort((a,b)=>D(a.visitado_en)-D(b.visitado_en));
  const hayTrx = S.base.some(c => c.dias_trx != null && c.dias_trx > 0);
  const ultCarga = S.cargas.find(g => g.tipo === "transacciones");
  const filas = cand.map(v => { const c = S.baseMap[v.customer_id] || {}; const dias = c.dias_trx || 0; const est = c.estado === "rea" || dias >= 2 ? "conf" : dias === 1 ? "cand" : c.estado === "can" ? "can" : "sin"; return { v, dias, est, c }; });
  const cnt = k => filas.filter(f=>f.est===k).length;
  const PILL = { conf:`<span class="pill val">Reactivado confirmado</span>`, cand:`<span class="pill obs">Candidato · falta 1 día</span>`, sin:`<span class="pill pend">Sin transacciones</span>`, can:`<span class="pill anu">Cancelado</span>` };
  return `<div class="resumen" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr))">
    <div class="tile ok"><div class="k">Reactivados confirmados</div><div class="v num">${cnt("conf")}</div><div class="d">POS con 2 días distintos después de la visita</div></div>
    <div class="tile warn"><div class="k">Candidatos</div><div class="v num">${cnt("cand")}</div><div class="d">un día con transacciones, falta el segundo</div></div>
    <div class="tile"><div class="k">Sin transacciones</div><div class="v num">${cnt("sin")}</div><div class="d">reunión concretada, el POS no se movió</div></div>
    <div class="tile ${hayTrx ? "" : "bad"}"><div class="k">Data de BBVA</div><div class="v">${hayTrx ? "cargada" : "sin cargar"}</div><div class="d">${ultCarga ? `última carga ${ddhh(ultCarga.en)} · corte ${fISO(ultCarga.fecha_corte)}` : "no hay transacciones del periodo: nadie puede reactivar"}</div></div>
  </div>
  <div class="panel"><div class="barra"><b>Reuniones concretadas y lo que hizo el POS después</b><span class="lbl">Reactivado = transacciona en dos días distintos después de la visita. Lo confirma la data, no el ejecutivo.</span></div>
  <div style="overflow:auto"><table class="datos"><thead><tr><th>Visita</th><th>Ejecutivo</th><th>Comercio</th><th>Lo que dijo</th><th class="n">Días con trx</th><th>Estado</th></tr></thead><tbody>
    ${filas.map(f => `<tr><td class="num">${ddhh(f.v.visitado_en)}</td><td><span class="ej">${AVATAR(ejDe(f.v.correo))}${esc(nombreCorto(ejDe(f.v.correo).nombre))}</span></td><td class="com"><b>${esc(f.v.comercio)}</b><small>${esc(f.v.customer_id)}</small></td><td>${esc(f.v.decision||"—")}</td><td class="n"><span class="puntos"><i class="${f.dias>=1?(f.dias>=2?"on":"mid"):""}"></i><i class="${f.dias>=2?"on":""}"></i></span> <span class="num">${f.dias}</span></td><td>${PILL[f.est]}</td></tr>`).join("") || `<tr><td colspan="6" class="vacio">Todavía no hay reuniones concretadas en el periodo.</td></tr>`}
  </tbody></table></div></div>`;
}

/* =========================================================================
   3 · Cargas
   ========================================================================= */
const TIPOS = {
  diario: { t:"Transacciones diarias", d:"Una fila por comercio y día: cuántas transacciones hubo ese día. Es la carga que confirma las reactivaciones.", ej:"2026-09-24,41000123,4,312.50" },
  acumulado_mes: { t:"Acumulado del mes por corte", d:"Una fila por comercio y fecha de corte con el acumulado del mes. El CRM cuenta un día cuando el acumulado sube.", ej:"2026-09-24,41000123,38,4120.00" },
  totales_bbva: { t:"Totales de BBVA por corte", d:"Lo que ves en el drive de BBVA: reactivados, facturación y transacciones por grupo. Se tipea, sin archivo. Es lo que usa la presentación.", ej:"" },
  resultados_bbva: { t:"Resultados de BBVA (reactivación)", d:"Tu Excel de BBVA: una fila por Customer ID con gestión con contacto, reactivado y, si lo tienes, el monto facturado. Solo lo ves tú.", ej:"00000001,Si,Si,12500.00" },
};
const COLS = ["fecha_corte","customer_id","trx","vol"];
const ALIAS = { fecha_corte:["fecha_corte","fecha","fecha corte","corte","date","fec_corte"], customer_id:["customer_id","customer id","customerid","cid","cliente","codigo","código","id"], trx:["trx","transacciones","nro_trx","n_trx","cantidad","operaciones","txs"], vol:["vol","volumen","monto","importe","facturacion","facturación","venta","amount"] };
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
      : COLS.map(col => `<div><code>${col}</code>${({fecha_corte:"AAAA-MM-DD (también DD/MM/AAAA)",customer_id:"8 dígitos, el de BBVA",trx:"entero",vol:"decimal con punto (opcional)"})[col]}</div>`).join("")}</div>
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
    const cid = String(f[ix.customer_id] ?? "").trim().replace(/\.0$/, "");
    const fecha = fechaNorm(f[ix.fecha_corte]);
    const trx = String(f[ix.trx] ?? "").trim().replace(/\.0$/, "");
    const vol = ix.vol >= 0 ? String(f[ix.vol] ?? "").trim().replace(",", ".") : "";
    if (ix.customer_id >= 0){ if (!/^\d{8}$/.test(cid)) err.push("customer_id no tiene 8 dígitos"); else if (!S.baseMap[cid]) err.push("customer_id no está en la base"); }
    if (ix.fecha_corte >= 0){ if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || isNaN(Date.parse(fecha))) err.push("fecha_corte no es una fecha"); else if (per && (fecha < per.ini || fecha > hoyISO())) err.push(fecha > hoyISO() ? "fecha futura" : `fecha anterior al periodo (${fISO(per.ini)})`); }
    if (ix.trx >= 0 && !/^\d+$/.test(trx)) err.push("trx no es un entero");
    if (vol !== "" && isNaN(parseFloat(vol))) err.push("vol no es numérico");
    const llave = `${fecha}|${cid}`; if (vistos.has(llave)) err.push("fila duplicada (mismo comercio y fecha)"); vistos.add(llave);
    res.push({ n:n+2, cid, fecha, trx, vol, err });
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
  const filas = v.res.filter(r => !r.err.length).map(r => ({ fecha_corte:r.fecha, customer_id:r.cid, trx:r.trx, vol: r.vol === "" ? null : r.vol }));
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

/* ---------- Resultados de BBVA (29/09): el Excel mínimo que Jose arma desde el entorno de BBVA ---------- */
const COLS_BBVA = ["customer_id", "gestion_con_contacto", "reactivado", "facturado"];
const FORMATO_BBVA = { customer_id:"el de BBVA; si Excel le quitó los ceros de la izquierda, se completan a 8 dígitos", gestion_con_contacto:"Si o No",
  reactivado:"Si, No o En proceso", facturado:"monto en soles del comercio (opcional; también puedes poner solo el total al cargar)" };
const ALIAS_BBVA = { customer_id:["customer_id", "customer id", "customerid", "cid", "cliente", "codigo", "código", "id"],
  gestion_con_contacto:["gestion_con_contacto", "gestión con contacto", "gestion con contacto", "contacto", "gestion", "gestión"],
  reactivado:["reactivado", "reactivo", "reactivó", "cuenta", "consumio", "consumió", "consumo"], facturado:["facturado", "facturacion", "facturación", "monto", "monto facturado", "importe", "vol", "volumen"] };
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
  const faltan = COLS_BBVA.filter(c => c !== "facturado" && ix[c] < 0), vistos = new Set(), res = [];
  filas.forEach((f, n) => { const err = [];
    const bruto = String(f[ix.customer_id] ?? "").trim().replace(/\.0$/, ""), cid = /^\d{1,8}$/.test(bruto) ? bruto.padStart(8, "0") : bruto;
    const gc = siNo(f[ix.gestion_con_contacto]), re = reacNorm(f[ix.reactivado]);
    const fac = ix.facturado >= 0 ? String(f[ix.facturado] ?? "").trim().replace(/[S\/\s]/g, "").replace(/,(?=\d{3}\b)/g, "").replace(",", ".") : "";
    let sug = null;
    if (!/^\d{8}$/.test(cid)) err.push("customer_id no es numérico");
    else if (!S.baseMap[cid]){ err.push("customer_id no está en la base"); sug = idParecido(cid); }
    if (gc === null) err.push("gestion_con_contacto no es Si o No");
    if (!re) err.push("reactivado no es Si, No o En proceso");
    if (fac !== "" && !/^\d+(\.\d+)?$/.test(fac)) err.push("facturado no es un monto");
    if (vistos.has(cid)) err.push("customer_id repetido"); vistos.add(cid);
    res.push({ n:n + 2, bruto, cid, gc, re, fac, sug, err }); });
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
    ${v.faltan.length ? `<div class="aviso mal">No encuentro las columnas <b>${v.faltan.join(", ")}</b>. La primera fila debe traer los nombres (por ejemplo: customer ID, Gestion_Con_Contacto, Reactivado).</div>` : ""}
    <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:12px">
      <label class="lbl">Fecha de corte de la data de BBVA <input type="date" id="bbvaCorte" value="${esc(c.corte || "")}" max="${hoyISO()}" class="sel"></label>
      <label class="lbl">Total facturado de los que cuentan (S/, opcional) <input type="text" id="bbvaTotal" value="${esc(c.facturadoTotal || "")}" placeholder="${conFac ? "se suma de la columna facturado" : "ej.: 2600000"}" class="sel" style="width:170px"></label>
    </div>
    <div class="checks">
      <div class="check ok"><i>✓</i><div><b class="num">${v.ok}</b><small>filas válidas</small></div></div>
      <div class="check ${malas.length?"mal":"ok"}"><i>${malas.length?"!":"✓"}</i><div><b class="num">${malas.length}</b><small>filas que no se cargan</small></div></div>
      <div class="check ok"><i>${reac.length}</i><div><b style="font-size:12px">reactivados según BBVA</b><small>${cuentan.length} cuentan: con gestión con contacto y visita de Stratis del periodo hasta el corte</small></div></div>
      ${conFac ? `<div class="check ok"><i>S/</i><div><b class="num">${fac.toLocaleString("es-PE", { maximumFractionDigits:0 })}</b><small>facturado de los que cuentan</small></div></div>` : ""}
    </div>
    <div class="aviso">Se guarda como el corte del <b>${c.corte ? fISO(c.corte) : "—"}</b>. Si ya había un corte con esa fecha, se reemplaza completo. No cambia visitas ni el medidor, y los ejecutivos no lo ven.</div>
    ${malas.length ? `<div style="overflow:auto;margin-top:12px"><table class="datos"><thead><tr><th>Fila</th><th>Customer ID en tu archivo</th><th>Problema</th><th>¿Quisiste decir?</th></tr></thead><tbody>
      ${malas.slice(0, 80).map(r => `<tr class="err"><td class="num">${r.n}</td><td class="num">${esc(r.bruto)}</td><td>${esc(r.err.join(" · "))}</td><td class="num">${r.sug ? esc(r.sug) + ` <small class="muted">${esc((S.baseMap[r.sug] || {}).distrito || "")}</small>` : "—"}</td></tr>`).join("")}
    </tbody></table><div style="font-size:11.5px;color:var(--muted);margin-top:6px">Corrige esos Customer ID en tu Excel y vuelve a cargarlo: el corte se reemplaza completo. La sugerencia es el ID de la base que difiere en un dígito.</div></div>` : ""}
    </div></div>`;
}
function resultadoBBVA(){
  const c = S.carga, r = c.resultado || {}, det = r.detalle || [];
  return `<div class="panel"><div style="padding:22px;display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap">
    <div class="check ok" style="border:0;padding:0"><i style="width:40px;height:40px;font-size:18px">✓</i></div>
    <div style="flex:1;min-width:240px"><h2 style="font-size:16px">Corte del ${r.corte ? fISO(r.corte) : "—"} cargado: ${num(r.cargadas)} comercios${r.reemplazo ? " (reemplaza el corte anterior de esa fecha)" : ""}</h2>
      <div class="sub" style="margin:4px 0 10px">${esc(c.archivo)} · carga n.º ${r.carga_id} · ${num(r.reactivados)} reactivados según BBVA, ${num(r.con_contacto)} de ellos con gestión con contacto · ${num(r.rechazadas)} rechazadas por la base.</div>
      <div class="aviso ok">La presentación para BBVA ya toma este corte para la reactivación y la facturación.</div>
      ${det.length ? `<div style="overflow:auto;margin-top:10px"><table class="datos"><thead><tr><th>Fila</th><th>Customer ID</th><th>Motivo</th></tr></thead><tbody>${det.slice(0, 50).map(d => `<tr class="err"><td class="num">${d.fila}</td><td class="num">${esc(d.customer_id || "")}</td><td>${esc(d.motivo)}</td></tr>`).join("")}</tbody></table></div>` : ""}
      <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn p" id="otraCarga">Nueva carga</button></div>
    </div></div></div>`;
}
async function cargarBBVA(){
  const c = S.carga, v = c.filas, ce = $("#bbvaCorte"), tt = $("#bbvaTotal");
  if (ce) c.corte = ce.value; if (tt) c.facturadoTotal = tt.value;
  if (!c.corte || c.corte > hoyISO()){ toast("Indica la fecha de corte de la data de BBVA (no puede ser futura)."); return; }
  const total = String(c.facturadoTotal || "").replace(/[S\/\s]/g, "").replace(/,(?=\d{3}\b)/g, "").replace(",", ".");
  if (total !== "" && !/^\d+(\.\d+)?$/.test(total)){ toast("El total facturado no es un monto."); return; }
  const filas = v.res.filter(r => !r.err.length).map(r => ({ customer_id:r.cid, gestion_con_contacto:r.gc, reactivado:r.re, facturado:r.fac === "" ? null : r.fac }));
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
  const primera = visitadosAlCorte(K), conC = new Set(), des = {}; let visitas = 0;
  (S.act || []).slice().sort((a, b) => a.visitado_en < b.visitado_en ? -1 : 1).forEach(v => {
    if (v.estado_anul === "anulada" || v.periodo !== per || iso(v.visitado_en) > K || !enC.has(v.customer_id)) return;
    visitas++; if (v.decision === "Desiste del producto") des[v.customer_id] = v.equipo || "";
    if (v.lat != null && !v.fuera_plazo && v.con !== "Nadie") conC.add(v.customer_id); });
  const vis = Object.keys(primera).filter(c => enC.has(c)).length, rec = Object.keys(des).length;
  return { universo:cartera.length, visitas, vis, cc:conC.size, sc:vis - conC.size, nv:cartera.length - vis, recupero:rec, equipoRec:Object.values(des).filter(e => e === "Sí").length };
}
// Cuadro completo (como la tabla de Jose) a partir de los totales t y los grupos g; errores = controles de coherencia
function cuadroTotales(t, g){
  const G = {}; GRUPOS_TOT.forEach(([k, nom]) => { G[k] = { nom, n:g[k], reac:Number(t[k + "_reac"]), fac:Number(t[k + "_fac"]), trx:Number(t[k + "_trx"]) }; });
  const suma = (ks, nom, n) => ({ nom, n, reac:ks.reduce((a, k) => a + G[k].reac, 0), fac:ks.reduce((a, k) => a + G[k].fac, 0), trx:ks.reduce((a, k) => a + G[k].trx, 0) });
  const tv = suma(["cc", "sc"], "Total visitados", g.vis), tu = suma(["cc", "sc", "nv"], "Total universo", g.universo);
  const errores = [];
  GRUPOS_TOT.forEach(([k, nom]) => { if (G[k].reac > G[k].n) errores.push(`${nom}: ${numPE(G[k].reac)} reactivados y el CRM tiene ${numPE(G[k].n)} comercios en ese grupo`); });
  if (g.cc + g.sc !== g.vis || g.vis + g.nv !== g.universo) errores.push("Los grupos del CRM no suman el universo");
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
  const q = cuadroTotales(t, g), fila = (o, b) => `<tr${b ? ' style="font-weight:700"' : ""}><td>${esc(o.nom)}</td><td class="n num">${numPE(o.n)}</td><td class="n num">${numPE(o.reac)}</td><td class="n num">${montoPE(o.fac)}</td><td class="n num">${numPE(o.trx)}</td><td class="n num">${pct2(o.fac, q.tu.fac)}</td><td class="n num">${o.trx ? montoPE(o.fac / o.trx) : "—"}</td><td class="n num">${pct2(o.reac, o.n)}</td></tr>`;
  return `<div style="overflow:auto"><table class="datos"><thead><tr><th>Grupo</th><th class="n">Comercios (CRM)</th><th class="n">Reactivados</th><th class="n">Facturación (S/)</th><th class="n">Transacciones</th><th class="n">% facturación</th><th class="n">Ticket prom. (S/)</th><th class="n">% alcance</th></tr></thead><tbody>
    ${fila(q.G.cc)}${fila(q.G.sc)}${fila(q.tv, true)}${fila(q.G.nv)}${fila(q.tu, true)}</tbody></table></div>
    <div class="aviso ${q.errores.length ? "mal" : "ok"}" style="margin-top:10px">${q.errores.length ? "Control de coherencia: " + q.errores.map(esc).join(" · ") : `Control de coherencia OK · reactivados que cuentan (visitados con contacto): <b>${numPE(q.G.cc.reac)}</b> · conversión ${pct2(q.G.cc.reac, g.vis)} de ${numPE(g.vis)} visitados.`}</div>`;
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
      ${GRUPOS_TOT.map(([g, gn]) => `<tr><td><b>${gn}</b></td>${CAMPOS_TOT.map(([cc]) => `<td><input type="text" inputmode="decimal" class="sel" style="width:150px;text-align:right" data-tot="${g}_${cc}" value="${esc(tt.v[`${g}_${cc}`] || "")}" placeholder="${cc === "fac" ? "1.234.567,89" : cc === "trx" ? "12.345" : "12"}"></td>`).join("")}</tr>`).join("")}
    </tbody></table></div>
    <div style="font-size:11.5px;color:var(--muted);margin:6px 0 12px">Copia los números como los ves en el drive de BBVA (con puntos de miles y coma decimal, o sin separadores). Los comercios de cada grupo los pone el CRM al mismo corte, igual que la hoja Base.</div>
    <div id="totPrevia">${previaTotales()}</div>
    <div style="margin-top:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap"><button class="btn p ${S.ocupado ? "cargando-btn" : ""}" id="guardarTotales" ${q && !q.errores.length ? "" : "disabled"}>Guardar los totales del ${tt.corte ? fISO(tt.corte) : "corte"}</button>
      <span class="lbl">Si el corte ya tenía totales, se reemplazan. No cambia visitas ni el medidor.</span></div>
    ${(S.totBBVA || []).length ? `<div style="overflow:auto;margin-top:16px"><table class="datos"><thead><tr><th>Corte</th><th class="n">Reactivados con contacto</th><th class="n">Sin contacto</th><th class="n">No visitados</th><th class="n">Facturación total (S/)</th><th>Por</th><th>Guardado</th></tr></thead><tbody>
      ${S.totBBVA.map(u => `<tr><td class="num">${fISO(u.corte)}</td><td class="n num">${numPE(u.cc_reac)}</td><td class="n num">${numPE(u.sc_reac)}</td><td class="n num">${numPE(u.nv_reac)}</td><td class="n num">${montoPE(Number(u.cc_fac) + Number(u.sc_fac) + Number(u.nv_fac))}</td><td>${esc((u.por || "").split("@")[0])}</td><td class="num">${ddhh(u.en)}</td></tr>`).join("")}</tbody></table></div>` : ""}
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

// Último corte de BBVA cargado hasta la fecha C (para la presentación)
async function cargarResultadosBBVA(C){
  const { data:cs, error:ec } = await sb.from("v2_cortes_bbva").select("corte,filas,facturado_total,en").order("corte", { ascending:false });
  if (ec) throw ec;
  const corte = (cs || []).find(x => x.corte <= C);
  if (!corte) return null;
  const filas = [];
  for (let i = 0; ; i += 1000){
    const { data, error } = await sb.from("v2_resultados_bbva").select("customer_id,gestion_con_contacto,reactivado,facturado").eq("corte", corte.corte).order("customer_id").range(i, i + 999);
    if (error) throw error;
    filas.push(...(data || [])); if (!data || data.length < 1000) break;
  }
  return { corte, filas };
}

/* =========================================================================
   4 · Indicadores
   ========================================================================= */
/* =========================================================================
   Mapa de distritos (Lima Metropolitana y Callao)
   Límites: OpenStreetMap (ODbL), guardados en v2_geo_distritos.
   ========================================================================= */
const MET = [
  ["ej",  "Ejecutivo asignado", "El color es el ejecutivo que tiene los comercios del distrito."],
  ["cob", "Cobertura",          "Comercios asignados que ya tienen una visita que cuenta (con ubicación, no anulada, a tiempo)."],
  ["efe", "Efectividad",        "Visitas en las que el ejecutivo habló con alguien (dueño, encargado o tercero)."],
  ["vis", "Comercios visitados","Comercios distintos con una visita que cuenta."],
  ["reg", "Visitas registradas","Todas las visitas no anuladas, incluidas las repetidas y las sin contacto."],
  ["reu", "Reuniones",          "Visitas con reunión concretada."],
  ["con", "Realizará consumos", "Visitas en las que el comercio dijo que volverá a usar el POS."],
  ["rea", "Reactivados",        "Comercios con transacciones en dos días distintos después de la visita (data de BBVA)."],
];
const esPct = k => k === "cob" || k === "efe";
async function cargarGeo(){
  if (S.geo || S._geoCargando) return; S._geoCargando = true; S.geoErr = "";
  const { data, error } = await sb.from("v2_geo_distritos").select("clave,nombre,provincia,geometria");
  S._geoCargando = false;
  if (error) S.geoErr = error.message; else S.geo = data || [];
  pintar();
}
function rangoMapa(){
  const h = hoyISO();
  if (S.mRango === "hoy") return [h, h];
  if (S.mRango === "semana"){ const d = new Date(h + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() || 7) - 1)); return [d.toISOString().slice(0,10), h]; }
  return null;
}
function statsDistritos(){
  const ej = S.mEj || "todos", r = rangoMapa(), m = {};
  const get = k => m[k] ||= { clave:k, asig:0, rea:0, porEj:{}, vis:new Set(), reg:0, efe:0, reu:0, con:0, lejos:0, tarde:0, quien:{}, que:{}, ultimas:[] };
  S.base.forEach(c => { if (!c.distrito || !c.correo || (ej !== "todos" && c.correo !== ej)) return;
    const o = get(c.distrito); o.asig++; o.porEj[c.correo] = (o.porEj[c.correo] || 0) + 1; if (c.estado === "rea") o.rea++; });
  S.act.forEach(v => { if (v.estado_anul === "anulada" || (ej !== "todos" && v.correo !== ej)) return;
    const d = iso(v.visitado_en); if (r && (d < r[0] || d > r[1])) return;
    const o = get(v.distrito || "SIN DISTRITO"); o.reg++;
    if (v.con !== "Nadie") o.efe++; if (v.que === "Reunión concretada") o.reu++; if (v.decision === "Realizará consumos") o.con++;
    if (v.distancia_m == null || v.distancia_m > REGLA.lejos) o.lejos++; if (v.fuera_plazo) o.tarde++;
    if (v.lat != null && !v.fuera_plazo) o.vis.add(v.customer_id);
    o.quien[v.con] = (o.quien[v.con] || 0) + 1; o.que[comoFue(v)[0]] = (o.que[comoFue(v)[0]] || 0) + 1; o.ultimas.push(v); });
  Object.values(m).forEach(o => { o.nvis = o.vis.size; o.cob = o.asig ? o.nvis / o.asig : null; o.pefe = o.reg ? o.efe / o.reg : null;
    o.ejs = Object.entries(o.porEj).sort((a, b) => b[1] - a[1]).map(x => x[0]); o.ej = o.ejs[0] || null;
    o.ultimas.sort((a, b) => D(b.visitado_en) - D(a.visitado_en)); });
  return m;
}
const valorMet = (o, k) => !o ? null : k === "cob" ? o.cob : k === "efe" ? o.pefe : k === "vis" ? o.nvis : k === "reg" ? o.reg : k === "reu" ? o.reu : k === "con" ? o.con : k === "rea" ? o.rea : null;
const fmtMet = (v, k) => v == null ? "—" : esPct(k) ? Math.round(v * 100) + " %" : String(v);
// cinco clases: porcentajes en tramos de 20 %; conteos en quintos del máximo. Cero tiene su propio tono.
function clasesMet(st, k){
  if (esPct(k)) return { tramos:[[0,.2],[.2,.4],[.4,.6],[.6,.8],[.8,1.0001]], paso:v => v == null ? null : v <= 0 ? 0 : Math.min(5, Math.floor(v * 5) + 1), etq:i => ["0 %","1–19 %","20–39 %","40–59 %","60–79 %","80–100 %"][i] };
  const mx = Math.max(1, ...Object.values(st).filter(o => o.asig).map(o => valorMet(o, k) || 0));
  const lim = [1,2,3,4,5].map(i => Math.max(i, Math.ceil(mx * i / 5)));
  const paso = v => v == null ? null : v <= 0 ? 0 : 1 + lim.findIndex(l => v <= l);
  const etq = i => { if (i === 0) return "0"; const a = i === 1 ? 1 : lim[i-2] + 1, b = lim[i-1]; return a >= b ? String(b) : `${a}–${b}`; };
  return { paso, etq, lim };
}
function vistaMapa(){
  if (!S.geo && !S.geoErr) cargarGeo();
  const k = S.mMet || "ej", st = statsDistritos(), cl = k === "ej" ? null : clasesMet(st, k);
  const asignados = Object.values(st).filter(o => o.asig).sort((a, b) => (valorMet(b, k === "ej" ? "cob" : k) ?? -1) - (valorMet(a, k === "ej" ? "cob" : k) ?? -1) || b.asig - a.asig);
  const sel = S.mDist && st[S.mDist] ? st[S.mDist] : null;
  const nomDist = c => { const g = (S.geo || []).find(x => x.clave === c); return g ? g.nombre : c.charAt(0) + c.slice(1).toLowerCase(); };
  const r = rangoMapa();
  const leyenda = k === "ej"
    ? S.ejecutivos.map(e => `<span><i style="background:${e.color}"></i>${esc(nombreCorto(e.nombre))}</span>`).join("") + `<span><i style="background:transparent;border:1px solid var(--muted)"></i>sin comercios asignados</span>`
    : [0,1,2,3,4,5].map(i => `<span><i style="background:var(--s${i})"></i>${cl.etq(i)}</span>`).join("") + `<span><i style="background:transparent;border:1px solid var(--muted)"></i>sin comercios asignados</span>`;
  const barraH = (obj, orden) => { const tot = Object.values(obj).reduce((a, b) => a + b, 0) || 1; const ks = (orden || Object.keys(obj)).filter(x => obj[x]);
    return ks.length ? ks.map(x => `<div class="hb"><span>${esc(x)}</span><i><u style="width:${Math.round(obj[x] / tot * 100)}%"></u></i><b class="num">${obj[x]}</b></div>`).join("") : `<div class="muted" style="font-size:12px">Sin visitas en el rango.</div>`; };
  const lateral = sel ? `
    <div class="barra"><b>${esc(nomDist(sel.clave))}</b><div class="der"><button class="btn q" data-mdist="">Quitar selección</button></div></div>
    <div class="md-cuerpo">
      <div class="md-ej">${sel.ejs.map(c => `<span class="ej">${AVATAR(ejDe(c))}${esc(ejDe(c).nombre)} · ${sel.porEj[c]} comercios</span>`).join("") || `<span class="muted">Sin comercios asignados${S.mEj && S.mEj !== "todos" ? " a este ejecutivo" : ""}</span>`}</div>
      <div class="md-kpi">
        <div><small>Cobertura</small><b class="num">${fmtMet(sel.cob, "cob")}</b><em>${sel.nvis} de ${sel.asig} comercios</em></div>
        <div><small>Efectividad</small><b class="num">${fmtMet(sel.pefe, "efe")}</b><em>${sel.efe} de ${sel.reg} visitas con contacto</em></div>
        <div><small>Reuniones</small><b class="num">${sel.reu}</b><em>${sel.con} realizará${sel.con === 1 ? "" : "n"} consumos</em></div>
        <div><small>Reactivados</small><b class="num">${sel.rea}</b><em>según la data de BBVA</em></div>
      </div>
      ${sel.lejos || sel.tarde ? `<div class="aviso warn" style="margin:0">${[sel.lejos ? `${sel.lejos} visita${sel.lejos === 1 ? "" : "s"} lejos del comercio o sin GPS` : "", sel.tarde ? `${sel.tarde} fuera de plazo` : ""].filter(Boolean).join(" · ")}</div>` : ""}
      <h3>Con quién habló</h3>${barraH(sel.quien, ["Dueño","Encargado","Tercero","Nadie"])}
      <h3>Cómo fue la visita</h3>${barraH(sel.que)}
      <h3>Últimas visitas</h3>
      <div class="md-ult">${sel.ultimas.slice(0, 8).map(v => `<button data-ir-cola="${v.id}"><span class="ej">${AVATAR(ejDe(v.correo))}</span><span><b>${esc(v.comercio)}</b><small>${fISO(iso(v.visitado_en))} ${hh(v.visitado_en)} · ${esc(comoFue(v)[0])}</small></span></button>`).join("") || `<div class="muted" style="font-size:12px">Sin visitas en el rango.</div>`}</div>
    </div>`
  : `
    <div class="barra"><b>Por ejecutivo</b><span class="lbl">haz clic en un distrito para ver su detalle</span></div>
    <div class="md-cuerpo">
      <table class="datos md-ejs"><thead><tr><th>Ejecutivo</th><th class="n">Comercios</th><th class="n">Cobertura</th><th class="n">Efectividad</th></tr></thead><tbody>
      ${S.ejecutivos.filter(e => !S.mEj || S.mEj === "todos" || e.correo === S.mEj).map(e => { const ds = asignados.filter(o => o.porEj[e.correo]); const a = ds.reduce((x, o) => x + o.porEj[e.correo], 0);
          const vs = S.act.filter(v => v.correo === e.correo && v.estado_anul !== "anulada" && (!r || (iso(v.visitado_en) >= r[0] && iso(v.visitado_en) <= r[1])));
          const nv = new Set(vs.filter(v => v.lat != null && !v.fuera_plazo).map(v => v.customer_id)).size, ef = vs.filter(v => v.con !== "Nadie").length;
          return `<tr><td><span class="ej">${AVATAR(e)}<span>${esc(nombreCorto(e.nombre))}<small>${ds.length} distrito${ds.length === 1 ? "" : "s"}</small></span></span></td><td class="n num">${a}</td><td class="n num">${a ? Math.round(nv / a * 100) : 0} %</td><td class="n num">${vs.length ? Math.round(ef / vs.length * 100) + " %" : "—"}</td></tr>`; }).join("")}
      </tbody></table>
      <div class="muted" style="font-size:12px;line-height:1.5">Cada distrito lo trabaja un solo ejecutivo. La cobertura cuenta comercios distintos con una visita que cuenta; la efectividad, visitas en las que habló con alguien.</div>
    </div>`;
  const filasTabla = asignados.map(o => `<tr class="${S.mDist === o.clave ? "on" : ""}" data-mdist="${esc(o.clave)}">
      <td><b>${esc(nomDist(o.clave))}</b></td>
      <td>${o.ejs.map(c => `<span class="ej">${AVATAR(ejDe(c))}${esc(nombreCorto(ejDe(c).nombre))}</span>`).join(" ")}</td>
      <td class="n num">${o.asig}</td><td class="n num">${o.nvis}</td>
      <td class="n num"><span class="cob"><i><u style="width:${Math.round((o.cob || 0) * 100)}%"></u></i>${fmtMet(o.cob, "cob")}</span></td>
      <td class="n num">${o.reg}</td><td class="n num">${fmtMet(o.pefe, "efe")}</td><td class="n num">${o.reu}</td><td class="n num">${o.con}</td><td class="n num">${o.rea}</td>
      <td class="n num ${o.lejos ? "warn" : ""}">${o.lejos}</td></tr>`).join("");
  return `
  <div class="panel" style="margin-bottom:16px">
    <div class="barra">
      <div class="chips" role="tablist" aria-label="Qué pintar en el mapa">${MET.map(([c, t, d]) => `<button class="chip ${k === c ? "on" : ""}" data-mmet="${c}" title="${esc(d)}">${t}</button>`).join("")}</div>
      <div class="der">
        <select class="sel" id="mEj" aria-label="Ejecutivo"><option value="todos">Todos los ejecutivos</option>${S.ejecutivos.map(e => `<option value="${esc(e.correo)}" ${S.mEj === e.correo ? "selected" : ""}>${esc(e.nombre)}</option>`).join("")}</select>
        <select class="sel" id="mRango" aria-label="Rango"><option value="periodo">Todo el periodo</option><option value="semana" ${S.mRango === "semana" ? "selected" : ""}>Esta semana</option><option value="hoy" ${S.mRango === "hoy" ? "selected" : ""}>Hoy</option></select>
        <label class="lbl"><input type="checkbox" id="mPuntos" ${S.mPuntos !== false ? "checked" : ""}> Puntos de visita</label>
      </div>
    </div>
    <div class="mapa-dist-wrap">
      <div class="mapa-dist-col">
        ${S.geoErr ? `<div class="vacio" style="padding:30px">No se pudieron cargar los límites de los distritos: ${esc(S.geoErr)}</div>` : !S.geo ? `<div class="vacio" style="padding:30px"><span class="spin"></span> Cargando el mapa…</div>` : `<div id="mapaDist" class="mapa-dist"></div>`}
        <div class="md-leyenda"><b>${esc(MET.find(x => x[0] === k)[1])}</b><span class="muted">${esc(MET.find(x => x[0] === k)[2])}${k === "rea" ? "" : r ? ` Rango: ${S.mRango === "hoy" ? "hoy" : "esta semana"}.` : ""}</span><div class="leyenda-ej">${leyenda}${S.mPuntos !== false ? `<span><i class="pto"></i>visita (color del ejecutivo)</span>` : ""}</div></div>
      </div>
      <div class="md-lado">${lateral}</div>
    </div>
  </div>
  <div class="panel">
    <div class="barra"><b>Distritos con comercios asignados</b><span class="lbl">${asignados.length} distritos · ordenados por ${k === "ej" ? "cobertura" : esc(MET.find(x => x[0] === k)[1].toLowerCase())} · clic en una fila para verla en el mapa</span></div>
    <div style="overflow-x:auto"><table class="datos md-tabla"><thead><tr><th>Distrito</th><th>Ejecutivo</th><th class="n">Asignados</th><th class="n">Visitados</th><th class="n">Cobertura</th><th class="n">Visitas</th><th class="n">Efectividad</th><th class="n">Reuniones</th><th class="n">Realizará<br>consumos</th><th class="n">Reactivados</th><th class="n">Lejos o<br>sin GPS</th></tr></thead>
    <tbody>${filasTabla}</tbody></table></div>
    <div class="atajos">Límites de distritos: © colaboradores de OpenStreetMap (ODbL). Los reactivados se cuentan en todo el periodo; lo demás, en el rango elegido.</div>
  </div>`;
}
function montarMapaDistritos(el){
  if (!window.L || !S.geo){ return; }
  const k = S.mMet || "ej", st = statsDistritos(), cl = k === "ej" ? null : clasesMet(st, k), r = rangoMapa();
  const oscuro = temaActual() === "dark", borde = colorCss("var(--tarjeta)"), tinta = colorCss("var(--ink)");
  const m = L.map(el, { zoomControl:true, scrollWheelZoom:true, zoomSnap:.25, preferCanvas:false });
  m.setView(S.mVista ? S.mVista.c : [-12.06, -77.03], S.mVista ? S.mVista.z : 11);
  m.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom:18, opacity:oscuro ? .55 : .5, attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' }).addTo(m);
  const capas = [], asign = [];
  S.geo.forEach(g => {
    const o = st[g.clave], tiene = !!(o && o.asig), selec = S.mDist === g.clave;
    const fill = !tiene ? colorCss("var(--sin)") : k === "ej" ? colorCss(ejDe(o.ej).color) : colorCss(`var(--s${cl.paso(valorMet(o, k)) ?? 0})`);
    const estilo = tiene ? { color:selec ? tinta : borde, weight:selec ? 3 : 1.5, fillColor:fill, fillOpacity:k === "ej" ? (oscuro ? .78 : .6) : .85 }
                         : { color:colorCss("var(--muted)"), weight:.8, opacity:.55, fillColor:fill, fillOpacity:.06 };
    const capa = L.geoJSON({ type:"Feature", geometry:g.geometria }, { style:estilo }).addTo(m);
    const v = valorMet(o, k === "ej" ? "cob" : k);
    capa.bindTooltip(tiene
      ? `<b>${esc(g.nombre)}</b><br>${esc(o.ejs.map(c => ejDe(c).nombre).join(", "))}<br>${o.nvis} de ${o.asig} comercios visitados (${fmtMet(o.cob, "cob")})<br>${o.reg} visitas · efectividad ${fmtMet(o.pefe, "efe")}${k !== "ej" && k !== "cob" && k !== "efe" ? `<br>${esc(MET.find(x => x[0] === k)[1])}: <b>${fmtMet(v, k)}</b>` : ""}`
      : `<b>${esc(g.nombre)}</b><br>Sin comercios asignados`, { sticky:true, className:"etq-mapa", direction:"top", offset:[0,-6] });
    capa.on("mouseover", () => { if (!selec) capa.setStyle({ weight:2.5, color:tinta }); });
    capa.on("mouseout", () => { if (!selec) capa.setStyle({ weight:estilo.weight, color:estilo.color }); });
    if (tiene) capa.on("click", () => { S.mDist = S.mDist === g.clave ? null : g.clave; S.mEnfocar = S.mDist; pintar(); });
    capas.push([g, capa, o, tiene]); if (tiene) asign.push(capa);
  });
  const etqs = [];
  capas.filter(x => x[3]).forEach(([g, capa, o]) => { if (S.mDist === g.clave) capa.bringToFront();
    const c = capa.getBounds().getCenter(); const v = valorMet(o, k === "ej" ? "cob" : k);
    etqs.push([capa, L.marker(c, { interactive:false, keyboard:false, icon:L.divIcon({ className:"lbl-dist", iconSize:null, html:`<b>${esc(g.nombre)}</b><span>${fmtMet(v, k === "ej" ? "cob" : k)}</span>` }) }).addTo(m)]); });
  if (S.mPuntos !== false){
    S.act.forEach(v => { if (v.lat == null || v.estado_anul === "anulada" || (S.mEj && S.mEj !== "todos" && v.correo !== S.mEj)) return;
      const d = iso(v.visitado_en); if (r && (d < r[0] || d > r[1])) return;
      L.circleMarker([v.lat, v.lng], { radius:4, color:borde, weight:1.5, fillColor:colorCss(ejDe(v.correo).color), fillOpacity:1 })
        .bindTooltip(`<b>${esc(v.comercio)}</b><br>${esc(ejDe(v.correo).nombre)} · ${fISO(d)} ${hh(v.visitado_en)}<br>${esc(comoFue(v)[0])}${v.distancia_m != null ? ` · a ${mDist(v.distancia_m)}` : ""}`, { className:"etq-mapa", direction:"top", offset:[0,-4] })
        .on("click", () => { S.vista = "validacion"; S.filtro = "todos"; S.dia = "periodo"; S.ej = "todos"; S.sel = v.id; pintar(); })
        .addTo(m); });
  }
  const selCapa = capas.find(x => x[0].clave === S.mEnfocar);
  if (selCapa){ m.fitBounds(selCapa[1].getBounds(), { padding:[40,40], maxZoom:14, animate:false }); S.mEnfocar = null; }
  else if (S.mVista) m.setView(S.mVista.c, S.mVista.z, { animate:false });
  else {
    // encuadre inicial: donde están los comercios (sin dejar que un distrito enorme como Lurigancho aleje todo)
    const ej = S.mEj && S.mEj !== "todos" ? S.mEj : null;
    const pts = S.base.filter(c => c.geo_lat != null && (!ej || c.correo === ej)).map(c => [c.geo_lat, c.geo_lng])
      .concat(S.act.filter(v => v.lat != null && (!ej || v.correo === ej)).map(v => [v.lat, v.lng]));
    if (pts.length >= 3){ const q = (a, f) => a[Math.min(a.length - 1, Math.max(0, Math.floor(a.length * f)))];
      const la = pts.map(p => p[0]).sort((a, b) => a - b), lo = pts.map(p => p[1]).sort((a, b) => a - b);
      m.fitBounds([[q(la, .02), q(lo, .02)], [q(la, .98), q(lo, .98)]], { padding:[30,30], animate:false }); }
    else if (asign.length) m.fitBounds(L.featureGroup(asign).getBounds(), { padding:[20,20], animate:false });
  }
  // cada etiqueta se muestra según el tamaño del distrito en pantalla: nombre y valor, solo valor, o nada
  const zoomClase = () => etqs.forEach(([capa, mk]) => { const b = capa.getBounds(), a = m.latLngToLayerPoint(b.getNorthWest()), z = m.latLngToLayerPoint(b.getSouthEast());
    const w = Math.min(z.x - a.x, (z.y - a.y) * 1.6), e = mk.getElement(); if (!e) return;
    e.classList.toggle("oculta", w < 34); e.classList.toggle("solo-valor", w >= 34 && w < 78); });
  m.on("moveend zoomend", () => { S.mVista = { c:m.getCenter(), z:m.getZoom() }; zoomClase(); });
  zoomClase();
  S._mapa = m;
  if (S.mScroll){ S.mScroll = false; (el.closest(".panel") || el).scrollIntoView({ block:"start", behavior:"auto" }); }
}

/* =========================================================================
   Feedback de la visita
   ========================================================================= */
// Feedback inferido por Stratis leyendo el comentario (tabla v2_feedback_inferido, solo escritorio).
async function cargarFbInferido(){
  const r = await sb.from("v2_feedback_inferido").select("visita_id,tipos,fuera_de_lista,confianza,criterio");
  if (r && r.error){ S.fbInfErr = r.error.message; return; }
  S.fbInf = {}; ((r && r.data) || []).forEach(x => { S.fbInf[x.visita_id] = x; });
}
// Qué feedback cuenta para una visita: lo que marcó el ejecutivo; si no marcó nada, lo inferido del comentario.
function fbDe(v){
  if (v.con === "Nadie") return null;
  const inf = (S.fbInf || {})[v.id];
  if ((v.feedback || []).length) return { fuente:"ejecutivo", tipos:v.feedback, fuera:[], nota:v.feedback_nota || "", acc:v.fb_acciones || [], ext:v.fb_extra || null, inf };
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
  if (f.fuente === "ejecutivo" && f.inf && f.inf.tipos.length) h += `<div class="fb-crit">Antes, Stratis lo había inferido del comentario como: ${esc(f.inf.tipos.join(" · "))}</div>`;
  return h;
}
function semanasPeriodo(){
  const out = []; let cur = null;
  diasPeriodo().forEach(d => { const lun = new Date(d.iso + "T12:00:00"); lun.setDate(lun.getDate() - ((lun.getDay() + 6) % 7)); const k = lun.toISOString().slice(0, 10);
    if (!cur || cur.k !== k){ cur = { k, ini:d.iso, fin:d.iso }; out.push(cur); } else cur.fin = d.iso; });
  return out;
}
// Visitas con contacto del filtro, cada una con su feedback resuelto según la fuente elegida
function visitasFeedback(){
  const sem = S.fbSemana ? semanasPeriodo().find(w => w.k === S.fbSemana) : null, fuente = S.fbFuente || "todas";
  return S.act.filter(v => v.estado_anul !== "anulada" && v.con !== "Nadie"
    && (!S.fbEj || v.correo === S.fbEj)
    && (!sem || (iso(v.visitado_en) >= sem.ini && iso(v.visitado_en) <= sem.fin)))
    .map(v => { let f = fbDe(v);
      if (fuente === "ejecutivo" && f.fuente !== "ejecutivo") f = { fuente:null, tipos:[], fuera:[] };
      if (fuente === "inferido"){ const i = f.inf; f = i ? { fuente:"inferido", tipos:i.tipos || [], fuera:i.fuera_de_lista || [], confianza:i.confianza, criterio:i.criterio, inf:i } : { fuente:null, tipos:[], fuera:[] }; }
      return { v, f }; });
}
const FUERA_LISTA = ["Falla del POS sin detalle", "Sus clientes no quieren pagar la comisión", "Obtuvo el POS por un préstamo", "Desconoce tener el POS", "Pide asesoría para configurar sus equipos"];
function csvFeedback(){
  const q = x => `"${String(x == null ? "" : x).replace(/"/g, '""')}"`;
  const filas = visitasFeedback().filter(o => o.f.fuente && tipoCoincide(o)).sort((a, b) => a.v.visitado_en < b.v.visitado_en ? -1 : 1);
  const cab = ["Fecha","Hora","Ejecutivo","Customer ID","Comercio","Distrito","Con quién habló","Qué pasó","Decisión","Feedback (tipos BBVA)","Feedback agregado por Stratis","Fuera de la lista de BBVA","Qué ofreció el ejecutivo","POS de otra marca","Demora del abono","Fuente","Confianza","Comentario del ejecutivo","Feedback adicional"];
  const txt = "﻿" + [cab.map(q).join(";")].concat(filas.map(({ v, f }) => [fISO(iso(v.visitado_en)), hh(v.visitado_en), ejDe(v.correo).nombre, v.customer_id, v.comercio, v.distrito, v.con, v.que, v.decision || "", f.tipos.filter(t => FB_BBVA.has(t) || t === FB_NINGUNO).join(" | "), f.tipos.filter(t => !FB_BBVA.has(t) && t !== FB_NINGUNO).join(" | "), f.fuera.join(" | "), (f.acc || []).join(" | "), competidorTxt(f.ext), demoraTxt(f.ext), FUENTE_TXT[f.fuente], f.confianza || "", (v.comentario || "").replace(/\s+/g, " "), f.nota || ""].map(q).join(";"))).join("\r\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([txt], { type:"text/csv;charset=utf-8" }));
  a.download = `feedback_visitas_${S.periodo ? S.periodo.id : ""}${S.fbSemana ? "_semana_" + S.fbSemana : ""}.csv`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  toast(`Se descargó el CSV con ${filas.length} visita${filas.length === 1 ? "" : "s"}.`);
}
// Filtro por tipo (clic en una barra): "t:<tipo>", "f:<fuera de la lista>", "sd" (sin detalle)
function tipoCoincide(o){
  const k = S.fbTipo; if (!k) return true;
  if (k === "sd") return o.f.fuente && !o.f.tipos.length && !o.f.fuera.length;
  if (k.startsWith("t:")) return o.f.tipos.includes(k.slice(2));
  if (k.startsWith("f:")) return o.f.fuera.includes(k.slice(2));
  if (k.startsWith("a:")) return (o.f.acc || []).includes(k.slice(2));
  if (k.startsWith("c:")) return !!(o.f.ext && (o.f.ext.competidores || []).includes(k.slice(2)));
  return true;
}
function vistaFeedback(){
  const vs = visitasFeedback(), con = vs.filter(o => o.f.fuente);
  const conTipo = con.filter(o => o.f.tipos.length);
  const ninguno = conTipo.filter(o => o.f.tipos.includes(FB_NINGUNO)).length;
  const problema = conTipo.filter(o => o.f.tipos.some(t => t !== FB_NINGUNO)).length;
  const sinDetalle = con.filter(o => !o.f.tipos.length && !o.f.fuera.length).length;
  const nEj = con.filter(o => o.f.fuente === "ejecutivo").length, nInf = con.length - nEj;
  const cuenta = t => con.filter(o => o.f.tipos.includes(t)).length;
  const cuentaF = t => con.filter(o => o.f.fuera.includes(t)).length;
  const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
  const base = vs.length;
  const todos = [FB_NINGUNO].concat(...FEEDBACK.map(g => g[1]));
  const dias = con.filter(o => o.f.ext && o.f.ext.dias_demora_abono != null).map(o => Number(o.f.ext.dias_demora_abono));
  const diasTxt = () => dias.length ? ` <small class="fbv-st">prom. ${(dias.reduce((a, b) => a + b, 0) / dias.length).toFixed(1).replace(".", ",")} días (${dias.length})</small>` : "";
  const max = Math.max(1, ...todos.map(cuenta), ...FUERA_LISTA.map(cuentaF), sinDetalle);
  const fila = (k, t, n, extra) => `<button class="fbv-fila ${S.fbTipo === k ? "on" : ""}" data-fb-tipo="${esc(k)}" title="${esc(t)}: ${n} visita${n === 1 ? "" : "s"} · ${pct(n, base)} % de las visitas con contacto · clic para ver los comentarios"><span class="fbv-t">${esc(t)}${extra || ""}</span><span class="fbv-barra"><i style="width:${(n / max * 100).toFixed(1)}%"></i></span><span class="fbv-n num">${n}<small> · ${pct(n, base)} %</small></span></button>`;
  const barras = `<div class="fbv-grupo"><div class="fbv-g">Sin observaciones</div>${fila("t:" + FB_NINGUNO, FB_NINGUNO, cuenta(FB_NINGUNO))}</div>`
    + FEEDBACK.map(([g, items]) => `<div class="fbv-grupo"><div class="fbv-g">${esc(g)}</div>${items.map(t => fila("t:" + t, t, cuenta(t), (FB_BBVA.has(t) ? "" : ` <small class="fbv-st">Stratis</small>`) + (t === FB_DEMORA ? diasTxt() : ""))).join("")}</div>`).join("");
  // Desde el 26/09: qué ofreció el ejecutivo y POS de otra marca
  const conEj = con.filter(o => o.f.fuente === "ejecutivo"), conAcc = conEj.filter(o => (o.f.acc || []).length);
  const cuentaA = t => conEj.filter(o => (o.f.acc || []).includes(t)).length;
  const cuentaC = t => conEj.filter(o => o.f.ext && (o.f.ext.competidores || []).includes(t)).length;
  const tasas = t => conEj.filter(o => o.f.ext && (o.f.ext.competidores || []).includes(t) && o.f.ext.tasa_competidor != null).map(o => Number(o.f.ext.tasa_competidor));
  const tasaTxt = t => { const l = tasas(t); return l.length ? ` <small class="fbv-st">tasa prom. ${(l.reduce((a, b) => a + b, 0) / l.length).toFixed(2).replace(".", ",")} % (${l.length})</small>` : ""; };
  const barrasAcc = ACCIONES.filter(cuentaA).sort((a, b) => cuentaA(b) - cuentaA(a)).map(t => fila("a:" + t, t, cuentaA(t))).join("") || `<div class="atajos">Todavía no hay visitas con «qué ofreció» (se marca desde el 26/09).</div>`;
  const barrasComp = COMPETIDORES.filter(cuentaC).map(t => fila("c:" + t, t === "Otro" ? "Otra marca" : t, cuentaC(t), tasaTxt(t))).join("") || `<div class="atajos">Todavía no hay visitas con POS de otra marca y el nombre del competidor.</div>`;
  const barrasFuera = FUERA_LISTA.map(t => fila("f:" + t, t, cuentaF(t))).join("") + fila("sd", "El comentario no dice qué opina del POS", sinDetalle);
  const ejs = S.ejecutivos.filter(e => !S.fbEj || e.correo === S.fbEj);
  const porEj = (pred, c) => con.filter(o => o.v.correo === c && pred(o)).length;
  const lista = con.filter(tipoCoincide).sort((a, b) => a.v.visitado_en < b.v.visitado_en ? 1 : -1);
  const etTipo = !S.fbTipo ? "todas las visitas con feedback" : S.fbTipo === "sd" ? "comentarios sin detalle" : S.fbTipo.startsWith("a:") ? "ofreció: " + S.fbTipo.slice(2) : S.fbTipo.startsWith("c:") ? "usa POS de " + (S.fbTipo.slice(2) === "Otro" ? "otra marca" : S.fbTipo.slice(2)) : S.fbTipo.slice(2);
  return `
  <div class="barra-filtros" style="display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap">
    <select class="sel" id="fbSemana" aria-label="Semana"><option value="">Todo el periodo</option>${semanasPeriodo().map(w => `<option value="${w.k}" ${S.fbSemana === w.k ? "selected" : ""}>Semana del ${fISO(w.ini)} al ${fISO(w.fin)}</option>`).join("")}</select>
    <select class="sel" id="fbEj" aria-label="Ejecutivo"><option value="">Todos los ejecutivos</option>${S.ejecutivos.map(e => `<option value="${esc(e.correo)}" ${S.fbEj === e.correo ? "selected" : ""}>${esc(e.nombre)}</option>`).join("")}</select>
    <select class="sel" id="fbFuente" aria-label="Fuente"><option value="todas" ${(S.fbFuente || "todas") === "todas" ? "selected" : ""}>Ejecutivo e inferido del comentario</option><option value="ejecutivo" ${S.fbFuente === "ejecutivo" ? "selected" : ""}>Solo lo que marcó el ejecutivo</option><option value="inferido" ${S.fbFuente === "inferido" ? "selected" : ""}>Solo lo inferido del comentario</option></select>
    <button class="btn" data-fb-csv style="margin-left:auto">Descargar CSV para BBVA</button>
  </div>
  ${S.fbInfErr ? `<div class="aviso warn" style="margin-bottom:12px">No se pudo leer el feedback inferido: ${esc(S.fbInfErr)}</div>` : ""}
  <div class="resumen">
    <div class="tile acc"><div class="k">Visitas con feedback</div><div class="v num">${con.length}<small> / ${base}</small></div><div class="d">${pct(con.length, base)} % de las visitas con contacto · ${nEj} marcadas por el ejecutivo, ${nInf} inferidas del comentario</div></div>
    <div class="tile ${problema ? "warn" : ""}"><div class="k">Con algún problema</div><div class="v num">${problema}</div><div class="d">${pct(problema, base)} % de las visitas con contacto · algún feedback distinto de «Sin observaciones»</div></div>
    <div class="tile ok"><div class="k">Sin observaciones</div><div class="v num">${ninguno}</div><div class="d">${pct(ninguno, base)} % de las visitas con contacto</div></div>
    <div class="tile ${sinDetalle ? "bad" : ""}"><div class="k">Comentario sin detalle</div><div class="v num">${sinDetalle}</div><div class="d">${pct(sinDetalle, base)} % · no dice qué opina el comercio del POS</div></div>
  </div>
  <div class="aviso" style="margin-bottom:14px">Desde el 24/09 el ejecutivo marca el feedback en el celular. Las visitas anteriores se clasificaron leyendo su comentario (Stratis): cuentan igual, pero se ven como <b>inferidas</b>. Si el ejecutivo marca una visita, manda lo que marcó. Haz clic en una barra para ver los comentarios de ese tipo.</div>
  <div class="fb-dos">
    <div class="panel">
      <div class="barra"><b>Feedback por rama</b><span class="lbl">visitas con cada detalle · una visita puede tener varios, así que no suman 100 % · «Stratis» = agregado al árbol, no está en la lista de BBVA</span></div>
      <div class="fbv">${barras}</div>
    </div>
    <div class="panel">
      <div class="barra"><b>Fuera de la lista de BBVA</b><span class="lbl">lo que dijo el comercio y ningún tipo recoge · sale de los comentarios</span></div>
      <div class="fbv">${barrasFuera}</div>
    </div>
  </div>
  <div class="fb-dos" style="margin-top:16px">
    <div class="panel">
      <div class="barra"><b>Qué ofreció el ejecutivo</b><span class="lbl">${conAcc.length} de ${conEj.length} visitas marcadas por el ejecutivo · varias por visita</span></div>
      <div class="fbv">${barrasAcc}</div>
    </div>
    <div class="panel">
      <div class="barra"><b>POS de otra marca</b><span class="lbl">qué competidor usa el comercio · la tasa es opcional</span></div>
      <div class="fbv">${barrasComp}</div>
    </div>
  </div>
  <div class="panel" style="margin:16px 0">
    <div class="barra"><b>Comentarios · ${esc(etTipo)}</b><span class="lbl">${lista.length} visita${lista.length === 1 ? "" : "s"}</span>${S.fbTipo ? `<button class="btn q" data-fb-tipo="" style="margin-left:auto">Ver todos</button>` : ""}</div>
    ${lista.length ? `<div class="fbv-notas">${lista.slice(0, 80).map(({ v, f }) => `<div class="fbv-nota"><div class="fbv-cab"><span class="num">${fISO(iso(v.visitado_en))} ${hh(v.visitado_en)}</span><span class="ej">${AVATAR(ejDe(v.correo))}${esc(nombreCorto(ejDe(v.correo).nombre))}</span><b>${esc(v.comercio)}</b><span class="muted">${esc(v.distrito || "")}</span><span class="fb-fuente ${f.fuente}">${f.fuente === "ejecutivo" ? "ejecutivo" : "inferido" + (f.confianza ? " · " + esc(f.confianza.toLowerCase()) : "")}</span><button class="btn q" data-ir-traza="${v.id}">Ver</button></div>
      ${f.tipos.length || f.fuera.length ? `<div class="fb-tags">${tagsFb(f.tipos)}${tagsFb(f.fuera, "fuera")}</div>` : ""}
      ${(f.acc || []).length ? `<div class="fb-tags"><span class="pq-et">Ofreció</span>${tagsFb(f.acc, "acc")}</div>` : ""}${f.ext && competidorTxt(f.ext) ? `<div class="fbv-txt"><b>POS de otra marca:</b> ${esc(competidorTxt(f.ext))}</div>` : ""}${f.ext && demoraTxt(f.ext) ? `<div class="fbv-txt"><b>Demora del abono:</b> ${esc(demoraTxt(f.ext))}</div>` : ""}
      <div class="fbv-txt">«${esc(v.comentario || "")}»</div>${f.nota ? `<div class="fbv-txt"><b>Feedback adicional:</b> ${esc(f.nota)}</div>` : ""}${f.criterio ? `<div class="fb-crit">${esc(f.criterio)}</div>` : ""}</div>`).join("")}</div>` : `<div class="atajos" style="padding:14px">No hay visitas con este tipo en el filtro.</div>`}
  </div>
  <div class="panel">
    <div class="barra"><b>Por ejecutivo</b><span class="lbl">visitas con contacto que tienen cada tipo</span></div>
    <div style="overflow-x:auto"><table class="datos"><thead><tr><th>Tipo</th>${ejs.map(e => `<th class="n"><span class="ej" style="justify-content:flex-end">${AVATAR(e)}${esc(nombreCorto(e.nombre))}</span></th>`).join("")}<th class="n">Total</th></tr></thead><tbody>
      ${todos.map(t => `<tr><td>${esc(t)}</td>${ejs.map(e => { const n = porEj(o => o.f.tipos.includes(t), e.correo); return `<td class="n num ${n ? "" : "muted"}">${n || "·"}</td>`; }).join("")}<td class="n num"><b>${cuenta(t)}</b></td></tr>`).join("")}
      ${FUERA_LISTA.map(t => `<tr class="fuera"><td>${esc(t)} <span class="muted">(fuera de la lista)</span></td>${ejs.map(e => { const n = porEj(o => o.f.fuera.includes(t), e.correo); return `<td class="n num ${n ? "" : "muted"}">${n || "·"}</td>`; }).join("")}<td class="n num"><b>${cuentaF(t)}</b></td></tr>`).join("")}
      <tr><td>Comentario sin detalle</td>${ejs.map(e => { const n = porEj(o => !o.f.tipos.length && !o.f.fuera.length, e.correo); return `<td class="n num ${n ? "" : "muted"}">${n || "·"}</td>`; }).join("")}<td class="n num"><b>${sinDetalle}</b></td></tr>
      <tr class="total"><td><b>Visitas con contacto</b></td>${ejs.map(e => `<td class="n num"><b>${vs.filter(o => o.v.correo === e.correo).length}</b></td>`).join("")}<td class="n num"><b>${base}</b></td></tr>
    </tbody></table></div>
  </div>`;
}

/* =========================================================================
   Por qué sí / por qué no · esquema validado por Jose el 25/09/2026
   Cada comercio cuenta una vez, por su última visita no anulada.
   «Éxito» es lo que declara el comercio (Realizará consumos); el cruce con
   las transacciones de BBVA lo hace Jose aparte.
   ========================================================================= */
const MOTIVOS_SI = ["Ya lo usaba y seguirá usándolo", "Se resolvió su problema con el POS", "Beneficios o promociones de BBVA",
  "Sus clientes le piden pagar con tarjeta", "La tasa y las condiciones le convienen", "La asesoría del ejecutivo (aprendió a usarlo o lo configuró)"];
const RESULTADOS = [
  ["exito", "Éxito", "Realizará consumos"],
  ["proceso", "En proceso", "Aún no decide o reagendada"],
  ["no", "No éxito", "Desiste del producto, o hubo contacto sin éxito"],
  ["noenc", "No se encontró", "Dirección errada y sin contacto"],
  ["sincon", "Sin contacto", "Cerrado hoy, cerró definitivamente, nadie atendió, zona insegura u otro motivo"],
];
const RES_TXT = Object.fromEntries(RESULTADOS.map(r => [r[0], r[1]]));
const SIN_CONTACTO = ["Dirección errada", "Cerrado", "Cerró definitivamente", "No atendió", "Zona insegura", "Otro motivo", "No estaba"];
function resultadoDe(v){
  if (v.con === "Nadie") return v.motivo === "Dirección errada" ? "noenc" : "sincon";
  if (v.que === "Reunión concretada") return v.decision === "Realizará consumos" ? "exito" : v.decision === "Desiste del producto" ? "no" : "proceso";
  if (v.que === "Reagendada") return "proceso";
  return "no";
}
// Motivos del sí inferidos por Stratis del comentario (tabla v2_motivo_si_inferido, solo escritorio).
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
// Un comercio = su última visita no anulada (dentro del filtro de semana y ejecutivo)
function comerciosPq(){
  const sem = S.pqSemana ? semanasPeriodo().find(w => w.k === S.pqSemana) : null, ult = {};
  S.act.filter(v => v.estado_anul !== "anulada" && (!S.pqEj || v.correo === S.pqEj)
      && (!sem || (iso(v.visitado_en) >= sem.ini && iso(v.visitado_en) <= sem.fin)))
    .forEach(v => { const u = ult[v.customer_id]; if (!u || v.visitado_en > u.visitado_en) ult[v.customer_id] = v; });
  return Object.values(ult).map(v => ({ v, r:resultadoDe(v), f:fbDe(v), m:msiDe(v), n:S.act.filter(x => x.customer_id === v.customer_id && x.estado_anul !== "anulada").length }));
}
// Qué comercios caen en el «por qué no» según el alcance elegido
const alcanceNo = o => (S.pqAlcance || "ambos") === "ambos" ? (o.r === "no" || o.r === "proceso") : o.r === S.pqAlcance;
// Clic en una barra: "res:<k>", "si:<motivo>", "si:sd", "no:t:<tipo>", "no:f:<fuera>", "no:sd", "nc:<motivo>", "dir"
function pqCoincide(o){
  const k = S.pqSel; if (!k) return true;
  if (k.startsWith("res:")) return o.r === k.slice(4);
  if (k === "si:sd") return o.r === "exito" && !(o.m && o.m.motivos.length);
  if (k.startsWith("si:")) return o.r === "exito" && o.m && o.m.motivos.includes(k.slice(3));
  if (k === "no:sd") return alcanceNo(o) && o.f && !o.f.tipos.some(t => t !== FB_NINGUNO) && !o.f.fuera.length;
  if (k.startsWith("no:t:")) return alcanceNo(o) && o.f && o.f.tipos.includes(k.slice(5));
  if (k.startsWith("no:f:")) return alcanceNo(o) && o.f && o.f.fuera.includes(k.slice(5));
  if (k.startsWith("nc:")) return o.v.con === "Nadie" && o.v.motivo === k.slice(3);
  if (k === "dir") return o.v.con !== "Nadie" && o.v.direccion_ok === false;
  if (k === "ubi:si") return o.v.direccion_ok === false && o.v.comercio_ubicado === true;
  if (k === "ubi:no") return o.v.direccion_ok === false && o.v.comercio_ubicado === false;
  return true;
}
function pqEtiqueta(k){
  if (!k) return "todos los comercios visitados";
  if (k.startsWith("res:")) return RES_TXT[k.slice(4)];
  if (k === "si:sd") return "éxito sin detalle de qué lo convenció";
  if (k.startsWith("si:")) return "qué lo convenció · " + k.slice(3);
  if (k === "no:sd") return "por qué no · sin un motivo claro";
  if (k.startsWith("no:")) return "por qué no · " + k.slice(5);
  if (k.startsWith("nc:")) return "sin contacto · " + k.slice(3);
  if (k === "dir") return "la dirección no era la correcta, pero se encontró el comercio";
  if (k === "ubi:si") return "dirección de la base errada · el ejecutivo ubicó el comercio en otra dirección";
  if (k === "ubi:no") return "dirección de la base errada · el ejecutivo no encontró el comercio";
  return "";
}
function csvPq(){
  const q = x => `"${String(x == null ? "" : x).replace(/"/g, '""')}"`;
  const l = comerciosPq().filter(pqCoincide).sort((a, b) => a.v.customer_id < b.v.customer_id ? -1 : 1);
  const cab = ["Customer ID","Comercio","Distrito","Ejecutivo","Visitas","Última visita","Con quién habló","Por qué no hubo contacto","Qué pasó","Decisión","Resultado","Qué lo convenció","Fuente (qué lo convenció)","Feedback (tipos BBVA)","Fuera de la lista de BBVA","Fuente (feedback)","Dirección correcta","Comercio ubicado","Comentario"];
  const txt = "﻿" + [cab.map(q).join(";")].concat(l.map(({ v, r, f, m, n }) => [v.customer_id, v.comercio, v.distrito, ejDe(v.correo).nombre, n, fISO(iso(v.visitado_en)) + " " + hh(v.visitado_en), v.con, v.con === "Nadie" ? v.motivo : "", v.con === "Nadie" ? "" : v.que, v.decision || "", RES_TXT[r],
    m ? m.motivos.join(" | ") : "", m && m.fuente ? FUENTE_TXT[m.fuente] : "", f ? f.tipos.join(" | ") : "", f ? f.fuera.join(" | ") : "", f && f.fuente ? FUENTE_TXT[f.fuente] : "",
    v.direccion_ok === true ? "Sí" : v.direccion_ok === false ? "No" : "",
    v.direccion_ok === false ? (v.comercio_ubicado === true ? "Sí, en otra dirección" : v.comercio_ubicado === false ? "No" : "No se preguntó") : "", (v.comentario || "").replace(/\s+/g, " ")].map(q).join(";"))).join("\r\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([txt], { type:"text/csv;charset=utf-8" }));
  a.download = `por_que_si_por_que_no_${S.periodo ? S.periodo.id : ""}${S.pqSemana ? "_semana_" + S.pqSemana : ""}.csv`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  toast(`Se descargó el CSV con ${l.length} comercio${l.length === 1 ? "" : "s"}.`);
}
function vistaPorQue(){
  const cs = comerciosPq(), tot = cs.length;
  const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
  const nR = k => cs.filter(o => o.r === k).length;
  const exito = cs.filter(o => o.r === "exito"), noL = cs.filter(alcanceNo);
  const encontrados = tot - nR("noenc"), contacto = cs.filter(o => o.v.con !== "Nadie").length;
  const reunion = cs.filter(o => o.v.que === "Reunión concretada" && o.v.con !== "Nadie").length;
  const dirMal = cs.filter(o => o.v.con !== "Nadie" && o.v.direccion_ok === false).length;
  // Desde el 25/09: cuando la dirección de la base no es correcta, el ejecutivo marca si ubicó el comercio
  const ubiSi = cs.filter(o => o.v.direccion_ok === false && o.v.comercio_ubicado === true).length;
  const ubiNo = cs.filter(o => o.v.direccion_ok === false && o.v.comercio_ubicado === false).length;
  // Embudo: las 4 preguntas, cada una con lo que se quedó en el camino
  const paso = (t, n, base, caida, k) => `<div class="pq-paso"><div class="k">${t}</div><div class="v num">${n}<small> · ${pct(n, tot)} %</small></div>${caida ? `<button class="pq-caida ${S.pqSel === k ? "on" : ""}" data-pq="${esc(k)}">${caida}</button>` : `<div class="pq-caida quieta">comercios con al menos una visita</div>`}</div>`;
  const nc = m => cs.filter(o => o.v.con === "Nadie" && o.v.motivo === m).length;
  const embudo = `<div class="pq-embudo">
    ${paso("Visitados", tot, tot, "", "")}
    ${paso("¿Se encontró el comercio?", encontrados, tot, `<b class="num">${nR("noenc")}</b> no se encontraron · dirección errada`, "res:noenc")}
    ${paso("¿Hubo contacto?", contacto, encontrados, `<b class="num">${nR("sincon")}</b> sin contacto · cerrado, cerró definitivamente, no atendió, zona insegura u otro motivo`, "res:sincon")}
    ${paso("¿Hubo reunión?", reunion, contacto, `<b class="num">${contacto - reunion}</b> sin reunión · sin éxito o reagendada`, "res:sinreu")}
    ${paso("¿Usará el POS?", exito.length, reunion, `<b class="num">${reunion - exito.length}</b> todavía no · aún no decide o desiste`, "res:reuno")}
  </div>`;
  // Barra de resultados (una por comercio, suma 100 %)
  const segs = RESULTADOS.map(([k, t]) => { const n = nR(k); return n ? `<button class="pq-seg ${k} ${S.pqSel === "res:" + k ? "on" : ""}" data-pq="res:${k}" style="flex:${n}" title="${esc(t)}: ${n} comercio${n === 1 ? "" : "s"} · ${pct(n, tot)} %"><span class="num">${n}</span></button>` : ""; }).join("");
  const leyenda = RESULTADOS.map(([k, t, d]) => `<button class="pq-ley ${S.pqSel === "res:" + k ? "on" : ""}" data-pq="res:${k}"><i class="pq-pt ${k}"></i><b>${esc(t)}</b><span class="num">${nR(k)} · ${pct(nR(k), tot)} %</span><small>${esc(d)}</small></button>`).join("");
  // Barras
  const fila = (k, t, n, base, cls) => `<button class="fbv-fila ${cls || ""} ${S.pqSel === k ? "on" : ""}" data-pq="${esc(k)}" title="${esc(t)}: ${n} de ${base} comercio${base === 1 ? "" : "s"} · clic para ver los comentarios"><span class="fbv-t">${esc(t)}</span><span class="fbv-barra"><i style="width:${(n / Math.max(1, base) * 100).toFixed(1)}%"></i></span><span class="fbv-n num">${n}<small> · ${pct(n, base)} %</small></span></button>`;
  const exSd = exito.filter(o => !(o.m && o.m.motivos.length)).length;
  const nMsiEj = exito.filter(o => o.m && o.m.fuente === "ejecutivo").length;
  const barrasSi = MOTIVOS_SI.map(t => fila("si:" + t, t, exito.filter(o => o.m && o.m.motivos.includes(t)).length, exito.length, "si")).join("") + fila("si:sd", "El comentario no dice qué lo convenció", exSd, exito.length, "si gris");
  const cuentaNo = t => noL.filter(o => o.f && o.f.tipos.includes(t)).length;
  // Solo los tipos con menciones; los que están en cero se nombran al pie para que no se pierdan
  const ceros = [];
  const grupoNo = (g, items, cuenta, pref) => { const h = items.filter(t => cuenta(t) || (ceros.push(t), false)).map(t => fila(pref + t, t, cuenta(t), noL.length, "no")).join(""); return h ? `<div class="fbv-g">${esc(g)}</div>${h}` : ""; };
  const cuentaFuera = t => noL.filter(o => o.f && o.f.fuera.includes(t)).length;
  const barrasNo = FEEDBACK.map(([g, items]) => grupoNo(g, items, cuentaNo, "no:t:")).join("")
    + grupoNo("Fuera de la lista de BBVA", FUERA_LISTA, cuentaFuera, "no:f:")
    + `<div class="fbv-g">Sin un motivo claro</div>` + fila("no:sd", "Sin observaciones o el comentario no da el motivo", noL.filter(o => o.f && !o.f.tipos.some(t => t !== FB_NINGUNO) && !o.f.fuera.length).length, noL.length, "no gris")
    + (ceros.length ? `<div class="pq-ceros">Sin menciones en el filtro: ${ceros.map(esc).join(" · ")}.</div>` : "");
  const sinC = cs.filter(o => o.v.con === "Nadie").length;
  const barrasNc = SIN_CONTACTO.map(m => fila("nc:" + m, m, nc(m), sinC, "nc")).join("");
  // Lista de comercios del filtro
  const lista = (S.pqSel === "res:sinreu" ? cs.filter(o => o.v.con !== "Nadie" && o.v.que !== "Reunión concretada")
    : S.pqSel === "res:reuno" ? cs.filter(o => o.v.con !== "Nadie" && o.v.que === "Reunión concretada" && o.r !== "exito")
    : cs.filter(pqCoincide)).sort((a, b) => a.v.visitado_en < b.v.visitado_en ? 1 : -1);
  const etq = S.pqSel === "res:sinreu" ? "hubo contacto pero no reunión" : S.pqSel === "res:reuno" ? "hubo reunión y todavía no usará el POS" : pqEtiqueta(S.pqSel);
  const ejs = S.ejecutivos.filter(e => !S.pqEj || e.correo === S.pqEj);
  const alc = S.pqAlcance || "ambos";
  return `
  <div class="barra-filtros" style="display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap">
    <select class="sel" id="pqSemana" aria-label="Semana"><option value="">Todo el periodo</option>${semanasPeriodo().map(w => `<option value="${w.k}" ${S.pqSemana === w.k ? "selected" : ""}>Semana del ${fISO(w.ini)} al ${fISO(w.fin)}</option>`).join("")}</select>
    <select class="sel" id="pqEj" aria-label="Ejecutivo"><option value="">Todos los ejecutivos</option>${S.ejecutivos.map(e => `<option value="${esc(e.correo)}" ${S.pqEj === e.correo ? "selected" : ""}>${esc(e.nombre)}</option>`).join("")}</select>
    <button class="btn" data-pq-csv style="margin-left:auto">Descargar CSV</button>
  </div>
  ${S.msiInfErr ? `<div class="aviso warn" style="margin-bottom:12px">No se pudo leer lo inferido de «qué lo convenció»: ${esc(S.msiInfErr)}</div>` : ""}
  <div class="aviso" style="margin-bottom:14px">Cada comercio cuenta una vez, por su <b>última visita</b>. «Éxito» es lo que declaró el comercio en la visita (realizará consumos); el cruce con las transacciones de BBVA va aparte. Desde el 25/09 el ejecutivo marca qué lo convenció; antes, Stratis lo leyó del comentario y se ve como <b>inferido</b>. Haz clic en cualquier barra para ver los comercios y sus comentarios.</div>
  <div class="panel" style="margin-bottom:16px">
    <div class="barra"><b>Resultado de los ${tot} comercios visitados</b><span class="lbl">por su última visita · suma 100 %</span></div>
    <div style="padding:6px 14px 14px"><div class="pq-barra">${segs}</div><div class="pq-leyenda">${leyenda}</div></div>
  </div>
  <div class="panel" style="margin-bottom:16px">
    <div class="barra"><b>Dónde se queda cada comercio</b><span class="lbl">las cuatro preguntas de la visita, en orden</span></div>
    ${embudo}
    ${dirMal ? `<div class="atajos" style="padding:0 14px 12px">Además, en <button class="lnk" data-pq="dir"><b class="num">${dirMal}</b> comercio${dirMal === 1 ? "" : "s"}</button> la dirección no era la correcta, pero el ejecutivo lo encontró y habló con alguien: cuentan como encontrados.</div>` : ""}
    ${ubiSi + ubiNo ? `<div class="atajos" style="padding:0 14px 12px">Dirección de la base errada, lo que marcó el ejecutivo (desde el 25/09): en <button class="lnk" data-pq="ubi:si"><b class="num">${ubiSi}</b> comercio${ubiSi === 1 ? "" : "s"}</button> lo ubicó en otra dirección y en <button class="lnk" data-pq="ubi:no"><b class="num">${ubiNo}</b></button> no lo encontró.</div>` : ""}
  </div>
  <div class="fb-dos">
    <div class="pq-col">
    <div class="panel">
      <div class="barra"><b>Por qué sí</b><span class="lbl">${exito.length} comercio${exito.length === 1 ? "" : "s"} con éxito · ${nMsiEj} marcado${nMsiEj === 1 ? "" : "s"} por el ejecutivo, ${exito.length - nMsiEj} inferido${exito.length - nMsiEj === 1 ? "" : "s"} · pueden tener varios motivos</span></div>
      <div class="fbv">${exito.length ? barrasSi : `<div class="atajos">Todavía no hay comercios con éxito en el filtro.</div>`}</div>
    </div>
    <div class="panel">
      <div class="barra"><b>Por qué no hubo contacto</b><span class="lbl">${sinC} comercio${sinC === 1 ? "" : "s"} · lo que marcó el ejecutivo</span></div>
      <div class="fbv">${barrasNc}</div>
    </div>
    </div>
    <div class="panel">
      <div class="barra"><b>Por qué no</b><span class="lbl">${noL.length} comercio${noL.length === 1 ? "" : "s"} con contacto que no terminaron en éxito · feedback de la visita</span></div>
      <div class="pq-alc" role="group" aria-label="Qué comercios"><button class="${alc === "ambos" ? "on" : ""}" data-pq-alc="ambos">No éxito y en proceso · ${nR("no") + nR("proceso")}</button><button class="${alc === "no" ? "on" : ""}" data-pq-alc="no">Solo no éxito · ${nR("no")}</button><button class="${alc === "proceso" ? "on" : ""}" data-pq-alc="proceso">Solo en proceso · ${nR("proceso")}</button></div>
      <div class="fbv">${barrasNo}</div>
    </div>
  </div>
  <div class="panel pq-lista-ancla" style="margin:16px 0">
    <div class="barra"><b>Comercios · ${esc(etq)}</b><span class="lbl">${lista.length} comercio${lista.length === 1 ? "" : "s"}</span>${S.pqSel ? `<button class="btn q" data-pq="" style="margin-left:auto">Ver todos</button>` : ""}</div>
    ${lista.length ? `<div class="fbv-notas">${lista.slice(0, 80).map(({ v, r, f, m, n }) => `<div class="fbv-nota"><div class="fbv-cab"><span class="pq-res ${r}">${RES_TXT[r]}</span><span class="num">${fISO(iso(v.visitado_en))} ${hh(v.visitado_en)}</span><span class="ej">${AVATAR(ejDe(v.correo))}${esc(nombreCorto(ejDe(v.correo).nombre))}</span><b>${esc(v.comercio)}</b><span class="muted">${esc(v.distrito || "")}${n > 1 ? ` · ${n} visitas` : ""}</span><button class="btn q" data-ir-traza="${v.id}">Ver</button></div>
      <div class="muted" style="font-size:12px">${esc(comoFue(v).join(" · "))}</div>
      ${m && m.motivos.length ? `<div class="fb-tags"><span class="pq-et si">Qué lo convenció${m.fuente === "inferido" ? " · inferido" : ""}</span>${m.motivos.map(t => `<span class="fb-tag si">${esc(t)}</span>`).join("")}</div>` : ""}
      ${f && (f.tipos.length || f.fuera.length) ? `<div class="fb-tags"><span class="pq-et">Feedback${f.fuente === "inferido" ? " · inferido" : ""}</span>${tagsFb(f.tipos)}${tagsFb(f.fuera, "fuera")}</div>` : ""}
      <div class="fbv-txt">«${esc(v.comentario || "")}»</div>${m && m.criterio ? `<div class="fb-crit">${esc(m.criterio)}</div>` : ""}</div>`).join("")}</div>` : `<div class="atajos" style="padding:14px">No hay comercios en este filtro.</div>`}
  </div>
  <div class="panel">
    <div class="barra"><b>Por ejecutivo</b><span class="lbl">comercios por su última visita</span></div>
    <div style="overflow-x:auto"><table class="datos"><thead><tr><th>Ejecutivo</th><th class="n">Visitados</th>${RESULTADOS.map(r => `<th class="n">${r[1]}</th>`).join("")}<th class="n">Éxito sobre<br>los contactados</th></tr></thead><tbody>
      ${ejs.map(e => { const l = cs.filter(o => o.v.correo === e.correo), c = l.filter(o => o.v.con !== "Nadie").length, x = l.filter(o => o.r === "exito").length;
        return `<tr><td><span class="ej">${AVATAR(e)}${esc(e.nombre)}</span></td><td class="n num"><b>${l.length}</b></td>${RESULTADOS.map(([k]) => { const n = l.filter(o => o.r === k).length; return `<td class="n num ${n ? "" : "muted"}">${n || "·"}</td>`; }).join("")}<td class="n num">${c ? pct(x, c) + " %" : "—"} <span class="muted">(${x}/${c})</span></td></tr>`; }).join("")}
      <tr class="total"><td><b>Total</b></td><td class="n num"><b>${tot}</b></td>${RESULTADOS.map(([k]) => `<td class="n num"><b>${nR(k)}</b></td>`).join("")}<td class="n num"><b>${contacto ? pct(exito.length, contacto) + " %" : "—"}</b> <span class="muted">(${exito.length}/${contacto})</span></td></tr>
    </tbody></table></div>
  </div>`;
}

function vistaIndicadores(){
  if (!S.avance && !S.avanceErr){ cargarAvance(); return `<div class="cargando"><span class="spin"></span>Calculando…</div>`; }
  if (S.avanceErr) return `<div class="aviso mal">${esc(S.avanceErr)}</div>`;
  const filas = S.avance.filter(a => a.rol === "Ejecutivo" || !["Analista","Manager"].includes(a.rol));
  const p = filas[0] || {};
  const pct1 = x => x == null ? "—" : Number(x).toFixed(1).replace(".", ",") + " %";
  return `${p.sin_parametros ? `<div class="aviso warn" style="margin-bottom:12px">El periodo no tiene parámetros cargados: se cuentan los indicadores pero no hay puntos ni bono.</div>` : ""}
  ${p.hay_transacciones === false ? `<div class="aviso warn" style="margin-bottom:12px">Sin transacciones cargadas: los reactivados están en cero para todos. Carga la data diaria de BBVA en «Cargas».</div>` : ""}
  <div class="panel"><div class="barra"><b>Equipo · periodo ${esc(p.periodo || "")}</b><span class="lbl">pesos ${p.peso_reactivados ?? "—"} · ${p.peso_visitas ?? "—"} · ${p.peso_conversion ?? "—"} · metas ${p.meta_reactivados ?? "—"} reactivados · ${p.meta_visitas ?? "—"} visitas · ${p.meta_conversion != null ? pct1(p.meta_conversion) : "—"} de conversión · bono desde ${p.puntos_min ?? "—"} puntos</span></div>
  <div style="overflow:auto"><table class="datos"><thead><tr><th>Ejecutivo</th><th class="n">Base</th><th class="n">Visitados</th><th class="n">Reactivados</th><th class="n">Conversión</th><th class="n">Puntos</th><th class="n">Bono</th><th class="n">Paga · retiene</th><th>Objetivo BBVA</th></tr></thead><tbody>
    ${filas.map(a => { const e = ejDe(a.correo); return `<tr><td><span class="ej">${AVATAR(e)}${esc(a.nombre || e.nombre)}</span></td><td class="n num">${num(a.base)}</td><td class="n num">${num(a.visitados)} <span style="color:var(--muted)">/ ${a.meta_visitas ?? "—"}</span></td><td class="n num">${num(a.reactivados)} <span style="color:var(--muted)">/ ${a.meta_reactivados ?? "—"}</span></td><td class="n num">${pct1(a.conversion)}</td><td class="n num"><b>${a.puntos == null ? "—" : Number(a.puntos).toFixed(1).replace(".", ",")}</b></td><td class="n num">${a.bono_pct == null ? "—" : pct1(a.bono_pct)}</td><td class="n num">${a.bono_pagado == null ? "—" : pct1(a.bono_pagado) + " · " + pct1(a.bono_retenido)}</td><td>${a.objetivo_bbva ? `<span class="pill val">cumplido</span>` : `<span class="pill pend">pendiente</span>`}</td></tr>`; }).join("")}
  </tbody></table></div>
  <div class="atajos">Solo cuentan las visitas no anuladas, una por comercio. Los reactivados salen de la data de BBVA cargada, no de lo que declara el ejecutivo.</div></div>`;
}

/* =========================================================================
   Base para BBVA (Excel) · modelo de Jose del 30/09/2026
   Llave Customer_ID (texto, 8 dígitos). Dos hojas: KPIs · Base. Todos los KPIs son fórmulas sobre la hoja Base.
   ========================================================================= */
const FB_29 = ["Desconfía de la visita (duda que representemos a BBVA)", "No pidió el POS", "Solicitó cambio de equipo", "Le falta una función"];
const BBVA_ORDEN = ["No se encontraba la persona que tomaba decisiones", "No necesitaba los POS", "POS no enciende", "Soporte no ayudó al comercio",
  "Mala Señal en el POS", "POS no tiene señal y no puedo cobrar", "POS no cuenta con la tarifa acordada", "POS problema con abonos",
  "POS queda procesando el pago , se demora", "El cobro a través del POS tarda demasiado cuando existe alta demanda", "POS rechaza los pagos con tarjeta",
  // agregados por Stratis (árbol del 26/09)
  "Usa POS de otra marca", "Pide una tasa más baja", "Los abonos le llegan con demora", "Cobra con Yape o Plin para no pagar comisión", "Solo acepta efectivo",
  "No tiene contómetros o le quedan pocos", "Le parece complicado usar el POS", "No sabe revisar sus ventas o abonos", "Su funcionario de BBVA no responde",
  // agregados por Stratis (tipificaciones del 29/09, aprobadas por Gabriel): en el Excel van al final de Base
  ...FB_29];
function cargarScript(src){ return new Promise((ok, mal) => { const e = document.createElement("script"); e.src = src; e.onload = ok; e.onerror = () => mal(new Error("No se pudo cargar " + src)); document.head.appendChild(e); }); }
async function baseBBVA(){
  if (S._bajandoBase) return; S._bajandoBase = true; toast("Armando la base para BBVA…");
  try {
    if (!window.ExcelJS) await cargarScript("https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js");
    await Promise.all([cargarActividad(true), cargarBase(), cargarFbInferido(), cargarMsiInferido()]);
    const per = S.periodo ? S.periodo.id : null;
    // TIPOS: todas las columnas por tipo. Las del 29/09 (FB_29) van al final de Base para no correr las columnas de antes.
    const TIPOS = BBVA_ORDEN.concat(FB_NINGUNO), T_ANT = TIPOS.filter(t => !FB_29.includes(t));
    const dmy = s => s ? String(s).slice(0, 10).split("-").reverse().join("/") : "";
    const vs = S.act.filter(v => v.estado_anul !== "anulada" && (!per || v.periodo === per)).sort((a, b) => a.visitado_en < b.visitado_en ? -1 : 1);
    const valida = v => v.lat != null && !v.fuera_plazo;
    const porCid = {}; vs.forEach(v => (porCid[v.customer_id] ||= []).push(v));
    const base = S.base.slice().sort((a, b) => a.customer_id < b.customer_id ? -1 : 1);
    const wb = new ExcelJS.Workbook(); wb.creator = "Stratis"; wb.created = new Date();
    const k = wb.addWorksheet("KPIs"); // primera hoja; se llena al final, cuando ya se conocen los rangos
    const AZ = "FF0C1137", NA = "FFF86F35", IN = "FF232C86", GR = "FF5B6680", VE = "FF07785F";
    const cab = (ws, cols, grupos) => { const r = ws.getRow(1); r.height = 62;
      cols.forEach((c, i) => { const x = r.getCell(i + 1); x.font = { name:"Arial", bold:true, color:{ argb:"FFFFFFFF" }, size:10 };
        x.fill = { type:"pattern", pattern:"solid", fgColor:{ argb: grupos.si && grupos.si(i + 1) ? VE : grupos.fb && grupos.fb(i + 1) ? NA : grupos.k && grupos.k(i + 1) ? IN : AZ } };
        x.alignment = { wrapText:true, vertical:"middle" }; }); };
    const tabla = (ws, nombre, cols, filas, anchos, grupos) => {
      ws.addTable({ name:nombre, ref:"A1", headerRow:true, style:{ theme:"TableStyleLight1", showRowStripes:true }, columns:cols.map(c => ({ name:c, filterButton:true })), rows:filas.length ? filas : [cols.map(() => "")] });
      cab(ws, cols, grupos); anchos.forEach((w, i) => ws.getColumn(i + 1).width = w);
      ws.getColumn(1).numFmt = "@"; ws.views = [{ state:"frozen", xSplit:1, ySplit:1 }];
      ws.eachRow((row, n) => { if (n > 1) row.eachCell(c => c.font = { name:"Arial", size:10 }); });
    };
    // Base: una fila por Customer ID. «Ejecutivo» (al final) es la asignación del periodo en el CRM: de ahí salen los KPIs por ejecutivo.
    const colsB = ["Customer_ID","Visitado","Gestion_Con_Contacto","Fecha_Primera_Gestion_Con_Contacto","Contacto_En_Otra_Direccion","Visitas_Registradas","Visitas_Validas","Visitas_Con_Contacto","Fecha_Primera_Visita","Fecha_Ultima_Visita","Ultimo_Con_Quien","Ultimo_Que_Paso","Ultima_Decision","Ultimo_Comentario","Dias_Con_Trx","Reactivado","Derivado_Recuperacion","Equipo_Recuperado","Feedback","Fuente_Feedback"].concat(T_ANT, ["Fuera_de_la_Lista_BBVA","Feedback_Adicional","Que_Ofrecio","POS_Otra_Marca","Demora_Abono","Resultado","Motivos_Si","Fuente_Motivos_Si"], FB_29, ["Comercio_Cerro_Definitivamente","Ejecutivo"]);
    const filasB = base.map(c => { const l = porCid[c.customer_id] || [], ult = l[l.length - 1];
      const fb = new Set(), fuentes = new Set(), fuera = new Set(), notas = [], acc = new Set(), comp = [], dem = [];
      l.forEach(v => { const f = fbDe(v); if (!f || !f.fuente) return; f.tipos.forEach(t => fb.add(t)); if (f.tipos.length) fuentes.add(f.fuente === "ejecutivo" ? "Ejecutivo" : "Inferido del comentario"); f.fuera.forEach(t => fuera.add(t)); if (f.nota) notas.push(f.nota);
        (f.acc || []).forEach(a => acc.add(a)); const ct = competidorTxt(f.ext); if (ct && !comp.includes(ct)) comp.push(ct); const dt = demoraTxt(f.ext); if (dt && !dem.includes(dt)) dem.push(dt); });
      if (fb.has(FB_NINGUNO) && fb.size > 1) fb.delete(FB_NINGUNO);
      const des = l.filter(v => v.decision === "Desiste del producto"), m = ult ? msiDe(ult) : null;
      // Para el cruce con los volúmenes de BBVA: primera visita válida (con GPS y a tiempo) en la que habló con alguien del comercio,
      // aunque haya sido en otra dirección (dirección errada pero comercio ubicado)
      const gc = l.find(v => valida(v) && v.con !== "Nadie"), fGc = gc ? iso(gc.visitado_en).split("-").map(Number) : null;
      return [c.customer_id,
        l.some(valida) ? "SI" : "NO", gc ? "SI" : "NO", fGc ? new Date(Date.UTC(fGc[0], fGc[1] - 1, fGc[2])) : null,
        gc ? (l.some(v => valida(v) && v.con !== "Nadie" && v.direccion_ok === false) ? "SI" : "NO") : "", l.length, l.filter(valida).length, l.filter(v => v.con !== "Nadie").length, l.length ? dmy(iso(l[0].visitado_en)) : "", ult ? dmy(iso(ult.visitado_en)) : "",
        ult ? ult.con : "", ult ? ult.que + (ult.motivo ? " · " + ult.motivo : "") : "", ult ? ult.decision || "" : "", ult ? String(ult.comentario || "").replace(/\s+/g, " ") : "",
        c.dias_trx || 0, (c.dias_trx || 0) >= 2 ? "SI" : "NO", des.length ? "SI" : "NO", des.length ? des[des.length - 1].equipo || "" : "",
        TIPOS.filter(t => fb.has(t)).join(" | "), [...fuentes].sort().join(" + ")].concat(T_ANT.map(t => fb.has(t) ? 1 : 0), [[...fuera].sort().join(" | "), notas.join(" / "), ACCIONES.filter(a => acc.has(a)).join(" | "), comp.join(" / "), dem.join(" / "),
        ult ? RES_TXT[resultadoDe(ult)] : "Sin visita", m ? m.motivos.join(" | ") : "", m && m.fuente ? (m.fuente === "ejecutivo" ? "Ejecutivo" : "Inferido del comentario") : ""],
        FB_29.map(t => fb.has(t) ? 1 : 0), [ult && ult.motivo === "Cerró definitivamente" ? "SI" : "NO", c.correo ? ejDe(c.correo).nombre : ""]); });
    const wsB = wb.addWorksheet("Base");
    const nB0 = colsB.length - FB_29.length - 2;   // columnas antes de las agregadas al final
    tabla(wsB, "Base", colsB, filasB, [12,9,11,13,11,10,9,10,11,11,10,22,18,44,9,10,12,11,40,16].concat(T_ANT.map(() => 13), [30,30,40,22,20,14,40,16], FB_29.map(() => 13), [14,20]),
      { k:i => (i >= 2 && i <= 18) || i >= colsB.length - 1, fb:i => i >= 19 && i < colsB.length - 1, si:i => i > nB0 - 3 && i <= nB0 });
    wsB.getColumn(4).numFmt = "dd/mm/yyyy";
    const ramaDe = t => (FEEDBACK.find(g => g[1].includes(t)) || [])[0] || (t === FB_NINGUNO ? "Sin observaciones" : "Otro");
    // KPIs: fórmulas sobre la hoja Base (rangos fijos, se recalculan en Excel). Sin notas al pie (Jose, 30/09).
    const nB = filasB.length + 1;
    const col = (cols, nombre) => { let n = cols.indexOf(nombre) + 1, s = ""; while (n > 0){ const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
    const RB = n => `Base!$${col(colsB, n)}$2:$${col(colsB, n)}$${nB}`;
    k.views = [{ showGridLines:false }];
    const put = (r, c, v, st) => { const x = k.getCell(r, c); x.value = v; x.font = Object.assign({ name:"Arial", size:10 }, st || {}); return x; };
    const nota = { size:9, italic:true, color:{ argb:GR } };
    const encab = (r, cols, color) => cols.forEach((h, i) => { const x = put(r, i + 1, h, { bold:true, color:{ argb:"FFFFFFFF" } }); x.fill = { type:"pattern", pattern:"solid", fgColor:{ argb:color } }; x.alignment = { wrapText:true, vertical:"middle" }; });
    put(1, 1, "Campaña BBVA Adquirencia · periodo " + (per || "") + " · base para BBVA", { size:14, bold:true, color:{ argb:AZ } });
    const tit = (r, t) => put(r, 1, t, { size:11, bold:true, color:{ argb:IN } });
    const fil = (r, a, f, c) => { put(r, 1, a); put(r, 2, { formula:f }, { bold:true }); if (c) put(r, 3, c, nota); };
    tit(4, "Definición de KPIs a medir");
    fil(5, "Universo", `COUNTA(${RB("Customer_ID")})`, `Total de clientes: los ${numPE(base.length)} leads del periodo`);
    fil(6, "Visitas registradas", `SUM(${RB("Visitas_Registradas")})`, "Todas las visitas no anuladas, con o sin contacto (suma de Visitas_Registradas de la hoja Base)");
    fil(7, "Comercios visitados", `COUNTIF(${RB("Visitado")},"SI")`, "Con al menos una visita válida y registrada a tiempo (la que cuenta)");
    fil(8, "Reactivación", `COUNTIF(${RB("Reactivado")},"SI")`, "Comercios con transacciones en 2 días distintos después de la visita, según la data de BBVA");
    fil(9, "Recuperados (derivados a recuperación)", `COUNTIF(${RB("Derivado_Recuperacion")},"SI")`, "Comercios que desistieron del producto: se derivan a la recuperación del POS");
    fil(10, "   con el equipo ya recuperado", `COUNTIFS(${RB("Derivado_Recuperacion")},"SI",${RB("Equipo_Recuperado")},"Sí")`, "Según lo que marcó el ejecutivo en la visita");
    tit(12, "Visitas por grupo de ejecutivo");
    encab(13, ["Ejecutivo","Base asignada","Visitas registradas","Comercios visitados","Visitas con contacto"], AZ);
    const ejs = [...new Set(base.filter(c => c.correo).map(c => ejDe(c.correo).nombre))].sort();
    ejs.forEach((e, i) => { const r = 14 + i; put(r, 1, e);
      put(r, 2, { formula:`COUNTIF(${RB("Ejecutivo")},A${r})` }, { bold:true });
      put(r, 3, { formula:`SUMIF(${RB("Ejecutivo")},A${r},${RB("Visitas_Registradas")})` }, { bold:true });
      put(r, 4, { formula:`COUNTIFS(${RB("Ejecutivo")},A${r},${RB("Visitado")},"SI")` }, { bold:true });
      put(r, 5, { formula:`SUMIF(${RB("Ejecutivo")},A${r},${RB("Visitas_Con_Contacto")})` }, { bold:true }); });
    const rt = 14 + ejs.length; put(rt, 1, "Total", { bold:true }); if (ejs.length) ["B","C","D","E"].forEach((L, i) => put(rt, i + 2, { formula:`SUM(${L}14:${L}${rt - 1})` }, { bold:true }));
    const r0 = rt + 3; tit(r0, "KPIs adicionales · feedback de comercios"); put(r0, 3, "Un comercio puede tener más de un tipo", nota);
    encab(r0 + 1, ["Tipo de feedback (texto de BBVA)","Comercios","Rama"], NA);
    TIPOS.forEach((t, i) => { const r = r0 + 2 + i; put(r, 1, t + (FB_BBVA.has(t) ? "" : "  (agregada por Stratis)")); put(r, 2, { formula:`SUM(${RB(t)})` }, { bold:true }); put(r, 3, ramaDe(t), { size:9, color:{ argb:GR } }); });
    const rf = r0 + 2 + TIPOS.length;
    fil(rf, "Comercios con contacto sin feedback registrado", `COUNTIFS(${RB("Gestion_Con_Contacto")},"SI",${RB("Feedback")},"")`, "Gestión con contacto y sin tipo de feedback en la hoja Base");
    const ra = rf + 2; encab(ra, ["Qué ofreció el ejecutivo (desde el 26/09)","Comercios"], NA);
    ACCIONES.forEach((t, i) => { const r = ra + 1 + i; put(r, 1, t); put(r, 2, { formula:`COUNTIF(${RB("Que_Ofrecio")},"*${t.replace(/[*?~]/g, "~$&")}*")` }, { bold:true }); });
    const rq = ra + 2 + ACCIONES.length; tit(rq, "Por qué sí / por qué no · resultado por comercio"); put(rq, 3, "Por la última visita de cada comercio visitado", nota);
    encab(rq + 1, ["Resultado","Comercios","Qué incluye"], VE);
    RESULTADOS.forEach(([, t, d], i) => { const r = rq + 2 + i; put(r, 1, t); put(r, 2, { formula:`COUNTIF(${RB("Resultado")},"${t}")` }, { bold:true }); put(r, 3, d, nota); });
    const rs = rq + 2 + RESULTADOS.length; put(rs, 1, "Total de comercios visitados", { bold:true }); put(rs, 2, { formula:`SUM(B${rq + 2}:B${rs - 1})` }, { bold:true });
    const rm = rs + 2; encab(rm, ["Qué lo convenció (comercios con éxito)","Comercios"], VE);
    MOTIVOS_SI.forEach((t, i) => { const r = rm + 1 + i; put(r, 1, t); put(r, 2, { formula:`COUNTIF(${RB("Motivos_Si")},"*${t}*")` }, { bold:true }); });
    const rsd = rm + 1 + MOTIVOS_SI.length; put(rsd, 1, "Éxito sin detalle de qué lo convenció"); put(rsd, 2, { formula:`COUNTIFS(${RB("Resultado")},"Éxito",${RB("Motivos_Si")},"")` }, { bold:true });
    k.getColumn(1).width = 62; [2,3,5].forEach(i => k.getColumn(i).width = 14); k.getColumn(4).width = 30; k.getRow(13).height = 30;
    const buf = await wb.xlsx.writeBuffer();
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([buf], { type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    a.download = `Base_BBVA_Periodo${per ? "_" + per : ""}_${hoyISO().replace(/-/g, "")}.xlsx`; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    toast(`Base para BBVA descargada: ${filasB.length} comercios, hojas KPIs y Base.`);
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
  if (ev.target.id !== "fLogin") return; ev.preventDefault();
  const b = $("#bEntrar"); b.disabled = true; b.textContent = "Entrando…"; $("#lErr").innerHTML = "";
  const { data, error } = await sb.auth.signInWithPassword({ email:$("#lCorreo").value.trim().toLowerCase(), password:$("#lClave").value });
  if (error){ $("#lErr").innerHTML = `<div class="aviso mal err">${esc(/invalid/i.test(error.message) ? "Correo o contraseña incorrectos." : error.message)}</div>`; b.disabled = false; b.textContent = "Entrar"; return; }
  S.sesion = data.session; cargar();
});
document.addEventListener("click", async ev => {
  const t = ev.target.closest("[data-descartar-ret],[data-pq],[data-pq-alc],[data-pq-csv],[data-base-bbva],[data-ppt-bbva],[data-fb-tipo],[data-fb-csv],[data-ir-dia],[data-mmet],[data-mdist],#btnTema,[data-vista],[data-filtro],[data-sel],[data-accion],[data-cancelar],[data-confirmar],[data-tab],[data-traza],[data-copiar],[data-ir-cola],[data-ir-traza],[data-tipo],[data-salir],[data-refrescar],#elegir,#otroArchivo,#cargar,#guardarTotales,#otraCarga,#valBloque,#limpiarSel,#btnPausa");
  if (!t) return;
  if (t.hasAttribute("data-descartar-ret")){
    const uid = t.dataset.descartarRet, r = (S.retenidas || []).find(x => x.cliente_uid === uid); if (!r) return;
    const nota = prompt(`¿Descartar la visita retenida de ${r.ejecutivo || r.correo} en ${r.comercio || "ID " + r.customer_id}? Su celular la quita al sincronizar.\n\nNota (opcional):`, "");
    if (nota === null) return;
    const { error } = await sb.rpc("v2_descartar_retenida", { p_cliente_uid: uid, p_nota: nota.trim() || null });
    if (error){ toast("No se descartó: " + error.message); return; }
    await cargarRetenidas(); toast("Descartada. El celular la quita al sincronizar."); pintar(); return;
  }
  if (t.hasAttribute("data-pq-csv")){ csvPq(); return; }
  if (t.hasAttribute("data-pq-alc")){ S.pqAlcance = t.dataset.pqAlc; if ((S.pqSel || "").startsWith("no:")) S.pqSel = ""; pintar(); return; }
  if (t.hasAttribute("data-pq")){ S.pqSel = S.pqSel === t.dataset.pq ? "" : t.dataset.pq; pintar(); if (S.pqSel) document.querySelector(".pq-lista-ancla")?.scrollIntoView({ behavior:"smooth", block:"start" }); return; }
  if (t.hasAttribute("data-base-bbva")){ baseBBVA(); return; }
  if (t.hasAttribute("data-ppt-bbva")){ presentacionBBVA(); return; }
  if (t.hasAttribute("data-fb-csv")){ csvFeedback(); return; }
  if (t.hasAttribute("data-fb-tipo")){ S.fbTipo = S.fbTipo === t.dataset.fbTipo ? "" : t.dataset.fbTipo; pintar(); return; }
  if (t.hasAttribute("data-salir")){ await sb.auth.signOut(); location.reload(); return; }
  if (t.hasAttribute("data-refrescar")){ S.bit = {}; await cargarActividad(); await cargarBase(); await cargarFbInferido(); await cargarMsiInferido(); toast("Actualizado."); pintar(); return; }
  if (t.id === "btnPausa"){ S.pausa = !S.pausa; pintar(); return; }
  if (t.id === "btnTema"){ cambiarTema(); return; }
  if (t.dataset.mmet){ S.mMet = t.dataset.mmet; pintar(); return; }
  if (t.hasAttribute("data-mdist")){ const c = t.dataset.mdist || null; S.mDist = c && S.mDist === c && t.tagName === "TR" ? null : c; S.mEnfocar = S.mDist; S.mScroll = t.tagName === "TR" && !!S.mDist; if (!c) S.mVista = null; pintar(); return; }
  if (t.dataset.irDia){ S.vista = "validacion"; S.filtro = "todos"; S.dia = t.dataset.irDia; S.ej = t.dataset.irEj || "todos"; S.sel = null; S.accion = null; try { history.replaceState(null, "", "#validacion"); } catch(e){} pintar(); return; }
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
  if (t.dataset.irCola){ S.vista = "validacion"; S.filtro = "todos"; S.dia = "periodo"; S.ej = "todos"; S.sel = t.dataset.irCola; pintar(); return; }
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
  if (t.id === "fEj"){ S.ej = t.value; S.sel = null; pintar(); }
  if (t.id === "fDia"){ S.dia = t.value; S.sel = null; pintar(); }
  if (t.id === "mEj"){ S.mEj = t.value; S.mDist = null; S.mVista = null; pintar(); }
  if (t.id === "fbSemana"){ S.fbSemana = t.value; pintar(); }
  if (t.id === "fbEj"){ S.fbEj = t.value; pintar(); }
  if (t.id === "fbFuente"){ S.fbFuente = t.value; pintar(); }
  if (t.id === "pqSemana"){ S.pqSemana = t.value; pintar(); }
  if (t.id === "pqEj"){ S.pqEj = t.value; pintar(); }
  if (t.id === "mRango"){ S.mRango = t.value; pintar(); }
  if (t.id === "mPuntos"){ S.mPuntos = t.checked; pintar(); }
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
  if (ev.key.toLowerCase() === "v" && S.sel){ const v = S.act.find(x=>x.id===S.sel); if (v && estadoDe(v) !== "anu" && estadoDe(v) !== "val") accion(S.sel, "val").then(ok => { if (ok){ toast("Validada."); if (S.filtro === "pend") siguientePendiente(S.sel); pintar(); } }); }
  if (ev.key.toLowerCase() === "o" && S.sel){ S.accion = "obs"; pintar(); $("#mSel")?.focus(); }
  if (ev.key.toLowerCase() === "a" && S.sel){ S.accion = "anu"; pintar(); $("#mSel")?.focus(); }
  if (ev.key === "Escape" && S.accion){ S.accion = null; pintar(); }
});

/* ---------- arranque ---------- */
(async function(){
  try { const h = location.hash.replace("#",""); if (["validacion","equipo","mapa","feedback","porque","auditoria","cargas","indicadores"].includes(h)) S.vista = h; } catch(e){}
  const { data } = await sb.auth.getSession();
  S.sesion = data.session || null;
  sb.auth.onAuthStateChange((ev, ses) => { if (ev === "SIGNED_OUT"){ S.sesion = null; S.yo = null; pintar(); } else if (ses) S.sesion = ses; });
  if (S.sesion) cargar(); else { S.cargando = false; pintar(); }
})();

/* =========================================================================
   Presentación semanal para BBVA y Mastercard (PowerPoint, 29/09/2026)
   Se arma en el navegador con los datos de la base al momento de descargarla: aquí no hay datos de
   comercios, solo el diseño. Corte por defecto: ayer (el jueves, corte al miércoles; el lunes, la semana
   cerrada al domingo). Solo el periodo en curso: el modelo de medición cambió el 21/09.
   ========================================================================= */
const FONDO_LAMINA = "{{RECURSO:fondo_lamina.png}}";
const PX = { navy:"0C1137", tinta:"3F5073", gris:"A0ABBC", linea:"DDE2EC", suave:"F3F5FA", azul:"3B43FB", azulOsc:"232C86", naranja:"F86F35",
  naranjaSuave:"FBDDCF", verde:"0BBC96", blanco:"FFFFFF", lect:"DDE4F4", rojo:"B23A1F" };
const FT = "Open Sans", FTB = "Open Sans ExtraBold";
const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","setiembre","octubre","noviembre","diciembre"];
const DIAS_SEM = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
const fechaLarga = s => { const [a, m, d] = s.split("-").map(Number); return `${d} de ${MESES[m - 1]} de ${a}`; };
const diaSem = s => DIAS_SEM[new Date(s + "T12:00:00Z").getUTCDay()];
const numPE = x => Number(x || 0).toLocaleString("de-DE");   // punto de miles y coma decimal, como el Excel de Jose
// Nombre del periodo para BBVA: los periodos 1 y 2 fueron del CRM anterior
const mayus = t => t.charAt(0).toUpperCase() + t.slice(1);
const nombrePeriodo = p => ({ "2026-10":"periodo 3", "2026-11":"periodo 4", "2026-12":"periodo 5" })[p && p.id] || `periodo del ${fISO(p.ini)} al ${fISO(p.fin)}`;
const soles = x => x == null ? "—" : x >= 1e6 ? `S/ ${(x / 1e6).toFixed(2).replace(".", ",")} MM` : x >= 1e3 ? `S/ ${Math.round(x / 1e3).toLocaleString("de-DE")} mil` : `S/ ${Math.round(x).toLocaleString("de-DE")}`;
const pc = (a, b) => b ? Math.round(a * 100 / b) : 0;
const masDias = (s, n) => { const d = new Date(s + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// Corte: acepta AAAA-MM-DD o DD/MM/AAAA; no puede pasar de hoy ni salir del periodo
function leerCorte(txt){
  const t = String(txt || "").trim(); let m;
  if ((m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/))) return t;
  if ((m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

// Todas las cifras de la presentación, al corte C, con las mismas reglas del CRM
function datosPresentacion(C, RB, TB){
  const p = S.periodo, per = p.id;
  const vs = S.act.filter(v => v.estado_anul !== "anulada" && v.periodo === per && iso(v.visitado_en) <= C);
  const valida = v => v.lat != null && !v.fuera_plazo, contacto = v => v.con !== "Nadie";
  const vv = vs.filter(valida);   // visitas válidas: con ubicación y a tiempo (las mismas que cuentan en el medidor)
  const av0 = (S.avance || [])[0] || {}, nEj = Math.max(1, S.ejecutivos.length);
  const meta = { visEj:av0.meta_visitas, reaEj:av0.meta_reactivados, conv:av0.meta_conversion };
  meta.vis = meta.visEj * nEj; meta.rea = meta.reaEj * nEj;
  const cartera = S.base.filter(c => c.correo).length || S.base.length;
  // días hábiles del periodo (lunes a viernes) y días de fin de semana con campo
  const dh = []; for (let d = p.ini; d <= p.fin; d = masDias(d, 1)){ const w = new Date(d + "T12:00:00Z").getUTCDay(); if (w >= 1 && w <= 5) dh.push(d); }
  const conCampo = new Set(vv.map(v => iso(v.visitado_en)));
  const dias = [...new Set(dh.concat([...conCampo]))].sort();
  const metaDia = meta.vis / Math.max(1, dh.length);
  const primera = visitadosAlCorte(C);
  const visitados = Object.keys(primera).length;
  let habilN = 0;
  const serie = dias.map(d => { if (dh.includes(d)) habilN++;
    return { dia:d, habil:dh.includes(d), meta:Math.round(metaDia * habilN),
             nuevos:d <= C ? Object.values(primera).filter(k => k === d).length : null, acum:d <= C ? Object.values(primera).filter(k => k <= d).length : null }; });
  const dhCorte = dh.filter(d => d <= C).length, dhConCampo = dh.filter(d => d <= C && conCampo.has(d)).length;
  // último estado de cada comercio visitado
  const ult = {}; vv.forEach(v => { const u = ult[v.customer_id]; if (!u || v.visitado_en > u.visitado_en) ult[v.customer_id] = v; });
  const U = Object.values(ult);
  const contactados = new Set(vv.filter(contacto).map(v => v.customer_id)).size;
  const reunion = new Set(vv.filter(v => v.que === "Reunión concretada").map(v => v.customer_id)).size;
  const cuenta = f => U.filter(f).length;
  const res = { realiza:cuenta(v => v.decision === "Realizará consumos"), noDecide:cuenta(v => v.decision === "Aún no decide"), desiste:cuenta(v => v.decision === "Desiste del producto"),
    reag:cuenta(v => v.que === "Reagendada"), sinExito:cuenta(v => contacto(v) && v.que === "Sin éxito"), nadie:cuenta(v => !contacto(v)) };
  const motivosNadie = {}; U.filter(v => !contacto(v)).forEach(v => { const k = MOTIVO_TXT[v.motivo] || v.motivo || "Sin motivo"; motivosNadie[k] = (motivosNadie[k] || 0) + 1; });
  const volverAgendado = S.base.filter(c => c.volver_el && c.volver_el >= C).length;
  // semanas (lunes a domingo) hasta el corte
  const semanas = []; dias.filter(d => d <= C).forEach(d => { const w = new Date(d + "T12:00:00Z"), lun = masDias(d, -((w.getUTCDay() + 6) % 7));
    let s = semanas.find(x => x.lun === lun); if (!s){ s = { lun, ini:d, fin:d }; semanas.push(s); } s.fin = d; });
  semanas.forEach((s, i) => { const en = v => iso(v.visitado_en) >= s.lun && iso(v.visitado_en) <= masDias(s.lun, 6) && iso(v.visitado_en) <= C, sv = vv.filter(en);
    s.n = i + 1; s.visitas = sv.length; s.nuevos = Object.values(primera).filter(k => k >= s.lun && k <= masDias(s.lun, 6)).length;
    s.comercios = new Set(sv.map(v => v.customer_id)).size; s.contacto = new Set(sv.filter(contacto).map(v => v.customer_id)).size;
    s.realiza = new Set(sv.filter(v => v.decision === "Realizará consumos").map(v => v.customer_id)).size;
    s.acum = Object.values(primera).filter(k => k <= masDias(s.lun, 6) && k <= C).length;
    s.fin7 = masDias(s.lun, 6) < C ? masDias(s.lun, 6) : C; s.cerrada = masDias(s.lun, 6) <= C; });
  // distritos: cartera asignada, visitados, contactados y respuesta
  const dist = {}; const g = k => dist[k] ||= { clave:k, cartera:0, vis:0, con:0, realiza:0, noDecide:0 };
  S.base.forEach(c => { if (c.distrito && c.correo) g(c.distrito).cartera++; });
  Object.keys(primera).forEach(cid => { const c = S.baseMap[cid]; if (c && c.distrito) g(c.distrito).vis++; });
  U.forEach(v => { const c = S.baseMap[v.customer_id], k = (c && c.distrito) || v.distrito; if (!k) return;
    if (vv.some(x => x.customer_id === v.customer_id && contacto(x))) g(k).con++;
    if (v.decision === "Realizará consumos") g(k).realiza++; if (v.decision === "Aún no decide") g(k).noDecide++; });
  Object.values(dist).forEach(o => { o.cob = o.cartera ? o.vis / o.cartera : null; o.fav = o.con ? o.realiza / o.con : null; });
  // zonas (una por ejecutivo), rutas (9 comercios cada una) y distritos abordados
  const contactadosSet = new Set(vv.filter(contacto).map(v => v.customer_id)), zonas = {};
  S.base.filter(c => c.correo).forEach(c => { const z = zonas[c.zona || "Sin zona"] ||= { zona:c.zona || "Sin zona", correo:c.correo, cartera:0, vis:0, con:0, realiza:0, rutas:{}, distritos:{} };
    z.cartera++; const r = z.rutas[c.ruta || "Sin ruta"] ||= { ruta:c.ruta || "Sin ruta", n:0, vis:0 }; r.n++;
    const d = z.distritos[c.distrito || "Sin distrito"] ||= { d:c.distrito || "Sin distrito", n:0, vis:0 }; d.n++;
    if (primera[c.customer_id]){ z.vis++; r.vis++; d.vis++; } if (contactadosSet.has(c.customer_id)) z.con++;
    if (ult[c.customer_id] && ult[c.customer_id].decision === "Realizará consumos") z.realiza++; });
  Object.values(zonas).forEach(z => { z.rutasL = Object.values(z.rutas).sort((a, b) => a.ruta.localeCompare(b.ruta, "es", { numeric:true }));
    z.distL = Object.values(z.distritos).sort((a, b) => b.n - a.n); z.rutasIni = z.rutasL.filter(r => r.vis).length; z.rutasComp = z.rutasL.filter(r => r.vis >= r.n).length;
    z.distAbord = z.distL.filter(d => d.vis).length; });
  const zonasL = Object.values(zonas).sort((a, b) => a.zona.localeCompare(b.zona, "es", { numeric:true }));
  // feedback de las visitas con contacto: qué dijo el comercio, qué hizo el ejecutivo, por qué sí
  const vc = vv.filter(contacto), tipos = {}, acciones = {}, porQue = {}; let conFb = 0, deEjecutivo = 0;
  vc.forEach(v => { const f = fbDe(v); if (!f || !f.fuente) return; conFb++; if (f.fuente === "ejecutivo") deEjecutivo++;
    // «No se encontraba…» y «Reagendé…» los marca solo el celular según cómo fue la visita: no son lo que dijo el comercio
    f.tipos.filter(t => t !== FB_NINGUNO && t !== "No se encontraba la persona que tomaba decisiones").forEach(t => { const o = tipos[t] ||= { t, rama:(FEEDBACK.find(x => x[1].includes(t)) || [])[0] || "Otro", n:0, realiza:0 }; o.n++; if (v.decision === "Realizará consumos") o.realiza++; });
    if (f.fuente === "ejecutivo") (f.acc || []).filter(a => a !== "Reagendé con quien decide").forEach(a => { const o = acciones[a] ||= { a, n:0, realiza:0, noDecide:0 }; o.n++; if (v.decision === "Realizará consumos") o.realiza++; if (v.decision === "Aún no decide") o.noDecide++; });
    const m = msiDe(v); if (m && m.fuente) m.motivos.forEach(x => { porQue[x] = (porQue[x] || 0) + 1; }); });
  // citas candidatas: se muestran solo en el escritorio (panel de citas) para que Jose elija; nunca van al archivo (pueden traer nombres)
  const citas = vc.filter(v => (v.comentario || "").length >= 60 && (v.comentario || "").length <= 240)
    .sort((a, b) => (b.decision === "Realizará consumos") - (a.decision === "Realizará consumos") || b.visitado_en.localeCompare(a.visitado_en)).slice(0, 8)
    .map(v => `«${String(v.comentario).replace(/\s+/g, " ").trim()}» (${comoFue(v)[0]}${v.decision ? " · " + v.decision : ""})`);
  // Reactivación: el último corte de BBVA cargado hasta la fecha C, con la regla de cuentaBBVA.
  let bbva = null;
  if (RB){ const F = RB.filas.filter(r => S.baseMap[r.customer_id] && S.baseMap[r.customer_id].correo), reac = F.filter(r => r.reactivado === "Si"), cuentan = reac.filter(r => cuentaBBVA(r, primera));
    const conFac = F.some(r => r.facturado != null), facturado = conFac ? cuentan.reduce((a, r) => a + Number(r.facturado || 0), 0) : (RB.corte.facturado_total != null ? Number(RB.corte.facturado_total) : null);
    const porZona = {}; cuentan.forEach(r => { const z = S.baseMap[r.customer_id].zona || "Sin zona"; porZona[z] = (porZona[z] || 0) + 1; });
    bbva = { corte:RB.corte.corte, filas:F.length, reactivados:reac.length, cuentan:cuentan.length, enProceso:F.filter(r => r.reactivado === "En proceso").length,
      sinVisita:reac.filter(r => !primera[r.customer_id]).length, visitadosSinContacto:reac.filter(r => primera[r.customer_id] && !r.gestion_con_contacto).length,
      facturado, porZona, fueraCartera:RB.filas.length - F.length }; }
  // Totales de BBVA por corte (lo que usa la presentación desde el 30/09): grupos del CRM al corte de BBVA
  let tot = null;
  if (TB){ const g = gruposCRM(TB.corte); tot = Object.assign({ corte:TB.corte, g }, cuadroTotales(TB, g)); }
  const reactivados = tot ? tot.G.cc.reac : bbva ? bbva.cuentan : null;
  // fuente única de la reactivación para las láminas: corte, facturado de los que cuentan y base de la conversión
  const rb = tot ? { corte:tot.corte, facturado:tot.G.cc.fac, visitados:tot.g.vis } : bbva ? { corte:bbva.corte, facturado:bbva.facturado, visitados } : null;
  return { C, p, meta, cartera, nEj, dh, dhCorte, zonasL, dhConCampo, serie, visitados, contactados, reunion, res, motivosNadie, volverAgendado, semanas, dist, tipos:Object.values(tipos).sort((a, b) => b.n - a.n),
    acciones:Object.values(acciones).sort((a, b) => b.n - a.n), porQue:Object.entries(porQue).sort((a, b) => b[1] - a[1]), conFb, deEjecutivo, citas, reactivados, visitas:vs.length,
    diasCampo:[...conCampo].filter(d => d <= C).length, bbva, tot, rb };
}

// Mapa de Lima por distrito, dibujado en un lienzo (sin mosaicos) y devuelto como PNG. Color = cobertura de la cartera;
// cada distrito con cartera lleva su nombre y «visitados / cartera». Los distritos sin cartera quedan en gris, como contexto.
const RAMPA_COB = [["E4E8FB", "0 %"], ["B7C0F5", "1–24 %"], ["7F8CEF", "25–49 %"], ["4652E0", "50–74 %"], ["232C86", "75 % o más"]];
const claseCob = c => c == null ? -1 : c === 0 ? 0 : c < .25 ? 1 : c < .5 ? 2 : c < .75 ? 3 : 4;
function mapaLima(D){
  const W = 1500, H = 896, cv = document.createElement("canvas"); cv.width = W; cv.height = H; const x = cv.getContext("2d");
  const anillos = g => g.geometria.type === "Polygon" ? [g.geometria.coordinates] : g.geometria.type === "MultiPolygon" ? g.geometria.coordinates : [];
  const geo = (S.geo || []).filter(g => g.geometria), conCartera = geo.filter(g => D.dist[g.clave] && D.dist[g.clave].cartera);
  x.fillStyle = "#FFFFFF"; x.fillRect(0, 0, W, H);
  if (!conCartera.length){ x.fillStyle = "#A0ABBC"; x.font = "32px Arial"; x.fillText("Sin límites de distritos cargados", 60, H / 2); return cv.toDataURL("image/png"); }
  // encuadre: los distritos con cartera, con un margen
  let [a0, b0, a1, b1] = [180, 90, -180, -90];
  conCartera.forEach(g => anillos(g).forEach(pl => pl[0].forEach(([lo, la]) => { a0 = Math.min(a0, lo); a1 = Math.max(a1, lo); b0 = Math.min(b0, la); b1 = Math.max(b1, la); })));
  const mx = (a1 - a0) * .08, my = (b1 - b0) * .08; a0 -= mx; a1 += mx; b0 -= my; b1 += my;
  const cos = Math.cos((b0 + b1) / 2 * Math.PI / 180), k = Math.min(W / ((a1 - a0) * cos), H / (b1 - b0));
  const ox = (W - (a1 - a0) * cos * k) / 2, oy = (H - (b1 - b0) * k) / 2;
  const P = ([lo, la]) => [ox + (lo - a0) * cos * k, oy + (b1 - la) * k];
  const trazar = pl => { x.beginPath(); pl.forEach(r => r.forEach((q, j) => { const [px, py] = P(q); j ? x.lineTo(px, py) : x.moveTo(px, py); })); x.closePath(); };
  // centro visual del anillo exterior más grande (centroide por áreas)
  const centro = g => { let mejor = null, amax = 0;
    anillos(g).forEach(pl => { const r = pl[0].map(P); let A = 0, cx = 0, cy = 0;
      for (let i = 0; i < r.length - 1; i++){ const f = r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; A += f; cx += (r[i][0] + r[i + 1][0]) * f; cy += (r[i][1] + r[i + 1][1]) * f; }
      if (Math.abs(A) > amax){ amax = Math.abs(A); mejor = [cx / (3 * A), cy / (3 * A)]; } });
    return mejor; };
  geo.forEach(g => { const o = D.dist[g.clave], cl = o && o.cartera ? claseCob(o.cob) : -1;
    anillos(g).forEach(pl => { trazar(pl); x.fillStyle = cl < 0 ? "#F1F3F8" : "#" + RAMPA_COB[cl][0]; x.fill("evenodd"); x.strokeStyle = "#FFFFFF"; x.lineWidth = cl < 0 ? 1.5 : 2.5; x.stroke(); }); });
  // rótulos
  // rótulos: primero los distritos con más cartera; si un rótulo choca con otro ya puesto, no se dibuja
  // (el distrito sigue en los paneles de la derecha y en la tabla de la lámina siguiente)
  const puestos = [], choca = r => puestos.some(p => r[0] < p[2] && r[2] > p[0] && r[1] < p[3] && r[3] > p[1]);
  conCartera.slice().sort((a, b) => D.dist[b.clave].cartera - D.dist[a.clave].cartera).forEach(g => { const o = D.dist[g.clave], c = centro(g); if (!c) return;
    const oscuro = claseCob(o.cob) >= 3, nom = nombreDistrito(g.clave), cifra = `${o.vis}/${o.cartera}`;
    x.font = "bold 24px Arial"; const w = Math.max(x.measureText(nom).width, 60) + 10, r = [c[0] - w / 2, c[1] - 26, c[0] + w / 2, c[1] + 30];
    if (choca(r)) return; puestos.push(r);
    x.textAlign = "center"; x.lineJoin = "round";
    const esc = (t, y, font) => { x.font = font; x.lineWidth = 6; x.strokeStyle = oscuro ? "rgba(12,17,55,.55)" : "rgba(255,255,255,.92)"; x.strokeText(t, c[0], y); x.fillStyle = oscuro ? "#FFFFFF" : "#0C1137"; x.fillText(t, c[0], y); };
    esc(nom, c[1] - 3, "bold 24px Arial"); esc(cifra, c[1] + 23, "21px Arial"); });
  // leyenda
  const lx = 26, ly = H - 196; x.textAlign = "left";
  x.fillStyle = "rgba(255,255,255,.94)"; x.fillRect(lx - 14, ly - 40, 290, 232);
  x.font = "bold 24px Arial"; x.fillStyle = "#0C1137"; x.fillText("Cobertura de la cartera", lx, ly - 10);
  RAMPA_COB.concat([["F1F3F8", "sin cartera asignada"]]).forEach(([col, t], i) => { const y = ly + 8 + i * 30; x.fillStyle = "#" + col; x.fillRect(lx, y, 34, 20); x.strokeStyle = "#D5DAE6"; x.lineWidth = 1; x.strokeRect(lx, y, 34, 20);
    x.fillStyle = "#3F5073"; x.font = "21px Arial"; x.fillText(t, lx + 46, y + 17); });
  return cv.toDataURL("image/png");
}

// Citas candidatas: se muestran aquí para copiarlas a mano; no viajan en el archivo (pueden traer nombres)
function mostrarCitas(citas, C){
  document.getElementById("citasPpt")?.remove();
  if (!citas.length) return;
  const d = document.createElement("div"); d.id = "citasPpt";
  d.style.cssText = "position:fixed;right:20px;bottom:20px;max-width:560px;max-height:60vh;overflow:auto;background:var(--tarjeta);color:var(--ink);border:1px solid var(--linea);border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.25);padding:16px;z-index:50;font-size:13px";
  d.innerHTML = `<b>Citas de campo para la presentación del ${fISO(C)}</b><div class="muted" style="margin:4px 0 10px;font-size:12px">No van en el archivo. Revisa que no traigan nombres ni teléfonos antes de copiarlas.</div>
    ${citas.map(c => `<div style="padding:6px 0;border-top:1px solid var(--linea)">${esc(c)}</div>`).join("")}
    <div style="margin-top:10px;display:flex;gap:8px"><button class="btn p" data-citas-copiar>Copiar todas</button><button class="btn" data-citas-cerrar>Cerrar</button></div>`;
  d.querySelector("[data-citas-cerrar]").onclick = () => d.remove();
  d.querySelector("[data-citas-copiar]").onclick = () => { navigator.clipboard && navigator.clipboard.writeText(citas.join("\n")).then(() => toast("Citas copiadas."), () => toast("No se pudo copiar.")); };
  document.body.appendChild(d);
}
async function presentacionBBVA(){
  if (S._armandoPpt) return;
  if (!S.periodo){ toast("No hay un periodo abierto."); return; }
  const hoy = hoyISO(), sugerido = ayerISO() < S.periodo.ini ? S.periodo.ini : ayerISO();
  const txt = prompt("Fecha de corte de la presentación (DD/MM/AAAA).\nJueves: corte al día anterior. Lunes: semana cerrada al domingo.", sugerido.split("-").reverse().join("/"));
  if (txt === null) return;
  const C = leerCorte(txt);
  if (!C || C > hoy || C < S.periodo.ini){ toast("Fecha de corte no válida: tiene que estar entre el inicio del periodo y hoy."); return; }
  S._armandoPpt = true; toast("Armando la presentación…");
  try {
    if (!window.PptxGenJS) await cargarScript("https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js");
    await Promise.all([cargarActividad(true), cargarBase(), cargarAvance(), cargarFbInferido(), cargarMsiInferido(), S.geo ? null : cargarGeo()]);
    const av0 = (S.avance || [])[0] || {};
    if (!av0.meta_visitas || !av0.meta_reactivados || !av0.meta_conversion) throw new Error("no se pudieron leer las metas del periodo; actualiza y vuelve a intentar");
    const TB = (await cargarTotalesBBVA().catch(() => [])).find(u => u.corte <= C) || null;
    const D = datosPresentacion(C, TB ? null : await cargarResultadosBBVA(C), TB);
    const pres = new PptxGenJS(); pres.layout = "LAYOUT_WIDE"; pres.author = "Stratis"; pres.company = "Stratis"; pres.title = `Campaña BBVA Adquirencia · corte al ${fISO(C)}`;
    armarLaminas(pres, D);
    await pres.writeFile({ fileName:`Mastercard_Campaña_BBVA_Adquirencia_${C.replace(/-/g, "")}.pptx` });
    toast("Presentación descargada: corte al " + fISO(C) + ".");
    mostrarCitas(D.citas, C);
  } catch(e){ toast("No se pudo armar la presentación: " + (e.message || e)); }
  finally { S._armandoPpt = false; }
}

function armarLaminas(pres, D){
  const C = D.C, corteTxt = `${diaSem(C)} ${fechaLarga(C)}`, dd = fISO(C);
  const fondo = FONDO_LAMINA.replace(/^data:/, "");
  const T = (s, texto, o) => s.addText(texto, Object.assign({ fontFace:FT, color:PX.tinta, fontSize:12, margin:0, isTextBox:true, valign:"top" }, o));
  const lamina = (titulo, sub) => { const s = pres.addSlide(); s.background = { data:fondo };
    T(s, titulo, { x:0.6, y:0.42, w:12.1, h:0.62, fontFace:FTB, fontSize:26, color:PX.navy, valign:"middle", fit:"shrink" });
    if (sub) T(s, sub, { x:0.6, y:1.08, w:12.1, h:0.36, fontSize:13 });
    return s; };
  const lectura = (s, texto, sig, y = 6.12) => {
    s.addShape(pres.shapes.RECTANGLE, { x:0.6, y, w:12.1, h:0.82, fill:{ color:PX.lect }, line:{ color:PX.lect } });
    s.addShape(pres.shapes.RECTANGLE, { x:0.6, y, w:0.09, h:0.82, fill:{ color:PX.naranja }, line:{ color:PX.naranja } });
    T(s, [{ text:"La lectura", options:{ bold:true, color:PX.navy, fontSize:11.5, breakLine:true } }, { text:texto, options:{ fontSize:11.5, breakLine:!!sig } }].concat(sig ? [{ text:"Siguiente: ", options:{ bold:true, fontSize:11.5 } }, { text:sig, options:{ fontSize:11.5 } }] : []),
      { x:0.9, y:y + 0.07, w:11.6, h:0.7, color:PX.tinta, fit:"shrink" }); };
  const pie = (s, texto) => T(s, texto, { x:0.6, y:7.0, w:12.1, h:0.3, fontSize:8.5, color:PX.gris });
  const kpi = (s, x, y, w, h, color, titulo, valor, de, avance, caption) => {
    s.addShape(pres.shapes.RECTANGLE, { x, y, w, h, fill:{ color:PX.blanco }, line:{ color:PX.linea, width:0.75 } });
    s.addShape(pres.shapes.RECTANGLE, { x, y, w, h:0.08, fill:{ color }, line:{ color } });
    T(s, titulo, { x:x + 0.22, y:y + 0.22, w:w - 0.44, h:0.3, fontSize:12, bold:true, color:PX.navy });
    T(s, valor, { x:x + 0.22, y:y + 0.55, w:de ? w * 0.55 : w - 0.44, h:0.6, fontFace:FTB, fontSize:30, color:PX.navy, valign:"middle", fit:"shrink" });
    if (de) T(s, de, { x:x + w * 0.55, y:y + 0.7, w:w * 0.45 - 0.22, h:0.35, fontSize:12, color:PX.tinta });
    if (avance != null){ s.addShape(pres.shapes.RECTANGLE, { x:x + 0.22, y:y + 1.25, w:w - 0.44, h:0.1, fill:{ color:PX.linea }, line:{ color:PX.linea } });
      if (avance > 0) s.addShape(pres.shapes.RECTANGLE, { x:x + 0.22, y:y + 1.25, w:(w - 0.44) * Math.min(1, avance), h:0.1, fill:{ color:PX.naranja }, line:{ color:PX.naranja } }); }
    if (caption) T(s, caption, { x:x + 0.22, y:y + 1.42, w:w - 0.44, h:0.34, fontSize:9.5, color:PX.gris }); };
  const pDias = pc(D.dhCorte, D.dh.length), pVis = pc(D.visitados, D.meta.vis), tasaCon = pc(D.contactados, D.visitados);
  const ritmo = D.dhConCampo ? Math.round(D.visitados / Math.max(1, D.diasCampo)) : 0, metaDia = Math.round(D.meta.vis / Math.max(1, D.dh.length));
  const faltan = Math.max(0, D.meta.vis - D.visitados), habRest = D.dh.filter(d => d > C).length, necesario = habRest ? Math.ceil(faltan / habRest) : faltan;
  const ultSem = D.semanas[D.semanas.length - 1], antSem = D.semanas[D.semanas.length - 2];

  // 1. Portada
  { const s = pres.addSlide(); s.background = { color:PX.navy };
    T(s, "Stratis", { x:0.8, y:1.2, w:6, h:0.9, fontFace:FTB, fontSize:48, color:PX.blanco, valign:"middle" });
    s.addShape(pres.shapes.LINE, { x:0, y:2.35, w:6.6, h:0, line:{ color:"5A6495", width:1 } });
    T(s, "INNOVATE, PERFORM & GROW", { x:0.8, y:2.55, w:6, h:0.5, fontSize:22, color:PX.blanco });
    s.addShape(pres.shapes.LINE, { x:0, y:3.25, w:6.6, h:0, line:{ color:"5A6495", width:1 } });
    T(s, "Campaña BBVA Adquirencia", { x:0.8, y:4.2, w:7, h:0.55, fontSize:26, bold:true, color:PX.blanco });
    T(s, `Mastercard · reporte semanal del ${nombrePeriodo(D.p)}`, { x:0.8, y:4.85, w:7, h:0.4, fontSize:15, color:"D5DAE6" });
    T(s, "Corte al " + corteTxt, { x:0.8, y:5.35, w:7, h:0.4, fontSize:15, color:PX.naranja });
    [[numPE(D.visitados), "comercios visitados", `de ${numPE(D.meta.vis)} de la meta del periodo`], [tasaCon + " %", "con contacto", "de los comercios visitados"], [numPE(D.res.realiza), "realizarán consumos", "según la última visita"]]
      .forEach(([v, t, c], i) => { const y = 1.55 + i * 1.7; s.addShape(pres.shapes.RECTANGLE, { x:8.4, y, w:4.2, h:1.4, fill:{ color:"1A2150" }, line:{ color:"2B3470" } });
        T(s, v, { x:8.65, y:y + 0.15, w:3.8, h:0.65, fontFace:FTB, fontSize:32, color:PX.blanco, valign:"middle" });
        T(s, t, { x:8.65, y:y + 0.8, w:3.8, h:0.28, fontSize:13, bold:true, color:PX.naranja }); T(s, c, { x:8.65, y:y + 1.06, w:3.8, h:0.26, fontSize:10, color:"B9C6E0" }); });
  }

  // 2. Resumen ejecutivo
  { const s = lamina("Resumen ejecutivo", `${mayus(nombrePeriodo(D.p))} · del ${fISO(D.p.ini)} al ${fISO(D.p.fin)} · corte al ${corteTxt} · ${D.dhCorte} de ${D.dh.length} días hábiles (${pDias} %)`);
    const w = 2.87, gap = 0.21;
    kpi(s, 0.6, 1.6, w, 1.9, PX.naranja, "Comercios visitados", numPE(D.visitados), `de ${numPE(D.meta.vis)}`, D.visitados / D.meta.vis, `${pVis} % de la meta con ${pDias} % de los días`);
    kpi(s, 0.6 + (w + gap), 1.6, w, 1.9, PX.azul, "Con contacto", tasaCon + " %", `${numPE(D.contactados)} comercios`, null, "hablaron con el dueño, el encargado o un tercero");
    kpi(s, 0.6 + 2 * (w + gap), 1.6, w, 1.9, PX.verde, "Realizarán consumos", numPE(D.res.realiza), `${pc(D.res.realiza, D.contactados)} % del contacto`, null, `${numPE(D.res.noDecide)} aún no deciden · ${numPE(D.res.reag)} con regreso agendado`);
    kpi(s, 0.6 + 3 * (w + gap), 1.6, w, 1.9, PX.azulOsc, "Reactivados", D.reactivados == null ? "—" : numPE(D.reactivados), `meta ${numPE(D.meta.rea)}`, D.reactivados == null ? null : D.reactivados / D.meta.rea,
      D.reactivados == null ? "pendiente de la data de BBVA" : `cuentan (con visita y contacto) · corte BBVA ${fISO(D.rb.corte)} · conversión ${pct2(D.reactivados, D.rb.visitados)}`);
    s.addShape(pres.shapes.RECTANGLE, { x:0.6, y:3.75, w:7.4, h:2.15, fill:{ color:PX.blanco }, line:{ color:PX.linea, width:0.75 } });
    T(s, "Lo más relevante al corte", { x:0.85, y:3.9, w:7, h:0.32, fontSize:13, bold:true, color:PX.navy });
    const puntos = [
      `El equipo lleva ${numPE(D.visitados)} comercios visitados, ${ritmo} por día con campo frente a una meta de ${metaDia} por día hábil.`,
      ultSem ? `En la semana del ${fISO(ultSem.lun)} se sumaron ${numPE(ultSem.nuevos)} comercios${antSem ? `, frente a ${numPE(antSem.nuevos)} la semana anterior` : ""}.` : "",
      `${tasaCon} % de los comercios visitados atendió la visita; ${numPE(D.res.realiza)} se comprometieron a volver a usar el POS.`,
      habRest ? `Para cerrar el periodo en meta faltan ${numPE(faltan)} comercios en ${habRest} días hábiles: ${necesario} por día.` : `El periodo cerró con ${pVis} % de la meta de visitas.`].filter(Boolean);
    T(s, puntos.map((t, i) => ({ text:t, options:{ bullet:true, breakLine:i < puntos.length - 1 } })), { x:0.85, y:4.3, w:7, h:1.5, fontSize:11.5, paraSpaceAfter:4 });
    s.addShape(pres.shapes.RECTANGLE, { x:8.2, y:3.75, w:4.5, h:2.15, fill:{ color:PX.suave }, line:{ color:PX.linea, width:0.75 } });
    T(s, `Cómo se mide el ${nombrePeriodo(D.p)}`, { x:8.45, y:3.9, w:4.1, h:0.32, fontSize:13, bold:true, color:PX.navy });
    const reglas = ["Visita: presencial, con ubicación validada, sea cual sea el resultado.", "Reactivado que cuenta: volvió a transaccionar según la data de BBVA y fue visitado con contacto según el CRM de Stratis.", "Conversión: reactivados que cuentan ÷ comercios visitados."];
    T(s, reglas.map((t, i) => ({ text:t, options:{ bullet:true, breakLine:i < reglas.length - 1 } })), { x:8.45, y:4.3, w:4.1, h:1.5, fontSize:10.5, paraSpaceAfter:4 });
    lectura(s, D.visitados / D.meta.vis >= D.dhCorte / D.dh.length ? "El avance de visitas va por delante del tiempo transcurrido del periodo." : "El avance de visitas está por debajo del tiempo transcurrido del periodo.",
      D.reactivados == null ? "incorporar la data de BBVA para medir reactivación y facturación." : "sostener el ritmo y convertir el contacto en transacciones.");
    pie(s, `Fuente: CRM de campo Stratis al ${dd}. Reactivación: ${D.rb ? `data de BBVA con corte al ${fISO(D.rb.corte)}` : "pendiente de la data de BBVA"}. Metas: ${numPE(D.meta.visEj)} comercios visitados y ${numPE(D.meta.reaEj)} reactivados por ejecutivo.`); }

  // 3. Avance del periodo
  { const s = lamina(`${mayus(nombrePeriodo(D.p))}: ${numPE(D.visitados)} comercios visitados al ${dd}`, `Nuevos visitados por día y acumulado del equipo frente a la meta de ${metaDia} por día hábil · ${numPE(D.cartera)} comercios en cartera, ${numPE(Math.round(D.cartera / D.nEj))} por ejecutivo`);
    const cats = D.serie.map(x => fISO(x.dia) + (x.habil ? "" : " (sáb)"));
    // Por cada día, dos barras: el acumulado del equipo (sube día a día) y los comercios nuevos de ese día; la línea gris fina es la meta acumulada.
    s.addChart([{ type:pres.charts.BAR, data:[{ name:"Acumulado del equipo", labels:cats, values:D.serie.map(x => x.acum) }, { name:"Nuevos del día", labels:cats, values:D.serie.map(x => x.nuevos) }],
                  options:{ barGrouping:"clustered", chartColors:[PX.azulOsc, PX.naranja], barGapWidthPct:30, barOverlapPct:-5, showValue:true, dataLabelPosition:"outEnd", dataLabelFontSize:8, dataLabelColor:PX.navy } },
                { type:pres.charts.LINE, data:[{ name:`Meta acumulada (${numPE(D.meta.vis)} al cierre)`, labels:cats, values:D.serie.map(x => x.meta) }], options:{ chartColors:["A9B1C6"], lineSize:1.5, lineDataSymbol:"none" } }],
      { x:0.6, y:1.6, w:8.6, h:4.35, catAxisLabelColor:PX.gris, valAxisLabelColor:PX.gris, catAxisLabelFontSize:8, valAxisLabelFontSize:9, valGridLine:{ color:"E4E8F0", size:0.5 }, catGridLine:{ style:"none" },
        valAxisMinVal:0, valAxisMaxVal:Math.ceil(Math.max(D.meta.vis, D.visitados) * 1.08 / 100) * 100, showLegend:true, legendPos:"t", legendFontSize:9.5, legendColor:PX.tinta, catAxisLabelRotate:-45 });
    s.addShape(pres.shapes.RECTANGLE, { x:9.45, y:1.6, w:3.25, h:4.35, fill:{ color:PX.blanco }, line:{ color:PX.linea, width:0.75 } });
    const mejor = D.serie.filter(x => x.nuevos != null).sort((a, b) => b.nuevos - a.nuevos)[0];
    const bloques = [["Ritmo", `${ritmo} por día con campo`, `meta: ${metaDia} por día hábil`], ["Mejor día", mejor ? `${numPE(mejor.nuevos)} el ${diaSem(mejor.dia)} ${fISO(mejor.dia)}` : "—", "comercios nuevos visitados ese día"],
      ["Avance", `${pVis} % de la meta`, `con ${pDias} % de los días hábiles`], ["Para cerrar en meta", habRest ? `${necesario} por día` : "periodo cerrado", habRest ? `${numPE(faltan)} comercios en ${habRest} días hábiles` : ""]];
    bloques.forEach(([t, v, c], i) => { const y = 1.8 + i * 1.02; T(s, t, { x:9.7, y, w:2.8, h:0.26, fontSize:10, bold:true, color:PX.naranja });
      T(s, v, { x:9.7, y:y + 0.27, w:2.8, h:0.36, fontSize:14, bold:true, color:PX.navy, fit:"shrink" }); T(s, c, { x:9.7, y:y + 0.63, w:2.8, h:0.26, fontSize:9.5, color:PX.gris }); });
    lectura(s, D.visitados >= (D.serie.filter(x => x.dia <= C).slice(-1)[0] || {}).meta ? `El acumulado está sobre la meta a la fecha (${numPE(D.visitados)} frente a ${numPE((D.serie.filter(x => x.dia <= C).slice(-1)[0] || {}).meta)}).`
      : `El acumulado está por debajo de la meta a la fecha (${numPE(D.visitados)} frente a ${numPE((D.serie.filter(x => x.dia <= C).slice(-1)[0] || {}).meta)}).`, habRest ? `sostener ${necesario} comercios por día hábil hasta el cierre.` : "");
    pie(s, `Fuente: CRM de campo Stratis al ${dd}. Visita válida: con ubicación y registrada a tiempo; un comercio se cuenta una sola vez, el día de su primera visita (las barras naranjas suman el acumulado). Los fines de semana con campo suman, sin meta propia.`); }

  // 3b. Avance por zona
  { const s = lamina("Avance por zona", `${D.zonasL.length} zonas, una por ejecutivo · ${numPE(Math.round(D.cartera / Math.max(1, D.zonasL.length)))} comercios y ${Math.max(0, ...D.zonasL.map(z => z.rutasL.length))} rutas por zona · corte al ${dd}`);
    const metaFecha = Math.round(D.meta.visEj * D.dhCorte / Math.max(1, D.dh.length)), n = Math.max(1, D.zonasL.length), w = (12.1 - 0.2 * (n - 1)) / n;
    const colZ = [PX.naranja, PX.azul, PX.verde, PX.azulOsc];
    D.zonasL.forEach((z, i) => { const x = 0.6 + i * (w + 0.2), y = 1.55, col = colZ[i % colZ.length];
      s.addShape(pres.shapes.RECTANGLE, { x, y, w, h:3.2, fill:{ color:PX.blanco }, line:{ color:PX.linea, width:0.75 } });
      s.addShape(pres.shapes.RECTANGLE, { x, y, w, h:0.08, fill:{ color:col }, line:{ color:col } });
      T(s, zonaNum(z.zona), { x:x + 0.2, y:y + 0.18, w:w - 0.4, h:0.3, fontSize:13, bold:true, color:PX.navy });
      T(s, `${zonaLugar(z.zona)} · ${ejDe(z.correo).nombre}`, { x:x + 0.2, y:y + 0.47, w:w - 0.4, h:0.24, fontSize:9.5, color:PX.gris, fit:"shrink" });
      T(s, numPE(z.vis), { x:x + 0.2, y:y + 0.72, w:1.2, h:0.55, fontFace:FTB, fontSize:28, color:PX.navy, valign:"middle" });
      T(s, `de ${numPE(D.meta.visEj)} · ${pc(z.vis, D.meta.visEj)} %`, { x:x + 1.35, y:y + 0.86, w:w - 1.5, h:0.3, fontSize:10.5, color:PX.tinta });
      s.addShape(pres.shapes.RECTANGLE, { x:x + 0.2, y:y + 1.32, w:w - 0.4, h:0.1, fill:{ color:PX.linea }, line:{ color:PX.linea } });
      if (z.vis) s.addShape(pres.shapes.RECTANGLE, { x:x + 0.2, y:y + 1.32, w:(w - 0.4) * Math.min(1, z.vis / D.meta.visEj), h:0.1, fill:{ color:col }, line:{ color:col } });
      const det = [`Contacto: ${pc(z.con, z.vis)} % de los visitados`, `Realizarán consumos: ${numPE(z.realiza)}`, `Rutas iniciadas: ${z.rutasIni} de ${z.rutasL.length} (${z.rutasComp} completas)`, `Distritos abordados: ${z.distAbord} de ${z.distL.length}`];
      T(s, det.map((t, j) => ({ text:t, options:{ breakLine:j < det.length - 1 } })), { x:x + 0.2, y:y + 1.5, w:w - 0.4, h:0.95, fontSize:9.5, paraSpaceAfter:2, fit:"shrink" });
      // Cartera de la zona y sus distritos (comercios asignados en cada uno): cuadro aparte para poder editarlo o quitarlo en PowerPoint
      const dz = z.distL.length > 8 ? z.distL.slice(0, 7) : z.distL, resto = z.distL.slice(dz.length);
      s.addShape(pres.shapes.LINE, { x:x + 0.2, y:y + 2.36, w:w - 0.4, h:0, line:{ color:PX.linea, width:0.75 } });
      T(s, [{ text:`${numPE(z.cartera)} comercios en cartera`, options:{ bold:true, color:PX.navy, breakLine:true } },
             { text:dz.map(d => `${nombreDistrito(d.d)} ${numPE(d.n)}`).concat(resto.length ? [`otros ${resto.length} distritos ${numPE(resto.reduce((a, d) => a + d.n, 0))}`] : []).join(" · "), options:{ color:PX.tinta } }],
        { x:x + 0.2, y:y + 2.4, w:w - 0.4, h:0.76, fontSize:8.5, valign:"top", paraSpaceAfter:1, fit:"shrink" }); });
    const labs = D.zonasL.map(z => nombreZona(z.zona));
    s.addChart(pres.charts.BAR, [{ name:"Comercios visitados", labels:labs, values:D.zonasL.map(z => z.vis) }, { name:`Meta a la fecha (${metaFecha})`, labels:labs, values:D.zonasL.map(() => metaFecha) },
      { name:"Con contacto", labels:labs, values:D.zonasL.map(z => z.con) }, { name:"Realizarán consumos", labels:labs, values:D.zonasL.map(z => z.realiza) }],
      { x:0.6, y:4.82, w:12.1, h:1.25, barGrouping:"clustered", chartColors:[PX.naranja, PX.linea, PX.azul, PX.verde], showValue:true, dataLabelPosition:"outEnd", dataLabelFontSize:8, dataLabelColor:PX.navy,
        catAxisLabelColor:PX.tinta, catAxisLabelFontSize:9, valAxisHidden:true, valGridLine:{ style:"none" }, catGridLine:{ style:"none" }, showLegend:true, legendPos:"r", legendFontSize:9 });
    const orden = D.zonasL.slice().sort((a, b) => b.vis - a.vis), rez = orden[orden.length - 1];
    lectura(s, orden.length ? `${nombreZona(orden[0].zona)} lleva el mayor avance (${numPE(orden[0].vis)} comercios)${rez && rez !== orden[0] ? `; ${nombreZona(rez.zona)} va más atrás (${numPE(rez.vis)})` : ""}. La meta a la fecha es ${numPE(metaFecha)} por zona.` : "Sin zonas asignadas.",
      `equilibrar el ritmo entre zonas para que ${D.zonasL.length === 1 ? "la zona cierre" : `las ${["", "", "dos", "tres", "cuatro", "cinco", "seis"][D.zonasL.length] || numPE(D.zonasL.length)} cierren`} en meta.`);
    pie(s, `Fuente: CRM de campo Stratis al ${dd}. Meta a la fecha: ${numPE(D.meta.visEj)} comercios por zona × días hábiles transcurridos ÷ días hábiles del periodo. Ruta iniciada: al menos un comercio visitado.`); }

  // 4. Evolución semanal
  { const s = lamina("Evolución semanal de los indicadores", `Semanas de lunes a domingo · ${nombrePeriodo(D.p)} hasta el ${dd}`);
    const labs = D.semanas.map(w => `Sem. ${w.n} · ${fISO(w.lun)}`);
    s.addChart(pres.charts.BAR, [{ name:"Comercios nuevos visitados", labels:labs, values:D.semanas.map(w => w.nuevos) }, { name:"Con contacto", labels:labs, values:D.semanas.map(w => w.contacto) },
      { name:"Realizarán consumos", labels:labs, values:D.semanas.map(w => w.realiza) }],
      { x:0.6, y:1.6, w:6.3, h:4.3, barGrouping:"clustered", chartColors:[PX.naranja, PX.azul, PX.verde], showValue:true, dataLabelPosition:"outEnd", dataLabelFontSize:9, dataLabelColor:PX.navy,
        catAxisLabelColor:PX.tinta, valAxisLabelColor:PX.gris, valGridLine:{ color:"E4E8F0", size:0.5 }, catGridLine:{ style:"none" }, showLegend:true, legendPos:"t", legendFontSize:10, catAxisLabelFontSize:10 });
    const H = { fill:{ color:PX.navy }, color:PX.blanco, bold:true, fontSize:9.5, fontFace:FT, align:"center", valign:"middle" };
    const cel = (t, o) => ({ text:String(t), options:Object.assign({ fontSize:10, fontFace:FT, color:PX.tinta, align:"center", valign:"middle" }, o) });
    const filas = [["Semana", "Nuevos", "Acumulado", "% meta", "Contacto", "Consumos"].map(t => ({ text:t, options:H }))]
      .concat(D.semanas.map(w => [cel(`${w.n} · ${fISO(w.lun)} al ${fISO(w.fin7)}${w.cerrada ? "" : "*"}`, { align:"left" }), cel(numPE(w.nuevos)), cel(numPE(w.acum)), cel(pc(w.acum, D.meta.vis) + " %"),
        cel(`${pc(w.contacto, w.comercios)} %`), cel(numPE(w.realiza))]));
    s.addTable(filas, { x:7.1, y:1.7, w:5.6, colW:[1.5, 0.7, 0.95, 0.7, 0.8, 0.95], border:{ type:"solid", color:PX.linea, pt:0.75 }, fill:{ color:PX.blanco }, rowH:0.4 });
    lectura(s, ultSem && antSem ? `La semana ${ultSem.n} sumó ${numPE(ultSem.nuevos)} comercios nuevos (${ultSem.nuevos >= antSem.nuevos ? "+" : ""}${numPE(ultSem.nuevos - antSem.nuevos)} frente a la anterior) con ${pc(ultSem.contacto, ultSem.comercios)} % de contacto.`
      : `La primera semana sumó ${numPE(ultSem ? ultSem.nuevos : 0)} comercios visitados con ${ultSem ? pc(ultSem.contacto, ultSem.comercios) : 0} % de contacto.`, "sumar la reactivación semanal cuando esté la data de BBVA.");
    pie(s, `Fuente: CRM de campo Stratis al ${dd}. Contacto: comercios atendidos ÷ comercios visitados en la semana. Consumos: se comprometieron a usar el POS. * Semana en curso.`); }

  // 5. Mapa de Lima
  { const s = lamina("Cobertura territorial: dónde está la cartera y cómo avanza", `Lima Metropolitana y Callao · distritos con comercios asignados · corte al ${dd}`);
    s.addImage({ data:mapaLima(D).replace(/^data:/, ""), x:0.6, y:1.55, w:7.45, h:4.45 });
    s.addShape(pres.shapes.RECTANGLE, { x:0.6, y:1.55, w:7.45, h:4.45, fill:{ type:"none" }, line:{ color:PX.linea, width:0.75 } });
    const L = Object.values(D.dist).filter(o => o.cartera);
    const mejores = L.filter(o => o.con >= 3).sort((a, b) => b.fav - a.fav || b.con - a.con).slice(0, 4);
    const pendientes = L.map(o => Object.assign({ falta:o.cartera - o.vis }, o)).filter(o => o.falta > 0).sort((a, b) => b.falta - a.falta).slice(0, 4);
    const panel = (y, h, titulo, color, filas) => {
      s.addShape(pres.shapes.RECTANGLE, { x:8.3, y, w:4.4, h, fill:{ color:PX.blanco }, line:{ color:PX.linea, width:0.75 } });
      T(s, titulo, { x:8.5, y:y + 0.12, w:4.0, h:0.3, fontSize:12.5, bold:true, color });
      filas.forEach(([nom, det, v], i) => { const yy = y + 0.48 + i * 0.4;
        T(s, nom, { x:8.5, y:yy, w:2.3, h:0.2, fontSize:10.5, bold:true, color:PX.navy, fit:"shrink" });
        T(s, det, { x:8.5, y:yy + 0.2, w:2.3, h:0.18, fontSize:8.5, color:PX.gris });
        s.addShape(pres.shapes.RECTANGLE, { x:10.85, y:yy + 0.08, w:1.2, h:0.16, fill:{ color:PX.suave }, line:{ color:PX.suave } });
        if (v > 0) s.addShape(pres.shapes.RECTANGLE, { x:10.85, y:yy + 0.08, w:1.2 * Math.min(1, v), h:0.16, fill:{ color }, line:{ color } });
        T(s, Math.round(v * 100) + " %", { x:12.1, y:yy + 0.02, w:0.55, h:0.26, fontSize:10.5, bold:true, color:PX.navy, align:"right" }); });
      if (!filas.length) T(s, "Todavía sin datos suficientes.", { x:8.5, y:y + 0.5, w:4.0, h:0.3, fontSize:10, color:PX.gris }); };
    panel(1.55, 2.15, "Dónde responden mejor", PX.verde, mejores.map(o => [nombreDistrito(o.clave), `${o.realiza} de ${o.con} con contacto`, o.fav]));
    panel(3.85, 2.15, "Mayor cartera por visitar", PX.naranja, pendientes.map(o => [nombreDistrito(o.clave), `${o.falta} de ${o.cartera} sin visitar`, o.cob]));
    const top = mejores[0], bajo = pendientes[0];
    lectura(s, `${top ? `Mejor respuesta: ${nombreDistrito(top.clave)} (${pc(top.realiza, top.con)} % de los contactados). ` : ""}${bajo ? `Mayor cartera por visitar: ${nombreDistrito(bajo.clave)} (${numPE(bajo.falta)} comercios).` : ""}`,
      "orientar la ruta de las próximas semanas a los distritos con más cartera por visitar.");
    pie(s, `Fuente: CRM de campo Stratis al ${dd}. Cifra en el mapa: visitados / cartera. Respuesta: distritos con 3 o más comercios con contacto. Límites: © OpenStreetMap (ODbL).`); }

  // 6. Rutas y distritos abordados por zona
  { const s = lamina("Rutas y distritos abordados", `${Math.max(0, ...D.zonasL.map(z => z.rutasL.length))} rutas por zona, de ${Math.round(D.cartera / Math.max(1, D.zonasL.reduce((a, z) => a + z.rutasL.length, 0)))} comercios cada una · cada casilla es una ruta · corte al ${dd}`);
    const tams = [...new Set(D.zonasL.flatMap(z => z.rutasL.map(r => r.n)))];
    const leyenda = [["F1F3F8", "sin iniciar"], ["B7C0F5", "en curso"], ["232C86", tams.length === 1 ? `completa (${tams[0]} de ${tams[0]})` : "completa"]];
    leyenda.forEach(([c, t], i) => { const x = 8.2 + i * 1.5; s.addShape(pres.shapes.RECTANGLE, { x, y:1.18, w:0.22, h:0.18, fill:{ color:c }, line:{ color:PX.linea, width:0.5 } });
      T(s, t, { x:x + 0.28, y:1.15, w:1.2, h:0.24, fontSize:9.5, color:PX.tinta }); });
    const alto = 4.45 / Math.max(1, D.zonasL.length);
    D.zonasL.forEach((z, i) => { const y = 1.55 + i * alto;
      s.addShape(pres.shapes.RECTANGLE, { x:0.6, y, w:12.1, h:alto - 0.1, fill:{ color:PX.blanco }, line:{ color:PX.linea, width:0.75 } });
      T(s, zonaNum(z.zona), { x:0.78, y:y + 0.1, w:2.1, h:0.28, fontSize:12, bold:true, color:PX.navy });
      T(s, zonaLugar(z.zona), { x:0.78, y:y + 0.36, w:2.2, h:0.22, fontSize:9.5, bold:true, color:PX.tinta });
      T(s, `${ejDe(z.correo).nombre} · ${z.rutasIni} de ${z.rutasL.length} rutas`, { x:0.78, y:y + 0.57, w:2.2, h:0.22, fontSize:9, color:PX.gris });
      const lado = Math.min(0.34, (9.4 - 0.05 * 24) / 25);
      z.rutasL.slice(0, 25).forEach((r, k) => { const x = 3.05 + k * (lado + 0.05), p = r.vis / Math.max(1, r.n), c = !r.vis ? "F1F3F8" : p >= 1 ? "232C86" : "B7C0F5";
        s.addShape(pres.shapes.RECTANGLE, { x, y:y + 0.12, w:lado, h:lado, fill:{ color:c }, line:{ color:PX.linea, width:0.5 } });
        T(s, (r.ruta.match(/\d+/) || [String(k + 1)])[0], { x, y:y + 0.12, w:lado, h:lado, fontSize:7.5, bold:true, color:p >= 1 ? PX.blanco : PX.navy, align:"center", valign:"middle" }); });
      const ab = z.distL.filter(d => d.vis), pend = z.distL.filter(d => !d.vis);
      T(s, [{ text:`Distritos abordados (${ab.length} de ${z.distL.length}): `, options:{ bold:true, color:PX.navy } }, { text:ab.length ? ab.map(d => `${nombreDistrito(d.d)} ${d.vis}/${d.n}`).join(" · ") : "ninguno todavía" }]
        .concat(pend.length ? [{ text:"   Por abordar: ", options:{ bold:true, color:PX.naranja } }, { text:pend.map(d => nombreDistrito(d.d)).join(" · ") }] : []),
        { x:3.05, y:y + 0.12 + lado + 0.06, w:9.5, h:alto - lado - 0.32, fontSize:9, color:PX.tinta, fit:"shrink" }); });
    const ini = D.zonasL.reduce((a, z) => a + z.rutasIni, 0), comp = D.zonasL.reduce((a, z) => a + z.rutasComp, 0), tot = D.zonasL.reduce((a, z) => a + z.rutasL.length, 0);
    lectura(s, `${ini} de ${tot} rutas iniciadas y ${comp} completas. Cada zona avanza ruta por ruta; los distritos por abordar marcan la agenda de las próximas semanas.`, "completar las rutas en curso antes de abrir nuevas, para no dejar comercios a medias.");
    pie(s, `Fuente: CRM de campo Stratis al ${dd}. Cifra junto a cada distrito: visitados / cartera de la zona en ese distrito.`); }

  // 7. Del contacto a la decisión
  { const s = lamina("Del contacto a la decisión", `Estado de cada comercio visitado según su última visita · corte al ${dd}`);
    const pasos = [["Cartera asignada", D.cartera, PX.navy], ["Comercios visitados", D.visitados, PX.azulOsc], ["Con contacto", D.contactados, PX.azul], ["Con reunión concretada", D.reunion, PX.naranja], ["Realizarán consumos", D.res.realiza, PX.verde]];
    const max = Math.max(1, D.cartera);
    pasos.forEach(([t, n, col], i) => { const y = 1.65 + i * 0.72, w = Math.max(0.08, 4.6 * n / max);
      T(s, t, { x:0.6, y:y + 0.02, w:2.4, h:0.3, fontSize:12, bold:true, color:PX.navy, align:"right" });
      if (i) T(s, `${pc(n, pasos[i - 1][1])} % del paso anterior`, { x:0.6, y:y + 0.3, w:2.4, h:0.24, fontSize:9, color:PX.gris, align:"right" });
      s.addShape(pres.shapes.RECTANGLE, { x:3.15, y, w, h:0.55, fill:{ color:col }, line:{ color:col } });
      T(s, numPE(n), { x:3.25 + w, y:y + 0.05, w:1.0, h:0.45, fontFace:FTB, fontSize:18, color:col, valign:"middle" }); });
    s.addShape(pres.shapes.RECTANGLE, { x:9.0, y:1.6, w:3.7, h:1.95, fill:{ color:PX.blanco }, line:{ color:PX.linea, width:0.75 } });
    T(s, "Con contacto, qué decidió", { x:9.2, y:1.72, w:3.3, h:0.3, fontSize:12, bold:true, color:PX.navy });
    const dec = [["Realizarán consumos", D.res.realiza], ["Aún no deciden", D.res.noDecide], ["Regreso agendado (no estaba quien decide)", D.res.reag], ["Sin compromiso", D.res.sinExito], ["Desisten del producto", D.res.desiste]];
    T(s, dec.map(([t, n], i) => ({ text:`${t}: ${numPE(n)}`, options:{ bullet:true, breakLine:i < dec.length - 1 } })), { x:9.2, y:2.05, w:3.35, h:1.45, fontSize:10.5, paraSpaceAfter:2 });
    s.addShape(pres.shapes.RECTANGLE, { x:9.0, y:3.7, w:3.7, h:2.25, fill:{ color:PX.blanco }, line:{ color:PX.linea, width:0.75 } });
    T(s, `Sin contacto: ${numPE(D.res.nadie)} comercios`, { x:9.2, y:3.82, w:3.3, h:0.3, fontSize:12, bold:true, color:PX.navy });
    const mn = Object.entries(D.motivosNadie).sort((a, b) => b[1] - a[1]);
    T(s, mn.length ? mn.map(([t, n], i) => ({ text:`${t}: ${numPE(n)}`, options:{ bullet:true, breakLine:i < mn.length - 1 } })) : "—", { x:9.2, y:4.15, w:3.35, h:1.7, fontSize:10.5, paraSpaceAfter:2 });
    // reactivación y facturación
    s.addShape(pres.shapes.RECTANGLE, { x:0.6, y:5.3, w:8.2, h:0.7, fill:{ color:D.reactivados == null ? PX.naranjaSuave : PX.navy }, line:{ color:D.reactivados == null ? PX.naranjaSuave : PX.navy } });
    T(s, D.reactivados == null ? [{ text:"Reactivación y facturación: ", options:{ bold:true } }, { text:"pendientes de la data de BBVA. Se reportan cuando la data esté cargada en el CRM." }]
      : [{ text:`${numPE(D.reactivados)} reactivados que cuentan`, options:{ bold:true } }, { text:` · ${pct2(D.reactivados, D.rb.visitados)} de conversión (meta ${D.meta.conv} %)${D.rb.facturado != null ? ` · ${soles(D.rb.facturado)} facturados` : ""} · corte BBVA ${fISO(D.rb.corte)}.` }],
      { x:0.85, y:5.38, w:7.8, h:0.55, fontSize:11.5, color:D.reactivados == null ? PX.rojo : PX.blanco, valign:"middle" });
    lectura(s, `${pc(D.contactados, D.visitados)} % de los visitados atendió la visita y ${pc(D.res.realiza, D.contactados)} % de los contactados se comprometió a usar el POS.`, "convertir el compromiso en transacciones y volver a los comercios con regreso agendado.", 6.12);
    pie(s, `Fuente: CRM de campo Stratis al ${dd}. Cada comercio aparece una sola vez, con el resultado de su última visita.`); }

  // 7b. Reactivación confirmada por BBVA, con los totales tipeados por corte (la tabla de KPIs de Jose)
  if (D.tot){ const Q = D.tot, g = Q.g, cu = Q.G.cc.reac, fk = x => (x / 1e6).toFixed(2).replace(".", ",");
    const s = lamina("Reactivación confirmada por BBVA", `Corte de la data de BBVA al ${fechaLarga(Q.corte)} · cuenta: reactivado según BBVA y visitado con contacto según el CRM`);
    const H = { fill:{ color:PX.navy }, color:PX.blanco, bold:true, fontSize:10, fontFace:FT, valign:"middle" };
    const cel = (t, o) => ({ text:String(t), options:Object.assign({ fontSize:10, fontFace:FT, color:PX.tinta, valign:"middle", align:"right" }, o) });
    const filas = [["Universo", g.universo, null, pct2(g.universo, g.universo)], ["Visitas registradas", g.visitas, null, pct2(g.visitas, g.universo)], ["Comercios visitados", g.vis, null, pct2(g.vis, g.universo)],
      ["Reactivación", Q.tu.reac, Q.tu.fac, pct2(Q.tu.reac, g.universo)], ["Reactivación con visita (con contacto) · cuenta", cu, Q.G.cc.fac, pct2(cu, g.cc), true],
      ["Reactivación con visita sin contacto", Q.G.sc.reac, Q.G.sc.fac, pct2(Q.G.sc.reac, g.sc)], ["Reactivación en comercios visitados (total)", Q.tv.reac, Q.tv.fac, pct2(Q.tv.reac, g.vis)],
      ["Reactivación sin visita", Q.G.nv.reac, Q.G.nv.fac, pct2(Q.G.nv.reac, g.nv)], ["Recupero de POS (derivados a recuperación)", g.recupero, null, pct2(g.recupero, g.vis)], ["   con el equipo ya recuperado", g.equipoRec, null, pct2(g.equipoRec, g.recupero)]];
    s.addTable([[{ text:"Definición de KPIs", options:H }, { text:"Comercios", options:Object.assign({ align:"right" }, H) }, { text:"Fact. (MM S/)", options:Object.assign({ align:"right" }, H) }, { text:"% alcance", options:Object.assign({ align:"right" }, H) }]]
      .concat(filas.map(([n, c, f, p, b]) => { const o = b ? { bold:true, fill:{ color:PX.naranjaSuave }, color:PX.navy } : {};
        return [cel(n, Object.assign({ align:"left" }, o)), cel(numPE(c), o), cel(f == null ? "" : fk(f), o), cel(p, o)]; })),
      { x:0.6, y:1.6, w:7.45, colW:[3.9, 1.1, 1.2, 1.25], rowH:0.36, border:{ type:"solid", color:PX.linea, pt:0.75 }, fill:{ color:PX.blanco } });
    const tarjeta = (y, h, color, titulo, valor, det) => { s.addShape(pres.shapes.RECTANGLE, { x:8.3, y, w:4.4, h, fill:{ color:PX.blanco }, line:{ color:PX.linea, width:0.75 } });
      s.addShape(pres.shapes.RECTANGLE, { x:8.3, y, w:4.4, h:0.07, fill:{ color }, line:{ color } });
      T(s, titulo, { x:8.5, y:y + 0.15, w:4.0, h:0.26, fontSize:11, bold:true, color:PX.navy });
      T(s, valor, { x:8.5, y:y + 0.42, w:4.0, h:0.5, fontFace:FTB, fontSize:24, color:PX.navy, valign:"middle", fit:"shrink" });
      T(s, det, { x:8.5, y:y + 0.94, w:4.0, h:h - 1.0, fontSize:9.5, color:PX.gris }); };
    tarjeta(1.6, 1.38, PX.azulOsc, "Reactivados que cuentan", `${numPE(cu)} de ${numPE(D.meta.rea)}`, `${pct2(cu, D.meta.rea)} de la meta del periodo · reactivados según BBVA, visitados con contacto`);
    tarjeta(3.08, 1.38, PX.naranja, "Conversión", pct2(cu, g.vis), `${numPE(cu)} que cuentan ÷ ${numPE(g.vis)} comercios visitados · meta ${D.meta.conv} % · alcance en visitados con contacto: ${pct2(cu, g.cc)}`);
    tarjeta(4.56, 1.38, PX.verde, "Facturación de los que cuentan", soles(Q.G.cc.fac), `${numPE(Q.G.cc.trx)} transacciones · ticket promedio S/ ${montoPE(Q.G.cc.trx ? Q.G.cc.fac / Q.G.cc.trx : 0)}`);
    lectura(s, `${numPE(cu)} comercios reactivados cuentan para Stratis (${pct2(cu, g.vis)} de conversión sobre ${numPE(g.vis)} visitados) y facturan ${soles(Q.G.cc.fac)}. En los visitados con contacto la reactivación llega a ${pct2(cu, g.cc)}, frente a ${pct2(Q.G.nv.reac, g.nv)} en los no visitados.`,
      "sostener la entrega de la data de BBVA para seguir la reactivación por corte.", 6.12);
    pie(s, `Fuente: totales de la data de BBVA al ${fISO(Q.corte)}; comercios por grupo del CRM de campo Stratis al mismo corte (visitado y gestión con contacto, como en la base para BBVA). % alcance: sobre los comercios de cada grupo.`);
  }

  // 7c. Facturación y transacciones: visitados frente a no visitados
  if (D.tot){ const Q = D.tot, g = Q.g;
    const s = lamina("Facturación y transacciones por grupo", `Comercios visitados frente a no visitados · corte de la data de BBVA al ${fechaLarga(Q.corte)} · cartera del ${nombrePeriodo(D.p)}`);
    const H = { fill:{ color:PX.navy }, color:PX.blanco, bold:true, fontSize:10, fontFace:FT, valign:"middle", align:"right" };
    const cel = (t, o) => ({ text:String(t), options:Object.assign({ fontSize:10.5, fontFace:FT, color:PX.tinta, valign:"middle", align:"right" }, o) });
    const fila = (o, b) => { const x = b ? { bold:true, fill:{ color:PX.suave }, color:PX.navy } : {};
      return [cel(o.nom, Object.assign({ align:"left" }, x)), cel(numPE(o.n), x), cel(numPE(o.reac), x), cel(montoPE(o.fac), x), cel(numPE(o.trx), x), cel(pct2(o.fac, Q.tu.fac), x), cel(o.trx ? montoPE(o.fac / o.trx) : "—", x)]; };
    s.addTable([["Grupo", "Comercios", "Reactivados", "Facturación (S/)", "Transacciones", "% facturación", "Ticket prom. (S/)"].map((t, i) => ({ text:t, options:Object.assign({}, H, i ? {} : { align:"left" }) }))]
      .concat([fila(Q.G.cc), fila(Q.G.sc), fila(Q.tv, true), fila(Q.G.nv), fila(Q.tu, true)]),
      { x:0.6, y:1.6, w:12.1, colW:[3.3, 1.2, 1.3, 1.9, 1.5, 1.4, 1.5], rowH:0.42, border:{ type:"solid", color:PX.linea, pt:0.75 }, fill:{ color:PX.blanco } });
    const labs = ["Visitados con contacto", "Visitados sin contacto", "No visitados"], ks = ["cc", "sc", "nv"];
    // barras dibujadas (no gráfico nativo): así las cifras salen con coma decimal en cualquier PowerPoint
    const barras = (x0, titulo, vals, txt, color) => { const mx = Math.max(...vals, 0) || 1;
      T(s, titulo, { x:x0, y:4.2, w:5.9, h:0.28, fontSize:11, bold:true, color:PX.navy, align:"center" });
      s.addShape(pres.shapes.LINE, { x:x0, y:5.72, w:5.9, h:0, line:{ color:PX.linea, width:0.75 } });
      vals.forEach((v, i) => { const cx = x0 + 0.35 + i * 1.95, h = 1.0 * v / mx;
        if (h > 0) s.addShape(pres.shapes.RECTANGLE, { x:cx + 0.3, y:5.72 - h, w:0.9, h, fill:{ color }, line:{ color } });
        T(s, txt(v), { x:cx - 0.1, y:5.72 - h - 0.26, w:1.7, h:0.24, fontSize:10, bold:true, color:PX.navy, align:"center" });
        T(s, labs[i], { x:cx - 0.1, y:5.76, w:1.7, h:0.24, fontSize:9.5, color:PX.tinta, align:"center" }); }); };
    barras(0.6, "% de reactivación por grupo", ks.map(k => Q.G[k].n ? 100 * Q.G[k].reac / Q.G[k].n : 0), v => v.toFixed(2).replace(".", ",") + " %", PX.azulOsc);
    barras(6.8, "Ticket promedio por grupo", ks.map(k => Q.G[k].trx ? Q.G[k].fac / Q.G[k].trx : 0), v => "S/ " + montoPE(v), PX.naranja);
    lectura(s, `Los ${numPE(g.vis)} comercios visitados facturan ${soles(Q.tv.fac)} (${pct2(Q.tv.fac, Q.tu.fac)} del universo) con ${numPE(Q.tv.trx)} transacciones; los reactivados con visita y contacto aportan ${soles(Q.G.cc.fac)}.`,
      "cruzar por corte la facturación de los visitados con la de los no visitados.", 6.12);
    pie(s, `Fuente: totales de la data de BBVA al ${fISO(Q.corte)} (reactivados, facturación y transacciones por grupo); comercios por grupo del CRM de campo Stratis al mismo corte. Control de coherencia: ${Q.errores.length ? Q.errores.join(" · ") : "OK"}.`);
  }

  // 7b (sin totales). Reactivación con la carga por Customer ID
  if (!D.tot){ const B = D.bbva;
    const s = lamina("Reactivación confirmada por BBVA", B ? `Corte de la data de BBVA al ${fechaLarga(B.corte)} · cuenta: reactivado y con gestión con contacto según BBVA, con visita de Stratis` : "Pendiente de la data de BBVA");
    if (!B){
      s.addShape(pres.shapes.RECTANGLE, { x:0.6, y:1.7, w:12.1, h:2.2, fill:{ color:PX.naranjaSuave }, line:{ color:PX.naranjaSuave } });
      T(s, [{ text:"Todavía no hay un corte de BBVA cargado hasta esta fecha.", options:{ bold:true, breakLine:true } }, { text:"La reactivación y la facturación se reportan cuando la data de BBVA está cargada en el CRM (Cargas › Resultados de BBVA). No se muestran cifras sin esa fuente." }],
        { x:0.9, y:1.9, w:11.5, h:1.8, fontSize:14, color:PX.rojo });
    } else {
      const w = 2.87, gap = 0.21, prom = B.facturado != null && B.cuentan ? B.facturado / B.cuentan : null;
      kpi(s, 0.6, 1.6, w, 1.9, PX.azulOsc, "Reactivados que cuentan", numPE(B.cuentan), `meta ${numPE(D.meta.rea)}`, B.cuentan / D.meta.rea, `${pc(B.cuentan, D.meta.rea)} % de la meta · con visita y contacto`);
      kpi(s, 0.6 + (w + gap), 1.6, w, 1.9, PX.naranja, "Conversión", pc(B.cuentan, D.visitados) + " %", `meta ${D.meta.conv} %`, Math.min(1, pc(B.cuentan, D.visitados) / Math.max(1, D.meta.conv)), `${numPE(B.cuentan)} que cuentan ÷ ${numPE(D.visitados)} visitados`);
      kpi(s, 0.6 + 2 * (w + gap), 1.6, w, 1.9, PX.verde, "Facturado", soles(B.facturado), "", null, B.facturado == null ? "sin monto en la carga" : prom != null ? `por los que cuentan · ≈ ${soles(prom)} por comercio` : "por los que cuentan");
      kpi(s, 0.6 + 3 * (w + gap), 1.6, w, 1.9, PX.azul, "Reactivados según BBVA", numPE(B.reactivados), `de ${numPE(B.filas)}`, null, `${numPE(B.enProceso)} en proceso · incluye los que no cuentan`);
      // por qué no todos cuentan
      s.addShape(pres.shapes.RECTANGLE, { x:0.6, y:3.75, w:5.9, h:2.2, fill:{ color:PX.blanco }, line:{ color:PX.linea, width:0.75 } });
      T(s, "Reactivados según BBVA, por qué cuentan o no", { x:0.85, y:3.88, w:5.5, h:0.3, fontSize:12.5, bold:true, color:PX.navy });
      const pq = [[`Cuentan: visitados y con gestión con contacto`, B.cuentan, PX.verde], [`Visitados, sin gestión con contacto según BBVA`, B.visitadosSinContacto, PX.naranja], [`Reactivaron sin visita válida de Stratis`, B.sinVisita, PX.gris]];
      const maxv = Math.max(1, ...pq.map(x => x[1]));
      pq.forEach(([t, n, col], i) => { const y = 4.3 + i * 0.5; T(s, t, { x:0.85, y, w:3.2, h:0.4, fontSize:10.5, valign:"middle" });
        s.addShape(pres.shapes.RECTANGLE, { x:4.1, y:y + 0.1, w:Math.max(0.05, 1.7 * n / maxv), h:0.22, fill:{ color:col }, line:{ color:col } });
        T(s, numPE(n), { x:4.15 + Math.max(0.05, 1.7 * n / maxv), y, w:0.6, h:0.4, fontSize:11, bold:true, color:PX.navy, valign:"middle" }); });
      // por zona
      const labs = D.zonasL.map(z => zonaNum(z.zona));
      s.addChart(pres.charts.BAR, [{ name:"Reactivados que cuentan", labels:labs, values:D.zonasL.map(z => B.porZona[z.zona] || 0) }, { name:`Meta del periodo por zona (${numPE(D.meta.reaEj)})`, labels:labs, values:D.zonasL.map(() => D.meta.reaEj) }],
        { x:6.75, y:3.75, w:5.95, h:2.2, barGrouping:"clustered", chartColors:[PX.azulOsc, PX.linea], showValue:true, dataLabelPosition:"outEnd", dataLabelFontSize:9, dataLabelColor:PX.navy,
          catAxisLabelColor:PX.tinta, catAxisLabelFontSize:10, valAxisHidden:true, valGridLine:{ style:"none" }, catGridLine:{ style:"none" }, showLegend:true, legendPos:"t", legendFontSize:9,
          showTitle:true, title:"Reactivados que cuentan por zona", titleFontSize:11, titleColor:PX.navy });
    }
    lectura(s, B ? `${B.cuentan === 1 ? "1 comercio reactivado cuenta" : `${numPE(B.cuentan)} comercios reactivados cuentan`} para Stratis (${pc(B.cuentan, D.visitados)} % de conversión frente a una meta de ${D.meta.conv} %)${B.facturado != null ? ` y facturan ${soles(B.facturado)}` : ""}.` : "La reactivación se reporta con la data de BBVA.",
      B ? "sostener la entrega de la data de BBVA para seguir cada reactivación por corte." : "cargar el corte de BBVA en el CRM antes de enviar la presentación.");
    pie(s, B ? `Fuente: data de BBVA al ${fISO(B.corte)} (Customer ID, gestión con contacto y reactivado), cruzada con la cartera del CRM de campo Stratis. Cifras en soles.${B.fueraCartera ? ` ${B.fueraCartera} filas de la data no están en la cartera del periodo y no se cuentan.` : ""}` : `Fuente: CRM de campo Stratis al ${dd}.`); }

  // 8. La voz del comercio
  { const s = lamina("La voz del comercio: qué dicen y qué responde el equipo", `Visitas con contacto hasta el ${dd} · ${numPE(D.conFb)} con feedback registrado`);
    const top = D.tipos.slice(0, 8).reverse();
    if (top.length) s.addChart(pres.charts.BAR, [{ name:"Menciones", labels:top.map(o => o.t.length > 48 ? o.t.slice(0, 46) + "…" : o.t), values:top.map(o => o.n) }],
      { x:0.6, y:1.9, w:5.2, h:3.95, barDir:"bar", chartColors:[PX.azul], showValue:true, dataLabelPosition:"outEnd", dataLabelFontSize:9, dataLabelColor:PX.navy, catAxisLabelColor:PX.tinta, catAxisLabelFontSize:9,
        valAxisHidden:true, valGridLine:{ style:"none" }, catGridLine:{ style:"none" }, showLegend:false, barGapWidthPct:45 });
    T(s, "Lo que dicen los comercios", { x:0.6, y:1.55, w:5.2, h:0.3, fontSize:13, bold:true, color:PX.navy });
    T(s, "Qué respondió el ejecutivo", { x:6.05, y:1.55, w:3.6, h:0.3, fontSize:13, bold:true, color:PX.navy });
    const H = { fill:{ color:PX.navy }, color:PX.blanco, bold:true, fontSize:9.5, fontFace:FT, align:"center", valign:"middle" };
    const cel = (t, o) => ({ text:String(t), options:Object.assign({ fontSize:9.5, fontFace:FT, color:PX.tinta, align:"center", valign:"middle" }, o) });
    const acc = D.acciones.slice(0, 6);
    s.addTable([[{ text:"Acción", options:H }, { text:"Veces", options:H }, { text:"Terminó en consumo", options:H }]].concat(acc.length ? acc.map(o => [cel(o.a, { align:"left" }), cel(numPE(o.n)), cel(pc(o.realiza, o.n) + " %")]) : [[cel("Sin acciones registradas todavía", { colspan:3 })]]),
      { x:6.05, y:1.95, w:3.6, colW:[2.1, 0.6, 0.9], border:{ type:"solid", color:PX.linea, pt:0.75 }, fill:{ color:PX.blanco }, rowH:0.36 });
    s.addShape(pres.shapes.RECTANGLE, { x:9.9, y:1.55, w:2.8, h:4.3, fill:{ color:PX.suave }, line:{ color:PX.linea, width:0.75 } });
    T(s, "Por qué dijeron que sí", { x:10.1, y:1.68, w:2.45, h:0.3, fontSize:12, bold:true, color:PX.verde });
    const pq = D.porQue.slice(0, 5);
    T(s, pq.length ? pq.map(([t, n], i) => ({ text:`${t} (${numPE(n)})`, options:{ bullet:true, breakLine:i < pq.length - 1 } })) : "Sin registros todavía", { x:10.1, y:2.05, w:2.5, h:3.7, fontSize:10, paraSpaceAfter:4 });
    const t1 = D.tipos[0], a1 = D.acciones.filter(o => o.n >= 3).sort((a, b) => b.realiza / b.n - a.realiza / a.n)[0];
    lectura(s, `${t1 ? `Lo más mencionado: «${t1.t}» (${numPE(t1.n)}). ` : ""}${a1 ? `La respuesta que más convierte: «${a1.a}» (${pc(a1.realiza, a1.n)} % con compromiso de consumo).` : ""}` || "Todavía no hay feedback suficiente para una lectura.",
      "ajustar el discurso de campo a lo que más mencionan los comercios.");
    pie(s, `Fuente: CRM de campo Stratis al ${dd}. Marcado por el ejecutivo en el celular; antes del 24/09, inferido del comentario.`); }

  // 9. Próximos pasos
  { const s = lamina("Próximos pasos", "");
    const H = { color:PX.gris, bold:true, fontSize:10, fontFace:FT, charSpacing:2 };
    T(s, "PUNTO", Object.assign({ x:1.45, y:1.5, w:3, h:0.3 }, H)); T(s, "DESCRIPCIÓN", Object.assign({ x:4.95, y:1.5, w:5.5, h:0.3 }, H)); T(s, "RESPONSABLE", Object.assign({ x:10.6, y:1.5, w:2, h:0.3 }, H));
    const pasos = [
      ["Visitas: cerrar el periodo en meta", habRest ? `Faltan ${numPE(faltan)} comercios en ${habRest} días hábiles: ${necesario} por día, con foco en los distritos de cartera alta y poca cobertura.` : "Periodo cerrado: preparar la base del siguiente periodo.", "Stratis", PX.naranja],
      ["Data de activación de BBVA", "Entrega periódica de la data de transacciones por comercio para confirmar la reactivación y la facturación de los comercios visitados.", "BBVA", PX.azul],
      ["Regresos agendados", D.volverAgendado ? `${numPE(D.volverAgendado)} comercios con fecha para volver desde el corte: cumplir la cita y convertir el compromiso en transacciones.` : "Agendar el regreso con los comercios que aún no deciden, para convertir el compromiso en transacciones.", "Stratis", PX.verde],
      ["Feedback de campo", `Seguir lo que más mencionan los comercios${D.tipos[0] ? ` («${D.tipos[0].t}»)` : ""} y ajustar el discurso de campo.`, "Stratis", "0070C0"]];
    pasos.forEach(([t, d, r, col], i) => { const y = 1.9 + i * 1.12;
      s.addShape(pres.shapes.RECTANGLE, { x:0.6, y, w:12.1, h:0.98, fill:{ color:PX.blanco }, line:{ color:PX.linea, width:0.75 } });
      s.addShape(pres.shapes.OVAL, { x:0.8, y:y + 0.22, w:0.55, h:0.55, fill:{ color:col }, line:{ color:col } });
      T(s, String(i + 1), { x:0.8, y:y + 0.22, w:0.55, h:0.55, fontFace:FTB, fontSize:16, color:PX.blanco, align:"center", valign:"middle" });
      T(s, t, { x:1.45, y:y + 0.12, w:3.3, h:0.75, fontSize:13, bold:true, color:PX.navy, valign:"middle" });
      T(s, d, { x:4.95, y:y + 0.12, w:5.5, h:0.75, fontSize:10.5, valign:"middle" });
      T(s, r, { x:10.6, y:y + 0.12, w:1.9, h:0.75, fontSize:11, bold:true, color:PX.navy, valign:"middle" }); });
  }

  // 10. Cierre
  { const s = pres.addSlide(); s.background = { color:PX.navy };
    T(s, "Stratis", { x:0, y:2.6, w:13.33, h:1.2, fontFace:FTB, fontSize:60, color:PX.blanco, align:"center", valign:"middle" });
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x:5.0, y:4.05, w:3.33, h:0.55, rectRadius:0.25, fill:{ color:"1A2150" }, line:{ color:"5A6495", width:0.75 } });
    T(s, "www.mystratis.com", { x:5.0, y:4.05, w:3.33, h:0.55, fontSize:15, color:PX.blanco, align:"center", valign:"middle" }); }
}
// «SAN JUAN DE LURIGANCHO» → «San Juan de Lurigancho»
const TILDES = { "JESUS MARIA":"Jesús María", "RIMAC":"Rímac", "ANCON":"Ancón", "SAN MARTIN DE PORRES":"San Martín de Porres", "MI PERU":"Mi Perú", "CHACLACAYO":"Chaclacayo",
  "LURIN":"Lurín", "SANTA MARIA DEL MAR":"Santa María del Mar", "VILLA MARIA DEL TRIUNFO":"Villa María del Triunfo", "CARMEN DE LA LEGUA REYNOSO":"Carmen de la Legua Reynoso" };
const nombreDistritoBase = s => String(s || "").toLowerCase().replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase()).replace(/\s(De|Del|La|Las|Los|Y)\s/g, m => m.toLowerCase());
const zonaNum = z => { const m = String(z || "").match(/^ZONA\s*(\d+)/i); return m ? `Zona ${m[1]}` : String(z || "Sin zona"); };
const zonaLugar = z => { const m = String(z || "").match(/^ZONA\s*\d+\s*-\s*(.+)$/i); return m ? nombreDistrito(m[1]) : ""; };
const nombreZona = z => { const m = String(z || "").match(/^ZONA\s*(\d+)\s*-\s*(.+)$/i); return m ? `Zona ${m[1]} · ${nombreDistrito(m[2])}` : String(z || "Sin zona"); };
const nombreDistrito = s => TILDES[String(s || "").toUpperCase()] || nombreDistritoBase(s);
