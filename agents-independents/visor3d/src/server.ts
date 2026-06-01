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
// Bug fix: la versió anterior recalculava propDia1_06UTC() just després
// d'executar l'agent. En aquell instant "ara" coincideix amb l'objectiu i
// la funció retornava una data quasi immediata → bucle d'execucions.
//
// Solució: la data de la SEGÜENT execució es calcula ABANS d'executar l'agent
// i es passa explícitament a la crida recursiva d'iniciaScheduler().
// ─────────────────────────────────────────────────────────────────────────────

// Retorna el proper dia 1 a les 06:00 UTC que sigui > des + MIN_MS_MARGE.
// El paràmetre "des" permet calcular la data a partir d'un moment arbitrari
// (s'usa per calcular "el mes que ve" passant la data actual de l'objectiu).
function propDia1_06UTC(des: Date = new Date()): Date {
  const MIN_MS_MARGE = 60_000; // 1 minut — evita disparar de nou si el setTimeout arriba lleugerament tard
  const candidat = new Date(Date.UTC(
    des.getUTCFullYear(),
    des.getUTCMonth(),
    1,
    6, 0, 0, 0,
  ));
  if (candidat.getTime() <= des.getTime() + MIN_MS_MARGE) {
    candidat.setUTCMonth(candidat.getUTCMonth() + 1);
  }
  return candidat;
}

let schedulerTimeout: NodeJS.Timeout | null = null;

function iniciaScheduler(objectiu?: Date) {
  // Primera crida (en arrencar): calcula la propera data des d'ara.
  // Crides recursives: reben sempre la data del mes vinent ja calculada,
  // mai es recalcula des de "ara" perquè "ara" podria coincidir amb l'objectiu.
  const propExecucio = objectiu ?? propDia1_06UTC();
  const msRestants   = Math.max(propExecucio.getTime() - Date.now(), 1_000);
  const diesRestants = Math.round(msRestants / 86_400_000 * 10) / 10;

  console.log(`⏰ Scheduler: propera execució automàtica → ${propExecucio.toISOString()} (d'aquí ~${diesRestants} dies)`);

  if (schedulerTimeout) clearTimeout(schedulerTimeout);
  schedulerTimeout = setTimeout(async () => {
    console.log(`\n⏰ Scheduler: disparant execució automàtica (${new Date().toISOString()})...`);

    // Calculem la data del mes vinent ARA, quan "propExecucio" és el punt de referència,
    // no quan l'agent hagi acabat (podrien passar minuts i recalcular malament).
    const seguentExecucio = propDia1_06UTC(propExecucio);

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

    // Passa la data explícita del mes vinent — mai recalculem des de "ara"
    iniciaScheduler(seguentExecucio);
  }, msRestants);
}
