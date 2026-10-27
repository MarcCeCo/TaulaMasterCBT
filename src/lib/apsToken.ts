// src/lib/apsToken.ts
//
// Obté el token APS del token-service enviant la sessió de Supabase de l'usuari
// (Authorization: Bearer <access_token>). El token es guarda en memòria fins que
// li queden pocs minuts de vida, així el Viewer SDK pot demanar-lo tantes
// vegades com vulgui sense fer una petició cada cop.
//
// Quan falla, llança ApsTokenError amb el missatge REAL del servidor (en català,
// pensat per a l'usuari) perquè la UI el mostri tal qual.

import { supabase } from "@/lib/supabase";

export interface ApsToken {
  access_token: string;
  /** Segons de vida restants */
  expires_in: number;
}

export class ApsTokenError extends Error {
  /** Codi del servidor (APS_REAUTH_REQUIRED, UNAUTHORIZED…) o intern (NO_SESSION, NETWORK, CONFIG) */
  readonly code: string;
  readonly status?: number;
  constructor(message: string, code: string, status?: number) {
    super(message);
    this.name = "ApsTokenError";
    this.code = code;
    this.status = status;
  }
}

/** VITE_TOKEN_SERVICE_URL (preferent) o VITE_AGENT_URL (agent monolític antic). */
export function tokenServiceUrl(): string | undefined {
  const url = (
    (import.meta.env.VITE_TOKEN_SERVICE_URL as string | undefined) ??
    (import.meta.env.VITE_AGENT_URL as string | undefined)
  )?.trim();
  return url ? url.replace(/\/+$/, "") : undefined;
}

// Render gratuït pot trigar ~50 s a despertar-se: no tallem abans d'hora.
const TIMEOUT_MS = 60_000;
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
export function obteApsToken(opts: { sessionToken?: string } = {}): Promise<ApsToken> {
  const ara = Date.now();
  if (cache && cache.expiraA - MARGE_MS > ara) {
    return Promise.resolve({
      access_token: cache.access_token,
      expires_in: Math.round((cache.expiraA - ara) / 1000),
    });
  }
  // Evita peticions duplicades quan diverses parts de la UI el demanen alhora
  if (!enCurs) {
    enCurs = demanaToken(opts.sessionToken).finally(() => { enCurs = null; });
  }
  return enCurs;
}

async function demanaToken(sessionTokenParam?: string): Promise<ApsToken> {
  const base = tokenServiceUrl();
  if (!base) {
    throw new ApsTokenError(
      "El visor 3D no està configurat (falta VITE_TOKEN_SERVICE_URL). Avisa l'administrador.",
      "CONFIG",
    );
  }

  const sessioToken = sessionTokenParam ?? (await supabase.auth.getSession()).data.session?.access_token;
  if (!sessioToken) {
    throw new ApsTokenError("Cal iniciar sessió per veure els models 3D.", "NO_SESSION", 401);
  }

  let resp: Response;
  try {
    resp = await fetch(`${base}/api/aps-token`, {
      headers: { Authorization: `Bearer ${sessioToken}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new ApsTokenError(
      "No s'ha pogut contactar amb el servei de models 3D (pot estar arrencant). Torna-ho a provar d'aquí a un minut.",
      "NETWORK",
    );
  }

  if (!resp.ok) {
    // El servei retorna { error, code } en català. Si la resposta no és JSON
    // (p. ex. un "Bad Gateway" de Render), mostrem el codi HTTP.
    const cos = (await resp.json().catch(() => null)) as { error?: string; code?: string } | null;
    const missatge = cos?.error ?? "El servei de models 3D no respon correctament.";
    throw new ApsTokenError(`${missatge} (${resp.status})`, cos?.code ?? "HTTP_ERROR", resp.status);
  }

  const { access_token, expires_in } = (await resp.json()) as ApsToken;
  cache = { access_token, expiraA: Date.now() + expires_in * 1000 };
  return { access_token, expires_in };
}
