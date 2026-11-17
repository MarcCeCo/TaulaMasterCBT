// token-service/src/publicLinks.ts
//
// Enllaços públics del Visor 3D: permeten a persones EXTERNES (sense compte a la
// plataforma) veure en només lectura el model MASTER d'una instal·lació.
//
// Endpoints:
//   POST /api/public/visor          PÚBLIC. Body { token, refresh? }
//                                   → { installacio, urn, access_token, expires_in, expires_at }
//   POST /api/public-links          ADMIN. Body { installacioId, etiqueta?, dies? }
//                                   → { id, token, expires_at }   (el token només es mostra ara)
//   GET  /api/public-links?installacioId=…   ADMIN. Llista d'enllaços (sense el token)
//   POST /api/public-links/revoke   ADMIN. Body { id }
//
// Seguretat:
//   · El token de l'enllaç és aleatori (256 bits). A la BD només es guarda el seu
//     SHA-256: ni amb accés a la taula es pot reconstruir cap enllaç.
//   · La taula té RLS activat SENSE polítiques: només s'hi arriba amb la service
//     role d'aquest servei. El navegador mai hi accedeix directament.
//   · A l'extern NOMÉS se li dona un token APS d'abast `viewables:read` (mai el
//     token de l'app amb data:read/account:read). Per això cal el mode bot (SSA):
//     un token 3-legged d'usuari no es pot reduir d'abast i NO es serveix.
//   · Crear, llistar i revocar enllaços requereix sessió d'un usuari amb
//     user_profiles.role = 'admin' (verificat aquí, no al navegador).
//   · Límit de peticions per IP i missatges d'error genèrics.

import crypto from "crypto";
import http from "http";
import type { SupabaseClient } from "@supabase/supabase-js";
import { obteTokenSSA, configSSA, ApsReauthError } from "../../shared/agent";

const SCOPE_PUBLIC = ["viewables:read"];
const MAX_BODY_BYTES = 4 * 1024;
const FORMAT_TOKEN = /^[A-Za-z0-9_-]{32,100}$/;

// ─── Utilitats ────────────────────────────────────────────────────────────────

function json(
  res: http.ServerResponse,
  status: number,
  body: unknown,
  extra: http.OutgoingHttpHeaders = {},
): void {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow",
    ...extra,
  });
  res.end(JSON.stringify(body));
}

function llegeixBodyLimitat(
  req: http.IncomingMessage,
): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    let data = "";
    let massaGran = false;
    req.on("data", (chunk: Buffer) => {
      if (massaGran) return;
      data += chunk.toString("utf8");
      if (data.length > MAX_BODY_BYTES) massaGran = true;
    });
    req.on("end", () => {
      if (massaGran) return resolve(null);
      try {
        const v = JSON.parse(data || "{}");
        resolve(v && typeof v === "object" ? v : null);
      } catch {
        resolve(null);
      }
    });
    req.on("error", () => resolve(null));
  });
}

const sha256 = (s: string): string =>
  crypto.createHash("sha256").update(s).digest("hex");

// Límit de peticions per IP (memòria; suficient per a una sola instància)
const finestres = new Map<string, { n: number; reinici: number }>();
function superaLimit(clau: string, max: number, finestraMs = 60_000): boolean {
  const ara = Date.now();
  const f = finestres.get(clau);
  if (!f || f.reinici < ara) {
    finestres.set(clau, { n: 1, reinici: ara + finestraMs });
    return false;
  }
  f.n++;
  return f.n > max;
}
setInterval(() => {
  const ara = Date.now();
  for (const [k, f] of finestres) if (f.reinici < ara) finestres.delete(k);
}, 5 * 60_000).unref();

function ipDe(req: http.IncomingMessage): string {
  const xff = String(req.headers["x-forwarded-for"] ?? "")
    .split(",")[0]
    .trim();
  return xff || req.socket.remoteAddress || "desconeguda";
}

// ─── Autorització d'administrador ─────────────────────────────────────────────

type AdminAuth =
  | { ok: true; userId: string; email: string }
  | { ok: false; status: 401 | 403; error: string };

async function autoritzaAdmin(
  req: http.IncomingMessage,
  supabase: SupabaseClient,
): Promise<AdminAuth> {
  const m = /^Bearer\s+(.+)$/i.exec(String(req.headers["authorization"] ?? ""));
  if (!m) return { ok: false, status: 401, error: "Cal iniciar sessió." };

  const { data, error } = await supabase.auth.getUser(m[1].trim());
  if (error || !data?.user) {
    return {
      ok: false,
      status: 401,
      error: "La sessió no és vàlida o ha caducat.",
    };
  }
  const { data: perfil } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();
  if (perfil?.role !== "admin") {
    return {
      ok: false,
      status: 403,
      error: "Només els administradors poden gestionar enllaços públics.",
    };
  }
  return { ok: true, userId: data.user.id, email: data.user.email ?? "" };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

/** Retorna true si la petició era d'enllaços públics (i ja s'ha respost). */
export async function gestionaEnllacosPublics(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  supabase: SupabaseClient | null,
): Promise<boolean> {
  const ruta = url.pathname;
  const esPublic = ruta === "/api/public/visor";
  const esAdmin =
    ruta === "/api/public-links" || ruta === "/api/public-links/revoke";
  if (!esPublic && !esAdmin) return false;

  if (!supabase) {
    json(res, 500, {
      error: "El servei no està configurat correctament.",
      code: "CONFIG_ERROR",
    });
    return true;
  }

  try {
    if (esPublic) {
      if (req.method !== "POST") {
        json(res, 405, { error: "Mètode no permès." });
        return true;
      }
      await visorPublic(req, res, supabase);
      return true;
    }

    // ── Rutes d'administrador ──
    const auth = await autoritzaAdmin(req, supabase);
    if (!auth.ok) {
      json(res, auth.status, { error: auth.error });
      return true;
    }

    if (ruta === "/api/public-links" && req.method === "GET") {
      await llista(url, res, supabase);
    } else if (ruta === "/api/public-links" && req.method === "POST") {
      await crea(req, res, supabase, auth);
    } else if (ruta === "/api/public-links/revoke" && req.method === "POST") {
      await revoca(req, res, supabase);
    } else {
      json(res, 405, { error: "Mètode no permès." });
    }
  } catch (err) {
    console.error(
      "❌ enllaços públics:",
      err instanceof Error ? err.message : err,
    );
    json(res, 500, { error: "Error intern. Torna-ho a provar." });
  }
  return true;
}

// ─── PÚBLIC: dades del visor ──────────────────────────────────────────────────

async function visorPublic(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  supabase: SupabaseClient,
): Promise<void> {
  const ip = ipDe(req);
  if (superaLimit(`pub:${ip}`, 120)) {
    json(res, 429, { error: "Massa peticions. Espera un moment." });
    return;
  }

  const body = await llegeixBodyLimitat(req);
  const token = typeof body?.token === "string" ? body.token : "";
  const esRenovacio = body?.refresh === true;

  // Format invàlid o token desconegut: mateixa resposta i comptador d'intents fallits
  const noValid = () => {
    if (superaLimit(`fail:${ip}`, 15)) {
      json(res, 429, { error: "Massa intents. Espera un moment." });
    } else {
      json(res, 404, {
        error: "Aquest enllaç no és vàlid.",
        code: "LINK_INVALID",
      });
    }
  };
  if (!FORMAT_TOKEN.test(token)) return noValid();

  const { data: enllac, error } = await supabase
    .from("visor_public_links")
    .select("id, installacio_id, expires_at, revoked_at, access_count")
    .eq("token_hash", sha256(token))
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!enllac) return noValid();

  const ara = Date.now();
  const caducat =
    !!enllac.expires_at && new Date(enllac.expires_at).getTime() <= ara;
  if (enllac.revoked_at || caducat) {
    json(res, 410, {
      error: "Aquest enllaç ha caducat o ha estat revocat.",
      code: "LINK_EXPIRED",
    });
    return;
  }

  // Cal el mode bot: només així es pot emetre un token de només lectura
  const cfg = configSSA();
  if (!cfg) {
    json(res, 503, {
      error: "El visor públic no està disponible ara mateix.",
      code: "PUBLIC_UNAVAILABLE",
    });
    return;
  }

  const { data: inst } = await supabase
    .from("visor3d_installacions")
    .select("nom, codi_installacio, urn_master")
    .eq("id", enllac.installacio_id)
    .maybeSingle();
  const urn = String(inst?.urn_master ?? "")
    .split(",")[0]
    .trim();
  if (!inst || !urn) {
    json(res, 404, {
      error: "El model d'aquest enllaç ja no està disponible.",
      code: "MODEL_UNAVAILABLE",
    });
    return;
  }

  let aps;
  try {
    aps = await obteTokenSSA(cfg, SCOPE_PUBLIC);
  } catch (err) {
    console.error(
      "❌ token públic:",
      err instanceof Error ? err.message : err,
      err instanceof ApsReauthError ? "(cal revisar el bot)" : "",
    );
    json(res, 502, {
      error: "No s'ha pogut connectar amb el servei de models. Torna-ho a provar.",
      code: "APS_UPSTREAM_ERROR",
    });
    return;
  }

  // Estadístiques d'ús (només a la càrrega inicial, no a les renovacions de token)
  if (!esRenovacio) {
    void supabase
      .from("visor_public_links")
      .update({
        last_access_at: new Date().toISOString(),
        access_count: (enllac.access_count ?? 0) + 1,
      })
      .eq("id", enllac.id);
  }

  json(res, 200, {
    installacio: { nom: inst.nom, codi: inst.codi_installacio ?? "" },
    urn,
    access_token: aps.access_token,
    expires_in: aps.expires_in,
    expires_at: enllac.expires_at,
  });
}

// ─── ADMIN: crear / llistar / revocar ─────────────────────────────────────────

async function crea(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  supabase: SupabaseClient,
  auth: { userId: string; email: string },
): Promise<void> {
  const body = await llegeixBodyLimitat(req);
  const installacioId =
    typeof body?.installacioId === "string" ? body.installacioId : "";
  const etiqueta =
    typeof body?.etiqueta === "string" ? body.etiqueta.trim().slice(0, 100) : "";
  const dies = body?.dies;
  if (!installacioId) {
    json(res, 400, { error: "Falta la instal·lació." });
    return;
  }
  if (
    dies !== null &&
    dies !== undefined &&
    !(typeof dies === "number" && Number.isInteger(dies) && dies >= 1 && dies <= 365)
  ) {
    json(res, 400, { error: "La caducitat ha de ser d'1 a 365 dies." });
    return;
  }

  const { data: inst } = await supabase
    .from("visor3d_installacions")
    .select("id, urn_master")
    .eq("id", installacioId)
    .maybeSingle();
  if (!inst) {
    json(res, 404, { error: "Instal·lació no trobada." });
    return;
  }
  if (!String(inst.urn_master ?? "").trim()) {
    json(res, 400, {
      error: "Aquesta instal·lació encara no té model MASTER sincronitzat.",
    });
    return;
  }

  const token = crypto.randomBytes(32).toString("base64url"); // 43 caràcters
  const expiraA =
    typeof dies === "number"
      ? new Date(Date.now() + dies * 86_400_000).toISOString()
      : null;

  const { data: fila, error } = await supabase
    .from("visor_public_links")
    .insert({
      installacio_id: installacioId,
      token_hash: sha256(token),
      etiqueta,
      created_by: auth.userId,
      created_by_email: auth.email,
      expires_at: expiraA,
    })
    .select("id")
    .single();
  if (error || !fila) throw new Error(error?.message ?? "No s'ha pogut crear.");

  json(res, 201, { id: fila.id, token, expires_at: expiraA });
}

async function llista(
  url: URL,
  res: http.ServerResponse,
  supabase: SupabaseClient,
): Promise<void> {
  const installacioId = url.searchParams.get("installacioId") ?? "";
  if (!installacioId) {
    json(res, 400, { error: "Falta la instal·lació." });
    return;
  }
  const { data, error } = await supabase
    .from("visor_public_links")
    .select(
      "id, etiqueta, created_by_email, created_at, expires_at, revoked_at, last_access_at, access_count",
    )
    .eq("installacio_id", installacioId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  json(res, 200, { enllacos: data ?? [] });
}

async function revoca(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  supabase: SupabaseClient,
): Promise<void> {
  const body = await llegeixBodyLimitat(req);
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) {
    json(res, 400, { error: "Falta l'identificador de l'enllaç." });
    return;
  }
  const { error } = await supabase
    .from("visor_public_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .is("revoked_at", null);
  if (error) throw new Error(error.message);
  json(res, 200, { ok: true });
}
