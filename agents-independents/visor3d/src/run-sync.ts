// visor3d/src/run-sync.ts
// Executa UNA vegada la sincronització Autodesk Forma/ACC → Supabase i acaba.
//
// Substitueix l'antic servei web de Render (visor3d/server.ts). L'executa GitHub
// Actions (.github/workflows/sync-monthly.yml) de dues maneres:
//   · cron mensual (dia 1 a les 06:00 UTC)
//   · workflow_dispatch, que dispara la funció de Vercel api/run-sync.ts quan un
//     administrador prem «Executar ara» a Control d'Agents.
//
// El resultat queda escrit a la taula visor3d_sync_log (la pantalla de Control
// d'Agents la llegeix). Codi de sortida ≠ 0 si hi ha hagut errors, perquè el job
// de GitHub quedi en vermell i en rebis l'avís.
//
// Variables d'entorn (GitHub Secrets):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   APS_CLIENT_ID, APS_CLIENT_SECRET
//   APS_SSA_ID, APS_SSA_KEY_ID, APS_SSA_PRIVATE_KEY     (bot taulamaster_bot)
//   APS_HUB_ID, APS_PROJECT_ID
// ─────────────────────────────────────────────────────────────────────────────

import WebSocket from "ws";
import { executaAgent } from "../../shared/agent";

// Node.js < 22 no té WebSocket natiu — el client de Supabase el necessita
Object.assign(globalThis, { WebSocket });

async function main(): Promise<void> {
  const resultat = await executaAgent();

  const nErrors = resultat.errors.length;
  console.log(
    `\n📊 Resum: ${resultat.installacionsCreades.length} creades · ` +
      `${resultat.installacionsActualitzades.length} actualitzades · ` +
      `${resultat.installacionsEliminades.length} eliminades · ` +
      `${resultat.installacionsSenseCanvis.length} sense canvis · ` +
      `${nErrors} error(s)`,
  );

  if (nErrors > 0) {
    console.error("❌ La sincronització ha acabat amb errors:");
    for (const e of resultat.errors) console.error(`   - ${e}`);
    process.exit(1);
  }
  console.log("✅ Sincronització completada");
}

main().catch((err) => {
  // Falta de configuració o error abans d'arrencar l'agent
  console.error("❌", err instanceof Error ? err.message : err);
  process.exit(1);
});
