// api/_lib/http.ts
// Utilitats comunes de les funcions serverless (CORS, respostes JSON, límit de
// peticions, IP). El prefix "_" fa que Vercel no el publiqui com a endpoint.

import type { VercelRequest, VercelResponse } from "@vercel/node";

/** Orígens autoritzats per a peticions des d'un altre domini (p. ex. `vite dev`). */
function origensPermesos(): string[] {
  const llista = (process.env.ALLOWED_ORIGINS ?? process.env.APP_URL ?? "")
    .split(",")
    .map((v) => v.trim().replace(/\/$/, ""))
    .filter(Boolean);
  // En desenvolupament/preview permetem el servidor local de Vite
  if (process.env.VERCEL_ENV !== "production")
    llista.push("http://localhost:5173");
  return llista;
}

/**
 * Capçaleres CORS. El frontend i l'API viuen al mateix domini de Vercel, així
 * que en producció normalment no calen; només serveixen per a `vite dev` o
 * per a un frontend en un altre domini.
 * Retorna true si la petició era un preflight OPTIONS (ja resposta).
 */
export function aplicaCors(
  req: VercelRequest,
  res: VercelResponse,
  metodes: string,
): boolean {
  const origin = String(req.headers.origin ?? "").replace(/\/$/, "");
  if (origin && origensPermesos().includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", `${metodes}, OPTIONS`);
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }
  return false;
}

export function json(
  res: VercelResponse,
  status: number,
  body: unknown,
): VercelResponse {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  return res.status(status).json(body);
}

/** access_token del Bearer, o null si no hi és. */
export function bearer(req: VercelRequest): string | null {
  const m = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization ?? ""));
  return m ? m[1].trim() : null;
}

/** IP del client (Vercel la posa a x-forwarded-for / x-real-ip). */
export function ipDe(req: VercelRequest): string {
  const xff = String(req.headers["x-forwarded-for"] ?? "")
    .split(",")[0]
    .trim();
  return xff || String(req.headers["x-real-ip"] ?? "") || "desconeguda";
}

// Límit de peticions en memòria. En serverless cada instància "calenta" té el
// seu propi comptador: frena abusos simples, però no és un límit global estricte.
const finestres = new Map<string, { n: number; reinici: number }>();

export function superaLimit(
  clau: string,
  max: number,
  finestraMs = 60_000,
): boolean {
  const ara = Date.now();
  // Neteja ocasional perquè el mapa no creixi sense límit
  if (finestres.size > 5_000) {
    for (const [k, f] of finestres) if (f.reinici < ara) finestres.delete(k);
  }
  const f = finestres.get(clau);
  if (!f || f.reinici < ara) {
    finestres.set(clau, { n: 1, reinici: ara + finestraMs });
    return false;
  }
  f.n++;
  return f.n > max;
}
