// api/groq-chat.ts
// Vercel Serverless Function — Agent IA amb Function Calling + RAG
//
// Pàgines cobertes:
//   dashboard         → estadístiques globals (equipments, fields, gubim_class)
//   equips            → catàleg equipments + fields + gubim_class
//   revit-bim         → documentació BIM (recursos estàtics, no BD)
//   visualitzador-3d  → visor3d_sistemes + visor3d_installacions
//   projectes-equips  → projectes + projecte_tags + rosmiman_equips
//   rosmiman          → rosmiman_equips
//
// Taules Supabase cobertes:
//   equipments, fields, gubim_class,
//   projectes, projecte_tags, rosmiman_equips,
//   visor3d_sistemes, visor3d_installacions
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

// ─── Utilitats de cerca ───────────────────────────────────────────────────────

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

const STOP_WORDS = new Set(["de","del","la","el","els","les","i","a","al","des","per","amb","una","uns","les","en","amb","o"]);

function paraulesCerca(frase: string): string[] {
  const ps = frase.toLowerCase().trim().split(/\s+/).filter(p => p.length > 2 && !STOP_WORDS.has(p));
  return ps.length > 0 ? ps : [frase.toLowerCase().trim()];
}

function coincideixFlexible(text: string, termes: string[], mode: "and" | "or" = "and"): boolean {
  const t = text.toLowerCase();
  return mode === "and" ? termes.every(p => t.includes(p)) : termes.some(p => t.includes(p));
}

// ─── Tools disponibles per al model ──────────────────────────────────────────

const TOOLS = [
  { type:"function", function:{ name:"cerca_installacio",
    description:"Cerca installacions per nom o codi (visor3d_installacions). Retorna codi (ex:ED014) i nom.",
    parameters:{ type:"object", properties:{
      nom:{ type:"string" }, codi:{ type:"string" }
    }}}},
  { type:"function", function:{ name:"cerca_equips",
    description:"Cerca equips per nom/tipus (equipments). Retorna equip_code(ex:BCCS), equip_name, gubim_code. Params: nom, tipus, keyword, equip_code, gubim_code.",
    parameters:{ type:"object", properties:{
      nom:{ type:"string" }, tipus:{ type:"string" }, keyword:{ type:"string" },
      equip_code:{ type:"string" }, gubim_code:{ type:"string" }
    }}}},
  { type:"function", function:{ name:"cerca_gubim",
    description:"Cerca codis GuBIMClass (gubim_class) per nom o codi.",
    parameters:{ type:"object", properties:{
      nom:{ type:"string" }, codi:{ type:"string" }
    }}}},
  { type:"function", function:{ name:"cerca_camps",
    description:"Cerca camps del diccionari BIM (fields) per nom, disciplina o codi.",
    parameters:{ type:"object", properties:{
      nom:{ type:"string" }, disciplina:{ type:"string" }, codi:{ type:"string" }
    }}}},
  { type:"function", function:{ name:"cerca_projecte",
    description:"Cerca projectes (projectes) per nom, codi o status(actiu/arxivat).",
    parameters:{ type:"object", properties:{
      codi_projecte:{ type:"string" }, nom:{ type:"string" }, status:{ type:"string" }
    }}}},
  { type:"function", function:{ name:"cerca_tags_projecte",
    description:"Llista TAGs d un projecte (projecte_tags). Requereix codi_projecte.",
    parameters:{ type:"object", required:["codi_projecte"], properties:{
      codi_projecte:{ type:"string" }, status:{ type:"string" }
    }}}},
  { type:"function", function:{ name:"cerca_tags_rosmiman",
    description:"Cerca TAGs Rosmiman globals (rosmiman_equips). Verifica si un TAG existeix.",
    parameters:{ type:"object", properties:{
      codi_installacio:{ type:"string" }, codi_equip:{ type:"string" }, tag_exacte:{ type:"string" }
    }}}},
  { type:"function", function:{ name:"primer_tag_disponible",
    description:"Calcula primer TAG disponible (lletra A-Z lliure). codi_equip=equip_code de cerca_equips. codi_installacio de cerca_installacio.",
    parameters:{ type:"object", required:["codi_installacio","codi_equip"], properties:{
      codi_installacio:{ type:"string" }, codi_equip:{ type:"string" },
      ccm:{ type:"string" }, funcio:{ type:"string" }
    }}}},
  { type:"function", function:{ name:"cerca_visor3d",
    description:"Cerca sistemes i installacions del Visualitzador 3D.",
    parameters:{ type:"object", properties:{
      nom:{ type:"string" }, codi:{ type:"string" }, sistema:{ type:"string" }
    }}}},
  { type:"function", function:{ name:"estadistiques_globals",
    description:"Totals de totes les taules de la plataforma.",
    parameters:{ type:"object", properties:{} }}},
];

// ─── Executors de tools ───────────────────────────────────────────────────────

async function executaTool(
  name: string,
  args: Record<string, unknown>,
  supaUrl: string,
  supaKey: string
): Promise<string> {
  try {
    switch (name) {

      // ── cerca_installacio ──────────────────────────────────────────────────
      case "cerca_installacio": {
        type InstRow = { codi_installacio: string; nom: string; descripcio: string | null };
        let rows: InstRow[] = [];

        // Per codi exacte (prioritat màxima)
        if (args.codi) {
          rows = await supaGet(supaUrl, supaKey,
            `visor3d_installacions?select=codi_installacio,nom,descripcio&codi_installacio=eq.${encodeURIComponent((args.codi as string).toUpperCase())}&limit=5`
          ) as InstRow[];
        }

        // Per nom: estratègia 1 → frase completa
        if (!rows.length && args.nom) {
          const nomRaw = args.nom as string;
          const termes = paraulesCerca(nomRaw);
          rows = await supaGet(supaUrl, supaKey,
            `visor3d_installacions?select=codi_installacio,nom,descripcio&nom=ilike.${encodeURIComponent("*" + nomRaw + "*")}&order=codi_installacio.asc&limit=20`
          ) as InstRow[];

          // Estratègia 2 → primera paraula significant + filtre AND memòria
          if (!rows.length) {
            const candidats = await supaGet(supaUrl, supaKey,
              `visor3d_installacions?select=codi_installacio,nom,descripcio&nom=ilike.${encodeURIComponent("*" + termes[0] + "*")}&order=codi_installacio.asc&limit=100`
            ) as InstRow[];
            rows = candidats.filter(r => coincideixFlexible(r.nom, termes, "and"));
            if (!rows.length) rows = candidats.filter(r => coincideixFlexible(r.nom, termes, "or"));
          }
        }

        // Sense filtres → llista totes
        if (!rows.length && !args.nom && !args.codi) {
          rows = await supaGet(supaUrl, supaKey,
            `visor3d_installacions?select=codi_installacio,nom,descripcio&order=codi_installacio.asc&limit=200`
          ) as InstRow[];
          if (!rows.length) return "No hi ha instal·lacions a la base de dades.";
          return `Totes les instal·lacions (${rows.length}):\n` + rows.map(r => `- ${r.codi_installacio}: ${r.nom}`).join("\n");
        }

        if (!rows.length) return `No s'ha trobat cap instal·lació amb el nom/codi "${args.nom ?? args.codi}". Comprova l'ortografia o proporciona el codi exacte (ex: ED008).`;
        return `Instal·lacions trobades (${rows.length}):\n` + rows.map(r => `- ${r.codi_installacio}: ${r.nom}${r.descripcio ? ` | ${r.descripcio}` : ""}`).join("\n");
      }

      // ── cerca_equips ───────────────────────────────────────────────────────
      case "cerca_equips": {
        type EquipRow = { equip_code: string; equip_name: string; gubim_code: string; revit_category: string };
        const cercaNomRaw = (args.nom ?? args.tipus ?? args.keyword ?? args.equip_name) as string | undefined;
        let rows: EquipRow[] = [];

        if (args.equip_code) {
          rows = await supaGet(supaUrl, supaKey, `equipments?select=equip_code,equip_name,gubim_code,revit_category&equip_code=eq.${encodeURIComponent(args.equip_code as string)}`) as EquipRow[];
        }
        if (args.gubim_code && !rows.length) {
          rows = await supaGet(supaUrl, supaKey, `equipments?select=equip_code,equip_name,gubim_code,revit_category&gubim_code=eq.${encodeURIComponent(args.gubim_code as string)}`) as EquipRow[];
        }

        if (cercaNomRaw && !rows.length) {
          const termes = paraulesCerca(cercaNomRaw);

          // Estratègia 1: frase completa ilike
          rows = await supaGet(supaUrl, supaKey,
            `equipments?select=equip_code,equip_name,gubim_code,revit_category&equip_name=ilike.${encodeURIComponent("*" + cercaNomRaw.toLowerCase() + "*")}&order=equip_name.asc&limit=50`
          ) as EquipRow[];

          // Estratègia 2+3: cerca per cada paraula en paral·lel + puntuació per coincidències
          // Cada equip rep 1 punt per cada paraula que conté al seu nom (stemming inclòs)
          // Ordena per puntuació descendent → els més rellevants primer
          if (!rows.length && termes.length > 0) {
            // Generar stems per cada terme (singular, sense terminació)
            const stems = termes.map(t =>
              t.replace(/es$/, "").replace(/s$/, "").replace(/ió$/, "").replace(/ons$/, "ó")
            );

            // Cercar per cada stem en paral·lel
            const resultatsPerStem = await Promise.all(
              stems.map(stem =>
                supaGet(supaUrl, supaKey,
                  `equipments?select=equip_code,equip_name,gubim_code,revit_category&equip_name=ilike.${encodeURIComponent("*" + stem + "*")}&order=equip_name.asc&limit=100`
                ) as Promise<EquipRow[]>
              )
            );

            // Puntuar cada equip: +1 per cada stem que conté
            const puntuacions = new Map<string, { equip: EquipRow; punts: number; coincidencies: string[] }>();
            for (let i = 0; i < stems.length; i++) {
              for (const equip of resultatsPerStem[i]) {
                const existent = puntuacions.get(equip.equip_code);
                if (existent) {
                  existent.punts++;
                  existent.coincidencies.push(termes[i]);
                } else {
                  puntuacions.set(equip.equip_code, { equip, punts: 1, coincidencies: [termes[i]] });
                }
              }
            }

            // Ordenar per puntuació i retornar
            const ordenats = [...puntuacions.values()]
              .sort((a, b) => b.punts - a.punts);

            rows = ordenats.map(o => o.equip);

            // Afegir info de puntuació al resultat per ajudar el model a triar
            if (rows.length > 0) {
              const maxPunts = ordenats[0].punts;
              const resum = ordenats.slice(0, 15).map(o =>
                `- ${o.equip.equip_code}: ${o.equip.equip_name} | GuBIMClass: ${o.equip.gubim_code} [${o.punts}/${stems.length} coincidències: ${o.coincidencies.join(", ")}]`
              ).join("\n");
              return `Resultats per "${cercaNomRaw}" (${rows.length} candidats, ordenats per rellevància):\n${resum}${rows.length > 15 ? `\n... i ${rows.length - 15} més` : ""}`;
            }
          }

          // Estratègia 4 (últim recurs): catàleg complet
          if (!rows.length) {
            const tots = await supaGet(supaUrl, supaKey,
              `equipments?select=equip_code,equip_name,gubim_code,revit_category&order=equip_name.asc&limit=500`
            ) as EquipRow[];
            return `No s'he trobat cap equip coincident amb "${cercaNomRaw}".\n` +
              `Catàleg complet (${tots.length} equips):\n` +
              tots.map(e => `- ${e.equip_code}: ${e.equip_name} | GuBIMClass: ${e.gubim_code}`).join("\n");
          }
        }

        if (!cercaNomRaw && !args.equip_code && !args.gubim_code) {
          rows = await supaGet(supaUrl, supaKey, `equipments?select=equip_code,equip_name,gubim_code,revit_category&order=equip_name.asc&limit=200`) as EquipRow[];
          if (!rows.length) return "El catàleg d'equips és buit.";
          return `Catàleg complet (${rows.length} equips):\n` + rows.map(e => `- ${e.equip_code}: ${e.equip_name} | GuBIMClass: ${e.gubim_code}`).join("\n");
        }

        if (!rows.length) return `No s'han trobat equips per "${cercaNomRaw ?? args.equip_code ?? args.gubim_code}".`;
        return `Equips trobats (${rows.length}):\n` + rows.map(e => `- ${e.equip_code}: ${e.equip_name} | GuBIMClass: ${e.gubim_code}${e.revit_category ? ` | Revit: ${e.revit_category}` : ""}`).join("\n");
      }

      // ── cerca_gubim ────────────────────────────────────────────────────────
      case "cerca_gubim": {
        type GubimRow = { code: string; name: string };
        let rows: GubimRow[] = [];
        if (args.codi) {
          rows = await supaGet(supaUrl, supaKey, `gubim_class?select=code,name&code=eq.${encodeURIComponent(args.codi as string)}`) as GubimRow[];
        }
        if (!rows.length && args.nom) {
          const termes = paraulesCerca(args.nom as string);
          rows = await supaGet(supaUrl, supaKey,
            `gubim_class?select=code,name&name=ilike.${encodeURIComponent("*" + (args.nom as string).toLowerCase() + "*")}&order=code.asc&limit=50`
          ) as GubimRow[];
          if (!rows.length) {
            const stem = termes[0].replace(/es$/, "").replace(/s$/, "");
            const candidats = await supaGet(supaUrl, supaKey,
              `gubim_class?select=code,name&name=ilike.${encodeURIComponent("*" + stem + "*")}&order=code.asc&limit=100`
            ) as GubimRow[];
            rows = candidats.filter(r => coincideixFlexible(r.name, termes, "and"));
            if (!rows.length) rows = candidats.filter(r => coincideixFlexible(r.name, termes, "or")).slice(0, 20);
          }
        }
        if (!rows.length && !args.codi && !args.nom) {
          rows = await supaGet(supaUrl, supaKey, `gubim_class?select=code,name&order=code.asc&limit=200`) as GubimRow[];
        }
        if (!rows.length) return `No s'ha trobat cap codi GuBIMClass per "${args.nom ?? args.codi}".`;
        return `GuBIMClass trobats (${rows.length}):\n` + rows.map(r => `- ${r.code}: ${r.name}`).join("\n");
      }

      // ── cerca_camps ────────────────────────────────────────────────────────
      case "cerca_camps": {
        type CampRow = { col: string; codi: string; tipus_dada: string; disciplina: string; agrupacio_revit: string };
        let rows: CampRow[] = [];
        if (args.codi) {
          rows = await supaGet(supaUrl, supaKey, `fields?select=col,codi,tipus_dada,disciplina,agrupacio_revit&codi=eq.${encodeURIComponent(args.codi as string)}`) as CampRow[];
        }
        if (!rows.length && !args.nom && !args.disciplina && !args.codi) {
          rows = await supaGet(supaUrl, supaKey, `fields?select=col,codi,tipus_dada,disciplina,agrupacio_revit&order=col.asc&limit=200`) as CampRow[];
          if (!rows.length) return "El diccionari de camps és buit.";
          return `Tots els camps (${rows.length}):\n` + rows.map(r => `- ${r.col}${r.codi ? ` (${r.codi})` : ""}${r.tipus_dada ? ` | ${r.tipus_dada}` : ""}${r.disciplina ? ` | ${r.disciplina}` : ""}`).join("\n");
        }
        if (!rows.length && args.nom) {
          const termes = paraulesCerca(args.nom as string);
          let candidats = await supaGet(supaUrl, supaKey,
            `fields?select=col,codi,tipus_dada,disciplina,agrupacio_revit&col=ilike.${encodeURIComponent("*" + termes[0] + "*")}&order=col.asc&limit=100`
          ) as CampRow[];
          if (args.disciplina) candidats = candidats.filter(r => r.disciplina?.toLowerCase().includes((args.disciplina as string).toLowerCase()));
          rows = candidats.filter(r => coincideixFlexible(r.col, termes, "and"));
          if (!rows.length) rows = candidats.filter(r => coincideixFlexible(r.col, termes, "or")).slice(0, 30);
          if (!rows.length) {
            const perCodi = await supaGet(supaUrl, supaKey,
              `fields?select=col,codi,tipus_dada,disciplina,agrupacio_revit&codi=ilike.${encodeURIComponent("*" + termes[0] + "*")}&order=col.asc&limit=50`
            ) as CampRow[];
            rows = perCodi;
          }
        }
        if (!rows.length && args.disciplina && !args.nom) {
          rows = await supaGet(supaUrl, supaKey,
            `fields?select=col,codi,tipus_dada,disciplina,agrupacio_revit&disciplina=ilike.${encodeURIComponent("*" + args.disciplina + "*")}&order=col.asc&limit=100`
          ) as CampRow[];
        }
        if (!rows.length) return `No s'han trobat camps per "${args.nom ?? args.disciplina ?? args.codi}".`;
        return `Camps trobats (${rows.length}):\n` + rows.map(r => `- ${r.col}${r.codi ? ` (${r.codi})` : ""}${r.tipus_dada ? ` | ${r.tipus_dada}` : ""}${r.disciplina ? ` | ${r.disciplina}` : ""}${r.agrupacio_revit ? ` | Revit: ${r.agrupacio_revit}` : ""}`).join("\n");
      }

      // ── cerca_projecte ─────────────────────────────────────────────────────
      case "cerca_projecte": {
        type ProjRow = { id: string; codi_projecte: string; nom: string; status: string; codi_installacio: string; codis_installacio: {codi:string;nom:string}[]|null };
        let rows: ProjRow[] = [];

        if (args.codi_projecte) {
          rows = await supaGet(supaUrl, supaKey,
            `projectes?select=id,codi_projecte,nom,status,codi_installacio,codis_installacio&codi_projecte=eq.${encodeURIComponent(args.codi_projecte as string)}&limit=5`
          ) as ProjRow[];
        }

        if (!rows.length) {
          let query = "projectes?select=id,codi_projecte,nom,status,codi_installacio,codis_installacio&order=codi_projecte.desc&limit=200";
          if (args.status) query += `&status=eq.${encodeURIComponent(args.status as string)}`;
          const tots = await supaGet(supaUrl, supaKey, query) as ProjRow[];

          if (args.nom) {
            const termes = paraulesCerca(args.nom as string);
            rows = tots.filter(p =>
              coincideixFlexible(p.nom, termes, "and") ||
              p.codis_installacio?.some(c => c.nom && coincideixFlexible(c.nom, termes, "and"))
            );
            if (!rows.length) rows = tots.filter(p =>
              coincideixFlexible(p.nom, termes, "or") ||
              p.codis_installacio?.some(c => c.nom && coincideixFlexible(c.nom, termes, "or"))
            );
          } else {
            rows = tots.slice(0, 20);
          }
        }

        if (!rows.length) return args.nom ? `No s'ha trobat cap projecte amb el nom "${args.nom}".` : "No hi ha projectes a la base de dades.";
        return rows.map(p => {
          const codis = p.codis_installacio?.map(c => c.nom ? `${c.codi} (${c.nom})` : c.codi).join(", ") ?? p.codi_installacio ?? "(sense codi)";
          return `Projecte ${p.codi_projecte}: "${p.nom}" | Estat: ${p.status} | Instal·lacions: ${codis}`;
        }).join("\n");
      }

      // ── cerca_tags_projecte ────────────────────────────────────────────────
      case "cerca_tags_projecte": {
        const prRows = await supaGet(supaUrl, supaKey,
          `projectes?select=id,nom&codi_projecte=eq.${encodeURIComponent(args.codi_projecte as string)}&limit=1`
        ) as { id: string; nom: string }[];
        if (!prRows.length) return `No existeix el projecte ${args.codi_projecte}.`;
        let tagQuery = `projecte_tags?select=tag_complet,status,descripcio_equip,codi_installacio&projecte_id=eq.${encodeURIComponent(prRows[0].id)}&order=tag_complet.asc&limit=500`;
        if (args.status) tagQuery += `&status=eq.${encodeURIComponent(args.status as string)}`;
        const tags = await supaGet(supaUrl, supaKey, tagQuery) as { tag_complet: string; status: string; descripcio_equip: string; codi_installacio: string }[];
        if (!tags.length) return `El projecte ${args.codi_projecte} "${prRows[0].nom}" no té TAGs${args.status ? ` amb estat "${args.status}"` : ""}.`;
        const validats  = tags.filter(t => t.status === "validat").length;
        const pendents  = tags.filter(t => t.status === "pendent").length;
        const rebutjats = tags.filter(t => t.status === "rebutjat").length;
        const resum = tags.map(t => `- ${t.tag_complet} | ${t.status}${t.descripcio_equip ? ` | ${t.descripcio_equip}` : ""}`).join("\n");
        return `TAGs del projecte ${args.codi_projecte} "${prRows[0].nom}" (${tags.length} TAGs — ${validats} validats, ${pendents} pendents, ${rebutjats} rebutjats):\n${resum}`;
      }

      // ── cerca_tags_rosmiman ────────────────────────────────────────────────
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

      // ── primer_tag_disponible ──────────────────────────────────────────────
      // Replica la lògica del frontend: buildTag + primeraDuplicitatLliure
      // TAG format: CODIINST_CODIEQUIP_CCM + FUNCIO(2digits) + DUPLICITAT(A-Z)
      // codi_equip = equip_code de la taula equipments (NO gubim_code)
      //
      // Ofereix dues opcions:
      //   Opció A — mateixa funció, primera lletra lliure (duplicant funció)
      //             ex: ja existeix ED014_BCS0_101A → proposa ED014_BCS0_101B
      //   Opció B — primera funció completament lliure (funció nova, lletra A)
      //             ex: funcio=02 si 01 ja té tagging
      case "primer_tag_disponible": {
        const codiInst = (args.codi_installacio as string).trim().toUpperCase();
        const codiEq   = (args.codi_equip as string).trim().toUpperCase();
        const ccm      = String(args.ccm ?? "1").trim();
        const funcioInici = String(args.funcio ?? "01").trim().padStart(2, "0");

        // Validacions
        if (!/^[A-Z0-9]{2,6}$/.test(codiInst)) return `Codi instal·lació invàlid: "${codiInst}". Ha de ser 5 car. (ex: ED014).`;
        if (!/^\d$/.test(ccm)) return `CCM invàlid: "${ccm}". Ha de ser 1 dígit 0-9.`;
        if (funcioInici === "00") return "La funció no pot ser 00.";

        // Carregar TOTS els TAGs d'aquesta instal·lació+equip (projectes + Rosmiman)
        const prefixGlobal = `${codiInst}_${codiEq}_${ccm}`;
        const [rosmiman, projecteTags] = await Promise.all([
          supaGet(supaUrl, supaKey,
            `rosmiman_equips?select=tag&tag=like.${encodeURIComponent(prefixGlobal + "%")}&limit=500`
          ) as Promise<{tag:string}[]>,
          supaGet(supaUrl, supaKey,
            `projecte_tags?select=tag_complet&tag_complet=like.${encodeURIComponent(prefixGlobal + "%")}&limit=500`
          ) as Promise<{tag_complet:string}[]>,
        ]);

        const totsElsTags = new Set([
          ...(rosmiman as {tag:string}[]).map(r => r.tag),
          ...(projecteTags as {tag_complet:string}[]).map(r => r.tag_complet),
        ]);

        // Funció auxiliar: primera lletra lliure per a un prefix INST_EQUIP_CCMfuncio
        function primerLletraLliure(prefix: string): string | null {
          for (let i = 0; i < 26; i++) {
            const candidat = prefix + String.fromCharCode(65 + i);
            if (!totsElsTags.has(candidat)) return String.fromCharCode(65 + i);
          }
          return null;
        }

        // ── Opció A: mateixa funció, primera lletra lliure ─────────────────
        const prefixFuncioActual = `${codiInst}_${codiEq}_${ccm}${funcioInici}`;
        const lletraOpcioA = primerLletraLliure(prefixFuncioActual);
        const tagOpcioA = lletraOpcioA ? prefixFuncioActual + lletraOpcioA : null;

        // Tags existents per a la funció actual (per mostrar context)
        const tagsOpcioA = [...totsElsTags]
          .filter(t => t.startsWith(prefixFuncioActual) && t.length === prefixFuncioActual.length + 1)
          .sort();

        // ── Opció B: primera funció completament lliure (cap TAG amb lletra A) ─
        let tagOpcioB: string | null = null;
        for (let fn = 1; fn <= 99; fn++) {
          const fnStr = String(fn).padStart(2, "0");
          const prefixFn = `${codiInst}_${codiEq}_${ccm}${fnStr}`;
          // Una funció és "lliure" si no té cap TAG existent amb cap lletra
          const teFuncioUsada = [...totsElsTags].some(t =>
            t.startsWith(prefixFn) && t.length === prefixFn.length + 1
          );
          if (!teFuncioUsada) {
            tagOpcioB = prefixFn + "A";
            break;
          }
        }

        const lines = [
          `Anàlisi de TAGs: instal·lació=${codiInst} | equip=${codiEq} | CCM=${ccm} | funció base=${funcioInici}`,
          `TAGs existents per a funció ${funcioInici}: ${tagsOpcioA.length > 0 ? tagsOpcioA.join(", ") : "cap"}`,
          ``,
          `📌 Opció A — ${tagOpcioA ?? `❌ esgotada`}`,
          `   Mateixa funció (${funcioInici}), lletra nova. Per a: 2a unitat idèntica del MATEIX circuit (redundància, backup, paral·lel).`,
          `   Exemple: dues bombes iguals al mateix pou de bombament.`,
          ``,
          `📌 Opció B — ${tagOpcioB ?? "❌ esgotada"}`,
          `   Funció nova (lletra A). Per a: equip d'una funció o circuit DIFERENT dins la mateixa instal·lació.`,
          `   Exemple: bomba de recirculació vs bomba de purga (funcions diferents).`,
        ];

        return lines.join("\n");
      }

      // ── cerca_visor3d ──────────────────────────────────────────────────────
      case "cerca_visor3d": {
        type SistRow = { id: string; nom: string; codi: string | null; color: string };
        type Inst3DRow = { id: string; sistema_id: string; nom: string; codi_installacio: string | null; urn: string | null };

        const [sistemes, installacions] = await Promise.all([
          supaGet(supaUrl, supaKey, `visor3d_sistemes?select=id,nom,codi,color&order=ordre.asc&limit=100`) as Promise<SistRow[]>,
          supaGet(supaUrl, supaKey, `visor3d_installacions?select=id,sistema_id,nom,codi_installacio,urn&order=codi_installacio.asc&limit=200`) as Promise<Inst3DRow[]>,
        ]);

        if (!sistemes.length) return "No hi ha sistemes configurats al Visualitzador 3D.";

        // Filtrar si hi ha criteris de cerca
        let instFiltrades = installacions;
        if (args.nom || args.codi || args.sistema) {
          const termes = paraulesCerca((args.nom ?? args.sistema ?? args.codi ?? "") as string);
          if (args.codi) {
            instFiltrades = installacions.filter(i => i.codi_installacio?.toUpperCase() === (args.codi as string).toUpperCase());
          } else {
            instFiltrades = installacions.filter(i =>
              coincideixFlexible(i.nom, termes, "and") ||
              (i.codi_installacio && coincideixFlexible(i.codi_installacio, termes, "or"))
            );
            if (!instFiltrades.length) instFiltrades = installacions.filter(i => coincideixFlexible(i.nom, termes, "or"));
          }
        }

        const instPerSistema = new Map<string, Inst3DRow[]>();
        for (const i of instFiltrades) {
          const arr = instPerSistema.get(i.sistema_id) ?? [];
          arr.push(i);
          instPerSistema.set(i.sistema_id, arr);
        }

        const sistemesFiltrats = args.sistema
          ? sistemes.filter(s => coincideixFlexible(s.nom, paraulesCerca(args.sistema as string), "or"))
          : sistemes;

        const lines: string[] = [];
        for (const s of sistemesFiltrats) {
          const insts = instPerSistema.get(s.id) ?? [];
          if (!insts.length && (args.nom || args.codi)) continue;
          lines.push(`\nSistema: ${s.nom}${s.codi ? ` (${s.codi})` : ""}`);
          if (!insts.length) { lines.push("  (sense instal·lacions)"); continue; }
          for (const i of insts) {
            lines.push(`  - ${i.codi_installacio ?? "—"}: ${i.nom}${i.urn ? " | Model BIM disponible" : ""}`);
          }
        }

        if (!lines.length) return `No s'ha trobat cap instal·lació al Visor 3D per "${args.nom ?? args.codi ?? args.sistema}".`;
        return `Contingut del Visualitzador 3D (${instFiltrades.length} instal·lacions en ${sistemesFiltrats.length} sistemes):${lines.join("\n")}`;
      }

      // ── estadistiques_globals ──────────────────────────────────────────────
      case "estadistiques_globals": {
        const [equips, camps, gubim, projectes, tags, rosmiman, inst3d] = await Promise.all([
          supaGet(supaUrl, supaKey, "equipments?select=id&limit=1&offset=0").then(() =>
            fetch(`${supaUrl}/rest/v1/equipments?select=id`, { headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}`, "Prefer": "count=exact", "Range-Unit": "items", Range: "0-0" } })
              .then(r => r.headers.get("content-range")?.split("/")[1] ?? "?")
          ),
          fetch(`${supaUrl}/rest/v1/fields?select=col`, { headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}`, "Prefer": "count=exact", "Range-Unit": "items", Range: "0-0" } })
            .then(r => r.headers.get("content-range")?.split("/")[1] ?? "?"),
          fetch(`${supaUrl}/rest/v1/gubim_class?select=id`, { headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}`, "Prefer": "count=exact", "Range-Unit": "items", Range: "0-0" } })
            .then(r => r.headers.get("content-range")?.split("/")[1] ?? "?"),
          fetch(`${supaUrl}/rest/v1/projectes?select=id&status=eq.actiu`, { headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}`, "Prefer": "count=exact", "Range-Unit": "items", Range: "0-0" } })
            .then(r => r.headers.get("content-range")?.split("/")[1] ?? "?"),
          fetch(`${supaUrl}/rest/v1/projecte_tags?select=id`, { headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}`, "Prefer": "count=exact", "Range-Unit": "items", Range: "0-0" } })
            .then(r => r.headers.get("content-range")?.split("/")[1] ?? "?"),
          fetch(`${supaUrl}/rest/v1/rosmiman_equips?select=id`, { headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}`, "Prefer": "count=exact", "Range-Unit": "items", Range: "0-0" } })
            .then(r => r.headers.get("content-range")?.split("/")[1] ?? "?"),
          fetch(`${supaUrl}/rest/v1/visor3d_installacions?select=id`, { headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}`, "Prefer": "count=exact", "Range-Unit": "items", Range: "0-0" } })
            .then(r => r.headers.get("content-range")?.split("/")[1] ?? "?"),
        ]);

        return [
          "Estadístiques globals de TaulaMaster CBT:",
          `- Equips al catàleg (equipments): ${equips}`,
          `- Camps al diccionari (fields): ${camps}`,
          `- Codis GuBIMClass: ${gubim}`,
          `- Projectes actius: ${projectes}`,
          `- TAGs de projectes (projecte_tags): ${tags}`,
          `- TAGs Rosmiman globals: ${rosmiman}`,
          `- Instal·lacions al Visor 3D: ${inst3d}`,
        ].join("\n");
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

const SYSTEM_PROMPT = `Assistent TaulaMaster CBT (Consorci Besòs Tordera). Respon en català.

AMBIT: Respons NOMES sobre TaulaMaster CBT (instal·lacions, equips, TAGs, projectes, BIM, Rosmiman). Si l'usuari pregunta sobre qualsevol altra cosa (politica, esport, cuina, historia, etc.), respon: "Nomes puc ajudar amb consultes de TaulaMaster CBT."

REGLES (obligatories):
1. MAI inventes codis. Sempre usa les tools per consultar la BD.
2. Nom instal·lació → cerca_installacio → retorna codi (ex: ED014).
3. Nom equip → cerca_equips → retorna equip_code (ex: BCCS). Usa equip_code, MAI gubim_code.
4. TAG → crida primer_tag_disponible i presenta SEMPRE les dues opcions (A i B) en la primera resposta. MAI calcules el TAG manualment ni esperes que l'usuari demani la segona opcio.
5. Candidat clar a cerca_equips (puntuació màxima) → usa'l directament sense demanar confirmació.
6. Codis del fil actual reutilitzables només si venen d'una tool. Si hi ha dubte, consulta.

FORMAT TAG: INST_EQUIP_CCMfu(2d)LLETRA  ex: ED014_BCCS_101B
CCM=1digit(0-9) FUNCIO=2digits(01-99,mai00) LLETRA=A-Z`;

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

  // ── Permisos d'usuari ─────────────────────────────────────────────────────
  const isAdmin: boolean = body.context?.isAdmin === true;
  const seccions: Record<string,string> = body.context?.sectionPermisos ?? {};

  const TOOL_SECCIO: Record<string, string> = {
    cerca_equips:          "equips",
    cerca_gubim:           "gubimclass",
    cerca_camps:           "fields",
    cerca_projecte:        "projectes",
    cerca_tags_projecte:   "projectes",
    primer_tag_disponible: "projectes",
    cerca_tags_rosmiman:   "rosmiman",
    cerca_visor3d:         "visor3d",
  };

  function teAcces(toolName: string): boolean {
    if (isAdmin) return true;
    const seccio = TOOL_SECCIO[toolName];
    if (!seccio) return true;
    return (seccions[seccio] ?? "none") !== "none";
  }

  const NOMS_SECCIO: Record<string,string> = {
    equips:"Taula Master", gubimclass:"GuBIMClass", fields:"Diccionari de camps",
    projectes:"Projectes i TAGs", rosmiman:"Llistat Rosmiman", visor3d:"Visualitzador 3D",
  };

  function missatgeDenegat(toolName: string): string {
    const s = TOOL_SECCIO[toolName] ?? toolName;
    return "No tens acces a la seccio \"" + (NOMS_SECCIO[s] ?? s) + "\". Contacta amb l\'administrador.";
  }

  const ultimaPregunta = missatgesUsuari.filter(m => m.role === "user").at(-1)?.content ?? "";

  // ── RAG semàntic ───────────────────────────────────────────────────────────
  let ragContext = "";
  try {
    const embedding = await embedQuery(ultimaPregunta, voyageKey);
    const ragResults = await cercaRag(embedding, supaUrl, supaKey, 8);
    if (ragResults.length > 0) {
      const lines = ragResults
        .filter(r => r.similitud > 0.85)
        .map(r => `[${r.tipus.toUpperCase()} ${(r.similitud*100).toFixed(0)}%] ${r.contingut}`);
      if (lines.length > 0) ragContext = `\n\n## Context semàntic addicional\n${lines.join("\n")}`;
    }
  } catch (err) {
    console.error("RAG error:", err);
  }

  const systemContent = SYSTEM_PROMPT
    + (body.context?.pageContext ? `\n\nPàgina actual de l'usuari: ${body.context.pageContext}` : "")
    + ragContext;

  // Historial limitat a 8 torns
  const historial: MissatgeAPI[] = [
    { role: "system", content: systemContent },
    ...missatgesUsuari.slice(-8),
  ];

  try {
    // ── Primera crida a Groq (amb tools) ────────────────────────────────────
    const groqRes1 = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${groqKey}` },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: 1500,
        temperature: 0.1,
        tools: TOOLS,
        tool_choice: "auto",
        messages: historial,
      }),
    });

    if (!groqRes1.ok) {
      const errText = await groqRes1.text();
      // 400 tool_use_failed: model genera XML en lloc de JSON (historial massa llarg)
      // Reintenta amb NOMES l'ultim missatge i temperature 0
      if (groqRes1.status === 400 && errText.includes("tool_use_failed")) {
        console.warn("tool_use_failed — reintentant amb historial redu�t");
        const ultimMissatge = missatgesUsuari[missatgesUsuari.length - 1];
        const groqRetry = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${groqKey}` },
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            max_tokens: 1500,
            temperature: 0,
            tools: TOOLS,
            tool_choice: "auto",
            messages: [{ role: "system", content: systemContent }, ultimMissatge],
          }),
        });
        if (!groqRetry.ok) {
          const e2 = await groqRetry.text();
          res.status(502).json({ error: `Error Groq (reintent): ${groqRetry.status} — ${e2}` }); return;
        }
        const retryData = await groqRetry.json() as { choices: { message: MissatgeAPI; finish_reason: string }[] };
        const retryMsg = retryData.choices[0].message;
        if (retryData.choices[0].finish_reason === "tool_calls" && retryMsg.tool_calls?.length) {
          const toolMsgs: MissatgeAPI[] = [];
          const rets = await Promise.all(retryMsg.tool_calls.map(async tc => {
            const a = JSON.parse(tc.function.arguments) as Record<string, unknown>;
            const resultat = teAcces(tc.function.name)
              ? await executaTool(tc.function.name, a, supaUrl!, supaKey!)
              : missatgeDenegat(tc.function.name);
            return { id: tc.id, name: tc.function.name, resultat };
          }));
          rets.forEach(r => toolMsgs.push({ role: "tool", tool_call_id: r.id, name: r.name, content: r.resultat }));
          const gr2 = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${groqKey}` },
            body: JSON.stringify({
              model: "llama-3.3-70b-versatile", max_tokens: 1500, temperature: 0,
              messages: [{ role: "system", content: systemContent }, ultimMissatge, retryMsg, ...toolMsgs],
            }),
          });
          if (!gr2.ok) { res.status(502).json({ error: "Error Groq reintent 2a crida" }); return; }
          const d2 = await gr2.json() as { choices: { message: { content: string } }[] };
          res.status(200).json({ reply: d2.choices[0].message.content ?? "" }); return;
        }
        res.status(200).json({ reply: retryMsg.content ?? "" }); return;
      }
      res.status(502).json({ error: `Error Groq: ${groqRes1.status} — ${errText}` }); return;
    }

    const data1 = await groqRes1.json() as {
      choices: { message: MissatgeAPI; finish_reason: string }[];
    };

    const missatgeAssistent = data1.choices[0].message;

    // ── Si el model crida tools → executar i fer segona crida ───────────────
    if (data1.choices[0].finish_reason === "tool_calls" && missatgeAssistent.tool_calls?.length) {
      const toolMessages: MissatgeAPI[] = [];

      const resultats = await Promise.all(
        missatgeAssistent.tool_calls.map(async tc => {
          const args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
          const resultat = teAcces(tc.function.name)
            ? await executaTool(tc.function.name, args, supaUrl!, supaKey!)
            : missatgeDenegat(tc.function.name);
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

      const groqRes2 = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${groqKey}` },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          max_tokens: 1500,
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

    // ── Resposta directa sense tool calls ────────────────────────────────────
    res.status(200).json({ reply: missatgeAssistent.content ?? "" }); return;

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg }); return;
  }
}
