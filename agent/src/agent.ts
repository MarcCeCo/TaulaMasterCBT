// agent/src/agent.ts
// Agent APS (Autodesk Platform Services) → Supabase visor3d
// Autenticació 2-legged OAuth (client_credentials) — sense tokens a Supabase
//
// Estructura esperada a Autodesk Forma:
//   besso-digital/
//     xxx_nomSistema/           ← carpeta de sistema (ex: 001_ESTACIONS-DEPURADORES)
//       xxxxx_nomInstallacio/   ← carpeta d'instal·lació (ex: ED005_LA-LLAGOSTA)
//         001_model-bim/        ← carpeta fixa que conté els RVTs
//           fitxer.rvt
// ─────────────────────────────────────────────────────────────────────────────

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";

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
  duplicats?: string[];
}

interface ResultatSync {
  sistemesCreats: string[];
  sistemesActualitzats: string[];
  sistemesEliminats: string[];
  installacionsCreades: string[];
  installacionsActualitzades: string[];
  installacionsEliminades: string[];
  installacionsSenseCanvis: string[];
  codisDuplicats: string[];
  errors: string[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const APS_BASE           = "https://developer.api.autodesk.com";
const APS_AUTH_URL       = `${APS_BASE}/authentication/v2/token`;
const CARPETA_ARREL_FORMA = "besso-digital";
const CARPETA_MODEL_BIM   = "001_model-bim";

// ─── Autenticació 2-legged OAuth ─────────────────────────────────────────────
// El token dura 1 hora. Es demana de nou a cada execució de l'agent.
// No cal guardar res a Supabase ni fer cap setup previ.

export async function obteToken2Legged(clientId: string, clientSecret: string): Promise<string> {
  console.log("🔑 Obtenint token APS 2-legged (client_credentials)...");

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const resp = await fetch(APS_AUTH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "data:read viewables:read",
    }).toString(),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Error obtenint token 2-legged: ${resp.status} ${text}`);
  }

  const data = await resp.json() as { access_token: string; expires_in: number };
  console.log(`✅ Token 2-legged obtingut (expira en ${Math.round(data.expires_in / 60)} min)`);
  return data.access_token;
}

// ─── Helpers de parseig ───────────────────────────────────────────────────────

function parsejaNomCarpetaSistema(nomCarpeta: string): string {
  return nomCarpeta.replace(/^\d+_/, "").replace(/-/g, " ").trim();
}

function parsejaNomCarpetaInstallacio(nomCarpeta: string): { codi: string; nom: string } | null {
  const idx = nomCarpeta.indexOf("_");
  if (idx === -1) return null;
  const codi = nomCarpeta.substring(0, idx).toUpperCase();
  const nom  = nomCarpeta.substring(idx + 1).replace(/-/g, " ").trim().toUpperCase();
  if (!/^[A-Z]+\d+$/.test(codi)) return null;
  return { codi, nom };
}

function construeixEmbedUrlFallback(urn: string): string {
  return `https://viewer.autodesk.com/id/${urn}`;
}

// ─── APS Data Management API ──────────────────────────────────────────────────

async function obteTipVersionId(projectId: string, itemId: string, token: string): Promise<string | null> {
  try {
    const resp = await fetch(
      `${APS_BASE}/data/v1/projects/${projectId}/items/${encodeURIComponent(itemId)}/tip`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!resp.ok) return null;
    const data = await resp.json() as any;
    return data?.data?.id ?? null;
  } catch {
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

async function extrauSistemes(hubId: string, projectId: string, token: string): Promise<SistemaTrobat[]> {
  console.log(`📂 Navegant Forma: "${CARPETA_ARREL_FORMA}" → sistemes → instal·lacions → "${CARPETA_MODEL_BIM}"...`);

  const carpetesArrel = await obteArrelCarpetes(hubId, projectId, token);
  console.log(`   Carpetes arrel: ${carpetesArrel.map((c: any) => c.attributes?.displayName).join(", ")}`);

  let carpetaBessoDig: any = null;
  for (const arrel of carpetesArrel) {
    carpetaBessoDig = await trobaSubcarpeta(projectId, arrel.id, CARPETA_ARREL_FORMA, token);
    if (carpetaBessoDig) {
      console.log(`   ✅ "${CARPETA_ARREL_FORMA}" trobat dins "${arrel.attributes?.displayName}"`);
      break;
    }
  }

  if (!carpetaBessoDig) {
    throw new Error(
      `No s'ha trobat la carpeta "${CARPETA_ARREL_FORMA}" al projecte Forma. ` +
      `Comprova APS_HUB_ID i APS_PROJECT_ID, i que l'app té accés al projecte.`
    );
  }

  const contingutBessoDig = await llistaContingutCarpeta(projectId, carpetaBessoDig.id, token);
  const carpetesSistemes  = contingutBessoDig.filter(
    (item) => item.type === "folders" && /^\d+_/.test(item.attributes?.displayName ?? "")
  );

  console.log(`📁 ${carpetesSistemes.length} carpetes de sistema trobades`);
  const sistemes: SistemaTrobat[] = [];

  for (const carpetaSistema of carpetesSistemes) {
    const nomCarpetaSistema: string = carpetaSistema.attributes?.displayName ?? "";
    const nomSistema = parsejaNomCarpetaSistema(nomCarpetaSistema);
    console.log(`\n📂 Sistema: "${nomCarpetaSistema}" → "${nomSistema}"`);

    const contingutSistema    = await llistaContingutCarpeta(projectId, carpetaSistema.id, token);
    const carpetesInstallacio = contingutSistema.filter(
      (item) => item.type === "folders" && /^[A-Za-z]+\d+_/i.test(item.attributes?.displayName ?? "")
    );
    console.log(`   ${carpetesInstallacio.length} carpetes d'instal·lació`);

    const installacions: InstallacioTrobada[] = [];
    const clauVistes  = new Map<string, true>();
    const codiVistos  = new Map<string, string[]>();

    for (const carpetaInst of carpetesInstallacio) {
      const nomCarpetaInst: string = carpetaInst.attributes?.displayName ?? "";
      const parsed = parsejaNomCarpetaInstallacio(nomCarpetaInst);

      if (!parsed) {
        console.warn(`  ⚠️  No s'ha pogut parsejar: "${nomCarpetaInst}"`);
        continue;
      }

      const carpetaModelBim = await trobaSubcarpeta(projectId, carpetaInst.id, CARPETA_MODEL_BIM, token);
      if (!carpetaModelBim) {
        console.warn(`  ⚠️  "${parsed.codi}": no s'ha trobat "${CARPETA_MODEL_BIM}"`);
        continue;
      }

      const contingutModelBim = await llistaContingutCarpeta(projectId, carpetaModelBim.id, token);
      const fitxersRvt = contingutModelBim.filter(
        (item) => item.type === "items" && item.attributes?.displayName?.toLowerCase().endsWith(".rvt")
      );

      if (fitxersRvt.length === 0) {
        console.warn(`  ⚠️  "${parsed.codi}": cap fitxer .rvt a "${CARPETA_MODEL_BIM}"`);
        continue;
      }

      const nomsAnteriors = codiVistos.get(parsed.codi) ?? [];
      if (!nomsAnteriors.includes(parsed.nom)) codiVistos.set(parsed.codi, [...nomsAnteriors, parsed.nom]);

      const clau = `${parsed.codi}|${parsed.nom}`;
      if (clauVistes.has(clau)) {
        console.warn(`  ⚠️  Duplicat exacte ignorat: ${parsed.codi} - ${parsed.nom}`);
        continue;
      }
      clauVistes.set(clau, true);

      if (fitxersRvt.length > 1) console.warn(`  ⚠️  "${parsed.codi}": ${fitxersRvt.length} .rvt — s'usa el primer`);

      const fitxer       = fitxersRvt[0];
      const itemId: string = fitxer.id ?? "";
      const tipVersionId = await obteTipVersionId(projectId, itemId, token);
      const urnBase      = tipVersionId ?? itemId;
      const urn          = Buffer.from(urnBase).toString("base64url");
      const embedUrl     = construeixEmbedUrlFallback(urn);
      const lastModifiedTime: string =
        fitxer.attributes?.lastModifiedTime ?? fitxer.attributes?.createTime ?? new Date().toISOString();

      installacions.push({ ...parsed, embedUrl, urn, lastModifiedTime });
      console.log(`  ${tipVersionId ? "✅" : "⚠️ "} ${parsed.codi} · ${parsed.nom}${tipVersionId ? "" : " (sense versió tip)"}`);
    }

    const duplicatsSistema = [...codiVistos.entries()]
      .filter(([, noms]) => noms.length > 1)
      .map(([codi, noms]) => `${codi} (${noms.map(n => `"${n}"`).join(", ")})`);

    sistemes.push({ nom: nomSistema, installacions, duplicats: duplicatsSistema });
  }

  return sistemes;
}

// ─── Sincronitza amb Supabase ─────────────────────────────────────────────────

async function sincronitzaSupabase(supabase: SupabaseClient, sistemesForma: SistemaTrobat[]): Promise<ResultatSync> {
  const resultat: ResultatSync = {
    sistemesCreats: [], sistemesActualitzats: [], sistemesEliminats: [],
    installacionsCreades: [], installacionsActualitzades: [], installacionsEliminades: [],
    installacionsSenseCanvis: [], codisDuplicats: [], errors: [],
  };

  const { data: sistemesSupabase, error: errSis } = await supabase.from("visor3d_sistemes").select("id, nom, ordre");
  if (errSis) throw new Error(`Error llegint sistemes: ${errSis.message}`);

  const { data: installacionsSupabase, error: errInst } = await supabase
    .from("visor3d_installacions").select("id, sistema_id, codi_installacio, nom, updated_at, embed_url, urn");
  if (errInst) throw new Error(`Error llegint instal·lacions: ${errInst.message}`);

  const sistemaPerNom = new Map<string, { id: string; ordre: number }>();
  for (const s of sistemesSupabase ?? []) sistemaPerNom.set(s.nom.toUpperCase(), { id: s.id, ordre: s.ordre });

  const instPerCodi = new Map<string, { id: string; nom: string; sistema_id: string; embed_url?: string; urn?: string }[]>();
  for (const i of installacionsSupabase ?? []) {
    if (i.codi_installacio) {
      const llista = instPerCodi.get(i.codi_installacio) ?? [];
      llista.push(i);
      instPerCodi.set(i.codi_installacio, llista);
    }
  }

  const codisForme       = new Set<string>();
  const nomsSistemesForme = new Set<string>();

  for (const s of sistemesForma) {
    nomsSistemesForme.add(s.nom.toUpperCase());
    for (const i of s.installacions) codisForme.add(i.codi);
  }

  for (const [index, sistema] of sistemesForma.entries()) {
    try {
      console.log(`\n💾 Sistema: ${sistema.nom}`);
      const clauNom = sistema.nom.toUpperCase();
      let sistemaId: string;

      if (sistemaPerNom.has(clauNom)) {
        sistemaId = sistemaPerNom.get(clauNom)!.id;
      } else {
        const maxOrdre = Math.max(0, ...(sistemesSupabase ?? []).map((s: any) => s.ordre ?? 0));
        const { data: nouSistema, error } = await supabase
          .from("visor3d_sistemes").insert({ nom: sistema.nom, color: colorPerOrdre(index), ordre: maxOrdre + 1 })
          .select().single();
        if (error) throw error;
        sistemaId = nouSistema.id;
        resultat.sistemesCreats.push(sistema.nom);
        console.log(`  ✅ Sistema creat: ${sistema.nom}`);
      }

      for (const [instIndex, inst] of sistema.installacions.entries()) {
        try {
          const existents = instPerCodi.get(inst.codi) ?? [];
          const existent  = existents.find(e => e.nom === inst.nom) ?? null;

          if (!existent) {
            await supabase.from("visor3d_installacions").insert({
              sistema_id: sistemaId, nom: inst.nom, codi_installacio: inst.codi,
              embed_url: inst.embedUrl, urn: inst.urn, ordre: instIndex,
              updated_at: inst.lastModifiedTime,
            });
            resultat.installacionsCreades.push(`${inst.codi} - ${inst.nom}`);
            console.log(`  ➕ Nova: ${inst.codi} - ${inst.nom}`);
          } else {
            const canviat = existent.urn !== inst.urn || existent.embed_url !== inst.embedUrl || existent.sistema_id !== sistemaId;
            if (canviat) {
              await supabase.from("visor3d_installacions").update({
                nom: inst.nom, embed_url: inst.embedUrl, urn: inst.urn,
                sistema_id: sistemaId, updated_at: inst.lastModifiedTime,
              }).eq("id", existent.id);
              resultat.installacionsActualitzades.push(`${inst.codi} - ${inst.nom}`);
              console.log(`  ✏️  Actualitzat: ${inst.codi} - ${inst.nom}`);
            } else {
              resultat.installacionsSenseCanvis.push(`${inst.codi} - ${inst.nom}`);
              console.log(`  ─  Sense canvis: ${inst.codi} - ${inst.nom}`);
            }
          }
        } catch (err) {
          const msg = `Error instal·lació ${inst.codi}: ${err}`;
          resultat.errors.push(msg);
          console.error(`  ❌ ${msg}`);
        }
      }

      if (sistema.duplicats?.length) {
        resultat.codisDuplicats.push(...sistema.duplicats);
        sistema.duplicats.forEach(d => console.warn(`  ⚠️  Codi compartit: ${d}`));
      }
    } catch (err) {
      const msg = `Error sistema ${sistema.nom}: ${err}`;
      resultat.errors.push(msg);
      console.error(`❌ ${msg}`);
    }
  }

  // Eliminacions
  for (const [codi, llista] of instPerCodi.entries()) {
    if (!codisForme.has(codi)) {
      for (const inst of llista) {
        try {
          await supabase.from("visor3d_installacions").delete().eq("id", inst.id);
          resultat.installacionsEliminades.push(codi);
          console.log(`  🗑️  Eliminada: ${codi}`);
        } catch (err) {
          resultat.errors.push(`Error eliminant ${codi}: ${err}`);
        }
      }
    }
  }

  for (const s of sistemesSupabase ?? []) {
    if (!nomsSistemesForme.has(s.nom.toUpperCase())) {
      try {
        const { count } = await supabase.from("visor3d_installacions")
          .select("id", { count: "exact", head: true }).eq("sistema_id", s.id);
        if ((count ?? 0) === 0) {
          await supabase.from("visor3d_sistemes").delete().eq("id", s.id);
          resultat.sistemesEliminats.push(s.nom);
          console.log(`  🗑️  Sistema eliminat: ${s.nom}`);
        } else {
          console.log(`  ⚠️  Sistema "${s.nom}" no és a Forma però té instal·lacions — no s'elimina`);
        }
      } catch (err) {
        resultat.errors.push(`Error eliminant sistema ${s.nom}: ${err}`);
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
function colorPerOrdre(i: number): string { return COLORS[i % COLORS.length]; }

// ─── Funció principal ─────────────────────────────────────────────────────────

export async function executaAgent(): Promise<ResultatSync> {
  console.log("🤖 Agent Visor3D · Autodesk Forma + APS 2-legged");
  console.log(`🕐 ${new Date().toISOString()}`);

  const supabaseUrl     = process.env.SUPABASE_URL;
  const supabaseKey     = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const apsClientId     = process.env.APS_CLIENT_ID;
  const apsClientSecret = process.env.APS_CLIENT_SECRET;
  const apsHubId        = process.env.APS_HUB_ID;
  const apsProjectId    = process.env.APS_PROJECT_ID;

  // Credencials SSA (TaulaMaster-bot) per a navegació de carpetes ACC
  // Si no existeixen, s'usen les credencials principals
  const ssaClientId     = process.env.APS_SSA_CLIENT_ID     || apsClientId;
  const ssaClientSecret = process.env.APS_SSA_CLIENT_SECRET || apsClientSecret;

  if (!supabaseUrl || !supabaseKey)     throw new Error("Falten SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  if (!apsClientId || !apsClientSecret) throw new Error("Falten APS_CLIENT_ID o APS_CLIENT_SECRET");
  if (!apsHubId || !apsProjectId)       throw new Error("Falten APS_HUB_ID o APS_PROJECT_ID");

  console.log(`\n📋 Configuració:`);
  console.log(`   APS_HUB_ID:     ${apsHubId}`);
  console.log(`   APS_PROJECT_ID: ${apsProjectId}`);
  console.log(`   Carpeta arrel:  ${CARPETA_ARREL_FORMA}`);
  console.log(`   Subcarpeta BIM: ${CARPETA_MODEL_BIM}`);
  console.log(`   SSA Client:     ${ssaClientId !== apsClientId ? "✅ TaulaMaster-bot" : "⚠️  App principal (sense SSA)"}`);

  const supabase = createClient(supabaseUrl, supabaseKey, {
    realtime: { transport: WebSocket as any },
  });

  let resultat: ResultatSync = {
    sistemesCreats: [], sistemesActualitzats: [], sistemesEliminats: [],
    installacionsCreades: [], installacionsActualitzades: [], installacionsEliminades: [],
    installacionsSenseCanvis: [], codisDuplicats: [], errors: [],
  };

  try {
    // 2-legged: token nou a cada execució, cap dependència de Supabase per auth
    // Token principal per al Viewer SDK (viewables:read)
    const token = await obteToken2Legged(apsClientId, apsClientSecret);
    // Token SSA per a navegació de carpetes ACC (data:read)
    const ssaToken = (ssaClientId !== apsClientId)
      ? await obteToken2Legged(ssaClientId!, ssaClientSecret!)
      : token;
    console.log(`🔑 Token SSA: ${ssaClientId !== apsClientId ? "TaulaMaster-bot" : "App principal"}`);
    const sistemesTobrats = await extrauSistemes(apsHubId, apsProjectId, ssaToken);

    console.log(`\n📊 Resum extracció:`);
    sistemesTobrats.forEach(s =>
      console.log(`  - ${s.nom}: ${s.installacions.length} instal·lació${s.installacions.length !== 1 ? "ns" : ""}`)
    );

    resultat = await sincronitzaSupabase(supabase, sistemesTobrats);

    console.log("\n✅ Sincronització completada:");
    console.log(`  ➕ Sistemes creats:             ${resultat.sistemesCreats.length}`);
    console.log(`  🗑️  Sistemes eliminats:           ${resultat.sistemesEliminats.length}`);
    console.log(`  ➕ Instal·lacions creades:       ${resultat.installacionsCreades.length}`);
    console.log(`  ✏️  Instal·lacions actualitzades: ${resultat.installacionsActualitzades.length}`);
    console.log(`  🗑️  Instal·lacions eliminades:    ${resultat.installacionsEliminades.length}`);
    console.log(`  ─  Sense canvis:                ${resultat.installacionsSenseCanvis.length}`);
    if (resultat.codisDuplicats.length) {
      resultat.codisDuplicats.forEach(d => console.warn(`  ⚠️  Codi duplicat: ${d}`));
    }
  } catch (errFatal) {
    const msg = errFatal instanceof Error ? errFatal.message : String(errFatal);
    console.error("❌ Error fatal:", msg);
    resultat.errors.push(`[FATAL] ${msg}`);
  }

  await supabase.from("visor3d_sync_log").insert({
    executat_a: new Date().toISOString(),
    sistemes_creats: resultat.sistemesCreats.length,
    sistemes_eliminats: resultat.sistemesEliminats.length,
    installacions_creades: resultat.installacionsCreades.length,
    installacions_actualitzades: resultat.installacionsActualitzades.length,
    installacions_eliminades: resultat.installacionsEliminades.length,
    installacions_sense_canvis: resultat.installacionsSenseCanvis.length,
    errors: resultat.errors.length,
    detalls: resultat,
  });

  return resultat;
}
