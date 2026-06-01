// visor3d/src/server.ts
// Agent Visor 3D — sincronitza models Revit d'Autodesk Fusion Teams amb Supabase.
//
// Endpoints:
//   GET  /health   → estat del servei (usat pel keep-alive de GitHub Actions)
//   GET  /wake     → keep-alive explícit
//   POST /sync     → inicia sincronització ACC → Supabase  [requereix Bearer]
//
// Arquitectura de scheduling:
//   El servidor NO conté cap scheduler intern. L'execució periòdica (dia 1 de
//   cada mes a les 06:00 UTC) és responsabilitat exclusiva de GitHub Actions
//   (.github/workflows/sync-monthly.yml). Això evita que reinicis del servei
//   (Render free tier) puguin disparar execucions no desitjades.
// ─────────────────────────────────────────────────────────────────────────────

import http from "http";
import WebSocket from "ws";
import { executaAgent } from "../../shared/agent";
import { setCors, verificaAuth } from "../../shared/helpers";

(globalThis as any).WebSocket = WebSocket;

const PORT         = process.env.PORT || 3002;
const AGENT_SECRET = process.env.AGENT_SECRET || "";

let agentEnExecucio = false;

const server = http.createServer(async (req, res) => {
  setCors(res);
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  // ── GET /health ───────────────────────────────────────────────────────────
  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "ok",
      service: "visor3d",
      agent: agentEnExecucio ? "running" : "idle",
      scheduler: "github-actions",
      timestamp: new Date().toISOString(),
    }));
    return;
  }

  // ── GET /wake ─────────────────────────────────────────────────────────────
  if (url.pathname === "/wake") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "despert", timestamp: new Date().toISOString() }));
    return;
  }

  // ── POST /sync ────────────────────────────────────────────────────────────
  if (url.pathname === "/sync" && req.method === "POST") {
    if (!verificaAuth(req, AGENT_SECRET)) {
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
      missatge: "Agent Visor 3D iniciat. Comprova els logs a Supabase visor3d_sync_log",
    }));

    agentEnExecucio = true;
    executaAgent()
      .then((r)  => console.log("✅ Agent Visor 3D finalitzat:", r))
      .catch((e) => console.error("❌ Error Agent Visor 3D:", e))
      .finally(()  => { agentEnExecucio = false; });
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Ruta no trobada" }));
});

server.listen(PORT, () => {
  console.log(`\n🔄 Agent Visor 3D arrancant al port ${PORT}`);
  console.log(`   GET  /health   → estat del servei`);
  console.log(`   GET  /wake     → keep-alive`);
  console.log(`   POST /sync     → sincronitza ACC → Supabase  [Bearer requerit]`);
  console.log(`\n⏰ Scheduling: GitHub Actions sync-monthly.yml (dia 1 · 06:00 UTC)\n`);
});
