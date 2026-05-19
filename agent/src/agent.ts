// src/agent.ts
// Agent APS (Autodesk Platform Services) → Supabase visor3d
// Usa 2-legged OAuth — sense login interactiu, sense 2FA, sense Playwright
// ─────────────────────────────────────────────────────────────────────────────

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";

// ─── Tipus ────────────────────────────────────────────────────────────────────

interface InstallacioTrobada {
  codi: string;
  nom: string;
  embedUrl: string;
  urn: string;
}

interface SistemaTrobat {
  nom: string;
  installacions: InstallacioTrobada[];
}

interface ResultatSync {
  sistemesCreats: string[];
  sistemesActualitzats: string[];
  installacionsCreades: string[];
  installacionsActualitzades: string[];
  errors: string[];
}

interface APSToken {
  access_token: string;
  expires_in: number;
  token_type: string;
  obtingutAt: number;
}

// ─── Constants APS ───────────────────────────────────────────────────────────

const APS_BASE = "https://developer.api.autodesk.com";
const APS_AUTH_URL = `${APS_BASE}/authentication/v2/token`;

// ─── Helpers de parseig ───────────────────────────────────────────────────────

function parsejaNomCarpeta(nomCarpeta: string): string {
  const sensePrefixNumeric = nomCarpeta.replace(/^\d+_/, "");
  return sensePrefixNumeric.replace(/-/g, " ").trim();
}

function parsejaNomFitxer(nomFitxer: string): { codi: string; nom: string } | null {
  const sensExtensio = nomFitxer.replace(/\.[^.]+$/, "");
  const indexGuioBaix = sensExtensio.indexOf("_");
  if (indexGuioBaix === -1) return null;
  const codi = sensExtensio.substring(0, indexGuioBaix);
  const nomRaw = sensExtensio.substring(indexGuioBaix + 1);
  const nom = nomRaw.replace(/-/g, " ").trim();
  if (!/^[A-Z]+\d+$/.test(codi)) return null;
  return { codi, nom };
}

function construeixEmbedUrl(urn: string): string {
  return `https://viewer.autodesk.com/id/${urn}`;
}

// ─── Autenticació APS 2-legged OAuth ─────────────────────────────────────────

let tokenCache: APSToken | null = null;

async function obteToken(clientId: string, clientSecret: string): Promise<APSToken> {
  if (tokenCache && Date.now() < tokenCache.obtingutAt + (tokenCache.expires_in - 300) * 1000) {
    console.log("🔑 Reutilitzant token APS existent");
    return tokenCache;
  }

  console.log("🔐 Obtenint token APS 2-legged...");

  const body = new URLSearchParams({
    grant_type: "client_credentials",
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
    throw new Error(`Error obtenint token APS: ${resp.status} ${text}`);
  }

  const data = await resp.json() as { access_token: string; expires_in: number; token_type: string };
  tokenCache = { ...data, obtingutAt: Date.now() };
  console.log(`✅ Token APS obtingut (expira en ${data.expires_in}s)`);
  return tokenCache;
}

// ─── APS Data Management API ──────────────────────────────────────────────────

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
  const resp = await fetch(`${APS_BASE}/project/v1/hubs/${hubId}/projects/${projectId}/topFolders`, {
    headers: { Authorization: `Bearer ${token}` },
  });
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
  console.log("📂 Navegant a WEB → 000_MODELS via APS...");

  const carpetesArrel = await obteArrelCarpetes(hubId, projectId, token);
  console.log(`  Carpetes arrel: ${carpetesArrel.map((c: any) => c.attributes?.displayName).join(", ")}`);

  // Cerca la carpeta WEB
  const carpetaWEB = carpetesArrel.find(
    (c: any) => c.type === "folders" && c.attributes?.displayName === "WEB"
  );

  let carpeta000Models: any = null;

  if (carpetaWEB) {
    console.log(`  ✅ Carpeta WEB trobada: ${carpetaWEB.id}`);
    carpeta000Models = await trobaSubcarpeta(projectId, carpetaWEB.id, "000_MODELS", token);
  } else {
    // Busca 000_MODELS directament a l'arrel
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

    console.log(`  📄 Fitxers .rvt: ${fitxersRvt.map((f: any) => f.attributes?.displayName).join(", ")}`);

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
      const embedUrl = construeixEmbedUrl(urn);

      installacions.push({ ...parsed, embedUrl, urn });
      console.log(`  ✅ ${parsed.codi} - ${parsed.nom}`);
    }

    sistemes.push({ nom: nomSistema, installacions });
  }

  return sistemes;
}

// ─── Sincronitza amb Supabase ─────────────────────────────────────────────────

async function sincronitzaSupabase(supabase: SupabaseClient, sistemes: SistemaTrobat[]): Promise<ResultatSync> {
  const resultat: ResultatSync = {
    sistemesCreats: [], sistemesActualitzats: [],
    installacionsCreades: [], installacionsActualitzades: [], errors: [],
  };

  for (const [index, sistema] of sistemes.entries()) {
    try {
      console.log(`\n💾 Sincronitzant sistema: ${sistema.nom}`);

      const { data: sistemaExistent } = await supabase
        .from("visor3d_sistemes").select("id, nom").ilike("nom", sistema.nom).single();

      let sistemaId: string;

      if (sistemaExistent) {
        sistemaId = sistemaExistent.id;
        resultat.sistemesActualitzats.push(sistema.nom);
        console.log(`  ♻️  Sistema ja existent: ${sistema.nom}`);
      } else {
        const { data: nouSistema, error } = await supabase
          .from("visor3d_sistemes")
          .insert({ nom: sistema.nom, color: colorPerOrdre(index), ordre: index })
          .select().single();
        if (error) throw error;
        sistemaId = nouSistema.id;
        resultat.sistemesCreats.push(sistema.nom);
        console.log(`  ✅ Sistema creat: ${sistema.nom}`);
      }

      for (const inst of sistema.installacions) {
        try {
          const { data: instExistent } = await supabase
            .from("visor3d_installacions").select("id")
            .eq("sistema_id", sistemaId).eq("codi_installacio", inst.codi).single();

          if (instExistent) {
            await supabase.from("visor3d_installacions")
              .update({ nom: inst.nom, embed_url: inst.embedUrl, urn: inst.urn, updated_at: new Date().toISOString() })
              .eq("id", instExistent.id);
            resultat.installacionsActualitzades.push(`${inst.codi} - ${inst.nom}`);
          } else {
            await supabase.from("visor3d_installacions").insert({
              sistema_id: sistemaId, nom: inst.nom, codi_installacio: inst.codi,
              embed_url: inst.embedUrl, urn: inst.urn, ordre: sistema.installacions.indexOf(inst),
            });
            resultat.installacionsCreades.push(`${inst.codi} - ${inst.nom}`);
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

  return resultat;
}

// ─── Colors ───────────────────────────────────────────────────────────────────

const COLORS = ["#0099A8","#6366F1","#10B981","#F59E0B","#EF4444","#8B5CF6","#EC4899","#F97316","#06B6D4","#84CC16","#64748B","#0EA5E9"];
function colorPerOrdre(index: number): string { return COLORS[index % COLORS.length]; }

// ─── Funció principal ─────────────────────────────────────────────────────────

export async function executaAgent(): Promise<ResultatSync> {
  console.log("🤖 Agent Visor3D (APS) iniciant...");
  console.log(`🕐 ${new Date().toISOString()}`);

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const apsClientId = process.env.APS_CLIENT_ID;
  const apsClientSecret = process.env.APS_CLIENT_SECRET;
  const apsHubId = process.env.APS_HUB_ID;
  const apsProjectId = process.env.APS_PROJECT_ID;

  if (!supabaseUrl || !supabaseKey) throw new Error("Falten SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  if (!apsClientId || !apsClientSecret) throw new Error("Falten APS_CLIENT_ID o APS_CLIENT_SECRET");
  if (!apsHubId || !apsProjectId) throw new Error("Falten APS_HUB_ID o APS_PROJECT_ID");

  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: {} },
    realtime: { transport: WebSocket as any },
  });

  const tokenData = await obteToken(apsClientId, apsClientSecret);
  const token = tokenData.access_token;

  const sistemesTrobats = await extrauSistemes(apsHubId, apsProjectId, token);

  console.log(`\n📊 Resum extracció:`);
  console.log(`  Sistemes trobats: ${sistemesTrobats.length}`);
  sistemesTrobats.forEach((s) => console.log(`  - ${s.nom}: ${s.installacions.length} instal·lacions`));

  const resultat = await sincronitzaSupabase(supabase, sistemesTrobats);

  console.log("\n✅ Sincronització completada:");
  console.log(`  Sistemes creats: ${resultat.sistemesCreats.length}`);
  console.log(`  Sistemes actualitzats: ${resultat.sistemesActualitzats.length}`);
  console.log(`  Instal·lacions creades: ${resultat.installacionsCreades.length}`);
  console.log(`  Instal·lacions actualitzades: ${resultat.installacionsActualitzades.length}`);
  if (resultat.errors.length > 0) {
    console.log(`  ⚠️  Errors: ${resultat.errors.length}`);
    resultat.errors.forEach((e) => console.error(`    - ${e}`));
  }

  await supabase.from("visor3d_sync_log").insert({
    executat_a: new Date().toISOString(),
    sistemes_creats: resultat.sistemesCreats.length,
    sistemes_actualitzats: resultat.sistemesActualitzats.length,
    installacions_creades: resultat.installacionsCreades.length,
    installacions_actualitzades: resultat.installacionsActualitzades.length,
    errors: resultat.errors,
    detalls: resultat,
  });

  return resultat;
}
