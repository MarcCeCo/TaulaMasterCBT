// src/lib/publicLinks.ts
//
// Client dels enllaços públics del Visor 3D (token-service, vegeu publicLinks.ts
// a agents-independents/token-service/src).
//
//  · Admin (amb sessió): crea, llista i revoca enllaços.
//  · Extern (sense sessió): carrega el model i renova el token d'Autodesk a
//    partir del token de l'enllaç.

import { supabase } from "@/lib/supabase";
import { tokenServiceUrl, type ApsToken } from "@/lib/apsToken";

export interface EnllacPublic {
  id: string;
  etiqueta: string;
  created_by_email: string | null;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  last_access_at: string | null;
  access_count: number;
}

export type EstatEnllac = "actiu" | "caducat" | "revocat";

export function estatEnllac(e: EnllacPublic): EstatEnllac {
  if (e.revoked_at) return "revocat";
  if (e.expires_at && new Date(e.expires_at).getTime() <= Date.now())
    return "caducat";
  return "actiu";
}

export class PublicLinkError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "PublicLinkError";
    this.code = code;
    this.status = status;
  }
}

function baseUrl(): string {
  const base = tokenServiceUrl();
  if (!base) {
    throw new PublicLinkError(
      "El servei de models 3D no està configurat (falta VITE_TOKEN_SERVICE_URL).",
      "CONFIG",
      500,
    );
  }
  return base;
}

// Render gratuït pot trigar ~50 s a despertar-se
const TIMEOUT_MS = 60_000;

async function crida<T>(
  ruta: string,
  init: RequestInit,
  fallbackError: string,
): Promise<T> {
  let resp: Response;
  try {
    resp = await fetch(`${baseUrl()}${ruta}`, {
      ...init,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    if (e instanceof PublicLinkError) throw e;
    throw new PublicLinkError(
      "No s'ha pogut contactar amb el servei (pot estar arrencant). Torna-ho a provar d'aquí a un minut.",
      "NETWORK",
      0,
    );
  }
  const cos = (await resp.json().catch(() => null)) as
    | (T & { error?: string; code?: string })
    | null;
  if (!resp.ok) {
    throw new PublicLinkError(
      cos?.error ?? fallbackError,
      cos?.code ?? "HTTP_ERROR",
      resp.status,
    );
  }
  return cos as T;
}

async function capcaleraAdmin(): Promise<HeadersInit> {
  const sessio = (await supabase.auth.getSession()).data.session;
  if (!sessio) {
    throw new PublicLinkError("Cal iniciar sessió.", "NO_SESSION", 401);
  }
  return {
    Authorization: `Bearer ${sessio.access_token}`,
    "Content-Type": "application/json",
  };
}

// ─── Admin ────────────────────────────────────────────────────────────────────

export async function creaEnllacPublic(opts: {
  installacioId: string;
  etiqueta: string;
  /** null = sense caducitat */
  dies: number | null;
}): Promise<{ id: string; token: string; expires_at: string | null }> {
  return crida(
    "/api/public-links",
    {
      method: "POST",
      headers: await capcaleraAdmin(),
      body: JSON.stringify(opts),
    },
    "No s'ha pogut crear l'enllaç.",
  );
}

export async function llistaEnllacosPublics(
  installacioId: string,
): Promise<EnllacPublic[]> {
  const r = await crida<{ enllacos: EnllacPublic[] }>(
    `/api/public-links?installacioId=${encodeURIComponent(installacioId)}`,
    { method: "GET", headers: await capcaleraAdmin() },
    "No s'han pogut carregar els enllaços.",
  );
  return r.enllacos;
}

export async function revocaEnllacPublic(id: string): Promise<void> {
  await crida(
    "/api/public-links/revoke",
    {
      method: "POST",
      headers: await capcaleraAdmin(),
      body: JSON.stringify({ id }),
    },
    "No s'ha pogut revocar l'enllaç.",
  );
}

/** URL completa que es comparteix amb els externs. */
export function urlEnllacPublic(token: string): string {
  return `${window.location.origin}/public/visor/${token}`;
}

// ─── Extern (sense sessió) ────────────────────────────────────────────────────

export interface DadesVisorPublic {
  installacio: { nom: string; codi: string };
  urn: string;
  access_token: string;
  expires_in: number;
  expires_at: string | null;
}

export function carregaVisorPublic(
  token: string,
  refresh = false,
): Promise<DadesVisorPublic> {
  return crida<DadesVisorPublic>(
    "/api/public/visor",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, refresh }),
    },
    "No s'ha pogut obrir el model.",
  );
}

/**
 * Proveïdor de token APS per al Viewer en mode públic: reutilitza el token
 * inicial i el renova (amb el token de l'enllaç) quan està a punt d'expirar.
 */
export function creaProveidorTokenPublic(
  tokenEnllac: string,
  inicial: Pick<DadesVisorPublic, "access_token" | "expires_in">,
): (opts?: { fresh?: boolean }) => Promise<ApsToken> {
  const MARGE_MS = 2 * 60 * 1000;
  let cache = {
    access_token: inicial.access_token,
    expiraA: Date.now() + inicial.expires_in * 1000,
  };
  let enCurs: Promise<ApsToken> | null = null;

  return (opts = {}) => {
    const ara = Date.now();
    if (!opts.fresh && cache.expiraA - MARGE_MS > ara) {
      return Promise.resolve({
        access_token: cache.access_token,
        expires_in: Math.round((cache.expiraA - ara) / 1000),
      });
    }
    if (!enCurs) {
      enCurs = carregaVisorPublic(tokenEnllac, true)
        .then((d) => {
          cache = {
            access_token: d.access_token,
            expiraA: Date.now() + d.expires_in * 1000,
          };
          return { access_token: d.access_token, expires_in: d.expires_in };
        })
        .finally(() => {
          enCurs = null;
        });
    }
    return enCurs;
  };
}
