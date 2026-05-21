// api/aps-token.ts
// Retorna el token 3-legged APS guardat a Supabase per al Viewer SDK.
// Si el token ha expirat, el renova automàticament amb el refresh token.
// Corre a Vercel — no depèn de l'agent extern.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const APS_AUTH_URL   = "https://developer.api.autodesk.com/authentication/v2/token";
const MARGE_MS       = 5 * 60 * 1000; // renova si expira en menys de 5 min
const ALLOWED_ORIGIN = process.env.APP_URL ?? "*";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET")     return res.status(405).end();

  const supabaseUrl     = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const clientId        = process.env.APS_CLIENT_ID;
  const clientSecret    = process.env.APS_CLIENT_SECRET;

  if (!supabaseUrl || !serviceRoleKey || !clientId || !clientSecret) {
    return res.status(500).json({ error: "Variables d'entorn no configurades" });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    // 1. Llegeix el token de Supabase
    const { data: row, error } = await supabase
      .from("aps_tokens")
      .select("access_token, refresh_token, expires_at")
      .eq("id", 1)
      .single();

    if (error || !row) {
      return res.status(503).json({ error: "Token APS no disponible. Executa l'agent primer." });
    }

    const ara = Date.now();

    // 2. Si el token és vàlid, retorna'l directament
    if (row.access_token && row.expires_at > ara + MARGE_MS) {
      const expiresIn = Math.round((row.expires_at - ara) / 1000);
      res.setHeader("Cache-Control", `private, max-age=${Math.max(0, expiresIn - 60)}`);
      return res.status(200).json({ access_token: row.access_token, expires_in: expiresIn });
    }

    // 3. Token expirat → renova amb refresh token
    if (!row.refresh_token) {
      return res.status(503).json({ error: "Refresh token no disponible. Executa l'agent primer." });
    }

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    const tokenResp = await fetch(APS_AUTH_URL, {
      method: "POST",
      headers: {
        "Content-Type":  "application/x-www-form-urlencoded",
        "Authorization": `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        grant_type:    "refresh_token",
        refresh_token: row.refresh_token,
        scope:         "data:read viewables:read",
      }).toString(),
    });

    if (!tokenResp.ok) {
      const errText = await tokenResp.text();
      return res.status(502).json({ error: `Error renovant token APS: ${tokenResp.status} ${errText}` });
    }

    const tokenData = await tokenResp.json() as {
      access_token:  string;
      refresh_token: string;
      expires_in:    number;
    };

    const nouExpiresAt = ara + tokenData.expires_in * 1000;

    // 4. Guarda el token renovat a Supabase
    await supabase.from("aps_tokens").update({
      access_token:  tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at:    nouExpiresAt,
      updated_at:    new Date().toISOString(),
    }).eq("id", 1);

    res.setHeader("Cache-Control", `private, max-age=${Math.max(0, tokenData.expires_in - 60)}`);
    return res.status(200).json({
      access_token: tokenData.access_token,
      expires_in:   tokenData.expires_in,
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
}
