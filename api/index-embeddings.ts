// api/index-embeddings.ts
// Vercel Serverless Function (Node.js) — indexació INCREMENTAL de la plataforma
// a Supabase pgvector usant Voyage AI per generar els embeddings.
//
// Lògica incremental:
//   1. Carrega els IDs ja indexats a cbt_embeddings per al tipus donat
//   2. Carrega els registres actuals de la taula font
//   3. Elimina de cbt_embeddings els IDs que ja no existeixen
//   4. Indexa NOMÉS els registres nous o modificats (updated_at > indexed_at)
//
// Runtime: Node.js via @vercel/node (maxDuration configurat a vercel.json)
// Endpoint: POST /api/index-embeddings
// Body:     { tipus?: 'equip'|'field'|'gubim'|'projecte'|'tag'|'rosmiman'|'tot' }
// Retorna:  stream NDJSON amb línies de progrés + línia final { fet: true, ... }
// ─────────────────────────────────────────────────────────────────────────────

import type { VercelRequest, VercelResponse } from "@vercel/node";

// ─── Tipus ────────────────────────────────────────────────────────────────────

interface EquipRow    { id: string; equip_code: string; equip_name: string; gubim_code: string; field_cols: string[]; revit_category: string; table_name: string; table_code: string; parent_equip_code: string; updated_at: string; }
interface FieldRow    { col: string; codi: string|null; tipus_dada: string|null; cbt: string|null; disciplina: string|null; agrupacio_revit: string|null; format_param: string|null; taula_assoc: string|null; grup_txt: string|null; instancia_revit: string|null; updated_at: string; }
interface GubimRow    { id: string; code: string; name: string; updated_at: string; }
interface TagRow      { id: string; tag_complet: string; codi_installacio: string; ccm: string; funcio: string; duplicitat: string; status: string; descripcio_equip: string; comentari: string; equip_id: string; projecte_id: string; updated_at: string; }
interface RosmimanRow { id: string; tag: string; descripcio: string; codi_installacio: string; updated_at: string; }
interface ProjecteRow { id: string; codi_projecte: string; nom: string; descripcio: string; status: string; codi_installacio: string; updated_at: string; }

interface EmbeddingRow { id: string; indexed_at: string; }

// ─── Helpers text ─────────────────────────────────────────────────────────────

function textEquip(r: EquipRow): string {
  return [
    r.equip_code        ? `Codi: ${r.equip_code}`             : "",
    `Nom: ${r.equip_name}`,
    `GuBIMClass: ${r.gubim_code}`,
    r.revit_category    ? `Categoria Revit: ${r.revit_category}` : "",
    r.table_name        ? `Taula: ${r.table_name}`            : "",
    r.table_code        ? `Codi taula: ${r.table_code}`       : "",
    r.parent_equip_code ? `Equip pare: ${r.parent_equip_code}`: "",
    r.field_cols?.length? `Camps: ${r.field_cols.join(", ")}` : "",
  ].filter(Boolean).join(" | ");
}

function textField(r: FieldRow): string {
  return [
    `Camp: ${r.col}`,
    r.codi            ? `Codi: ${r.codi}`                       : "",
    r.tipus_dada      ? `Tipus: ${r.tipus_dada}`                : "",
    r.cbt             ? `CBT: ${r.cbt}`                         : "",
    r.disciplina      ? `Disciplina: ${r.disciplina}`           : "",
    r.agrupacio_revit ? `Agrupació Revit: ${r.agrupacio_revit}` : "",
    r.format_param    ? `Format: ${r.format_param}`             : "",
    r.taula_assoc     ? `Taula associada: ${r.taula_assoc}`     : "",
    r.grup_txt        ? `Grup: ${r.grup_txt}`                   : "",
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
    r.ccm             ? `CCM: ${r.ccm}`               : "",
    r.funcio          ? `Funció: ${r.funcio}`          : "",
    r.duplicitat      ? `Duplicitat: ${r.duplicitat}`  : "",
    r.descripcio_equip? `Equip: ${r.descripcio_equip}` : "",
    r.comentari       ? `Comentari: ${r.comentari}`    : "",
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

// ─── Supabase helpers ─────────────────────────────────────────────────────────

async function upsertBatch(
  registres: { id: string; tipus: string; contingut: string; metadata: object; embedding: number[]; indexed_at: string }[],
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

async function eliminaObsoletes(
  ids: string[],
  supaUrl: string,
  supaKey: string
): Promise<void> {
  if (ids.length === 0) return;
  // Elimina en blocs de 500 per evitar URLs massa llargues
  for (let i = 0; i < ids.length; i += 500) {
    const bloc = ids.slice(i, i + 500);
    const inClause = `(${bloc.map(id => `"${id}"`).join(",")})`;
    const res = await fetch(`${supaUrl}/rest/v1/cbt_embeddings?id=in.${encodeURIComponent(inClause)}`, {
      method: "DELETE",
      headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}` },
    });
    if (!res.ok) throw new Error(`Supabase delete error ${res.status}: ${await res.text()}`);
  }
}

// ─── Reintents Voyage AI (429) ────────────────────────────────────────────────

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

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
      if (msg.includes("429") && i < intents - 1) {
        const espera = 20000 * (i + 1);
        await sleep(espera);
      } else throw err;
    }
  }
  throw new Error("Voyage AI: massa reintents");
}

// ─── Processament incremental ─────────────────────────────────────────────────

const BATCH_SIZE = 32;

async function processaIncremental<T extends { updated_at: string }>(
  items: T[],
  tipus: string,
  getId:       (item: T) => string,
  getText:     (item: T) => string,
  getMetadata: (item: T) => object,
  existents:   Map<string, string>, // embeddingId → indexed_at
  voyageKey: string,
  supaUrl: string,
  supaKey: string
): Promise<{ indexats: number; eliminats: number; omesos: number; errors: number; firstError?: string }> {

  const ara = new Date().toISOString();

  // IDs actuals de la font
  const idsActuals = new Set(items.map(item => `${tipus}:${getId(item)}`));

  // Eliminar obsolets (existeixen a cbt_embeddings però ja no a la font)
  const idsObsoletes = [...existents.keys()].filter(id => !idsActuals.has(id));
  await eliminaObsoletes(idsObsoletes, supaUrl, supaKey);

  // Filtrar els que cal indexar: nous o modificats (updated_at > indexed_at)
  const aIndexar = items.filter(item => {
    const embId = `${tipus}:${getId(item)}`;
    const indexedAt = existents.get(embId);
    if (!indexedAt) return true; // nou
    return new Date(item.updated_at) > new Date(indexedAt); // modificat
  });

  let indexats = 0;
  let errors = 0;
  let firstError: string | undefined;

  for (let i = 0; i < aIndexar.length; i += BATCH_SIZE) {
    const chunk = aIndexar.slice(i, i + BATCH_SIZE);
    try {
      const textos = chunk.map(getText);
      const embeddings = await generaEmbeddingsAmbReintents(textos, voyageKey);
      await upsertBatch(
        chunk.map((item, j) => ({
          id:         `${tipus}:${getId(item)}`,
          tipus,
          contingut:  textos[j],
          metadata:   getMetadata(item),
          embedding:  embeddings[j],
          indexed_at: ara,
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

  return {
    indexats,
    eliminats: idsObsoletes.length,
    omesos:    items.length - aIndexar.length,
    errors,
    firstError,
  };
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

  if (!voyageKey) { res.status(500).json({ error: "Falta VOYAGE_API_KEY" }); return; }
  if (!supaUrl)   { res.status(500).json({ error: "Falta SUPABASE_URL" }); return; }
  if (!supaKey)   { res.status(500).json({ error: "Falta SUPABASE_SERVICE_ROLE_KEY" }); return; }

  const tipusTarget = (req.body as { tipus?: string })?.tipus ?? "tot";
  const tipusValids = ["tot", "equip", "field", "gubim", "projecte", "tag", "rosmiman"];
  if (!tipusValids.includes(tipusTarget)) {
    res.status(400).json({ error: `tipus invàlid: ${tipusTarget}` }); return;
  }

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

  // Carrega tots els embeddings existents del tipus (o tots si és "tot")
  // → Map<embeddingId, indexed_at>
  const carregaExistents = async (tipus: string): Promise<Map<string, string>> => {
    const filtre = tipus === "tot" ? "" : `&tipus=eq.${tipus}`;
    const rows: EmbeddingRow[] = await supaFetch(
      `cbt_embeddings?select=id,indexed_at${filtre}&limit=100000`
    );
    return new Map(rows.map(r => [r.id, r.indexed_at]));
  };

  const t0 = Date.now();
  let totalIndexats = 0;
  let totalEliminats = 0;
  let totalOmesos = 0;
  let totalErrors = 0;

  const logFase = (fase: string, r: { indexats: number; eliminats: number; omesos: number; errors: number; firstError?: string }) => {
    totalIndexats  += r.indexats;
    totalEliminats += r.eliminats;
    totalOmesos    += r.omesos;
    totalErrors    += r.errors;
    send({ fase, estat: "fet", indexats: r.indexats, eliminats: r.eliminats, omesos: r.omesos, errors: r.errors });
    if (r.firstError) send({ fase, warning: r.firstError });
  };

  try {
    // ── Equips ──
    if (tipusTarget === "tot" || tipusTarget === "equip") {
      send({ fase: "equip", estat: "carregant" });
      const [rows, existents] = await Promise.all([
        supaFetch("equipments?select=id,equip_code,equip_name,gubim_code,field_cols,revit_category,table_name,table_code,parent_equip_code,updated_at&order=equip_code.asc&limit=5000") as Promise<EquipRow[]>,
        carregaExistents("equip"),
      ]);
      send({ fase: "equip", estat: "indexant", total: rows.length, nous: rows.length - existents.size });
      logFase("equip", await processaIncremental(rows, "equip", e => e.id, textEquip, e => ({ equipCode: e.equip_code, equipName: e.equip_name, gubimCode: e.gubim_code }), existents, voyageKey, supaUrl!, supaKey!));
    }

    // ── Fields ──
    if (tipusTarget === "tot" || tipusTarget === "field") {
      send({ fase: "field", estat: "carregant" });
      const [rows, existents] = await Promise.all([
        supaFetch("fields?select=col,codi,tipus_dada,cbt,disciplina,agrupacio_revit,format_param,taula_assoc,grup_txt,instancia_revit,updated_at&order=col.asc&limit=5000") as Promise<FieldRow[]>,
        carregaExistents("field"),
      ]);
      send({ fase: "field", estat: "indexant", total: rows.length, nous: rows.length - existents.size });
      logFase("field", await processaIncremental(rows, "field", f => f.col, textField, f => ({ col: f.col, codi: f.codi, tipus_dada: f.tipus_dada }), existents, voyageKey, supaUrl!, supaKey!));
    }

    // ── GuBIMClass ──
    if (tipusTarget === "tot" || tipusTarget === "gubim") {
      send({ fase: "gubim", estat: "carregant" });
      const [rows, existents] = await Promise.all([
        supaFetch("gubim_class?select=id,code,name,updated_at&order=code.asc&limit=5000") as Promise<GubimRow[]>,
        carregaExistents("gubim"),
      ]);
      send({ fase: "gubim", estat: "indexant", total: rows.length, nous: rows.length - existents.size });
      logFase("gubim", await processaIncremental(rows, "gubim", g => g.id, textGubim, g => ({ code: g.code, name: g.name }), existents, voyageKey, supaUrl!, supaKey!));
    }

    // ── Projectes ──
    let projectes: ProjecteRow[] = [];
    if (tipusTarget === "tot" || tipusTarget === "projecte" || tipusTarget === "tag") {
      projectes = await supaFetch("projectes?select=id,codi_projecte,nom,descripcio,status,codi_installacio,updated_at&order=codi_projecte.asc&limit=1000");
    }

    if (tipusTarget === "tot" || tipusTarget === "projecte") {
      send({ fase: "projecte", estat: "carregant" });
      const existents = await carregaExistents("projecte");
      send({ fase: "projecte", estat: "indexant", total: projectes.length, nous: projectes.length - existents.size });
      logFase("projecte", await processaIncremental(projectes, "projecte", p => p.id, textProjecte, p => ({ codiProjecte: p.codi_projecte, nom: p.nom, status: p.status, codiInstallacio: p.codi_installacio }), existents, voyageKey, supaUrl!, supaKey!));
    }

    // ── TAGs projecte ──
    if (tipusTarget === "tot" || tipusTarget === "tag") {
      send({ fase: "tag", estat: "carregant" });
      const nomPerId = Object.fromEntries(projectes.map(p => [p.id, `${p.codi_projecte} ${p.nom}`]));
      const [tags, existents] = await Promise.all([
        supaFetch("projecte_tags?select=id,tag_complet,codi_installacio,ccm,funcio,duplicitat,status,descripcio_equip,comentari,equip_id,projecte_id,updated_at&order=tag_complet.asc&limit=20000") as Promise<TagRow[]>,
        carregaExistents("tag"),
      ]);
      send({ fase: "tag", estat: "indexant", total: tags.length, nous: tags.length - existents.size });
      logFase("tag", await processaIncremental(tags, "tag", t => t.id, t => textTag(t, nomPerId[t.projecte_id] ?? t.projecte_id), t => ({ tagComplet: t.tag_complet, codiInstallacio: t.codi_installacio, status: t.status }), existents, voyageKey, supaUrl!, supaKey!));
    }

    // ── TAGs Rosmiman ──
    if (tipusTarget === "tot" || tipusTarget === "rosmiman") {
      send({ fase: "rosmiman", estat: "carregant" });
      const [rows, existents] = await Promise.all([
        supaFetch("rosmiman_equips?select=id,tag,descripcio,codi_installacio,updated_at&order=tag.asc&limit=50000") as Promise<RosmimanRow[]>,
        carregaExistents("rosmiman"),
      ]);
      send({ fase: "rosmiman", estat: "indexant", total: rows.length, nous: rows.length - existents.size });
      logFase("rosmiman", await processaIncremental(rows, "rosmiman", r => r.id, textRosmiman, r => ({ tag: r.tag, codiInstallacio: r.codi_installacio, descripcio: r.descripcio }), existents, voyageKey, supaUrl!, supaKey!));
    }

    send({ fet: true, indexats: totalIndexats, eliminats: totalEliminats, omesos: totalOmesos, errors: totalErrors, temps_ms: Date.now() - t0 });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[index-embeddings] Error:", msg);
    send({ error: "Error intern del servidor", detall: msg });
  } finally {
    res.end();
  }
}
