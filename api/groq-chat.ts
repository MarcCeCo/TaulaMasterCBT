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

// Normalitza text: minúscules, elimina accents i caràcters especials, deixa
// només lletres, números i espais. Permet comparar "centrífuga" amb "centrifuga".
function normalitza(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")                        // descompon accents: á → a + ́
    .replace(/[\u0300-\u036f]/g, "")         // elimina els diacrítics
    .replace(/[^a-z0-9\s]/g, " ")           // elimina caràcters especials
    .replace(/\s+/g, " ")
    .trim();
}

const STOP_WORDS = new Set(["de","del","la","el","els","les","i","a","al","des","per","amb","una","uns","en","o","d","l","s"]);

function paraulesCerca(frase: string): string[] {
  const ps = normalitza(frase).split(/\s+/).filter(p => p.length > 1 && !STOP_WORDS.has(p));
  return ps.length > 0 ? ps : [normalitza(frase)];
}

// Puntuació fuzzy d'una paraula de cerca contra una paraula candidata.
// Retorna un valor entre 0 i 1:
//   1.0 = coincidència exacta
//   0.8 = prefix exacte (ex: "bomba" vs "bomba" en "bombetes")
//   0.x = lletres en ordre però no completes
//   0.0 = menys del 50% de lletres coincidents en ordre
function puntuacioParaula(query: string, candidata: string): number {
  if (query === candidata) return 1.0;

  // Subsequence: compta lletres de query que apareixen en ordre a candidata
  let qi = 0;
  for (let ci = 0; ci < candidata.length && qi < query.length; ci++) {
    if (candidata[ci] === query[qi]) qi++;
  }
  const cobertura = qi / query.length;
  if (cobertura < 0.5) return 0; // mínim 50% de lletres en ordre

  const prefixBonus   = candidata.startsWith(query) ? 1.5 : 1.0;
  const longitudPenal = query.length / candidata.length; // penalitza candidata molt més llarga

  return Math.min(1.0, cobertura * prefixBonus * longitudPenal);
}

// Puntuació total d'una cerca (frase sencera) contra un text candidat.
// Retorna { score: 0..1, empat: boolean }
// score = mitjana de la millor puntuació de cada paraula de la query.
function puntua(query: string, text: string): number {
  const qNorm = normalitza(query);
  const tNorm = normalitza(text);

  // Bonus per frase exacta (màxima prioritat)
  if (tNorm.includes(qNorm)) return 1.0;

  const qParaules = paraulesCerca(query);
  const tParaules = tNorm.split(/\s+/);

  let scoreTot = 0;
  for (const qp of qParaules) {
    // Pren la millor puntuació entre totes les paraules del text candidat
    const millor = tParaules.reduce((max, tp) => Math.max(max, puntuacioParaula(qp, tp)), 0);
    scoreTot += millor;
  }
  return qParaules.length > 0 ? scoreTot / qParaules.length : 0;
}

// Estructura de resultat unificada per a totes les cerques
interface ResultatPuntuat {
  score: number;
  jerarquia: number; // nombre de segments del codi (menys = més genèric)
  nom: string;
  [key: string]: unknown;
}

// Ordena i classifica resultats: per score DESC, desempat per jerarquia ASC.
// Retorna { unic, empat, resultats } on:
//   unic=true  → un sol resultat clarament millor (score >> segon)
//   empat=true → els N primers comparteixen score molt similar
function classificaResultats<T extends ResultatPuntuat>(
  resultats: T[],
  llindarEmpat = 0.05,   // diferència màxima de score per considerar empat
  llindarMinim = 0.25,   // score mínim per incloure un resultat
): { unic: boolean; empat: boolean; top: T[] } {
  const filtrats = resultats
    .filter(r => r.score >= llindarMinim)
    .sort((a, b) => b.score - a.score || a.jerarquia - b.jerarquia);

  if (!filtrats.length) return { unic: false, empat: false, top: [] };

  const maxScore = filtrats[0].score;
  const topGrup  = filtrats.filter(r => maxScore - r.score <= llindarEmpat);
  const unic     = topGrup.length === 1 && maxScore >= 0.8;
  const empat    = topGrup.length > 1;

  return { unic, empat, top: filtrats.slice(0, 15) };
}

// Manté compatibilitat amb cerques antigues que usen coincideixFlexible
function coincideixFlexible(text: string, termes: string[], mode: "and" | "or" = "and"): boolean {
  const t = normalitza(text);
  const tNorm = termes.map(normalitza);
  return mode === "and" ? tNorm.every(p => t.includes(p)) : tNorm.some(p => t.includes(p));
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
  supaKey: string,
  isAdmin: boolean,
  userId: string | null,
): Promise<string> {
  try {
    switch (name) {

      // ── cerca_installacio ──────────────────────────────────────────────────
      case "cerca_installacio": {
        type InstRow = { codi_installacio: string; nom: string; descripcio: string | null };

        // Codi exacte → prioritat màxima
        if (args.codi) {
          const rows = await supaGet(supaUrl, supaKey,
            `visor3d_installacions?select=codi_installacio,nom,descripcio&codi_installacio=eq.${encodeURIComponent((args.codi as string).toUpperCase())}&limit=1`
          ) as InstRow[];
          if (rows.length) return `Instal·lació: ${rows[0].codi_installacio}: ${rows[0].nom}${rows[0].descripcio ? ` | ${rows[0].descripcio}` : ""}`;
          return `No s'ha trobat cap instal·lació amb el codi "${args.codi}".`;
        }

        // Sense filtres → llista totes
        if (!args.nom) {
          const rows = await supaGet(supaUrl, supaKey,
            `visor3d_installacions?select=codi_installacio,nom,descripcio&order=codi_installacio.asc&limit=200`
          ) as InstRow[];
          if (!rows.length) return "No hi ha instal·lacions a la base de dades.";
          return `Totes les instal·lacions (${rows.length}):\n` + rows.map(r => `- ${r.codi_installacio}: ${r.nom}`).join("\n");
        }

        // Cerca per nom amb puntuació fuzzy
        const nomCerca = args.nom as string;
        const termes   = paraulesCerca(nomCerca);
        const candidats = await supaGet(supaUrl, supaKey,
          `visor3d_installacions?select=codi_installacio,nom,descripcio&nom=ilike.${encodeURIComponent("*" + termes[0] + "*")}&order=codi_installacio.asc&limit=200`
        ) as InstRow[];

        type InstPunt = InstRow & ResultatPuntuat;
        const puntuats: InstPunt[] = candidats.map(r => ({
          ...r,
          score:     puntua(nomCerca, r.nom),
          jerarquia: r.codi_installacio.replace(/[^.]/g,"").length,
          nom:       r.nom,
        }));

        const { unic, empat, top } = classificaResultats(puntuats);

        if (!top.length) return `No s'ha trobat cap instal·lació per "${nomCerca}". Comprova l'ortografia o usa el codi exacte (ex: ED008).`;
        if (unic)        return `Instal·lació: ${top[0].codi_installacio}: ${top[0].nom}${top[0].descripcio ? ` | ${top[0].descripcio}` : ""}`;

        // Empat o múltiples → llista i demana confirmació
        const prefix = empat
          ? `Hi ha ${top.length} instal·lacions que coincideixen amb "${nomCerca}". Pregunta a l'usuari quina és:`
          : `S'han trobat ${top.length} instal·lacions per "${nomCerca}":`;
        return prefix + "\n" + top.map(r => `- ${r.codi_installacio}: ${r.nom}${r.descripcio ? ` | ${r.descripcio}` : ""}`).join("\n");
      }

      // ── cerca_equips ───────────────────────────────────────────────────────
      case "cerca_equips": {
        type EquipRow = { equip_code: string; equip_name: string; gubim_code: string; revit_category: string };
        const cercaNomRaw = (args.nom ?? args.tipus ?? args.keyword ?? args.equip_name) as string | undefined;

        // Codi exacte
        if (args.equip_code) {
          const rows = await supaGet(supaUrl, supaKey,
            `equipments?select=equip_code,equip_name,gubim_code,revit_category&equip_code=eq.${encodeURIComponent(args.equip_code as string)}`
          ) as EquipRow[];
          if (rows.length) return `Equip: ${rows[0].equip_code}: ${rows[0].equip_name} | GuBIMClass: ${rows[0].gubim_code}`;
          return `No s'ha trobat cap equip amb codi "${args.equip_code}".`;
        }
        if (args.gubim_code) {
          const rows = await supaGet(supaUrl, supaKey,
            `equipments?select=equip_code,equip_name,gubim_code,revit_category&gubim_code=eq.${encodeURIComponent(args.gubim_code as string)}`
          ) as EquipRow[];
          if (rows.length) return `Equip: ${rows[0].equip_code}: ${rows[0].equip_name} | GuBIMClass: ${rows[0].gubim_code}`;
          return `No s'ha trobat cap equip amb codi GuBIMClass "${args.gubim_code}".`;
        }

        // Sense cerca → catàleg complet
        if (!cercaNomRaw) {
          const rows = await supaGet(supaUrl, supaKey,
            `equipments?select=equip_code,equip_name,gubim_code,revit_category&order=equip_name.asc&limit=200`
          ) as EquipRow[];
          if (!rows.length) return "El catàleg d'equips és buit.";
          return `Catàleg complet (${rows.length} equips):\n` + rows.map(e => `- ${e.equip_code}: ${e.equip_name} | GuBIMClass: ${e.gubim_code}`).join("\n");
        }

        // Cerca fuzzy per nom
        const termes = paraulesCerca(cercaNomRaw);

        // Carrega candidats buscant per la paraula més significativa (la més llarga)
        const termePrincipal = [...termes].sort((a,b) => b.length - a.length)[0];
        const candidats = await supaGet(supaUrl, supaKey,
          `equipments?select=equip_code,equip_name,gubim_code,revit_category&equip_name=ilike.${encodeURIComponent("*" + termePrincipal + "*")}&order=equip_name.asc&limit=300`
        ) as EquipRow[];

        // Si no hi ha prou candidats amb el terme principal, expandeix amb els altres
        let tots = candidats;
        if (tots.length < 5 && termes.length > 1) {
          const extra = await Promise.all(
            termes.filter(t => t !== termePrincipal).map(t =>
              supaGet(supaUrl, supaKey,
                `equipments?select=equip_code,equip_name,gubim_code,revit_category&equip_name=ilike.${encodeURIComponent("*" + t + "*")}&order=equip_name.asc&limit=100`
              ) as Promise<EquipRow[]>
            )
          );
          const codisTots = new Set(tots.map(e => e.equip_code));
          for (const llista of extra) for (const e of llista) if (!codisTots.has(e.equip_code)) { tots.push(e); codisTots.add(e.equip_code); }
        }

        if (!tots.length) {
          // Últim recurs: catàleg complet
          const tot = await supaGet(supaUrl, supaKey,
            `equipments?select=equip_code,equip_name,gubim_code,revit_category&order=equip_name.asc&limit=500`
          ) as EquipRow[];
          return `No s'ha trobat cap equip per "${cercaNomRaw}".\nCatàleg complet (${tot.length} equips):\n` +
            tot.map(e => `- ${e.equip_code}: ${e.equip_name} | GuBIMClass: ${e.gubim_code}`).join("\n");
        }

        type EquipPunt = EquipRow & ResultatPuntuat;
        const puntuats: EquipPunt[] = tots.map(e => ({
          ...e,
          score:     puntua(cercaNomRaw, e.equip_name),
          jerarquia: 0,
          nom:       e.equip_name,
        }));

        const { unic, empat, top } = classificaResultats(puntuats);

        if (!top.length) return `No s'ha trobat cap equip per "${cercaNomRaw}".`;
        if (unic)        return `Equip: ${top[0].equip_code}: ${top[0].equip_name} | GuBIMClass: ${top[0].gubim_code}${top[0].revit_category ? ` | Revit: ${top[0].revit_category}` : ""}`;

        const prefix = empat
          ? `Hi ha ${top.length} equips que coincideixen amb "${cercaNomRaw}" (puntuació similar). Presenta'ls a l'usuari:`
          : `S'han trobat ${top.length} equips per "${cercaNomRaw}" (ordenats per rellevància):`;
        return prefix + "\n" + top.map(e => `- ${e.equip_code}: ${e.equip_name} | GuBIMClass: ${e.gubim_code}`).join("\n");
      }


      // ── cerca_gubim ────────────────────────────────────────────────────────
      case "cerca_gubim": {
        type GubimRow = { code: string; name: string };

        // Codi exacte
        if (args.codi) {
          const rows = await supaGet(supaUrl, supaKey,
            `gubim_class?select=code,name&code=eq.${encodeURIComponent(args.codi as string)}`
          ) as GubimRow[];
          if (rows.length) return `GuBIMClass: ${rows[0].code}: ${rows[0].name}`;
          return `No s'ha trobat cap codi GuBIMClass "${args.codi}".`;
        }

        // Sense cerca → llista
        if (!args.nom) {
          const rows = await supaGet(supaUrl, supaKey,
            `gubim_class?select=code,name&order=code.asc&limit=200`
          ) as GubimRow[];
          return `GuBIMClass (${rows.length}):\n` + rows.map(r => `- ${r.code}: ${r.name}`).join("\n");
        }

        // Cerca fuzzy per nom
        const nomCerca = args.nom as string;
        const termes   = paraulesCerca(nomCerca);
        const termePrincipal = [...termes].sort((a,b) => b.length - a.length)[0];

        // Carrega candidats amplis (tots els que contenen la paraula principal)
        const candidats = await supaGet(supaUrl, supaKey,
          `gubim_class?select=code,name&name=ilike.${encodeURIComponent("*" + termePrincipal + "*")}&order=code.asc&limit=300`
        ) as GubimRow[];

        // Si pocs resultats, expandeix amb els altres termes
        let tots = [...candidats];
        if (tots.length < 5 && termes.length > 1) {
          const extra = await Promise.all(
            termes.filter(t => t !== termePrincipal).map(t =>
              supaGet(supaUrl, supaKey,
                `gubim_class?select=code,name&name=ilike.${encodeURIComponent("*" + t + "*")}&order=code.asc&limit=100`
              ) as Promise<GubimRow[]>
            )
          );
          const codisVists = new Set(tots.map(r => r.code));
          for (const llista of extra) for (const r of llista) if (!codisVists.has(r.code)) { tots.push(r); codisVists.add(r.code); }
        }

        if (!tots.length) return `No s'ha trobat cap codi GuBIMClass per "${nomCerca}".`;

        type GubimPunt = GubimRow & ResultatPuntuat;
        const puntuats: GubimPunt[] = tots.map(r => ({
          ...r,
          score:     puntua(nomCerca, r.name),
          // Jerarquia = nombre de segments del codi (90.60 = 2, 90.60.10 = 3, etc.)
          jerarquia: r.code.split(".").length,
          nom:       r.name,
        }));

        const { unic, empat, top } = classificaResultats(puntuats);

        if (!top.length) return `No s'ha trobat cap codi GuBIMClass per "${nomCerca}".`;
        if (unic)        return `GuBIMClass: ${top[0].code}: ${top[0].name}`;

        // Empat o múltiples → sempre llista i demana confirmació
        const prefix = empat
          ? `Hi ha ${top.length} codis GuBIMClass amb puntuació similar per "${nomCerca}". Presenta'ls tots a l'usuari i demana que confirmi quin és:`
          : `S'han trobat ${top.length} codis GuBIMClass per "${nomCerca}". Presenta'ls a l'usuari:`;
        return prefix + "\n" + top.map(r => `- ${r.code}: ${r.name}`).join("\n");
      }


      // ── cerca_camps ────────────────────────────────────────────────────────
      case "cerca_camps": {
        type CampRow = { col: string; codi: string; tipus_dada: string; disciplina: string; agrupacio_revit: string };

        // Codi exacte
        if (args.codi) {
          const rows = await supaGet(supaUrl, supaKey,
            `fields?select=col,codi,tipus_dada,disciplina,agrupacio_revit&codi=eq.${encodeURIComponent(args.codi as string)}`
          ) as CampRow[];
          if (rows.length) return `Camp: ${rows[0].col}${rows[0].codi ? ` (${rows[0].codi})` : ""}${rows[0].tipus_dada ? ` | ${rows[0].tipus_dada}` : ""}${rows[0].disciplina ? ` | ${rows[0].disciplina}` : ""}`;
          return `No s'ha trobat cap camp amb codi "${args.codi}".`;
        }

        // Sense filtres → llista tots
        if (!args.nom && !args.disciplina) {
          const rows = await supaGet(supaUrl, supaKey,
            `fields?select=col,codi,tipus_dada,disciplina,agrupacio_revit&order=col.asc&limit=200`
          ) as CampRow[];
          if (!rows.length) return "El diccionari de camps és buit.";
          return `Tots els camps (${rows.length}):\n` + rows.map(r => `- ${r.col}${r.codi ? ` (${r.codi})` : ""}${r.tipus_dada ? ` | ${r.tipus_dada}` : ""}${r.disciplina ? ` | ${r.disciplina}` : ""}`).join("\n");
        }

        // Cerca per disciplina sola
        if (args.disciplina && !args.nom) {
          const rows = await supaGet(supaUrl, supaKey,
            `fields?select=col,codi,tipus_dada,disciplina,agrupacio_revit&disciplina=ilike.${encodeURIComponent("*" + args.disciplina + "*")}&order=col.asc&limit=100`
          ) as CampRow[];
          if (!rows.length) return `No s'han trobat camps de la disciplina "${args.disciplina}".`;
          return `Camps de disciplina "${args.disciplina}" (${rows.length}):\n` + rows.map(r => `- ${r.col}${r.codi ? ` (${r.codi})` : ""}${r.tipus_dada ? ` | ${r.tipus_dada}` : ""}`).join("\n");
        }

        // Cerca fuzzy per nom
        const nomCerca = args.nom as string;
        const termes   = paraulesCerca(nomCerca);
        const termePrincipal = [...termes].sort((a,b) => b.length - a.length)[0];

        let candidats = await supaGet(supaUrl, supaKey,
          `fields?select=col,codi,tipus_dada,disciplina,agrupacio_revit&col=ilike.${encodeURIComponent("*" + termePrincipal + "*")}&order=col.asc&limit=200`
        ) as CampRow[];

        // Filtra per disciplina si s'ha indicat
        if (args.disciplina) {
          const disc = (args.disciplina as string).toLowerCase();
          candidats = candidats.filter(r => r.disciplina?.toLowerCase().includes(disc));
        }

        if (!candidats.length) {
          // Fallback: cerca per codi
          candidats = await supaGet(supaUrl, supaKey,
            `fields?select=col,codi,tipus_dada,disciplina,agrupacio_revit&codi=ilike.${encodeURIComponent("*" + termePrincipal + "*")}&order=col.asc&limit=50`
          ) as CampRow[];
        }

        if (!candidats.length) return `No s'han trobat camps per "${nomCerca}".`;

        type CampPunt = CampRow & ResultatPuntuat;
        const puntuats: CampPunt[] = candidats.map(r => ({
          ...r,
          score:     puntua(nomCerca, r.col),
          jerarquia: 0,
          nom:       r.col,
        }));

        const { unic, empat, top } = classificaResultats(puntuats);

        if (!top.length) return `No s'han trobat camps per "${nomCerca}".`;
        if (unic)        return `Camp: ${top[0].col}${top[0].codi ? ` (${top[0].codi})` : ""}${top[0].tipus_dada ? ` | ${top[0].tipus_dada}` : ""}${top[0].disciplina ? ` | ${top[0].disciplina}` : ""}${top[0].agrupacio_revit ? ` | Revit: ${top[0].agrupacio_revit}` : ""}`;

        const prefix = empat
          ? `Hi ha ${top.length} camps amb puntuació similar per "${nomCerca}". Presenta'ls a l'usuari:`
          : `S'han trobat ${top.length} camps per "${nomCerca}":`;
        return prefix + "\n" + top.map(r => `- ${r.col}${r.codi ? ` (${r.codi})` : ""}${r.tipus_dada ? ` | ${r.tipus_dada}` : ""}${r.disciplina ? ` | ${r.disciplina}` : ""}`).join("\n");
      }


      // ── cerca_projecte ─────────────────────────────────────────────────────
      case "cerca_projecte": {
        type ProjRow = { id: string; codi_projecte: string; nom: string; status: string; codi_installacio: string; codis_installacio: {codi:string;nom:string}[]|null; allowed_users: unknown };
        let rows: ProjRow[] = [];

        if (args.codi_projecte) {
          rows = await supaGet(supaUrl, supaKey,
            `projectes?select=id,codi_projecte,nom,status,codi_installacio,codis_installacio,allowed_users&codi_projecte=eq.${encodeURIComponent(args.codi_projecte as string)}&limit=5`
          ) as ProjRow[];
        }

        if (!rows.length) {
          let query = "projectes?select=id,codi_projecte,nom,status,codi_installacio,codis_installacio,allowed_users&order=codi_projecte.desc&limit=500";
          if (args.status) query += `&status=eq.${encodeURIComponent(args.status as string)}`;
          const tots = await supaGet(supaUrl, supaKey, query) as ProjRow[];

          // ── Filtre d'accés per userId ──────────────────────────────────────
          // allowed_users === null → accés obert (tothom el veu)
          // allowed_users === []   → accés tancat (només admins)
          // allowed_users = [{userId, role},...] → accés restringit
          const visibles = isAdmin ? tots : tots.filter(p => {
            if (p.allowed_users === null) return true;               // obert
            if (!Array.isArray(p.allowed_users)) return false;       // format inesperat
            if ((p.allowed_users as unknown[]).length === 0) return false; // tancat
            if (!userId) return false;
            return (p.allowed_users as { userId: string }[]).some(u => u.userId === userId);
          });

          if (args.nom) {
            const termes = paraulesCerca(args.nom as string);
            rows = visibles.filter(p =>
              coincideixFlexible(p.nom, termes, "and") ||
              p.codis_installacio?.some(c => c.nom && coincideixFlexible(c.nom, termes, "and"))
            );
            if (!rows.length) rows = visibles.filter(p =>
              coincideixFlexible(p.nom, termes, "or") ||
              p.codis_installacio?.some(c => c.nom && coincideixFlexible(c.nom, termes, "or"))
            );
          } else {
            rows = visibles.slice(0, 20);
          }
        }

        if (!rows.length) return args.nom ? `No s'ha trobat cap projecte accessible amb el nom "${args.nom}".` : "No tens accés a cap projecte o no n'hi ha a la base de dades.";
        return rows.map(p => {
          const codis = p.codis_installacio?.map(c => c.nom ? `${c.codi} (${c.nom})` : c.codi).join(", ") ?? p.codi_installacio ?? "(sense codi)";
          return `Projecte ${p.codi_projecte}: "${p.nom}" | Estat: ${p.status} | Instal·lacions: ${codis}`;
        }).join("\n");
      }

      // ── cerca_tags_projecte ────────────────────────────────────────────────
      case "cerca_tags_projecte": {
        const prRows = await supaGet(supaUrl, supaKey,
          `projectes?select=id,nom,allowed_users&codi_projecte=eq.${encodeURIComponent(args.codi_projecte as string)}&limit=1`
        ) as { id: string; nom: string; allowed_users: unknown }[];
        if (!prRows.length) return `No existeix el projecte ${args.codi_projecte}.`;

        // Verifica accés de l'usuari al projecte concret
        if (!isAdmin) {
          const au = prRows[0].allowed_users;
          const esTancat = Array.isArray(au) && (au as unknown[]).length === 0;
          const esRestringit = Array.isArray(au) && (au as unknown[]).length > 0;
          if (esTancat) {
            return `No tens accés al projecte ${args.codi_projecte}. Contacta amb l'administrador.`;
          }
          if (esRestringit && (!userId || !(au as { userId: string }[]).some(u => u.userId === userId))) {
            return `No tens accés al projecte ${args.codi_projecte}. Contacta amb l'administrador.`;
          }
        }

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
        // El recompte de projectes actius s'ha de filtrar per accés d'usuari.
        // Per a admins usem count=exact (ràpid); per a usuaris normals carguem
        // les files amb allowed_users i comptem manualment.
        const comptaProjectesActius = async (): Promise<string> => {
          if (isAdmin) {
            return fetch(`${supaUrl}/rest/v1/projectes?select=id&status=eq.actiu`, {
              headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}`, "Prefer": "count=exact", "Range-Unit": "items", Range: "0-0" }
            }).then(r => r.headers.get("content-range")?.split("/")[1] ?? "?");
          }
          // Usuari normal: carrega tots els projectes actius amb allowed_users
          const tots = await supaGet(supaUrl, supaKey,
            "projectes?select=id,allowed_users&status=eq.actiu&limit=500"
          ) as { id: string; allowed_users: unknown }[];
          const accessibles = tots.filter(p => {
            if (p.allowed_users === null) return true;
            if (!Array.isArray(p.allowed_users)) return false;
            if ((p.allowed_users as unknown[]).length === 0) return false;
            if (!userId) return false;
            return (p.allowed_users as { userId: string }[]).some(u => u.userId === userId);
          });
          return String(accessibles.length);
        };

        const [equips, camps, gubim, projectesActius, tags, rosmiman, inst3d] = await Promise.all([
          supaGet(supaUrl, supaKey, "equipments?select=id&limit=1&offset=0").then(() =>
            fetch(`${supaUrl}/rest/v1/equipments?select=id`, { headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}`, "Prefer": "count=exact", "Range-Unit": "items", Range: "0-0" } })
              .then(r => r.headers.get("content-range")?.split("/")[1] ?? "?")
          ),
          fetch(`${supaUrl}/rest/v1/fields?select=col`, { headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}`, "Prefer": "count=exact", "Range-Unit": "items", Range: "0-0" } })
            .then(r => r.headers.get("content-range")?.split("/")[1] ?? "?"),
          fetch(`${supaUrl}/rest/v1/gubim_class?select=id`, { headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}`, "Prefer": "count=exact", "Range-Unit": "items", Range: "0-0" } })
            .then(r => r.headers.get("content-range")?.split("/")[1] ?? "?"),
          comptaProjectesActius(),
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
          `- Projectes actius (accessibles): ${projectesActius}`,
          `- TAGs de projectes (projecte_tags): ${tags}`,
          `- TAGs Rosmiman globals: ${rosmiman}`,
          `- Instal·lacions al Visor 3D: ${inst3d}`,
        ].join("\n");
      }

      default:
        return `Tool desconeguda: ${name}`;
    }
  } catch (err) {
    console.error(`groq-chat: executaTool ERROR [${name}]:`, err instanceof Error ? err.message : String(err));
    return `Error executant ${name}: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// ─── Verificació JWT ──────────────────────────────────────────────────────────
// Valida el JWT de Supabase contra l'endpoint /auth/v1/user.
// Retorna el perfil complet de l'usuari (id, role, allowed_views) o null si el token és invàlid.
// Això garanteix que ningú pot suplantar un altre usuari falsificant el body.

interface SupabaseUserRow {
  id: string;
  role: string;
  user_metadata?: Record<string, unknown>;
}

interface UserPerfilVerificat {
  userId: string;
  isAdmin: boolean;
  seccions: Record<string, string>; // { equips: "editor"|"viewer"|"none", ... }
}

async function verificaJWT(
  jwt: string,
  supaUrl: string,
  supaAnonKey: string,      // clau anon per a /auth/v1/user
  supaServiceKey: string,   // clau service_role per a /rest/v1/user_profiles
): Promise<UserPerfilVerificat | null> {
  // 1. Valida el JWT contra Supabase Auth
  const authRes = await fetch(`${supaUrl}/auth/v1/user`, {
    headers: {
      apikey: supaAnonKey,
      Authorization: `Bearer ${jwt}`,
    },
  });
  if (!authRes.ok) return null;

  const authUser = await authRes.json() as SupabaseUserRow;
  const userId = authUser?.id;
  if (!userId) return null;

  // 2. Llegeix el perfil de user_profiles per obtenir role i allowed_views
  const profileRes = await fetch(
    `${supaUrl}/rest/v1/user_profiles?select=role,allowed_views&id=eq.${encodeURIComponent(userId)}&limit=1`,
    {
      headers: {
        apikey: supaServiceKey,
        Authorization: `Bearer ${supaServiceKey}`,
      },
    }
  );

  let isAdmin = false;
  let seccions: Record<string, string> = {};

  if (profileRes.ok) {
    const rows = await profileRes.json() as { role: string; allowed_views: unknown }[];
    if (rows.length > 0) {
      const row = rows[0];
      isAdmin = row.role === "admin";

      // Parseja allowed_views (objecte { equips: "editor", ... })
      if (!isAdmin && row.allowed_views && typeof row.allowed_views === "object" && !Array.isArray(row.allowed_views)) {
        seccions = row.allowed_views as Record<string, string>;
      } else if (!isAdmin && Array.isArray(row.allowed_views)) {
        // Format llegacy: array de strings → viewer per a cada secció
        for (const v of row.allowed_views as string[]) {
          seccions[v] = "viewer";
        }
      }
    }
  }

  return { userId, isAdmin, seccions };
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

REGLA FONAMENTAL — INVENTAR DADES ESTÀ TOTALMENT PROHIBIT:
- Qualsevol pregunta sobre dades (quants, quins, llista, estat, codi...) requereix cridar la tool corresponent ABANS de respondre.
- Si no has cridat cap tool, no pots donar cap xifra, nom, codi ni llista. Absolutament cap.
- MAI escrius el nom d'una tool a la teva resposta. Les tools s'executen internament i l'usuari no les veu mai.
- MAI uses frases com "Ho sento" o "no he pogut consultar" — si tens el resultat de la tool, usa'l per respondre.

REGLES ADDICIONALS:
1. Nom instal·lació → cerca_installacio → retorna codi (ex: ED014).
2. Nom equip → cerca_equips → retorna equip_code (ex: BCCS). Usa equip_code, MAI gubim_code.
3. TAG → crida primer_tag_disponible i presenta SEMPRE les dues opcions (A i B) en la primera resposta.
4. Candidat clar a cerca_equips (puntuació màxima) → usa'l directament sense demanar confirmació.
5. cerca_gubim amb múltiples resultats → SEMPRE mostra la llista completa a l'usuari i demana que confirmi quin és el que busca. MAI tries per compte propi quan hi ha ambigüitat.
5. Codis reutilitzables del fil actual només si venen d'una tool. Si hi ha dubte, consulta.
6. La "pàgina actual" és ORIENTATIVA. Respon qualsevol consulta de les seccions accessibles, independentment de la pàgina oberta. MAI redirigeixis l'usuari si pots obtenir la informació amb les tools.

FORMAT TAG: INST_EQUIP_CCMfu(2d)LLETRA  ex: ED014_BCCS_101B
CCM=1digit(0-9) FUNCIO=2digits(01-99,mai00) LLETRA=A-Z`;

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST")   { res.status(405).json({ error: "Mètode no permès" }); return; }

  const groqKey    = process.env.GROQ_API_KEY;
  const voyageKey  = process.env.VOYAGE_API_KEY;
  const supaUrl    = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const supaKey    = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supaAnon   = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;

  if (!groqKey)   { res.status(500).json({ error: "Falta GROQ_API_KEY" }); return; }
  if (!voyageKey) { res.status(500).json({ error: "Falta VOYAGE_API_KEY" }); return; }
  if (!supaUrl)   { res.status(500).json({ error: "Falta SUPABASE_URL" }); return; }
  if (!supaKey)   { res.status(500).json({ error: "Falta SUPABASE_SERVICE_ROLE_KEY" }); return; }

  let body: {
    messages?: MissatgeAPI[];
    context?: {
      pageContext?: string;
      sectionPermisos?: Record<string, string>; // hint del client (usat si no hi ha JWT)
    };
  };
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    res.status(400).json({ error: "Body invàlid" }); return;
  }

  const missatgesUsuari = body.messages ?? [];
  if (!Array.isArray(missatgesUsuari) || missatgesUsuari.length === 0) {
    res.status(400).json({ error: "Cap missatge rebut" }); return;
  }

  // ── Verificació d'identitat: JWT → perfil real del servidor ───────────────
  // El JWT viatja a la capçalera Authorization: Bearer <token>.
  // Si és vàlid, la identitat i permisos provenen de Supabase (font de veritat).
  // Si no n'hi ha (context embegut, tests), es fa servir el hint del body com a
  // fallback —menys segur, però compatible amb entorns sense autenticació.
  let isAdmin  = false;
  let seccions: Record<string, string> = {};
  let userId: string | null = null;

  const authHeader = req.headers?.authorization ?? req.headers?.Authorization ?? "";
  const jwt = typeof authHeader === "string" && authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : "";

  if (jwt && supaAnon) {
    // Ruta segura: verifica el JWT contra Supabase i n'extreu el perfil real
    const perfil = await verificaJWT(jwt, supaUrl, supaAnon, supaKey);
    if (!perfil) {
      console.error("groq-chat: JWT invàlid o caducat");
      res.status(401).json({ error: "Token invàlid o caducat. Torna a iniciar sessió." }); return;
    }
    isAdmin  = perfil.isAdmin;
    seccions = perfil.seccions;
    userId   = perfil.userId;
    console.log(`groq-chat: userId=${userId} isAdmin=${isAdmin} seccions=${JSON.stringify(seccions)}`);
  } else {
    // Fallback: usa el hint del client (sectionPermisos del body).
    console.warn(`groq-chat: sense JWT (jwt=${!!jwt}) o SUPABASE_ANON_KEY (anon=${!!supaAnon}) — mode insegur`);
    seccions = body.context?.sectionPermisos ?? {};
    isAdmin  = false;
    userId   = null;
  }

  const TOOL_SECCIO: Record<string, string> = {
    cerca_installacio:     "visor3d",
    cerca_equips:          "equips",
    cerca_gubim:           "gubimclass",
    cerca_camps:           "fields",
    cerca_projecte:        "projectes",
    cerca_tags_projecte:   "projectes",
    primer_tag_disponible: "projectes",
    cerca_tags_rosmiman:   "rosmiman",
    cerca_visor3d:         "visor3d",
    // estadistiques_globals: accessible a tothom (no necessita seccio restringida)
  };

  function teAcces(toolName: string): boolean {
    if (isAdmin) return true;
    const seccio = TOOL_SECCIO[toolName];
    if (!seccio) return true; // tools sense seccio (estadistiques_globals) sempre accessibles
    return (seccions[seccio] ?? "none") !== "none";
  }

  const NOMS_SECCIO: Record<string,string> = {
    equips:"Taula Master", gubimclass:"GuBIMClass", fields:"Diccionari de camps",
    projectes:"Projectes i TAGs", rosmiman:"Llistat Rosmiman", visor3d:"Visualitzador 3D",
  };

  function missatgeDenegat(toolName: string): string {
    const s = TOOL_SECCIO[toolName] ?? toolName;
    return "No tens acces a la seccio \"" + (NOMS_SECCIO[s] ?? s) + "\". Contacta amb l'administrador.";
  }

  // ── Filtra les tools per permisos (el model no veu eines inaccessibles) ───
  const toolsPermeses = TOOLS.filter(t => teAcces(t.function.name));

  // ── Resum de permisos per injectar al system prompt ───────────────────────
  let resumPermisos: string;
  if (isAdmin) {
    resumPermisos = "\n\nROL: Administrador. Tens accés complet a totes les seccions i dades.";
  } else {
    const accessibles: string[] = ["Dashboard (estadístiques globals)"];
    const negades: string[] = [];
    const mapa: Array<[string, string]> = [
      ["equips",     "Taula Master (equips, GuBIMClass, diccionari de camps)"],
      ["gubimclass", "GuBIMClass"],
      ["fields",     "Diccionari de camps"],
      ["projectes",  "Projectes i TAGs"],
      ["rosmiman",   "Llistat Rosmiman"],
      ["visor3d",    "Visualitzador 3D i instal·lacions"],
    ];
    for (const [clau, nom] of mapa) {
      const perm = seccions[clau] ?? "none";
      if (perm !== "none") { accessibles.push(`${nom} (${perm})`); }
      else { negades.push(nom); }
    }
    resumPermisos = `\n\nPERMISOS D'AQUEST USUARI:\nSeccions accessibles: ${accessibles.join(", ")}.\nSeccions SENSE accés: ${negades.length > 0 ? negades.join(", ") : "cap (accés total)"}.` +
      (negades.length > 0
        ? "\nIMPORTANT: Si l'usuari pregunta sobre una secció sense accés, respon exactament: \"No tens accés a la secció [nom]. Contacta amb l'administrador.\" No proporcionis cap dada d'aquestes seccions."
        : "");
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
    + resumPermisos
    + (body.context?.pageContext ? `\n\nPàgina on és l'usuari ara: ${body.context.pageContext} (orientatiu — pots respondre consultes de qualsevol secció accessible)` : "")
    + ragContext;

  // Historial limitat a 8 torns
  const historial: MissatgeAPI[] = [
    { role: "system", content: systemContent },
    ...missatgesUsuari.slice(-8),
  ];

  // Si no hi ha cap tool disponible, no enviem el paràmetre tools (Groq rebutja tools:[])
  // Per a preguntes que clarament demanen dades de la BD, forcem tool_choice:"required"
  // per evitar que el model respongui de memòria sense consultar. Per a preguntes de
  // cortesia o conversacionals, usem "auto" per no forçar una crida innecessària.
  const ultimPregunta = (missatgesUsuari[missatgesUsuari.length - 1]?.content ?? "").toLowerCase();
  const semblaPreguntaDeDades = /\b(quant[s]?|quin[s]?|quina[s]?|llista|mostra|cerca|busca|existeix|hi ha|quins|troba|dame|dóna|actiu|activa|estat|status|projecte|equip|instal·laci|tag|rosmiman|visor|gubim|camp[s]?)\b/.test(ultimPregunta);

  const toolChoiceValue = semblaPreguntaDeDades ? "required" : "auto";
  const toolsPayload = toolsPermeses.length > 0
    ? { tools: toolsPermeses, tool_choice: toolChoiceValue as "required" | "auto" }
    : {};

  try {
    console.log(`groq-chat: toolsPermeses=${toolsPermeses.length} tool_choice=${toolChoiceValue || "none"} pregunta="${ultimPregunta.slice(0,60)}"`);
    // ── Primera crida a Groq (amb tools) ────────────────────────────────────
    const groqRes1 = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${groqKey}` },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: 1500,
        temperature: 0.1,
        ...toolsPayload,
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
            ...toolsPayload,
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
              ? await executaTool(tc.function.name, a, supaUrl!, supaKey!, isAdmin, userId)
              : missatgeDenegat(tc.function.name);
            return { id: tc.id, name: tc.function.name, resultat };
          }));
          rets.forEach(r => toolMsgs.push({ role: "tool", tool_call_id: r.id, name: r.name, content: r.resultat }));
          const gr2 = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${groqKey}` },
            body: JSON.stringify({
              model: "llama-3.3-70b-versatile", max_tokens: 1500, temperature: 0,
              // Sense tools a la 2a crida del reintent
              messages: [{ role: "system", content: systemContent }, ultimMissatge, retryMsg, ...toolMsgs],
            }),
          });
          if (!gr2.ok) { res.status(502).json({ error: "Error Groq reintent 2a crida" }); return; }
          const d2 = await gr2.json() as { choices: { message: { content: string } }[] };
          const reintentResp = d2.choices[0].message.content ?? "";
          const _names = ["cerca_installacio","cerca_equips","cerca_gubim","cerca_camps","cerca_projecte","cerca_tags_projecte","cerca_tags_rosmiman","cerca_visor3d","primer_tag_disponible","estadistiques_globals"];
          const teFuncioReintent = /<function=\w+\(/.test(reintentResp) || /\b(cerca_\w+|estadistiques_globals|primer_tag_disponible)\s*\(/.test(reintentResp) || new RegExp("\\b(" + _names.join("|") + ")\\s*$").test(reintentResp.trim());
          res.status(200).json({ reply: teFuncioReintent ? "Ho sento, no he pogut obtenir la informació en aquest moment. Torna a fer la pregunta." : reintentResp }); return;
        }
        const retryContent = retryMsg.content ?? "";
        const _names2 = ["cerca_installacio","cerca_equips","cerca_gubim","cerca_camps","cerca_projecte","cerca_tags_projecte","cerca_tags_rosmiman","cerca_visor3d","primer_tag_disponible","estadistiques_globals"];
        const teFuncioRetry = /<function=\w+\(/.test(retryContent) || /\b(cerca_\w+|estadistiques_globals|primer_tag_disponible)\s*\(/.test(retryContent) || new RegExp("\\b(" + _names2.join("|") + ")\\s*$").test(retryContent.trim());
        res.status(200).json({ reply: teFuncioRetry ? "Ho sento, no he pogut obtenir la informació en aquest moment. Torna a fer la pregunta." : retryContent }); return;
      }
      res.status(502).json({ error: `Error Groq: ${groqRes1.status} — ${errText}` }); return;
    }

    const data1 = await groqRes1.json() as {
      choices: { message: MissatgeAPI; finish_reason: string }[];
    };

    const missatgeAssistent = data1.choices[0].message;
    const finishReason1 = data1.choices[0].finish_reason;
    console.log(`groq-chat: finish_reason=${finishReason1} tool_calls=${missatgeAssistent.tool_calls?.length ?? 0} content="${(missatgeAssistent.content ?? "").slice(0,100)}"`);

    // ── Si el model crida tools → executar i fer segona crida ───────────────
    if (data1.choices[0].finish_reason === "tool_calls" && missatgeAssistent.tool_calls?.length) {
      const toolMessages: MissatgeAPI[] = [];

      const resultats = await Promise.all(
        missatgeAssistent.tool_calls.map(async tc => {
          const args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
          const resultat = teAcces(tc.function.name)
            ? await executaTool(tc.function.name, args, supaUrl!, supaKey!, isAdmin, userId)
            : missatgeDenegat(tc.function.name);
          return { id: tc.id, name: tc.function.name, resultat };
        })
      );

      resultats.forEach(r => {
        console.log(`groq-chat: tool [${r.name}] resultat="${r.resultat.slice(0,120)}"`);
        toolMessages.push({
          role: "tool",
          tool_call_id: r.id,
          name: r.name,
          content: r.resultat,
        });
      });

      console.log(`groq-chat: iniciant 2a crida Groq amb ${toolMessages.length} tool results`);

      // La 2a crida té un system prompt minimalista: només ha de formatar el resultat
      // de la tool en una resposta clara en català. No ha de prendre cap decisió ni
      // interpretar regles complexes — simplement presentar les dades rebudes.
      const systemFormat = `Ets un assistent que presenta resultats de consultes a una base de dades en català.
Tens el resultat d'una consulta a la base de dades. Presenta'l de forma clara i concisa.
Si el resultat conté projectes, equips, instal·lacions o TAGs, llista'ls ordenadament.
Si el resultat indica que no hi ha dades, informa l'usuari amablement.
MAI inventis dades addicionals. MAI escriguis noms de funcions o codi.`;

      const groqRes2 = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${groqKey}` },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          max_tokens: 1500,
          temperature: 0.1,
          // Sense tools: la 2a crida nomes ha de formatar la resposta
          messages: [
            { role: "system", content: systemFormat },
            // Inclou nomes l'ultim missatge de l'usuari + resultat de la tool
            missatgesUsuari[missatgesUsuari.length - 1],
            missatgeAssistent,
            ...toolMessages,
          ],
        }),
      });

      console.log(`groq-chat: 2a crida Groq status=${groqRes2.status}`);
      if (!groqRes2.ok) {
        const err = await groqRes2.text();
        res.status(502).json({ error: `Error Groq 2a crida: ${groqRes2.status} — ${err}` }); return;
      }

      const data2 = await groqRes2.json() as {
        choices: { message: { content: string } }[];
      };

      const respostaFinal = data2.choices[0].message.content ?? "";
      const teFuncioInline2 = /<function=\w+\(/.test(respostaFinal) ||
        /\b(cerca_\w+|estadistiques_globals|primer_tag_disponible)\s*\(/.test(respostaFinal);

      console.log(`groq-chat: 2a crida resposta="${respostaFinal.slice(0,150)}" bloquejat=${teFuncioInline2}`);

      res.status(200).json({
        reply: teFuncioInline2
          ? "Ho sento, no he pogut obtenir la informació en aquest moment. Torna a fer la pregunta."
          : respostaFinal,
      }); return;
    }

    // ── Resposta directa sense tool calls ────────────────────────────────────
    const contingutFinal = missatgeAssistent.content ?? "";

    // Detecció: el model ha escrit sintaxi de tool o nom de tool a la resposta
    // en lloc d'usar el mecanisme tool_calls de l'API.
    // Patrons detectats:
    //   <function=cerca_projecte(...)>  → format XML inline
    //   cerca_projecte(...)             → crida directa amb parèntesi
    //   text acabat en "cerca_projecte" → model no ha sabut cridar la tool i ha escrit el nom
    const NOMS_TOOLS = [
      "cerca_installacio","cerca_equips","cerca_gubim","cerca_camps",
      "cerca_projecte","cerca_tags_projecte","cerca_tags_rosmiman",
      "cerca_visor3d","primer_tag_disponible","estadistiques_globals",
    ];
    const reToolInline  = /<function=\w+\(/;
    const reToolParens  = /\b(cerca_\w+|estadistiques_globals|primer_tag_disponible)\s*\(/;
    const reToolSolt    = new RegExp("\\b(" + NOMS_TOOLS.join("|") + ")\\s*$");
    const teniaFuncioInline = reToolInline.test(contingutFinal) ||
      reToolParens.test(contingutFinal) ||
      reToolSolt.test(contingutFinal.trim());

    if (teniaFuncioInline) {
      res.status(200).json({ reply: "Ho sento, no he pogut obtenir la informació en aquest moment. Torna a fer la pregunta." }); return;
    }

    res.status(200).json({ reply: contingutFinal }); return;

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg }); return;
  }
}
