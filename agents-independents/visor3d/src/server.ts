// visor3d/src/server.ts
// Agent Visor 3D — sincronitza models Revit d'ACC amb Supabase.
//
// Endpoints:
//   GET  /health       → estat de l'agent
//   GET  /wake         → keep-alive
//   POST /sync         → inicia sincronització ACC → Supabase  [requereix Bearer]
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

  // ── Health ────────────────────────────────────────────────────────────────
  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "ok",
      service: "visor3d",
      agent: agentEnExecucio ? "running" : "idle",
      scheduler: "actiu",
      propera_execucio: propDia1_06UTC().toISOString(),
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
      .then((r) => console.log("✅ Agent Visor 3D finalitzat:", r))
      .catch((e) => console.error("❌ Error Agent Visor 3D:", e))
      .finally(() => { agentEnExecucio = false; });
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Ruta no trobada" }));
});

server.listen(PORT, () => {
  console.log(`\n🔄 Agent Visor 3D arrancant al port ${PORT}`);
  console.log(`   GET  /health   → estat`);
  console.log(`   GET  /wake     → keep-alive`);
  console.log(`   POST /sync     → sincronitza ACC → Supabase  [Bearer requerit]\n`);
  iniciaScheduler();
});

// ─── Scheduler intern: executa l'agent el dia 1 de cada mes a les 06:00 UTC ──
//
// Com funciona:
//   1. En arrencar el servidor, calcula quants ms falten per al proper dia 1 a les 06:00 UTC.
//   2. Registra un setTimeout per a aquell moment.
//   3. Quan dispara, executa l'agent i programa el següent setTimeout (per al mes vinent).
//
// D'aquesta manera el servidor és autònom i no depèn de cap cron extern (Render, Supabase...).
// ─────────────────────────────────────────────────────────────────────────────────────────────

function propDia1_06UTC(): Date {
  const ara = new Date();
  // Primer candidat: aquest mes
  const candidat = new Date(Date.UTC(
    ara.getUTCFullYear(),
    ara.getUTCMonth(),
    1,
    6, 0, 0, 0,
  ));
  // Si ja hem passat (o estem exactament), passa al mes vinent
  if (candidat.getTime() <= ara.getTime()) {
    candidat.setUTCMonth(candidat.getUTCMonth() + 1);
  }
  return candidat;
}

let schedulerTimeout: NodeJS.Timeout | null = null;

function iniciaScheduler() {
  const propExecucio = propDia1_06UTC();
  const msRestants   = propExecucio.getTime() - Date.now();
  const diesRestants = Math.round(msRestants / 86_400_000 * 10) / 10;

  console.log(`⏰ Scheduler: propera execució automàtica → ${propExecucio.toISOString()} (d'aquí ~${diesRestants} dies)`);

  if (schedulerTimeout) clearTimeout(schedulerTimeout);
  schedulerTimeout = setTimeout(async () => {
    console.log(`\n⏰ Scheduler: disparant execució automàtica (${new Date().toISOString()})...`);
    if (agentEnExecucio) {
      console.warn("⚠️  Scheduler: l'agent ja s'estava executant, s'omet aquesta execució.");
    } else {
      agentEnExecucio = true;
      try {
        const r = await executaAgent();
        console.log("✅ Scheduler: execució finalitzada:", r);
      } catch (e) {
        console.error("❌ Scheduler: error en l'execució:", e);
      } finally {
        agentEnExecucio = false;
      }
    }
    // Programa el mes vinent
    iniciaScheduler();
  }, msRestants);
}
