// api/public/visor.ts
//
// POST /api/public/visor   Body { token, refresh? }   — PÚBLIC (sense sessió)
//   → { installacio, urn, access_token, expires_in, expires_at }
//
// Permet a persones EXTERNES veure en només lectura el model MASTER d'una
// instal·lació a través d'un enllaç. Substitueix l'antic endpoint del
// token-service de Render. Vegeu api/_lib/publicLinks.ts per a la seguretat.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ApsReauthError, configSSA, obteTokenSSA } from "../_lib/ssa.js";
import { aplicaCors, ipDe, json, superaLimit } from "../_lib/http.js";
import { creaSupabaseAdmin } from "../_lib/supabase.js";
import {
  FORMAT_TOKEN,
  SCOPE_PUBLIC,
  cosObjecte,
  sha256,
} from "../_lib/publicLinks.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (aplicaCors(req, res, "POST")) return;
  if (req.method !== "POST")
    return json(res, 405, { error: "Mètode no permès." });

  const supabase = creaSupabaseAdmin();
  if (!supabase) {
    return json(res, 500, {
      error: "El servei no està configurat correctament.",
      code: "CONFIG_ERROR",
    });
  }

  try {
    const ip = ipDe(req);
    if (superaLimit(`pub:${ip}`, 120)) {
      return json(res, 429, { error: "Massa peticions. Espera un moment." });
    }

    const body = cosObjecte(req.body);
    const token = typeof body.token === "string" ? body.token : "";
    const esRenovacio = body.refresh === true;

    // Format invàlid o token desconegut: mateixa resposta i comptador d'intents fallits
    const noValid = () =>
      superaLimit(`fail:${ip}`, 15)
        ? json(res, 429, { error: "Massa intents. Espera un moment." })
        : json(res, 404, {
            error: "Aquest enllaç no és vàlid.",
            code: "LINK_INVALID",
          });
    if (!FORMAT_TOKEN.test(token)) return noValid();

    const { data: enllac, error } = await supabase
      .from("visor_public_links")
      .select("id, installacio_id, expires_at, revoked_at, access_count")
      .eq("token_hash", sha256(token))
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!enllac) return noValid();

    const caducat =
      !!enllac.expires_at &&
      new Date(enllac.expires_at).getTime() <= Date.now();
    if (enllac.revoked_at || caducat) {
      return json(res, 410, {
        error: "Aquest enllaç ha caducat o ha estat revocat.",
        code: "LINK_EXPIRED",
      });
    }

    // Cal el bot: només així es pot emetre un token de només lectura
    const cfg = configSSA();
    if (!cfg) {
      console.error("❌ /api/public/visor: falta la configuració del bot SSA");
      return json(res, 503, {
        error: "El visor públic no està disponible ara mateix.",
        code: "PUBLIC_UNAVAILABLE",
      });
    }

    const { data: inst } = await supabase
      .from("visor3d_installacions")
      .select("nom, codi_installacio, urn_master")
      .eq("id", enllac.installacio_id)
      .maybeSingle();
    const urn = String(inst?.urn_master ?? "")
      .split(",")[0]
      .trim();
    if (!inst || !urn) {
      return json(res, 404, {
        error: "El model d'aquest enllaç ja no està disponible.",
        code: "MODEL_UNAVAILABLE",
      });
    }

    let aps;
    try {
      aps = await obteTokenSSA(cfg, SCOPE_PUBLIC);
    } catch (err) {
      console.error(
        "❌ token públic:",
        err instanceof Error ? err.message : err,
        err instanceof ApsReauthError ? "(cal revisar el bot)" : "",
      );
      return json(res, 502, {
        error:
          "No s'ha pogut connectar amb el servei de models. Torna-ho a provar.",
        code: "APS_UPSTREAM_ERROR",
      });
    }

    // Estadístiques d'ús (només a la càrrega inicial, no a les renovacions de
    // token). S'espera el resultat: en serverless no es poden deixar tasques
    // pendents un cop enviada la resposta.
    if (!esRenovacio) {
      await supabase
        .from("visor_public_links")
        .update({
          last_access_at: new Date().toISOString(),
          access_count: (enllac.access_count ?? 0) + 1,
        })
        .eq("id", enllac.id);
    }

    return json(res, 200, {
      installacio: { nom: inst.nom, codi: inst.codi_installacio ?? "" },
      urn,
      access_token: aps.access_token,
      expires_in: aps.expires_in,
      expires_at: enllac.expires_at,
    });
  } catch (err) {
    console.error(
      "❌ /api/public/visor:",
      err instanceof Error ? err.message : err,
    );
    return json(res, 500, { error: "Error intern. Torna-ho a provar." });
  }
}
