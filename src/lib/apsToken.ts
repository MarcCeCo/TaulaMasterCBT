// src/lib/apsToken.ts
//
// Obté el token APS de la funció de Vercel /api/aps-token (que el genera amb el
// bot de servei, sense cap servei a Render) enviant la sessió de Supabase de
// l'usuari (Authorization: Bearer <access_token>). El token es guarda en memòria
// fins que li queden pocs minuts de vida, així el Viewer SDK pot demanar-lo
// tantes vegades com vulgui sense fer una petició cada cop.
//
// Quan falla, llança ApsTokenError amb el missatge REAL del servidor (en català,
// pensat per a l'usuari) perquè la UI el mostri tal qual.

import { supabase } from "@/lib/supabase";
import { apiUrl } from "@/lib/apiBase";

export interface ApsToken {
  access_token: string;
  /** Segons de vida restants */
  expires_in: number;
}

export class ApsTokenError extends Error {
  /** Codi del servidor (APS_REAUTH_REQUIRED, UNAUTHORIZED…) o intern (NO_SESSION, NETWORK) */
  readonly code: string;
  readonly status?: number;
  constructor(message: string, code: string, status?: number) {
    super(message);
    this.name = "ApsTokenError";
    this.code = code;
    this.status = status;
  }
}

// La funció serverless respon en fraccions de segon; deixem marge per a la xarxa
// i per a l'arrencada en fred.
const TIMEOUT_MS = 15_000;
// Es considera "a punt d'expirar" quan queden menys de 2 min
const MARGE_MS = 2 * 60 * 1000;

let cache: { access_token: string; expiraA: number } | null = null;
let enCurs: Promise<ApsToken> | null = null;

/** Esborra el token en memòria (p. ex. en tancar sessió). */
export function oblidaApsToken(): void {
  cache = null;
}

/**
 * @param opts.sessionToken access_token de la sessió de Supabase. Només cal passar-lo
 *   des d'un callback d'onAuthStateChange (on no convé fer getSession()); la resta
 *   de llocs el llegeixen sols.
 */
export function obteApsToken(
  opts: { sessionToken?: string; fresh?: boolean } = {},
): Promise<ApsToken> {
  const ara = Date.now();
  if (opts.fresh) {
    // Autodesk ha rebutjat el token anterior: el descartem i en demanem un de nou
    cache = null;
    enCurs = null;
  }
  if (cache && cache.expiraA - MARGE_MS > ara) {
    return Promise.resolve({
      access_token: cache.access_token,
      expires_in: Math.round((cache.expiraA - ara) / 1000),
    });
  }
  // Evita peticions duplicades quan diverses parts de la UI el demanen alhora
  if (!enCurs) {
    enCurs = demanaToken(opts.sessionToken, opts.fresh).finally(() => {
      enCurs = null;
    });
  }
  return enCurs;
}

async function demanaToken(
  sessionTokenParam?: string,
  fresh = false,
): Promise<ApsToken> {
  const sessioToken =
    sessionTokenParam ??
    (await supabase.auth.getSession()).data.session?.access_token;
  if (!sessioToken) {
    throw new ApsTokenError(
      "Cal iniciar sessió per veure els models 3D.",
      "NO_SESSION",
      401,
    );
  }

  let resp: Response;
  try {
    resp = await fetch(apiUrl(`/api/aps-token${fresh ? "?fresh=1" : ""}`), {
      headers: { Authorization: `Bearer ${sessioToken}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new ApsTokenError(
      "No s'ha pogut contactar amb el servei de models 3D. Comprova la connexió i torna-ho a provar.",
      "NETWORK",
    );
  }

  if (!resp.ok) {
    // La funció retorna { error, code } en català. Si la resposta no és JSON
    // (p. ex. un error de la plataforma), mostrem el codi HTTP.
    const cos = (await resp.json().catch(() => null)) as {
      error?: string;
      code?: string;
    } | null;
    const missatge =
      cos?.error ?? "El servei de models 3D no respon correctament.";
    throw new ApsTokenError(
      `${missatge} (${resp.status})`,
      cos?.code ?? "HTTP_ERROR",
      resp.status,
    );
  }

  const { access_token, expires_in } = (await resp.json()) as ApsToken;
  cache = { access_token, expiraA: Date.now() + expires_in * 1000 };
  return { access_token, expires_in };
}
