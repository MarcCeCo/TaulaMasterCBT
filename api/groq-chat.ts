// api/groq-chat.ts
// Vercel Edge Function — proxy segur per a la Groq API.
// La clau GROQ_API_KEY mai surt al client.
//
// FIX 413: Limitem el context per no superar el límit de 12.000 TPM de Groq.
// Estratègia:
//  - Equips:    màx 80 (amb camps truncats)
//  - Fields:    màx 60
//  - GuBIM:     màx 80 nodes
//  - Projectes: màx 5 projectes, màx 30 TAGs per projecte
//  - BIM Manual: màx 4.000 caràcters (resum)
//  - Historial: màx 6 torns (últimes 12 línies)
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
  col:             string;
  codi:            string | null;
  tipus_dada:      string | null;
  cbt:             string | null;
  format_param:    string | null;
  agrupacio_revit: string | null;
  disciplina:      string | null;
}

interface GubimContext {
  code: string;
  name: string;
}

interface TagContext {
  tagComplet:      string;
  codiInstallacio: string;
  ccm:             string;
  funcio:          string;
  duplicitat:      string;
  status:          string;
  descripcioEquip: string;
}

interface ProjecteContext {
  codiProjecte:      string;
  nom:               string;
  codisInstallacio:  string[];
  tags:              TagContext[];
}

interface ContextData {
  equipments?:  EquipContext[];
  fields?:      FieldContext[];
  gubimNodes?:  GubimContext[];
  projectes?:   ProjecteContext[];
  bimManual?:   string;
  pageContext?: string;
}

// ─── Límits de context (ajusta'ls si cal) ─────────────────────────────────────
const MAX_EQUIPS      = 80;
const MAX_FIELDS      = 60;
const MAX_GUBIM       = 80;
const MAX_PROJECTES   = 5;
const MAX_TAGS_PER_P  = 30;
const MAX_BIM_CHARS   = 4_000;
const MAX_TORNS       = 6;   // últims N missatges de la conversa

// ─── System prompt base ───────────────────────────────────────────────────────

const SYSTEM_BASE = `Ets l'assistent de TaulaMaster CBT, la plataforma de gestió d'instal·lacions del Consorci Besòs Tordera.

Respon sempre en català, de forma clara i concisa. Si et pregunten en castellà o anglès, respon en aquell idioma.

## Capacitats

Pots ajudar a:
- Respondre preguntes sobre el Manual BIM de CBT
- Llistar o filtrar equips de la Taula Master per codi, nom o classificació GuBIMClass
- Explicar quins camps (fields) té un equip concret
- Proposar TAGs Rosmiman nous seguint el format: CODIINSTALLACIO_CODIEQUIP_CCMFUNCIODUPLICITATAT
- Consultar projectes actius i els seus TAGs
- Ajudar amb dubtes de la plataforma en general

## Format TAG Rosmiman

\`CODIINSTALLACIO_CODIEQUIP_CCMFUNCIODUPLICITATAT\`
- CODIINSTALLACIO: 5 caràcters (ex: ED008, GR001)
- CODIEQUIP: codi GuBIMClass (ex: BM00, VLV0)
- CCM: comptador 3 dígits (ex: 001)
- FUNCIO: A=alimentació, B=bypass, R=reserva…
- DUPLICITAT: S=simple, D=duplicat, T=triple

Exemple: \`ED008_BM00_001A\`

Quan proposis TAGs nous, comprova que no existeixin als projectes actuals.
`;

// ─── Constructor del system prompt (context limitat) ─────────────────────────

function buildSystemPrompt(ctx: ContextData): string {
  const parts: string[] = [SYSTEM_BASE];

  if (ctx.pageContext) {
    parts.push(`## Pàgina actual\nL'usuari es troba a: **${ctx.pageContext}**`);
  }

  // ── Equips (màx MAX_EQUIPS) ──
  if (ctx.equipments && ctx.equipments.length > 0) {
    const mostrats = ctx.equipments.slice(0, MAX_EQUIPS);
    const lines = mostrats.map(e =>
      `- ${e.equipCode || "(s/c)"} | ${e.equipName} | GuBIM: ${e.gubimCode}`
    );
    const nota = ctx.equipments.length > MAX_EQUIPS
      ? `\n_(mostrant ${MAX_EQUIPS} de ${ctx.equipments.length} equips)_`
      : "";
    parts.push(`## Equips (${mostrats.length})\n\n${lines.join("\n")}${nota}`);
  }

  // ── Camps (màx MAX_FIELDS) ──
  if (ctx.fields && ctx.fields.length > 0) {
    const mostrats = ctx.fields.slice(0, MAX_FIELDS);
    const lines = mostrats.map(f => {
      const d = [
        f.codi       ? `codi: ${f.codi}`        : null,
        f.tipus_dada ? `tipus: ${f.tipus_dada}`  : null,
        f.disciplina ? `disc: ${f.disciplina}`   : null,
      ].filter(Boolean).join(", ");
      return `- ${f.col}${d ? ` (${d})` : ""}`;
    });
    const nota = ctx.fields.length > MAX_FIELDS
      ? `\n_(mostrant ${MAX_FIELDS} de ${ctx.fields.length} camps)_`
      : "";
    parts.push(`## Camps (${mostrats.length})\n\n${lines.join("\n")}${nota}`);
  }

  // ── GuBIMClass (màx MAX_GUBIM) ──
  if (ctx.gubimNodes && ctx.gubimNodes.length > 0) {
    const nodes = ctx.gubimNodes.slice(0, MAX_GUBIM);
    const lines = nodes.map(n => `- ${n.code}: ${n.name}`);
    parts.push(`## GuBIMClass (${nodes.length} nodes)\n\n${lines.join("\n")}`);
  }

  // ── Projectes i TAGs (màx MAX_PROJECTES projectes, MAX_TAGS_PER_P tags) ──
  if (ctx.projectes && ctx.projectes.length > 0) {
    const mostrats = ctx.projectes.slice(0, MAX_PROJECTES);
    const pLines: string[] = [];
    for (const p of mostrats) {
      pLines.push(`### ${p.codiProjecte} — ${p.nom}`);
      const tags = p.tags.slice(0, MAX_TAGS_PER_P);
      if (tags.length > 0) {
        pLines.push(tags.map(t =>
          `  - ${t.tagComplet} [${t.status}]${t.descripcioEquip ? ` — ${t.descripcioEquip}` : ""}`
        ).join("\n"));
        if (p.tags.length > MAX_TAGS_PER_P) {
          pLines.push(`  _(+${p.tags.length - MAX_TAGS_PER_P} TAGs omesos)_`);
        }
      } else {
        pLines.push("  (sense TAGs)");
      }
    }
    parts.push(`## Projectes actius\n\n${pLines.join("\n")}`);
  }

  // ── Manual BIM (màx MAX_BIM_CHARS) ──
  if (ctx.bimManual && ctx.bimManual.trim().length > 100) {
    const text = ctx.bimManual.slice(0, MAX_BIM_CHARS);
    const truncat = ctx.bimManual.length > MAX_BIM_CHARS
      ? "\n[... text truncat — demana detalls específics ...]"
      : "";
    parts.push(`## Manual BIM CBT (resum)\n\n${text}${truncat}`);
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

  // Self-call per obtenir el Manual BIM (si no ve del client)
  if (!ctx.bimManual) {
    try {
      const baseUrl = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:5173";
      const manualRes = await fetch(`${baseUrl}/api/bim-manual-text`, {
        signal: AbortSignal.timeout(5_000),
      });
      if (manualRes.ok) {
        const manualData = await manualRes.json() as { text?: string };
        if (manualData.text) ctx.bimManual = manualData.text;
      }
    } catch {
      // Continua sense manual si falla
    }
  }

  const systemPrompt = buildSystemPrompt(ctx);

  // Limita l'historial als últims MAX_TORNS missatges
  const missatgesTallats = missatgesUsuari.slice(-MAX_TORNS);

  try {
    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${groqApiKey}`,
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
