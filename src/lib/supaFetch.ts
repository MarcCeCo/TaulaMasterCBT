/**
 * supaFetch — helper compartit per fer fetch directe a la REST API de Supabase.
 *
 * Millores respecte a la versió anterior:
 *  1. Request deduplication per a GET: si hi ha dues crides idèntiques en vol,
 *     la segona reutilitza la mateixa Promise en lloc de fer una nova petició.
 *     Això evita duplicats que ocorrien durant la càrrega inicial (StrictMode
 *     muntem 2 vegades i els stores disparen load() quasi simultàniament).
 *  2. Timeout de 20s (igual que abans).
 *  3. Errors descriptius (igual que abans).
 */

const SUPA_URL = (import.meta.env.VITE_SUPABASE_URL as string).trim();
const SUPA_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string).trim();

// ─── Deduplicació de GETs en vol ─────────────────────────────────────────────
// Clau: `${token}|GET|${path}` → Promise<any[]>
// S'elimina de la Map quan la Promise es resol o rebutja.
const _inFlight = new Map<string, Promise<any[]>>();

export async function supaFetch(
  token: string,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<any[]> {
  // Deduplicació: només per a GETs sense body
  if (method === "GET") {
    const key = `${token}|GET|${path}`;
    const existing = _inFlight.get(key);
    if (existing) return existing;

    const promise = _doFetch(token, method, path, body, extraHeaders).finally(() => {
      _inFlight.delete(key);
    });
    _inFlight.set(key, promise);
    return promise;
  }

  return _doFetch(token, method, path, body, extraHeaders);
}

async function _doFetch(
  token: string,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<any[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  const res = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
    method,
    signal: controller.signal,
    headers: {
      "Authorization": `Bearer ${token}`,
      "apikey": SUPA_KEY,
      "Content-Type": "application/json",
      "Prefer": "return=representation",
      // PERF: sol·licitem compressió HTTP sempre que sigui possible
      "Accept-Encoding": "gzip, deflate, br",
      ...extraHeaders,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }).finally(() => clearTimeout(timeout));

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`[${method} ${path}] ${res.status}: ${text}`);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : [];
}
