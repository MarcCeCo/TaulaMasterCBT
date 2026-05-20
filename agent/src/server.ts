// src/server.ts
// Servidor HTTP que escolta peticions del cron de Supabase
// i gestiona el flux OAuth 3-legged d'Autodesk via web
// ─────────────────────────────────────────────────────────────────────────────

import http from "http";
import WebSocket from "ws";
import { createClient } from "@supabase/supabase-js";
import { executaAgent } from "./agent";

// Node.js < 22 no té WebSocket natiu — el client de Supabase el necessita
(globalThis as any).WebSocket = WebSocket;

const PORT = process.env.PORT || 3000;
const AGENT_SECRET = process.env.AGENT_SECRET || "";

// ─── APS OAuth ───────────────────────────────────────────────────────────────
const APS_AUTH_BASE = "https://developer.api.autodesk.com/authentication/v2";
const APS_SCOPE = "data:read viewables:read account:read";

// State temporal en memòria (valid mentre el servidor és viu)
// Clau: state string  →  Valor: timestamp de creació (per expirar-los)
const pendingStates = new Map<string, number>();

let agentEnExecucio = false;

// ─── Helpers HTML ─────────────────────────────────────────────────────────────

function htmlPagina(titol: string, missatge: string, ok: boolean): string {
  const color = ok ? "#0099A8" : "#EF4444";
  const icon  = ok ? "✅" : "❌";
  return `<!DOCTYPE html>
<html lang="ca">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${titol} · TaulaMaster CBT</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh; margin: 0;
      background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
    }
    .card {
      background: white; border-radius: 20px; padding: 52px 48px;
      max-width: 500px; width: 90%;
      box-shadow: 0 8px 32px rgba(0,0,0,0.10);
      text-align: center;
    }
    .icon { font-size: 3rem; margin-bottom: 16px; }
    h1 { color: ${color}; font-size: 1.4rem; margin: 0 0 12px; }
    p  { color: #64748b; line-height: 1.6; margin: 0 0 24px; }
    .logo { font-size: 0.75rem; color: #94a3b8; margin-top: 32px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${icon}</div>
    <h1>${titol}</h1>
    <p>${missatge}</p>
    <div class="logo">TaulaMaster CBT · Agent Autodesk</div>
  </div>
</body>
</html>`;
}

// ─── Servidor ─────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  // ── CORS ──────────────────────────────────────────────────────────────────
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  // ── Health check ──────────────────────────────────────────────────────────
  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", timestamp: new Date().toISOString() }));
    return;
  }

  // ── Wake-up ───────────────────────────────────────────────────────────────
  if (url.pathname === "/wake") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "despert", timestamp: new Date().toISOString() }));
    return;
  }

  // ── OAuth: Inici de sessió ─────────────────────────────────────────────────
  // GET /auth/login
  // Redirigeix a la pàgina de login d'Autodesk
  if (url.pathname === "/auth/login" && req.method === "GET") {
    const clientId    = process.env.APS_CLIENT_ID;
    const callbackUrl = process.env.APS_CALLBACK_URL;

    if (!clientId || !callbackUrl) {
      res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
      res.end(htmlPagina(
        "Configuració incompleta",
        "Les variables APS_CLIENT_ID o APS_CALLBACK_URL no estan definides al servidor.",
        false
      ));
      return;
    }

    // Genera un state únic per prevenir CSRF
    const state = Math.random().toString(36).substring(2) + Date.now().toString(36);
    pendingStates.set(state, Date.now());

    // Neteja states antics (> 10 min)
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

    console.log(`🔐 Iniciant flux OAuth → ${authUrl.toString()}`);

    res.writeHead(302, { Location: authUrl.toString() });
    res.end();
    return;
  }

  // ── OAuth: Callback ────────────────────────────────────────────────────────
  // GET /auth/callback
  // Autodesk redirigeix aquí després del login
  if (url.pathname === "/auth/callback" && req.method === "GET") {
    const code          = url.searchParams.get("code");
    const returnedState = url.searchParams.get("state");
    const errorParam    = url.searchParams.get("error");

    // Error retornat per Autodesk
    if (errorParam) {
      const desc = url.searchParams.get("error_description") ?? errorParam;
      console.error("❌ Error OAuth d'Autodesk:", desc);
      res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
      res.end(htmlPagina("Error d'autorització", `Autodesk ha retornat un error: ${desc}`, false));
      return;
    }

    // Valida state (anti-CSRF)
    if (!returnedState || !pendingStates.has(returnedState)) {
      console.error("❌ State invàlid o expirat:", returnedState);
      res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
      res.end(htmlPagina(
        "Sessió invàlida o expirada",
        "El state de la petició no és vàlid o ha expirat (màx. 10 min). Torna a intentar-ho des de /auth/login.",
        false
      ));
      return;
    }
    pendingStates.delete(returnedState);

    if (!code) {
      res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
      res.end(htmlPagina("Error", "No s'ha rebut cap codi d'autorització.", false));
      return;
    }

    const clientId     = process.env.APS_CLIENT_ID;
    const clientSecret = process.env.APS_CLIENT_SECRET;
    const callbackUrl  = process.env.APS_CALLBACK_URL;
    const supabaseUrl  = process.env.SUPABASE_URL;
    const supabaseKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!clientId || !clientSecret || !callbackUrl || !supabaseUrl || !supabaseKey) {
      res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
      res.end(htmlPagina("Error de configuració", "Falten variables d'entorn al servidor.", false));
      return;
    }

    try {
      // Intercanvia code → tokens
      console.log("🔄 Intercanviant codi d'autorització per tokens...");

      const body = new URLSearchParams({
        grant_type:   "authorization_code",
        code,
        redirect_uri: callbackUrl,
      });

      const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

      const tokenResp = await fetch(`${APS_AUTH_BASE}/token`, {
        method: "POST",
        headers: {
          "Content-Type":  "application/x-www-form-urlencoded",
          Authorization: `Basic ${credentials}`,
        },
        body: body.toString(),
      });

      if (!tokenResp.ok) {
        const text = await tokenResp.text();
        throw new Error(`Token exchange error ${tokenResp.status}: ${text}`);
      }

      const tokenData = await tokenResp.json() as {
        access_token:  string;
        refresh_token: string;
        expires_in:    number;
      };

      const expiresAt = Date.now() + tokenData.expires_in * 1000;

      // Guarda a Supabase
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { error: dbError } = await supabase
        .from("aps_tokens")
        .upsert(
          {
            id:            1,
            access_token:  tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            expires_at:    expiresAt,
            updated_at:    new Date().toISOString(),
          },
          { onConflict: "id" }
        );

      if (dbError) throw new Error(`Error guardant a Supabase: ${dbError.message}`);

      console.log("✅ Token guardat a Supabase correctament!");
      console.log(`   Access token:  ${tokenData.access_token.substring(0, 20)}...`);
      console.log(`   Refresh token: ${tokenData.refresh_token.substring(0, 20)}...`);
      console.log(`   Expires in:    ${tokenData.expires_in}s`);

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(htmlPagina(
        "Autenticació completada",
        "El token s'ha guardat correctament a Supabase. L'agent ja pot sincronitzar els models d'Autodesk. Pots tancar aquesta finestra.",
        true
      ));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("❌ Error al callback OAuth:", msg);
      res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
      res.end(htmlPagina("Error intern", msg, false));
    }

    return;
  }

  // ── Endpoint principal de l'agent ─────────────────────────────────────────
  if (url.pathname === "/sync" && req.method === "POST") {
    const authHeader = req.headers["authorization"] ?? "";
    const token = authHeader.replace("Bearer ", "");

    if (AGENT_SECRET && token !== AGENT_SECRET) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "No autoritzat" }));
      return;
    }

    if (agentEnExecucio) {
      res.writeHead(409, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "L'agent ja s'està executant" }));
      return;
    }

    res.writeHead(202, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "acceptat",
      missatge: "L'agent s'ha iniciat, comprova els logs a Supabase visor3d_sync_log",
    }));

    agentEnExecucio = true;
    executaAgent()
      .then((resultat) => {
        console.log("✅ Agent finalitzat correctament:", resultat);
      })
      .catch((err) => {
        console.error("❌ Error a l'agent:", err);
      })
      .finally(() => {
        agentEnExecucio = false;
      });

    return;
  }

  // ── Diagnòstic: llista hubs i projectes ──────────────────────────────────
  // GET /debug/hubs          → llista tots els hubs accessibles
  // GET /debug/projects?hub=ID → llista projectes d'un hub
  // TEMPORAL: elimina aquest endpoint un cop tinguis els IDs correctes
  if (url.pathname === "/debug/hubs" && req.method === "GET") {
    const authHeader = req.headers["authorization"] ?? "";
    const secret = authHeader.replace("Bearer ", "");
    if (AGENT_SECRET && secret !== AGENT_SECRET) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "No autoritzat" }));
      return;
    }
    try {
      const supabaseUrl = process.env.SUPABASE_URL!;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
      const supabase = createClient(supabaseUrl, supabaseKey, {
        global: { headers: {} },
        realtime: { transport: WebSocket as any },
      });
      const { data: tokenRow } = await supabase
        .from("aps_tokens").select("access_token").eq("id", 1).single();
      const apsToken = (tokenRow as any)?.access_token;
      if (!apsToken) throw new Error("No hi ha token APS a Supabase");

      const hubsResp = await fetch(
        "https://developer.api.autodesk.com/project/v1/hubs",
        { headers: { Authorization: `Bearer ${apsToken}` } }
      );
      const hubsData = await hubsResp.json() as { data?: any[] };
      const hubs = (hubsData.data ?? []).map((h: any) => ({
        id: h.id,
        nom: h.attributes?.name,
        tipus: h.attributes?.extension?.type,
      }));

      // Si demanen projectes d'un hub concret
      const hubId = url.searchParams.get("hub");
      let projectes: any[] = [];
      if (hubId) {
        const projResp = await fetch(
          `https://developer.api.autodesk.com/project/v1/hubs/${hubId}/projects`,
          { headers: { Authorization: `Bearer ${apsToken}` } }
        );
        const projData = await projResp.json() as { data?: any[] };
        projectes = (projData.data ?? []).map((p: any) => ({
          id: p.id,
          nom: p.attributes?.name,
        }));
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        APS_HUB_ID_actual: process.env.APS_HUB_ID,
        APS_PROJECT_ID_actual: process.env.APS_PROJECT_ID,
        hubs,
        projectes: hubId ? projectes : "(afegeix ?hub=ID per veure els projectes)",
      }, null, 2));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: msg }));
    }
    return;
  }

  // ── APS Token 3-legged per al Viewer SDK ─────────────────────────────────
  // GET /api/aps-token
  // Retorna el token 3-legged desat a Supabase (aps_tokens).
  // Si ha caducat o caduca en menys de 5 min, el refresca automàticament
  // amb el refresh_token abans de retornar-lo.
  // Requereix haver fet /auth/login prèviament per tenir el token a Supabase.
  if (url.pathname === "/api/aps-token" && req.method === "GET") {
    try {
      const clientId     = process.env.APS_CLIENT_ID;
      const clientSecret = process.env.APS_CLIENT_SECRET;
      const supabaseUrl  = process.env.SUPABASE_URL;
      const supabaseKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (!clientId || !clientSecret || !supabaseUrl || !supabaseKey) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Variables d'entorn APS o Supabase no configurades" }));
        return;
      }

      const supabase = createClient(supabaseUrl, supabaseKey, {
        global: { headers: {} },
        realtime: { transport: WebSocket as any },
      });

      // Llegeix el token desat a Supabase
      const { data: tokenRow, error: dbError } = await supabase
        .from("aps_tokens")
        .select("access_token, refresh_token, expires_at")
        .eq("id", 1)
        .single();

      if (dbError || !tokenRow) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          error: "No hi ha token APS a Supabase. Cal fer /auth/login primer.",
          auth_url: `${process.env.APS_CALLBACK_URL?.replace("/auth/callback", "") ?? ""}/auth/login`,
        }));
        return;
      }

      const row = tokenRow as {
        access_token: string;
        refresh_token: string;
        expires_at: number;
      };

      const ara = Date.now();
      const margeMs = 5 * 60 * 1000; // refresca si caduca en menys de 5 min
      let accessToken  = row.access_token;
      let expiresIn    = Math.max(0, Math.floor((row.expires_at - ara) / 1000));

      // Si caduca aviat, refresca
      if (row.expires_at - ara < margeMs) {
        console.log("🔄 Token APS caducat o a punt de caducar — refrescant...");

        const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
        const refreshBody = new URLSearchParams({
          grant_type:    "refresh_token",
          refresh_token: row.refresh_token,
          scope:         "data:read viewables:read account:read",
        });

        const refreshResp = await fetch(`${APS_AUTH_BASE}/token`, {
          method:  "POST",
          headers: {
            "Content-Type":  "application/x-www-form-urlencoded",
            Authorization: `Basic ${credentials}`,
          },
          body: refreshBody.toString(),
        });

        if (!refreshResp.ok) {
          const errText = await refreshResp.text();
          console.error("❌ Error refrescant token APS:", errText);
          // Si el refresh falla, retorna error i demana re-login
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            error: "Token APS caducat i no s'ha pogut refrascar. Cal fer /auth/login de nou.",
            auth_url: `${process.env.APS_CALLBACK_URL?.replace("/auth/callback", "") ?? ""}/auth/login`,
          }));
          return;
        }

        const refreshData = await refreshResp.json() as {
          access_token:  string;
          refresh_token: string;
          expires_in:    number;
        };

        const newExpiresAt = Date.now() + refreshData.expires_in * 1000;

        // Guarda els nous tokens a Supabase
        await supabase.from("aps_tokens").upsert(
          {
            id:            1,
            access_token:  refreshData.access_token,
            refresh_token: refreshData.refresh_token,
            expires_at:    newExpiresAt,
            updated_at:    new Date().toISOString(),
          },
          { onConflict: "id" }
        );

        accessToken = refreshData.access_token;
        expiresIn   = refreshData.expires_in;
        console.log("✅ Token APS refrestat correctament.");
      }

      res.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": `private, max-age=${Math.max(0, expiresIn - 60)}`,
      });
      res.end(JSON.stringify({
        access_token: accessToken,
        expires_in:   expiresIn,
        token_type:   "Bearer",
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: msg }));
    }
    return;
  }

  // ── Ruta no trobada ───────────────────────────────────────────────────────
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Ruta no trobada" }));
});

server.listen(PORT, () => {
  console.log(`🚀 Servidor Visor3D Agent escoltant al port ${PORT}`);
  console.log(`📡 Endpoints disponibles:`);
  console.log(`   GET  /health        → health check`);
  console.log(`   GET  /wake          → desperta el servei`);
  console.log(`   GET  /auth/login    → inicia flux OAuth Autodesk`);
  console.log(`   GET  /auth/callback → callback OAuth (configura a APS_CALLBACK_URL)`);
  console.log(`   POST /sync          → executa l'agent (requereix Authorization: Bearer <secret>)`);
  console.log(`   GET  /api/aps-token → token 2-legged per al Viewer SDK (viewables:read)`);
});
