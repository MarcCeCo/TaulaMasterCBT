// api/groq-chat.ts
// Vercel Edge Function — proxy segur per a la Groq API.
// La clau GROQ_API_KEY mai surt al client.
//
// Endpoint: POST /api/groq-chat
// Body:     { messages: { role: "user"|"assistant", content: string }[] }
// Retorna:  { reply: string }
// ─────────────────────────────────────────────────────────────────────────────

export const config = { runtime: "edge" };

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Ets l'assistent de suport de TaulaMaster CBT, la plataforma de gestió d'instal·lacions del Consorci Besòs Tordera.

Respon sempre en català, de forma clara i concisa. Si et pregunten en castellà o anglès, respon en aquell idioma.

## La plataforma

TaulaMaster CBT és una aplicació web (React + Vite + Supabase + Vercel) que centralitza la gestió d'equips i instal·lacions de sistemes de sanejament. Permet:
- Gestionar equips i instal·lacions (taula master)
- Visualitzar models BIM en 3D directament al navegador (Autodesk Viewer SDK)
- Sincronitzar models Revit d'Autodesk Fusion Teams (ACC) automàticament
- Exportar dades a Rosmiman (GMAO)
- Gestionar usuaris i permisos per rol

## Agents

**Agent Visor 3D** (visor3d, port 3002 a Render):
- Sincronitza models Revit d'ACC → Supabase (taules visor3d_sistemes i visor3d_installacions)
- S'executa automàticament el dia 1 de cada mes a les 06:00 UTC
- També es pot disparar manualment des de Control d'Agents → "Executar ara"
- Requereix token APS 3-legged vàlid (gestionat pel token-service)
- Endpoint: POST /sync (requereix Bearer AGENT_SECRET)

**Token Service** (token-service, port 3001 a Render):
- Gestiona el token OAuth 3-legged d'Autodesk Platform Services (APS)
- Renova el token proactivament cada 50 minuts
- Flux d'autenticació: GET /auth/login → Autodesk → GET /auth/callback
- El token es desa a Supabase (taula aps_tokens, id=1)

**Eines BIM Locals** (no és un servei remot):
- Crear Masters (pyRevit): script Python dins de Revit. Obre CBT_PLANTILLA.rte, vincula disciplines (_ENT/_EST/_MEP) i desa _MASTER.rvt
- BIM Sync USB (Python): copia disciplines al USB i puja MASTERs a ACC via API

## Estructura de carpetes a ACC

besso-digital/
  XXX_NOM-SISTEMA/           (prefix numèric >= 001, ex: 001_GRANOLLERS)
    CODI_NOM-INSTALLACIO/    (ex: ED008_CALDES-DE-MONTBUI)
      001_MODEL-BIM/         (carpeta fixa obligatòria)
        CODI_..._ENT.rvt
        CODI_..._EST.rvt
        CODI_..._MEP.rvt
        CODI_..._MASTER.rvt  (federat, conté tots els vincles)

## Taules Supabase principals

- visor3d_sistemes: id, nom, ordre
- visor3d_installacions: codi_installacio, nom, sistema_id, urn, urn_master, urn_mep, urn_ent, urn_est, embed_url, last_modified_time
- visor3d_sync_log: historial d'execucions de l'Agent Visor 3D
- aps_tokens: id=1, access_token, refresh_token, expires_at
- bim_sync_log: historial d'execucions del BIM Sync USB

## Variables d'entorn clau

Frontend (Vercel): VITE_VISOR3D_URL, VITE_TOKEN_SERVICE_URL, VITE_AGENT_SECRET
Backend (Render): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APS_CLIENT_ID, APS_CLIENT_SECRET, APS_HUB_ID, APS_PROJECT_ID, AGENT_SECRET, APS_CALLBACK_URL

## Problemes freqüents i solucions

Token APS "Expirat":
1. Obre https://[token-service-url]/auth/login
2. Autoritza amb el compte Autodesk
3. El token es desa automàticament a Supabase

El model no apareix al Visor 3D:
1. Comprova que el .rvt existeix a 001_MODEL-BIM d'ACC
2. Verifica que la traducció a ACC estigui "Ready"
3. Executa l'Agent Visor 3D manualment
4. El codi d'instal·lació ha de seguir el format LLETRESNÚMEROS (ex: ED008)

Error BIM Sync "No s'ha trobat la carpeta":
- La carpeta ha de tenir el format CODI_NOM-AMB-GUIONS (ex: ED008_CALDES-DE-MONTBUI)
- 001_MODEL-BIM ha d'existir i contenir almenys un .rvt

Respon de forma útil i directa. Si no saps la resposta, indica-ho clarament.`;

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: Request): Promise<Response> {
  // CORS
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Mètode no permès" }), { status: 405, headers });
  }

  const groqApiKey = process.env.GROQ_API_KEY;
  if (!groqApiKey) {
    return new Response(
      JSON.stringify({ error: "GROQ_API_KEY no configurada al servidor" }),
      { status: 500, headers }
    );
  }

  let body: { messages?: { role: string; content: string }[] };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Body invàlid" }), { status: 400, headers });
  }

  const missatgesUsuari = body.messages ?? [];
  if (!Array.isArray(missatgesUsuari) || missatgesUsuari.length === 0) {
    return new Response(JSON.stringify({ error: "Cap missatge rebut" }), { status: 400, headers });
  }

  // Limita el context a les últimes 20 torns per no superar els límits de tokens del pla gratuït
  const missatgesTallats = missatgesUsuari.slice(-20);

  try {
    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${groqApiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",   // Model recomanat pel pla gratuït: 14.400 RPD
        max_tokens: 1024,
        temperature: 0.4,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...missatgesTallats,
        ],
      }),
    });

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      return new Response(
        JSON.stringify({ error: `Error Groq API: ${groqRes.status} — ${errText}` }),
        { status: 502, headers }
      );
    }

    const data = await groqRes.json() as {
      choices: { message: { content: string } }[];
    };

    const reply = data.choices?.[0]?.message?.content ?? "";
    return new Response(JSON.stringify({ reply }), { status: 200, headers });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers });
  }
}
