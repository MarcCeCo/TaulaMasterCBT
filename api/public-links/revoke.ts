// api/public-links/revoke.ts
//
// POST /api/public-links/revoke   Body { id }   — ADMIN
// Revoca un enllaç públic: n'esborra la fila de visor_public_links, així que
// deixa de funcionar immediatament i desapareix de la llista.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { aplicaCors, json } from "../_lib/http.js";
import { creaSupabaseAdmin } from "../_lib/supabase.js";
import { autoritza } from "../_lib/auth.js";
import { cosObjecte } from "../_lib/publicLinks.js";

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

  const auth = await autoritza(req, supabase, {
    nomesAdmin: true,
    errorForbidden:
      "Només els administradors poden gestionar enllaços públics.",
  });
  if (!auth.ok) return json(res, auth.status, { error: auth.error });

  try {
    const body = cosObjecte(req.body);
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) {
      return json(res, 400, { error: "Falta l'identificador de l'enllaç." });
    }
    const { error } = await supabase
      .from("visor_public_links")
      .delete()
      .eq("id", id);
    if (error) throw new Error(error.message);
    return json(res, 200, { ok: true });
  } catch (err) {
    console.error(
      "❌ /api/public-links/revoke:",
      err instanceof Error ? err.message : err,
    );
    return json(res, 500, { error: "Error intern. Torna-ho a provar." });
  }
}
