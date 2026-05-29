// bim-sync/src/server.ts
// Agent BIM Sync USB — copia disciplines i puja MASTERs a ACC.
//
// Endpoints:
//   GET  /health      → estat de l'agent
//   GET  /wake        → keep-alive
//   POST /bim-sync    → inicia sincronització  [requereix Bearer]
//     body: { "opcio": "copiar-disciplines" | "pujar-masters" }
// ─────────────────────────────────────────────────────────────────────────────

import http from "http";
import WebSocket from "ws";
import { executaBimSync, BimSyncOpcio } from "../../shared/bim-sync-agent";
import { setCors, verificaAuth, llegeixBody } from "../../shared/helpers";

(globalThis as any).WebSocket = WebSocket;

const PORT         = process.env.PORT || 3003;
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
      service: "bim-sync",
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

  // ── POST /bim-sync ────────────────────────────────────────────────────────
  if (url.pathname === "/bim-sync" && req.method === "POST") {
    if (!verificaAuth(req, AGENT_SECRET)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "No autoritzat" }));
      return;
    }
    if (agentEnExecucio) {
      res.writeHead(409, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "L'agent BIM Sync ja s'està executant" }));
      return;
    }

    const body = await llegeixBody(req);
    const opcio: BimSyncOpcio = body.opcio ?? "pujar-masters";

    if (!["copiar-disciplines", "pujar-masters"].includes(opcio)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        error: `Opció invàlida: '${opcio}'. Usa 'copiar-disciplines' o 'pujar-masters'`,
      }));
      return;
    }

    res.writeHead(202, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "acceptat",
      opcio,
      missatge: `Agent BIM Sync iniciat (opcio: ${opcio}). Comprova els logs a Supabase bim_sync_log`,
    }));

    agentEnExecucio = true;
    executaBimSync(opcio)
      .then((r) => console.log(`✅ Agent BIM Sync (${opcio}) finalitzat:`, r))
      .catch((e) => console.error(`❌ Error Agent BIM Sync (${opcio}):`, e))
      .finally(() => { agentEnExecucio = false; });
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Ruta no trobada" }));
});

server.listen(PORT, () => {
  console.log(`\n🔁 Agent BIM Sync arrancant al port ${PORT}`);
  console.log(`   GET  /health     → estat`);
  console.log(`   GET  /wake       → keep-alive`);
  console.log(`   POST /bim-sync   → { "opcio": "copiar-disciplines" | "pujar-masters" }  [Bearer requerit]\n`);
});
