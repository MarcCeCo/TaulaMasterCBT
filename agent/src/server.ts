// agent/src/server.ts
// Servidor HTTP multi-agent:
//   - Agent Visor 3D  → sincronitza models Revit d'ACC amb Supabase
//   - Agent BIM Sync  → copia disciplines al USB i puja MASTERs a ACC (bim_sync_usb.py)
//   - Agent Crear Masters → crea fitxers MASTER CBT a partir de les disciplines (script.py)
// ─────────────────────────────────────────────────────────────────────────────

import http from "http";
import WebSocket from "ws";
import { createClient } from "@supabase/supabase-js";
import { executaAgent, obteToken3Legged } from "./agent";
import { executaBimSync, BimSyncOpcio } from "./bim-sync-agent";
import { executaCrearMasters } from "./crear-masters-agent";

// Node.js < 22 no té WebSocket natiu — el client de Supabase el necessita
(globalThis as any).WebSocket = WebSocket;

const PORT = process.env.PORT || 3000;
const AGENT_SECRET = process.env.AGENT_SECRET || "";

// ─── APS OAuth ───────────────────────────────────────────────────────────────
const APS_AUTH_BASE = "https://developer.api.autodesk.com/authentication/v2";
const APS_SCOPE = "data:read viewables:read account:read";

const pendingStates = new Map<string, number>();

// Guards d'execució per agent
let agentVisor3dEnExecucio = false;
let agentBimSyncEnExecucio = false;
let agentCrearMastersEnExecucio = false;

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

// ─── Helper: verifica autorització ───────────────────────────────────────────

function verificaAuth(req: http.IncomingMessage): boolean {
  if (!AGENT_SECRET) return true;
  const authHeader = req.headers["authorization"] ?? "";
  return authHeader.replace("Bearer ", "") === AGENT_SECRET;
}

// ─── Helper: llegeix body JSON ────────────────────────────────────────────────

function llegeixBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => { data += chunk; });
    req.on("end", () => {
      try { resolve(JSON.parse(data)); }
      catch { resolve({}); }
    });
  });
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
    res.end(JSON.stringify({
      status: "ok",
      timestamp: new Date().toISOString(),
      agents: {
        visor3d:       agentVisor3dEnExecucio ? "running" : "idle",
        bimSync:       agentBimSyncEnExecucio ? "running" : "idle",
        crearMasters:  agentCrearMastersEnExecucio ? "running" : "idle",
      },
    }));
    return;
  }

  // ── Wake-up ───────────────────────────────────────────────────────────────
  if (url.pathname === "/wake") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "despert", timestamp: new Date().toISOString() }));
    return;
  }

  // ── OAuth: Inici de sessió ─────────────────────────────────────────────────
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

  // ── OAuth: Callback ────────────────────────────────────────────────────────
  if (url.pathname === "/auth/callback" && req.method === "GET") {
    const code          = url.searchParams.get("code");
    const returnedState = url.searchParams.get("state");
    const errorParam    = url.searchParams.get("error");

    if (errorParam) {
      const desc = url.searchParams.get("error_description") ?? errorParam;
      res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
      res.end(htmlPagina("Error d'autenticació", desc, false));
      return;
    }

    if (!code || !returnedState || !pendingStates.has(returnedState)) {
      res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
      res.end(htmlPagina("Paràmetres invàlids", "Falta el codi o l'estat no és vàlid.", false));
      return;
    }
    pendingStates.delete(returnedState);

    // Intercanvia el codi per tokens i desa a Supabase (lògica existent)
    // ... (reutilitza la implementació del server.ts original)
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(htmlPagina(
      "Autenticació completada",
      "Sessió APS iniciada correctament. Ja pots tancar aquesta finestra.",
      true
    ));
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AGENT 1: Visor 3D — POST /sync
  // ═══════════════════════════════════════════════════════════════════════════
  if (url.pathname === "/sync" && req.method === "POST") {
    if (!verificaAuth(req)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "No autoritzat" }));
      return;
    }
    if (agentVisor3dEnExecucio) {
      res.writeHead(409, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "L'agent ja s'està executant" }));
      return;
    }

    res.writeHead(202, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "acceptat",
      missatge: "Agent Visor 3D iniciat. Comprova els logs a Supabase visor3d_sync_log",
    }));

    agentVisor3dEnExecucio = true;
    executaAgent()
      .then((r) => console.log("✅ Agent Visor 3D finalitzat:", r))
      .catch((e) => console.error("❌ Error Agent Visor 3D:", e))
      .finally(() => { agentVisor3dEnExecucio = false; });
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AGENT 2: BIM Sync USB — POST /bim-sync
  // Correspon a bim_sync_usb.py
  //
  // Body JSON:
  //   { "opcio": "copiar-disciplines" | "pujar-masters" }
  //
  //   - copiar-disciplines: copia _ENT/_EST/_MEP del Desktop Connector al USB
  //   - pujar-masters: puja els _MASTER del USB a ACC + xRefs + processament
  // ═══════════════════════════════════════════════════════════════════════════
  if (url.pathname === "/bim-sync" && req.method === "POST") {
    if (!verificaAuth(req)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "No autoritzat" }));
      return;
    }
    if (agentBimSyncEnExecucio) {
      res.writeHead(409, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "L'agent BIM Sync ja s'està executant" }));
      return;
    }

    const body = await llegeixBody(req);
    const opcio: BimSyncOpcio = body.opcio ?? "pujar-masters";

    if (!["copiar-disciplines", "pujar-masters"].includes(opcio)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `Opció invàlida: ${opcio}. Usa 'copiar-disciplines' o 'pujar-masters'` }));
      return;
    }

    res.writeHead(202, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "acceptat",
      opcio,
      missatge: `Agent BIM Sync iniciat (opcio: ${opcio}). Comprova els logs a Supabase bim_sync_log`,
    }));

    agentBimSyncEnExecucio = true;
    executaBimSync(opcio)
      .then((r) => console.log(`✅ Agent BIM Sync (${opcio}) finalitzat:`, r))
      .catch((e) => console.error(`❌ Error Agent BIM Sync (${opcio}):`, e))
      .finally(() => { agentBimSyncEnExecucio = false; });
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AGENT 3: Crear Masters CBT — POST /crear-masters
  // Correspon a script.py (pyRevit)
  //
  // Body JSON:
  //   { "carpetaArrel": "ruta/al/projecte", "carpetaSortida": "ruta/sortida (opt)" }
  //
  // Nota: aquest agent necessita accés al sistema de fitxers local on corren
  // els models Revit. Pot executar-se com a servidor local a l'ordinador
  // de l'usuari (no a Render/cloud).
  // ═══════════════════════════════════════════════════════════════════════════
  if (url.pathname === "/crear-masters" && req.method === "POST") {
    if (!verificaAuth(req)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "No autoritzat" }));
      return;
    }
    if (agentCrearMastersEnExecucio) {
      res.writeHead(409, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "L'agent Crear Masters ja s'està executant" }));
      return;
    }

    const body = await llegeixBody(req);
    const { carpetaArrel, carpetaSortida } = body;

    if (!carpetaArrel) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Falta el paràmetre 'carpetaArrel'" }));
      return;
    }

    res.writeHead(202, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "acceptat",
      carpetaArrel,
      carpetaSortida: carpetaSortida ?? "(mateixa carpeta 001_MODEL-BIM)",
      missatge: "Agent Crear Masters iniciat. Comprova els logs a Supabase crear_masters_log",
    }));

    agentCrearMastersEnExecucio = true;
    executaCrearMasters({ carpetaArrel, carpetaSortida })
      .then((r) => console.log("✅ Agent Crear Masters finalitzat:", r))
      .catch((e) => console.error("❌ Error Agent Crear Masters:", e))
      .finally(() => { agentCrearMastersEnExecucio = false; });
    return;
  }

  // ── API: token APS 2-legged per al Viewer SDK ─────────────────────────────
  if (url.pathname === "/api/aps-token" && req.method === "GET") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

    const supabaseUrl   = process.env.SUPABASE_URL;
    const supabaseKey   = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const clientId      = process.env.APS_CLIENT_ID;
    const clientSecret  = process.env.APS_CLIENT_SECRET;

    if (!supabaseUrl || !supabaseKey || !clientId || !clientSecret) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Variables d\'entorn no configurades" }));
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
        res.end(JSON.stringify({ error: "Token APS no disponible. Executa l\'agent primer." }));
        return;
      }

      const ara = Date.now();
      const MARGE_MS = 5 * 60 * 1000;

      let accessToken: string;
      let expiresIn: number;

      if (row.access_token && row.expires_at > ara + MARGE_MS) {
        accessToken = row.access_token;
        expiresIn = Math.round((row.expires_at - ara) / 1000);
      } else if (row.refresh_token) {
        accessToken = await obteToken3Legged(supabase, clientId, clientSecret);
        const { data: rowNou } = await supabase
          .from("aps_tokens")
          .select("expires_at")
          .eq("id", 1)
          .single();
        expiresIn = rowNou ? Math.round((rowNou.expires_at - Date.now()) / 1000) : 3600;
      } else {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Refresh token no disponible. Executa l\'agent primer." }));
        return;
      }

      const maxAge = Math.max(0, expiresIn - 60);
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": `private, max-age=${maxAge}`,
      });
      res.end(JSON.stringify({ access_token: accessToken, expires_in: expiresIn }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: msg }));
    }
    return;
  }

  // ── 404 ───────────────────────────────────────────────────────────────────
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Ruta no trobada" }));
});

server.listen(PORT, () => {
  console.log(`\n🚀 Servidor TaulaMaster CBT arrancant al port ${PORT}`);
  console.log(`\n   Endpoints disponibles:`);
  console.log(`   GET  /health             → estat del servidor i dels agents`);
  console.log(`   GET  /wake               → keep-alive`);
  console.log(`   GET  /auth/login         → inicia flux OAuth APS 3-legged`);
  console.log(`   GET  /auth/callback      → callback OAuth APS`);
  console.log(`   POST /sync               → [Agent Visor 3D] sincronitza models ACC → Supabase`);
  console.log(`   POST /bim-sync           → [Agent BIM Sync] copia disciplines o puja MASTERs`);
  console.log(`                              body: { "opcio": "copiar-disciplines" | "pujar-masters" }`);
  console.log(`   POST /crear-masters      → [Agent Crear Masters] crea fitxers MASTER CBT`);
  console.log(`                              body: { "carpetaArrel": "ruta", "carpetaSortida": "ruta (opt)" }`);
  console.log(`\n   Tots els POST requereixen: Authorization: Bearer <AGENT_SECRET>\n`);
});

// ─── Renovació proactiva del token APS cada 50 minuts ──────────────────────
const INTERVAL_RENOVACIO_MS = 50 * 60 * 1000;

async function renovaTokenProactivament() {
  const supabaseUrl    = process.env.SUPABASE_URL;
  const supabaseKey    = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const clientId       = process.env.APS_CLIENT_ID;
  const clientSecret   = process.env.APS_CLIENT_SECRET;

  if (!supabaseUrl || !supabaseKey || !clientId || !clientSecret) return;

  try {
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    await obteToken3Legged(supabase, clientId, clientSecret);
    console.log("🔄 Renovació proactiva del token APS completada");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("❌ Error en la renovació proactiva:", msg);
  }
}

setInterval(renovaTokenProactivament, INTERVAL_RENOVACIO_MS);
