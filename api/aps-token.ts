// api/aps-token.ts
// Genera un token 2-legged d'Autodesk Platform Services (APS) per al Viewer SDK.
// Corre directament a Vercel — no depèn de l'agent extern.
// El token 2-legged usa client_credentials (no requereix login d'usuari).

import type { VercelRequest, VercelResponse } from "@vercel/node";

const APS_AUTH_URL = "https://developer.api.autodesk.com/authentication/v2/token";
const ALLOWED_ORIGIN = process.env.APP_URL ?? "*";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).end();

  const clientId     = process.env.APS_CLIENT_ID;
  const clientSecret = process.env.APS_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(500).json({
      error: "Variables d'entorn APS_CLIENT_ID o APS_CLIENT_SECRET no configurades",
    });
  }

  try {
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    const tokenResp = await fetch(APS_AUTH_URL, {
      method: "POST",
      headers: {
        "Content-Type":  "application/x-www-form-urlencoded",
        "Authorization": `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        scope:      "viewables:read",
      }).toString(),
    });

    if (!tokenResp.ok) {
      const errText = await tokenResp.text();
      console.error("❌ Error generant token 2-legged APS:", errText);
      return res.status(502).json({ error: `Error obtenint token APS: ${tokenResp.status}` });
    }

    const tokenData = await tokenResp.json() as {
      access_token: string;
      expires_in:   number;
      token_type:   string;
    };

    // Cache al navegador fins 60s abans de l'expiració
    res.setHeader("Cache-Control", `private, max-age=${Math.max(0, tokenData.expires_in - 60)}`);

    return res.status(200).json({
      access_token: tokenData.access_token,
      expires_in:   tokenData.expires_in,
      token_type:   "Bearer",
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("❌ Error inesperat a /api/aps-token:", msg);
    return res.status(500).json({ error: msg });
  }
}
