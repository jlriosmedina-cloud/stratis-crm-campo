// Utilidades compartidas: navegador, cliente de Supabase simulado y datos inventados.
// Los Customer ID empiezan con 000000 para que nunca se confundan con datos reales.
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const urlDist = app => pathToFileURL(path.join(RAIZ, 'dist', app, 'index.html')).href;
export const hoyLima = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
export const mananaLima = () => { const d = new Date(Date.now() + 86400000); return d.toLocaleDateString('en-CA', { timeZone: 'America/Lima' }); };

export async function navegador(opts = {}) {
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const ctx = await b.newContext({ viewport: opts.viewport || { width: 390, height: 860 }, timezoneId: 'America/Lima', locale: 'es-PE',
    geolocation: { latitude: -12.0931, longitude: -77.0465, accuracy: 12 }, permissions: ['geolocation'], colorScheme: opts.tema || 'light' });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await ctx.route(/tile\.openstreetmap\.org/, r => r.abort());
  // supabase-js se reemplaza por un cliente simulado que responde con window.__FX y anota cada llamada en window.__llamadas
  await ctx.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, r => r.fulfill({ contentType: 'application/javascript', body: STUB }));
  return { b, ctx };
}

export const STUB = `
(() => {
  const ok = data => Promise.resolve({ data, error: null });
  const mal = message => Promise.resolve({ data: null, error: { message } });
  window.__llamadas = [];
  const cliente = () => ({
    auth: {
      getSession: () => ok({ session: window.__FX.sesion }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe(){} } } }),
      signOut: () => ok(null),
      signInWithPassword: () => ok({ session: window.__FX.sesion })
    },
    channel: () => ({ on(){ return this; }, subscribe(){ return this; } }),
    removeChannel: () => {},
    rpc: (fn, args) => {
      window.__llamadas.push([fn, JSON.parse(JSON.stringify(args || {}))]);
      const r = window.__FX.rpc[fn];
      if (typeof r === 'function') { const x = r(args); return x && x.__error ? mal(x.__error) : ok(x); }
      return ok(r === undefined ? [] : r);
    },
    from: t => { const q = { select(){ return q; }, eq(){ return q; }, lte(){ return q; }, gte(){ return q; }, in(){ return q; }, order(){ return q; }, limit(){ return q; },
      maybeSingle(){ const d = window.__FX.tablas[t]; return ok(Array.isArray(d) ? d[0] || null : d || null); },
      single(){ return q.maybeSingle(); },
      then(res, rej){ const d = window.__FX.tablas[t]; return ok(Array.isArray(d) ? d : d ? [d] : []).then(res, rej); } };
      return q; },
    storage: { from: () => ({ upload: () => ok({}), getPublicUrl: () => ({ data: { publicUrl: '' } }) }) }
  });
  window.supabase = { createClient: () => cliente() };
})();`;

// Datos inventados
export const EJECUTIVO = { correo: 'ejecutivo.prueba@ejemplo.com', nombre: 'Ejecutivo Prueba', nombre_corto: 'Prueba', rol: 'Ejecutivo', activo: true };
export function comercio(i, extra = {}) {
  return Object.assign({
    customer_id: String(i).padStart(8, '0'), razon_social: `COMERCIO DE PRUEBA ${i} SAC`, nombre_comercial: `Comercio Prueba ${i}`,
    rubro: 'Bodega', departamento: 'LIMA', provincia: 'LIMA', distrito: 'SAN ISIDRO', direccion: `AV. INVENTADA ${100 + i}`, zona: 'ZONA 1',
    tasa_debito: 0.0329, tasa_credito: 0.0329, tasa_foranea: 0.0399, tasas_aprox: true, correo: EJECUTIVO.correo,
    ruta: 'Ruta 01', orden: i, estado_comercio: 'Activado', visitas: 0, visitas_validas: 0, ultima_visita: null, estado: 'por',
    geo_lat: -12.0931 + i * 0.0001, geo_lng: -77.0465, geo_calidad: 'numero'
  }, extra);
}
