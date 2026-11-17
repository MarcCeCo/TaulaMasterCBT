// api/run-sync.ts
//
// POST /api/run-sync   — ADMIN
// Dispara el workflow «Sincronització Mensual Visor 3D» de GitHub Actions
// (workflow_dispatch). És el que fa el botó «Executar ara» de Control d'Agents.
// La sincronització en si s'executa a GitHub (agents-independents/visor3d/src/
// run-sync.ts); aquesta funció només comprova que qui ho demana és admin i
// avisa GitHub. El resultat el llegeix el frontend de visor3d_sync_log.
//
// Variables d'entorn (Vercel, només servidor):
//   GITHUB_DISPATCH_TOKEN  Fine-grained PAT del repo amb «Actions: Read and write»
//   GITHUB_REPO            "propietari/repo" (opcional si Vercel està connectat
//                          a Git: es dedueix de VERCEL_GIT_REPO_OWNER/SLUG)
//   GITHUB_WORKFLOW_FILE   opcional, per defecte sync-monthly.yml
//   GITHUB_REF             opcional, branca on s'executa el workflow (per defecte
//                          la branca del desplegament: VERCEL_GIT_COMMIT_REF, o main)
// ─────────────────────────────────────────────────────────────────────────────

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { aplicaCors, json, superaLimit } from "./_lib/http.js";
import { creaSupabaseAdmin } from "./_lib/supabase.js";
import { autoritza } from "./_lib/auth.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (aplicaCors(req, res, "POST")) return;
  if (req.method !== "POST")
    return json(res, 405, { error: "Mètode no permès." });

  const supabase = creaSupabaseAdmin();
  const pat = process.env.GITHUB_DISPATCH_TOKEN?.trim();
  const repo =
    process.env.GITHUB_REPO?.trim() ||
    (process.env.VERCEL_GIT_REPO_OWNER && process.env.VERCEL_GIT_REPO_SLUG
      ? `${process.env.VERCEL_GIT_REPO_OWNER}/${process.env.VERCEL_GIT_REPO_SLUG}`
      : "");
  const workflow =
    process.env.GITHUB_WORKFLOW_FILE?.trim() || "sync-monthly.yml";
  const ref =
    process.env.GITHUB_REF?.trim() ||
    process.env.VERCEL_GIT_COMMIT_REF?.trim() ||
    "main";

  if (!supabase || !pat || !repo) {
    console.error(
      "❌ /api/run-sync: falta configuració (Supabase, GITHUB_DISPATCH_TOKEN o GITHUB_REPO)",
    );
    return json(res, 500, {
      error:
        "L'execució manual no està configurada. Avisa l'administrador (falta el token de GitHub).",
      code: "CONFIG_ERROR",
    });
  }

  const auth = await autoritza(req, supabase, {
    nomesAdmin: true,
    errorForbidden: "Només els administradors poden executar l'agent.",
  });
  if (!auth.ok) {
    return json(res, auth.status, { error: auth.error, code: auth.code });
  }

  // Evita ràfegues de clics (cada execució és un job de GitHub)
  if (superaLimit(`run-sync:${auth.userId}`, 3, 60_000)) {
    return json(res, 429, { error: "Massa peticions. Espera un moment." });
  }

  try {
    const resp = await fetch(
      `https://api.github.com/repos/${repo}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`,
      {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${pat}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
          "User-Agent": "taulamaster-cbt",
        },
        body: JSON.stringify({ ref }),
        signal: AbortSignal.timeout(15_000),
      },
    );

    if (resp.status === 204) {
      console.log(
        `▶️  Sincronització llançada per ${auth.email} (${repo}@${ref})`,
      );
      return json(res, 202, {
        status: "acceptat",
        missatge:
          "Sincronització encuada a GitHub Actions. Comprova els resultats a visor3d_sync_log.",
      });
    }

    // Detall NOMÉS als logs del servidor: no es filtra cap pista a l'usuari
    const detall = await resp.text().catch(() => "");
    console.error(`❌ GitHub dispatch ${resp.status}: ${detall.slice(0, 500)}`);
    // Només l'executen administradors: mostrem el codi de GitHub per poder
    // diagnosticar-ho sense haver d'anar als logs de Vercel.
    return json(res, 502, {
      error:
        resp.status === 401 || resp.status === 403 || resp.status === 404
          ? `GitHub ha rebutjat la petició (${resp.status}). L'administrador ha de revisar el token i el nom del repositori (${repo}).`
          : resp.status === 422
            ? `GitHub no troba el workflow «${workflow}» a la branca «${ref}» (o no té workflow_dispatch). Comprova que existeix en aquesta branca.`
            : `No s'ha pogut llançar la sincronització a GitHub (${resp.status}). Torna-ho a provar.`,
      code: "GITHUB_ERROR",
    });
  } catch (err) {
    console.error(
      "❌ /api/run-sync:",
      err instanceof Error ? err.message : err,
    );
    return json(res, 502, {
      error: "No s'ha pogut contactar amb GitHub. Torna-ho a provar.",
      code: "GITHUB_ERROR",
    });
  }
}
