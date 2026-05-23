// agent/src/discover-ids.ts
// Script d'un sol ús per trobar APS_HUB_ID i APS_PROJECT_ID del teu compte Forma.
// Usa 2-legged OAuth — no necessita cap token guardat a Supabase.
//
// Execució (des de la carpeta agent/):
//   bun run discover-ids
//   (o: npx ts-node src/discover-ids.ts)
//
// Requisits al .env:
//   APS_CLIENT_ID, APS_CLIENT_SECRET

const APS_BASE     = "https://developer.api.autodesk.com";
const APS_AUTH_URL = `${APS_BASE}/authentication/v2/token`;

async function obteToken(clientId: string, clientSecret: string): Promise<string> {
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const resp = await fetch(APS_AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${credentials}` },
    body: new URLSearchParams({ grant_type: "client_credentials", scope: "data:read" }).toString(),
  });
  if (!resp.ok) throw new Error(`Error token: ${resp.status} ${await resp.text()}`);
  const data = await resp.json() as { access_token: string };
  return data.access_token;
}

async function main() {
  const clientId     = process.env.APS_CLIENT_ID;
  const clientSecret = process.env.APS_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Falten APS_CLIENT_ID o APS_CLIENT_SECRET al .env");

  console.log("🔑 Obtenint token 2-legged...");
  const token = await obteToken(clientId, clientSecret);
  console.log("✅ Token obtingut\n");

  console.log("═══════════════════════════════════════════════");
  console.log("  HUBS accessibles");
  console.log("═══════════════════════════════════════════════");

  const hubsResp = await fetch(`${APS_BASE}/project/v1/hubs`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!hubsResp.ok) throw new Error(`Error hubs: ${hubsResp.status} ${await hubsResp.text()}`);

  const hubs = ((await hubsResp.json() as any).data ?? []) as any[];

  if (hubs.length === 0) {
    console.log("⚠️  Cap hub trobat. Comprova que l'app té accés al compte Forma.");
    return;
  }

  for (const hub of hubs) {
    console.log(`\n📦 ${hub.attributes?.name ?? "(sense nom)"}`);
    console.log(`   APS_HUB_ID = ${hub.id}`);

    const projResp = await fetch(`${APS_BASE}/project/v1/hubs/${hub.id}/projects?page[limit]=50`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!projResp.ok) { console.log(`   ⚠️  No s'han pogut llistar projectes: ${projResp.status}`); continue; }

    const projectes = ((await projResp.json() as any).data ?? []) as any[];
    if (projectes.length === 0) { console.log("   (cap projecte accessible)"); continue; }

    console.log(`\n   PROJECTES:`);
    for (const proj of projectes) {
      console.log(`\n   📁 ${proj.attributes?.name ?? "(sense nom)"}`);
      console.log(`      APS_PROJECT_ID = ${proj.id}`);
      console.log(`\n      → Afegeix al .env de l'agent:`);
      console.log(`        APS_HUB_ID=${hub.id}`);
      console.log(`        APS_PROJECT_ID=${proj.id}`);
    }
  }

  console.log("\n═══════════════════════════════════════════════\n");
}

main().catch(err => { console.error("❌", err.message ?? err); process.exit(1); });
