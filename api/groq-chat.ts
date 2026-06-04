// api/groq-chat.ts
// Vercel Serverless Function — Agent IA amb Function Calling + RAG
//
// Flux:
//   1. Rep la pregunta
//   2. Crida Groq amb tools disponibles (SQL directe a Supabase)
//   3. Si el model crida una tool → executa la consulta SQL → retorna resultat
//   4. Segona crida a Groq amb el resultat de la tool → resposta final
//   5. RAG vectorial (Voyage AI) com a complement semàntic
// ─────────────────────────────────────────────────────────────────────────────

import type { VercelRequest, VercelResponse } from "@vercel/node";

// ─── Tipus ────────────────────────────────────────────────────────────────────

interface MissatgeAPI {
  role: string;
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface RagResult {
  id: string;
  tipus: string;
  contingut: string;
  metadata: Record<string, unknown>;
  similitud: number;
}

// ─── Tools disponibles per al model ──────────────────────────────────────────

const TOOLS = [
  {
    type: "function",
    function: {
      name: "cerca_equips",
      description: "Cerca equips al catàleg Taula Master per nom, codi d'equip o GuBIMClass. Usa quan l'usuari pregunta sobre tipologies d'equips, quins equips hi ha, codis d'equip, etc.",
      parameters: {
        type: "object",
        properties: {
          nom: { type: "string", description: "Paraula clau del nom de l'equip (ex: 'bomba', 'vàlvula', 'motor')" },
          equip_code: { type: "string", description: "Codi exacte de l'equip (ex: 'BM00')" },
          gubim_code: { type: "string", description: "Codi GuBIMClass (ex: 'BM00')" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cerca_projecte",
      description: "Obté informació d'un projecte: nom, estat, codis d'instal·lació. Usa quan l'usuari menciona un projecte pel nom o codi (format NNNN-N).",
      parameters: {
        type: "object",
        required: [],
        properties: {
          codi_projecte: { type: "string", description: "Codi del projecte format NNNN-N (ex: '2024-1')" },
          nom: { type: "string", description: "Nom o part del nom del projecte (ex: 'prova', 'EDAR')" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cerca_tags_projecte",
      description: "Llista els TAGs Rosmiman d'un projecte concret. Usa quan l'usuari pregunta pels TAGs d'un projecte.",
      parameters: {
        type: "object",
        required: ["codi_projecte"],
        properties: {
          codi_projecte: { type: "string", description: "Codi del projecte (ex: '2024-1')" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "primer_tag_disponible",
      description: "Calcula el primer TAG Rosmiman disponible (no usat) per a un equip en una instal·lació. Usa quan l'usuari demana quin TAG pot assignar o quin és el primer lliure.",
      parameters: {
        type: "object",
        required: ["codi_installacio", "codi_equip"],
        properties: {
          codi_installacio: { type: "string", description: "Codi instal·lació 5 car. (ex: 'ED001')" },
          codi_equip: { type: "string", description: "Codi GuBIMClass de l'equip (ex: 'BCS0')" },
          ccm: { type: "number", description: "CCM 0-9, per defecte 1" },
          funcio: { type: "number", description: "Funció 01-99, per defecte 1" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cerca_tags_rosmiman",
      description: "Cerca TAGs al llistat Rosmiman global per instal·lació o equip. Usa per verificar si un TAG existeix o llistar TAGs d'una instal·lació.",
      parameters: {
        type: "object",
        properties: {
          codi_installacio: { type: "string", description: "Codi instal·lació (ex: 'ED001')" },
          codi_equip: { type: "string", description: "Codi GuBIMClass (ex: 'BCS0')" },
          tag_exacte: { type: "string", description: "TAG complet per verificar si existeix (ex: 'ED001_BCS0_101A')" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cerca_installacio",
      description: "Cerca el codi d'instal·lació per nom. Usa SEMPRE quan l'usuari menciona una instal·lació pel nom (ex: 'Caldes de Montbui', 'EDAR Montornès') en lloc del codi exacte. MAI inventes codis d'instal·lació.",
      parameters: {
        type: "object",
        required: ["nom"],
        properties: {
          nom: { type: "string", description: "Nom o part del nom de la instal·lació (ex: 'Caldes', 'Montornès', 'EDAR')" },
        },
      },
    },
  },
      description: "Cerca codis i noms GuBIMClass. Usa quan l'usuari pregunta sobre la classificació BIM d'un tipus d'equip.",
      parameters: {
        type: "object",
        properties: {
          nom: { type: "string", description: "Paraula clau del nom GuBIMClass" },
          codi: { type: "string", description: "Codi GuBIMClass exacte" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cerca_camps",
      description: "Cerca camps del diccionari de paràmetres BIM. Usa quan l'usuari pregunta sobre quins paràmetres o camps té un equip.",
      parameters: {
        type: "object",
        properties: {
          nom: { type: "string", description: "Paraula clau del nom del camp" },
          disciplina: { type: "string", description: "Disciplina (ex: 'MEP', 'HVAC')" },
        },
      },
    },
  },
];

// ─── Executors de tools ───────────────────────────────────────────────────────

async function supaGet(supaUrl: string, supaKey: string, path: string): Promise<unknown[]> {
  const r = await fetch(`${supaUrl}/rest/v1/${path}`, {
    headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}` },
  });
  if (!r.ok) return [];
  return r.json();
}

async function executaTool(
  name: string,
  args: Record<string, unknown>,
  supaUrl: string,
  supaKey: string
): Promise<string> {
  try {
    switch (name) {

      case "cerca_equips": {
        const filtres: string[] = ["select=equip_code,equip_name,gubim_code,revit_category", "order=equip_name.asc", "limit=50"];
        if (args.nom) {
          // Normalitzar: treure terminacions plurals/variants per fer stemming bàsic
          // bombes→bomb, vàlvules→vàlvul, motors→motor, filtres→filtr, etc.
          const nom = (args.nom as string)
            .toLowerCase()
            .replace(/es$/, "")   // bombes → bomb
            .replace(/s$/, "")    // motors → motor
            .replace(/ió$/, "")   // instal·lació → instal·laci
            .trim();
          filtres.push(`equip_name=ilike.${encodeURIComponent("*" + nom + "*")}`);
        }
        if (args.equip_code) filtres.push(`equip_code=eq.${encodeURIComponent(args.equip_code as string)}`);
        if (args.gubim_code) filtres.push(`gubim_code=eq.${encodeURIComponent(args.gubim_code as string)}`);
        const rows = await supaGet(supaUrl, supaKey, `equipments?${filtres.join("&")}`) as { equip_code: string; equip_name: string; gubim_code: string; revit_category: string }[];
        if (!rows.length) return "No s'han trobat equips amb aquests criteris.";
        return `Equips trobats (${rows.length}):\n` + rows.map(e => `- ${e.equip_code}: ${e.equip_name} | GuBIMClass: ${e.gubim_code}${e.revit_category ? ` | Revit: ${e.revit_category}` : ""}`).join("\n");
      }

      case "cerca_projecte": {
        const filtres: string[] = ["select=id,codi_projecte,nom,status,codi_installacio,codis_installacio", "limit=5"];
        if (args.codi_projecte) filtres.push(`codi_projecte=eq.${encodeURIComponent(args.codi_projecte as string)}`);
        else if (args.nom)      filtres.push(`nom=ilike.${encodeURIComponent("*" + args.nom + "*")}`);
        const rows = await supaGet(supaUrl, supaKey, `projectes?${filtres.join("&")}`) as { id: string; codi_projecte: string; nom: string; status: string; codi_installacio: string; codis_installacio: {codi:string;nom:string}[]|null }[];
        if (!rows.length) return "No s'ha trobat cap projecte amb aquests criteris.";
        return rows.map(p => {
          const codis = p.codis_installacio?.map(c => c.nom ? `${c.codi} (${c.nom})` : c.codi).join(", ") ?? p.codi_installacio;
          return `Projecte ${p.codi_projecte}: "${p.nom}" | Estat: ${p.status} | Codis instal·lació: ${codis}`;
        }).join("\n");
      }

      case "cerca_tags_projecte": {
        // Primer obtenim l'id del projecte
        const prRows = await supaGet(supaUrl, supaKey,
          `projectes?select=id,nom&codi_projecte=eq.${encodeURIComponent(args.codi_projecte as string)}&limit=1`
        ) as { id: string; nom: string }[];
        if (!prRows.length) return `No existeix el projecte ${args.codi_projecte}.`;
        const tags = await supaGet(supaUrl, supaKey,
          `projecte_tags?select=tag_complet,status,descripcio_equip,codi_installacio&projecte_id=eq.${encodeURIComponent(prRows[0].id)}&order=tag_complet.asc&limit=500`
        ) as { tag_complet: string; status: string; descripcio_equip: string; codi_installacio: string }[];
        if (!tags.length) return `El projecte ${args.codi_projecte} "${prRows[0].nom}" no té TAGs assignats.`;
        const resum = tags.map(t => `- ${t.tag_complet} | ${t.status}${t.descripcio_equip ? ` | ${t.descripcio_equip}` : ""}`).join("\n");
        return `TAGs del projecte ${args.codi_projecte} "${prRows[0].nom}" (${tags.length} TAGs):\n${resum}`;
      }

      case "primer_tag_disponible": {
        const codiInst = (args.codi_installacio as string).toUpperCase();
        const codiEq   = (args.codi_equip as string).toUpperCase();
        const ccm      = (args.ccm as number) ?? 1;
        const funcio   = (args.funcio as number) ?? 1;
        const prefix   = `${codiInst}_${codiEq}_${ccm}${String(funcio).padStart(2, "0")}`;

        const [rosmiman, projecteTags] = await Promise.all([
          supaGet(supaUrl, supaKey, `rosmiman_equips?select=tag&tag=like.${encodeURIComponent(codiInst + "_" + codiEq + "_%")}&limit=500`) as Promise<{tag:string}[]>,
          supaGet(supaUrl, supaKey, `projecte_tags?select=tag_complet&tag_complet=like.${encodeURIComponent(codiInst + "_" + codiEq + "_%")}&limit=500`) as Promise<{tag_complet:string}[]>,
        ]);

        const usats = new Set([
          ...(rosmiman as {tag:string}[]).map(r => r.tag),
          ...(projecteTags as {tag_complet:string}[]).map(r => r.tag_complet),
        ]);

        let primerLliure = "";
        outer: for (let fn = funcio; fn <= 99; fn++) {
          for (const ll of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
            const candidat = `${codiInst}_${codiEq}_${ccm}${String(fn).padStart(2, "0")}${ll}`;
            if (!usats.has(candidat)) { primerLliure = candidat; break outer; }
          }
        }

        const existents = [...usats].filter(t => t.startsWith(prefix)).sort();
        return [
          `Cerca de TAG per: instal·lació=${codiInst}, equip=${codiEq}, CCM=${ccm}, funció=${funcio}`,
          `TAGs existents amb prefix ${codiInst}_${codiEq}_: ${existents.length > 0 ? existents.join(", ") : "cap"}`,
          `Primer TAG disponible: ${primerLliure || "no disponible (A-Z exhaurits)"}`,
        ].join("\n");
      }

      case "cerca_tags_rosmiman": {
        const filtres: string[] = ["select=tag,descripcio,codi_installacio", "order=tag.asc", "limit=100"];
        if (args.tag_exacte) {
          filtres.push(`tag=eq.${encodeURIComponent(args.tag_exacte as string)}`);
        } else {
          if (args.codi_installacio) filtres.push(`codi_installacio=eq.${encodeURIComponent((args.codi_installacio as string).toUpperCase())}`);
          if (args.codi_equip) {
            const ci = (args.codi_installacio as string ?? "").toUpperCase();
            const ce = (args.codi_equip as string).toUpperCase();
            filtres.push(`tag=like.${encodeURIComponent((ci ? ci + "_" : "") + ce + "_%")}`);
          }
        }
        const rows = await supaGet(supaUrl, supaKey, `rosmiman_equips?${filtres.join("&")}`) as {tag:string;descripcio:string}[];
        if (!rows.length) {
          if (args.tag_exacte) return `El TAG ${args.tag_exacte} NO existeix al llistat Rosmiman.`;
          return "No s'han trobat TAGs amb aquests criteris.";
        }
        if (args.tag_exacte) return `El TAG ${args.tag_exacte} SÍ existeix al llistat Rosmiman: ${rows[0].descripcio || "(sense descripció)"}`;
        return `TAGs Rosmiman trobats (${rows.length}):\n` + rows.map(r => `- ${r.tag}${r.descripcio ? `: ${r.descripcio}` : ""}`).join("\n");
      }

      case "cerca_installacio": {
        // Busca codis d'instal·lació a projectes i a rosmiman_equips
        const [projRows, rosmimanRows] = await Promise.all([
          supaGet(supaUrl, supaKey,
            `projectes?select=codi_projecte,nom,codi_installacio,codis_installacio&nom=ilike.${encodeURIComponent("*" + args.nom + "*")}&limit=10`
          ) as Promise<{codi_projecte:string;nom:string;codi_installacio:string;codis_installacio:{codi:string;nom:string}[]|null}[]>,
          supaGet(supaUrl, supaKey,
            `rosmiman_equips?select=codi_installacio&codi_installacio=not.is.null&limit=1000`
          ) as Promise<{codi_installacio:string}[]>,
        ]);

        const resultats: string[] = [];

        if (projRows.length > 0) {
          projRows.forEach(p => {
            const codis = p.codis_installacio?.map(c => c.nom ? `${c.codi} (${c.nom})` : c.codi).join(", ") ?? p.codi_installacio;
            resultats.push(`Projecte "${p.nom}" (${p.codi_projecte}): codis instal·lació = ${codis}`);
          });
        }

        // Buscar també als noms de codis_installacio de tots els projectes
        const totsProjRows = await supaGet(supaUrl, supaKey,
          `projectes?select=codi_projecte,nom,codi_installacio,codis_installacio&limit=200`
        ) as {codi_projecte:string;nom:string;codi_installacio:string;codis_installacio:{codi:string;nom:string}[]|null}[];

        const nomBuscat = (args.nom as string).toLowerCase();
        totsProjRows.forEach(p => {
          if (p.codis_installacio) {
            p.codis_installacio.forEach(c => {
              if (c.nom && c.nom.toLowerCase().includes(nomBuscat)) {
                resultats.push(`Instal·lació "${c.nom}": codi = ${c.codi} (projecte ${p.codi_projecte} "${p.nom}")`);
              }
            });
          }
        });

        if (resultats.length === 0) {
          return `No s'ha trobat cap instal·lació amb el nom "${args.nom}". Demana a l'usuari el codi exacte de 5 caràcters.`;
        }
        return `Instal·lacions trobades:\n${[...new Set(resultats)].join("\n")}`;
      }


        const filtres: string[] = ["select=code,name", "order=code.asc", "limit=50"];
        if (args.nom) {
          const nom = (args.nom as string).toLowerCase().replace(/es$/, "").replace(/s$/, "").trim();
          filtres.push(`name=ilike.${encodeURIComponent("*" + nom + "*")}`);
        }
        if (args.codi) filtres.push(`code=eq.${encodeURIComponent(args.codi as string)}`);
        const rows = await supaGet(supaUrl, supaKey, `gubim_class?${filtres.join("&")}`) as {code:string;name:string}[];
        if (!rows.length) return "No s'ha trobat cap codi GuBIMClass amb aquests criteris.";
        return `GuBIMClass trobats (${rows.length}):\n` + rows.map(r => `- ${r.code}: ${r.name}`).join("\n");
      }

      case "cerca_camps": {
        const filtres: string[] = ["select=col,codi,tipus_dada,disciplina,agrupacio_revit", "order=col.asc", "limit=50"];
        if (args.nom) {
          const nom = (args.nom as string).toLowerCase().replace(/es$/, "").replace(/s$/, "").trim();
          filtres.push(`col=ilike.${encodeURIComponent("*" + nom + "*")}`);
        }
        if (args.disciplina) filtres.push(`disciplina=ilike.${encodeURIComponent("*" + args.disciplina + "*")}`);
        const rows = await supaGet(supaUrl, supaKey, `fields?${filtres.join("&")}`) as {col:string;codi:string;tipus_dada:string;disciplina:string}[];
        if (!rows.length) return "No s'han trobat camps amb aquests criteris.";
        return `Camps trobats (${rows.length}):\n` + rows.map(r => `- ${r.col}${r.codi ? ` (${r.codi})` : ""}${r.tipus_dada ? ` | ${r.tipus_dada}` : ""}${r.disciplina ? ` | ${r.disciplina}` : ""}`).join("\n");
      }

      default:
        return `Tool desconeguda: ${name}`;
    }
  } catch (err) {
    return `Error executant ${name}: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// ─── Embedding + RAG ──────────────────────────────────────────────────────────

async function embedQuery(text: string, voyageKey: string): Promise<number[]> {
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${voyageKey}` },
    body: JSON.stringify({ model: "voyage-3", input: [text], input_type: "query" }),
  });
  if (!res.ok) throw new Error(`Voyage AI ${res.status}: ${await res.text()}`);
  const data = await res.json() as { data: { embedding: number[] }[] };
  return data.data[0].embedding;
}

async function cercaRag(queryEmbedding: number[], supaUrl: string, supaKey: string, matchCount = 8): Promise<RagResult[]> {
  const res = await fetch(`${supaUrl}/rest/v1/rpc/cerca_rag`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: supaKey, Authorization: `Bearer ${supaKey}` },
    body: JSON.stringify({ query_embedding: queryEmbedding, match_count: matchCount }),
  });
  if (!res.ok) return [];
  return res.json() as Promise<RagResult[]>;
}

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Ets l'assistent de TaulaMaster CBT, la plataforma de gestió d'actius i instal·lacions del Consorci Besòs Tordera (CBT).

Respon sempre en català. Si et pregunten en castellà o anglès, respon en aquell idioma.

Tens accés a les següents eines per consultar la base de dades en temps real:
- \`cerca_equips\`: tipologies d'equips del catàleg
- \`cerca_installacio\`: busca el codi d'instal·lació pel nom. USA SEMPRE quan l'usuari mencioni una instal·lació pel nom
- \`cerca_projecte\`: informació de projectes (nom, estat, codis d'instal·lació)
- \`cerca_tags_projecte\`: TAGs assignats a un projecte
- \`primer_tag_disponible\`: calcula el primer TAG Rosmiman lliure
- \`cerca_tags_rosmiman\`: verifica si un TAG existeix al llistat global
- \`cerca_gubim\`: codis GuBIMClass
- \`cerca_camps\`: diccionari de paràmetres BIM

REGLES CRÍTIQUES:
1. MAI inventes codis d'instal·lació, codis d'equip, TAGs o noms. Si no el trobes a la BD, pregunta a l'usuari.
2. Quan l'usuari mencioni una instal·lació pel nom (ex: "Caldes de Montbui"), crida SEMPRE \`cerca_installacio\` per obtenir el codi real.
3. Quan l'usuari faci una pregunta de seguiment ("penja del CCM 2", "i per la instal·lació X?"), mantén el context de la conversa anterior: recorda l'equip, instal·lació i paràmetres discutits.
4. Si en un torn anterior has identificat un codi d'equip o instal·lació, usa'l en els torns següents sense tornar a preguntar.
5. Per calcular TAGs, primer verifica el codi d'equip amb \`cerca_equips\` i el codi d'instal·lació amb \`cerca_installacio\` si no els tens confirmats.

FORMAT TAG ROSMIMAN: \`CODIINSTALLACIO_CODIEQUIP_CCM+FUNCIO(2digits)+DUPLICITAT\`
- CODIINSTALLACIO: 5 car. exactes (ex: ED008) — SEMPRE verificat a la BD
- CODIEQUIP: codi GuBIMClass (ex: BM00) — SEMPRE verificat a la BD
- CCM: 1 dígit (0-9)
- FUNCIO: 2 dígits (01-99, mai 00)
- DUPLICITAT: A-Z seqüencial
Exemple: \`ED008_BM00_101A\`

CICLE DE VIDA TAG: pendent → validat / rebutjat → pendent
Quan tots els TAGs d'un projecte es validen → s'afegeixen automàticament al llistat Rosmiman global.`;

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST")   { res.status(405).json({ error: "Mètode no permès" }); return; }

  const groqKey   = process.env.GROQ_API_KEY;
  const voyageKey = process.env.VOYAGE_API_KEY;
  const supaUrl   = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const supaKey   = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!groqKey)   { res.status(500).json({ error: "Falta GROQ_API_KEY" }); return; }
  if (!voyageKey) { res.status(500).json({ error: "Falta VOYAGE_API_KEY" }); return; }
  if (!supaUrl)   { res.status(500).json({ error: "Falta SUPABASE_URL" }); return; }
  if (!supaKey)   { res.status(500).json({ error: "Falta SUPABASE_SERVICE_ROLE_KEY" }); return; }

  let body: { messages?: MissatgeAPI[]; context?: { pageContext?: string } };
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    res.status(400).json({ error: "Body invàlid" }); return;
  }

  const missatgesUsuari = body.messages ?? [];
  if (!Array.isArray(missatgesUsuari) || missatgesUsuari.length === 0) {
    res.status(400).json({ error: "Cap missatge rebut" }); return;
  }

  const ultimaPregunta = missatgesUsuari.filter(m => m.role === "user").at(-1)?.content ?? "";

  // ── RAG (semàntic — complement per preguntes conceptuals) ──────────────────
  let ragContext = "";
  try {
    const embedding = await embedQuery(ultimaPregunta, voyageKey);
    const ragResults = await cercaRag(embedding, supaUrl, supaKey, 8);
    if (ragResults.length > 0) {
      const lines = ragResults
        .filter(r => r.similitud > 0.85) // només resultats prou rellevants
        .map(r => `[${r.tipus.toUpperCase()} ${(r.similitud*100).toFixed(0)}%] ${r.contingut}`);
      if (lines.length > 0) ragContext = `\n\n## Context semàntic addicional\n${lines.join("\n")}`;
    }
  } catch (err) {
    console.error("RAG error:", err);
  }

  const systemContent = SYSTEM_PROMPT + (body.context?.pageContext ? `\n\nPàgina actual: ${body.context.pageContext}` : "") + ragContext;

  // Historial limitat a 6 torns
  const historial: MissatgeAPI[] = [
    { role: "system", content: systemContent },
    ...missatgesUsuari.slice(-6),
  ];

  try {
    // ── Primera crida a Groq (amb tools) ──────────────────────────────────────
    const groqRes1 = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${groqKey}` },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: 1000,
        temperature: 0.1,
        tools: TOOLS,
        tool_choice: "auto",
        messages: historial,
      }),
    });

    if (!groqRes1.ok) {
      const err = await groqRes1.text();
      res.status(502).json({ error: `Error Groq: ${groqRes1.status} — ${err}` }); return;
    }

    const data1 = await groqRes1.json() as {
      choices: { message: MissatgeAPI; finish_reason: string }[];
    };

    const missatgeAssistent = data1.choices[0].message;

    // ── Si el model crida tools → executar i fer segona crida ─────────────────
    if (data1.choices[0].finish_reason === "tool_calls" && missatgeAssistent.tool_calls?.length) {
      const toolMessages: MissatgeAPI[] = [];

      // Executar totes les tool calls en paral·lel
      const resultats = await Promise.all(
        missatgeAssistent.tool_calls.map(async tc => {
          const args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
          const resultat = await executaTool(tc.function.name, args, supaUrl!, supaKey!);
          return { id: tc.id, name: tc.function.name, resultat };
        })
      );

      resultats.forEach(r => {
        toolMessages.push({
          role: "tool",
          tool_call_id: r.id,
          name: r.name,
          content: r.resultat,
        });
      });

      // Segona crida amb els resultats de les tools
      const groqRes2 = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${groqKey}` },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          max_tokens: 1000,
          temperature: 0.1,
          messages: [
            ...historial,
            missatgeAssistent,
            ...toolMessages,
          ],
        }),
      });

      if (!groqRes2.ok) {
        const err = await groqRes2.text();
        res.status(502).json({ error: `Error Groq 2a crida: ${groqRes2.status} — ${err}` }); return;
      }

      const data2 = await groqRes2.json() as {
        choices: { message: { content: string } }[];
      };

      res.status(200).json({ reply: data2.choices[0].message.content ?? "" }); return;
    }

    // ── Resposta directa sense tool calls ─────────────────────────────────────
    res.status(200).json({ reply: missatgeAssistent.content ?? "" }); return;

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg }); return;
  }
}
