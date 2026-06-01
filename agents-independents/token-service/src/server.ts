// token-service/src/server.ts
// Servei lleuger i sempre actiu que exposa el token APS 3-legged per al Viewer SDK.
// Renova el token proactivament calculant el temps restant real del token a Supabase.
//
// Endpoints:
//   GET /health         → estat del servei
//   GET /wake           → keep-alive (evita hibernació a Render)
//   GET /auth/login     → inicia flux OAuth APS 3-legged
//   GET /auth/callback  → callback OAuth APS
//   GET /api/aps-token  → retorna access_token per al Viewer
// ─────────────────────────────────────────────────────────────────────────────

import http from "http";
import WebSocket from "ws";
import { createClient } from "@supabase/supabase-js";
import { obteToken3Legged } from "../../shared/agent";
import { setCors, verificaAuth, htmlPagina, APS_AUTH_BASE, APS_SCOPE } from "../../shared/helpers";

(globalThis as any).WebSocket = WebSocket;

const PORT         = process.env.PORT || 3001;
const AGENT_SECRET = process.env.AGENT_SECRET || "";

const pendingStates = new Map<string, number>();

// ─── Servidor ─────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  setCors(res);
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  // ── Health ────────────────────────────────────────────────────────────────
  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "ok",
      service: "token-service",
      propera_renovacio: properaRenovacioISO(),
      timestamp: new Date().toISOString(),
    }));
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

    const supabaseUrl  = process.env.SUPABASE_URL;
    const supabaseKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const clientId     = process.env.APS_CLIENT_ID;
    const clientSecret = process.env.APS_CLIENT_SECRET;
    const callbackUrl  = process.env.APS_CALLBACK_URL;

    if (!supabaseUrl || !supabaseKey || !clientId || !clientSecret || !callbackUrl) {
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
      const tokenData = await tokenResp.json() as {
        access_token: string; refresh_token: string; expires_in: number;
      };
      const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      await supabase.from("aps_tokens").upsert({
        id:            1,
        access_token:  tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at:    Date.now() + tokenData.expires_in * 1000,
      });

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
  if (url.pathname === "/api/aps-token" && req.method === "GET") {
    const supabaseUrl  = process.env.SUPABASE_URL;
    const supabaseKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const clientId     = process.env.APS_CLIENT_ID;
    const clientSecret = process.env.APS_CLIENT_SECRET;

    if (!supabaseUrl || !supabaseKey || !clientId || !clientSecret) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Variables d'entorn no configurades" }));
      return;
    }

    try {
      const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const { data: row, error: dbError } = await supabase
        .from("aps_tokens")
        .select("access_token, refresh_token, expires_at")
        .eq("id", 1)
        .single();

      if (dbError || !row) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Token APS no disponible. Visita /auth/login per autenticar-te." }));
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
        accessToken = await obteToken3Legged(supabase, clientId, clientSecret);
        const { data: rowNou } = await supabase
          .from("aps_tokens").select("expires_at").eq("id", 1).single();
        expiresIn = rowNou ? Math.round((rowNou.expires_at - Date.now()) / 1000) : 3600;
        // Token renovat via petició externa: reprogramem el scheduler
        planificaRenovacio();
      } else {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Refresh token no disponible. Visita /auth/login." }));
        return;
      }

      res.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": `private, max-age=${Math.max(0, expiresIn - 60)}`,
      });
      res.end(JSON.stringify({ access_token: accessToken, expires_in: expiresIn }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: msg }));
    }
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Ruta no trobada" }));
});

server.listen(PORT, async () => {
  console.log(`\n🔑 Token Service arrancant al port ${PORT}`);
  console.log(`   GET  /health          → estat`);
  console.log(`   GET  /wake            → keep-alive`);
  console.log(`   GET  /auth/login      → inicia OAuth APS`);
  console.log(`   GET  /auth/callback   → callback OAuth APS`);
  console.log(`   GET  /api/aps-token   → token per al Viewer SDK\n`);
  // En arrencar, llegim expires_at real de Supabase i programem la renovació
  // al moment òptim en lloc d'usar un interval fix des de zero.
  await planificaRenovacio();
});

// ─── Renovació proactiva intel·ligent ─────────────────────────────────────────
//
// Problema del setInterval fix:
//   - Si el procés reinicia, el comptador comença de zero sense saber quan
//     expira realment el token → pot renovar massa aviat o massa tard.
//   - obteToken3Legged té un marge de 5 min: si el token encara és vàlid,
//     retorna sense renovar i sense log → intervals silenciosos que semblen
//     renovacions perdudes.
//
// Solució: setTimeout dinàmic
//   En arrencar (i després de cada renovació), llegim expires_at de Supabase
//   i programem el proper setTimeout per disparar quan quedin MARGE_RENOVACIO_MS
//   abans que el token expiri. Sempre renova en el moment just, independentment
//   dels reinicis del servei.
// ─────────────────────────────────────────────────────────────────────────────

const MARGE_RENOVACIO_MS = 10 * 60 * 1000; // Renova quan quedin 10 min per expirar
const MIN_INTERVAL_MS    =  5 * 60 * 1000; // Mai programar per menys de 5 min

let renovacioTimeout: NodeJS.Timeout | null = null;
let properaRenovacioAt: Date | null = null;

function properaRenovacioISO(): string | null {
  return properaRenovacioAt ? properaRenovacioAt.toISOString() : null;
}

async function planificaRenovacio(): Promise<void> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) return;

  if (renovacioTimeout) { clearTimeout(renovacioTimeout); renovacioTimeout = null; }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
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
      await renovaTokenProactivament();
      // Reprogramem per a la propera expiració
      await planificaRenovacio();
    }, msFinsTrigger);

  } catch (err) {
    console.error("❌ Error planificant renovació token:", err instanceof Error ? err.message : err);
    // Fallback: reintenta en 5 min si hi ha error de xarxa o Supabase
    renovacioTimeout = setTimeout(planificaRenovacio, MIN_INTERVAL_MS);
    properaRenovacioAt = new Date(Date.now() + MIN_INTERVAL_MS);
  }
}

async function renovaTokenProactivament(): Promise<void> {
  const supabaseUrl  = process.env.SUPABASE_URL;
  const supabaseKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const clientId     = process.env.APS_CLIENT_ID;
  const clientSecret = process.env.APS_CLIENT_SECRET;
  if (!supabaseUrl || !supabaseKey || !clientId || !clientSecret) return;
  try {
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    // Forcem la renovació ignorant el marge intern de obteToken3Legged:
    // esborrem expires_at per fer-lo creure que el token ha expirat.
    await supabase.from("aps_tokens").update({ expires_at: 0 }).eq("id", 1);
    await obteToken3Legged(supabase, clientId, clientSecret);
    console.log("🔄 Token APS renovat proactivament");
  } catch (err) {
    console.error("❌ Error renovació proactiva:", err instanceof Error ? err.message : err);
  }
}
