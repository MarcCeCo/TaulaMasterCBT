// shared/helpers.ts
// Funcions compartides per tots els agents: CORS, auth, body, HTML

import http from "http";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import type { JsonAny } from "./tipus";

export const APS_AUTH_BASE =
  "https://developer.api.autodesk.com/authentication/v2";
export const APS_SCOPE = "data:read viewables:read account:read";

// ─── HTML per pàgines OAuth ───────────────────────────────────────────────────

function escapaHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[char] ?? char;
  });
}

export function htmlPagina(
  titol: string,
  missatge: string,
  ok: boolean,
): string {
  const titolSegur = escapaHtml(titol);
  const missatgeSegur = escapaHtml(missatge);
  const color = ok ? "#0099A8" : "#EF4444";
  const icon = ok ? "✅" : "❌";
  return `<!DOCTYPE html>
<html lang="ca">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${titolSegur} · TaulaMaster CBT</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh; margin: 0;
      background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
    }
    .card {
      background: white; border-radius: 20px; padding: 52px 48px;
      max-width: 500px; width: 90%;
      box-shadow: 0 8px 32px rgba(0,0,0,0.10);
      text-align: center;
    }
    .icon { font-size: 3rem; margin-bottom: 16px; }
    h1 { color: ${color}; font-size: 1.4rem; margin: 0 0 12px; }
    p  { color: #64748b; line-height: 1.6; margin: 0 0 24px; }
    .logo { font-size: 0.75rem; color: #94a3b8; margin-top: 32px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${icon}</div>
    <h1>${titolSegur}</h1>
    <p>${missatgeSegur}</p>
    <div class="logo">TaulaMaster CBT · Agent Autodesk</div>
  </div>
</body>
</html>`;
}

// ─── CORS ─────────────────────────────────────────────────────────────────────

/**
 * Comprova si un origen coincideix amb un patró de ALLOWED_ORIGINS.
 * Sense "*" → igualtat exacta. Amb "*" → substitueix UN sol fragment de nom de host
 * (lletres, dígits i guions): no creua punts ni barres, així
 * "https://taula-master-*-equip.vercel.app" NO accepta "https://taula-master-x.evil.com"
 * ni "https://taula-master-a.b-equip.vercel.app".
 */
function origenPermes(origin: string, patro: string): boolean {
  if (!patro.includes("*")) return origin === patro;
  const regex = new RegExp(
    "^" +
      patro
        .split("*")
        .map((troc) => troc.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
        .join("[a-z0-9-]*") +
      "$",
    "i",
  );
  return regex.test(origin);
}

export function setCors(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): void {
  const origin = req.headers.origin?.replace(/\/$/, "");
  const configured = (process.env.ALLOWED_ORIGINS ?? process.env.APP_URL ?? "")
    .split(",")
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter(Boolean);
  // Sense orígens configurats no habilitem CORS. Les crides server-to-server
  // continuen funcionant; el navegador requereix ALLOWED_ORIGINS explícit.
  // Admet patrons amb "*" dins d'un nom de host (vegeu origenPermes).
  if (origin && configured.some((patro) => origenPermes(origin, patro))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
}

// ─── Autenticació per secret ──────────────────────────────────────────────────

export function verificaAuth(
  req: http.IncomingMessage,
  secret: string,
): boolean {
  // Fail closed: un secret absent o buit mai ha d'obrir l'endpoint.
  if (!secret) return false;
  const match = /^Bearer\s+(.+)$/i.exec(
    String(req.headers["authorization"] ?? ""),
  );
  if (!match) return false;
  return segurIgual(match[1].trim(), secret);
}

// ─── Autorització de l'execució manual (POST /sync) ───────────────────────────
//
// Accepta, per ordre:
//   1. El secret de servei (AGENT_SECRET): l'usa GitHub Actions (sync-monthly.yml).
//   2. Un access_token de sessió de Supabase d'un usuari amb role = "admin"
//      (botó "Executar" de Control d'Agents). El secret mai surt del servidor.
// Si no es compleix cap de les dues, es denega (mai s'obre per defecte).

export type AutoritzacioSync =
  | { ok: true; origen: "secret" | "admin" }
  | { ok: false; status: 401 | 403; error: string };

function segurIgual(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export async function autoritzaSync(
  req: http.IncomingMessage,
  secret: string,
): Promise<AutoritzacioSync> {
  const m = /^Bearer\s+(.+)$/i.exec(String(req.headers["authorization"] ?? ""));
  if (!m)
    return {
      ok: false,
      status: 401,
      error: "No autoritzat. Cal iniciar sessió.",
    };
  const bearer = m[1].trim();

  if (secret && segurIgual(bearer, secret))
    return { ok: true, origen: "secret" };

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { ok: false, status: 401, error: "No autoritzat." };

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Valida el JWT contra Supabase Auth (signatura + caducitat)
  const { data, error } = await supabase.auth.getUser(bearer);
  if (error || !data?.user) {
    return {
      ok: false,
      status: 401,
      error: "La sessió no és vàlida o ha caducat. Torna a iniciar sessió.",
    };
  }

  const { data: perfil, error: perfilError } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();
  if (perfilError || perfil?.role !== "admin") {
    return {
      ok: false,
      status: 403,
      error: "Només els administradors poden executar l'agent.",
    };
  }
  return { ok: true, origen: "admin" };
}

// ─── Lectura de body JSON ─────────────────────────────────────────────────────

export function llegeixBody(req: http.IncomingMessage): Promise<JsonAny> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve({});
      }
    });
  });
}
