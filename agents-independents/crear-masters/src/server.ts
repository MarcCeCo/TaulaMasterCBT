// crear-masters/src/server.ts
// Agent Crear Masters CBT — detecta instal·lacions i crea fitxers MASTER .rvt.
// Nota: requereix accés al sistema de fitxers local (Revit/pyRevit).
//       Dissenyat per executar-se a l'ordinador de l'usuari, no a Render/cloud.
//
// Endpoints:
//   GET  /health           → estat de l'agent
//   GET  /wake             → keep-alive
//   POST /crear-masters    → inicia creació de MASTERs  [requereix Bearer]
//     body: { "carpetaArrel": "ruta", "carpetaSortida": "ruta (opcional)" }
// ─────────────────────────────────────────────────────────────────────────────

import http from "http";
import WebSocket from "ws";
import { executaCrearMasters } from "../../shared/crear-masters-agent";
import { setCors, verificaAuth, llegeixBody } from "../../shared/helpers";

(globalThis as any).WebSocket = WebSocket;

const PORT         = process.env.PORT || 3004;
const AGENT_SECRET = process.env.AGENT_SECRET || "";

let agentEnExecucio = false;

const server = http.createServer(async (req, res) => {
  setCors(res);
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  // ── Health ────────────────────────────────────────────────────────────────
  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "ok",
      service: "crear-masters",
      agent: agentEnExecucio ? "running" : "idle",
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

  // ── POST /crear-masters ───────────────────────────────────────────────────
  if (url.pathname === "/crear-masters" && req.method === "POST") {
    if (!verificaAuth(req, AGENT_SECRET)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "No autoritzat" }));
      return;
    }
    if (agentEnExecucio) {
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

    agentEnExecucio = true;
    executaCrearMasters({ carpetaArrel, carpetaSortida })
      .then((r) => console.log("✅ Agent Crear Masters finalitzat:", r))
      .catch((e) => console.error("❌ Error Agent Crear Masters:", e))
      .finally(() => { agentEnExecucio = false; });
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Ruta no trobada" }));
});

server.listen(PORT, () => {
  console.log(`\n🏗️  Agent Crear Masters arrancant al port ${PORT}`);
  console.log(`   GET  /health          → estat`);
  console.log(`   GET  /wake            → keep-alive`);
  console.log(`   POST /crear-masters   → { "carpetaArrel": "ruta" }  [Bearer requerit]\n`);
});
