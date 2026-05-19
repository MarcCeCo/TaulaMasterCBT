// src/server.ts
// Servidor HTTP mínim que escolta peticions del cron de Supabase
// ─────────────────────────────────────────────────────────────────────────────

import http from "http";
import { executaAgent } from "./agent";

const PORT = process.env.PORT || 3000;
const AGENT_SECRET = process.env.AGENT_SECRET || "";

let agentEnExecucio = false;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  // ── Health check (Render el necessita per saber que el servei és viu) ──────
  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", timestamp: new Date().toISOString() }));
    return;
  }

  // ── Endpoint principal de l'agent ─────────────────────────────────────────
  if (url.pathname === "/sync" && req.method === "POST") {
    // Verifica el secret per evitar crides no autoritzades
    const authHeader = req.headers["authorization"] ?? "";
    const token = authHeader.replace("Bearer ", "");

    if (AGENT_SECRET && token !== AGENT_SECRET) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "No autoritzat" }));
      return;
    }

    // Evita execucions simultànies
    if (agentEnExecucio) {
      res.writeHead(409, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "L'agent ja s'està executant" }));
      return;
    }

    // Respon immediatament (Render té timeout de 30s a free tier)
    res.writeHead(202, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "acceptat",
      missatge: "L'agent s'ha iniciat, comprova els logs a Supabase visor3d_sync_log",
    }));

    // Executa l'agent en segon pla
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

  // ── Endpoint de wake-up (per despertar el servei de Render) ───────────────
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
