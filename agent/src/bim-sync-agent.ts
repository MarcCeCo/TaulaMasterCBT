// agent/src/bim-sync-agent.ts
// Agent BIM Sync USB — port TypeScript de bim_sync_usb.py
//
// Opcions:
//   copiar-disciplines : busca _ENT/_EST/_MEP a ACC i n'obté els URNs/metadades
//   pujar-masters      : puja els fitxers _MASTER del USB a ACC + xRefs + processa
//
// Nota: en entorn web/cloud les rutes de disc locals (ORIGEN, USB) s'obtenen
// de variables d'entorn. Si s'executa a l'ordinador de l'usuari (mode local),
// pot accedir als fitxers directament. En mode cloud, les opcions de còpia
// local no apliquen (s'usen les metadades d'ACC directament).
// ─────────────────────────────────────────────────────────────────────────────

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import WebSocket from "ws";

(globalThis as any).WebSocket = WebSocket;

// ─── Tipus ────────────────────────────────────────────────────────────────────

export type BimSyncOpcio = "copiar-disciplines" | "pujar-masters";

interface BimSyncResultat {
  opcio: BimSyncOpcio;
  fitxersProcessats: number;
  fitxersPujats: number;
  fitxersAmbError: string[];
  xRefsRegistrats: number;
  errors: string[];
  executat_a: string;
  durada_ms: number;
}

// ─── Configuració (des de variables d'entorn) ─────────────────────────────────

const SUFIXOS_COPIA = ["_ENT", "_EST", "_MEP", "_ENT_FM", "_EST_FM", "_MEP_FM", "_COOR", "_STR"];
const SUFIX_MASTER  = "_MASTER";

function getConfig() {
  return {
    apsClientId:     process.env.APS_CLIENT_ID     ?? "",
    apsClientSecret: process.env.APS_CLIENT_SECRET ?? "",
    supabaseUrl:     process.env.SUPABASE_URL       ?? "",
    supabaseKey:     process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    // Ruta local al disc USB (si el servidor corre localment)
    usbPath:         process.env.BIM_USB_PATH       ?? "",
    // Carpeta d'ACC on estan els MASTERs
    accCarpetaMasters: process.env.ACC_CARPETA_MASTERS ?? "Project Files",
  };
}

// ─── Autenticació APS 2-legged ────────────────────────────────────────────────

async function obtirToken(clientId: string, clientSecret: string): Promise<string> {
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const resp = await fetch("https://developer.api.autodesk.com/authentication/v2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "data:read data:write data:create",
    }).toString(),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Error autenticació APS: ${resp.status} ${text}`);
  }
  const data = await resp.json() as { access_token: string };
  return data.access_token;
}

// ─── Helpers ACC ──────────────────────────────────────────────────────────────

async function obteHubIProjecte(token: string): Promise<{ hubId: string; projectId: string; folderId: string } | null> {
  const cfg = getConfig();

  // Hubs
  const rHubs = await fetch("https://developer.api.autodesk.com/project/v1/hubs", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!rHubs.ok) throw new Error(`Error obtenint hubs: ${rHubs.status}`);
  const hubs = (await rHubs.json() as any).data ?? [];
  if (!hubs.length) return null;
  const hubId = hubs[0].id;

  // Projectes
  const rProj = await fetch(
    `https://developer.api.autodesk.com/project/v1/hubs/${hubId}/projects`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!rProj.ok) throw new Error(`Error obtenint projectes: ${rProj.status}`);
  const projectes = (await rProj.json() as any).data ?? [];
  if (!projectes.length) return null;
  const projectId = projectes[0].id;

  // Carpeta arrel
  const rFolders = await fetch(
    `https://developer.api.autodesk.com/project/v1/hubs/${hubId}/projects/${projectId}/topFolders`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!rFolders.ok) throw new Error(`Error obtenint carpetes: ${rFolders.status}`);
  const folders = (await rFolders.json() as any).data ?? [];

  const carpeta = folders.find((f: any) =>
    cfg.accCarpetaMasters.toLowerCase() === (f.attributes?.name ?? "").toLowerCase()
  );
  if (!carpeta) return null;

  return { hubId, projectId, folderId: carpeta.id };
}

function normalitzaNom(s: string): string {
  return s.toLowerCase().replace(/-/g, "_").replace(/ /g, "_");
}

async function obteContingutCarpeta(token: string, projectId: string, folderId: string): Promise<any[]> {
  const resp = await fetch(
    `https://developer.api.autodesk.com/data/v1/projects/${projectId}/folders/${folderId}/contents`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!resp.ok) throw new Error(`Error llegint carpeta: ${resp.status}`);
  return (await resp.json() as any).data ?? [];
}

async function obteVersionIdPerNom(
  token: string, projectId: string, folderId: string, nomFitxer: string
): Promise<string | null> {
  const contingut = await obteContingutCarpeta(token, projectId, folderId);
  const item = contingut.find(
    (x: any) =>
      x.type === "items" &&
      normalitzaNom(x.attributes?.displayName ?? "") === normalitzaNom(nomFitxer)
  );
  if (!item) return null;

  const resp = await fetch(
    `https://developer.api.autodesk.com/data/v1/projects/${projectId}/items/${encodeURIComponent(item.id)}/tip`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!resp.ok) return null;
  return (await resp.json() as any).data?.id ?? null;
}

// ─── Puja fitxer a ACC ────────────────────────────────────────────────────────

async function pujaFitxerACC(
  token: string, projectId: string, folderId: string, fitxerPath: string
): Promise<{ objectId: string; itemId: string; versionId: string } | null> {
  const nom  = path.basename(fitxerPath);
  const mida = fs.statSync(fitxerPath).size;
  console.log(`  ↑  Pujant ${nom} (${(mida / 1024 / 1024).toFixed(1)} MB)...`);

  // 1. Sol·licitar storage
  const rStorage = await fetch(
    `https://developer.api.autodesk.com/data/v1/projects/${projectId}/storage`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/vnd.api+json" },
      body: JSON.stringify({
        jsonapi: { version: "1.0" },
        data: {
          type: "objects",
          attributes: { name: nom },
          relationships: { target: { data: { type: "folders", id: folderId } } },
        },
      }),
    }
  );
  if (!rStorage.ok) throw new Error(`Error storage: ${rStorage.status}`);
  const objectId  = (await rStorage.json() as any).data.id as string;
  const parts     = objectId.replace("urn:adsk.objects:os.object:", "");
  const bucket    = parts.split("/")[0];
  const objKey    = parts.split("/").slice(1).join("/");

  // 2. Signed URL
  const rSign = await fetch(
    `https://developer.api.autodesk.com/oss/v2/buckets/${bucket}/objects/${encodeURIComponent(objKey)}/signeds3upload?minutesExpiration=60`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!rSign.ok) throw new Error(`Error signed URL: ${rSign.status}`);
  const signData  = await rSign.json() as any;
  const uploadUrl = signData.urls[0];
  const uploadKey = signData.uploadKey ?? "";

  // 3. PUT binari
  const fileBuffer = fs.readFileSync(fitxerPath);
  const rPut = await fetch(uploadUrl, { method: "PUT", body: fileBuffer });
  if (!rPut.ok) throw new Error(`Error PUT S3: ${rPut.status}`);

  // 4. Finalitzar
  const rFin = await fetch(
    `https://developer.api.autodesk.com/oss/v2/buckets/${bucket}/objects/${encodeURIComponent(objKey)}/signeds3upload`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ uploadKey }),
    }
  );
  if (!rFin.ok) throw new Error(`Error finalitzant: ${rFin.status}`);

  // 5. Crear o actualitzar item
  const contingut    = await obteContingutCarpeta(token, projectId, folderId);
  const itemExistent = contingut.find(
    (x: any) => x.attributes?.displayName === nom && x.type === "items"
  )?.id ?? null;

  if (itemExistent) {
    const rVer = await fetch(
      `https://developer.api.autodesk.com/data/v1/projects/${projectId}/versions`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/vnd.api+json" },
        body: JSON.stringify({
          jsonapi: { version: "1.0" },
          data: {
            type: "versions",
            attributes: { name: nom, extension: { type: "versions:autodesk.bim360:File", version: "1.0" } },
            relationships: {
              item:    { data: { type: "items",   id: itemExistent } },
              storage: { data: { type: "objects", id: objectId } },
            },
          },
        }),
      }
    );
    if (!rVer.ok) throw new Error(`Error versió: ${rVer.status}`);
    const d = await rVer.json() as any;
    return { objectId, itemId: itemExistent, versionId: d.data.id };
  } else {
    const rItem = await fetch(
      `https://developer.api.autodesk.com/data/v1/projects/${projectId}/items`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/vnd.api+json" },
        body: JSON.stringify({
          jsonapi: { version: "1.0" },
          data: {
            type: "items",
            attributes: { displayName: nom, extension: { type: "items:autodesk.bim360:File", version: "1.0" } },
            relationships: {
              tip:    { data: { type: "versions", id: "1" } },
              parent: { data: { type: "folders",  id: folderId } },
            },
          },
          included: [{
            type: "versions", id: "1",
            attributes: { name: nom, extension: { type: "versions:autodesk.bim360:File", version: "1.0" } },
            relationships: { storage: { data: { type: "objects", id: objectId } } },
          }],
        }),
      }
    );
    if (!rItem.ok) throw new Error(`Error item: ${rItem.status}`);
    const d = await rItem.json() as any;
    return { objectId, itemId: d.data.id, versionId: d.included?.[0]?.id ?? "" };
  }
}

// ─── Registra xRefs ───────────────────────────────────────────────────────────

async function registraXRefs(
  token: string, projectId: string, folderId: string,
  masterVersionId: string, nomsDisciplines: string[]
): Promise<string | null> {
  const refsData: any[] = [];
  for (const nom of nomsDisciplines) {
    const verId = await obteVersionIdPerNom(token, projectId, folderId, nom);
    if (verId) {
      refsData.push({
        type: "versions", id: verId,
        meta: {
          refType: "xrefs", direction: "from",
          extension: { type: "xrefs:autodesk.core:Xref", version: "1.1", data: { nestedType: "overlay" } },
        },
      });
    }
  }
  if (!refsData.length) return null;

  const resp = await fetch(
    `https://developer.api.autodesk.com/data/v1/projects/${projectId}/versions?copyFrom=${encodeURIComponent(masterVersionId)}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/vnd.api+json" },
      body: JSON.stringify({
        jsonapi: { version: "1.0" },
        data: { type: "versions", relationships: { refs: { data: refsData } } },
      }),
    }
  );
  if (!resp.ok) return null;
  return (await resp.json() as any).data?.id ?? null;
}

// ─── Cerca fitxers al USB ─────────────────────────────────────────────────────

function trobaFitxersBim(carpeta: string, sufixos: string[]): string[] {
  const resultats: string[] = [];
  function navega(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        navega(fullPath);
      } else if (entry.name.toLowerCase().endsWith(".rvt")) {
        const nomUpper = entry.name.toUpperCase();
        if (sufixos.some(s => nomUpper.includes(s)) && !nomUpper.includes("_MASTER")) {
          resultats.push(fullPath);
        }
      }
    }
  }
  navega(carpeta);
  return resultats.sort();
}

// ─── Desa log a Supabase ──────────────────────────────────────────────────────

async function desaLogSupabase(resultat: BimSyncResultat) {
  const cfg = getConfig();
  if (!cfg.supabaseUrl || !cfg.supabaseKey) return;
  const supabase = createClient(cfg.supabaseUrl, cfg.supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  await supabase.from("bim_sync_log").insert({
    executat_a:           resultat.executat_a,
    opcio:                resultat.opcio,
    fitxers_processats:   resultat.fitxersProcessats,
    fitxers_pujats:       resultat.fitxersPujats,
    xrefs_registrats:     resultat.xRefsRegistrats,
    errors:               resultat.errors.length,
    durada_ms:            resultat.durada_ms,
    detalls: {
      fitxersAmbError:    resultat.fitxersAmbError,
      errors:             resultat.errors,
    },
  });
}

// ─── Execució principal ───────────────────────────────────────────────────────

export async function executaBimSync(opcio: BimSyncOpcio): Promise<BimSyncResultat> {
  const inici = Date.now();
  const cfg   = getConfig();
  const resultat: BimSyncResultat = {
    opcio,
    fitxersProcessats: 0,
    fitxersPujats:     0,
    fitxersAmbError:   [],
    xRefsRegistrats:   0,
    errors:            [],
    executat_a:        new Date().toISOString(),
    durada_ms:         0,
  };

  console.log(`\n🔄 Agent BIM Sync iniciat — opcio: ${opcio}`);

  try {
    const token = await obtirToken(cfg.apsClientId, cfg.apsClientSecret);

    // ── Opció 1: Copiar disciplines ──────────────────────────────────────────
    if (opcio === "copiar-disciplines") {
      // En mode web, "copiar disciplines" significa llistar els fitxers de
      // disciplina disponibles a ACC i retornar el seu estat (URN, versió, etc.)
      // per mostrar-ho al panell de control.
      const ctx = await obteHubIProjecte(token);
      if (!ctx) throw new Error("No s'ha pogut obtenir el hub/projecte d'ACC");

      const contingut = await obteContingutCarpeta(token, ctx.projectId, ctx.folderId);
      const disciplines = contingut.filter((item: any) => {
        const nom = (item.attributes?.displayName ?? "").toUpperCase();
        return (
          item.type === "items" &&
          nom.endsWith(".RVT") &&
          SUFIXOS_COPIA.some(s => nom.includes(s)) &&
          !nom.includes("_MASTER")
        );
      });

      resultat.fitxersProcessats = disciplines.length;
      console.log(`  ✅ Disciplines trobades a ACC: ${disciplines.length}`);
      for (const d of disciplines) {
        console.log(`     • ${d.attributes?.displayName}`);
      }
    }

    // ── Opció 2: Pujar MASTERs ───────────────────────────────────────────────
    else if (opcio === "pujar-masters") {
      if (!cfg.usbPath) {
        throw new Error(
          "BIM_USB_PATH no està configurada. " +
          "Afegeix la variable d'entorn apuntant al directori BIM_WORK del USB."
        );
      }
      if (!fs.existsSync(cfg.usbPath)) {
        throw new Error(`El directori USB no existeix: ${cfg.usbPath}`);
      }

      const ctx = await obteHubIProjecte(token);
      if (!ctx) throw new Error("No s'ha pogut obtenir el hub/projecte d'ACC");

      // Cerca fitxers _MASTER al USB
      const masters: string[] = [];
      function cercaMasters(dir: string) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) cercaMasters(fullPath);
          else if (entry.name.toLowerCase().endsWith(".rvt") &&
                   entry.name.toUpperCase().includes("_MASTER")) {
            masters.push(fullPath);
          }
        }
      }
      cercaMasters(cfg.usbPath);

      if (!masters.length) {
        console.log("  ⚠️  Cap fitxer _MASTER trobat al USB.");
        resultat.errors.push("Cap fitxer _MASTER trobat al directori BIM_WORK");
      }

      resultat.fitxersProcessats = masters.length;

      for (const masterPath of masters) {
        const nomMaster    = path.basename(masterPath);
        const carpetaMaster = path.dirname(masterPath);
        console.log(`\n  🏗️  Processant: ${nomMaster}`);

        // Disciplines de la mateixa carpeta
        const nomsDisciplines = fs.readdirSync(carpetaMaster)
          .filter(f => {
            const nomU = f.toUpperCase();
            return (
              nomU.endsWith(".RVT") &&
              SUFIXOS_COPIA.some(s => nomU.includes(s)) &&
              !nomU.includes("_MASTER")
            );
          });

        // Puja el MASTER
        try {
          const res = await pujaFitxerACC(token, ctx.projectId, ctx.folderId, masterPath);
          if (!res) {
            resultat.fitxersAmbError.push(nomMaster);
            continue;
          }
          resultat.fitxersPujats++;

          // Registra xRefs
          if (nomsDisciplines.length) {
            const novaVersio = await registraXRefs(
              token, ctx.projectId, ctx.folderId,
              res.versionId, nomsDisciplines
            );
            if (novaVersio) {
              resultat.xRefsRegistrats++;
              console.log(`  ✅ xRefs registrats per ${nomMaster}`);
            }
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          resultat.fitxersAmbError.push(nomMaster);
          resultat.errors.push(`${nomMaster}: ${msg}`);
          console.error(`  ❌ Error pujant ${nomMaster}: ${msg}`);
        }
      }
    }

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    resultat.errors.push(msg);
    console.error("❌ Error general BIM Sync:", msg);
  }

  resultat.durada_ms = Date.now() - inici;
  console.log(`\n✅ Agent BIM Sync finalitzat en ${resultat.durada_ms}ms`);
  console.log(`   Fitxers pujats: ${resultat.fitxersPujats} / ${resultat.fitxersProcessats}`);
  console.log(`   xRefs registrats: ${resultat.xRefsRegistrats}`);
  if (resultat.errors.length) {
    console.log(`   Errors: ${resultat.errors.length}`);
  }

  await desaLogSupabase(resultat);
  return resultat;
}
