// src/server.ts
// Servidor HTTP mínim que escolta peticions del cron de Supabase
// ─────────────────────────────────────────────────────────────────────────────

import http from "http";
import { executaAgent } from "./agent";

const PORT = process.env.PORT || 3000;
const AGENT_SECRET = process.env.AGENT_SECRET || "";

let agentEnExecucio = false;

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

  // ── Wake-up ───────────────────────────────────────────────────────────────
  if (url.pathname === "/wake") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "despert", timestamp: new Date().toISOString() }));
    return;
  }

  // ── Ruta no trobada ───────────────────────────────────────────────────────
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Ruta no trobada" }));
});

server.listen(PORT, () => {
  console.log(`🚀 Servidor Visor3D Agent escoltant al port ${PORT}`);
  console.log(`📡 Endpoints disponibles:`);
  console.log(`   GET  /health  → health check`);
  console.log(`   GET  /wake    → desperta el servei`);
  console.log(`   POST /sync    → executa l'agent (requereix Authorization: Bearer <secret>)`);
});
