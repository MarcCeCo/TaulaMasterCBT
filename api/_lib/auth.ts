// api/_lib/auth.ts
// Autorització a partir de la sessió de Supabase (Bearer <access_token>).

import type { VercelRequest } from "@vercel/node";
import type { SupabaseClient } from "@supabase/supabase-js";
import { bearer } from "./http.js";

export type Autoritzacio =
  | { ok: true; userId: string; email: string }
  | {
      ok: false;
      status: 401 | 403;
      code: "UNAUTHORIZED" | "FORBIDDEN";
      error: string;
    };

/**
 * Valida el JWT contra Supabase Auth (signatura + caducitat) i comprova el
 * perfil. `nomesAdmin` exigeix user_profiles.role = 'admin'; si no, n'hi ha
 * prou que l'usuari tingui fila a user_profiles.
 */
export async function autoritza(
  req: VercelRequest,
  supabase: SupabaseClient,
  opts: { nomesAdmin: boolean; errorForbidden: string },
): Promise<Autoritzacio> {
  const token = bearer(req);
  if (!token) {
    return {
      ok: false,
      status: 401,
      code: "UNAUTHORIZED",
      error: "No autoritzat. Cal iniciar sessió.",
    };
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    return {
      ok: false,
      status: 401,
      code: "UNAUTHORIZED",
      error: "La sessió no és vàlida o ha caducat. Torna a iniciar sessió.",
    };
  }

  const { data: perfil, error: perfilError } = await supabase
    .from("user_profiles")
    .select("id, role")
    .eq("id", data.user.id)
    .maybeSingle();

  const permes =
    !perfilError && !!perfil && (!opts.nomesAdmin || perfil.role === "admin");
  if (!permes) {
    return {
      ok: false,
      status: 403,
      code: "FORBIDDEN",
      error: opts.errorForbidden,
    };
  }
  return { ok: true, userId: data.user.id, email: data.user.email ?? "" };
}
