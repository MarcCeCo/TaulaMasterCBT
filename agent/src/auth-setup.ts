// src/auth-setup.ts
// Script d'un sol ús per fer el login inicial 3-legged amb Autodesk
// i guardar el refresh token a Supabase.
//
// UNES: executa aquest script UNA VEGADA per obtenir el primer token.
// Després l'agent.ts el renova automàticament.
//
// Execució:
//   npx ts-node src/auth-setup.ts
//   (o: bun run src/auth-setup.ts)
//
// Requisits a .env:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   APS_CLIENT_ID, APS_CLIENT_SECRET
//   APS_CALLBACK_URL  (ex: http://localhost:8080/callback)
// ─────────────────────────────────────────────────────────────────────────────

import http from "http";
import { createClient } from "@supabase/supabase-js";
import { createInterface } from "readline";

// ─── Configuració ────────────────────────────────────────────────────────────

const PORT = 8080;
const APS_AUTH_BASE = "https://developer.api.autodesk.com/authentication/v2";
const SCOPE = "data:read";

function requereixEnv(nom: string): string {
  const val = process.env[nom];
  if (!val) throw new Error(`Variable d'entorn ${nom} no definida`);
  return val;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const supabaseUrl = requereixEnv("SUPABASE_URL");
  const supabaseKey = requereixEnv("SUPABASE_SERVICE_ROLE_KEY");
  const clientId    = requereixEnv("APS_CLIENT_ID");
  const clientSecret = requereixEnv("APS_CLIENT_SECRET");
  const callbackUrl = process.env.APS_CALLBACK_URL || `http://localhost:${PORT}/callback`;

  const supabase = createClient(supabaseUrl, supabaseKey);

  // ── Construeix URL d'autorització ─────────────────────────────────────────
  const state = Math.random().toString(36).substring(2);
  const authUrl = new URL(`${APS_AUTH_BASE}/authorize`);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", callbackUrl);
  authUrl.searchParams.set("scope", SCOPE);
  authUrl.searchParams.set("state", state);

  console.log("\n🔐 CBT · Autodesk 3-legged OAuth Setup");
  console.log("═══════════════════════════════════════\n");
  console.log("1. Obre aquesta URL al navegador i inicia sessió amb el teu compte Autodesk:\n");
  console.log(`   ${authUrl.toString()}\n`);
  console.log(`2. Esperant callback a ${callbackUrl} ...\n`);

  // ── Servidor temporal per rebre el callback ───────────────────────────────
  await new Promise<void>((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

      if (url.pathname !== "/callback") {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const code  = url.searchParams.get("code");
      const returnedState = url.searchParams.get("state");
      const errorParam = url.searchParams.get("error");

      if (errorParam) {
        const desc = url.searchParams.get("error_description") ?? errorParam;
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        res.end(htmlResultat("❌ Error d'autorització", desc, false));
        server.close();
        reject(new Error(`Error Autodesk: ${desc}`));
        return;
      }

      if (!code || returnedState !== state) {
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        res.end(htmlResultat("❌ Error", "Codi o state no vàlid", false));
        server.close();
        reject(new Error("Codi o state invàlid al callback"));
        return;
      }

      console.log("✅ Codi d'autorització rebut. Intercanviant per tokens...");

      try {
        // ── Intercanvia code → access_token + refresh_token ──────────────
        const body = new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: callbackUrl,
        });

        const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

        const tokenResp = await fetch(`${APS_AUTH_BASE}/token`, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${credentials}`,
          },
          body: body.toString(),
        });

        if (!tokenResp.ok) {
          const text = await tokenResp.text();
          throw new Error(`Token exchange error ${tokenResp.status}: ${text}`);
        }

        const tokenData = await tokenResp.json() as {
          access_token: string;
          refresh_token: string;
          expires_in: number;
        };

        const expiresAt = Date.now() + tokenData.expires_in * 1000;

        // ── Guarda a Supabase (upsert a la fila id=1) ────────────────────
        const { error: dbError } = await supabase
          .from("aps_tokens")
          .upsert({
            id: 1,
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            expires_at: expiresAt,
            updated_at: new Date().toISOString(),
          }, { onConflict: "id" });

        if (dbError) throw new Error(`Error guardant a Supabase: ${dbError.message}`);

        console.log("\n✅ Token guardat a Supabase correctament!");
        console.log(`   Access token: ${tokenData.access_token.substring(0, 20)}...`);
        console.log(`   Expires in:   ${tokenData.expires_in}s`);
        console.log(`   Refresh token: ${tokenData.refresh_token.substring(0, 20)}...`);
        console.log("\n🎉 Ja pots executar l'agent normalment. El token es renovarà automàticament.\n");

        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(htmlResultat(
          "✅ Autenticació completada",
          "El token s'ha guardat correctament a Supabase. Pots tancar aquesta finestra.",
          true
        ));

        server.close();
        resolve();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("❌ Error:", msg);
        res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
        res.end(htmlResultat("❌ Error", msg, false));
        server.close();
        reject(err);
      }
    });

    server.listen(PORT, () => {
      console.log(`⏳ Servidor escoltant a http://localhost:${PORT}/callback`);
    });

    server.on("error", reject);
  });
}

function htmlResultat(titol: string, missatge: string, ok: boolean): string {
  const color = ok ? "#0099A8" : "#EF4444";
  return `<!DOCTYPE html>
<html lang="ca">
<head>
  <meta charset="UTF-8">
  <title>${titol}</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; align-items: center;
           justify-content: center; min-height: 100vh; margin: 0; background: #f8fafc; }
    .card { background: white; border-radius: 16px; padding: 48px; max-width: 480px;
            box-shadow: 0 4px 24px rgba(0,0,0,0.08); text-align: center; }
    h1 { color: ${color}; font-size: 1.5rem; margin: 0 0 16px; }
    p { color: #64748b; line-height: 1.6; margin: 0; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${titol}</h1>
    <p>${missatge}</p>
  </div>
</body>
</html>`;
}

main().catch((err) => {
  console.error("\n❌ Error fatal:", err.message ?? err);
  process.exit(1);
});
