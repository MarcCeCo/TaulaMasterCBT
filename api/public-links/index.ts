// api/public-links/index.ts
//
// ADMIN (sessió d'un usuari amb role = 'admin'):
//   GET  /api/public-links?installacioId=…   → { enllacos: [...] }  (amb el token, per mostrar la URL)
//   POST /api/public-links  Body { installacioId, etiqueta?, dies? }
//                                            → { id, token, expires_at }
//        (la BD desa el hash per a la validació i el token per tornar a mostrar la URL)
// La revocació és a api/public-links/revoke.ts.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "crypto";
import { aplicaCors, json } from "../_lib/http.js";
import { creaSupabaseAdmin } from "../_lib/supabase.js";
import { autoritza } from "../_lib/auth.js";
import { cosObjecte, sha256 } from "../_lib/publicLinks.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (aplicaCors(req, res, "GET, POST")) return;
  if (req.method !== "GET" && req.method !== "POST") {
    return json(res, 405, { error: "Mètode no permès." });
  }

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
    // ── Llistar ──
    if (req.method === "GET") {
      const installacioId = String(req.query.installacioId ?? "");
      if (!installacioId) {
        return json(res, 400, { error: "Falta la instal·lació." });
      }
      const { data, error } = await supabase
        .from("visor_public_links")
        .select(
          "id, token, etiqueta, created_by_email, created_at, expires_at, revoked_at, last_access_at, access_count",
        )
        .eq("installacio_id", installacioId)
        .is("revoked_at", null) // els enllaços revocats abans d'aquest canvi s'amaguen
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw new Error(error.message);
      return json(res, 200, { enllacos: data ?? [] });
    }

    // ── Crear ──
    const body = cosObjecte(req.body);
    const installacioId =
      typeof body.installacioId === "string" ? body.installacioId : "";
    const etiqueta =
      typeof body.etiqueta === "string"
        ? body.etiqueta.trim().slice(0, 100)
        : "";
    const dies = body.dies;
    if (!installacioId) {
      return json(res, 400, { error: "Falta la instal·lació." });
    }
    if (
      dies !== null &&
      dies !== undefined &&
      !(
        typeof dies === "number" &&
        Number.isInteger(dies) &&
        dies >= 1 &&
        dies <= 365
      )
    ) {
      return json(res, 400, {
        error: "La caducitat ha de ser d'1 a 365 dies.",
      });
    }

    const { data: inst } = await supabase
      .from("visor3d_installacions")
      .select("id, urn_master")
      .eq("id", installacioId)
      .maybeSingle();
    if (!inst) return json(res, 404, { error: "Instal·lació no trobada." });
    if (!String(inst.urn_master ?? "").trim()) {
      return json(res, 400, {
        error: "Aquesta instal·lació encara no té model MASTER sincronitzat.",
      });
    }

    const token = crypto.randomBytes(32).toString("base64url"); // 43 caràcters
    const expiraA =
      typeof dies === "number"
        ? new Date(Date.now() + dies * 86_400_000).toISOString()
        : null;

    const { data: fila, error } = await supabase
      .from("visor_public_links")
      .insert({
        installacio_id: installacioId,
        token_hash: sha256(token),
        token, // perquè l'admin pugui tornar a veure la URL (vegeu docs/ENLLACOS_PUBLICS.md)
        etiqueta,
        created_by: auth.userId,
        created_by_email: auth.email,
        expires_at: expiraA,
      })
      .select("id")
      .single();
    if (error || !fila)
      throw new Error(error?.message ?? "No s'ha pogut crear.");

    return json(res, 201, { id: fila.id, token, expires_at: expiraA });
  } catch (err) {
    console.error(
      "❌ /api/public-links:",
      err instanceof Error ? err.message : err,
    );
    return json(res, 500, { error: "Error intern. Torna-ho a provar." });
  }
}
