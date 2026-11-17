// api/aps-token.ts
//
// GET /api/aps-token[?fresh=1]
// Retorna un token APS (Autodesk) per al Viewer SDK del frontend. SUBSTITUEIX
// l'antic token-service de Render: el token es genera aquí mateix, signant un
// JWT amb la clau privada del bot (taulamaster_bot, Secure Service Account).
// No hi ha refresh token, ni /auth/login, ni servei que s'hagi de mantenir
// despert: una funció serverless arrenca en fraccions de segon.
//
// Autorització: Bearer <access_token de la sessió de Supabase> d'un usuari que
// tingui fila a user_profiles.
//
// Respostes d'error ({ error, code }, en català, pensades per mostrar-se tal qual):
//   UNAUTHORIZED 401 · FORBIDDEN 403 · CONFIG_ERROR 500
//   APS_REAUTH_REQUIRED 503 (Autodesk rebutja el bot: cal revisar clau/permisos)
//   APS_UPSTREAM_ERROR 502 (Autodesk no respon)
//
// Variables d'entorn (Vercel, només servidor): SUPABASE_SERVICE_ROLE_KEY,
//   APS_CLIENT_ID, APS_CLIENT_SECRET, APS_SSA_ID, APS_SSA_KEY_ID,
//   APS_SSA_PRIVATE_KEY (+ VITE_SUPABASE_URL, que ja hi és)
// ─────────────────────────────────────────────────────────────────────────────

import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  ApsReauthError,
  configSSA,
  invalidaCacheSSA,
  obteTokenSSA,
} from "../agents-independents/shared/ssa.js";
import { aplicaCors, json } from "./_lib/http.js";
import { creaSupabaseAdmin } from "./_lib/supabase.js";
import { autoritza } from "./_lib/auth.js";

// Mínim entre dos tokens forçats (?fresh=1), per no martellejar Autodesk
const MIN_FRESH_MS = 30_000;
let ultimFreshAt = 0;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (aplicaCors(req, res, "GET")) return;
  if (req.method !== "GET")
    return json(res, 405, { error: "Mètode no permès." });

  const supabase = creaSupabaseAdmin();
  const cfg = configSSA();
  if (!supabase || !cfg) {
    console.error(
      "❌ /api/aps-token: configuració incompleta (Supabase o bot SSA)",
    );
    return json(res, 500, {
      error: "El servei de tokens no està configurat correctament.",
      code: "CONFIG_ERROR",
    });
  }

  const auth = await autoritza(req, supabase, {
    nomesAdmin: false,
    errorForbidden: "El teu usuari no té accés als models 3D.",
  });
  if (!auth.ok) {
    return json(res, auth.status, { error: auth.error, code: auth.code });
  }

  try {
    // ?fresh=1: el client ha rebut un 401 d'Autodesk amb el token anterior.
    // Descartem la memòria cau (com a molt un cop cada MIN_FRESH_MS).
    if (req.query.fresh === "1" && Date.now() - ultimFreshAt > MIN_FRESH_MS) {
      ultimFreshAt = Date.now();
      invalidaCacheSSA();
    }
    const t = await obteTokenSSA(cfg);

    // «Control d'agents» mostra la caducitat del token a aps_tokens (fila id=1).
    // Només s'ACTUALITZA la fila existent; si falla no afecta la resposta.
    try {
      await supabase
        .from("aps_tokens")
        .update({ expires_at: Date.now() + t.expires_in * 1000 })
        .eq("id", 1);
    } catch {
      /* no és crític */
    }

    return json(res, 200, {
      access_token: t.access_token,
      expires_in: t.expires_in,
    });
  } catch (err) {
    if (err instanceof ApsReauthError) {
      console.error(
        "❌ /api/aps-token: bot rebutjat per Autodesk:",
        err.message,
      );
      return json(res, 503, {
        error:
          "Autodesk ha rebutjat el compte de servei. L'administrador ha de revisar el bot (clau i permisos).",
        code: err.code,
      });
    }
    console.error(
      "❌ /api/aps-token:",
      err instanceof Error ? err.message : err,
    );
    return json(res, 502, {
      error:
        "No s'ha pogut obtenir el token d'Autodesk. Torna-ho a provar d'aquí a una estona.",
      code: "APS_UPSTREAM_ERROR",
    });
  }
}
