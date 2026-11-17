// api/_lib/publicLinks.ts
// Constants i helpers compartits pels endpoints d'enllaços públics del Visor 3D.
//
// Seguretat (igual que a l'antic token-service):
//   · El token de l'enllaç és aleatori (256 bits). La validació es fa pel seu
//     SHA-256; el token també es desa (columna `token`) perquè un admin pugui
//     tornar a veure la URL. Només s'hi arriba amb la service role.
//   · La taula visor_public_links té RLS sense polítiques: només s'hi arriba amb
//     la service role d'aquestes funcions.
//   · A l'extern NOMÉS se li dona un token APS d'abast `viewables:read` (mai el
//     de l'app amb data:read/account:read), emès pel bot (SSA).
//   · Crear, llistar i revocar enllaços requereix un usuari admin.

import crypto from "crypto";

export const SCOPE_PUBLIC = ["viewables:read"];
export const FORMAT_TOKEN = /^[A-Za-z0-9_-]{32,100}$/;

export const sha256 = (s: string): string =>
  crypto.createHash("sha256").update(s).digest("hex");

/** req.body de Vercel (JSON ja parsejat) com a objecte, o {} si no ho és. */
export function cosObjecte(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  if (typeof body === "string") {
    try {
      const v = JSON.parse(body);
      if (v && typeof v === "object" && !Array.isArray(v)) return v;
    } catch {
      /* cos no JSON */
    }
  }
  return {};
}
