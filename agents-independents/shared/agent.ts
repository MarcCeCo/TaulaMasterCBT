// agent/src/agent.ts
// Agent APS (Autodesk Platform Services) → Supabase visor3d
// 3-legged OAuth + navegació Autodesk Forma
//
// Estructura esperada a Autodesk Forma:
//   besso-digital/
//     xxx_nomSistema/           ← carpeta de sistema
//       xxxxx_nomInstallacio/   ← carpeta d'instal·lació
//         001_model-bim/        ← carpeta fixa que conté els RVTs
//           fitxer.rvt
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
  urn: string;        // URN principal: MASTER si existeix, sinó MEP/ENT/EST
  urnMaster: string;  // URN del fitxer MASTER federat (conté tots els vincles)
  urnMep: string;     // URN del fitxer MEP (instal·lacions)
  urnEnt: string;     // URN del fitxer ENT (arquitectura/entorn)
  urnEst: string;     // URN del fitxer EST (estructura)
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

interface TokenRow {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const APS_BASE         = "https://developer.api.autodesk.com";
const APS_AUTH_URL     = `${APS_BASE}/authentication/v2/token`;
const CARPETA_MODEL_BIM = "001_MODEL-BIM";

// ─── Helpers de parseig ───────────────────────────────────────────────────────

function parsejaNomCarpetaSistema(nomCarpeta: string): string | null {
  // Només accepta carpetes amb prefix numèric de 3 dígits >= 001 (ex: "001_GRANOLLERS", "008_CALDES-DE-MONTBUI")
  const m = nomCarpeta.match(/^(\d{3})_(.+)$/);
  if (!m) return null;
  const prefix = parseInt(m[1], 10);
  if (prefix < 1) return null; // descarta 000_
  return m[2].replace(/-/g, " ").trim();
}

function parsejaNomCarpetaInstallacio(nomCarpeta: string): { codi: string; nom: string } | null {
  const netejat = nomCarpeta.replace(/^\d+_/, "");
  const idx = netejat.indexOf("_");
  if (idx === -1) return null;
  const codi = netejat.substring(0, idx);
  const nom  = netejat.substring(idx + 1).replace(/-/g, " ").trim();
  if (!/^[A-Z]+\d+$/.test(codi)) return null;
  return { codi, nom };
}

// ─── Autenticació APS 3-legged OAuth ─────────────────────────────────────────

let renovacioEnCurs: Promise<string> | null = null;

export async function obteToken3Legged(
  supabase: SupabaseClient,
  clientId: string,
  clientSecret: string
): Promise<string> {
  console.log("🔑 Obtenint token APS 3-legged des de Supabase...");

  const { data: tokenRow } = await supabase
    .from("aps_tokens")
    .select("access_token, refresh_token, expires_at")
    .order("id", { ascending: false })
    .limit(1)
    .single();

  if (!tokenRow) throw new Error("No hi ha token APS a Supabase. Executa /auth/login primer.");

  const row = tokenRow as TokenRow;
  const ara = Date.now();
  const margeMs = 5 * 60 * 1000; // 5 minuts de marge

  if (row.access_token && row.expires_at > ara + margeMs) {
    console.log(`✅ Token APS vàlid (expira en ${Math.round((row.expires_at - ara) / 60000)} min)`);
    return row.access_token;
  }

  console.log("🔄 Token APS expirat, renovant amb refresh token...");

  if (!row.refresh_token) {
    throw new Error("No hi ha refresh token. Executa /auth/login per autenticar-te de nou.");
  }

  if (renovacioEnCurs) {
    console.log("⏳ Renovació ja en curs, esperant resultat...");
    return renovacioEnCurs;
  }

  renovacioEnCurs = _renovaToken(supabase, clientId, clientSecret, row.refresh_token)
    .finally(() => { renovacioEnCurs = null; });

  return renovacioEnCurs;
}

async function _renovaToken(
  supabase: SupabaseClient,
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<string> {
  const resp = await fetch(APS_AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
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

  await supabase.from("aps_tokens").upsert({
    id: 1,
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  });

  console.log(`✅ Token APS renovat (expira en ${Math.round(data.expires_in / 60)} min)`);
  return data.access_token;
}

// ─── Autenticació 2-legged (per al Viewer SDK) ───────────────────────────────

export async function obteToken2Legged(
  clientId: string,
  clientSecret: string,
  scope: string = "viewables:read"
): Promise<string> {
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const resp = await fetch(APS_AUTH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope,
    }).toString(),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Error obtenint token 2-legged: ${resp.status} ${text}`);
  }

  const data = await resp.json() as { access_token: string; expires_in: number };
  return data.access_token;
}

// ─── Helpers de navegació Forma ──────────────────────────────────────────────

async function obteArrelCarpetes(hubId: string, projectId: string, token: string): Promise<any[]> {
  const resp = await fetch(
    `${APS_BASE}/project/v1/hubs/${hubId}/projects/${projectId}/topFolders`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!resp.ok) throw new Error(`Error obtenint carpetes arrel: ${resp.status}`);
  const json = await resp.json() as { data: any[] };
  return json.data ?? [];
}

async function obteContingutCarpeta(projectId: string, carpetaId: string, token: string): Promise<any[]> {
  const tots: any[] = [];
  let url: string | null =
    `${APS_BASE}/data/v1/projects/${projectId}/folders/${carpetaId}/contents?page[limit]=200`;

  while (url) {
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!resp.ok) break;
    const json = await resp.json() as { data: any[]; links?: { next?: { href: string } } };
    tots.push(...(json.data ?? []));
    url = json.links?.next?.href ?? null;
  }

  return tots;
}

async function trobaSubcarpeta(
  projectId: string,
  carpetaParentId: string,
  nom: string,
  token: string
): Promise<any | null> {
  const contingut = await obteContingutCarpeta(projectId, carpetaParentId, token);
  const carpetes = contingut.filter((item: any) => item.type === "folders");

  const trobada = carpetes.find(
    (item: any) =>
      item.attributes?.displayName?.toLowerCase() === nom.toLowerCase()
  ) ?? null;

  if (!trobada && carpetes.length > 0) {
    // Mostra les subcarpetes reals per ajudar a diagnosticar noms incorrectes
    const noms = carpetes.map((c: any) => `"${c.attributes?.displayName ?? "(buit)"}"`)
    console.warn(`     ↳ Subcarpetes trobades (${carpetes.length}): ${noms.join(", ")}`);
  }

  return trobada;
}

async function obteUrnFitxer(projectId: string, itemId: string, token: string): Promise<string | null> {
  const resp = await fetch(
    `${APS_BASE}/data/v1/projects/${projectId}/items/${encodeURIComponent(itemId)}/tip`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!resp.ok) return null;
  const json = await resp.json() as { data?: { relationships?: { derivatives?: { data?: { id?: string } } } } };
  const urn = json.data?.relationships?.derivatives?.data?.id;
  return urn ?? null;
}

// ─── Extracció de sistemes i instal·lacions de Forma ────────────────────────

async function extrauSistemes(
  hubId: string,
  projectId: string,
  token: string
): Promise<SistemaTrobat[]> {
  console.log(`📂 Navegant Forma: sistemes → instal·lacions → "${CARPETA_MODEL_BIM}"...`);

  // Forma: les carpetes de sistema estan directament a topFolders (Archivos de proyecto)
  const carpetesArrel = await obteArrelCarpetes(hubId, projectId, token);
  
  // Busca la carpeta "Archivos de proyecto" o usa la primera carpeta disponible
  let carpetaArxius = carpetesArrel.find(
    (c: any) => c.attributes?.displayName?.toLowerCase().includes("archivo") ||
                c.attributes?.displayName?.toLowerCase().includes("project file")
  ) ?? carpetesArrel[0];

  if (!carpetaArxius) {
    throw new Error("No s'ha trobat cap carpeta arrel al projecte Forma.");
  }

  console.log(`   ✅ Carpeta arrel: "${carpetaArxius.attributes?.displayName}"`);

  const carpetesSistema = (await obteContingutCarpeta(projectId, carpetaArxius.id, token))
    .filter((item: any) => item.type === "folders");

  const sistemes: SistemaTrobat[] = [];

  for (const carpetaSis of carpetesSistema) {
    const nomCarpetaSistema = carpetaSis.attributes?.displayName ?? "";
    const nomSistema = parsejaNomCarpetaSistema(nomCarpetaSistema);

    if (!nomSistema) {
      console.warn(`  ⚠️  No s'ha pogut parsejar com a sistema: "${nomCarpetaSistema}"`);
      continue;
    }

    const carpetesInstallacio = (await obteContingutCarpeta(projectId, carpetaSis.id, token))
      .filter((item: any) => item.type === "folders");

    // LOG DE DIAGNÒSTIC: llista totes les subcarpetes trobades per a aquest sistema
    console.log(`  🔎 Sistema "${nomSistema}" (${nomCarpetaSistema}) → ${carpetesInstallacio.length} subcarpeta(es):`);
    carpetesInstallacio.forEach((c: any) =>
      console.log(`     - "${c.attributes?.displayName ?? "(sense nom)"}" [id: ${c.id}]`)
    );

    const installacions: InstallacioTrobada[] = [];
    const duplicats: string[] = [];
    const codisTrobats = new Map<string, number>();

    for (const carpetaInst of carpetesInstallacio) {
      const nomCarpetaInst = carpetaInst.attributes?.displayName ?? "";
      const parsed = parsejaNomCarpetaInstallacio(nomCarpetaInst);
      if (!parsed) {
        console.warn(`  ⚠️  No s'ha pogut parsejar com a instal·lació: "${nomCarpetaInst}" [id: ${carpetaInst.id}]`);
        continue;
      }

      const carpetaModelBim = await trobaSubcarpeta(projectId, carpetaInst.id, CARPETA_MODEL_BIM, token);
      if (!carpetaModelBim) {
        console.warn(`  ⚠️  "${parsed.codi}": no s'ha trobat la subcarpeta "${CARPETA_MODEL_BIM}" [installació id: ${carpetaInst.id}]`);
        continue;
      }

      const contingutBim = await obteContingutCarpeta(projectId, carpetaModelBim.id, token);
      const fitxersRvt = contingutBim.filter(
        (item: any) =>
          item.type === "items" &&
          item.attributes?.displayName?.toLowerCase().endsWith(".rvt")
      );

      if (fitxersRvt.length === 0) {
        console.warn(`  ⚠️  "${parsed.codi}": cap fitxer .rvt a "${CARPETA_MODEL_BIM}"`);
        continue;
      }

      const count = (codisTrobats.get(parsed.codi) ?? 0) + 1;
      codisTrobats.set(parsed.codi, count);
      if (count > 1) {
        duplicats.push(parsed.codi);
        console.warn(`  ⚠️  Codi duplicat: "${parsed.codi}"`);
      }

      // Cerca fitxers per disciplina i per fitxer MASTER federat.
      // Convenció de noms (case-insensitive):
      //   _MASTER → fitxer federat que conté tots els vincles publicats (prioritat màxima)
      //   _MEP    → instal·lacions mecàniques/elèctriques/fontaneria
      //   _ENT    → arquitectura / entorn
      //   _EST    → estructura
      // Ex: ED005_MASTER.rvt, ED005_MEP.rvt, ED005_ENT_R24.rvt → detectats correctament.
      const conteParaula = (nom: string, keyword: string): boolean => {
        const upper = nom.toUpperCase();
        const idx = upper.indexOf(`_${keyword}`);
        if (idx === -1) return false;
        // El caràcter que ve després de _KEYWORD ha de ser: res (final o .rvt), _, punt o dígit
        const charAfter = upper[idx + keyword.length + 1];
        return charAfter === undefined || charAfter === "_" || charAfter === "." || /\d/.test(charAfter);
      };

      const fitxersMaster = fitxersRvt.filter((f: any) => conteParaula(f.attributes?.displayName ?? "", "MASTER"));
      const fitxersMep    = fitxersRvt.filter((f: any) => conteParaula(f.attributes?.displayName ?? "", "MEP"));
      const fitxersEnt    = fitxersRvt.filter((f: any) => conteParaula(f.attributes?.displayName ?? "", "ENT"));
      const fitxersEst    = fitxersRvt.filter((f: any) => conteParaula(f.attributes?.displayName ?? "", "EST"));

      // Fitxers que no encaixen en cap disciplina coneguda
      const fitxersAltres = fitxersRvt.filter((f: any) => {
        const nom = f.attributes?.displayName ?? "";
        return !conteParaula(nom, "MASTER") && !conteParaula(nom, "MEP") &&
               !conteParaula(nom, "ENT")    && !conteParaula(nom, "EST");
      });

      console.log(
        `    📁 "${parsed.codi}": ${fitxersRvt.length} RVT(s) — ` +
        `MASTER:${fitxersMaster.length} MEP:${fitxersMep.length} ENT:${fitxersEnt.length} EST:${fitxersEst.length} altres:${fitxersAltres.length}`
      );
      if (fitxersMaster.length > 0) {
        console.log(`    ✅ Mode MASTER: el Viewer carregarà els vincles automàticament`);
      }

      // Obté URN de tots els fitxers de cada disciplina en paral·lel.
      const obteUrns = async (fitxers: any[]): Promise<string[]> => {
        const urns = await Promise.all(
          fitxers.map((f: any) => obteUrnFitxer(projectId, f.id, token))
        );
        return urns.filter((u): u is string => !!u);
      };

      const [urnsMaster, urnsMep, urnsEnt, urnsEst] = await Promise.all([
        obteUrns(fitxersMaster),
        obteUrns(fitxersMep),
        obteUrns(fitxersEnt),
        obteUrns(fitxersEst),
      ]);

      // URN principal: MASTER té prioritat absoluta.
      // Si no hi ha MASTER, fallback als URNs individuals per disciplina.
      const urnPrincipal =
        urnsMaster[0] ?? urnsMep[0] ?? urnsEnt[0] ?? urnsEst[0] ?? "";

      const joinUrns = (urns: string[]) => urns.join(",");

      const embedUrl = urnPrincipal
        ? `https://autodesk360.com/viewer?urn=${urnPrincipal}`
        : "";

      // lastModifiedTime: el més recent de tots els fitxers
      const allFitxers = [...fitxersMaster, ...fitxersMep, ...fitxersEnt, ...fitxersEst, ...fitxersAltres];
      const lastModified = allFitxers
        .map((f: any) => f.attributes?.lastModifiedTime ?? "")
        .sort()
        .reverse()[0] ?? "";

      installacions.push({
        codi: parsed.codi,
        nom: parsed.nom,
        embedUrl,
        urn: urnPrincipal,
        urnMaster: joinUrns(urnsMaster),
        urnMep: joinUrns(urnsMep),
        urnEnt: joinUrns(urnsEnt),
        urnEst: joinUrns(urnsEst),
        lastModifiedTime: lastModified,
      });
    }

    if (installacions.length > 0) {
      sistemes.push({ nom: nomSistema, installacions, duplicats });
    } else {
      console.warn(`  ⚠️  Sistema "${nomSistema}" detectat però sense instal·lacions vàlides (${carpetesInstallacio.length} subcarpetes trobades)`);
    }
  }

  console.log(`   ✅ ${sistemes.length} sistemes trobats`);
  return sistemes;
}

// ─── Sincronització amb Supabase ─────────────────────────────────────────────

async function sincronitzaAmbSupabase(
  supabase: SupabaseClient,
  sistemesForma: SistemaTrobat[],
  resultat: ResultatSync
): Promise<void> {
  const codesForma = new Set<string>();
  const nomsSistemesForma = new Set<string>();

  for (const s of sistemesForma) {
    nomsSistemesForma.add(s.nom.toUpperCase());
    for (const i of s.installacions) codesForma.add(i.codi);
    if (s.duplicats?.length) {
      resultat.codisDuplicats.push(...s.duplicats);
    }
  }

  for (const [index, sistema] of sistemesForma.entries()) {
    const { data: sistemaExistent } = await supabase
      .from("visor3d_sistemes")
      .select("id, nom")
      .ilike("nom", sistema.nom)
      .maybeSingle();

    let sistemaId: number;

    if (!sistemaExistent) {
      const { data: nouSistema, error } = await supabase
        .from("visor3d_sistemes")
        .insert({ nom: sistema.nom, ordre: index + 1 })
        .select("id")
        .single();
      if (error || !nouSistema) {
        resultat.errors.push(`Error creant sistema "${sistema.nom}": ${error?.message}`);
        continue;
      }
      sistemaId = nouSistema.id;
      resultat.sistemesCreats.push(sistema.nom);
      console.log(`  ✅ Sistema creat: "${sistema.nom}"`);
    } else {
      sistemaId = sistemaExistent.id;
      resultat.sistemesActualitzats.push(sistema.nom);
    }

    for (const inst of sistema.installacions) {
      const { data: instExistent } = await supabase
        .from("visor3d_installacions")
        .select("id, urn, embed_url, last_modified_time, codi_installacio")
        .eq("codi_installacio", inst.codi)
        .maybeSingle();

      if (!instExistent) {
        const { error } = await supabase.from("visor3d_installacions").insert({
          codi_installacio: inst.codi,
          nom: inst.nom,
          sistema_id: sistemaId,
          urn: inst.urn,
          urn_master: inst.urnMaster,
          urn_mep: inst.urnMep,
          urn_ent: inst.urnEnt,
          urn_est: inst.urnEst,
          embed_url: inst.embedUrl,
          last_modified_time: inst.lastModifiedTime,
        });
        if (error) {
          resultat.errors.push(`Error creant instal·lació "${inst.codi}": ${error.message}`);
        } else {
          resultat.installacionsCreades.push(`${inst.codi} – ${inst.nom}`);
          console.log(`    ✅ Instal·lació creada: ${inst.codi}`);
        }
      } else if (
        instExistent.urn !== inst.urn ||
        instExistent.embed_url !== inst.embedUrl ||
        instExistent.last_modified_time !== inst.lastModifiedTime
      ) {
        const { error } = await supabase
          .from("visor3d_installacions")
          .update({
            nom: inst.nom,
            sistema_id: sistemaId,
            urn: inst.urn,
            urn_master: inst.urnMaster,
            urn_mep: inst.urnMep,
            urn_ent: inst.urnEnt,
            urn_est: inst.urnEst,
            embed_url: inst.embedUrl,
            last_modified_time: inst.lastModifiedTime,
          })
          .eq("codi_installacio", inst.codi);
        if (error) {
          resultat.errors.push(`Error actualitzant "${inst.codi}": ${error.message}`);
        } else {
          resultat.installacionsActualitzades.push(`${inst.codi} – ${inst.nom}`);
          console.log(`    🔄 Instal·lació actualitzada: ${inst.codi}`);
        }
      } else {
        resultat.installacionsSenseCanvis.push(inst.codi);
      }
    }
  }

  // Eliminar instal·lacions que ja no existeixen a Forma
  const { data: totes } = await supabase
    .from("visor3d_installacions")
    .select("codi_installacio, nom");

  for (const row of totes ?? []) {
    if (!codesForma.has(row.codi_installacio)) {
      await supabase.from("visor3d_installacions").delete().eq("codi_installacio", row.codi_installacio);
      resultat.installacionsEliminades.push(`${row.codi_installacio} – ${row.nom ?? row.codi_installacio}`);
      console.log(`    🗑️  Instal·lació eliminada: ${row.codi_installacio}`);
    }
  }

  // Eliminar sistemes que ja no existeixen a Forma
  const { data: totsS } = await supabase
    .from("visor3d_sistemes")
    .select("id, nom");

  for (const s of totsS ?? []) {
    if (!nomsSistemesForma.has(s.nom.toUpperCase())) {
      const { data: instDelSistema } = await supabase
        .from("visor3d_installacions")
        .select("codi_installacio")
        .eq("sistema_id", s.id);
      if (!instDelSistema?.length) {
        await supabase.from("visor3d_sistemes").delete().eq("id", s.id);
        resultat.sistemesEliminats.push(s.nom);
        console.log(`  🗑️  Sistema eliminat: "${s.nom}"`);
      } else {
        console.log(`  ⚠️  Sistema "${s.nom}" no és a Forma però té instal·lacions — no s'elimina`);
      }
    }
  }
}

// ─── Punt d'entrada principal ─────────────────────────────────────────────────

export async function executaAgent(): Promise<ResultatSync> {
  const resultat: ResultatSync = {
    sistemesCreats: [],
    sistemesActualitzats: [],
    sistemesEliminats: [],
    installacionsCreades: [],
    installacionsActualitzades: [],
    installacionsEliminades: [],
    installacionsSenseCanvis: [],
    codisDuplicats: [],
    errors: [],
  };

  console.log(`\n🤖 Agent Visor3D · Autodesk Forma + 3-legged OAuth`);
  console.log(`🕐 ${new Date().toISOString()}\n`);

  const supabaseUrl     = process.env.SUPABASE_URL;
  const supabaseKey     = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const apsClientId     = process.env.APS_CLIENT_ID;
  const apsClientSecret = process.env.APS_CLIENT_SECRET;
  const apsHubId        = process.env.APS_HUB_ID;
  const apsProjectId    = process.env.APS_PROJECT_ID;

  if (!supabaseUrl || !supabaseKey)     throw new Error("Falten SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  if (!apsClientId || !apsClientSecret) throw new Error("Falten APS_CLIENT_ID o APS_CLIENT_SECRET");
  if (!apsHubId || !apsProjectId)       throw new Error("Falten APS_HUB_ID o APS_PROJECT_ID");

  console.log(`📋 Configuració:`);
  console.log(`   APS_HUB_ID:     ${apsHubId}`);
  console.log(`   APS_PROJECT_ID: ${apsProjectId}`);
  console.log(`   Subcarpeta BIM: ${CARPETA_MODEL_BIM}`);

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const token = await obteToken3Legged(supabase, apsClientId, apsClientSecret);
    const sistemesTobrats = await extrauSistemes(apsHubId, apsProjectId, token);

    console.log(`\n📊 Resum extracció de Forma:`);
    console.log(`   Sistemes: ${sistemesTobrats.length}`);
    console.log(`   Instal·lacions: ${sistemesTobrats.reduce((a, s) => a + s.installacions.length, 0)}`);

    await sincronitzaAmbSupabase(supabase, sistemesTobrats, resultat);

  } catch (err: any) {
    const msg = err?.message ?? String(err);
    console.error(`❌ Error fatal: ${msg}`);
    resultat.errors.push(`[FATAL] ${msg}`);
  }

  console.log(`\n✅ Agent finalitzat:`, resultat);

  // ─── Escriu el log a Supabase ────────────────────────────────────────────────
  try {
    await supabase.from("visor3d_sync_log").insert({
      executat_a: new Date().toISOString(),
      sistemes_creats:              resultat.sistemesCreats.length,
      sistemes_actualitzats:        resultat.sistemesActualitzats.length,
      sistemes_eliminats:           resultat.sistemesEliminats.length,
      installacions_creades:        resultat.installacionsCreades.length,
      installacions_actualitzades:  resultat.installacionsActualitzades.length,
      installacions_eliminades:     resultat.installacionsEliminades.length,
      installacions_sense_canvis:   resultat.installacionsSenseCanvis.length,
      errors:                       resultat.errors.length,
      detalls: {
        sistemesCreats:              resultat.sistemesCreats,
        sistemesActualitzats:        resultat.sistemesActualitzats,
        sistemesEliminats:           resultat.sistemesEliminats,
        installacionsCreades:        resultat.installacionsCreades,
        installacionsActualitzades:  resultat.installacionsActualitzades,
        installacionsEliminades:     resultat.installacionsEliminades,
        installacionsSenseCanvis:    resultat.installacionsSenseCanvis,
        codisDuplicats:              resultat.codisDuplicats,
        errors:                      resultat.errors,
      },
    });
    console.log("📝 Log escrit a visor3d_sync_log");
  } catch (logErr: any) {
    console.error("⚠️  No s'ha pogut escriure el log a Supabase:", logErr?.message ?? logErr);
  }

  return resultat;
}
