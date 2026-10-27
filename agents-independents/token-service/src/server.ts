// token-service/src/server.ts
// Servei lleuger i sempre actiu que exposa el token APS 3-legged per al Viewer SDK.
// Renova el token proactivament calculant el temps restant real del token a Supabase.
//
// Endpoints:
//   GET /health         → estat del servei + estat del token APS (sempre HTTP 200)
//   GET /health/token   → igual que /health però amb HTTP 503 si el token APS no és sa
//                         (pensat per a UptimeRobot: monitor HTTP normal)
//   GET /wake           → keep-alive (evita hibernació a Render)
//   GET /auth/login     → inicia flux OAuth APS 3-legged
//   GET /auth/callback  → callback OAuth APS
//   GET /api/aps-token  → retorna access_token. REQUEREIX autenticació:
//                           · Bearer <sessió Supabase d'un usuari de la plataforma> (frontend)
//                           · Bearer <TOKEN_SERVICE_SECRET> (serveis interns: Visor 3D…)
//
// Variables d'entorn: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APS_CLIENT_ID,
//   APS_CLIENT_SECRET, APS_CALLBACK_URL, TOKEN_SERVICE_SECRET
// ─────────────────────────────────────────────────────────────────────────────

import http from "http";
import crypto from "crypto";
import WebSocket from "ws";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { obteToken3Legged, ApsReauthError } from "../../shared/agent";
import { setCors, htmlPagina, APS_AUTH_BASE, APS_SCOPE } from "../../shared/helpers";

(globalThis as any).WebSocket = WebSocket;

const PORT                 = process.env.PORT || 3001;
const TOKEN_SERVICE_SECRET = process.env.TOKEN_SERVICE_SECRET?.trim() || "";

const pendingStates = new Map<string, number>();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function creaSupabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function json(res: http.ServerResponse, status: number, body: unknown, extra: http.OutgoingHttpHeaders = {}): void {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra });
  res.end(JSON.stringify(body));
}

// Comparació en temps constant (evita atacs de temporització sobre el secret)
function segurIgual(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

type Autoritzacio =
  | { ok: true;  origen: "servei" | "usuari" }
  | { ok: false; status: 401 | 403; code: "UNAUTHORIZED" | "FORBIDDEN"; error: string };

// Accepta: (1) el secret de servei, o (2) un access_token de sessió de Supabase
// d'un usuari que tingui perfil a la plataforma (taula user_profiles).
async function autoritzaPeticio(req: http.IncomingMessage, supabase: SupabaseClient): Promise<Autoritzacio> {
  const capcalera = String(req.headers["authorization"] ?? "");
  const m = /^Bearer\s+(.+)$/i.exec(capcalera);
  if (!m) {
    return { ok: false, status: 401, code: "UNAUTHORIZED", error: "No autoritzat. Cal iniciar sessió." };
  }
  const bearer = m[1].trim();

  if (TOKEN_SERVICE_SECRET && segurIgual(bearer, TOKEN_SERVICE_SECRET)) {
    return { ok: true, origen: "servei" };
  }

  // Valida el JWT contra Supabase Auth (signatura + caducitat)
  const { data, error } = await supabase.auth.getUser(bearer);
  if (error || !data?.user) {
    return { ok: false, status: 401, code: "UNAUTHORIZED", error: "La sessió no és vàlida o ha caducat. Torna a iniciar sessió." };
  }

  const { data: perfil, error: perfilError } = await supabase
    .from("user_profiles").select("id").eq("id", data.user.id).maybeSingle();
  if (perfilError || !perfil) {
    return { ok: false, status: 403, code: "FORBIDDEN", error: "El teu usuari no té accés als models 3D." };
  }
  return { ok: true, origen: "usuari" };
}

// ─── Estat del token (per a /health) ──────────────────────────────────────────
//
// token_ok = false quan cal intervenció humana o la renovació no funciona.
// Mai s'exposen els tokens ni el text d'error d'Autodesk (el /health és públic).

let ultimaRenovacioOk: Date | null = null;
let ultimError: { at: string; reauth: boolean } | null = null;

function registraRenovacioOk(): void {
  ultimaRenovacioOk = new Date();
  ultimError = null;
}

function registraErrorRenovacio(err: unknown): void {
  const reauth = err instanceof ApsReauthError;
  ultimError = { at: new Date().toISOString(), reauth };
  console.error(`❌ Error renovant token APS${reauth ? " (cal /auth/login)" : ""}:`, err instanceof Error ? err.message : err);
}

type EstatToken =
  | "ok" | "sense_token" | "reautenticacio_necessaria"
  | "error_renovacio" | "caducat" | "config_incompleta" | "error_supabase";

async function llegeixEstatToken(): Promise<{ token_ok: boolean; estat: EstatToken; minuts_restants: number | null }> {
  const supabase = creaSupabase();
  if (!supabase) return { token_ok: false, estat: "config_incompleta", minuts_restants: null };

  const { data: row, error } = await supabase
    .from("aps_tokens").select("refresh_token, expires_at").eq("id", 1).maybeSingle();

  if (error)                return { token_ok: false, estat: "error_supabase", minuts_restants: null };
  if (!row?.refresh_token)  return { token_ok: false, estat: "sense_token",    minuts_restants: null };

  const ara = Date.now();
  const msRestants = (row.expires_at as number) - ara;
  const minuts_restants = Math.max(0, Math.round(msRestants / 60_000));

  if (ultimError?.reauth)                         return { token_ok: false, estat: "reautenticacio_necessaria", minuts_restants };
  if (ultimError && msRestants < 0)               return { token_ok: false, estat: "error_renovacio",          minuts_restants };
  if (msRestants < -10 * 60_000)                  return { token_ok: false, estat: "caducat",                   minuts_restants };
  return { token_ok: true, estat: "ok", minuts_restants };
}

async function cosHealth() {
  let estat: Awaited<ReturnType<typeof llegeixEstatToken>>;
  try {
    estat = await llegeixEstatToken();
  } catch {
    estat = { token_ok: false, estat: "error_supabase", minuts_restants: null };
  }
  return {
    status: "ok",                       // el procés està viu
    service: "token-service",
    token_ok: estat.token_ok,           // la cadena d'Autodesk funciona
    token: {
      estat: estat.estat,
      minuts_restants: estat.minuts_restants,
      ultima_renovacio: ultimaRenovacioOk ? ultimaRenovacioOk.toISOString() : null,
      ultim_error: ultimError,
    },
    propera_renovacio: properaRenovacioISO(),
    timestamp: new Date().toISOString(),
  };
}

// ─── Servidor ─────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  setCors(res);
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  // ── Health ────────────────────────────────────────────────────────────────
  // /health sempre retorna 200 (és el que pot usar Render com a health check:
  // un token caducat no ha de provocar que Render reiniciï el servei, ja que
  // aquest és justament el que serveix /auth/login).
  if (url.pathname === "/health") {
    json(res, 200, await cosHealth());
    return;
  }

  // /health/token retorna 503 si el token APS no és sa → monitor HTTP d'UptimeRobot
  if (url.pathname === "/health/token") {
    const cos = await cosHealth();
    json(res, cos.token_ok ? 200 : 503, cos);
    return;
  }

  // ── Wake-up ───────────────────────────────────────────────────────────────
  if (url.pathname === "/wake") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "despert", timestamp: new Date().toISOString() }));
    return;
  }

  // ── OAuth: login ──────────────────────────────────────────────────────────
  if (url.pathname === "/auth/login" && req.method === "GET") {
    const clientId    = process.env.APS_CLIENT_ID;
    const callbackUrl = process.env.APS_CALLBACK_URL;

    if (!clientId || !callbackUrl) {
      res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
      res.end(htmlPagina("Configuració incompleta", "APS_CLIENT_ID o APS_CALLBACK_URL no definits.", false));
      return;
    }

    const state = Math.random().toString(36).substring(2) + Date.now().toString(36);
    pendingStates.set(state, Date.now());
    const ara = Date.now();
    for (const [k, ts] of pendingStates.entries()) {
      if (ara - ts > 10 * 60 * 1000) pendingStates.delete(k);
    }

    const authUrl = new URL(`${APS_AUTH_BASE}/authorize`);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", callbackUrl);
    authUrl.searchParams.set("scope", APS_SCOPE);
    authUrl.searchParams.set("state", state);

    res.writeHead(302, { Location: authUrl.toString() });
    res.end();
    return;
  }

  // ── OAuth: callback ───────────────────────────────────────────────────────
  if (url.pathname === "/auth/callback" && req.method === "GET") {
    const code          = url.searchParams.get("code");
    const returnedState = url.searchParams.get("state");
    const errorParam    = url.searchParams.get("error");

    if (errorParam) {
      res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
      res.end(htmlPagina("Error d'autenticació", url.searchParams.get("error_description") ?? errorParam, false));
      return;
    }
    if (!code || !returnedState || !pendingStates.has(returnedState)) {
      res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
      res.end(htmlPagina("Paràmetres invàlids", "Falta el codi o l'estat no és vàlid.", false));
      return;
    }
    pendingStates.delete(returnedState);

    const supabase     = creaSupabase();
    const clientId     = process.env.APS_CLIENT_ID;
    const clientSecret = process.env.APS_CLIENT_SECRET;
    const callbackUrl  = process.env.APS_CALLBACK_URL;

    if (!supabase || !clientId || !clientSecret || !callbackUrl) {
      res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
      res.end(htmlPagina("Error de configuració", "Variables d'entorn incompletes.", false));
      return;
    }

    try {
      const tokenResp = await fetch(`${APS_AUTH_BASE}/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type:    "authorization_code",
          code,
          redirect_uri:  callbackUrl,
          client_id:     clientId,
          client_secret: clientSecret,
        }),
      });
      if (!tokenResp.ok) {
        throw new Error(`Autodesk ha rebutjat el codi d'autorització (${tokenResp.status}). Torna a començar a /auth/login.`);
      }
      const tokenData = await tokenResp.json() as {
        access_token: string; refresh_token: string; expires_in: number;
      };
      const { error: dbError } = await supabase.from("aps_tokens").upsert({
        id:            1,
        access_token:  tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at:    Date.now() + tokenData.expires_in * 1000,
      });
      if (dbError) throw new Error(`No s'ha pogut desar el token a Supabase: ${dbError.message}`);

      registraRenovacioOk();
      // Nou token acabat d'obtenir: reprogramem el scheduler
      planificaRenovacio();

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(htmlPagina("Autenticació completada", "Sessió APS iniciada correctament. Ja pots tancar aquesta finestra.", true));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
      res.end(htmlPagina("Error", msg, false));
    }
    return;
  }

  // ── GET /api/aps-token ────────────────────────────────────────────────────
  // Codis d'error (camp "code"):
  //   UNAUTHORIZED (401)         sessió/secret invàlid
  //   FORBIDDEN (403)            usuari sense perfil a la plataforma
  //   APS_REAUTH_REQUIRED (503)  cal /auth/login (token inexistent, caducat o revocat)
  //   APS_UPSTREAM_ERROR (502)   Autodesk o Supabase no responen
  //   CONFIG_ERROR (500)         variables d'entorn sense configurar
  if (url.pathname === "/api/aps-token" && req.method === "GET") {
    const supabase     = creaSupabase();
    const clientId     = process.env.APS_CLIENT_ID;
    const clientSecret = process.env.APS_CLIENT_SECRET;

    if (!supabase || !clientId || !clientSecret) {
      json(res, 500, { error: "El servei de tokens no està configurat correctament.", code: "CONFIG_ERROR" });
      return;
    }

    try {
      const auth = await autoritzaPeticio(req, supabase);
      if (!auth.ok) {
        json(res, auth.status, { error: auth.error, code: auth.code });
        return;
      }

      const { data: row, error: dbError } = await supabase
        .from("aps_tokens")
        .select("access_token, refresh_token, expires_at")
        .eq("id", 1)
        .single();

      if (dbError || !row) {
        json(res, 503, {
          error: "La connexió amb Autodesk no està activa. L'administrador l'ha de tornar a autenticar (/auth/login).",
          code: "APS_REAUTH_REQUIRED",
        });
        return;
      }

      const ara = Date.now();
      const MARGE_MS = 5 * 60 * 1000;
      let accessToken: string;
      let expiresIn: number;

      if (row.access_token && row.expires_at > ara + MARGE_MS) {
        accessToken = row.access_token;
        expiresIn   = Math.round((row.expires_at - ara) / 1000);
      } else if (row.refresh_token) {
        try {
          accessToken = await obteToken3Legged(supabase, clientId, clientSecret);
          registraRenovacioOk();
        } catch (err) {
          registraErrorRenovacio(err);
          throw err;
        }
        const { data: rowNou } = await supabase
          .from("aps_tokens").select("expires_at").eq("id", 1).single();
        expiresIn = rowNou ? Math.round((rowNou.expires_at - Date.now()) / 1000) : 3600;
        // Token renovat via petició externa: reprogramem el scheduler
        planificaRenovacio();
      } else {
        json(res, 503, {
          error: "La connexió amb Autodesk no està activa. L'administrador l'ha de tornar a autenticar (/auth/login).",
          code: "APS_REAUTH_REQUIRED",
        });
        return;
      }

      // no-store: el client ja guarda el token en memòria; així no es queda en cap caché
      json(res, 200, { access_token: accessToken, expires_in: expiresIn });
    } catch (err) {
      if (err instanceof ApsReauthError) {
        json(res, 503, {
          error: "La connexió amb Autodesk ha caducat. L'administrador l'ha de tornar a autenticar (/auth/login).",
          code: err.code,
        });
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      console.error("❌ /api/aps-token:", msg);
      json(res, 502, { error: "No s'ha pogut obtenir el token d'Autodesk. Torna-ho a provar d'aquí a una estona.", code: "APS_UPSTREAM_ERROR" });
    }
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Ruta no trobada" }));
});

server.listen(PORT, async () => {
  console.log(`\n🔑 Token Service arrancant al port ${PORT}`);
  console.log(`   GET  /health          → estat (servei + token)`);
  console.log(`   GET  /health/token    → 503 si el token APS no és sa`);
  console.log(`   GET  /wake            → keep-alive`);
  console.log(`   GET  /auth/login      → inicia OAuth APS`);
  console.log(`   GET  /auth/callback   → callback OAuth APS`);
  console.log(`   GET  /api/aps-token   → token APS [Bearer requerit]\n`);
  if (!TOKEN_SERVICE_SECRET) {
    console.warn("⚠️  TOKEN_SERVICE_SECRET no definit: els serveis interns (Visor 3D) no podran demanar el token.");
  }
  // En arrencar, llegim expires_at real de Supabase i programem la renovació
  // al moment òptim en lloc d'usar un interval fix des de zero.
  await planificaRenovacio();
});

// ─── Renovació proactiva intel·ligent ─────────────────────────────────────────
//
// setTimeout dinàmic: en arrencar (i després de cada renovació) llegim
// expires_at de Supabase i programem el proper disparo quan quedin
// MARGE_RENOVACIO_MS abans que el token expiri. Així és independent dels
// reinicis del servei.
//
// Si Autodesk respon invalid_grant (cal reautenticar-se) NO es reintenta: no té
// sentit martellejar Autodesk amb un refresh token mort. El scheduler es
// reprogramarà quan algú completi /auth/login. En errors transitoris
// (xarxa, 5xx) es reintenta d'aquí a MIN_INTERVAL_MS.
// ─────────────────────────────────────────────────────────────────────────────

const MARGE_RENOVACIO_MS = 10 * 60 * 1000; // Renova quan quedin 10 min per expirar
const MIN_INTERVAL_MS    =  5 * 60 * 1000; // Mai programar per menys de 5 min

let renovacioTimeout: NodeJS.Timeout | null = null;
let properaRenovacioAt: Date | null = null;

function properaRenovacioISO(): string | null {
  return properaRenovacioAt ? properaRenovacioAt.toISOString() : null;
}

async function planificaRenovacio(): Promise<void> {
  const supabase = creaSupabase();
  if (!supabase) return;

  if (renovacioTimeout) { clearTimeout(renovacioTimeout); renovacioTimeout = null; }
  properaRenovacioAt = null;

  try {
    const { data: row } = await supabase
      .from("aps_tokens")
      .select("expires_at, refresh_token")
      .eq("id", 1)
      .maybeSingle();

    if (!row?.refresh_token) {
      console.log("⏸️  Scheduler token APS: cap token a Supabase, esperant autenticació.");
      return;
    }

    const ara           = Date.now();
    const expiresAt     = row.expires_at as number;
    const msFinsTrigger = Math.max(expiresAt - ara - MARGE_RENOVACIO_MS, MIN_INTERVAL_MS);
    properaRenovacioAt  = new Date(ara + msFinsTrigger);

    const minsRestants = Math.round(msFinsTrigger / 60_000);
    console.log(`⏰ Scheduler token APS: propera renovació en ${minsRestants} min (${properaRenovacioAt.toISOString()})`);

    renovacioTimeout = setTimeout(async () => {
      const resultat = await renovaTokenProactivament();
      if (resultat === "reauth") {
        properaRenovacioAt = null;
        console.error("⛔ Scheduler token APS aturat: cal autenticar-se a /auth/login.");
        return;
      }
      // "ok" → propera expiració; "error" → reintent d'aquí a ≥ MIN_INTERVAL_MS
      await planificaRenovacio();
    }, msFinsTrigger);

  } catch (err) {
    console.error("❌ Error planificant renovació token:", err instanceof Error ? err.message : err);
    // Fallback: reintenta en 5 min si hi ha error de xarxa o Supabase
    renovacioTimeout = setTimeout(planificaRenovacio, MIN_INTERVAL_MS);
    properaRenovacioAt = new Date(Date.now() + MIN_INTERVAL_MS);
  }
}

async function renovaTokenProactivament(): Promise<"ok" | "reauth" | "error"> {
  const supabase     = creaSupabase();
  const clientId     = process.env.APS_CLIENT_ID;
  const clientSecret = process.env.APS_CLIENT_SECRET;
  if (!supabase || !clientId || !clientSecret) return "error";
  try {
    // force: renova encara que el token sigui vàlid, sense tocar expires_at.
    // (Abans s'escrivia expires_at = 0 abans de renovar: si la renovació fallava,
    // un token encara vàlid quedava marcat com a caducat.)
    await obteToken3Legged(supabase, clientId, clientSecret, { force: true });
    registraRenovacioOk();
    console.log("🔄 Token APS renovat proactivament");
    return "ok";
  } catch (err) {
    registraErrorRenovacio(err);
    return err instanceof ApsReauthError ? "reauth" : "error";
  }
}
