// api/index-embeddings.ts
// Vercel Serverless Function (Node.js) — indexa totes les dades de la plataforma
// a Supabase pgvector usant Voyage AI per generar els embeddings.
//
// Runtime: Node.js via @vercel/node (maxDuration configurat a vercel.json)
// Endpoint: POST /api/index-embeddings
// Body:     { tipus?: 'equip'|'field'|'gubim'|'projecte'|'tag'|'rosmiman'|'tot' }
// Retorna:  stream NDJSON amb línies de progrés + línia final { fet: true, ... }
// ─────────────────────────────────────────────────────────────────────────────

import type { VercelRequest, VercelResponse } from "@vercel/node";

// ─── Tipus ────────────────────────────────────────────────────────────────────

interface EquipRow {
  id: string;
  equip_code: string;
  equip_name: string;
  gubim_code: string;
  field_cols: string[];
  revit_category: string;
  table_name: string;
  table_code: string;
  parent_equip_code: string;
}

interface FieldRow {
  col: string;
  codi: string | null;
  tipus_dada: string | null;
  cbt: string | null;
  disciplina: string | null;
  agrupacio_revit: string | null;
  format_param: string | null;
  taula_assoc: string | null;
  grup_txt: string | null;
  instancia_revit: string | null;
}

interface GubimRow {
  id: string;
  code: string;
  name: string;
}

interface TagRow {
  id: string;
  tag_complet: string;
  codi_installacio: string;
  ccm: string;
  funcio: string;
  duplicitat: string;
  status: string;
  descripcio_equip: string;
  comentari: string;
  equip_id: string;
  projecte_id: string;
}

interface RosmimanRow {
  id: string;
  tag: string;
  descripcio: string;
  codi_installacio: string;
}

interface ProjecteRow {
  id: string;
  codi_projecte: string;
  nom: string;
  descripcio: string;
  status: string;
  codi_installacio: string;
}

// ─── Helpers text ─────────────────────────────────────────────────────────────

function textEquip(r: EquipRow): string {
  return [
    r.equip_code ? `Codi: ${r.equip_code}` : "",
    `Nom: ${r.equip_name}`,
    `GuBIMClass: ${r.gubim_code}`,
    r.revit_category ? `Categoria Revit: ${r.revit_category}` : "",
    r.table_name ? `Taula: ${r.table_name}` : "",
    r.table_code ? `Codi taula: ${r.table_code}` : "",
    r.parent_equip_code ? `Equip pare: ${r.parent_equip_code}` : "",
    r.field_cols?.length ? `Camps: ${r.field_cols.join(", ")}` : "",
  ].filter(Boolean).join(" | ");
}

function textField(r: FieldRow): string {
  return [
    `Camp: ${r.col}`,
    r.codi            ? `Codi: ${r.codi}`                     : "",
    r.tipus_dada      ? `Tipus: ${r.tipus_dada}`              : "",
    r.cbt             ? `CBT: ${r.cbt}`                       : "",
    r.disciplina      ? `Disciplina: ${r.disciplina}`         : "",
    r.agrupacio_revit ? `Agrupació Revit: ${r.agrupacio_revit}` : "",
    r.format_param    ? `Format: ${r.format_param}`           : "",
    r.taula_assoc     ? `Taula associada: ${r.taula_assoc}`   : "",
    r.grup_txt        ? `Grup: ${r.grup_txt}`                 : "",
    r.instancia_revit ? `Instància Revit: ${r.instancia_revit}` : "",
  ].filter(Boolean).join(" | ");
}

function textGubim(r: GubimRow): string {
  return `GuBIMClass ${r.code}: ${r.name}`;
}

function textTag(r: TagRow, nomProjecte: string): string {
  return [
    `TAG: ${r.tag_complet}`,
    `Instal·lació: ${r.codi_installacio}`,
    `Projecte: ${nomProjecte}`,
    `Estat: ${r.status}`,
    r.ccm             ? `CCM: ${r.ccm}`                   : "",
    r.funcio          ? `Funció: ${r.funcio}`              : "",
    r.duplicitat      ? `Duplicitat: ${r.duplicitat}`      : "",
    r.descripcio_equip ? `Equip: ${r.descripcio_equip}`   : "",
    r.comentari       ? `Comentari: ${r.comentari}`        : "",
  ].filter(Boolean).join(" | ");
}

function textRosmiman(r: RosmimanRow): string {
  return [
    `TAG Rosmiman: ${r.tag}`,
    `Instal·lació: ${r.codi_installacio}`,
    r.descripcio ? `Descripció: ${r.descripcio}` : "",
  ].filter(Boolean).join(" | ");
}

function textProjecte(r: ProjecteRow): string {
  return [
    `Projecte ${r.codi_projecte}: ${r.nom}`,
    `Estat: ${r.status}`,
    r.codi_installacio ? `Instal·lació: ${r.codi_installacio}` : "",
    r.descripcio       ? `Descripció: ${r.descripcio}`         : "",
  ].filter(Boolean).join(" | ");
}

// ─── Voyage AI ────────────────────────────────────────────────────────────────

async function generaEmbeddings(textos: string[], voyageKey: string): Promise<number[][]> {
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${voyageKey}` },
    body: JSON.stringify({ model: "voyage-3", input: textos, input_type: "document" }),
  });
  if (!res.ok) throw new Error(`Voyage AI error ${res.status}: ${await res.text()}`);
  const data = await res.json() as { data: { embedding: number[] }[] };
  return data.data.map((d) => d.embedding);
}

// ─── Supabase upsert ──────────────────────────────────────────────────────────

async function upsertBatch(
  registres: { id: string; tipus: string; contingut: string; metadata: object; embedding: number[] }[],
  supaUrl: string,
  supaKey: string
): Promise<void> {
  const res = await fetch(`${supaUrl}/rest/v1/cbt_embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supaKey,
      Authorization: `Bearer ${supaKey}`,
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify(registres),
  });
  if (!res.ok) throw new Error(`Supabase upsert error ${res.status}: ${await res.text()}`);
}

// ─── Processa en batches ──────────────────────────────────────────────────────

const BATCH_SIZE = 32; // Reduït per respectar el rate limit de Voyage AI

// Espera N ms
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Crida a Voyage AI amb reintents automàtics en cas de 429
async function generaEmbeddingsAmbReintents(
  textos: string[],
  voyageKey: string,
  intents = 4
): Promise<number[][]> {
  for (let i = 0; i < intents; i++) {
    try {
      return await generaEmbeddings(textos, voyageKey);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const is429 = msg.includes("429");
      if (is429 && i < intents - 1) {
        const espera = 20000 * (i + 1); // 20s, 40s, 60s
        console.log(`Voyage AI 429 — esperant ${espera / 1000}s (intent ${i + 1}/${intents})...`);
        await sleep(espera);
      } else {
        throw err;
      }
    }
  }
  throw new Error("Voyage AI: massa reintents");
}

async function processaBatch<T>(
  items: T[],
  tipus: string,
  getId: (item: T) => string,
  getText: (item: T) => string,
  getMetadata: (item: T) => object,
  voyageKey: string,
  supaUrl: string,
  supaKey: string
): Promise<{ indexats: number; errors: number; firstError?: string }> {
  let indexats = 0;
  let errors = 0;
  let firstError: string | undefined;
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const chunk = items.slice(i, i + BATCH_SIZE);
    try {
      const textos = chunk.map(getText);
      const embeddings = await generaEmbeddingsAmbReintents(textos, voyageKey);
      if (i > 0) await sleep(1000); // pausa entre batches per no saturar el rate limit
      await upsertBatch(
        chunk.map((item, j) => ({
          id: `${tipus}:${getId(item)}`,
          tipus,
          contingut: textos[j],
          metadata: getMetadata(item),
          embedding: embeddings[j],
        })),
        supaUrl,
        supaKey
      );
      indexats += chunk.length;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Error batch ${tipus} [${i}]:`, msg);
      if (!firstError) firstError = `[${tipus} batch ${i}] ${msg}`;
      errors += chunk.length;
    }
  }
  return { indexats, errors, firstError };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST")   { res.status(405).json({ error: "Mètode no permès" }); return; }

  const voyageKey = process.env.VOYAGE_API_KEY;
  const supaUrl   = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const supaKey   = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!voyageKey) { res.status(500).json({ error: "Falta VOYAGE_API_KEY a les variables d'entorn de Vercel" }); return; }
  if (!supaUrl)   { res.status(500).json({ error: "Falta SUPABASE_URL a les variables d'entorn de Vercel" }); return; }
  if (!supaKey)   { res.status(500).json({ error: "Falta SUPABASE_SERVICE_ROLE_KEY a les variables d'entorn de Vercel" }); return; }

  const tipusTarget = (req.body as { tipus?: string })?.tipus ?? "tot";
  const tipusValids = ["tot", "equip", "field", "gubim", "projecte", "tag", "rosmiman"];
  if (!tipusValids.includes(tipusTarget)) {
    res.status(400).json({ error: `tipus invàlid: ${tipusTarget}. Valors acceptats: ${tipusValids.join(", ")}` }); return;
  }

  // Stream NDJSON — una línia JSON per cada fase de progrés
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Transfer-Encoding", "chunked");
  res.status(200);

  const send = (obj: object) => res.write(JSON.stringify(obj) + "\n");

  const supaFetch = async (path: string) => {
    const r = await fetch(`${supaUrl}/rest/v1/${path}`, {
      headers: { apikey: supaKey!, Authorization: `Bearer ${supaKey}` },
    });
    if (!r.ok) throw new Error(`Supabase fetch error ${r.status}: ${path}`);
    return r.json();
  };

  const t0 = Date.now();
  let totalIndexats = 0;
  let totalErrors   = 0;

  try {
    // ── Equips ──
    if (tipusTarget === "tot" || tipusTarget === "equip") {
      send({ fase: "equip", estat: "carregant" });
      const rows: EquipRow[] = await supaFetch("equipments?select=id,equip_code,equip_name,gubim_code,field_cols,revit_category,table_name,table_code,parent_equip_code&order=equip_code.asc&limit=5000");
      send({ fase: "equip", estat: "indexant", total: rows.length });
      const r = await processaBatch(rows, "equip", e => e.id, textEquip, e => ({ equipCode: e.equip_code, equipName: e.equip_name, gubimCode: e.gubim_code }), voyageKey, supaUrl!, supaKey!);
      totalIndexats += r.indexats; totalErrors += r.errors;
      send({ fase: "equip", estat: "fet", indexats: r.indexats, errors: r.errors });
      if (r.firstError) send({ fase: "equip", warning: r.firstError });
    }

    // ── Fields ──
    if (tipusTarget === "tot" || tipusTarget === "field") {
      send({ fase: "field", estat: "carregant" });
      const rows: FieldRow[] = await supaFetch("fields?select=col,codi,tipus_dada,cbt,disciplina,agrupacio_revit,format_param,taula_assoc,grup_txt,instancia_revit&order=col.asc&limit=5000");
      send({ fase: "field", estat: "indexant", total: rows.length });
      const r = await processaBatch(rows, "field", f => f.col, textField, f => ({ col: f.col, codi: f.codi, tipus_dada: f.tipus_dada }), voyageKey, supaUrl!, supaKey!);
      totalIndexats += r.indexats; totalErrors += r.errors;
      send({ fase: "field", estat: "fet", indexats: r.indexats, errors: r.errors });
      if (r.firstError) send({ fase: "field", warning: r.firstError });
    }

    // ── GuBIMClass ──
    if (tipusTarget === "tot" || tipusTarget === "gubim") {
      send({ fase: "gubim", estat: "carregant" });
      const rows: GubimRow[] = await supaFetch("gubim_class?select=id,code,name&order=code.asc&limit=5000");
      send({ fase: "gubim", estat: "indexant", total: rows.length });
      const r = await processaBatch(rows, "gubim", g => g.id, textGubim, g => ({ code: g.code, name: g.name }), voyageKey, supaUrl!, supaKey!);
      totalIndexats += r.indexats; totalErrors += r.errors;
      send({ fase: "gubim", estat: "fet", indexats: r.indexats, errors: r.errors });
      if (r.firstError) send({ fase: "gubim", warning: r.firstError });
    }

    // ── Projectes + TAGs ──
    let projectes: ProjecteRow[] = [];
    if (tipusTarget === "tot" || tipusTarget === "projecte" || tipusTarget === "tag") {
      send({ fase: "projecte", estat: "carregant" });
      projectes = await supaFetch("projectes?select=id,codi_projecte,nom,descripcio,status,codi_installacio&order=codi_projecte.asc&limit=1000");
    }

    if (tipusTarget === "tot" || tipusTarget === "projecte") {
      send({ fase: "projecte", estat: "indexant", total: projectes.length });
      const r = await processaBatch(projectes, "projecte", p => p.id, textProjecte, p => ({ codiProjecte: p.codi_projecte, nom: p.nom, status: p.status, codiInstallacio: p.codi_installacio }), voyageKey, supaUrl!, supaKey!);
      totalIndexats += r.indexats; totalErrors += r.errors;
      send({ fase: "projecte", estat: "fet", indexats: r.indexats, errors: r.errors });
      if (r.firstError) send({ fase: "projecte", warning: r.firstError });
    }

    if (tipusTarget === "tot" || tipusTarget === "tag") {
      send({ fase: "tag", estat: "carregant" });
      const nomPerId = Object.fromEntries(projectes.map(p => [p.id, `${p.codi_projecte} ${p.nom}`]));
      const tags: TagRow[] = await supaFetch("projecte_tags?select=id,tag_complet,codi_installacio,ccm,funcio,duplicitat,status,descripcio_equip,comentari,equip_id,projecte_id&order=tag_complet.asc&limit=20000");
      send({ fase: "tag", estat: "indexant", total: tags.length });
      const r = await processaBatch(tags, "tag", t => t.id, t => textTag(t, nomPerId[t.projecte_id] ?? t.projecte_id), t => ({ tagComplet: t.tag_complet, codiInstallacio: t.codi_installacio, status: t.status, ccm: t.ccm, funcio: t.funcio }), voyageKey, supaUrl!, supaKey!);
      totalIndexats += r.indexats; totalErrors += r.errors;
      send({ fase: "tag", estat: "fet", indexats: r.indexats, errors: r.errors });
      if (r.firstError) send({ fase: "tag", warning: r.firstError });
    }

    // ── TAGs Rosmiman (llistat global) ──
    if (tipusTarget === "tot" || tipusTarget === "rosmiman") {
      send({ fase: "rosmiman", estat: "carregant" });
      const rows: RosmimanRow[] = await supaFetch("rosmiman_equips?select=id,tag,descripcio,codi_installacio&order=tag.asc&limit=50000");
      send({ fase: "rosmiman", estat: "indexant", total: rows.length });
      const r = await processaBatch(
        rows, "rosmiman",
        row => row.id,
        textRosmiman,
        row => ({ tag: row.tag, codiInstallacio: row.codi_installacio, descripcio: row.descripcio }),
        voyageKey, supaUrl!, supaKey!
      );
      totalIndexats += r.indexats; totalErrors += r.errors;
      send({ fase: "rosmiman", estat: "fet", indexats: r.indexats, errors: r.errors });
      if (r.firstError) send({ fase: "rosmiman", warning: r.firstError });
    }

    send({ fet: true, indexats: totalIndexats, errors: totalErrors, temps_ms: Date.now() - t0 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[index-embeddings] Error:", msg);
    send({ error: "Error intern del servidor", detall: msg });
  } finally {
    res.end();
  }
}
