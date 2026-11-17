// api/_lib/ssa.ts
// CÒPIA de agents-independents/shared/ssa.ts per a les funcions de Vercel.
// Per què duplicat: agents-independents/ no té "type":"module" (els agents es
// compilen a CommonJS), així que Node tractaria aquest fitxer com a CJS quan
// l'importa una funció ESM de api/* i la funció petaria en carregar-se.
// Si canvies una cosa aquí, canvia-la també a l'original (i viceversa).
// ─────────────────────────────────────────────────────────────────────────────

import crypto from "crypto";

/**
 * Cal tornar a autenticar-se amb Autodesk (/auth/login):
 * no hi ha token, no hi ha refresh token o Autodesk l'ha invalidat/caducat.
 * Els consumidors la distingeixen dels errors transitoris (xarxa, 5xx…).
 */
export class ApsReauthError extends Error {
  readonly code = "APS_REAUTH_REQUIRED";
  constructor(message: string) {
    super(message);
    this.name = "ApsReauthError";
  }
}

// ─── Token del bot (Secure Service Account, SSA) ─────────────────────────────
//
// Alternativa al flux 3-legged d'usuari: el bot (taulamaster_bot) signa un JWT
// amb la seva clau privada RSA i l'intercanvia a Autodesk per un token 3-legged
// "en nom del bot". No hi ha refresh token, ni /auth/login, ni persona humana
// al mig: quan caduca (1 h) se'n demana un de nou.
//
// Variables d'entorn (a Vercel i a GitHub Actions):
//   APS_CLIENT_ID, APS_CLIENT_SECRET   de l'aplicació Server-to-Server
//   APS_SSA_ID                         "Service ID" del bot
//   APS_SSA_KEY_ID                     "Key ID" (kid) de la clau privada
//   APS_SSA_PRIVATE_KEY                clau privada PEM (admet "\n" escapats)

const APS_AUTH_URL =
  "https://developer.api.autodesk.com/authentication/v2/token";
const APS_TOKEN_AUDIENCE = APS_AUTH_URL;

export interface ConfigSSA {
  clientId: string;
  clientSecret: string;
  serviceAccountId: string;
  keyId: string;
  privateKey: string;
}

/** Llegeix la configuració SSA de l'entorn. Retorna null si no està (tota) definida. */
export function configSSA(): ConfigSSA | null {
  const clientId = process.env.APS_CLIENT_ID?.trim();
  const clientSecret = process.env.APS_CLIENT_SECRET?.trim();
  const serviceAccountId = process.env.APS_SSA_ID?.trim();
  const keyId = process.env.APS_SSA_KEY_ID?.trim();
  const privateKey = process.env.APS_SSA_PRIVATE_KEY?.replace(
    /\\n/g,
    "\n",
  ).trim();
  if (!clientId || !clientSecret || !serviceAccountId || !keyId || !privateKey)
    return null;
  return { clientId, clientSecret, serviceAccountId, keyId, privateKey };
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

/** Genera i signa (RS256) l'assertion JWT que s'intercanvia pel token. */
function generaAssertionSSA(cfg: ConfigSSA, scope: string[]): string {
  const ara = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT", kid: cfg.keyId };
  const claims = {
    iss: cfg.clientId,
    sub: cfg.serviceAccountId,
    aud: APS_TOKEN_AUDIENCE,
    iat: ara,
    exp: ara + 5 * 60, // l'assertion només cal que visqui uns minuts
    jti: crypto.randomUUID(),
    scope,
  };
  const dadesPerSignar = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const signatura = crypto
    .createSign("RSA-SHA256")
    .update(dadesPerSignar)
    .sign(cfg.privateKey);
  return `${dadesPerSignar}.${base64url(signatura)}`;
}

export interface TokenSSA {
  access_token: string;
  /** Segons de vida restants */
  expires_in: number;
}

// Memòria cau PER SCOPE: el token de l'app (data:read…) i el de només lectura
// dels enllaços públics (viewables:read) conviuen sense expulsar-se mutuament.
const cacheSSA = new Map<string, { access_token: string; expiraA: number }>();
const ssaEnCurs = new Map<string, Promise<TokenSSA>>();

/**
 * Descarta els tokens SSA de la memòria cau perquè el proper `obteTokenSSA`
 * en demani un de nou a Autodesk (p. ex. si Autodesk el rebutja amb un 401
 * o s'han canviat els permisos del bot a ACC).
 */
export function invalidaCacheSSA(): void {
  cacheSSA.clear();
}

/**
 * Obté un token 3-legged del bot. Es reutilitza fins que queden < 5 min de vida.
 * Errors 400/401 (assertion invàlida, clau revocada, bot eliminat…) llancen
 * ApsReauthError: cal intervenció humana (revisar clau/bot), no reintentar.
 */
export async function obteTokenSSA(
  cfg: ConfigSSA,
  scope: string[] = ["data:read", "viewables:read", "account:read"],
): Promise<TokenSSA> {
  const scopeKey = scope.join(" ");
  const ara = Date.now();
  const cache = cacheSSA.get(scopeKey);
  if (cache && cache.expiraA - 5 * 60_000 > ara) {
    return {
      access_token: cache.access_token,
      expires_in: Math.round((cache.expiraA - ara) / 1000),
    };
  }
  let enCurs = ssaEnCurs.get(scopeKey);
  if (!enCurs) {
    enCurs = _demanaTokenSSA(cfg, scope).finally(() => {
      ssaEnCurs.delete(scopeKey);
    });
    ssaEnCurs.set(scopeKey, enCurs);
  }
  return enCurs;
}

async function _demanaTokenSSA(
  cfg: ConfigSSA,
  scope: string[],
): Promise<TokenSSA> {
  const credencials = Buffer.from(
    `${cfg.clientId}:${cfg.clientSecret}`,
  ).toString("base64");
  const resp = await fetch(APS_AUTH_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credencials}`,
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: generaAssertionSSA(cfg, scope),
      scope: scope.join(" "),
    }).toString(),
    signal: AbortSignal.timeout(20_000),
  });

  if (!resp.ok) {
    const text = await resp.text();
    if (resp.status === 400 || resp.status === 401 || resp.status === 403) {
      throw new ApsReauthError(
        `Autodesk ha rebutjat les credencials del bot (${resp.status}). Revisa APS_SSA_ID, APS_SSA_KEY_ID i la clau privada. Detall: ${text}`,
      );
    }
    throw new Error(`Error obtenint token SSA: ${resp.status} ${text}`);
  }

  const data = (await resp.json()) as {
    access_token: string;
    expires_in: number;
  };
  cacheSSA.set(scope.join(" "), {
    access_token: data.access_token,
    expiraA: Date.now() + data.expires_in * 1000,
  });
  console.log(
    `✅ Token APS del bot obtingut (expira en ${Math.round(data.expires_in / 60)} min)`,
  );
  return { access_token: data.access_token, expires_in: data.expires_in };
}
