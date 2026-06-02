// api/index-embeddings.ts
// Vercel Edge Function — indexa totes les dades de la plataforma a Supabase pgvector
// usant Voyage AI per generar els embeddings (gratuït fins 50M tokens/mes).
//
// Endpoint: POST /api/index-embeddings
// Headers:  Authorization: Bearer <SUPABASE_SERVICE_KEY>
// Body:     { tipus?: 'equip'|'field'|'gubim'|'projecte'|'tag'|'tot' }
// Retorna:  { indexats: number, errors: number, temps_ms: number }
// ─────────────────────────────────────────────────────────────────────────────

export const config = { runtime: "edge" };

// ─── Tipus ────────────────────────────────────────────────────────────────────

interface EquipRow {
  id: string;
  equip_code: string;
  equip_name: string;
  gubim_code: string;
  field_cols: string[];
  revit_category: string;
  table_name: string;
}

interface FieldRow {
  col: string;
  codi: string | null;
  tipus_dada: string | null;
  cbt: string | null;
  disciplina: string | null;
  agrupacio_revit: string | null;
  format_param: string | null;
}

interface GubimRow {
  code: string;
  name: string;
  level: number;
  parent_code: string | null;
}

interface TagRow {
  tag_complet: string;
  codi_installacio: string;
  ccm: string;
  funcio: string;
  duplicitat: string;
  status: string;
  descripcio_equip: string;
  projecte_id: string;
}

interface ProjecteRow {
  id: string;
  codi_projecte: string;
  nom: string;
  status: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Genera el text indexable per a cada tipus de registre
function textEquip(r: EquipRow): string {
  const parts = [
    r.equip_code ? `Codi: ${r.equip_code}` : "",
    `Nom: ${r.equip_name}`,
    `GuBIMClass: ${r.gubim_code}`,
    r.revit_category ? `Categoria Revit: ${r.revit_category}` : "",
    r.table_name ? `Taula: ${r.table_name}` : "",
    r.field_cols?.length ? `Camps: ${r.field_cols.join(", ")}` : "",
  ].filter(Boolean);
  return parts.join(" | ");
}

function textField(r: FieldRow): string {
  const parts = [
    `Camp: ${r.col}`,
    r.codi        ? `Codi: ${r.codi}`             : "",
    r.tipus_dada  ? `Tipus: ${r.tipus_dada}`       : "",
    r.cbt         ? `CBT: ${r.cbt}`                : "",
    r.disciplina  ? `Disciplina: ${r.disciplina}`  : "",
    r.agrupacio_revit ? `Agrupació Revit: ${r.agrupacio_revit}` : "",
    r.format_param ? `Format: ${r.format_param}`   : "",
  ].filter(Boolean);
  return parts.join(" | ");
}

function textGubim(r: GubimRow): string {
  return `GuBIMClass ${r.code}: ${r.name}${r.parent_code ? ` (pare: ${r.parent_code})` : ""}`;
}

function textTag(r: TagRow, nomProjecte: string): string {
  const parts = [
    `TAG: ${r.tag_complet}`,
    `Instal·lació: ${r.codi_installacio}`,
    `Projecte: ${nomProjecte}`,
    `Estat: ${r.status}`,
    r.descripcio_equip ? `Equip: ${r.descripcio_equip}` : "",
    r.funcio      ? `Funció: ${r.funcio}`        : "",
    r.duplicitat  ? `Duplicitat: ${r.duplicitat}` : "",
  ].filter(Boolean);
  return parts.join(" | ");
}

function textProjecte(r: ProjecteRow): string {
  return `Projecte ${r.codi_projecte}: ${r.nom} (estat: ${r.status})`;
}

// Crida a Voyage AI per generar embeddings en batch
// Model: voyage-3-lite — gratuït, 1024 dimensions, òptim per cerca
async function generaEmbeddings(
  textos: string[],
  voyageKey: string
): Promise<number[][]> {
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${voyageKey}`,
    },
    body: JSON.stringify({
      model: "voyage-3-lite",
      input: textos,
      input_type: "document",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Voyage AI error ${res.status}: ${err}`);
  }

  const data = await res.json() as { data: { embedding: number[] }[] };
  return data.data.map(d => d.embedding);
}

// Insereix un batch de registres a cbt_embeddings via Supabase REST
async function upsertBatch(
  registres: { id: string; tipus: string; contingut: string; metadata: object; embedding: number[] }[],
  supaUrl: string,
  supaKey: string
): Promise<number> {
  const res = await fetch(`${supaUrl}/rest/v1/cbt_embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": supaKey,
      "Authorization": `Bearer ${supaKey}`,
      "Prefer": "resolution=merge-duplicates",
    },
    body: JSON.stringify(registres),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase upsert error ${res.status}: ${err}`);
  }
  return registres.length;
}

// Processa en batches de N (Voyage AI accepta fins a 128 per crida)
const BATCH_SIZE = 64;

async function processaBatch<T>(
  items: T[],
  tipus: string,
  getId: (item: T) => string,
  getText: (item: T) => string,
  getMetadata: (item: T) => object,
  voyageKey: string,
  supaUrl: string,
  supaKey: string
): Promise<{ indexats: number; errors: number }> {
  let indexats = 0;
  let errors = 0;

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const chunk = items.slice(i, i + BATCH_SIZE);
    try {
      const textos = chunk.map(getText);
      const embeddings = await generaEmbeddings(textos, voyageKey);

      const registres = chunk.map((item, j) => ({
        id:        `${tipus}:${getId(item)}`,
        tipus,
        contingut: textos[j],
        metadata:  getMetadata(item),
        embedding: embeddings[j],
      }));

      await upsertBatch(registres, supaUrl, supaKey);
      indexats += chunk.length;
    } catch (err) {
      console.error(`Error batch ${tipus} [${i}..${i + BATCH_SIZE}]:`, err);
      errors += chunk.length;
    }
  }

  return { indexats, errors };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: Request): Promise<Response> {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Mètode no permès" }), { status: 405, headers });
  }

  // Variables d'entorn necessàries
  const voyageKey  = process.env.VOYAGE_API_KEY;
  const supaUrl    = process.env.SUPABASE_URL    ?? process.env.VITE_SUPABASE_URL;
  const supaKey    = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!voyageKey) return new Response(JSON.stringify({ error: "Falta VOYAGE_API_KEY" }), { status: 500, headers });
  if (!supaUrl)   return new Response(JSON.stringify({ error: "Falta SUPABASE_URL" }), { status: 500, headers });
  if (!supaKey)   return new Response(JSON.stringify({ error: "Falta SUPABASE_SERVICE_ROLE_KEY" }), { status: 500, headers });

  const body = await req.json().catch(() => ({})) as { tipus?: string };
  const tipusTarget = body.tipus ?? "tot";

  const t0 = Date.now();
  let totalIndexats = 0;
  let totalErrors   = 0;

  const supaFetch = async (path: string) => {
    const res = await fetch(`${supaUrl}/rest/v1/${path}`, {
      headers: { "apikey": supaKey, "Authorization": `Bearer ${supaKey}` },
    });
    if (!res.ok) throw new Error(`Supabase fetch error ${res.status}: ${path}`);
    return res.json();
  };

  // ── Equips ──
  if (tipusTarget === "tot" || tipusTarget === "equip") {
    const rows: EquipRow[] = await supaFetch(
      "equipments?select=id,equip_code,equip_name,gubim_code,field_cols,revit_category,table_name&limit=5000"
    );
    const r = await processaBatch(
      rows, "equip",
      e => e.id,
      textEquip,
      e => ({ equipCode: e.equip_code, equipName: e.equip_name, gubimCode: e.gubim_code }),
      voyageKey, supaUrl, supaKey
    );
    totalIndexats += r.indexats;
    totalErrors   += r.errors;
  }

  // ── Fields ──
  if (tipusTarget === "tot" || tipusTarget === "field") {
    const rows: FieldRow[] = await supaFetch(
      "fields_meta?select=col,codi,tipus_dada,cbt,disciplina,agrupacio_revit,format_param&limit=2000"
    );
    const r = await processaBatch(
      rows, "field",
      f => f.col,
      textField,
      f => ({ col: f.col, codi: f.codi, tipus_dada: f.tipus_dada }),
      voyageKey, supaUrl, supaKey
    );
    totalIndexats += r.indexats;
    totalErrors   += r.errors;
  }

  // ── GuBIMClass ──
  if (tipusTarget === "tot" || tipusTarget === "gubim") {
    const rows: GubimRow[] = await supaFetch(
      "gubim_class?select=code,name,level,parent_code&limit=2000"
    );
    const r = await processaBatch(
      rows, "gubim",
      g => g.code,
      textGubim,
      g => ({ code: g.code, name: g.name }),
      voyageKey, supaUrl, supaKey
    );
    totalIndexats += r.indexats;
    totalErrors   += r.errors;
  }

  // ── Projectes + TAGs ──
  if (tipusTarget === "tot" || tipusTarget === "projecte" || tipusTarget === "tag") {
    const projectes: ProjecteRow[] = await supaFetch(
      "projectes?select=id,codi_projecte,nom,status&limit=500"
    );

    // Indexar projectes
    if (tipusTarget === "tot" || tipusTarget === "projecte") {
      const r = await processaBatch(
        projectes, "projecte",
        p => p.id,
        textProjecte,
        p => ({ codiProjecte: p.codi_projecte, nom: p.nom, status: p.status }),
        voyageKey, supaUrl, supaKey
      );
      totalIndexats += r.indexats;
      totalErrors   += r.errors;
    }

    // Indexar TAGs
    if (tipusTarget === "tot" || tipusTarget === "tag") {
      const nomPerId = Object.fromEntries(projectes.map(p => [p.id, `${p.codi_projecte} ${p.nom}`]));
      const tags: TagRow[] = await supaFetch(
        "projecte_tags?select=tag_complet,codi_installacio,ccm,funcio,duplicitat,status,descripcio_equip,projecte_id&limit=10000"
      );
      const r = await processaBatch(
        tags, "tag",
        t => t.tag_complet,
        t => textTag(t, nomPerId[t.projecte_id] ?? t.projecte_id),
        t => ({ tagComplet: t.tag_complet, codiInstallacio: t.codi_installacio, status: t.status }),
        voyageKey, supaUrl, supaKey
      );
      totalIndexats += r.indexats;
      totalErrors   += r.errors;
    }
  }

  return new Response(
    JSON.stringify({
      indexats:  totalIndexats,
      errors:    totalErrors,
      temps_ms:  Date.now() - t0,
    }),
    { status: 200, headers }
  );
}
