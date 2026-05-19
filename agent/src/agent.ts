// src/agent.ts
// Agent scraping Autodesk Fusion 360 → Supabase visor3d
// ─────────────────────────────────────────────────────────────────────────────

import { chromium, Browser, Page } from "playwright";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";

// ─── Tipus ────────────────────────────────────────────────────────────────────

interface InstallacioTrobada {
  codi: string;        // ex: ED005
  nom: string;         // ex: LA LLAGOSTA
  embedUrl: string;    // ex: https://besostordera.autodesk360.com/shares/public/SH...?mode=embed
}

interface SistemaTrobat {
  nom: string;               // ex: LA LLAGOSTA
  installacions: InstallacioTrobada[];
}

interface ResultatSync {
  sistemesCreats: string[];
  sistemesActualitzats: string[];
  installacionsCreades: string[];
  installacionsActualitzades: string[];
  errors: string[];
}

// ─── Helpers de parseig ───────────────────────────────────────────────────────

// "005_LA-LLAGOSTA" → "LA LLAGOSTA"
function parsejaNomCarpeta(nomCarpeta: string): string {
  // Elimina el prefix numèric i el guió baix: "005_" → ""
  const sensePrefixNumeric = nomCarpeta.replace(/^\d+_/, "");
  // Substitueix guions per espais
  return sensePrefixNumeric.replace(/-/g, " ").trim();
}

// "ED005_LA-LLAGOSTA.rvt" → { codi: "ED005", nom: "LA LLAGOSTA" }
function parsejaNomFitxer(nomFitxer: string): { codi: string; nom: string } | null {
  // Elimina l'extensió
  const sensExtensio = nomFitxer.replace(/\.[^.]+$/, "");
  // El codi és tot fins al primer "_"
  const indexGuioBaix = sensExtensio.indexOf("_");
  if (indexGuioBaix === -1) return null;

  const codi = sensExtensio.substring(0, indexGuioBaix);
  const nomRaw = sensExtensio.substring(indexGuioBaix + 1);
  const nom = nomRaw.replace(/-/g, " ").trim();

  // Validació: el codi ha de tenir lletres i números (ex: ED005, MLA01)
  if (!/^[A-Z]+\d+$/.test(codi)) return null;

  return { codi, nom };
}

// Extreu la URL del src= de l'iframe
function extrauEmbedUrl(htmlIframe: string): string | null {
  const match = htmlIframe.match(/src="([^"]+)"/);
  return match ? match[1] : null;
}

// ─── Login Autodesk ───────────────────────────────────────────────────────────

async function login(page: Page, email: string, password: string): Promise<void> {
  console.log("🔐 Iniciant sessió a Autodesk...");

  await page.goto("https://accounts.autodesk.com/Authentication/LogOn", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });

  // Espera qualsevol input de text visible
  await page.waitForSelector('input[type="email"], input[type="text"], #userName', {
    timeout: 15000,
  });

  // Introdueix l'email
  await page.fill('input[type="email"], input[type="text"], #userName', email);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(2000);

  // Introdueix la contrasenya
  await page.waitForSelector('input[type="password"], #password', { timeout: 15000 });
  await page.fill('input[type="password"], #password', password);
  await page.keyboard.press("Enter");

  // Espera que carregui el dashboard
  await page.waitForURL(/autodesk360\.com/i, { timeout: 30000 });

  console.log("✅ Sessió iniciada correctament");
}

// ─── Navega a 000_MODELS i extreu sistemes ────────────────────────────────────

async function extrauSistemes(page: Page): Promise<SistemaTrobat[]> {
  console.log("📂 Navegant a WEB → 000_MODELS...");

  // Navega directament al projecte WEB de CBT
  await page.goto(
    "https://besostordera.autodesk360.com/g/projects/20230927679505251/data",
    { waitUntil: "networkidle", timeout: 30000 }
  );

  // Espera la llista de carpetes
  await page.waitForSelector('[data-testid="folder-name"], .item-name, a[title]', {
    timeout: 20000,
  });

  // Clica a la carpeta WEB
  await page.click('text=WEB');
  await page.waitForLoadState("networkidle");

  // Clica a 000_MODELS
  await page.click('text=000_MODELS');
  await page.waitForLoadState("networkidle");

  // Obté totes les subcarpetes (sistemes)
  const carpetes = await page.$$eval(
    '[data-testid="folder-name"], .folder-name, td.item-name',
    (els) => els
      .map((el) => el.textContent?.trim() ?? "")
      .filter((nom) => /^\d+_/.test(nom)) // Només les que comencen per números
  );

  console.log(`📁 Trobades ${carpetes.length} carpetes de sistema: ${carpetes.join(", ")}`);

  const sistemes: SistemaTrobat[] = [];

  for (const nomCarpeta of carpetes) {
    console.log(`\n📂 Processant carpeta: ${nomCarpeta}`);
    const nomSistema = parsejaNomCarpeta(nomCarpeta);

    // Entra a la carpeta
    await page.click(`text=${nomCarpeta}`);
    await page.waitForLoadState("networkidle");

    // Obté tots els fitxers .rvt
    const fitxers = await page.$$eval(
      '[data-testid="file-name"], .file-name, td.item-name',
      (els) => els
        .map((el) => el.textContent?.trim() ?? "")
        .filter((nom) => nom.endsWith(".rvt"))
    );

    console.log(`  📄 Fitxers .rvt: ${fitxers.join(", ")}`);

    const installacions: InstallacioTrobada[] = [];

    for (const nomFitxer of fitxers) {
      const parsed = parsejaNomFitxer(nomFitxer);
      if (!parsed) {
        console.warn(`  ⚠️  No s'ha pogut parsejar: ${nomFitxer}`);
        continue;
      }

      console.log(`  🔗 Obtenint embed URL per: ${nomFitxer}`);

      try {
        const embedUrl = await obteEmbedUrl(page, nomFitxer);
        if (embedUrl) {
          installacions.push({ ...parsed, embedUrl });
          console.log(`  ✅ ${parsed.codi} - ${parsed.nom}: ${embedUrl}`);
        } else {
          console.warn(`  ⚠️  No s'ha trobat embed URL per: ${nomFitxer}`);
        }
      } catch (err) {
        console.error(`  ❌ Error amb ${nomFitxer}:`, err);
      }
    }

    sistemes.push({ nom: nomSistema, installacions });

    // Torna enrere a 000_MODELS
    await page.click('text=000_MODELS');
    await page.waitForLoadState("networkidle");
  }

  return sistemes;
}

// ─── Obté l'embed URL d'un fitxer ────────────────────────────────────────────

async function obteEmbedUrl(page: Page, nomFitxer: string): Promise<string | null> {
  // Obre el menú contextual del fitxer (botó ...)
  const fila = page.locator(`tr:has-text("${nomFitxer}")`).first();
  await fila.hover();

  // Clica el botó d'opcions (...)
  const botoOpcions = fila.locator('button[aria-label="More options"], button.options-btn, [data-testid="item-options"]').first();
  await botoOpcions.click({ timeout: 10000 });

  // Clica "Compartir"
  await page.click('text=Compartir', { timeout: 10000 });
  await page.waitForLoadState("networkidle");

  // Espera el modal de compartir
  await page.waitForSelector('text=Incrustar', { timeout: 15000 });

  // Clica la pestanya "Incrustar"
  await page.click('text=Incrustar');
  await page.waitForTimeout(1000);

  // Llegeix el codi de l'iframe del textarea
  const codiIframe = await page.inputValue(
    'textarea, input[readonly]',
    { timeout: 10000 }
  ).catch(() => null);

  // Tanca el modal
  await page.click('text=Cerrar', { timeout: 5000 }).catch(() => {
    page.keyboard.press("Escape");
  });
  await page.waitForTimeout(500);

  if (!codiIframe) return null;
  return extrauEmbedUrl(codiIframe);
}

// ─── Sincronitza amb Supabase ─────────────────────────────────────────────────

async function sincronitzaSupabase(
  supabase: SupabaseClient,
  sistemes: SistemaTrobat[]
): Promise<ResultatSync> {
  const resultat: ResultatSync = {
    sistemesCreats: [],
    sistemesActualitzats: [],
    installacionsCreades: [],
    installacionsActualitzades: [],
    errors: [],
  };

  for (const [index, sistema] of sistemes.entries()) {
    try {
      console.log(`\n💾 Sincronitzant sistema: ${sistema.nom}`);

      // Busca si ja existeix el sistema (per nom)
      const { data: sistemaExistent } = await supabase
        .from("visor3d_sistemes")
        .select("id, nom")
        .ilike("nom", sistema.nom)
        .single();

      let sistemaId: string;

      if (sistemaExistent) {
        sistemaId = sistemaExistent.id;
        resultat.sistemesActualitzats.push(sistema.nom);
        console.log(`  ♻️  Sistema ja existent: ${sistema.nom}`);
      } else {
        // Crea el sistema nou
        const { data: nouSistema, error } = await supabase
          .from("visor3d_sistemes")
          .insert({
            nom: sistema.nom,
            color: colorPerOrdre(index),
            ordre: index,
          })
          .select()
          .single();

        if (error) throw error;
        sistemaId = nouSistema.id;
        resultat.sistemesCreats.push(sistema.nom);
        console.log(`  ✅ Sistema creat: ${sistema.nom}`);
      }

      // Sincronitza les instal·lacions
      for (const inst of sistema.installacions) {
        try {
          // Busca per codi
          const { data: instExistent } = await supabase
            .from("visor3d_installacions")
            .select("id")
            .eq("sistema_id", sistemaId)
            .eq("codi_installacio", inst.codi)
            .single();

          if (instExistent) {
            // Actualitza la URL (pot haver canviat)
            await supabase
              .from("visor3d_installacions")
              .update({
                nom: inst.nom,
                embed_url: inst.embedUrl,
                updated_at: new Date().toISOString(),
              })
              .eq("id", instExistent.id);

            resultat.installacionsActualitzades.push(`${inst.codi} - ${inst.nom}`);
            console.log(`  ♻️  Instal·lació actualitzada: ${inst.codi} - ${inst.nom}`);
          } else {
            // Crea nova instal·lació
            const ordre = sistema.installacions.indexOf(inst);
            await supabase
              .from("visor3d_installacions")
              .insert({
                sistema_id: sistemaId,
                nom: inst.nom,
                codi_installacio: inst.codi,
                embed_url: inst.embedUrl,
                ordre,
              });

            resultat.installacionsCreades.push(`${inst.codi} - ${inst.nom}`);
            console.log(`  ✅ Instal·lació creada: ${inst.codi} - ${inst.nom}`);
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

// ─── Colors per defecte ───────────────────────────────────────────────────────

const COLORS = [
  "#0099A8", "#6366F1", "#10B981", "#F59E0B",
  "#EF4444", "#8B5CF6", "#EC4899", "#F97316",
  "#06B6D4", "#84CC16", "#64748B", "#0EA5E9",
];

function colorPerOrdre(index: number): string {
  return COLORS[index % COLORS.length];
}

// ─── Funció principal ─────────────────────────────────────────────────────────

export async function executaAgent(): Promise<ResultatSync> {
  console.log("🤖 Agent Visor3D iniciant...");
  console.log(`🕐 ${new Date().toISOString()}`);

  // Llegeix variables d'entorn
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const autdeskEmail = process.env.AUTODESK_EMAIL;
  const autdeskPassword = process.env.AUTODESK_PASSWORD;

  if (!supabaseUrl || !supabaseKey) throw new Error("Falten SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  if (!autdeskEmail || !autdeskPassword) throw new Error("Falten AUTODESK_EMAIL o AUTODESK_PASSWORD");

  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: {} },
    realtime: { transport: WebSocket as any },
  });

  let browser: Browser | null = null;

  try {
    // Inicia el navegador
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });

    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
      viewport: { width: 1280, height: 800 },
    });

    const page = await context.newPage();

    // Login
    await login(page, autdeskEmail, autdeskPassword);

    // Extreu sistemes i instal·lacions d'Autodesk
    const sistemesTrobats = await extrauSistemes(page);

    console.log(`\n📊 Resum extracció:`);
    console.log(`  Sistemes trobats: ${sistemesTrobats.length}`);
    sistemesTrobats.forEach((s) => {
      console.log(`  - ${s.nom}: ${s.installacions.length} instal·lacions`);
    });

    // Sincronitza amb Supabase
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

    // Guarda log a Supabase
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
  } finally {
    if (browser) await browser.close();
  }
}
