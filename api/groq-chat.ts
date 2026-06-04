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
      description: "Cerca equips al catàleg Taula Master per nom, tipus, codi d'equip o GuBIMClass. Usa quan l'usuari pregunta sobre tipologies d'equips, quins equips hi ha, codis d'equip, etc.",
      parameters: {
        type: "object",
        properties: {
          nom: { type: "string", description: "Paraula clau o frase del nom/tipus de l'equip (ex: 'bomba', 'vàlvula', 'bomba centrífuga de cambra seca')" },
          tipus: { type: "string", description: "Àlies de nom: tipus o descripció de l'equip (ex: 'bomba centrífuga', 'motor elèctric')" },
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
      description: "Cerca instal·lacions per nom a la taula visor3d_installacions. Usa SEMPRE quan l'usuari mencioni una instal·lació pel nom (ex: 'Caldes de Montbui', 'EDAR Montornès'). Retorna codi_installacio (ex: ED008) i nom. MAI inventes codis.",
      parameters: {
        type: "object",
        required: ["nom"],
        properties: {
          nom: { type: "string", description: "Nom o part del nom de la instal·lació (ex: 'Caldes', 'Montornès', 'EDAR')" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cerca_gubim",
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

// Fetch wrapper: retorna array buit si la resposta no és ok, llança si hi ha excepció de xarxa
async function supaGet(supaUrl: string, supaKey: string, path: string): Promise<unknown[]> {
  const r = await fetch(`${supaUrl}/rest/v1/${path}`, {
    headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}` },
  });
  if (!r.ok) {
    console.error(`supaGet error ${r.status} per a: ${path}`);
    return [];
  }
  return r.json();
}

// Utilitat: cerca flexible per paraules (AND) amb fallback a OR
// Retorna true si el text conté totes les paraules del terme buscat
// Si el mode és "or", en té prou amb una sola paraula
function coincideixFlexible(text: string, termes: string[], mode: "and" | "or" = "and"): boolean {
  const t = text.toLowerCase();
  return mode === "and"
    ? termes.every(p => t.includes(p))
    : termes.some(p => t.includes(p));
}

// Extreu paraules significatives d'una frase (>2 car., sense stop words)
function paraulesCerca(frase: string): string[] {
  const STOP = new Set(["de", "del", "la", "el", "els", "les", "i", "a", "al", "des", "per", "amb", "una", "uns", "uns"]);
  const paraules = frase.toLowerCase().trim().split(/\s+/).filter(p => p.length > 2 && !STOP.has(p));
  return paraules.length > 0 ? paraules : [frase.toLowerCase().trim()];
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
        // Acceptar "nom", "tipus" o "keyword" com a àlies (el model de vegades varia el nom del paràmetre)
        const cercaNomRaw = (args.nom ?? args.tipus ?? args.keyword ?? args.equip_name) as string | undefined;

        // Si no hi ha cap filtre, retornar tots (llista completa)
        if (!cercaNomRaw && !args.equip_code && !args.gubim_code) {
          const tots = await supaGet(supaUrl, supaKey, "equipments?select=equip_code,equip_name,gubim_code,revit_category&order=equip_name.asc&limit=200") as { equip_code: string; equip_name: string; gubim_code: string; revit_category: string }[];
          if (!tots.length) return "El catàleg d'equips és buit.";
          return `Catàleg complet (${tots.length} equips):\n` + tots.map(e => `- ${e.equip_code}: ${e.equip_name} | GuBIMClass: ${e.gubim_code}`).join("\n");
        }

        let rows: { equip_code: string; equip_name: string; gubim_code: string; revit_category: string }[] = [];

        // Cerca per codi exacte (prioritat màxima)
        if (args.equip_code) {
          rows = await supaGet(supaUrl, supaKey, `equipments?select=equip_code,equip_name,gubim_code,revit_category&equip_code=eq.${encodeURIComponent(args.equip_code as string)}`) as typeof rows;
        }
        if (args.gubim_code && !rows.length) {
          rows = await supaGet(supaUrl, supaKey, `equipments?select=equip_code,equip_name,gubim_code,revit_category&gubim_code=eq.${encodeURIComponent(args.gubim_code as string)}`) as typeof rows;
        }

        // Cerca per nom: 3 estratègies en cascada fins que troba resultats
        if (cercaNomRaw && !rows.length) {
          const termes = paraulesCerca(cercaNomRaw);

          // Estratègia 1: frase completa ilike
          const fraseUrl = `equipments?select=equip_code,equip_name,gubim_code,revit_category&equip_name=ilike.${encodeURIComponent("*" + cercaNomRaw.toLowerCase() + "*")}&order=equip_name.asc&limit=50`;
          rows = await supaGet(supaUrl, supaKey, fraseUrl) as typeof rows;

          // Estratègia 2: stemming de la primera paraula significant
          if (!rows.length && termes.length > 0) {
            const stem = termes[0].replace(/es$/, "").replace(/s$/, "").replace(/ió$/, "").replace(/ions$/, "ió");
            const stemUrl = `equipments?select=equip_code,equip_name,gubim_code,revit_category&equip_name=ilike.${encodeURIComponent("*" + stem + "*")}&order=equip_name.asc&limit=100`;
            const candidats = await supaGet(supaUrl, supaKey, stemUrl) as typeof rows;
            // Filtrar a memòria: totes les paraules han de ser presents (AND)
            rows = candidats.filter(e => coincideixFlexible(e.equip_name, termes, "and"));
            // Fallback OR si AND no dona resultats
            if (!rows.length) rows = candidats.filter(e => coincideixFlexible(e.equip_name, termes, "or"));
          }

          // Estratègia 3: cerca cada paraula per separat i intersectar
          if (!rows.length && termes.length > 1) {
            const tots = await supaGet(supaUrl, supaKey, `equipments?select=equip_code,equip_name,gubim_code,revit_category&order=equip_name.asc&limit=500`) as typeof rows;
            rows = tots.filter(e => coincideixFlexible(e.equip_name, termes, "and"));
            if (!rows.length) rows = tots.filter(e => coincideixFlexible(e.equip_name, termes, "or")).slice(0, 20);
          }
        }

        if (!rows.length) return `No s'han trobat equips per "${cercaNomRaw ?? args.equip_code ?? args.gubim_code}". Prova amb un terme més curt o diferent.`;
        return `Equips trobats (${rows.length}):\n` + rows.map(e => `- ${e.equip_code}: ${e.equip_name} | GuBIMClass: ${e.gubim_code}${e.revit_category ? ` | Revit: ${e.revit_category}` : ""}`).join("\n");
      }

      case "cerca_projecte": {
        type ProjRow = { id: string; codi_projecte: string; nom: string; status: string; codi_installacio: string; codis_installacio: {codi:string;nom:string}[]|null };
        let rows: ProjRow[] = [];

        if (args.codi_projecte) {
          // Cerca per codi exacte
          rows = await supaGet(supaUrl, supaKey, `projectes?select=id,codi_projecte,nom,status,codi_installacio,codis_installacio&codi_projecte=eq.${encodeURIComponent(args.codi_projecte as string)}&limit=5`) as ProjRow[];
        }

        if (!rows.length) {
          // Carregar tots i filtrar per paraules (nom del projecte o nom d'instal·lació)
          const tots = await supaGet(supaUrl, supaKey, "projectes?select=id,codi_projecte,nom,status,codi_installacio,codis_installacio&order=codi_projecte.desc&limit=200") as ProjRow[];

          if (args.nom) {
            const termes = paraulesCerca(args.nom as string);
            // AND primer
            rows = tots.filter(p =>
              coincideixFlexible(p.nom, termes, "and") ||
              p.codis_installacio?.some(c => c.nom && coincideixFlexible(c.nom, termes, "and"))
            );
            // OR com a fallback
            if (!rows.length) {
              rows = tots.filter(p =>
                coincideixFlexible(p.nom, termes, "or") ||
                p.codis_installacio?.some(c => c.nom && coincideixFlexible(c.nom, termes, "or"))
              );
            }
          } else {
            // Sense filtre: retornar els 10 més recents
            rows = tots.slice(0, 10);
          }
        }

        if (!rows.length) return args.nom ? `No s'ha trobat cap projecte amb el nom "${args.nom}".` : "No hi ha projectes a la base de dades.";
        return rows.map(p => {
          const codis = p.codis_installacio?.map(c => c.nom ? `${c.codi} (${c.nom})` : c.codi).join(", ") ?? p.codi_installacio ?? "(sense codi)";
          return `Projecte ${p.codi_projecte}: "${p.nom}" | Estat: ${p.status} | Instal·lacions: ${codis}`;
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
        // Font principal: taula visor3d_installacions (té totes les instal·lacions amb nom i codi)
        type InstRow = { codi_installacio: string; nom: string; descripcio: string | null };
        const termes = paraulesCerca(args.nom as string);

        // Estratègia 1: frase completa ilike directe a la BD
        let rows = await supaGet(supaUrl, supaKey,
          `visor3d_installacions?select=codi_installacio,nom,descripcio&nom=ilike.${encodeURIComponent("*" + (args.nom as string) + "*")}&order=codi_installacio.asc&limit=20`
        ) as InstRow[];

        // Estratègia 2: cerca per la primera paraula significant + filtre AND a memòria
        if (!rows.length) {
          const candidats = await supaGet(supaUrl, supaKey,
            `visor3d_installacions?select=codi_installacio,nom,descripcio&nom=ilike.${encodeURIComponent("*" + termes[0] + "*")}&order=codi_installacio.asc&limit=100`
          ) as InstRow[];
          rows = candidats.filter(r => coincideixFlexible(r.nom, termes, "and"));
          // Fallback OR
          if (!rows.length) rows = candidats.filter(r => coincideixFlexible(r.nom, termes, "or"));
        }

        // Estratègia 3: cerca per codi_installacio si sembla un codi (ex: "ED008")
        if (!rows.length && /^[A-Z]{2}\d{3}$/i.test((args.nom as string).trim())) {
          rows = await supaGet(supaUrl, supaKey,
            `visor3d_installacions?select=codi_installacio,nom,descripcio&codi_installacio=eq.${encodeURIComponent((args.nom as string).trim().toUpperCase())}&limit=1`
          ) as InstRow[];
        }

        if (!rows.length) {
          return `No s'ha trobat cap instal·lació amb el nom "${args.nom}". Comprova l'ortografia o proporciona el codi exacte (ex: ED008).`;
        }
        return `Instal·lacions trobades (${rows.length}):\n` + rows.map(r =>
          `- ${r.codi_installacio}: ${r.nom}${r.descripcio ? ` | ${r.descripcio}` : ""}`
        ).join("\n");
      }

      case "cerca_gubim": {
        type GubimRow = {code:string;name:string};
        let rows: GubimRow[] = [];

        if (args.codi) {
          rows = await supaGet(supaUrl, supaKey, `gubim_class?select=code,name&code=eq.${encodeURIComponent(args.codi as string)}`) as GubimRow[];
        }

        if (!rows.length && args.nom) {
          const termes = paraulesCerca(args.nom as string);
          // Estratègia 1: frase completa
          rows = await supaGet(supaUrl, supaKey, `gubim_class?select=code,name&name=ilike.${encodeURIComponent("*" + (args.nom as string).toLowerCase() + "*")}&order=code.asc&limit=50`) as GubimRow[];
          // Estratègia 2: stemming de la primera paraula
          if (!rows.length) {
            const stem = termes[0].replace(/es$/, "").replace(/s$/, "");
            const candidats = await supaGet(supaUrl, supaKey, `gubim_class?select=code,name&name=ilike.${encodeURIComponent("*" + stem + "*")}&order=code.asc&limit=100`) as GubimRow[];
            rows = candidats.filter(r => coincideixFlexible(r.name, termes, "and"));
            if (!rows.length) rows = candidats.filter(r => coincideixFlexible(r.name, termes, "or")).slice(0, 20);
          }
        }

        if (!rows.length && !args.codi && !args.nom) {
          // Llista completa si no hi ha filtres
          rows = await supaGet(supaUrl, supaKey, "gubim_class?select=code,name&order=code.asc&limit=200") as GubimRow[];
        }

        if (!rows.length) return `No s'ha trobat cap codi GuBIMClass per "${args.nom ?? args.codi}".`;
        return `GuBIMClass trobats (${rows.length}):\n` + rows.map(r => `- ${r.code}: ${r.name}`).join("\n");
      }

      case "cerca_camps": {
        type CampRow = {col:string;codi:string;tipus_dada:string;disciplina:string;agrupacio_revit:string};
        let rows: CampRow[] = [];

        // Sense filtres: llista tots
        if (!args.nom && !args.disciplina && !args.codi) {
          rows = await supaGet(supaUrl, supaKey, "fields?select=col,codi,tipus_dada,disciplina,agrupacio_revit&order=col.asc&limit=200") as CampRow[];
          if (!rows.length) return "El diccionari de camps és buit.";
          return `Tots els camps (${rows.length}):\n` + rows.map(r => `- ${r.col}${r.codi ? ` (${r.codi})` : ""}${r.tipus_dada ? ` | ${r.tipus_dada}` : ""}${r.disciplina ? ` | ${r.disciplina}` : ""}`).join("\n");
        }

        if (args.codi) {
          rows = await supaGet(supaUrl, supaKey, `fields?select=col,codi,tipus_dada,disciplina,agrupacio_revit&codi=eq.${encodeURIComponent(args.codi as string)}`) as CampRow[];
        }

        if (!rows.length && args.nom) {
          const termes = paraulesCerca(args.nom as string);
          // Cerca per nom de columna (col) i per codi
          let candidats = await supaGet(supaUrl, supaKey, `fields?select=col,codi,tipus_dada,disciplina,agrupacio_revit&col=ilike.${encodeURIComponent("*" + termes[0] + "*")}&order=col.asc&limit=100`) as CampRow[];
          if (args.disciplina) candidats = candidats.filter(r => r.disciplina?.toLowerCase().includes((args.disciplina as string).toLowerCase()));
          rows = candidats.filter(r => coincideixFlexible(r.col, termes, "and"));
          if (!rows.length) rows = candidats.filter(r => coincideixFlexible(r.col, termes, "or")).slice(0, 30);
          // Si encara no troba res, buscar per codi del camp
          if (!rows.length) {
            const perCodi = await supaGet(supaUrl, supaKey, `fields?select=col,codi,tipus_dada,disciplina,agrupacio_revit&codi=ilike.${encodeURIComponent("*" + termes[0] + "*")}&order=col.asc&limit=50`) as CampRow[];
            rows = perCodi;
          }
        } else if (!rows.length && args.disciplina) {
          rows = await supaGet(supaUrl, supaKey, `fields?select=col,codi,tipus_dada,disciplina,agrupacio_revit&disciplina=ilike.${encodeURIComponent("*" + args.disciplina + "*")}&order=col.asc&limit=100`) as CampRow[];
        }

        if (!rows.length) return `No s'han trobat camps per "${args.nom ?? args.disciplina ?? args.codi}".`;
        return `Camps trobats (${rows.length}):\n` + rows.map(r => `- ${r.col}${r.codi ? ` (${r.codi})` : ""}${r.tipus_dada ? ` | ${r.tipus_dada}` : ""}${r.disciplina ? ` | ${r.disciplina}` : ""}${r.agrupacio_revit ? ` | Revit: ${r.agrupacio_revit}` : ""}`).join("\n");
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
