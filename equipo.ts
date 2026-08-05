// Servicio de gestión del equipo — CRM Stratis
// Solo responde a usuarios con rol Analista o Manager. La llave de servicio
// vive aquí, nunca en el navegador.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const URL  = Deno.env.get("SUPABASE_URL")!;
const SRV  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DOM  = "mystratis.com";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

function clave(): string {
  const n = String(Math.floor(Math.random() * 9000) + 1000);
  const l = "abcdefghijkmnpqrstuvwxyz";
  let s = "";
  for (let i = 0; i < 3; i++) s += l[Math.floor(Math.random() * l.length)];
  return `Bbva-${n}-${s}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const admin = createClient(URL, SRV, { auth: { persistSession: false } });

  // ---- quién llama ------------------------------------------------------
  const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "");
  if (!jwt) return json({ error: "Falta la sesión." }, 401);
  const { data: u, error: eU } = await admin.auth.getUser(jwt);
  if (eU || !u?.user?.email) return json({ error: "Sesión no válida." }, 401);

  const quien = u.user.email.toLowerCase();
  const { data: yo } = await admin.from("usuarios").select("*").eq("correo", quien).maybeSingle();
  if (!yo || !yo.activo || yo.rol === "Ejecutivo")
    return json({ error: "Solo el Analista y el Manager pueden gestionar el equipo." }, 403);

  let b: Record<string, string | boolean>;
  try { b = await req.json(); } catch { return json({ error: "Cuerpo inválido." }, 400); }

  const accion = String(b.accion || "");
  const correo = String(b.correo || "").trim().toLowerCase();
  if (!correo.endsWith("@" + DOM))
    return json({ error: `El correo debe ser @${DOM}.` }, 400);

  const { data: existente } = await admin.from("usuarios").select("*").eq("correo", correo).maybeSingle();

  // id de la cuenta de acceso, si existe
  const buscarAuth = async () => {
    const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    return (data?.users || []).find((x) => (x.email || "").toLowerCase() === correo) || null;
  };

  try {
    if (accion === "crear") {
      if (existente) return json({ error: "Esa persona ya está registrada en el equipo." }, 409);
      const nombre = String(b.nombre || "").trim();
      const corto  = String(b.nombre_corto || "").trim() || nombre;
      const rol    = String(b.rol || "Ejecutivo");
      if (nombre.length < 3) return json({ error: "Escribe el nombre completo." }, 400);
      if (!["Ejecutivo", "Analista", "Manager"].includes(rol)) return json({ error: "Rol no válido." }, 400);

      const yaAuth = await buscarAuth();
      const cl = clave();
      if (yaAuth) {
        await admin.auth.admin.updateUserById(yaAuth.id, {
          password: cl, email_confirm: true, user_metadata: { debe_cambiar: true },
        });
      } else {
        const { error } = await admin.auth.admin.createUser({
          email: correo, password: cl, email_confirm: true,
          user_metadata: { debe_cambiar: true },
        });
        if (error) return json({ error: "No se pudo crear la cuenta: " + error.message }, 400);
      }
      const { error: eIns } = await admin.from("usuarios")
        .insert({ correo, nombre, nombre_corto: corto, rol, activo: true });
      if (eIns) return json({ error: "No se pudo guardar en el equipo: " + eIns.message }, 400);

      await admin.from("auditoria").insert({
        tabla: "usuarios", accion: "editar", registro_id: correo, correo: quien,
        ejecutivo: yo.nombre_corto || yo.nombre, comercio: corto,
        detalle: { alta: { antes: null, despues: `${nombre} (${rol})` } },
      });
      return json({ ok: true, clave: cl });
    }

    if (accion === "clave") {
      if (!existente) return json({ error: "Esa persona no está en el equipo." }, 404);
      const a = await buscarAuth();
      const cl = clave();
      if (a) {
        const { error } = await admin.auth.admin.updateUserById(a.id, {
          password: cl, user_metadata: { debe_cambiar: true },
        });
        if (error) return json({ error: error.message }, 400);
      } else {
        const { error } = await admin.auth.admin.createUser({
          email: correo, password: cl, email_confirm: true,
          user_metadata: { debe_cambiar: true },
        });
        if (error) return json({ error: error.message }, 400);
      }
      await admin.from("auditoria").insert({
        tabla: "usuarios", accion: "editar", registro_id: correo, correo: quien,
        ejecutivo: yo.nombre_corto || yo.nombre, comercio: existente.nombre_corto,
        detalle: { contraseña: { antes: "(la anterior)", despues: "(reasignada)" } },
      });
      return json({ ok: true, clave: cl });
    }

    if (accion === "guardar") {
      if (!existente) return json({ error: "Esa persona no está en el equipo." }, 404);
      const cambios: Record<string, unknown> = {};
      if (b.nombre !== undefined)       cambios.nombre = String(b.nombre).trim();
      if (b.nombre_corto !== undefined) cambios.nombre_corto = String(b.nombre_corto).trim();
      if (b.rol !== undefined)          cambios.rol = String(b.rol);
      if (b.activo !== undefined)       cambios.activo = !!b.activo;
      if (cambios.rol && !["Ejecutivo", "Analista", "Manager"].includes(String(cambios.rol)))
        return json({ error: "Rol no válido." }, 400);
      if (correo === quien && cambios.activo === false)
        return json({ error: "No puedes darte de baja a ti mismo." }, 400);
      if (correo === quien && cambios.rol && cambios.rol === "Ejecutivo")
        return json({ error: "No puedes quitarte tu propio perfil de administrador." }, 400);

      const det: Record<string, unknown> = {};
      for (const k of Object.keys(cambios))
        if (existente[k] !== cambios[k]) det[k] = { antes: existente[k], despues: cambios[k] };
      if (!Object.keys(det).length) return json({ ok: true, sinCambios: true });

      const { error } = await admin.from("usuarios").update(cambios).eq("correo", correo);
      if (error) return json({ error: error.message }, 400);

      // si se da de baja, se cierra su acceso
      if (cambios.activo === false) {
        const a = await buscarAuth();
        if (a) await admin.auth.admin.updateUserById(a.id, { ban_duration: "876000h" });
      }
      if (cambios.activo === true) {
        const a = await buscarAuth();
        if (a) await admin.auth.admin.updateUserById(a.id, { ban_duration: "none" });
      }
      await admin.from("auditoria").insert({
        tabla: "usuarios", accion: "editar", registro_id: correo, correo: quien,
        ejecutivo: yo.nombre_corto || yo.nombre, comercio: existente.nombre_corto, detalle: det,
      });
      return json({ ok: true });
    }

    return json({ error: "Acción no reconocida." }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
