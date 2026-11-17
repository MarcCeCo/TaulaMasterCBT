// src/lib/apiBase.ts
//
// URL de les funcions serverless (/api/*). El frontend i l'API viuen al mateix
// domini de Vercel, així que per defecte es fan servir rutes relatives i no cal
// configurar res.
//
// VITE_API_BASE_URL (opcional): només per a `vite dev` (que no serveix /api).
// Apunta-la a un desplegament de Vercel, p. ex. la preview de la branca test
// (https://taula-master-cbt-git-test-….vercel.app). Aquest origen ha d'estar a
// ALLOWED_ORIGINS/APP_URL de Vercel perquè el navegador accepti la resposta (CORS).

export function apiUrl(ruta: string): string {
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined)
    ?.trim()
    .replace(/\/+$/, "");
  return `${base ?? ""}${ruta}`;
}
