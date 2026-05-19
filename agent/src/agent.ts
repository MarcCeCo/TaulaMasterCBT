// agent/src/agent.ts
// Agent APS (Autodesk Platform Services) → Supabase visor3d
// 3-legged OAuth + detecció de canvis (nous / modificats / eliminats)
// ─────────────────────────────────────────────────────────────────────────────

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";

// Node.js < 22 no té WebSocket natiu — el client de Supabase el necessita
(globalThis as any).WebSocket = WebSocket;

// ─── Tipus ────────────────────────────────────────────────────────────────────

interface InstallacioTrobada {
  codi: string;
  nom: string;
  embedUrl: string;
  urn: string;
  lastModifiedTime: string;
}

interface SistemaTrobat {
  nom: string;
  installacions: InstallacioTrobada[];
}

interface ResultatSync {
  sistemesCreats: string[];
  sistemesActualitzats: string[];
  sistemesEliminats: string[];
  installacionsCreades: string[];
  installacionsActualitzades: string[];
  installacionsEliminades: string[];
  installacionsSenseCanvis: string[];
  errors: string[];
}

interface TokenRow {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

// ─── Constants APS ────────────────────────────────────────────────────────────

const APS_BASE = "https://developer.api.autodesk.com";
const APS_AUTH_URL = `${APS_BASE}/authentication/v2/token`;

// ─── Helpers de parseig ───────────────────────────────────────────────────────

function parsejaNomCarpeta(nomCarpeta: string): string {
  return nomCarpeta.replace(/^\d+_/, "").replace(/-/g, " ").trim();
}

function parsejaNomFitxer(nomFitxer: string): { codi: string; nom: string } | null {
  const sensExtensio = nomFitxer.replace(/\.[^.]+$/, "");
  const idx = sensExtensio.indexOf("_");
  if (idx === -1) return null;
  const codi = sensExtensio.substring(0, idx);
  const nom = sensExtensio.substring(idx + 1).replace(/-/g, " ").trim();
  if (!/^[A-Z]+\d+$/.test(codi)) return null;
  return { codi, nom };
}

function construeixEmbedUrl(urn: string): string {
  // URL de fallback basada en URN (viewer genèric d'Autodesk).
  // Preferentment s'utilitza l'embed_url manual de autodesk360.com.
  return `https://viewer.autodesk.com/id/${urn}`;
}

// ─── Autenticació APS 3-legged OAuth ─────────────────────────────────────────

async function obteToken3Legged(
  supabase: SupabaseClient,
  clientId: string,
  clientSecret: string
): Promise<string> {
  console.log("🔑 Obtenint token APS 3-legged des de Supabase...");

  const { data: tokenRow, error } = await supabase
    .from("aps_tokens")
    .select("access_token, refresh_token, expires_at")
    .eq("id", 1)
    .single();

  if (error || !tokenRow) {
    throw new Error(
      "No s'ha trobat cap token APS a Supabase. Executa: npm run auth-setup"
    );
  }

  const row = tokenRow as TokenRow;
  const ara = Date.now();
  const margeMs = 5 * 60 * 1000;

  if (row.access_token && row.expires_at > ara + margeMs) {
    console.log(`✅ Token APS vàlid (expira en ${Math.round((row.expires_at - ara) / 60000)} min)`);
    return row.access_token;
  }

  console.log("🔄 Token APS expirat, renovant amb refresh token...");

  if (!row.refresh_token) {
    throw new Error("Refresh token no disponible. Executa: npm run auth-setup");
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: row.refresh_token,
    scope: "data:read",
  });

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const resp = await fetch(APS_AUTH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: body.toString(),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Error renovant token APS: ${resp.status} ${text}`);
  }

  const data = await resp.json() as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  const nouExpiresAt = Date.now() + data.expires_in * 1000;

  const { error: saveError } = await supabase
    .from("aps_tokens")
    .update({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: nouExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);

  if (saveError) {
    console.error("⚠️  Error guardant nou token a Supabase:", saveError.message);
  } else {
    console.log(`✅ Token APS renovat (expira en ${Math.round(data.expires_in / 60)} min)`);
  }

  return data.access_token;
}

// ─── APS Data Management API ──────────────────────────────────────────────────

// Obté el versionId del "tip" (versió actual) d'un item de tipus dm.lineage
async function obteTipVersionId(projectId: string, itemId: string, token: string): Promise<string | null> {
  try {
    const url = `${APS_BASE}/data/v1/projects/${projectId}/items/${encodeURIComponent(itemId)}/tip`;
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!resp.ok) {
      console.log(`  🔍 [DEBUG] Tip API status: ${resp.status}`);
      return null;
    }
    const data = await resp.json() as any;
    // El versionId és de tipus urn:adsk.wipprod:fs.version:...
    const versionId: string | null = data?.data?.id ?? null;
    console.log(`  🔍 [DEBUG] Tip versionId: ${versionId}`);
    return versionId;
  } catch (e) {
    console.error(`  ❌ [DEBUG] Error obteTipVersionId: ${e}`);
    return null;
  }
}

async function obteShareEmbedUrl(projectId: string, itemId: string, token: string): Promise<string | null> {
  // La Share API requereix el versionId del tip (dm.version), NO el lineage ID (dm.lineage).
  // Si passem el lineage ID directament, sempre retorna 404.
  try {
    const versionId = await obteTipVersionId(projectId, itemId, token);
    const resourceId = versionId ?? itemId; // fallback al lineage si no trobem el tip

    const url = `${APS_BASE}/sharing/v1/shares?resourceId=${encodeURIComponent(resourceId)}&resourceType=C360Item`;
    console.log(`  🔍 [DEBUG] Share API URL: ${url}`);
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    console.log(`  🔍 [DEBUG] Share API status: ${resp.status}`);
    const rawText = await resp.text();
    console.log(`  🔍 [DEBUG] Share API response: ${rawText.substring(0, 500)}`);
    if (!resp.ok) return null;
    const data = JSON.parse(rawText) as any;
    console.log(`  🔍 [DEBUG] Share results count: ${data.results?.length ?? 0}`);
    const share = data.results?.find((s: any) => s.shareType === "public" && s.url);
    if (!share) {
      console.warn(`  ⚠️  [DEBUG] Tots els shares: ${JSON.stringify(data.results?.map((s: any) => ({ type: s.shareType, url: s.url })))}`);
      return null;
    }
    // La Share API retorna /shares/public/HASH però l'embed necessita /g/shares/HASH
    const finalUrl = new URL(share.url);
    finalUrl.pathname = finalUrl.pathname.replace("/shares/public/", "/g/shares/");
    finalUrl.searchParams.set("mode", "embed");
    return finalUrl.toString();
  } catch (e) {
    console.error(`  ❌ [DEBUG] Error obteShareEmbedUrl: ${e}`);
    return null;
  }
}

async function llistaContingutCarpeta(projectId: string, carpetaId: string, token: string): Promise<any[]> {
  const resp = await fetch(
    `${APS_BASE}/data/v1/projects/${projectId}/folders/${carpetaId}/contents`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!resp.ok) throw new Error(`Error llistant carpeta ${carpetaId}: ${resp.status}`);
  const data = await resp.json() as { data: any[] };
  return data.data;
}

async function obteArrelCarpetes(hubId: string, projectId: string, token: string): Promise<any[]> {
  const resp = await fetch(
    `${APS_BASE}/project/v1/hubs/${hubId}/projects/${projectId}/topFolders`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!resp.ok) throw new Error(`Error obtenint carpetes arrel: ${resp.status}`);
  const data = await resp.json() as { data: any[] };
  return data.data;
}

async function trobaSubcarpeta(
  projectId: string, carpetaParentId: string, nomObjectiu: string, token: string
): Promise<any | null> {
  const contingut = await llistaContingutCarpeta(projectId, carpetaParentId, token);
  return contingut.find(
    (item) => item.type === "folders" && item.attributes?.displayName === nomObjectiu
  ) ?? null;
}

// ─── Extreu sistemes via APS ──────────────────────────────────────────────────

async function extrauSistemes(
  hubId: string, projectId: string, token: string
): Promise<SistemaTrobat[]> {
  console.log("📂 Navegant a WEB → 000_MODELS via APS...");

  const carpetesArrel = await obteArrelCarpetes(hubId, projectId, token);
  console.log(`  Carpetes arrel: ${carpetesArrel.map((c: any) => c.attributes?.displayName).join(", ")}`);

  const carpetaWEB = carpetesArrel.find(
    (c: any) => c.type === "folders" && c.attributes?.displayName === "WEB"
  );

  let carpeta000Models: any = null;

  if (carpetaWEB) {
    console.log(`  ✅ Carpeta WEB trobada: ${carpetaWEB.id}`);
    carpeta000Models = await trobaSubcarpeta(projectId, carpetaWEB.id, "000_MODELS", token);
  } else {
    console.warn("⚠️  Carpeta WEB no trobada, buscant 000_MODELS a l'arrel...");
    for (const c of carpetesArrel) {
      carpeta000Models = await trobaSubcarpeta(projectId, c.id, "000_MODELS", token);
      if (carpeta000Models) break;
    }
  }

  if (!carpeta000Models) throw new Error("No s'ha trobat la carpeta '000_MODELS'");
  console.log(`  ✅ Carpeta 000_MODELS trobada: ${carpeta000Models.id}`);

  const contingut000Models = await llistaContingutCarpeta(projectId, carpeta000Models.id, token);
  const carpetesSistemes = contingut000Models.filter(
    (item) => item.type === "folders" && /^\d+_/.test(item.attributes?.displayName ?? "")
  );

  console.log(`📁 Trobades ${carpetesSistemes.length} carpetes de sistema`);

  const sistemes: SistemaTrobat[] = [];

  for (const carpeta of carpetesSistemes) {
    const nomCarpeta: string = carpeta.attributes?.displayName ?? "";
    const nomSistema = parsejaNomCarpeta(nomCarpeta);
    console.log(`\n📂 Processant sistema: ${nomCarpeta} → "${nomSistema}"`);

    const contingut = await llistaContingutCarpeta(projectId, carpeta.id, token);
    const fitxersRvt = contingut.filter(
      (item) => item.type === "items" && item.attributes?.displayName?.endsWith(".rvt")
    );

    console.log(`  📄 Fitxers .rvt: ${fitxersRvt.map((f: any) => f.attributes?.displayName).join(", ") || "(cap)"}`);

    const installacions: InstallacioTrobada[] = [];

    for (const fitxer of fitxersRvt) {
      const nomFitxer: string = fitxer.attributes?.displayName ?? "";
      const parsed = parsejaNomFitxer(nomFitxer);
      if (!parsed) {
        console.warn(`  ⚠️  No s'ha pogut parsejar: ${nomFitxer}`);
        continue;
      }

      const itemId: string = fitxer.id ?? "";
      const urn = Buffer.from(itemId).toString("base64url");

      // Intentem obtenir l'URL de shared embed directament de l'API APS
      // (la mateixa que genera "Opcions d'incrustació" a Fusion 360)
      const shareEmbedUrl = await obteShareEmbedUrl(projectId, itemId, token);
      const embedUrl = shareEmbedUrl ?? construeixEmbedUrl(urn);
      if (shareEmbedUrl) {
        console.log(`  🔗 Share embed URL obtinguda per ${parsed.codi}`);
      } else {
        console.warn(`  ⚠️  No s'ha trobat share públic per ${parsed.codi}, usant URL de fallback`);
      }

      // lastModifiedTime = data de l'última versió pujada a Fusion
      const lastModifiedTime: string =
        fitxer.attributes?.lastModifiedTime ??
        fitxer.attributes?.createTime ??
        new Date().toISOString();

      installacions.push({ ...parsed, embedUrl, urn, lastModifiedTime });
      console.log(`  ✅ ${parsed.codi} - ${parsed.nom} (modificat: ${lastModifiedTime})`);
    }

    sistemes.push({ nom: nomSistema, installacions });
  }

  return sistemes;
}

// ─── Sincronitza amb Supabase (amb detecció de canvis) ───────────────────────

async function sincronitzaSupabase(
  supabase: SupabaseClient,
  sistemesFusion: SistemaTrobat[]
): Promise<ResultatSync> {
  const resultat: ResultatSync = {
    sistemesCreats: [],
    sistemesActualitzats: [],
    sistemesEliminats: [],
    installacionsCreades: [],
    installacionsActualitzades: [],
    installacionsEliminades: [],
    installacionsSenseCanvis: [],
    errors: [],
  };

  // ── 1. Carrega l'estat actual de Supabase ──────────────────────────────────

  const { data: sistemesSupabase, error: errSis } = await supabase
    .from("visor3d_sistemes")
    .select("id, nom, ordre");
  if (errSis) throw new Error(`Error llegint sistemes de Supabase: ${errSis.message}`);

  const { data: installacionsSupabase, error: errInst } = await supabase
    .from("visor3d_installacions")
    .select("id, sistema_id, codi_installacio, nom, updated_at, embed_url");
  if (errInst) throw new Error(`Error llegint instal·lacions de Supabase: ${errInst.message}`);

  // Maps per accés ràpid
  const sistemaPerNom = new Map<string, { id: string; ordre: number }>();
  for (const s of (sistemesSupabase ?? [])) {
    sistemaPerNom.set(s.nom.toUpperCase(), { id: s.id, ordre: s.ordre });
  }

  const instPerCodi = new Map<string, { id: string; updated_at: string; sistema_id: string; embed_url?: string }>();
  for (const i of (installacionsSupabase ?? [])) {
    if (i.codi_installacio) instPerCodi.set(i.codi_installacio, i);
  }

  // ── 2. Conjunts per detectar eliminats ────────────────────────────────────

  const codisFusion = new Set<string>();
  const nomsSistemesFusion = new Set<string>();

  for (const s of sistemesFusion) {
    nomsSistemesFusion.add(s.nom.toUpperCase());
    for (const i of s.installacions) codisFusion.add(i.codi);
  }

  // ── 3. Processa cada sistema de Fusion ────────────────────────────────────

  for (const [index, sistema] of sistemesFusion.entries()) {
    try {
      console.log(`\n💾 Sincronitzant sistema: ${sistema.nom}`);

      const clauNom = sistema.nom.toUpperCase();
      let sistemaId: string;

      if (sistemaPerNom.has(clauNom)) {
        sistemaId = sistemaPerNom.get(clauNom)!.id;
        resultat.sistemesActualitzats.push(sistema.nom);
        console.log(`  ♻️  Sistema existent: ${sistema.nom}`);
      } else {
        const maxOrdre = Math.max(0, ...(sistemesSupabase ?? []).map((s: any) => s.ordre ?? 0));
        const { data: nouSistema, error } = await supabase
          .from("visor3d_sistemes")
          .insert({ nom: sistema.nom, color: colorPerOrdre(index), ordre: maxOrdre + 1 })
          .select()
          .single();
        if (error) throw error;
        sistemaId = nouSistema.id;
        resultat.sistemesCreats.push(sistema.nom);
        console.log(`  ✅ Sistema creat: ${sistema.nom}`);
      }

      // ── 4. Processa cada instal·lació ────────────────────────────────────

      for (const [instIndex, inst] of sistema.installacions.entries()) {
        try {
          const existent = instPerCodi.get(inst.codi);

          if (!existent) {
            // NOU
            await supabase.from("visor3d_installacions").insert({
              sistema_id: sistemaId,
              nom: inst.nom,
              codi_installacio: inst.codi,
              embed_url: inst.embedUrl,
              urn: inst.urn,
              ordre: instIndex,
              updated_at: inst.lastModifiedTime,
            });
            resultat.installacionsCreades.push(`${inst.codi} - ${inst.nom}`);
            console.log(`  ➕ Nova: ${inst.codi} - ${inst.nom}`);

          } else {
            const dataFusion = new Date(inst.lastModifiedTime).getTime();
            const dataSupabase = new Date(existent.updated_at).getTime();

            if (dataFusion > dataSupabase) {
              // MODIFICAT
              // Prioritat d'embed_url:
              // 1. URL obtinguda via share API (autodesk360.com) → sempre la millor
              // 2. URL manual existent a la BD (introduïda per l'usuari)
              // 3. URL de fallback generada per l'agent (viewer.autodesk.com)
              const esShareUrl = inst.embedUrl.includes("autodesk360.com");
              const embedUrlFinal = esShareUrl
                ? inst.embedUrl
                : (existent.embed_url?.trim() || inst.embedUrl);
              await supabase.from("visor3d_installacions")
                .update({
                  nom: inst.nom,
                  embed_url: embedUrlFinal,
                  urn: inst.urn,
                  updated_at: inst.lastModifiedTime,
                })
                .eq("id", existent.id);
              resultat.installacionsActualitzades.push(`${inst.codi} - ${inst.nom}`);
              console.log(`  ✏️  Modificat: ${inst.codi} - ${inst.nom}`);
            } else {
              // SENSE CANVIS
              resultat.installacionsSenseCanvis.push(inst.codi);
              console.log(`  ─  Sense canvis: ${inst.codi}`);
            }
          }
        } catch (err) {
          const msg = `Error amb instal·lació ${inst.codi}: ${err}`;
          resultat.errors.push(msg);
          console.error(`  ❌ ${msg}`);
        }
      }
    } catch (err) {
      const msg = `Error amb sistema ${sistema.nom}: ${err}`;
      resultat.errors.push(msg);
      console.error(`❌ ${msg}`);
    }
  }

  // ── 5. Elimina instal·lacions que ja no existeixen a Fusion ──────────────

  console.log("\n🗑️  Comprovant eliminacions d'instal·lacions...");
  for (const [codi, inst] of instPerCodi.entries()) {
    if (!codisFusion.has(codi)) {
      try {
        await supabase.from("visor3d_installacions").delete().eq("id", inst.id);
        resultat.installacionsEliminades.push(codi);
        console.log(`  🗑️  Eliminada: ${codi}`);
      } catch (err) {
        const msg = `Error eliminant instal·lació ${codi}: ${err}`;
        resultat.errors.push(msg);
        console.error(`  ❌ ${msg}`);
      }
    }
  }

  // ── 6. Elimina sistemes que ja no existeixen a Fusion (si han quedat buits)

  console.log("🗑️  Comprovant eliminacions de sistemes...");
  for (const s of (sistemesSupabase ?? [])) {
    if (!nomsSistemesFusion.has(s.nom.toUpperCase())) {
      try {
        const { count } = await supabase
          .from("visor3d_installacions")
          .select("id", { count: "exact", head: true })
          .eq("sistema_id", s.id);

        if ((count ?? 0) === 0) {
          await supabase.from("visor3d_sistemes").delete().eq("id", s.id);
          resultat.sistemesEliminats.push(s.nom);
          console.log(`  🗑️  Eliminat sistema buit: ${s.nom}`);
        } else {
          console.log(`  ⚠️  Sistema "${s.nom}" no és a Fusion però té instal·lacions — no s'elimina`);
        }
      } catch (err) {
        const msg = `Error eliminant sistema ${s.nom}: ${err}`;
        resultat.errors.push(msg);
        console.error(`  ❌ ${msg}`);
      }
    }
  }

  return resultat;
}

// ─── Colors ───────────────────────────────────────────────────────────────────

const COLORS = [
  "#0099A8", "#6366F1", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6",
  "#EC4899", "#F97316", "#06B6D4", "#84CC16", "#64748B", "#0EA5E9",
];
function colorPerOrdre(index: number): string { return COLORS[index % COLORS.length]; }

// ─── Funció principal ─────────────────────────────────────────────────────────

export async function executaAgent(): Promise<ResultatSync> {
  console.log("🤖 Agent Visor3D (APS 3-legged + detecció canvis) iniciant...");
  console.log(`🕐 ${new Date().toISOString()}`);

  const supabaseUrl     = process.env.SUPABASE_URL;
  const supabaseKey     = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const apsClientId     = process.env.APS_CLIENT_ID;
  const apsClientSecret = process.env.APS_CLIENT_SECRET;
  const apsHubId        = process.env.APS_HUB_ID;
  const apsProjectId    = process.env.APS_PROJECT_ID;

  if (!supabaseUrl || !supabaseKey) throw new Error("Falten SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  if (!apsClientId || !apsClientSecret) throw new Error("Falten APS_CLIENT_ID o APS_CLIENT_SECRET");
  if (!apsHubId || !apsProjectId) throw new Error("Falten APS_HUB_ID o APS_PROJECT_ID");

  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: {} },
    realtime: { transport: WebSocket as any },
  });

  const token = await obteToken3Legged(supabase, apsClientId, apsClientSecret);
  const sistemesTrobats = await extrauSistemes(apsHubId, apsProjectId, token);

  console.log(`\n📊 Resum extracció de Fusion:`);
  console.log(`  Sistemes: ${sistemesTrobats.length}`);
  sistemesTrobats.forEach((s) =>
    console.log(`  - ${s.nom}: ${s.installacions.length} instal·lació${s.installacions.length !== 1 ? "ns" : ""}`)
  );

  const resultat = await sincronitzaSupabase(supabase, sistemesTrobats);

  console.log("\n✅ Sincronització completada:");
  console.log(`  ➕ Sistemes creats:             ${resultat.sistemesCreats.length}`);
  console.log(`  ♻️  Sistemes actualitzats:        ${resultat.sistemesActualitzats.length}`);
  console.log(`  🗑️  Sistemes eliminats:           ${resultat.sistemesEliminats.length}`);
  console.log(`  ➕ Instal·lacions creades:       ${resultat.installacionsCreades.length}`);
  console.log(`  ✏️  Instal·lacions actualitzades: ${resultat.installacionsActualitzades.length}`);
  console.log(`  🗑️  Instal·lacions eliminades:    ${resultat.installacionsEliminades.length}`);
  console.log(`  ─  Sense canvis:                ${resultat.installacionsSenseCanvis.length}`);
  if (resultat.errors.length > 0) {
    console.log(`  ⚠️  Errors: ${resultat.errors.length}`);
    resultat.errors.forEach((e) => console.error(`    - ${e}`));
  }

  await supabase.from("visor3d_sync_log").insert({
    executat_a: new Date().toISOString(),
    sistemes_creats: resultat.sistemesCreats.length,
    sistemes_actualitzats: resultat.sistemesActualitzats.length,
    sistemes_eliminats: resultat.sistemesEliminats.length,
    installacions_creades: resultat.installacionsCreades.length,
    installacions_actualitzades: resultat.installacionsActualitzades.length,
    installacions_eliminades: resultat.installacionsEliminades.length,
    installacions_sense_canvis: resultat.installacionsSenseCanvis.length,
    errors: resultat.errors,
    detalls: resultat,
  });

  return resultat;
}
