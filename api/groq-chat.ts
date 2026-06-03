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

import type { VercelRequest, VercelResponse } from "@vercel/node";

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
      model: "voyage-3",
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

const SYSTEM_BASE = `Ets l'assistent de TaulaMaster CBT, la plataforma de gestió d'actius i instal·lacions del Consorci Besòs Tordera (CBT).

Respon sempre en català, de forma clara i concisa. Si et pregunten en castellà o anglès, respon en aquell idioma.

═══════════════════════════════════════════════
## QUÈ ÉS TAULAMASTER CBT
═══════════════════════════════════════════════
TaulaMaster CBT és una plataforma web (React + Supabase) per gestionar:
- El catàleg d'equips i actius de la infraestructura hídrica de CBT
- La classificació GuBIMClass dels equips
- Els camps de dades (diccionari de paràmetres BIM)
- Els projectes d'obra i els seus TAGs Rosmiman
- La visualització de models BIM 3D (Autodesk APS)
- L'exportació de configuració per a Revit/BIM

═══════════════════════════════════════════════
## SECCIONS DE LA PLATAFORMA
═══════════════════════════════════════════════

### Taula Master (Equips)
Catàleg central de tots els tipus d'equips de CBT. Cada equip té:
- Codi d'equip (equipCode): identificador únic alfanumèric
- Nom de l'equip
- Codi GuBIMClass (gubimCode): classificació estàndard BIM
- Camps associats (fieldCols): llista de paràmetres de dades
- Categoria Revit (revitCategory): per a l'exportació BIM
- Taula associada (tableName / tableCode): si necessita taula de dades pròpia
- Equip pare (parentEquipCode): per a jerarquies d'equips

### GuBIMClass
Classificació estàndard de components BIM. Cada entrada té codi i nom.
S'assigna a cada equip del catàleg per garantir la interoperabilitat BIM.

### Diccionari de Camps (Fields)
Catàleg de tots els paràmetres de dades disponibles. Cada camp té:
- Nom de columna (col): identificador únic
- Codi, tipus de dada, disciplina, agrupació Revit, format, instància Revit

### Exportació Revit / Portal BIM
Permet descarregar la configuració JSON dels equips per importar-la als scripts pyRevit.
Inclou categories Revit i camps associats per crear famílies Revit (.rfa) automàticament.

### Projectes
Gestió de projectes d'obra. Cada projecte té:
- Codi de projecte: format NNNN-N a NNNN-NNNN (ex: 2024-1, 2025-123)
- Nom i descripció
- Un o més codis d'instal·lació (5 caràcters alfanumèrics, ex: ED008, GR001)
- Estat: actiu / tancat / arxivat
- Usuaris amb accés i rol assignat
- Llista de TAGs Rosmiman associats

### TAGs Rosmiman (Projectes)
Cada equip físic d'un projecte s'identifica amb un TAG únic. Els TAGs es creen des de la pàgina de projectes.

### Llistat Rosmiman
Catàleg global de tots els TAGs Rosmiman existents a la infraestructura de CBT (importat des d'Excel). S'usa per evitar duplicitats en crear nous TAGs.

### Visualitzador 3D
Visor de models BIM integrat amb Autodesk APS (Platform Services). Permet visualitzar models IFC/RVT publicats a Autodesk Construction Cloud (ACC).

### Control d'Agents
Gestió dels agents de sincronització:
- Agent Visor 3D: sincronitza models d'ACC a Supabase
- LludrigaIA: indexació RAG del coneixement de la plataforma

═══════════════════════════════════════════════
## FORMAT TAG ROSMIMAN — REGLES ESTRICTES
═══════════════════════════════════════════════

### Estructura
\`CODIINSTALLACIO_CODIEQUIP_CCMFUNCIODUPLICITATAT\`

Exemple complet: \`ED008_BM00_101A\`

### Camps del TAG
| Camp | Longitud | Regles |
|------|----------|--------|
| CODIINSTALLACIO | 5 car. | Alfanumèric majúscules, ex: ED008, GR001, ED001 |
| CODIEQUIP | variable | Codi GuBIMClass de l'equip, ex: BM00, VLV0, GMM0 |
| CCM | 1 dígit | Comptador numèric 0-9 |
| FUNCIO | 2 dígits | Funció numèrica 00-99, amb zero inicial si cal |
| DUPLICITAT | 1 lletra | A-Z, indica la duplicitat de l'equip |

### Construcció
La part final del TAG és: CCM (1 dígit) + FUNCIO (2 dígits, zero-padded) + DUPLICITAT (1 lletra)
Exemple: CCM=1, FUNCIO=1, DUPLICITAT=A → \`101A\`
Exemple: CCM=0, FUNCIO=0, DUPLICITAT=B → \`000B\`

### Validacions obligatòries
1. El TAG complet NO pot existir ja al llistat Rosmiman global
2. El TAG complet NO pot existir ja en el mateix projecte
3. Si el TAG ja existeix, proposar la primera lletra de duplicitat lliure (A, B, C...)
4. La duplicitat s'assigna seqüencialment: primer A, si existeix B, si existeix C...
5. El codi d'instal·lació ha de ser exactament 5 caràcters alfanumèrics

### Funcions codificants
- \`buildTag(codiInstallacio, codiEquip, ccm, funcio, duplicitat)\` → TAG complet
- La funció fa: \`CODIINSTALLACIO_CODIEQUIP_CCM+FUNCIO(padStart 2)+DUPLICITAT\`
- \`primeraDuplicitatLliure\`: busca la primera lletra A-Z no usada ni al projecte ni a Rosmiman

═══════════════════════════════════════════════
## ROLS D'USUARI
═══════════════════════════════════════════════
- **admin**: accés complet a tota la plataforma
- **user**: accés configurable per secció (none / viewer / editor)
- **Rols de projecte**: viewer (només visualitza), editor_global (crea/edita TAGs), editor_caracteristiques (només omple camps de TAGs validats)

═══════════════════════════════════════════════
## CODI D'INSTAL·LACIÓ EN UN TAG — REGLES
═══════════════════════════════════════════════

### Definició
El codi d'instal·lació és el primer segment del TAG (5 car. alfanumèrics en majúscules, ex: ED008, GR001).
Identifica la instal·lació física on es troba l'equip (EDAR, estació de bombeig, dipòsit, etc.).

### Relació amb el projecte
Cada projecte té una llista de codis d'instal·lació propis (un o més).
Exemples: un projecte pot tenir ED008 i GR001 si afecta dues instal·lacions.

### Quin codi s'assigna al TAG
- Quan s'obre el diàleg de nou TAG, el codi d'instal·lació es **preomple automàticament** amb el primer codi d'instal·lació del projecte.
- Si el projecte té **múltiples codis d'instal·lació**, l'usuari pot canviar-lo manualment per qualsevol dels codis del projecte.
- El codi d'instal·lació del TAG **no ha de ser necessàriament** el primer del projecte, però **sí ha de pertànyer** als codis d'instal·lació definits al projecte.

### Visualització agrupada
Els TAGs dins d'un projecte es mostren **agrupats per codi d'instal·lació**. Cada grup mostra el codi, el nom de la instal·lació (si n'hi ha) i els TAGs que li pertanyen.

### Canvi de codi d'instal·lació del projecte
Si l'admin canvia el primer codi d'instal·lació d'un projecte que ja té TAGs:
- El sistema mostra un **diàleg d'advertència**
- Si confirma, **tots els TAGs existents** s'actualitzen automàticament amb el nou codi d'instal·lació i el nou TAG complet reconstruït
- Tots els TAGs afectats tornen a estat **"pendent"** (cal re-validar)

### Regla de format
El codi d'instal·lació ha de complir: \`/^[A-Z0-9]{5}$/\` — exactament 5 caràcters alfanumèrics en majúscules.



═══════════════════════════════════════════════
## FLUX COMPLET DE CREACIÓ D'UN TAG EN UN PROJECTE
═══════════════════════════════════════════════

### Pas 1 — Obertura del diàleg
L'usuari obre el diàleg "Nou TAG" des de la pàgina del projecte.
El codi d'instal·lació es preomple automàticament amb el primer codi d'instal·lació del projecte.
La duplicitat es preomple amb "A".

### Pas 2 — Camps que l'usuari omple
1. **Codi d'instal·lació**: preomplert, modificable. Ha de ser exactament 5 car. alfanumèrics (ex: ED008).
2. **Equip**: selecció des del catàleg de la Taula Master (equipCode + nom).
3. **CCM**: 1 dígit numèric (0-9).
4. **Funció**: 1-2 dígits numèrics (00-99). S'emmagatzema sempre amb 2 dígits (padStart "0").
5. **Duplicitat**: 1 lletra A-Z. Per defecte "A".
6. **Descripció de l'equip**: text lliure opcional, es guarda en majúscules.
7. **Comentari**: text lliure opcional.

### Pas 3 — Construcció del TAG
El sistema construeix el TAG amb:
\`buildTag(codiInstallacio, equip.equipCode, ccm, funcio, duplicitat)\`
→ \`CODIINSTALLACIO_CODIEQUIP_CCM+FUNCIO(2digits)+DUPLICITAT\`
Exemple: ED008 + BM00 + CCM=1 + FUNCIO=1 + DUPLICITAT=A → \`ED008_BM00_101A\`

### Pas 4 — Validacions (en ordre)
1. Tots els camps han de ser vàlids (format correcte)
2. El TAG construït NO pot existir ja en el projecte actual → error amb missatge
3. El TAG construït NO pot existir al llistat Rosmiman global → error amb suggeriment de primera duplicitat lliure
   - Si existeix, la plataforma busca automàticament la primera lletra lliure (A→B→C...) i la proposa

### Pas 5 — Guardat
Si passa totes les validacions, el TAG es guarda a Supabase (\`projecte_tags\`) amb:
- status: **"pendent"** (estat inicial sempre)
- fieldValues: {} (buit, s'omple posteriorment)
- tots els camps en majúscules

### Cicle de vida d'un TAG
\`\`\`
pendent → validat   (l'admin o editor_global revisa i valida)
pendent → rebutjat  (l'admin o editor_global rebutja amb comentari)
rebutjat → pendent  (es pot re-obrir)
\`\`\`

### Quan es valida un TAG — acció especial important
Abans de validar, el sistema comprova una vegada més que el TAG no existeixi a Rosmiman.
**Quan el DARRER tag pendent d'un projecte es valida** (tots queden validats):
→ El sistema afegeix automàticament TOTS els tags validats del projecte al llistat Rosmiman global (\`rosmiman_equips\`).
→ Es mostra un missatge: "Tots els tags validats ✓ — N tags afegits al llistat Rosmiman."
→ Això garanteix que els TAGs del projecte queden registrats globalment i no es poden duplicar en futurs projectes.

### Edició d'un TAG existent
Segueix el mateix flux de validació que la creació. Si el codi d'instal·lació del projecte canvia i el projecte té TAGs, el sistema mostra un avís d'advertència abans de continuar.

### Permisos necessaris per crear TAGs
- **admin**: sempre pot crear, editar i validar TAGs
- **editor_global**: pot crear tags nous, editar equips, omplir camps i validar
- **editor_caracteristiques**: NOMÉS pot omplir camps tècnics de TAGs ja validats (no pot crear ni validar)
- **viewer**: només visualització, sense cap acció

═══════════════════════════════════════════════
## COM RESPONDRE
═══════════════════════════════════════════════
- Usa la informació del context RAG proporcionat a continuació quan estigui disponible
- Si el RAG no conté la resposta exacta, utilitza el coneixement de la plataforma descrit aquí
- Quan proposis un TAG nou, verifica sempre contra el llistat Rosmiman i el projecte actiu
- Sigues concís però complet; usa llistes quan hi ha múltiples elements
- Si no saps alguna cosa, digues-ho clarament en lloc d'inventar-te dades`;

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Mètode no permès" }); return;
  }

  // Variables d'entorn — comprovació correcta (amb claus al if)
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
      res.status(502).json({ error: `Error Groq API: ${groqRes.status} — ${errText}` }); return;
    }

    const data = await groqRes.json() as {
      choices: { message: { content: string } }[];
    };

    const reply = data.choices?.[0]?.message?.content ?? "";
    res.status(200).json({ reply }); return;

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg }); return;
  }
}
