/**
 * supaFetch — helper compartit per fer fetch directe a la REST API de Supabase.
 *
 * Elimina la duplicació del helper `supa()` que existia als tres fitxers:
 *  - dataStore.tsx
 *  - useProjectes.tsx
 *  - useVisor3DSistemes.ts
 *
 * Patró: token síncron del ref (mai getSession()), timeout de 20s, errors descriptius.
 */

const SUPA_URL = (import.meta.env.VITE_SUPABASE_URL as string).trim();
const SUPA_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string).trim();

export async function supaFetch(
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
