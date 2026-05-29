// agent/src/crear-masters-agent.ts
// Agent Crear Masters CBT — port TypeScript de script.py
//
// A diferència de l'script original (que corre dins pyRevit/Revit),
// aquest agent exposa la lògica de detecció i orquestració via HTTP
// i desa l'estat a Supabase. La creació real dels fitxers .rvt
// segueix requerint pyRevit — l'agent invoca l'script Python
// localment si pyRevit/Revit estan disponibles, o bé retorna
// un pla d'execució detallat per a execució manual.
//
// Modes d'execució:
//   1. Si PYREVIT_SCRIPT_PATH està definit i accessible → executa
//      l'script Python directament via subprocess.
//   2. Si no → genera un informe de les instal·lacions detectades
//      i el desa a Supabase perquè l'usuari sàpiga quins MASTERs
//      cal crear.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import { execFile } from "child_process";
import WebSocket from "ws";

(globalThis as any).WebSocket = WebSocket;

// ─── Tipus ────────────────────────────────────────────────────────────────────

export interface CrearMastersParams {
  carpetaArrel:   string;
  carpetaSortida?: string;
}

export interface InstallacioDetectada {
  codi:          string;
  nom:           string;
  carpeta:       string;
  rvtEnt:        string[];
  rvtEst:        string[];
  rvtMep:        string[];
  masterExistent: string | null;
}

export interface CrearMastersResultat {
  installacionsDetectades: number;
  installacionsProcessades: number;
  mastersCreeats: string[];
  mastersAmbError: { codi: string; error: string }[];
  errors: string[];
  executat_a: string;
  durada_ms:  number;
  pla?: InstallacioDetectada[];  // si no pot crear, retorna el pla
}

// ─── Helpers de cerca de fitxers ─────────────────────────────────────────────

function contingutRVT(carpeta: string): string[] {
  if (!fs.existsSync(carpeta)) return [];
  return fs.readdirSync(carpeta)
    .filter(f => f.toLowerCase().endsWith(".rvt"))
    .map(f => path.join(carpeta, f));
}

function contéParaula(nomFitxer: string, keyword: string): boolean {
  const upper    = nomFitxer.toUpperCase();
  const idx      = upper.indexOf("_" + keyword);
  if (idx === -1) return false;
  const posAfter = idx + keyword.length + 1;
  const charAfter = upper[posAfter] ?? "";
  return charAfter === "" || charAfter === "_" || charAfter === "." || /\d/.test(charAfter);
}

// ─── Detecta instal·lacions ───────────────────────────────────────────────────

export function detectaInstallacions(carpetaArrel: string): InstallacioDetectada[] {
  const installacions: InstallacioDetectada[] = [];

  if (!fs.existsSync(carpetaArrel)) return installacions;

  for (const sistemaDir of fs.readdirSync(carpetaArrel).sort()) {
    const sistemaPath = path.join(carpetaArrel, sistemaDir);
    if (!fs.statSync(sistemaPath).isDirectory()) continue;

    for (const instDir of fs.readdirSync(sistemaPath).sort()) {
      const instPath = path.join(sistemaPath, instDir);
      if (!fs.statSync(instPath).isDirectory()) continue;

      const m = instDir.match(/^([A-Z]+\d+)_(.+)$/i);
      if (!m) continue;

      const codi = m[1].toUpperCase();
      const nom  = m[2].replace(/-/g, " ").trim();

      // Cerca subcarpeta 001_MODEL-BIM
      const carpetaBim = fs.existsSync(path.join(instPath, "001_MODEL-BIM"))
        ? path.join(instPath, "001_MODEL-BIM")
        : instPath;

      const rvts = contingutRVT(carpetaBim);
      if (!rvts.length) continue;

      const rvtEnt    = rvts.filter(r => contéParaula(path.basename(r), "ENT"));
      const rvtEst    = rvts.filter(r => contéParaula(path.basename(r), "EST"));
      const rvtMep    = rvts.filter(r => contéParaula(path.basename(r), "MEP"));
      const masterEx  = rvts.find(r => contéParaula(path.basename(r), "MASTER")) ?? null;

      // Exclou el MASTER de les disciplines
      const filtra = (arr: string[]) => masterEx ? arr.filter(r => r !== masterEx) : arr;

      if (![...filtra(rvtEnt), ...filtra(rvtEst), ...filtra(rvtMep)].length) continue;

      installacions.push({
        codi,
        nom,
        carpeta:       carpetaBim,
        rvtEnt:        filtra(rvtEnt),
        rvtEst:        filtra(rvtEst),
        rvtMep:        filtra(rvtMep),
        masterExistent: masterEx,
      });
    }
  }

  return installacions;
}

// ─── Genera nom del MASTER ────────────────────────────────────────────────────

export function nomMaster(codi: string, nom: string): string {
  const nomNet = nom.toUpperCase().replace(/ /g, "-").replace(/[\\/:*?"<>|]/g, "");
  return `${codi}_${nomNet}_MASTER`;
}

// ─── Execució via subprocess Python (mode local amb pyRevit) ─────────────────

function executaScriptPyRevit(
  scriptPath: string,
  carpetaArrel: string,
  carpetaSortida: string
): Promise<{ ok: boolean; sortida: string }> {
  return new Promise((resolve) => {
    const python = process.env.PYTHON_PATH ?? "python";
    execFile(
      python,
      [scriptPath, "--carpeta-arrel", carpetaArrel, "--carpeta-sortida", carpetaSortida, "--no-ui"],
      { timeout: 30 * 60 * 1000 }, // 30 min màxim
      (err, stdout, stderr) => {
        if (err) {
          resolve({ ok: false, sortida: `${err.message}\n${stderr}` });
        } else {
          resolve({ ok: true, sortida: stdout });
        }
      }
    );
  });
}

// ─── Desa log a Supabase ──────────────────────────────────────────────────────

async function desaLog(resultat: CrearMastersResultat) {
  const supabaseUrl = process.env.SUPABASE_URL ?? "";
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!supabaseUrl || !supabaseKey) return;

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  await supabase.from("crear_masters_log").insert({
    executat_a:                resultat.executat_a,
    installacions_detectades:  resultat.installacionsDetectades,
    installacions_processades: resultat.installacionsProcessades,
    masters_creats:            resultat.mastersCreeats.length,
    errors:                    resultat.errors.length,
    durada_ms:                 resultat.durada_ms,
    detalls: {
      mastersCreeats:    resultat.mastersCreeats,
      mastersAmbError:   resultat.mastersAmbError,
      errors:            resultat.errors,
      pla:               resultat.pla?.map(i => ({
        codi: i.codi, nom: i.nom,
        disciplines: [...i.rvtEnt, ...i.rvtEst, ...i.rvtMep].map(r => path.basename(r)),
        masterExistent: i.masterExistent ? path.basename(i.masterExistent) : null,
      })),
    },
  });
}

// ─── Execució principal ───────────────────────────────────────────────────────

export async function executaCrearMasters(params: CrearMastersParams): Promise<CrearMastersResultat> {
  const inici = Date.now();
  const resultat: CrearMastersResultat = {
    installacionsDetectades:  0,
    installacionsProcessades: 0,
    mastersCreeats:           [],
    mastersAmbError:          [],
    errors:                   [],
    executat_a:               new Date().toISOString(),
    durada_ms:                0,
  };

  console.log(`\n🔄 Agent Crear Masters iniciat`);
  console.log(`   Carpeta arrel: ${params.carpetaArrel}`);
  if (params.carpetaSortida) console.log(`   Carpeta sortida: ${params.carpetaSortida}`);

  try {
    // 1. Detecta instal·lacions
    const installacions = detectaInstallacions(params.carpetaArrel);
    resultat.installacionsDetectades = installacions.length;
    console.log(`  📋 Instal·lacions detectades: ${installacions.length}`);

    if (!installacions.length) {
      resultat.errors.push(`Cap instal·lació vàlida trobada a: ${params.carpetaArrel}`);
      resultat.pla = [];
    } else {
      // 2. Comprova si es pot executar l'script Python directament
      const scriptPyRevit = process.env.PYREVIT_SCRIPT_PATH ?? "";
      const pythonDisponible = scriptPyRevit && fs.existsSync(scriptPyRevit);

      if (pythonDisponible) {
        // Execució directa via Python/pyRevit
        console.log(`  🐍 Executant script Python: ${scriptPyRevit}`);
        const carpetaSortida = params.carpetaSortida ?? "";
        const res = await executaScriptPyRevit(scriptPyRevit, params.carpetaArrel, carpetaSortida);

        if (res.ok) {
          // Parseja la sortida per extreure els MASTERs creats
          const linesCreades = res.sortida.split("\n")
            .filter(l => l.includes("✅") && l.includes("_MASTER"));
          resultat.mastersCreeats = linesCreades
            .map(l => l.match(/([A-Z]+\d+_[^.]+_MASTER\.rvt)/i)?.[1] ?? "")
            .filter(Boolean);
          resultat.installacionsProcessades = installacions.length;
          console.log(`  ✅ MASTERs creats: ${resultat.mastersCreeats.length}`);
        } else {
          resultat.errors.push(`Error script Python: ${res.sortida.slice(0, 500)}`);
          // Fallback: retorna el pla
          resultat.pla = installacions;
        }
      } else {
        // Mode pla: no hi ha pyRevit disponible al servidor
        // Retorna la llista d'instal·lacions per a execució manual
        console.log("  ℹ️  pyRevit no disponible al servidor — generant pla d'execució");
        resultat.pla = installacions;

        // Simula la creació per a instal·lacions que ja tenen tots els fitxers accessibles
        for (const inst of installacions) {
          const totsAccessibles = [
            ...inst.rvtEnt, ...inst.rvtEst, ...inst.rvtMep
          ].every(r => fs.existsSync(r));

          if (totsAccessibles) {
            const nom = nomMaster(inst.codi, inst.nom);
            const carpetaSortida = params.carpetaSortida ?? inst.carpeta;
            const rutaSortida    = path.join(carpetaSortida, `${nom}.rvt`);

            // En mode web sense Revit, marquem com "pendent"
            console.log(`  📋 Pendent: ${nom}.rvt`);
            resultat.installacionsProcessades++;
          } else {
            resultat.mastersAmbError.push({
              codi: inst.codi,
              error: "Alguns fitxers de disciplina no són accessibles localment",
            });
          }
        }
      }
    }

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    resultat.errors.push(msg);
    console.error("❌ Error general Crear Masters:", msg);
  }

  resultat.durada_ms = Date.now() - inici;
  console.log(`\n✅ Agent Crear Masters finalitzat en ${resultat.durada_ms}ms`);
  console.log(`   Detectades: ${resultat.installacionsDetectades}`);
  console.log(`   Processades: ${resultat.installacionsProcessades}`);
  console.log(`   MASTERs creats: ${resultat.mastersCreeats.length}`);

  await desaLog(resultat);
  return resultat;
}
