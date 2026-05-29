// shared/helpers.ts
// Funcions compartides per tots els agents: CORS, auth, body, HTML

import http from "http";

export const APS_AUTH_BASE = "https://developer.api.autodesk.com/authentication/v2";
export const APS_SCOPE     = "data:read viewables:read account:read";

// ─── HTML per pàgines OAuth ───────────────────────────────────────────────────

export function htmlPagina(titol: string, missatge: string, ok: boolean): string {
  const color = ok ? "#0099A8" : "#EF4444";
  const icon  = ok ? "✅" : "❌";
  return `<!DOCTYPE html>
<html lang="ca">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${titol} · TaulaMaster CBT</title>
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
    <h1>${titol}</h1>
    <p>${missatge}</p>
    <div class="logo">TaulaMaster CBT · Agent Autodesk</div>
  </div>
</body>
</html>`;
}

// ─── CORS ─────────────────────────────────────────────────────────────────────

export function setCors(res: http.ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
}

// ─── Autenticació per secret ──────────────────────────────────────────────────

export function verificaAuth(req: http.IncomingMessage, secret: string): boolean {
  if (!secret) return true;
  const authHeader = req.headers["authorization"] ?? "";
  return authHeader.replace("Bearer ", "") === secret;
}

// ─── Lectura de body JSON ─────────────────────────────────────────────────────

export function llegeixBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => { data += chunk; });
    req.on("end", () => {
      try { resolve(JSON.parse(data)); }
      catch { resolve({}); }
    });
  });
}
