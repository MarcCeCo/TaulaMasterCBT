// api/groq-chat.ts
// Vercel Edge Function — proxy segur per a la Groq API.
// La clau GROQ_API_KEY mai surt al client.
//
// Endpoint: POST /api/groq-chat
// Body:
//   messages:    { role: "user"|"assistant", content: string }[]
//   context?:    {
//     equipments?:  { equipCode, equipName, gubimCode, fieldCols }[]
//     fields?:      { col, codi, tipus_dada, cbt, format_param, agrupacio_revit, disciplina }[]
//     gubimNodes?:  { code, name }[]
//     projectes?:   { codiProjecte, nom, codisInstallacio, tags }[]
//     bimManual?:   string   (text extret del PDF)
//     pageContext?: string
//   }
// Retorna: { reply: string }
// ─────────────────────────────────────────────────────────────────────────────

export const config = { runtime: "edge" };

// ─── Tipus del body ───────────────────────────────────────────────────────────

interface MissatgeAPI {
  role: string;
  content: string;
}

interface EquipContext {
  equipCode:   string;
  equipName:   string;
  gubimCode:   string;
  fieldCols:   string[];
}

interface FieldContext {
  col:            string;
  codi:           string | null;
  tipus_dada:     string | null;
  cbt:            string | null;
  format_param:   string | null;
  agrupacio_revit:string | null;
  disciplina:     string | null;
}

interface GubimContext {
  code: string;
  name: string;
}

interface TagContext {
  tagComplet:       string;
  codiInstallacio:  string;
  ccm:              string;
  funcio:           string;
  duplicitat:       string;
  status:           string;
  descripcioEquip:  string;
}

interface ProjecteContext {
  codiProjecte:       string;
  nom:                string;
  codisInstallacio:   string[];
  tags:               TagContext[];
}

interface ContextData {
  equipments?:  EquipContext[];
  fields?:      FieldContext[];
  gubimNodes?:  GubimContext[];
  projectes?:   ProjecteContext[];
  bimManual?:   string;
  pageContext?: string;
}

// ─── System prompt base ───────────────────────────────────────────────────────

const SYSTEM_BASE = `Ets l'assistent de TaulaMaster CBT, la plataforma de gestió d'instal·lacions del Consorci Besòs Tordera.

Respon sempre en català, de forma clara i concisa. Si et pregunten en castellà o anglès, respon en aquell idioma.

## Capacitats

Pots ajudar a:
- Respondre preguntes sobre el Manual BIM de CBT (tens el text complert més avall)
- Llistar o filtrar equips de la Taula Master per codi, nom o classificació GuBIMClass
- Explicar quins camps (fields) té un equip concret i quin significat tenen
- Proposar TAGs Rosmiman nous seguint el format: CODIINSTALLACIO_CODIEQUIP_CCMFUNCIODUPLICITATAT
- Consultar projectes actius i els seus TAGs
- Ajudar amb dubtes de la plataforma en general

## Format TAG Rosmiman

El TAG segueix el format: \`CODIINSTALLACIO_CODIEQUIP_CCMFUNCIODUPLICITATAT\`
- CODIINSTALLACIO: 5 caràcters (ex: ED008, GR001)
- CODIEQUIP: codi GuBIMClass de l'equip (ex: BM00, VLV0)
- CCM: comptador de 3 dígits (ex: 001, 002)
- FUNCIO: lletra de funció (ex: A=alimentació, B=bypass, R=reserva…)
- DUPLICITAT: S=simple, D=duplicat, T=triple
- AT: atribut opcional

Exemple: \`ED008_BM00_001A\`

Quan proposis TAGs nous, comprova que no existeixin ja als projectes actuals.
`;

// ─── Constructor del system prompt amb context injectat ───────────────────────

function buildSystemPrompt(ctx: ContextData): string {
  const parts: string[] = [SYSTEM_BASE];

  if (ctx.pageContext) {
    parts.push(`## Pàgina actual\nL'usuari es troba a: **${ctx.pageContext}**\n`);
  }

  // ── Equips ──
  if (ctx.equipments && ctx.equipments.length > 0) {
    const lines = ctx.equipments.map(e =>
      `- ${e.equipCode || "(sense codi)"} | ${e.equipName} | GuBIM: ${e.gubimCode}` +
      (e.fieldCols.length ? ` | camps: ${e.fieldCols.join(", ")}` : "")
    );
    parts.push(
      `## Equips de la Taula Master (${ctx.equipments.length} equips)\n\n` +
      lines.join("\n")
    );
  }

  // ── Camps (fields) ──
  if (ctx.fields && ctx.fields.length > 0) {
    const lines = ctx.fields.map(f => {
      const detalls = [
        f.codi          ? `codi: ${f.codi}`                      : null,
        f.tipus_dada    ? `tipus: ${f.tipus_dada}`                : null,
        f.cbt           ? `CBT: ${f.cbt}`                         : null,
        f.format_param  ? `format: ${f.format_param}`             : null,
        f.agrupacio_revit ? `agrupació: ${f.agrupacio_revit}`     : null,
        f.disciplina    ? `disciplina: ${f.disciplina}`           : null,
      ].filter(Boolean).join(", ");
      return `- ${f.col}${detalls ? ` (${detalls})` : ""}`;
    });
    parts.push(
      `## Diccionari de camps (fields) (${ctx.fields.length} camps)\n\n` +
      lines.join("\n")
    );
  }

  // ── GuBIMClass ──
  if (ctx.gubimNodes && ctx.gubimNodes.length > 0) {
    // Limitem a 300 nodes per no inflar el context innecessàriament
    const nodes = ctx.gubimNodes.slice(0, 300);
    const lines = nodes.map(n => `- ${n.code}: ${n.name}`);
    parts.push(
      `## Classificació GuBIMClass (${ctx.gubimNodes.length} nodes, mostrant ${nodes.length})\n\n` +
      lines.join("\n")
    );
  }

  // ── Projectes i TAGs ──
  if (ctx.projectes && ctx.projectes.length > 0) {
    const pLines: string[] = [];
    for (const p of ctx.projectes) {
      pLines.push(`### Projecte ${p.codiProjecte} — ${p.nom}`);
      pLines.push(`Instal·lacions: ${p.codisInstallacio.join(", ") || "(cap)"}`);
      if (p.tags.length > 0) {
        pLines.push(`TAGs (${p.tags.length}):`);
        for (const t of p.tags) {
          pLines.push(
            `  - ${t.tagComplet} [${t.status}]` +
            (t.descripcioEquip ? ` — ${t.descripcioEquip}` : "")
          );
        }
      } else {
        pLines.push("(sense TAGs)");
      }
    }
    parts.push(`## Projectes actius\n\n${pLines.join("\n")}`);
  }

  // ── Manual BIM ──
  if (ctx.bimManual && ctx.bimManual.trim().length > 100) {
    // Limitem a 30.000 cars per deixar tokens per als equips i la conversa
    const manualTallat = ctx.bimManual.slice(0, 30_000);
    const truncat = ctx.bimManual.length > 30_000
      ? "\n[... text truncat per límit de context ...]"
      : "";
    parts.push(
      `## Manual BIM CBT (text complet del document)\n\n${manualTallat}${truncat}`
    );
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

  let body: { messages?: MissatgeAPI[]; context?: ContextData };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Body invàlid" }), { status: 400, headers });
  }

  const missatgesUsuari = body.messages ?? [];
  if (!Array.isArray(missatgesUsuari) || missatgesUsuari.length === 0) {
    return new Response(JSON.stringify({ error: "Cap missatge rebut" }), { status: 400, headers });
  }

  const ctx = body.context ?? {};

  // Si el client no ha enviat el text del manual, intentem obtenir-lo des de
  // la nostra pròpia funció /api/bim-manual-text (self-call dins Vercel)
  if (!ctx.bimManual) {
    try {
      const baseUrl = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:5173";
      const manualRes = await fetch(`${baseUrl}/api/bim-manual-text`, {
        signal: AbortSignal.timeout(5_000), // màxim 5 s
      });
      if (manualRes.ok) {
        const manualData = await manualRes.json() as { text?: string };
        if (manualData.text) ctx.bimManual = manualData.text;
      }
    } catch {
      // Si falla (cold start, etc.) continuem sense el manual
    }
  }

  const systemPrompt = buildSystemPrompt(ctx);

  // Limita el context a les últimes 20 torns
  const missatgesTallats = missatgesUsuari.slice(-20);

  try {
    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${groqApiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: 1024,
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
