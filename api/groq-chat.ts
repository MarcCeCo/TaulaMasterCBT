// api/groq-chat.ts
// Vercel Edge Function — proxy segur per a la Groq API amb RAG via Supabase pgvector.
//
// Flux:
//   1. Rep la pregunta de l'usuari
//   2. Genera un embedding de la pregunta (Voyage AI)
//   3. Cerca els 10 fragments més rellevants a cbt_embeddings (pgvector)
//   4. Construeix un system prompt MÍNIM amb només els resultats RAG
//   5. Crida Groq (~750 tokens en lloc de ~4.000+)
// ─────────────────────────────────────────────────────────────────────────────

export const config = { runtime: "edge" };

// ─── Tipus ────────────────────────────────────────────────────────────────────

interface MissatgeAPI {
  role: string;
  content: string;
}

interface RagResult {
  id:        string;
  tipus:     string;
  contingut: string;
  metadata:  Record<string, unknown>;
  similitud: number;
}

// ─── Embedding de la query (Voyage AI) ───────────────────────────────────────

async function embedQuery(text: string, voyageKey: string): Promise<number[]> {
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${voyageKey}`,
    },
    body: JSON.stringify({
      model: "voyage-3-lite",
      input: [text],
      input_type: "query",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Voyage AI error ${res.status}: ${err}`);
  }

  const data = await res.json() as { data: { embedding: number[] }[] };
  return data.data[0].embedding;
}

// ─── Cerca RAG a Supabase pgvector ────────────────────────────────────────────

async function cercaRag(
  queryEmbedding: number[],
  supaUrl: string,
  supaKey: string,
  matchCount = 12
): Promise<RagResult[]> {
  const res = await fetch(`${supaUrl}/rest/v1/rpc/cerca_rag`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": supaKey,
      "Authorization": `Bearer ${supaKey}`,
    },
    body: JSON.stringify({
      query_embedding: queryEmbedding,
      match_count: matchCount,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase RAG error ${res.status}: ${err}`);
  }

  return res.json() as Promise<RagResult[]>;
}

// ─── System prompt amb resultats RAG ─────────────────────────────────────────

const SYSTEM_BASE = `Ets l'assistent de TaulaMaster CBT, la plataforma de gestió d'instal·lacions del Consorci Besòs Tordera.

Respon sempre en català, de forma clara i concisa. Si et pregunten en castellà o anglès, respon en aquell idioma.

Tens accés a tota la informació de la plataforma: equips, camps, classificació GuBIMClass, projectes i TAGs.

## Format TAG Rosmiman
\`CODIINSTALLACIO_CODIEQUIP_CCMFUNCIODUPLICITATAT\`
- CODIINSTALLACIO: 5 caràcters (ex: ED008, GR001)
- CODIEQUIP: codi GuBIMClass (ex: BM00, VLV0)
- CCM: comptador 3 dígits (ex: 001)
- FUNCIO: A=alimentació, B=bypass, R=reserva…
- DUPLICITAT: S=simple, D=duplicat, T=triple
Exemple: \`ED008_BM00_001A\`

Quan proposis TAGs nous, comprova que no existeixin als projectes.`;

function buildSystemPrompt(ragResults: RagResult[], pageContext?: string): string {
  const parts = [SYSTEM_BASE];

  if (pageContext) {
    parts.push(`## Pàgina actual\nL'usuari es troba a: **${pageContext}**`);
  }

  if (ragResults.length > 0) {
    const lines = ragResults.map(r =>
      `[${r.tipus.toUpperCase()} | similitud: ${(r.similitud * 100).toFixed(0)}%]\n${r.contingut}`
    );
    parts.push(`## Informació rellevant trobada\n\n${lines.join("\n\n")}`);
  } else {
    parts.push("## Nota\nNo s'ha trobat informació específica per a aquesta consulta a la base de dades.");
  }

  return parts.join("\n\n");
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: Request): Promise<Response> {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Mètode no permès" }), { status: 405, headers });
  }

  // Variables d'entorn
  const groqKey   = process.env.GROQ_API_KEY;
  const voyageKey = process.env.VOYAGE_API_KEY;
  const supaUrl   = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const supaKey   = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!groqKey)   return new Response(JSON.stringify({ error: "Falta GROQ_API_KEY" }), { status: 500, headers });
  if (!voyageKey) return new Response(JSON.stringify({ error: "Falta VOYAGE_API_KEY" }), { status: 500, headers });
  if (!supaUrl)   return new Response(JSON.stringify({ error: "Falta SUPABASE_URL" }), { status: 500, headers });
  if (!supaKey)   return new Response(JSON.stringify({ error: "Falta SUPABASE_SERVICE_ROLE_KEY" }), { status: 500, headers });

  let body: { messages?: MissatgeAPI[]; context?: { pageContext?: string } };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Body invàlid" }), { status: 400, headers });
  }

  const missatgesUsuari = body.messages ?? [];
  if (!Array.isArray(missatgesUsuari) || missatgesUsuari.length === 0) {
    return new Response(JSON.stringify({ error: "Cap missatge rebut" }), { status: 400, headers });
  }

  // Última pregunta de l'usuari per fer la cerca RAG
  const ultimaPregunta = missatgesUsuari
    .filter(m => m.role === "user")
    .at(-1)?.content ?? "";

  // ── RAG: embedding + cerca ─────────────────────────────────────────────────
  let ragResults: RagResult[] = [];
  try {
    const queryEmbedding = await embedQuery(ultimaPregunta, voyageKey);
    ragResults = await cercaRag(queryEmbedding, supaUrl, supaKey, 12);
  } catch (err) {
    // Si el RAG falla, continuem sense context (millor que no respondre)
    console.error("RAG error:", err);
  }

  const systemPrompt = buildSystemPrompt(
    ragResults,
    body.context?.pageContext
  );

  // Historial limitat a 6 torns
  const missatgesTallats = missatgesUsuari.slice(-6);

  try {
    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${groqKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: 800,
        temperature: 0.3,
        messages: [
          { role: "system", content: systemPrompt },
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
