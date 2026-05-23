// agent/src/server.ts
// Servidor HTTP de l'agent Visor3D
// Autenticació APS 2-legged OAuth — sense tokens a Supabase ni flux OAuth web
// ─────────────────────────────────────────────────────────────────────────────

import http from "http";
import WebSocket from "ws";
import { createClient } from "@supabase/supabase-js";
import { executaAgent, obteToken2Legged } from "./agent";

(globalThis as any).WebSocket = WebSocket;

const PORT         = process.env.PORT || 3000;
const AGENT_SECRET = process.env.AGENT_SECRET || "";

let agentEnExecucio = false;

// ─── HTML helper ──────────────────────────────────────────────────────────────

function htmlPagina(titol: string, missatge: string, ok: boolean): string {
  const color = ok ? "#0099A8" : "#EF4444";
  return `<!DOCTYPE html>
<html lang="ca">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${titol} · TaulaMaster CBT</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; align-items: center;
           justify-content: center; min-height: 100vh; margin: 0;
           background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); }
    .card { background: white; border-radius: 20px; padding: 52px 48px;
            max-width: 500px; width: 90%; box-shadow: 0 8px 32px rgba(0,0,0,0.10); text-align: center; }
    h1 { color: ${color}; font-size: 1.4rem; margin: 0 0 12px; }
    p  { color: #64748b; line-height: 1.6; margin: 0; }
    .logo { font-size: 0.75rem; color: #94a3b8; margin-top: 32px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${titol}</h1>
    <p>${missatge}</p>
    <div class="logo">TaulaMaster CBT · Agent Autodesk Forma</div>
  </div>
</body>
</html>`;
}

// ─── Servidor ─────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");

  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

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

  // ── Sincronització (endpoint principal) ───────────────────────────────────
  // POST /sync   → executa l'agent
  if (url.pathname === "/sync" && req.method === "POST") {
    const token = (req.headers["authorization"] ?? "").replace("Bearer ", "");
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
      missatge: "Sincronització iniciada. Comprova els logs a visor3d_sync_log.",
    }));

    agentEnExecucio = true;
    executaAgent()
      .then(r  => console.log("✅ Agent finalitzat:", r))
      .catch(e => console.error("❌ Error a l'agent:", e))
      .finally(() => { agentEnExecucio = false; });
    return;
  }

  // ── Token APS 2-legged per al Viewer SDK ──────────────────────────────────
  // GET /api/aps-token
  // La plataforma web crida aquest endpoint per obtenir el token per mostrar
  // els models al Viewer d'Autodesk. Es genera un token nou (o es reutilitza
  // si s'usa cau a memòria) sense necessitat de Supabase.
  if (url.pathname === "/api/aps-token" && req.method === "GET") {
    try {
      const clientId     = process.env.APS_CLIENT_ID;
      const clientSecret = process.env.APS_CLIENT_SECRET;

      if (!clientId || !clientSecret) throw new Error("Falten APS_CLIENT_ID o APS_CLIENT_SECRET");

      const accessToken = await obteToken2Legged(clientId, clientSecret);

      res.writeHead(200, {
        "Content-Type":  "application/json",
        "Cache-Control": "private, max-age=3000", // 50 min de caché (token dura 60 min)
      });
      res.end(JSON.stringify({
        access_token: accessToken,
        expires_in:   3600,
        token_type:   "Bearer",
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("❌ Error retornant token APS:", msg);
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: msg }));
    }
    return;
  }

  // ── Diagnòstic: llista hubs i projectes ───────────────────────────────────
  // GET /debug/hubs
  // GET /debug/hubs?hub=ID   → mostra també els projectes del hub
  // Útil per trobar APS_HUB_ID i APS_PROJECT_ID correctes.
  // ELIMINA aquest endpoint un cop tinguis els IDs configurats.
  if (url.pathname === "/debug/hubs" && req.method === "GET") {
    const secret = (req.headers["authorization"] ?? "").replace("Bearer ", "");
    if (AGENT_SECRET && secret !== AGENT_SECRET) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "No autoritzat" }));
      return;
    }

    try {
      const clientId     = process.env.APS_CLIENT_ID!;
      const clientSecret = process.env.APS_CLIENT_SECRET!;
      const apsToken     = await obteToken2Legged(clientId, clientSecret);

      const hubsResp = await fetch("https://developer.api.autodesk.com/project/v1/hubs", {
        headers: { Authorization: `Bearer ${apsToken}` },
      });
      const hubsData = await hubsResp.json() as { data?: any[] };
      const hubs = (hubsData.data ?? []).map((h: any) => ({
        id:    h.id,
        nom:   h.attributes?.name,
        tipus: h.attributes?.extension?.type,
      }));

      let projectes: any[] = [];
      const hubId = url.searchParams.get("hub");
      if (hubId) {
        const projResp = await fetch(
          `https://developer.api.autodesk.com/project/v1/hubs/${hubId}/projects`,
          { headers: { Authorization: `Bearer ${apsToken}` } }
        );
        const projData = await projResp.json() as { data?: any[] };
        projectes = (projData.data ?? []).map((p: any) => ({ id: p.id, nom: p.attributes?.name }));
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        APS_HUB_ID_actual:     process.env.APS_HUB_ID,
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

  // ── Ruta no trobada ───────────────────────────────────────────────────────
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Ruta no trobada" }));
});

server.listen(PORT, () => {
  console.log(`🚀 Visor3D Agent · port ${PORT}`);
  console.log(`   GET  /health        → health check`);
  console.log(`   GET  /wake          → desperta el servei`);
  console.log(`   POST /sync          → executa la sincronització`);
  console.log(`   GET  /api/aps-token → token 2-legged per al Viewer`);
  console.log(`   GET  /debug/hubs    → diagnòstic: llista hubs i projectes`);
});
